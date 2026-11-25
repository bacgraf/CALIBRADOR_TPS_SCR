import React, { useState, useRef, useEffect } from 'react';
import {
  FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, XCircle,
  Cpu, Play, Square, RefreshCw, Info, X, DownloadCloud
} from 'lucide-react';
import { UGE_READ_BATCHES, decodeUgeRegisters, UgeSnapshot } from './lib/ugePitReader';

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

const ACAO_OPTIONS = ['NENHUM', 'ALM', 'ALM,RT', 'ALM,BLQ', 'ALM,BLQ,RT'];
const SINOTICO_OPTIONS = ['NENHUM', 'AC,ALM', 'AC,FLT', 'RET,ALM', 'RET,FLT', 'BAT,ALM', 'BAT,FLT', 'CON,ALM', 'CON,FLT'];
const DIN_TIPO_OPTIONS = ['DESL', 'NA', 'NF'];
const DIN_COMANDO_OPTIONS = [
  'NENHUM', 'INIBIR', 'REMOTO', 'DESLIGA', 'RESET', 'CARG.MAN',
  'EQUAL.', 'EMG.UDQ', 'STD_BY', 'DJ_CA', 'DJB_DES', 'DJC_DES',
];

function parseRelesText(text: string): { rp1: number; rp2: number; re11: number; re12: number; re21: number; re22: number } {
  const p: number[] = [];
  const e1: number[] = [];
  const e2: number[] = [];
  const tokens = text.toUpperCase().split(/[,;\s]+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok === '-' || tok === '—' || tok === 'NENHUM') continue;
    let m = tok.match(/^P\.?([1-6])$/);
    if (m) { p.push(parseInt(m[1], 10)); continue; }
    m = tok.match(/^E1\.?([1-8])$/);
    if (m) { e1.push(parseInt(m[1], 10)); continue; }
    m = tok.match(/^E2\.?([1-8])$/);
    if (m) { e2.push(parseInt(m[1], 10)); continue; }
  }
  return {
    rp1: p[0] || 0, rp2: p[1] || 0,
    re11: e1[0] || 0, re12: e1[1] || 0,
    re21: e2[0] || 0, re22: e2[1] || 0,
  };
}

function parseRetardoInput(raw: string, isMinutes = false): { retardo_s: number; retardo_raw: string } {
  const s = raw.trim().toLowerCase().replace(',', '.');
  const num = parseFloat(s);
  if (isNaN(num) || num < 0) {
    return { retardo_s: 0, retardo_raw: isMinutes ? '0min' : '0,0s' };
  }
  if (s.includes('min') || (isMinutes && !s.includes('s'))) {
    return { retardo_s: Math.round(num * 60), retardo_raw: `${Math.round(num)}min` };
  }
  if (s.includes('h')) {
    return { retardo_s: Math.round(num * 3600), retardo_raw: `${num}h` };
  }
  const rounded = Math.round(num * 10) / 10;
  return { retardo_s: rounded, retardo_raw: `${rounded.toFixed(1).replace('.', ',')}s` };
}

function snapshotToPitObject(snap: UgeSnapshot) {
  const parametros: Record<string, any> = {};
  for (const [code, p] of Object.entries(snap.parametros)) {
    parametros[code] = {
      descricao: p.descricao,
      valor: p.valor,
      unidade: p.unidade,
      raw: p.valor !== null ? String(p.valor) : '-',
    };
  }
  const alarmes: Record<string, any> = {};
  for (const [code, al] of Object.entries(snap.alarmes)) {
    const parsedRet = parseRetardoInput(al.retardo_raw === '—' ? '0' : al.retardo_raw, code === 'AL27');
    alarmes[code] = {
      descricao: al.descricao,
      valor: al.valor,
      unidade: al.unidade,
      raw: al.valor !== null ? String(al.valor) : 'N/A',
      acao: al.acao === '—' ? 'NENHUM' : al.acao,
      retardo_s: parsedRet.retardo_s,
      retardo_raw: al.retardo_raw === '—' ? '0,0s' : al.retardo_raw,
      reles: { ...al.reles },
    };
  }
  const entradas_digitais: Record<string, any> = {};
  for (const [code, d] of Object.entries(snap.entradas_digitais)) {
    const parsedRet = parseRetardoInput(d.retardo_raw === '—' ? '0' : d.retardo_raw, false);
    entradas_digitais[code] = {
      descricao: d.descricao,
      tipo: d.tipo,
      sinotico: d.sinotico,
      retardo_s: parsedRet.retardo_s,
      retardo_raw: parsedRet.retardo_raw,
      acao: d.acao === '—' ? 'NENHUM' : d.acao,
      comando: d.comando,
      reles: { ...d.reles },
    };
  }
  const saidas_rele: Record<string, any> = {};
  for (const [code, st] of Object.entries(snap.saidas_rele)) {
    saidas_rele[code] = {
      descricao: st.descricao,
      reles: { ...st.reles },
    };
  }
  return {
    meta: {
      cliente: 'LEITURA UGE',
      modelo: 'TPS125',
      numero_serie: snap.base.sn_equip != null ? String(snap.base.sn_equip) : '—',
    },
    base: structuredClone(snap.base),
    calibracao: {},
    limites_parametros: {},
    limites_alarmes: {},
    mostradores: {},
    parametros,
    alarmes,
    entradas_digitais,
    saidas_rele,
  };
}

const BASE_REG_EXCEL_LABELS: Record<number, string> = {
  130: '3.7 HORÍMETRO — HORAS',
  131: '3.7 HORÍMETRO — CICLOS',
  160: '2.9 Nº SÉRIE',
  161: '2.1 SAÍDA CC — TENS. NOM. (V)',
  162: '2.1 SAÍDA CC — TENS. MAX. (%)',
  163: '2.1 SAÍDA CC — CORR. NOM. (A)',
  164: '2.1 SAÍDA CC — CORR. MAX. (%)',
  165: '2.3 ENTRADA CA — TENS. NOM. (V)',
  166: '2.3 ENTRADA CA — TENS. MÍN. (%)',
  167: '2.3 ENTRADA CA — TENS. MÁX. (%)',
  168: '2.3 ENTRADA CA — FREQ. NOM. (Hz)',
  169: '2.1 SAÍDA CC — TENS. EME. (V)',
  170: '2.2 UR — N. URs (módulos)',
  171: '2.3 ENTRADA CA — SISTEMA',
  178: '2.7 RELÉS FIXOS',
  181: '2.8 CONTROLADOR — Nº DIODOS UDQ',
  182: '2.8 CONTROLADOR — D. BLOQUEIO',
  195: '2.5 I RETIFICADOR — TIPO',
  196: '2.6 I BATERIA — TIPO',
  198: '2.4 SENSOR ICA — TIPO',
  211: '2.5 I RETIFICADOR — SHUNT (A)',
  212: '2.6 I BATERIA — SHUNT (A)',
  214: '2.4 SENSOR ICA — TC / ESPIRAS',
};

function formatCanItemLabel(item: CanWriteItem, pit: any): string {
  if (BASE_REG_EXCEL_LABELS[item.reg]) {
    return BASE_REG_EXCEL_LABELS[item.reg];
  }
  const src = item.source || '';
  if (src.startsWith('6.1:')) {
    const code = src.slice(4);
    const desc = pit?.parametros?.[code]?.descricao;
    return desc ? `6.1 ${code} — ${desc}` : `6.1 ${code}`;
  }
  if (src.startsWith('6.2:')) {
    const code = src.slice(4);
    const desc = pit?.alarmes?.[code]?.descricao;
    const part = item.name.startsWith('REG_Atu_')
      ? 'Valor'
      : item.name.startsWith('REG_Opt_')
        ? 'Ação/Retardo'
        : item.name.startsWith('REG_Rele_')
          ? 'Relés'
          : '';
    return `${desc ? `6.2 ${code} — ${desc}` : `6.2 ${code}`}${part ? ` (${part})` : ''}`;
  }
  if (src.startsWith('6.3:')) {
    const code = src.slice(4);
    const desc = pit?.entradas_digitais?.[code]?.descricao;
    const part = item.name.startsWith('REG_Opt_') ? 'Config' : item.name.startsWith('REG_Rele_') ? 'Relés' : '';
    return `${desc ? `6.3 ${code} — ${desc}` : `6.3 ${code}`}${part ? ` (${part})` : ''}`;
  }
  if (src.startsWith('6.4:')) {
    const code = src.slice(4);
    const desc = pit?.saidas_rele?.[code]?.descricao;
    return desc ? `6.4 ${code} — ${desc} (Relés)` : `6.4 ${code} (Relés)`;
  }
  return item.name;
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
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [writeLogs]);

  // Estado de leitura da UGE (conferência / inspeção)
  const [reading, setReading] = useState(false);
  const [readProgress, setReadProgress] = useState({ current: 0, total: 0 });
  const [ugeSnap, setUgeSnap] = useState<UgeSnapshot | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const handleReadFromUge = async () => {
    if (!connected || !ugeOk || reading || writing) return;
    cancelRef.current = false;
    setReading(true);
    setReadError(null);
    const totalBatches = UGE_READ_BATCHES.length;
    const totalRegs = UGE_READ_BATCHES.reduce((acc, b) => acc + b.qtd, 0);
    setReadProgress({ current: 0, total: totalBatches });
    const rawMap: Record<number, number> = {};
    let okCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < totalBatches; i++) {
        if (cancelRef.current) break;
        const b = UGE_READ_BATCHES[i];
        try {
          const resp = await request({ command: 'read_reg', reg: b.reg, format: b.format, qtd: b.qtd }, 2500);
          if (resp?.success && Array.isArray(resp.values)) {
            resp.values.forEach((v: number, idx: number) => {
              rawMap[b.reg + idx] = v;
              okCount += 1;
            });
          } else {
            failCount += b.qtd;
          }
        } catch {
          failCount += b.qtd;
        }
        setReadProgress({ current: i + 1, total: totalBatches });
      }
      if (!cancelRef.current) {
        if (okCount === 0) {
          setReadError('Nenhum registrador respondeu. Verifique se o firmware do ESP32 está atualizado com suporte a read_reg.');
        } else {
          const snap = decodeUgeRegisters(rawMap, okCount, totalRegs);
          setUgeSnap(snap);
          // Se não há arquivo PIT carregado, promove a leitura da UGE para edição imediata via Bridge
          if (!pitData && bridgeAlive && bridgeHasPit) {
            try {
              const resp = await fetch(`${BRIDGE_URL}/api/pit/revalidate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pit: snapshotToPitObject(snap) }),
              });
              const json = await resp.json();
              if (resp.ok && json.success) {
                setPitData({
                  source_file: `UGE_NS_${snap.base.sn_equip ?? 'LIVE'}`,
                  source_format: 'uge',
                  pit: json.pit,
                  warnings: json.warnings,
                  can_plan: json.can_plan,
                  summary: json.summary,
                });
              }
            } catch {
              // Mantém apenas modo leitura se o Bridge não responder
            }
          }
          if (failCount > 0) {
            setReadError(`Leitura parcial: ${okCount}/${totalRegs} registradores lidos (${failCount} sem resposta).`);
          }
        }
      }
    } finally {
      setReading(false);
    }
  };

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
    if (field.startsWith('reles_fixos.')) {
      const sub = field.split('.')[1];
      next.base.reles_fixos = next.base.reles_fixos || {};
      const num = parseInt(rawVal.trim(), 10);
      next.base.reles_fixos[sub] = isNaN(num) ? 0 : num;
    } else if (field === 'ur_sistema') {
      next.base[field] = rawVal.trim().toUpperCase();
    } else if (field === 'sensor_ica_tipo' || field === 'sensor_iret_tipo' || field === 'sensor_ibat_tipo') {
      next.base[field] = rawVal.trim();
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
    const num = trimmed === '' || trimmed.toUpperCase() === 'N/A' || trimmed === '-' ? null : parseFloat(trimmed.replace(',', '.'));
    next.alarmes[code].valor = num !== null && !isNaN(num) ? num : null;
    next.alarmes[code].raw = trimmed || 'N/A';
    revalidatePit(next, `${code} = ${trimmed || 'N/A'}`);
  };

  const updateAlarmField = (code: string, field: 'acao' | 'retardo' | 'reles', rawVal: string) => {
    if (!pitData) return;
    const next = structuredClone(pitData.pit);
    if (field === 'acao') {
      next.alarmes[code].acao = rawVal.trim().toUpperCase() || 'NENHUM';
    } else if (field === 'retardo') {
      const parsed = parseRetardoInput(rawVal, code === 'AL27');
      next.alarmes[code].retardo_s = parsed.retardo_s;
      next.alarmes[code].retardo_raw = parsed.retardo_raw;
    } else if (field === 'reles') {
      next.alarmes[code].reles = parseRelesText(rawVal);
    }
    revalidatePit(next, `${code}.${field} = ${rawVal}`);
  };

  const updateDinField = (
    code: string,
    field: 'sinotico' | 'tipo' | 'retardo' | 'acao' | 'comando' | 'reles',
    rawVal: string
  ) => {
    if (!pitData) return;
    const next = structuredClone(pitData.pit);
    if (field === 'retardo') {
      const parsed = parseRetardoInput(rawVal, false);
      next.entradas_digitais[code].retardo_s = parsed.retardo_s;
      next.entradas_digitais[code].retardo_raw = parsed.retardo_raw;
    } else if (field === 'reles') {
      next.entradas_digitais[code].reles = parseRelesText(rawVal);
    } else {
      next.entradas_digitais[code][field] = rawVal.trim().toUpperCase();
    }
    revalidatePit(next, `${code}.${field} = ${rawVal}`);
  };

  const updateStatusRelay = (code: string, rawVal: string) => {
    if (!pitData) return;
    const next = structuredClone(pitData.pit);
    next.saidas_rele[code].reles = parseRelesText(rawVal);
    revalidatePit(next, `Status ${code} Relés = ${rawVal}`);
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
  const canWrite = Boolean(pitData && !hasErrors && connected && ugeOk && !writing && !reading);
  const canRead = Boolean(connected && ugeOk && !writing && !reading);
  const hasContent = Boolean(pitData || ugeSnap);

  // Calcula resumo de conferência quando PIT e UGE estão ambos carregados
  const diffStats = React.useMemo(() => {
    if (!pitData || !ugeSnap) return null;
    const allItems = [...pitData.can_plan.phase1_base, ...pitData.can_plan.phase2_user];
    // Deduplica por reg (mantém a última escrita, ex: reg 214 enviado 2x)
    const byReg = new Map<number, CanWriteItem>();
    for (const it of allItems) byReg.set(it.reg, it);
    let matched = 0;
    let mismatched = 0;
    let missing = 0;
    for (const [reg, it] of byReg.entries()) {
      const actual = ugeSnap.raw[reg];
      if (actual === undefined) {
        missing++;
      } else {
        const exp = it.type === 'int32' ? (it.value >>> 0) : it.value;
        const act = it.type === 'int32' ? (actual >>> 0) : actual;
        if (exp === act) matched++;
        else mismatched++;
      }
    }
    return { total: byReg.size, matched, mismatched, missing };
  }, [pitData, ugeSnap]);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3">
      <div className="bg-slate-900 text-slate-200 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
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
            disabled={writing || reading}
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
              disabled={!bridgeAlive || !bridgeHasPit || parsing || writing || reading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {parsing ? 'PROCESSANDO PIT...' : pitData ? 'CARREGAR OUTRO PIT' : 'SELECIONAR ARQUIVO PIT'}
            </button>
            <button
              onClick={handleReadFromUge}
              disabled={!canRead}
              title="Ler todos os parâmetros, sensores, alarmes, entradas digitais e relés diretamente da UGE via CAN"
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-colors"
            >
              <DownloadCloud className={`w-4 h-4 ${reading ? 'animate-bounce' : ''}`} />
              {reading ? `LENDO UGE (${readProgress.current}/${readProgress.total} lotes)...` : ugeSnap ? 'ATUALIZAR LEITURA UGE' : 'LER DA UGE'}
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
            ) : ugeSnap ? (
              <span className="text-xs text-cyan-300">
                Leitura direta da UGE às <strong>{ugeSnap.timestamp}</strong> ({ugeSnap.regsRead}/{ugeSnap.regsTotal} registradores) — NS Equip: <strong className="font-mono">{ugeSnap.base.sn_equip ?? '—'}</strong>
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Carregue uma planilha PIT (.pdf, .xlsx, .csv, .docx) ou clique em <strong>LER DA UGE</strong> para inspecionar a placa.
              </span>
            )}
          </div>

          {readError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{readError}</span>
            </div>
          )}

          {diffStats && (
            <div className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${diffStats.mismatched === 0 && diffStats.missing === 0
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
              }`}>
              <div className="flex items-center gap-2">
                {diffStats.mismatched === 0 && diffStats.missing === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>
                  <strong>Conferência PIT × UGE ({ugeSnap?.timestamp}):</strong>{' '}
                  <strong className="text-emerald-400">{diffStats.matched}/{diffStats.total}</strong> iguais
                  {diffStats.mismatched > 0 && (
                    <> · <strong className="text-red-400">{diffStats.mismatched} divergente(s)</strong></>
                  )}
                  {diffStats.missing > 0 && (
                    <> · <strong className="text-slate-400">{diffStats.missing} não lido(s)</strong></>
                  )}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Veja os detalhes em cada aba ou em "Plano CAN".</span>
            </div>
          )}

          {parseError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {/* CONFERENCIA DO PIT / LEITURA DA UGE */}
          {hasContent && (
            <>
              {/* ALERTAS DE VALIDACAO */}
              {pitData && pitData.warnings.length > 0 && (
                <div className="space-y-1.5">
                  {pitData.warnings.map((w, idx) => (
                    <div
                      key={idx}
                      className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 border ${w.severity === 'error'
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
                  { id: 'base', label: `Base & Sensores${pitData ? ` (${pitData.summary.phase1_writes} CAN)` : ''}` },
                  { id: 'params', label: `Parâmetros (${pitData ? pitData.summary.params_parsed : Object.keys(ugeSnap?.parametros || {}).length}/19)` },
                  { id: 'alarms', label: `Alarmes (${pitData ? pitData.summary.alarms_parsed : Object.keys(ugeSnap?.alarmes || {}).length}/27)` },
                  { id: 'din', label: `Entradas Digitais (${pitData ? pitData.summary.din_parsed : Object.keys(ugeSnap?.entradas_digitais || {}).length}/8)` },
                  { id: 'relays', label: `Relés Status (${pitData ? pitData.summary.status_relays_parsed : Object.keys(ugeSnap?.saidas_rele || {}).length}/22)` },
                  ...(pitData ? [{ id: 'can', label: `Plano CAN (${pitData.summary.phase1_writes + 1 + pitData.summary.phase2_writes})` }] : []),
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === tab.id
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
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 max-h-[380px] overflow-auto">
                {activeTab === 'base' && (
                  <div className="space-y-4">
                    {[
                      {
                        title: '2.1 SAÍDA CC',
                        fields: [
                          { k: 'vcc_nom', label: 'TENS. NOM. (V)', reg: 161 },
                          { k: 'icc_nom', label: 'CORR. NOM. (A)', reg: 163 },
                          { k: 'vcc_max_pct', label: 'TENS. MAX. (%)', reg: 162 },
                          { k: 'icc_max_pct', label: 'CORR. MAX. (%)', reg: 164 },
                          { k: 'ur_vcc_eme', label: 'TENS. EME. (V)', reg: 169 },
                        ],
                      },
                      {
                        title: '2.2 UR  ·  2.3 ENTRADA CA  ·  2.8 CONTROLADOR  ·  2.9 EQUIPAMENTO  ·  3.7 HORÍMETRO',
                        fields: [
                          { k: 'ur_quantidade', label: 'N. URs (módulos)', reg: 170 },
                          { k: 'vca_nom', label: 'TENS. NOM. CA (V)', reg: 165 },
                          { k: 'ur_sistema', label: 'SISTEMA', reg: 171 },
                          { k: 'udq_diodos', label: 'Nº DIODOS UDQ (und)', reg: 181 },
                          { k: 'udq_diodo_bloqueio', label: 'D. BLOQUEIO (und)', reg: 182 },
                          { k: 'sn_equip', label: 'Nº SÉRIE', reg: 160 },
                          { k: 'horimetro_horas', label: 'HORÍMETRO — HORAS', reg: 130 },
                          { k: 'horimetro_ciclos', label: 'HORÍMETRO — CICLOS', reg: 131 },
                        ],
                      },
                      {
                        title: '2.4 SENSOR ICA  ·  2.5 SENSORES CC - I RETIFICADOR  ·  2.6 SENSORES CC - I BATERIA',
                        fields: [
                          { k: 'sensor_ica_tipo', label: '2.4 ICA — TIPO', reg: 198 },
                          { k: 'sensor_ica_tc_a', label: '2.4 ICA — TC (A)', reg: 214 },
                          { k: 'sensor_ica_espiras', label: '2.4 ICA — ESPIRAS (voltas)', reg: 214 },
                          { k: 'sensor_iret_tipo', label: '2.5 I RET — TIPO', reg: 195 },
                          { k: 'sensor_iret_shunt_a', label: '2.5 I RET — SHUNT (A)', reg: 211 },
                          { k: 'sensor_ibat_tipo', label: '2.6 I BAT — TIPO', reg: 196 },
                          { k: 'sensor_ibat_shunt_a', label: '2.6 I BAT — SHUNT (A)', reg: 212 },
                        ],
                      },
                      {
                        title: '2.7 RELÉS FIXOS (REG 178)',
                        fields: [
                          { k: 'reles_fixos.desconexao_ca', label: 'DESCONEXAO CA (nº relé)', reg: 178 },
                          { k: 'reles_fixos.udq_estagio_1', label: 'UDQ ESTAGIO 1 (nº relé)', reg: 178 },
                          { k: 'reles_fixos.udq_estagio_2', label: 'UDQ ESTAGIO 2 (nº relé)', reg: 178 },
                          { k: 'reles_fixos.udq_estagio_3', label: 'UDQ ESTAGIO 3 (nº relé)', reg: 178 },
                          { k: 'reles_fixos.desconexao_cc', label: 'DESCONEXAO CC (nº relé)', reg: 178 },
                        ],
                      },
                    ].map(sec => {
                      const getVal = (obj: any, k: string) =>
                        k.startsWith('reles_fixos.') ? obj?.reles_fixos?.[k.split('.')[1]] : obj?.[k];
                      return (
                        <div key={sec.title} className="space-y-1.5">
                          <div className="text-[11px] font-bold text-blue-300 uppercase tracking-wide border-b border-slate-800/80 pb-1">
                            {sec.title}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                            {sec.fields.map(f => {
                              const pitVal = getVal(pitData?.pit.base, f.k);
                              const ugeVal = getVal(ugeSnap?.base, f.k);
                              const hasBoth = Boolean(pitData && ugeSnap);
                              const normCmp = (v: any) => String(v ?? '---').trim().toUpperCase();
                              const match = hasBoth && normCmp(pitVal) === normCmp(ugeVal);
                              return (
                                <div
                                  key={f.k}
                                  className={`bg-slate-900 border rounded-lg p-2 ${hasBoth ? (match ? 'border-emerald-500/40' : 'border-red-500/50') : 'border-slate-800'
                                    }`}
                                >
                                  <div className="flex justify-between text-[10px] text-slate-400 mb-1 gap-1">
                                    <span className="truncate">{f.label}</span>
                                    <span className="font-mono text-blue-400 shrink-0">REG {f.reg}</span>
                                  </div>
                                  {pitData ? (
                                    <input
                                      type="text"
                                      defaultValue={pitVal ?? '---'}
                                      key={`${f.k}-${pitVal}`}
                                      disabled={writing}
                                      onBlur={e => {
                                        if (String(pitVal ?? '') !== e.target.value.trim()) {
                                          updateBaseField(f.k, e.target.value);
                                        }
                                      }}
                                      className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:border-blue-500 outline-none"
                                    />
                                  ) : (
                                    <div className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs">
                                      {ugeVal ?? '---'}
                                    </div>
                                  )}
                                  {pitData && ugeSnap && (
                                    <div className={`mt-1 text-[10px] font-mono flex justify-between ${match ? 'text-emerald-400' : 'text-red-400 font-bold'}`}>
                                      <span>UGE:</span>
                                      <span>{ugeVal ?? '---'}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {ugeSnap && (
                      <div className="border-t border-slate-800 pt-3">
                        <div className="text-[11px] font-bold text-cyan-400 mb-2 uppercase tracking-wide">
                          Diagnóstico Bruto de Todos os Sensores na UGE (192–198 Internos · 211–214 Externos)
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                          {ugeSnap.sensores.map(s => (
                            <div key={s.reg} className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                              <div>
                                <div className="text-[10px] text-slate-400">{s.nome}</div>
                                <div className={`font-mono font-bold ${s.valor.includes('EMPTY') ? 'text-red-400' : 'text-cyan-300'}`}>
                                  {s.valor}
                                </div>
                              </div>
                              <div className="text-right font-mono text-[10px] text-slate-500">
                                <div>REG {s.reg}</div>
                                <div>{s.rawHex}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'params' && (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2">Cód</th>
                        <th className="py-1.5 px-2">Descrição</th>
                        {pitData && <th className="py-1.5 px-2">PIT (editável)</th>}
                        {ugeSnap && <th className="py-1.5 px-2 text-cyan-400">Lido da UGE</th>}
                        <th className="py-1.5 px-2">Unid.</th>
                        {pitData && <th className="py-1.5 px-2">Mínimo</th>}
                        {pitData && <th className="py-1.5 px-2">Máximo</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(pitData ? pitData.pit.parametros : (ugeSnap?.parametros || {})).map(([code, p]: [string, any]) => {
                        const lim = pitData?.pit.limites_parametros?.[code];
                        const ugeP = ugeSnap?.parametros?.[code];
                        const outOfRange =
                          pitData &&
                          p.valor !== null &&
                          lim &&
                          ((lim.min !== null && p.valor < lim.min) || (lim.max !== null && p.valor > lim.max));
                        const hasBoth = Boolean(pitData && ugeP && p.valor !== null);
                        const diff = hasBoth && (ugeP!.valor === null || Math.abs(ugeP!.valor - p.valor) > 0.055);
                        return (
                          <tr key={code} className={outOfRange || diff ? 'bg-red-500/10' : ''}>
                            <td className="py-1.5 px-2 font-mono font-bold text-blue-300">{code}</td>
                            <td className="py-1.5 px-2 text-slate-300">{p.descricao}</td>
                            {pitData && (
                              <td className="py-1.5 px-2">
                                <input
                                  type="text"
                                  defaultValue={p.valor !== null ? String(p.valor) : '-'}
                                  key={`${code}-${p.valor}`}
                                  disabled={writing}
                                  onBlur={e => updateParamValue(code, e.target.value)}
                                  className={`w-24 px-2 py-0.5 rounded font-mono text-xs bg-slate-900 border outline-none ${outOfRange ? 'border-red-500 text-red-300' : 'border-slate-700 text-slate-100'
                                    }`}
                                />
                              </td>
                            )}
                            {ugeSnap && (
                              <td className={`py-1.5 px-2 font-mono font-bold ${!hasBoth ? 'text-cyan-300' : diff ? 'text-red-400' : 'text-emerald-400'
                                }`}>
                                {ugeP?.valor !== null && ugeP?.valor !== undefined ? String(ugeP.valor) : '---'}
                              </td>
                            )}
                            <td className="py-1.5 px-2 text-slate-400">{p.unidade}</td>
                            {pitData && (
                              <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">
                                {lim?.min != null ? lim.min : '—'}
                              </td>
                            )}
                            {pitData && (
                              <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">
                                {lim?.max != null ? lim.max : '—'}
                              </td>
                            )}
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
                        {pitData && <th className="py-1.5 px-2">PIT Valor</th>}
                        {ugeSnap && <th className="py-1.5 px-2 text-cyan-400">UGE Valor</th>}
                        {pitData && <th className="py-1.5 px-2">Mínimo</th>}
                        {pitData && <th className="py-1.5 px-2">Máximo</th>}
                        <th className="py-1.5 px-2">Ação {ugeSnap && pitData ? '(PIT / UGE)' : ''}</th>
                        <th className="py-1.5 px-2">Retardo {ugeSnap && pitData ? '(PIT / UGE)' : ''}</th>
                        <th className="py-1.5 px-2">Relés {ugeSnap && pitData ? '(PIT / UGE)' : ''}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(pitData ? pitData.pit.alarmes : (ugeSnap?.alarmes || {})).map(([code, al]: [string, any]) => {
                        const lim = pitData?.pit.limites_alarmes?.[code];
                        const ugeAl = ugeSnap?.alarmes?.[code];
                        const outOfRange =
                          pitData &&
                          al.valor !== null &&
                          lim &&
                          ((lim.min !== null && al.valor < lim.min) || (lim.max !== null && al.valor > lim.max));
                        const valDiff = Boolean(pitData && ugeAl && al.valor !== null && (ugeAl.valor === null || Math.abs(ugeAl.valor - al.valor) > 0.055));
                        const pitRel = formatReles(al.reles);
                        const ugeRel = ugeAl ? formatReles(ugeAl.reles) : '—';
                        const relDiff = Boolean(pitData && ugeAl && code !== 'AL09' && pitRel !== ugeRel);
                        return (
                          <tr key={code} className={outOfRange || valDiff || relDiff ? 'bg-red-500/10' : ''}>
                            <td className="py-1.5 px-2 font-mono font-bold text-amber-300">{code}</td>
                            <td className="py-1.5 px-2 text-slate-300">{al.descricao}</td>
                            {pitData && (
                              <td className="py-1.5 px-2">
                                <input
                                  type="text"
                                  defaultValue={al.valor !== null ? String(al.valor) : 'N/A'}
                                  key={`${code}-val-${al.valor}`}
                                  disabled={writing}
                                  onBlur={e => {
                                    const cur = al.valor !== null ? String(al.valor) : 'N/A';
                                    if (cur !== e.target.value.trim()) updateAlarmValue(code, e.target.value);
                                  }}
                                  className={`w-20 px-2 py-0.5 rounded font-mono text-xs bg-slate-900 border outline-none disabled:opacity-50 ${outOfRange ? 'border-red-500 text-red-300 font-bold' : 'border-slate-700 text-slate-100'
                                    }`}
                                />{' '}
                                <span className="text-[10px] text-slate-500">{al.unidade}</span>
                              </td>
                            )}
                            {ugeSnap && (
                              <td className={`py-1.5 px-2 font-mono font-bold ${valDiff ? 'text-red-400' : 'text-cyan-300'}`}>
                                {ugeAl?.valor !== null && ugeAl?.valor !== undefined ? `${ugeAl.valor} ${ugeAl.unidade}` : 'N/A'}
                              </td>
                            )}
                            {pitData && (
                              <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">
                                {lim?.min != null ? lim.min : '—'}
                              </td>
                            )}
                            {pitData && (
                              <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">
                                {lim?.max != null ? lim.max : '—'}
                              </td>
                            )}
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-300">
                              {pitData ? (
                                <select
                                  value={ACAO_OPTIONS.includes(al.acao) ? al.acao : 'NENHUM'}
                                  disabled={writing}
                                  onChange={e => updateAlarmField(code, 'acao', e.target.value)}
                                  className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] outline-none"
                                >
                                  {ACAO_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : (
                                ugeAl?.acao
                              )}
                              {pitData && ugeAl && ugeAl.acao !== '—' && (
                                <span className={`ml-1 ${ugeAl.acao === al.acao ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  ({ugeAl.acao})
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[11px] text-slate-400">
                              {pitData ? (
                                <input
                                  type="text"
                                  defaultValue={al.retardo_raw || '0,0s'}
                                  key={`${code}-ret-${al.retardo_raw}`}
                                  disabled={writing}
                                  onBlur={e => {
                                    if ((al.retardo_raw || '0,0s') !== e.target.value.trim()) {
                                      updateAlarmField(code, 'retardo', e.target.value);
                                    }
                                  }}
                                  className="w-16 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] outline-none"
                                />
                              ) : (
                                ugeAl?.retardo_raw
                              )}
                              {pitData && ugeAl && ugeAl.retardo_raw !== '—' && (
                                <span className="ml-1 text-cyan-400">({ugeAl.retardo_raw})</span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-[11px]">
                              {pitData ? (
                                <input
                                  type="text"
                                  defaultValue={pitRel === '—' ? '' : pitRel}
                                  placeholder="P.1, E1.2"
                                  key={`${code}-rel-${pitRel}`}
                                  disabled={writing}
                                  onBlur={e => {
                                    const cur = pitRel === '—' ? '' : pitRel;
                                    if (cur !== e.target.value.trim()) updateAlarmField(code, 'reles', e.target.value);
                                  }}
                                  className="w-24 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-[11px] outline-none"
                                />
                              ) : (
                                <span className="text-emerald-400">{ugeRel}</span>
                              )}
                              {pitData && ugeAl && (
                                <span className={`ml-1 ${relDiff ? 'text-red-400 font-bold' : 'text-cyan-400'}`}>
                                  ({ugeRel})
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {activeTab === 'din' && (
                  <div className="space-y-2">
                    <div className="text-[11px] text-slate-400 bg-slate-900/70 border border-slate-800 rounded-lg px-2.5 py-1.5">
                      Nota: a descrição textual das entradas digitais (ex.: <em>FUGA NEGATIVA</em>) é armazenada apenas na IHM; a UGE armazena Sinótico, Tipo, Retardo, Ação, Comando e Relés (todos editáveis abaixo; relés no formato <code className="text-emerald-300">P.1, E1.2, E2.1</code>).
                    </div>
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-1.5 px-2">Entrada</th>
                          <th className="py-1.5 px-2">Descrição</th>
                          <th className="py-1.5 px-2">Sinótico</th>
                          <th className="py-1.5 px-2">Tipo</th>
                          <th className="py-1.5 px-2">Retardo</th>
                          <th className="py-1.5 px-2">Ação</th>
                          <th className="py-1.5 px-2">Comando</th>
                          <th className="py-1.5 px-2">Relés</th>
                          {pitData && ugeSnap && <th className="py-1.5 px-2 text-cyan-400">Lido da UGE</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {Object.entries(pitData ? pitData.pit.entradas_digitais : (ugeSnap?.entradas_digitais || {})).map(([code, d]: [string, any]) => {
                          const ugeD = ugeSnap?.entradas_digitais?.[code];
                          const pitRel = formatReles(d.reles);
                          const ugeRel = ugeD ? formatReles(ugeD.reles) : '—';
                          const dinDiff = Boolean(
                            pitData && ugeD &&
                            (ugeD.tipo !== d.tipo || ugeD.sinotico !== d.sinotico || ugeD.acao !== d.acao || ugeD.comando !== d.comando || ugeRel !== pitRel)
                          );
                          const retStr = d.retardo_raw || `${d.retardo_s ?? 0}s`;
                          return (
                            <tr key={code} className={`${d.tipo === 'DESL' && !dinDiff ? 'opacity-75' : ''} ${dinDiff ? 'bg-red-500/10' : ''}`}>
                              <td className="py-1.5 px-2 font-mono font-bold text-cyan-300">{code}</td>
                              <td className="py-1.5 px-2 text-slate-200">{d.descricao}</td>
                              <td className="py-1.5 px-2 font-mono text-slate-100">
                                {pitData ? (
                                  <select
                                    value={SINOTICO_OPTIONS.includes(d.sinotico) ? d.sinotico : 'NENHUM'}
                                    disabled={writing}
                                    onChange={e => updateDinField(code, 'sinotico', e.target.value)}
                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] outline-none"
                                  >
                                    {SINOTICO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : d.sinotico}
                              </td>
                              <td className="py-1.5 px-2 font-mono font-bold text-amber-300">
                                {pitData ? (
                                  <select
                                    value={DIN_TIPO_OPTIONS.includes(d.tipo) ? d.tipo : 'DESL'}
                                    disabled={writing}
                                    onChange={e => updateDinField(code, 'tipo', e.target.value)}
                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono text-[11px] font-bold outline-none"
                                  >
                                    {DIN_TIPO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : d.tipo}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-slate-200">
                                {pitData ? (
                                  <input
                                    type="text"
                                    defaultValue={retStr}
                                    key={`${code}-ret-${retStr}`}
                                    disabled={writing}
                                    onBlur={e => {
                                      if (retStr !== e.target.value.trim()) updateDinField(code, 'retardo', e.target.value);
                                    }}
                                    className="w-16 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] outline-none"
                                  />
                                ) : d.retardo_raw}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-slate-100">
                                {pitData ? (
                                  <select
                                    value={ACAO_OPTIONS.includes(d.acao) ? d.acao : 'NENHUM'}
                                    disabled={writing}
                                    onChange={e => updateDinField(code, 'acao', e.target.value)}
                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] outline-none"
                                  >
                                    {ACAO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : d.acao}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-slate-200">
                                {pitData ? (
                                  <select
                                    value={DIN_COMANDO_OPTIONS.includes(d.comando) ? d.comando : 'NENHUM'}
                                    disabled={writing}
                                    onChange={e => updateDinField(code, 'comando', e.target.value)}
                                    className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] outline-none"
                                  >
                                    {DIN_COMANDO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : d.comando}
                              </td>
                              <td className="py-1.5 px-2 font-mono text-emerald-400">
                                {pitData ? (
                                  <input
                                    type="text"
                                    defaultValue={pitRel === '—' ? '' : pitRel}
                                    placeholder="P.1, E1.1"
                                    key={`${code}-rel-${pitRel}`}
                                    disabled={writing}
                                    onBlur={e => {
                                      const cur = pitRel === '—' ? '' : pitRel;
                                      if (cur !== e.target.value.trim()) updateDinField(code, 'reles', e.target.value);
                                    }}
                                    className="w-24 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-[11px] outline-none"
                                  />
                                ) : pitRel}
                              </td>
                              {pitData && ugeD && (
                                <td className={`py-1.5 px-2 font-mono text-[11px] ${dinDiff ? 'text-red-400 font-bold' : 'text-emerald-400'}`}>
                                  {ugeD.sinotico} · {ugeD.tipo} · {ugeD.retardo_raw} · {ugeD.acao} · {ugeD.comando} · {ugeRel}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'relays' && (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-1.5 px-2">Status</th>
                        <th className="py-1.5 px-2">Descrição</th>
                        <th className="py-1.5 px-2">{pitData ? 'Relés (editável: P.1, E1.2, E2.1)' : 'Relés UGE'}</th>
                        {pitData && ugeSnap && <th className="py-1.5 px-2 text-cyan-400">Lido da UGE</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {Object.entries(pitData ? pitData.pit.saidas_rele : (ugeSnap?.saidas_rele || {})).map(([code, st]: [string, any]) => {
                        const rel = formatReles(st.reles);
                        const ugeSt = ugeSnap?.saidas_rele?.[code];
                        const ugeRel = ugeSt ? formatReles(ugeSt.reles) : '—';
                        const diff = Boolean(pitData && ugeSt && rel !== ugeRel);
                        return (
                          <tr key={code} className={`${rel === '—' && ugeRel === '—' ? 'opacity-65' : ''} ${diff ? 'bg-red-500/10' : ''}`}>
                            <td className="py-1.5 px-2 font-mono font-bold text-slate-300">{code}</td>
                            <td className="py-1.5 px-2 text-slate-200">{st.descricao}</td>
                            <td className="py-1.5 px-2 font-mono text-emerald-400">
                              {pitData ? (
                                <input
                                  type="text"
                                  defaultValue={rel === '—' ? '' : rel}
                                  placeholder="P.1, E1.2"
                                  key={`${code}-strel-${rel}`}
                                  disabled={writing}
                                  onBlur={e => {
                                    const cur = rel === '—' ? '' : rel;
                                    if (cur !== e.target.value.trim()) updateStatusRelay(code, e.target.value);
                                  }}
                                  className="w-32 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-xs outline-none"
                                />
                              ) : rel}
                            </td>
                            {pitData && ugeSnap && (
                              <td className={`py-1.5 px-2 font-mono ${diff ? 'text-red-400 font-bold' : 'text-cyan-300'}`}>
                                {ugeRel}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                {activeTab === 'can' && pitData && (
                  <div className="space-y-3 text-xs font-mono">
                    <div>
                      <div className="text-blue-400 font-bold mb-1">
                        FASE 1 — Parâmetros Base e Sensores ({pitData.can_plan.phase1_base.length} writes)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {pitData.can_plan.phase1_base.map((w, i) => {
                          const actual = ugeSnap?.raw[w.reg];
                          const match = actual !== undefined && (w.type === 'int32' ? (w.value >>> 0) === (actual >>> 0) : w.value === actual);
                          return (
                            <div
                              key={i}
                              className={`px-2 py-1 bg-slate-900 rounded border flex justify-between items-center gap-2 ${ugeSnap ? (actual === undefined ? 'border-slate-700' : match ? 'border-emerald-500/40' : 'border-red-500/60') : 'border-slate-800'
                                }`}
                            >
                              <span className="truncate" title={`REG ${w.reg} (${w.name})`}>
                                <span className="text-slate-100 font-sans font-semibold">{formatCanItemLabel(w, pitData.pit)}</span>
                                <span className="ml-1.5 text-[10px] text-slate-500">[REG {w.reg}]</span>
                              </span>
                              <span className="text-right shrink-0">
                                <span className="text-emerald-400">{w.value}</span>
                                {ugeSnap && (
                                  <span className={`ml-2 ${actual === undefined ? 'text-slate-500' : match ? 'text-cyan-400' : 'text-red-400 font-bold'}`}>
                                    [UGE: {actual ?? '?'}]
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300">
                      REBOOT — REINICIAR NORMAL DA UGE [REG {pitData.can_plan.reboot_cmd.reg}] = {pitData.can_plan.reboot_cmd.value} (RBT_Normal) + aguarda 5,5s
                    </div>
                    <div>
                      <div className="text-blue-400 font-bold mb-1">
                        FASE 2 — 6.1 Parâmetros, 6.2 Alarmes, 6.3 Entradas Digitais e 6.4 Relés ({pitData.can_plan.phase2_user.length} writes)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {pitData.can_plan.phase2_user.map((w, i) => {
                          const actual = ugeSnap?.raw[w.reg];
                          const match = actual !== undefined && (w.type === 'int32' ? (w.value >>> 0) === (actual >>> 0) : w.value === actual);
                          return (
                            <div
                              key={i}
                              className={`px-2 py-1 bg-slate-900 rounded border flex justify-between items-center gap-2 ${ugeSnap ? (actual === undefined ? 'border-slate-700' : match ? 'border-emerald-500/40' : 'border-red-500/60') : 'border-slate-800'
                                }`}
                            >
                              <span className="truncate" title={`REG ${w.reg} (${w.name})`}>
                                <span className="text-slate-100 font-sans font-semibold">{formatCanItemLabel(w, pitData.pit)}</span>
                                <span className="ml-1.5 text-[10px] text-slate-500">[REG {w.reg}]</span>
                              </span>
                              <span className="text-right shrink-0">
                                <span className="text-emerald-400">{w.value}</span>
                                {ugeSnap && (
                                  <span className={`ml-2 ${actual === undefined ? 'text-slate-500' : match ? 'text-cyan-400' : 'text-red-400 font-bold'}`}>
                                    [UGE: {actual ?? '?'}]
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
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
                      className={`h-full transition-all duration-200 ${writeDone === 'error'
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
                  <div
                    ref={logContainerRef}
                    className="max-h-28 overflow-auto bg-black/50 rounded p-2 font-mono text-[10px] text-slate-300 space-y-0.5"
                  >
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
            {writing || reading ? (
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
