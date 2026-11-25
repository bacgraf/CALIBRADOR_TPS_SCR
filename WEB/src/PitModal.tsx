import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, XCircle,
  Cpu, Play, Square, RefreshCw, Info, X
} from 'lucide-react';

interface CanWriteItem {
  reg: number;
  name: string;
  type: 'int16' | 'int32';
  value: number;
  source: string;
}

interface PitWarning {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

interface PitResult {
  source_file: string;
  source_format: string;
  pit: any;
  warnings: PitWarning[];
  can_plan: {
    phase1_base: CanWriteItem[];
    reboot_cmd: CanWriteItem;
    phase2_user: CanWriteItem[];
  };
  summary: {
    phase1_writes: number;
    phase2_writes: number;
    params_parsed: number;
    alarms_parsed: number;
    din_parsed: number;
    status_relays_parsed: number;
    warnings_count: number;
    errors_count: number;
  };
}

interface PitModalProps {
  onClose: () => void;
  bridgeAlive: boolean;
  bridgeHasPit: boolean;
  connected: boolean;
  ugeOk: boolean;
  ugeVers?: string;
  errCod?: number;
  errExt?: number;
  request: (msg: any, timeout?: number) => Promise<any>;
}

const BRIDGE_URL = 'http://127.0.0.1:8760';

function formatReles(reles: any): string {
  if (!reles) return '—';
  const parts: string[] = [];
  if (reles.rp1) parts.push(`P.${reles.rp1}`);
  if (reles.rp2) parts.push(`P.${reles.rp2}`);
  if (reles.re11) parts.push(`E1.${reles.re11}`);
  if (reles.re12) parts.push(`E1.${reles.re12}`);
  if (reles.re21) parts.push(`E2.${reles.re21}`);
  if (reles.re22) parts.push(`E2.${reles.re22}`);
  return parts.length ? parts.join(', ') : '—';
}

export const PitModal: React.FC<PitModalProps> = ({
  onClose,
  bridgeAlive,
  bridgeHasPit,
  connected,
  ugeOk,
  ugeVers,
  errCod,
  errExt,
  request,
}) => {
  const liveUgeRef = useRef({ ugeOk, errCod, errExt });
  liveUgeRef.current = { ugeOk, errCod, errExt };
  const [pitData, setPitData] = useState<PitResult | null>(null);
  const [activeTab, setActiveTab] = useState<'base' | 'params' | 'alarms' | 'din' | 'relays' | 'can'>('base');
  const [parsing, setParsing] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [manualEdits, setManualEdits] = useState<string[]>([]);

  // Estado de gravação na UGE
  const [writing, setWriting] = useState(false);
  const [writePhase, setWritePhase] = useState<string>('');
  const [writeProgress, setWriteProgress] = useState({ current: 0, total: 0 });
  const [writeLogs, setWriteLogs] = useState<string[]>([]);
  const [writeDone, setWriteDone] = useState<'idle' | 'success' | 'error' | 'cancelled'>('idle');
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const appendLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    setWriteLogs(prev => [...prev.slice(-140), `[${ts}] ${msg}`]);
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    setParseError(null);
    setParsing(true);
    setWriteDone('idle');
    setWriteLogs([]);
    setManualEdits([]);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo selecionado.'));
        reader.readAsDataURL(file);
      });
      const resp = await fetch(`${BRIDGE_URL}/api/parse-pit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_base64: base64 }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      setPitData(json);
      if (json.summary.errors_count > 0) {
        const hasAlarmErr = json.warnings.some((w: PitWarning) => w.code === 'ALARM_OUT_OF_RANGE');
        setActiveTab(hasAlarmErr ? 'alarms' : 'base');
      } else {
        setActiveTab('base');
      }
    } catch (err: any) {
      setParseError(err?.message || 'Erro ao processar arquivo PIT.');
    } finally {
      setParsing(false);
    }
  };

  const revalidatePit = async (updatedPit: any, editNote?: string) => {
    if (!pitData) return;
    setRevalidating(true);
    try {
      const resp = await fetch(`${BRIDGE_URL}/api/pit/revalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pit: updatedPit }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.error || `HTTP ${resp.status}`);
      }
      setPitData({
        ...pitData,
        pit: json.pit,
        warnings: json.warnings,
        can_plan: json.can_plan,
        summary: json.summary,
      });
      if (editNote) {
        setManualEdits(prev => [...prev, editNote]);
      }
    } catch (err: any) {
      setParseError(err?.message || 'Falha ao revalidar PIT.');
    } finally {
      setRevalidating(false);
    }
  };

  const updateBaseField = (field: string, rawVal: string) => {
    if (!pitData) return;
    const next = structuredClone(pitData.pit);
    if (field === 'ur_sistema') {
      next.base[field] = rawVal.trim().toUpperCase();
    } else {
      const num = parseFloat(rawVal.replace(',', '.'));
      next.base[field] = isNaN(num) ? null : num;
    }
    revalidatePit(next, `Base.${field} = ${rawVal}`);
  };

  const updateParamValue = (code: string, rawVal: string) => {
    if (!pitData) return;
    const next = structuredClone(pitData.pit);
    const trimmed = rawVal.trim();
    const num = trimmed === '' || trimmed === '-' || trimmed === '---' ? null : parseFloat(trimmed.replace(',', '.'));
    next.parametros[code].valor = num !== null && !isNaN(num) ? num : null;
    next.parametros[code].raw = trimmed || '-';
    revalidatePit(next, `${code} = ${trimmed || '-'}`);
  };

  const updateAlarmValue = (code: string, rawVal: string) => {
    if (!pitData) return;
    const next = structuredClone(pitData.pit);
    const trimmed = rawVal.trim();
    const num = trimmed === '' || trimmed.toUpperCase() === 'N/A' ? null : parseFloat(trimmed.replace(',', '.'));
    next.alarmes[code].valor = num !== null && !isNaN(num) ? num : null;
    next.alarmes[code].raw = trimmed || 'N/A';
    revalidatePit(next, `${code} = ${trimmed || 'N/A'}`);
  };

  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

  const handleWriteToUge = async () => {
    if (!pitData || pitData.summary.errors_count > 0 || !connected || !ugeOk) return;
    cancelRef.current = false;
    setWriting(true);
    setWriteDone('idle');
    setWriteLogs([]);

    const { phase1_base, reboot_cmd, phase2_user } = pitData.can_plan;
    const total = phase1_base.length + 1 + phase2_user.length;
    setWriteProgress({ current: 0, total });

    let step = 0;
    const sendItem = async (item: CanWriteItem) => {
      const format = item.type === 'int32' ? 4 : 2;
      await request({ command: 'write_reg', reg: item.reg, format, value: item.value }, 5000);
      step += 1;
      setWriteProgress({ current: step, total });
      appendLog(`OK reg=${item.reg} (${item.name}) = ${item.value} [${item.source}]`);
      // Espacamento de 380 ms para garantir conclusao da gravacao na EEPROM I2C (CAN_Sup.delayed_ack.pending)
      await sleep(380);
    };

    try {
      appendLog(`Iniciando gravacao do PIT "${pitData.source_file}" (${total} comandos CAN)...`);
      if (manualEdits.length > 0) {
        appendLog(`Ajustes manuais aplicados: ${manualEdits.join('; ')}`);
      }

      // FASE 1: Base e Sensores
      setWritePhase('Fase 1/3: Gravando Parâmetros Base e Sensores...');
      for (const item of phase1_base) {
        if (cancelRef.current) throw new Error('CANCELLED');
        await sendItem(item);
      }

      // REBOOT NORMAL DA UGE
      if (cancelRef.current) throw new Error('CANCELLED');
      setWritePhase('Fase 2/3: Reiniciando UGE (RBT_Normal) e aguardando retorno...');
      await sendItem(reboot_cmd);
      appendLog('Aguardando reinicializacao da UGE (5,5 s)...');
      await sleep(5500);

      // Aguarda link CAN retomar (ate +4s) e valida se a UGE nao entrou em [1-xxx] PARAM
      for (let wait = 0; wait < 8 && !liveUgeRef.current.ugeOk; wait++) {
        if (cancelRef.current) throw new Error('CANCELLED');
        await sleep(500);
      }
      if (!liveUgeRef.current.ugeOk) {
        throw new Error('Link CAN com a UGE não retornou após o reboot.');
      }
      if (liveUgeRef.current.errCod === 1) {
        throw new Error(
          `UGE acusou falha [1-${liveUgeRef.current.errExt ?? 0}] PARAM após o reboot. Fase 2 abortada (a UGE rejeita parâmetros de usuário/alarmes enquanto houver erro PARAM).`
        );
      }

      // FASE 2: Parametros de Usuario, Alarmes, Entradas Digitais e Reles
      setWritePhase('Fase 3/3: Gravando Parâmetros de Usuário, Alarmes e Relés...');
      for (const item of phase2_user) {
        if (cancelRef.current) throw new Error('CANCELLED');
        await sendItem(item);
      }

      setWritePhase('Concluído!');
      setWriteDone('success');
      appendLog('Gravacao completa do PIT concluida com sucesso!');
    } catch (err: any) {
      if (err?.message === 'CANCELLED') {
        setWritePhase('Cancelado pelo operador.');
        setWriteDone('cancelled');
        appendLog('Operacao cancelada pelo operador.');
      } else {
        setWritePhase(`Falha: ${err?.message || 'Erro de comunicacao CAN'}`);
        setWriteDone('error');
        appendLog(`ERRO: ${err?.message || 'Falha ao enviar registrador CAN'}`);
      }
    } finally {
      setWriting(false);
    }
  };

  const hasErrors = (pitData?.summary.errors_count ?? 0) > 0;
  const canWrite = Boolean(pitData && !hasErrors && connected && ugeOk && !writing);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* HEADER */}
        <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                IMPORTAÇÃO E GRAVAÇÃO DE PIT — TPS125
              </h2>
              <p className="text-[11px] text-slate-400">
                Suporta Excel (.xlsx / .csv), Word (.docx) e PDF (.pdf) → Conferência → Gravação CAN em 2 Fases
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={writing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {!bridgeAlive || !bridgeHasPit ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-bold">
                  {!bridgeAlive
                    ? 'TEKSEA Bridge offline.'
                    : 'Seu TEKSEA Bridge está desatualizado e ainda não possui o conversor de PIT (/api/parse-pit).'}
                </div>
                <div className="text-amber-200/80 mt-0.5">
                  Atualize o Bridge pelo botão no cabeçalho (ou execute instalar_bridge.bat) para habilitar a importação de PIT.
                </div>
              </div>
            </div>
          ) : null}

          {/* AREA DE UPLOAD */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-xl p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xlsm,.csv,.docx"
              className="hidden"
              onChange={e => handleFileSelected(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!bridgeAlive || !bridgeHasPit || parsing || writing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {parsing ? 'PROCESSANDO PIT...' : pitData ? 'CARREGAR OUTRO PIT' : 'SELECIONAR ARQUIVO PIT'}
            </button>
            {pitData ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-blue-300">
                  {pitData.source_file}
                </span>
                <span className="text-slate-400">
                  Cliente: <strong className="text-slate-100">{pitData.pit.meta?.cliente || '—'}</strong>
                </span>
                <span className="text-slate-400">
                  Modelo: <strong className="text-slate-100">{pitData.pit.meta?.modelo || '—'}</strong>
                </span>
                <span className="text-slate-400">
                  NS: <strong className="text-emerald-400 font-mono">{pitData.pit.meta?.numero_serie || '—'}</strong>
                </span>
              </div>
            ) : (
              <span className="text-xs text-slate-400">
                Aceita planilhas PIT da engenharia em <strong>.pdf</strong>, <strong>.xlsx</strong>, <strong>.csv</strong> ou <strong>.docx</strong>.
              </span>
            )}
          </div>

          {parseError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* CONFERENCIA DO PIT */}
          {pitData && (
            <>
              {/* ALERTAS DE VALIDACAO */}
              {pitData.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {pitData.warnings.map((w, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 border ${
                        w.severity === 'error'
                          ? 'bg-red-500/10 border-red-500/40 text-red-300'
                          : w.severity === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                      }`}
                    >
                      {w.severity === 'error' ? (
                        <XCircle className="w-4 h-4 shrink-0" />
                      ) : w.severity === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                      ) : (
                        <Info className="w-4 h-4 shrink-0" />
                      )}
                      <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                        {w.code}
                      </span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ABAS DE CONFERENCIA */}
              <div className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-2">
                {[
                  { id: 'base', label: `2. Base (${pitData.summary.phase1_writes} CAN)` },
                  { id: 'params', label: `6.1 Parâmetros (${pitData.summary.params_parsed}/19)` },
                  { id: 'alarms', label: `6.2 Alarmes (${pitData.summary.alarms_parsed}/27)` },
                  { id: 'din', label: `6.3 Entradas Digitais (${pitData.summary.din_parsed}/8)` },
                  { id: 'relays', label: `6.4 Relés Status (${pitData.summary.status_relays_parsed}/22)` },
                  { id: 'can', label: `Plano CAN (${pitData.summary.phase1_writes + 1 + pitData.summary.phase2_writes})` },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                {revalidating && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-blue-400">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Revalidando...
                  </span>
                )}
              </div>

              {/* CONTEUDO DA ABA */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 max-h-[340px] overflow-auto">
                {activeTab === 'base' && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    {[
                      { k: 'vcc_nom', label: 'Tensão CC Nom. (V)', reg: 161 },
                      { k: 'icc_nom', label: 'Corrente CC Nom. (A)', reg: 163 },
                      { k: 'vcc_max_pct', label: 'Tensão CC Máx. (%)', reg: 162 },
                      { k: 'icc_max_pct', label: 'Corrente CC Máx. (%)', reg: 164 },
                      { k: 'ur_vcc_eme', label: 'Tensão Emerg. UR (V)', reg: 169 },
                      { k: 'ur_quantidade', label: 'Nº Módulos UR', reg: 170 },
                      { k: 'vca_nom', label: 'Tensão CA Nom. (V)', reg: 165 },
                      { k: 'ur_sistema', label: 'Sistema CA', reg: 171 },
                      { k: 'sensor_ica_tc_a', label: 'TC Entrada CA (A)', reg: 214 },
                      { k: 'sensor_iret_shunt_a', label: 'Shunt I Ret. (A)', reg: 211 },
                      { k: 'sensor_ibat_shunt_a', label: 'Shunt I Bat. (A)', reg: 212 },
                      { k: 'sn_equip', label: 'Nº Série Equip.', reg: 160 },
                    ].map(f => (
                      <div key={f.k} className="bg-slate-900 border border-slate-800 rounded-lg p-2">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                          <span>{f.label}</span>
                          <span className="font-mono text-blue-400">REG {f.reg}</span>
                        </div>
                        <input
                          type="text"
                          defaultValue={pitData.pit.base?.[f.k] ?? ''}
                          key={`${f.k}-${pitData.pit.base?.[f.k]}`}
                          disabled={writing}
                          onBlur={e => {
                            if (String(pitData.pit.base?.[f.k] ?? '') !== e.target.value.trim()) {
                              updateBaseField(f.k, e.target.value);
                            }
                          }}
                          className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:border-blue-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'params' && (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2">Cód</th>
                        <th className="py-1.5 px-2">Descrição</th>
                        <th className="py-1.5 px-2">Ajuste (editável)</th>
                        <th className="py-1.5 px-2">Unid.</th>
                        <th className="py-1.5 px-2">Faixa 4.1</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(pitData.pit.parametros).map(([code, p]: [string, any]) => {
                        const lim = pitData.pit.limites_parametros?.[code];
                        const outOfRange =
                          p.valor !== null &&
                          lim &&
                          ((lim.min !== null && p.valor < lim.min) || (lim.max !== null && p.valor > lim.max));
                        return (
                          <tr key={code} className={outOfRange ? 'bg-red-500/10' : ''}>
                            <td className="py-1.5 px-2 font-mono font-bold text-blue-300">{code}</td>
                            <td className="py-1.5 px-2 text-slate-300">{p.descricao}</td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                defaultValue={p.valor !== null ? String(p.valor) : '-'}
                                key={`${code}-${p.valor}`}
                                disabled={writing}
                                onBlur={e => updateParamValue(code, e.target.value)}
                                className={`w-24 px-2 py-0.5 rounded font-mono text-xs bg-slate-900 border outline-none ${
                                  outOfRange ? 'border-red-500 text-red-300' : 'border-slate-700 text-slate-100'
                                }`}
                              />
                            </td>
                            <td className="py-1.5 px-2 text-slate-400">{p.unidade}</td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">
                              {lim ? `${lim.min ?? '—'} .. ${lim.max ?? '—'}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {activeTab === 'alarms' && (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2">Cód</th>
                        <th className="py-1.5 px-2">Descrição</th>
                        <th className="py-1.5 px-2">Valor (editável)</th>
                        <th className="py-1.5 px-2">Faixa 4.2</th>
                        <th className="py-1.5 px-2">Ação</th>
                        <th className="py-1.5 px-2">Retardo</th>
                        <th className="py-1.5 px-2">Relés</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(pitData.pit.alarmes).map(([code, al]: [string, any]) => {
                        const lim = pitData.pit.limites_alarmes?.[code];
                        const outOfRange =
                          al.valor !== null &&
                          lim &&
                          ((lim.min !== null && al.valor < lim.min) || (lim.max !== null && al.valor > lim.max));
                        return (
                          <tr key={code} className={outOfRange ? 'bg-red-500/15' : ''}>
                            <td className="py-1.5 px-2 font-mono font-bold text-amber-300">{code}</td>
                            <td className="py-1.5 px-2 text-slate-300">{al.descricao}</td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                defaultValue={al.valor !== null ? String(al.valor) : 'N/A'}
                                key={`${code}-${al.valor}`}
                                disabled={writing || al.valor === null}
                                onBlur={e => updateAlarmValue(code, e.target.value)}
                                className={`w-24 px-2 py-0.5 rounded font-mono text-xs bg-slate-900 border outline-none disabled:opacity-50 ${
                                  outOfRange ? 'border-red-500 text-red-300 font-bold' : 'border-slate-700 text-slate-100'
                                }`}
                              />{' '}
                              <span className="text-[10px] text-slate-500">{al.unidade}</span>
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">
                              {lim && lim.min !== null ? `${lim.min} .. ${lim.max}` : '—'}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-300">{al.acao}</td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">{al.retardo_raw || '—'}</td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-emerald-400">{formatReles(al.reles)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {activeTab === 'din' && (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2">Entrada</th>
                        <th className="py-1.5 px-2">Descrição</th>
                        <th className="py-1.5 px-2">Tipo</th>
                        <th className="py-1.5 px-2">Sinótico</th>
                        <th className="py-1.5 px-2">Retardo</th>
                        <th className="py-1.5 px-2">Ação / Comando</th>
                        <th className="py-1.5 px-2">Relés</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(pitData.pit.entradas_digitais).map(([code, d]: [string, any]) => (
                        <tr key={code} className={d.tipo === 'DESL' ? 'opacity-50' : ''}>
                          <td className="py-1.5 px-2 font-mono font-bold text-cyan-300">{code}</td>
                          <td className="py-1.5 px-2 text-slate-200">{d.descricao}</td>
                          <td className="py-1.5 px-2 font-mono">{d.tipo}</td>
                          <td className="py-1.5 px-2 font-mono">{d.sinotico}</td>
                          <td className="py-1.5 px-2 font-mono">{d.retardo_s ?? 0}s</td>
                          <td className="py-1.5 px-2 font-mono">{d.acao} / {d.comando}</td>
                          <td className="py-1.5 px-2 font-mono text-emerald-400">{formatReles(d.reles)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {activeTab === 'relays' && (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2">Status</th>
                        <th className="py-1.5 px-2">Descrição</th>
                        <th className="py-1.5 px-2">Relés Mapeados</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(pitData.pit.saidas_rele).map(([code, st]: [string, any]) => {
                        const rel = formatReles(st.reles);
                        return (
                          <tr key={code} className={rel === '—' ? 'opacity-45' : ''}>
                            <td className="py-1.5 px-2 font-mono font-bold text-slate-300">{code}</td>
                            <td className="py-1.5 px-2 text-slate-200">{st.descricao}</td>
                            <td className="py-1.5 px-2 font-mono text-emerald-400">{rel}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {activeTab === 'can' && (
                  <div className="space-y-3 text-xs font-mono">
                    <div>
                      <div className="text-blue-400 font-bold mb-1">
                        FASE 1 — Parâmetros Base e Sensores ({pitData.can_plan.phase1_base.length} writes)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {pitData.can_plan.phase1_base.map((w, i) => (
                          <div key={i} className="px-2 py-1 bg-slate-900 rounded border border-slate-800 flex justify-between">
                            <span>REG {w.reg} ({w.name})</span>
                            <span className="text-emerald-400">{w.value} [{w.type}]</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300">
                      REBOOT — REG {pitData.can_plan.reboot_cmd.reg} ({pitData.can_plan.reboot_cmd.name}) = {pitData.can_plan.reboot_cmd.value} (RBT_Normal) + aguarda 4s
                    </div>
                    <div>
                      <div className="text-blue-400 font-bold mb-1">
                        FASE 2 — Usuário, Alarmes, Entradas Digitais e Relés ({pitData.can_plan.phase2_user.length} writes)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {pitData.can_plan.phase2_user.map((w, i) => (
                          <div key={i} className="px-2 py-1 bg-slate-900 rounded border border-slate-800 flex justify-between">
                            <span>REG {w.reg} ({w.name})</span>
                            <span className="text-emerald-400">{w.value} [{w.type}]</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* PROGRESSO / LOG DE GRAVACAO */}
              {(writing || writeLogs.length > 0) && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">{writePhase}</span>
                    <span className="font-mono text-blue-400">
                      {writeProgress.current} / {writeProgress.total}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        writeDone === 'error'
                          ? 'bg-red-500'
                          : writeDone === 'success'
                            ? 'bg-emerald-500'
                            : 'bg-blue-500'
                      }`}
                      style={{
                        width: writeProgress.total > 0 ? `${(writeProgress.current / writeProgress.total) * 100}%` : '0%',
                      }}
                    />
                  </div>
                  <div className="max-h-28 overflow-auto bg-black/50 rounded p-2 font-mono text-[10px] text-slate-300 space-y-0.5">
                    {writeLogs.map((l, idx) => (
                      <div key={idx}>{l}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[11px]">
            <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
              ESP32: {connected ? 'ONLINE' : 'OFFLINE'}
            </span>
            <span className={ugeOk ? 'text-emerald-400' : 'text-red-400'}>
              UGE CAN: {ugeOk ? `LINK OK${ugeVers ? ` (${ugeVers})` : ''}` : 'OFFLINE'}
            </span>
            {hasErrors && (
              <span className="text-red-400 font-bold">
                Corrija os {pitData?.summary.errors_count} erro(s) antes de gravar na UGE.
              </span>
            )}
            {writeDone === 'success' && (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> PIT gravado na UGE!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {writing ? (
              <button
                onClick={() => { cancelRef.current = true; }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" /> CANCELAR
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                >
                  FECHAR
                </button>
                <button
                  onClick={handleWriteToUge}
                  disabled={!canWrite}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow"
                >
                  <Play className="w-3.5 h-3.5" /> GRAVAR PIT NA UGE
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
