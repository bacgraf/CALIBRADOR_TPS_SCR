import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { parseFlashOperation, useFlashController } from '../src/lib/useFlashController';

const idle = { operation_id: null, state: 'idle', status: 'Pronto', progress: 0,
  log: [], error: null, busy: false, cleanup_confirmed: true };
let current: ReturnType<typeof useFlashController>;
let root: Root;
let dom: JSDOM;
let requests: { path: string; body: any }[];
let responder: (path: string, body: any) => Promise<any>;
const flush = () => new Promise(resolve => setTimeout(resolve, 30));

let launches = 0;
let waitMs = 15000;
const launch = () => { launches++; };

function Harness() {
  current = useFlashController(true, launch, waitMs);
  return <div><button disabled={!current.canStart}>Iniciar</button>
    <button disabled={current.isFlashing}>Fechar</button><p>{current.operation.status}</p></div>;
}

beforeEach(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: 'http://192.168.4.1' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  requests = [];
  launches = 0;
  waitMs = 15000;
  responder = async () => ({ ...idle });
  globalThis.fetch = async (url, options) => {
    const path = String(url).replace('http://127.0.0.1:8760', '');
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    requests.push({ path, body });
    return { ok: true, status: 200, json: async () => responder(path, body) } as Response;
  };
  root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<Harness />); await flush(); });
});
async function reopenOffline(timeout = 15000) {
  await act(async () => root.unmount());
  waitMs = timeout;
  responder = async () => { throw new Error('Ponte offline'); };
  root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<Harness />); await flush(); });
}

test('abre a ponte uma vez e só grava após novo clique', async () => {
  await reopenOffline();
  assert.equal(launches, 1);
  assert.equal(current.openingBridge, true);
  assert.equal(current.canStart, false);
  await act(async () => { current.openBridge(); current.openBridge(); });
  assert.equal(launches, 1);
  responder = async (_path, body) => body
    ? { ...idle, operation_id: body.operation_id, state: 'running', busy: true, cleanup_confirmed: false }
    : { ...idle };
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); });
  assert.equal(current.canStart, true);
  assert.match(current.notice, /Clique no firmware/);
  assert.equal(requests.filter(r => r.path === '/tms/flash').length, 0);
  await act(async () => { await current.start('scr', 'cliente'); });
  assert.equal(requests.filter(r => r.path === '/tms/flash').length, 1);
  assert.equal(requests.at(-1)?.body.product, 'scr');
});

test('prazo de abertura expira e permite tentar novamente sem gravar', async () => {
  await reopenOffline(60);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  assert.equal(current.openingBridge, false);
  assert.equal(current.isFlashing, false);
  assert.match(current.notice, /não respondeu no prazo/);
  assert.equal(current.canStart, false);
  await act(async () => { current.openBridge(); });
  assert.equal(launches, 2);
  assert.equal(requests.filter(r => r.path === '/tms/flash').length, 0);
});

test('ponte iniciada com gravação ativa mantém novo início bloqueado', async () => {
  await reopenOffline();
  responder = async () => ({ ...idle, operation_id: 'outra-aba', state: 'running',
    busy: true, cleanup_confirmed: false });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); });
  assert.equal(current.canStart, false);
  assert.equal(current.operation.operation_id, 'outra-aba');
  assert.match(current.notice, /gravação atual/);
  assert.equal(requests.filter(r => r.path === '/tms/flash').length, 0);
});

afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); });

test('rejeita progresso incompatível em vez de declarar sucesso', () => {
  assert.throws(() => parseFlashOperation({ progress: 100 }));
});

test('erro terminal mantém log e libera fechar/repetir', async () => {
  responder = async (_path, body) => ({ ...idle, operation_id: body?.operation_id,
    state: 'failed', status: 'Falha', error: 'DSLite retornou 7', log: ['Erro de teste'] });
  await act(async () => { await current.start('tps', 'jiga'); });
  assert.equal(current.isFlashing, false);
  assert.equal(current.canStart, true);
  assert.deepEqual(current.operation.log, ['Erro de teste']);
});

test('resposta perdida permite fechar mas não dispara outra gravação', async () => {
  responder = async () => { throw new Error('Conexão perdida'); };
  await act(async () => { await current.start('tps', 'jiga'); });
  assert.equal(current.operation.state, 'unknown');
  assert.equal(current.isFlashing, false);
  assert.equal(current.canStart, false);
  await act(async () => { await current.start('tps', 'jiga'); });
  assert.equal(requests.filter(r => r.path === '/tms/flash').length, 1);
});

test('cancelamento usa a operação atual e espera confirmação de limpeza', async () => {
  responder = async (_path, body) => ({ ...idle, operation_id: body.operation_id,
    state: 'running', status: 'Gravando', busy: true, cleanup_confirmed: false });
  await act(async () => { await current.start('tps', 'jiga'); });
  const id = current.operation.operation_id;
  assert.equal(current.isFlashing, true);
  responder = async (_path, body) => ({ ...idle, operation_id: body.operation_id,
    state: 'cancelled', status: 'Cancelada' });
  await act(async () => { await current.cancel(); });
  assert.equal(requests.at(-1)?.path, '/tms/cancel');
  assert.equal(requests.at(-1)?.body.operation_id, id);
  assert.equal(current.canStart, true);
});

test('limpeza não confirmada permite fechar e bloqueia nova gravação', async () => {
  responder = async (_path, body) => ({ ...idle, operation_id: body.operation_id,
    state: 'failed', status: 'Limpeza falhou', busy: true, cleanup_confirmed: false });
  await act(async () => { await current.start('tps', 'jiga'); });
  assert.equal(current.isFlashing, false);
  assert.equal(current.canStart, false);
});

test('duplo clique gera uma única solicitação', async () => {
  responder = async (_path, body) => ({ ...idle, operation_id: body.operation_id,
    state: 'running', status: 'Gravando', busy: true, cleanup_confirmed: false });
  await act(async () => { await Promise.all([current.start('tps', 'jiga'), current.start('tps', 'jiga')]); });
  assert.equal(requests.filter(r => r.path === '/tms/flash').length, 1);
});

test('reabrir a tela recupera operação em andamento sem reenviar início', async () => {
  await act(async () => root.unmount());
  responder = async () => ({ ...idle, operation_id: 'existing', state: 'running',
    status: 'Operação recuperada', busy: true, cleanup_confirmed: false });
  root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<Harness />); await flush(); });
  assert.equal(current.operation.operation_id, 'existing');
  assert.equal(current.isFlashing, true);
  assert.equal(requests.filter(r => r.path === '/tms/flash').length, 0);
});

test('resposta antiga de progresso não sobrescreve nova operação', async () => {
  let resolveOld: ((data: any) => void) | undefined;
  responder = async (path, body) => {
    if (path === '/tms/progress') return new Promise(resolve => { resolveOld = resolve; });
    return { ...idle, operation_id: body.operation_id, state: 'running',
      status: 'Nova operação', busy: true, cleanup_confirmed: false };
  };
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 850)); });
  assert.ok(resolveOld);
  await act(async () => { await current.start('tps', 'jiga'); });
  const id = current.operation.operation_id;
  await act(async () => { resolveOld!({ ...idle }); await flush(); });
  assert.equal(current.operation.operation_id, id);
  assert.equal(current.operation.state, 'running');
});
