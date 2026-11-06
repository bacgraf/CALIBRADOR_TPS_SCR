import { useCallback, useEffect, useRef, useState } from 'react';

export type FlashOperation = {
  operation_id: string | null;
  state: string;
  status: string;
  progress: number;
  log: string[];
  error: string | null;
  busy: boolean;
  cleanup_confirmed: boolean;
};
const states = ['idle', 'preparing', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled', 'timed_out'];

export function parseFlashOperation(value: any): FlashOperation {
  if (!value || !states.includes(value.state) || typeof value.busy !== 'boolean' ||
      typeof value.cleanup_confirmed !== 'boolean' || !Number.isFinite(value.progress) ||
      typeof value.status !== 'string' || !Array.isArray(value.log) ||
      !value.log.every((line: any) => typeof line === 'string') ||
      !(value.operation_id === null || typeof value.operation_id === 'string')) {
    throw new Error('Resposta incompatível. Atualize a ponte Python.');
  }
  return value;
}

async function request(path: string, body?: object) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 4000);
  try {
    const response = await fetch(`http://127.0.0.1:8760${path}`, {
      signal: abort.signal, cache: 'no-store',
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok && response.status !== 409) throw new Error(data.error || `Erro HTTP ${response.status}`);
    return parseFlashOperation(data);
  } finally {
    clearTimeout(timeout);
  }
}

const launchBridge = () => { window.location.href = 'teksea://start'; };

export function useFlashController(visible: boolean, launch = launchBridge, waitMs = 15000) {
  const [operation, setOperation] = useState<FlashOperation>({
    operation_id: null, state: 'unknown', status: 'Consultando a ponte...', progress: 0,
    log: [], error: null, busy: true, cleanup_confirmed: false,
  });
  const [notice, setNotice] = useState('');
  const [openingBridge, setOpeningBridge] = useState(false);
  const opening = useRef(false);
  const attemptedOpen = useRef(false);
  const awaitingReady = useRef(false);
  const openBridge = useCallback(() => {
    if (opening.current) return;
    opening.current = true;
    attemptedOpen.current = true;
    awaitingReady.current = true;
    setOpeningBridge(true);
    setNotice('Abrindo TEKSEA Bridge... Autorize a abertura no navegador e aguarde.');
    try { launch(); }
    catch {
      opening.current = false;
      setOpeningBridge(false);
      setNotice('Não foi possível abrir a ponte. Verifique a instalação do TEKSEA Bridge e tente novamente.');
    }
  }, [launch]);
  useEffect(() => {
    if (!openingBridge) return;
    const timer = setTimeout(() => {
      opening.current = false;
      setOpeningBridge(false);
      setNotice('A ponte não respondeu no prazo. Verifique se o TEKSEA Bridge está instalado e autorize sua abertura no navegador. Depois, tente abrir novamente.');
    }, waitMs);
    return () => clearTimeout(timer);
  }, [openingBridge, waitMs]);
  useEffect(() => {
    if (!visible) {
      opening.current = false;
      setOpeningBridge(false);
      attemptedOpen.current = false;
      awaitingReady.current = false;
    }
  }, [visible]);
  const version = useRef(0);
  const actionPending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; version.current++; }; }, []);
  const unknown = useCallback((error: unknown) => {
    if (!mounted.current) return;
    setOperation(prev => ({ ...prev, state: 'unknown', busy: true, cleanup_confirmed: false,
      status: 'Estado da gravação desconhecido. Você pode fechar esta tela.',
      error: error instanceof Error ? error.message : 'Sem comunicação com a ponte.' }));
  }, []);

  const shouldPoll = visible || operation.busy;
  useEffect(() => {
    if (!shouldPoll) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const ticket = version.current;
      if (!actionPending.current) {
        try {
          const next = await request('/tms/progress');
          if (!disposed && ticket === version.current) {
            setOperation(next);
            if (awaitingReady.current) {
              awaitingReady.current = false;
              opening.current = false;
              setOpeningBridge(false);
              setNotice(next.busy || !next.cleanup_confirmed
                ? 'Ponte conectada. Aguarde a conclusão e a liberação da gravação atual.'
                : 'Ponte pronta. Clique no firmware desejado para iniciar a gravação.');
            }
          }
        } catch (error) {
          if (!disposed && ticket === version.current) {
            unknown(error);
            // Nunca abrir/repetir automaticamente após uma solicitação de gravação.
            if (visible && !attemptedOpen.current && ticket === 0) openBridge();
          }
        }
      }
      if (!disposed) timer = setTimeout(poll, 800);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [shouldPoll, visible, unknown, openBridge]);

  const start = useCallback(async (product: string, type: string) => {
    if (actionPending.current || operation.busy || !operation.cleanup_confirmed || operation.state === 'unknown') return;
    actionPending.current = true;
    const ticket = ++version.current;
    const random = crypto.getRandomValues(new Uint32Array(4));
    const operation_id = Array.from(random, n => n.toString(16).padStart(8, '0')).join('');
    setNotice('');
    setOperation({ operation_id, state: 'preparing', status: 'Solicitando gravação...', progress: 0,
      log: [], error: null, busy: true, cleanup_confirmed: false });
    try {
      const next = await request('/tms/flash', { operation_id, product, type });
      if (mounted.current && ticket === version.current) setOperation(next);
    } catch (error) {
      // Não repetir o POST: a resposta pode ter se perdido após o início.
      unknown(error);
      if (mounted.current) setNotice(error instanceof Error ? error.message : 'Falha ao solicitar gravação.');
    } finally {
      actionPending.current = false;
    }
  }, [operation, unknown]);

  const cancel = useCallback(async () => {
    if (!operation.operation_id || actionPending.current) return;
    actionPending.current = true;
    const ticket = ++version.current;
    setOperation(prev => ({ ...prev, state: 'cancelling', status: 'Encerrando gravação...' }));
    try {
      const next = await request('/tms/cancel', { operation_id: operation.operation_id });
      if (mounted.current && ticket === version.current) setOperation(next);
    } catch (error) { unknown(error); }
    finally { actionPending.current = false; }
  }, [operation.operation_id, unknown]);

  return { operation, notice, start, cancel, openBridge, openingBridge,
    isFlashing: ['preparing', 'running', 'cancelling'].includes(operation.state),
    canStart: operation.state !== 'unknown' && !operation.busy && operation.cleanup_confirmed };
}
