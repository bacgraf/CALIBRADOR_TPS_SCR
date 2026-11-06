import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Cpu, Settings, RefreshCw, CheckCircle2, XCircle, CircuitBoard, Search, Wifi, Info, ShieldAlert, Zap, ClipboardList, LogOut, User, LogIn, Cloud, Clock, Download } from 'lucide-react';
import { dicionarioFalhas } from './lib/falhas';
import { useWebSocket } from './lib/useWebSocket';
import { useFlashController } from './lib/useFlashController';
import { GraphAuth } from './services/microsoftGraph/auth';
import { GraphExcel } from './services/microsoftGraph/excel';

const checkHealth = (rawVal: number | undefined, divisor: number, refVal: string, openLimit: number, openThreshold: number, isOff: boolean) => {
  if (isOff || rawVal === undefined || rawVal <= -32700) return false;
  const measured = Math.abs(rawVal / divisor);
  const ref = parseFloat(refVal) || 0;
  if (isNaN(ref) || ref <= openThreshold) {
    return measured > openLimit;
  } else {
    return Math.abs((rawVal / divisor) - ref) > ref * 0.10;
  }
};

const CircularGauge = ({ value, max, unit, isBad, isOff, formattedValue }: any) => {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  const safeValue = isOff || isNaN(value) ? 0 : Math.min(Math.max(value, 0), max);
  const percent = safeValue / max;
  const strokeDashoffset = circumference - percent * circumference;

  const colorClass = isOff ? 'text-slate-700' : isBad ? 'text-red-500' : 'text-emerald-400';
  const trackColor = 'text-slate-700';

  return (
    <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-2">
      <svg className="w-full h-full transform -rotate-90 drop-shadow-md" viewBox="0 0 100 100">
        <circle
          className={trackColor}
          strokeWidth="6"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="50"
          cy="50"
        />
        <circle
          className={`${colorClass} transition-all duration-500 ease-out`}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="50"
          cy="50"
          style={{ filter: isOff ? 'none' : `drop-shadow(0 0 6px currentColor)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className={`text-base font-mono font-bold ${isOff ? 'text-slate-500' : 'text-slate-100'}`}>
          {formattedValue}
        </span>
        <span className="text-[9px] text-slate-400 font-bold">{unit.trim()}</span>
      </div>
    </div>
  );
};

const SensorBlock = ({
  title, measureRaw, measureDivisor, unit, isOff, refValue, openLimit, openThreshold,
  onCalibrate, offsetRaw, onApplyOffset, onAutoOffset, gainRaw, onApplyGain, maxValue,
  precision = 2
}: any) => {
  const [offsetInput, setOffsetInput] = useState('');
  const [gainInput, setGainInput] = useState('');

  const numericMeasure = measureRaw !== undefined ? measureRaw / measureDivisor : 0;

  const refNumeric = parseFloat(refValue) || 0;
  const dynamicMax = refNumeric > 0 ? (refNumeric / 0.75) : maxValue;

  const measureFormatted = isOff || measureRaw === undefined || measureRaw <= -32700
    ? `---` : numericMeasure.toFixed(precision);

  const isBad = checkHealth(measureRaw, measureDivisor, refValue, openLimit, openThreshold, isOff);
  const offsetFormatted = isOff || offsetRaw === undefined || offsetRaw <= -32768
    ? "---" : (offsetRaw / 100).toFixed(2);
  const gainFormatted = isOff || gainRaw === undefined || gainRaw <= -32700
    ? "---%" : (gainRaw / 100 >= 0 ? "+" : "") + (gainRaw / 100).toFixed(2) + "%";

  return (
    <div className="p-2 border-b border-slate-700 last:border-0 flex flex-col">
      <h3 className="text-xs font-semibold text-slate-300 mb-2 text-center">{title}</h3>

      <CircularGauge
        value={numericMeasure}
        max={dynamicMax}
        unit={unit}
        isBad={isBad}
        isOff={isOff || measureRaw === undefined || measureRaw <= -32700}
        formattedValue={measureFormatted}
      />

      <button
        onClick={onCalibrate} disabled={isOff}
        className="px-3 py-1 mb-2 self-start bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        CALIBRAR
      </button>

      <div className="w-full space-y-1">
        {onApplyOffset && (
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-400 w-10">Offset:</label>
            <input
              type="number" value={offsetInput} onChange={e => setOffsetInput(e.target.value)} disabled={isOff}
              className="w-16 px-1 py-1 text-xs font-mono bg-slate-900 border border-slate-600 rounded focus:ring-1 focus:ring-blue-500 outline-none text-slate-200"
            />
            <button
              onClick={() => { onApplyOffset(parseFloat(offsetInput)); setOffsetInput(''); }} disabled={isOff || !offsetInput}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
            >
              Aplicar
            </button>
            <button
              onClick={onAutoOffset} disabled={isOff}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
            >
              AUTO
            </button>
            <span className="ml-auto text-xs font-mono font-bold text-orange-400">{offsetFormatted}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-400 w-10">Ganho:</label>
          <input
            type="number" step="0.0001" value={gainInput} onChange={e => setGainInput(e.target.value)} disabled={isOff}
            className="w-16 px-1 py-1 text-xs font-mono bg-slate-900 border border-slate-600 rounded focus:ring-1 focus:ring-blue-500 outline-none text-slate-200"
          />
          <button
            onClick={() => { onApplyGain(parseFloat(gainInput)); setGainInput(''); }} disabled={isOff || !gainInput}
            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
          >
            Aplicar
          </button>
          <span className="ml-auto text-xs font-mono font-bold text-orange-400">{gainFormatted}</span>
        </div>
      </div>
    </div>
  );
};

const SelectionScreen = ({ onSelect, onOpenWifi, systemTime }: { onSelect: (mode: 'tps' | 'scr') => void, onOpenWifi: () => void, systemTime: string }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 rounded-full blur-[120px]" />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-1.5 bg-slate-900/70 border border-slate-700/80 rounded-full text-slate-200 shadow-lg backdrop-blur-md">
        <Clock size={14} className="text-blue-400" />
        <span className="text-sm font-mono font-bold tracking-wider">{systemTime}</span>
      </div>

      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={onOpenWifi}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all shadow-lg backdrop-blur-md"
        >
          <Wifi size={18} className="text-blue-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Configurar Rede</span>
        </button>
      </div>

      <div className="z-10 text-center mb-12">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-blue-600/20 rounded-2xl border border-blue-500/30">
            <Activity className="w-10 h-10 text-blue-400" />
          </div>
        </div>
        <h1 className="text-4xl font-black tracking-tighter text-white mb-2">CALIBRADOR <span className="text-blue-500">TEKSEA</span></h1>
        <p className="text-slate-400 font-medium">Selecione o produto para calibrar</p>
      </div>

      <div className="z-10 grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl px-4">
        {/* CARD TPS */}
        <button
          onClick={() => onSelect('tps')}
          className="group relative bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 p-8 rounded-3xl text-left transition-all duration-500 hover:border-blue-500/50 hover:bg-slate-800/60 hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]"
        >
          <div className="mb-6 w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform shadow-inner group-hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]">
            <Cpu className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">TPS125</h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">Módulo de Retificador Chaveado para sistemas de Corrente Contínua.</p>
          <div className="flex items-center text-xs font-bold text-blue-400 gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            INICIAR CALIBRAÇÃO <RefreshCw className="w-3 h-3" />
          </div>
        </button>

        {/* CARD SCR */}
        <button
          onClick={() => onSelect('scr')}
          className="group relative bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 p-8 rounded-3xl text-left transition-all duration-500 hover:border-emerald-500/50 hover:bg-slate-800/60 hover:shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]"
        >
          <div className="mb-6 w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform shadow-inner group-hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]">
            <CircuitBoard className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">SCR</h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">Módulo de Retificador Tiristorizado para altas potências e controle de carga.</p>
          <div className="flex items-center text-xs font-bold text-emerald-400 gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            INICIAR CALIBRAÇÃO <RefreshCw className="w-3 h-3" />
          </div>
        </button>
      </div>

      <div className="mt-16 text-[10px] font-mono text-slate-600 uppercase tracking-widest">
        Teksea - 2026 • v2.0.0
      </div>
    </div>
  );
};

const LoteModal = React.memo(({ onClose, ugeVers, appMode, scrSubMode }: any) => {
  const [snStart, setSnStart] = useState('');
  const [snEnd, setSnEnd] = useState('');
  const [client, setClient] = useState('');
  const [op, setOp] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [msAccount, setMsAccount] = useState<any>(null);
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [isWaitingLogin, setIsWaitingLogin] = useState(false);
  const [loteStatus, setLoteStatus] = useState<{ msg: string; type: 'error' | 'success' | 'info' | null }>({ msg: '', type: null });

  useEffect(() => {
    // Polling de Status do Python Bridge
    const interval = setInterval(() => {
      fetch('http://127.0.0.1:8760/sys/status')
        .then(res => res.json())
        .then(data => {
            if (data.ms_logged_in) {
                setMsAccount({ name: data.ms_username });
            } else {
                setMsAccount(null);
            }
        })
        .catch(() => setMsAccount(null));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleMicrosoftLogin = async () => {
    setIsWaitingLogin(true);
    setDeviceCodeInfo(null);
    try {
        const res = await fetch('http://127.0.0.1:8760/cloud/devicecode');
        const codeData = await res.json();
        if (codeData.error) throw new Error(codeData.error);
        
        setDeviceCodeInfo({ userCode: codeData.user_code, verificationUri: codeData.verification_uri });

        // Chama a rota de token (o Python vai ficar em aguardo até o usuário terminar no celular/navegador)
        fetch('http://127.0.0.1:8760/cloud/token', { method: 'POST' })
            .then(tokenRes => tokenRes.json())
            .then(tokenData => {
                if (tokenData.success) {
                    setMsAccount({ name: tokenData.username });
                } else {
                    alert("Erro na autenticação: " + tokenData.error);
                }
            })
            .finally(() => {
                setDeviceCodeInfo(null);
                setIsWaitingLogin(false);
            });

    } catch (err) {
        alert("Erro ao conectar ao Bridge Python: " + err);
        setIsWaitingLogin(false);
    }
  };

  const handleMicrosoftLogout = () => {
    fetch('http://127.0.0.1:8760/cloud/logout').catch(() => {});
    setMsAccount(null);
    setDeviceCodeInfo(null);
    setIsWaitingLogin(false);
  };

  const handleGenerate = async () => {
    const start = parseInt(snStart);
    const end = parseInt(snEnd);
    if (isNaN(start) || isNaN(end) || start > end || !client || !op) {
      alert("Preencha todos os campos corretamente.");
      return;
    }

    setIsUpdating(true);

    let productName = 'TPS-125';
    if (appMode === 'scr') {
      productName = scrSubMode === '6' ? 'SCR 6P' : 'SCR 12P';
    }

    // Dados conforme a estrutura de 7 colunas
    const today = new Date().toLocaleDateString('pt-BR');
    const obs = `${today} ${client.toUpperCase()} ${op.toUpperCase()}`;
    const fw = ugeVers || '---';

    const rows = [];
    for (let sn = start; sn <= end; sn++) {
      rows.push([
        sn.toString(),
        fw,
        "PCB-01113-06",
        "PCB-01083-03",
        obs,
        productName,
        "10k"
      ]);
    }

    // Gravação via Logger Local (Python Bridge para a Nuvem)
    fetch('http://127.0.0.1:8760/cloud/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows })
    })
    .then(res => res.json())
    .then(data => {
      setIsUpdating(false);
      if (data.success) {
        setLoteStatus({ msg: "✅ Lote salvo com sucesso na Nuvem!", type: 'success' });
      } else {
        setLoteStatus({ msg: "❌ Erro: " + data.error, type: 'error' });
      }
    })
    .catch((err) => {
      setIsUpdating(false);
      setLoteStatus({ msg: "❌ Bridge offline ou bloqueado.", type: 'error' });
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-bold text-slate-200">Gerenciar Lote de Produção</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-[10px] text-slate-400 font-bold mb-1 block uppercase tracking-wider">SN Inicial</label>
              <input type="number" value={snStart} onChange={e => setSnStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm focus:border-blue-500 outline-none text-white" placeholder="Ex: 52563" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-slate-400 font-bold mb-1 block uppercase tracking-wider">SN Final</label>
              <input type="number" value={snEnd} onChange={e => setSnEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm focus:border-blue-500 outline-none text-white" placeholder="Ex: 52581" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold mb-1 block uppercase tracking-wider">Cliente</label>
            <input type="text" value={client} onChange={e => setClient(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm focus:border-blue-500 outline-none text-white" placeholder="Ex: TEKSEA ESTOQUE" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 font-bold mb-1 block uppercase tracking-wider">Ordem de Produção (OP)</label>
            <input type="text" value={op} onChange={e => setOp(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm focus:border-blue-500 outline-none text-white" placeholder="Ex: OP-969" />
          </div>

          <div className="p-3 bg-slate-950/50 border border-slate-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] text-slate-500 font-bold uppercase">Cloud / Bridge Python</label>
              {msAccount ? (
                <button onClick={handleMicrosoftLogout} className="text-[10px] text-red-400 font-bold flex items-center gap-1 hover:underline">
                    <LogOut size={12} /> SAIR
                </button>
              ) : isWaitingLogin ? (
                <button onClick={handleMicrosoftLogout} className="text-[10px] text-slate-400 font-bold flex items-center gap-1 hover:underline">
                    Cancelar
                </button>
              ) : (
                <button onClick={handleMicrosoftLogin} className="text-[10px] text-blue-400 font-bold flex items-center gap-1 hover:underline">
                    <LogIn size={12} /> ENTRAR
                </button>
              )}
            </div>
            
            {msAccount ? (
                <div className="flex items-center gap-2 p-2 bg-blue-600/10 border border-blue-500/30 rounded">
                    <Cloud className="w-4 h-4 text-blue-400" />
                    <div className="flex flex-col">
                        <span className="text-[11px] text-slate-200 font-bold">{msAccount.name}</span>
                        <span className="text-[9px] text-slate-400">Bridge Autenticado (SharePoint 106FAB)</span>
                    </div>
                </div>
            ) : deviceCodeInfo ? (
                <div className="flex flex-col gap-2 p-2 bg-amber-900/20 border border-amber-500/40 rounded">
                    <p className="text-[10px] text-amber-300 font-bold">1. Acesse em qualquer dispositivo:</p>
                    <a 
                      href={deviceCodeInfo.verificationUri} 
                      target="_blank" 
                      rel="noreferrer"
                      onClick={(e) => {
                        e.preventDefault();
                        window.open(deviceCodeInfo.verificationUri, 'mslogin', 'width=500,height=600,left=100,top=100');
                      }}
                      className="text-[11px] text-blue-400 underline font-mono hover:text-blue-300"
                    >
                      {deviceCodeInfo.verificationUri}
                    </a>
                    <p className="text-[10px] text-amber-300 font-bold mt-1">2. Digite o código:</p>
                    <div className="text-center py-2 bg-slate-950 rounded border border-slate-600">
                        <span className="text-2xl font-mono font-black tracking-[0.3em] text-white">{deviceCodeInfo.userCode}</span>
                    </div>
                    <p className="text-[9px] text-slate-500 text-center animate-pulse">Aguardando você logar no navegador...</p>
                </div>
            ) : (
                <div className="text-[11px] text-slate-500 italic">Faça login para gravar na nuvem via Python.</div>
            )}
          </div>

          <div className="p-3 bg-blue-900/10 border border-blue-500/20 rounded-lg text-xs text-blue-200 text-center">
            Versão Firmware: <b>{ugeVers || 'Aguardando telemetria...'}</b>
          </div>
        </div>

        {/* Status Feedback */}
        {loteStatus.type && (
          <div className={`px-4 py-2 text-center text-[11px] font-bold animate-in fade-in slide-in-from-top-1 ${
            loteStatus.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {loteStatus.msg}
          </div>
        )}

        <div className="px-4 py-3 bg-slate-800/50 border-t border-slate-700 flex justify-end gap-2">
          <button 
            onClick={() => { setLoteStatus({ msg: '', type: null }); onClose(); }} 
            disabled={isUpdating}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            CANCELAR
          </button>
          <button
            onClick={loteStatus.type === 'success' ? () => { setLoteStatus({ msg: '', type: null }); onClose(); } : handleGenerate}
            disabled={isUpdating}
            className={`px-4 py-2 rounded text-xs font-bold transition-all shadow ${
              isUpdating ? 'bg-slate-700 text-slate-400 cursor-not-allowed' :
              loteStatus.type === 'success' ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/50' :
              'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/50'
            }`}
          >
            {isUpdating ? 'GRAVANDO...' : loteStatus.type === 'success' ? 'CONCLUÍDO' : 'ATUALIZAR EXCEL'}
          </button>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // Evita re-render se os dados de telemetria mudarem, mas as informações do lote não
  return prev.ugeVers === next.ugeVers &&
    prev.appMode === next.appMode &&
    prev.scrSubMode === next.scrSubMode;
});


export default function App() {
  const [bridgeAlive, setBridgeAlive] = useState(false);
  const [bridgeStarting, setBridgeStarting] = useState(false);
  const [bridgeInstallNeeded, setBridgeInstallNeeded] = useState(false);
  const bridgeAutoStarted = useRef(false);
  const bridgeStartTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [bridgePaths, setBridgePaths] = useState({ tps: '', scr: '' });
  const [rebootTarget, setRebootTarget] = useState<number | null>(null);
  const [systemTime, setSystemTime] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setSystemTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const triggerBridgeStart = useCallback(() => {
    setBridgeStarting(true);
    if (bridgeStartTimeout.current) clearTimeout(bridgeStartTimeout.current);
    try {
      window.location.href = 'teksea://start';
    } catch {
      // Ignora falha de protocolo não registrado
    }
    bridgeStartTimeout.current = setTimeout(() => {
      setBridgeStarting(false);
      setBridgeInstallNeeded(true);
    }, 6000);
  }, []);

  // Polling global para status do Bridge e Nuvem (com tentativa automática de abertura no carregamento)
  useEffect(() => {
    const checkStatus = () => {
      fetch('http://127.0.0.1:8760/sys/status')
        .then(res => res.json())
        .then(data => {
          setBridgeAlive(Boolean(data.bridge_alive));
          if (data.bridge_alive) {
            setBridgeStarting(false);
            setBridgeInstallNeeded(false);
            if (bridgeStartTimeout.current) {
              clearTimeout(bridgeStartTimeout.current);
              bridgeStartTimeout.current = null;
            }
          }
          setCloudUser(data.ms_logged_in ? data.ms_username : null);
          setBridgePaths({ tps: data.tps_root, scr: data.scr_root });
        })
        .catch(() => {
          setBridgeAlive(false);
          setCloudUser(null);
          if (!bridgeAutoStarted.current) {
            bridgeAutoStarted.current = true;
            triggerBridgeStart();
          }
        });
    };
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => {
      clearInterval(interval);
      if (bridgeStartTimeout.current) clearTimeout(bridgeStartTimeout.current);
    };
  }, [triggerBridgeStart]);
  const [appMode, setAppMode] = useState<'selection' | 'tps' | 'scr'>(() => {
    return (localStorage.getItem('calibrador_mode') as 'tps' | 'scr') || 'selection';
  });

  // Atualiza o título da aba do navegador dinamicamente
  useEffect(() => {
    if (appMode === 'selection') {
      document.title = "CALIBRADOR TEKSEA";
    } else {
      document.title = `CALIBRADOR TEKSEA | ${appMode.toUpperCase()}`;
    }
  }, [appMode]);

  const [isRevealing, setIsRevealing] = useState(false);

  const handleSelectMode = (mode: 'tps' | 'scr' | 'selection') => {
    if (mode === 'selection') {
      setAppMode('selection');
      localStorage.removeItem('calibrador_mode');
      return;
    }
    // Muda o modo IMEDIATAMENTE para o dashboard renderizar por baixo
    setAppMode(mode);
    localStorage.setItem('calibrador_mode', mode);
    // Depois exibe o overlay que vai saindo, revelando o dashboard
    setIsRevealing(true);
    setTimeout(() => setIsRevealing(false), 1300);
  };

  const wsUrl = `ws://${window.location.hostname}/ws`;
  const { data, connected, send, request } = useWebSocket(wsUrl);

  const [refVcc, setRefVcc] = useState('125.00');
  const [refIcc, setRefIcc] = useState('60.00');
  const [refVca, setRefVca] = useState('234.2');
  const [refIca, setRefIca] = useState('250.00');
  const [snInput, setSnInput] = useState('');

  const [scaType, setScaType] = useState<number>(1);
  const [scaRes, setScaRes] = useState<string>('');
  const [scrSubMode, setScrSubMode] = useState<'6' | '12'>(() => {
    return (localStorage.getItem('scr_sub_mode') as '6' | '12') || '12';
  });

  const [fwPath, setFwPath] = useState<string>('');

  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showFaultTooltip, setShowFaultTooltip] = useState(false);

  const handleSelectSubMode = (mode: '6' | '12') => {
    setScrSubMode(mode);
    localStorage.setItem('scr_sub_mode', mode);
  };

  // Atualiza apenas o tipo automaticamente
  useEffect(() => {
    if (data.rca_t !== undefined) setScaType(data.rca_t);
  }, [data.rca_t]);

  const [showEepromModal, setShowEepromModal] = useState(false);
  const [showFlashModal, setShowFlashModal] = useState(false);
  const [showWifiModal, setShowWifiModal] = useState(false);
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [wifiConfig, setWifiConfig] = useState({ ssid: '', pass: '', ip: '', gw: '', mask: '', dhcp: true });
  const [isScanning, setIsScanning] = useState(false);

  const handleCloseLoteModal = useCallback(() => setShowLoteModal(false), []);

  // Clear scan results when modal closes
  useEffect(() => {
    if (!showWifiModal) {
      setIsScanning(false);
      // We don't strictly need to clear data.list here as it's just a state merge
    }
  }, [showWifiModal]);

  // Carrega as configurações atuais para o buffer local APENAS quando o modal abre ou se ele estiver fechado
  useEffect(() => {
    if (data.net) {
      if (!showWifiModal) {
        setWifiConfig(prev => ({
          ...prev,
          ssid: data.net.ssid || prev.ssid,
          ip: data.net.ip_s || prev.ip,
          gw: data.net.gw || prev.gw,
          mask: data.net.mask || prev.mask,
          dhcp: data.net.dhcp !== undefined ? data.net.dhcp : prev.dhcp
        }));
      }
    }
  }, [data.net, showWifiModal]);

  useEffect(() => {
    if (data.type === 'scan_res') {
      setIsScanning(false);
    }
  }, [data.type]);

  const [wifiSaving, setWifiSaving] = useState(false);
  const [wifiMessage, setWifiMessage] = useState('');
  const saveWifi = async () => {
    if (wifiSaving) return;
    setWifiSaving(true);
    setWifiMessage('');
    try {
      const result = await request({ command: 'save_wifi', ...wifiConfig });
      setWifiMessage(result.message);
    } catch (error) {
      setWifiMessage(error instanceof Error ? error.message : 'Falha ao salvar configuração.');
    } finally { setWifiSaving(false); }
  };

  const { operation: flashOperation, notice: flashNotice, isFlashing, canStart: canStartFlash,
    start: startFlash, cancel: cancelFlash, openBridge, openingBridge } = useFlashController(showFlashModal);
  const flashProgress = flashOperation.progress;
  const flashStatus = flashOperation.error ? flashOperation.status + ': ' + flashOperation.error : flashOperation.status;
  const flashLog = flashOperation.log;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [flashLog]);
  const [fwAvailable, setFwAvailable] = useState({ jiga: true, burnin: true, cliente: true });

  const applyMask = (value: string, decimals: number, setter: (v: string) => void) => {
    const raw = value.replace(/\D/g, '');
    if (!raw) { setter(''); return; }
    const num = parseInt(raw, 10);
    setter((num / Math.pow(10, decimals)).toFixed(decimals));
  };

  const isOff = !connected || !data.uge_ok;

  const writeReg = useCallback((reg: number, format: number, val: number) => {
    if (!connected || isNaN(val)) return;
    const finalVal = (format === 4 || format === 5 || reg === 426) ? val : Math.round(val * 100);
    send({ command: "write_reg", reg, format, value: finalVal });
  }, [connected, send]);

  const calibrateGain = useCallback((sensor: string, refValStr: string) => {
    if (!data || !connected || !data.uge_ok) return;
    const refVal = parseFloat(refValStr);
    if (isNaN(refVal)) return;

    const map: Record<string, any> = {
      'vret': { reg: 132, g: 'gv1', r: 'vret', d: 100 },
      'vcc2': { reg: 134, g: 'gv2', r: 'vbat', d: 100 },
      'vcons': { reg: 136, g: 'gvc', r: 'vcons', d: 100 },
      'iret': { reg: 138, g: 'gi1', r: 'iret', d: 100 },
      'iret2': { reg: 140, g: 'gi2', r: 'iret2', d: 100 },
      'ibat': { reg: 142, g: 'gib', r: 'ibat', d: 100 },
      'vca_rs': { reg: 144, g: 'gvrs', r: 'vrs', d: 10 },
      'vca_st': { reg: 145, g: 'gvst', r: 'vst', d: 10 },
      'vca_t': { reg: 148, g: 'gvt', r: 'vt', d: 10 },
      'ica_r': { reg: 146, g: 'gir', r: 'ir', d: 100 },
      'ica_s': { reg: 149, g: 'gis', r: 'is', d: 100 },
      'ica_t': { reg: 147, g: 'git', r: 'it', d: 100 }
    };
    const cfg = map[sensor];
    if (!cfg) return;
    const dev_raw = data[cfg.g];
    const read_raw = data[cfg.r];

    if (read_raw !== undefined && Math.abs(read_raw) > 1 && read_raw > -32700) {
      const currentGain = 1.0 + (dev_raw * 0.0001);
      const currentRead = read_raw / cfg.d;
      const newGain = currentGain * (refVal / currentRead);
      const newDeviation = Math.round((newGain - 1.0) * 10000);
      send({ command: "write_reg", reg: cfg.reg, format: 2, value: newDeviation });
    }
  }, [data, connected, send]);

  const autoAdjust = useCallback((sensor: string) => {
    if (!data || !connected || !data.uge_ok) return;
    let reg, val;
    if (sensor === 'vret') { reg = 133; val = (data.ov1 || 0) - (data.vret); }
    else if (sensor === 'vcc2') { reg = 135; val = (data.ov2 || 0) - (data.vbat); }
    else if (sensor === 'vcons') { reg = 137; val = (data.ovc || 0) - (data.vcons); }
    else if (sensor === 'iret') { reg = 139; val = (data.oi1 || 0) - (data.iret); }
    else if (sensor === 'iret2') { reg = 141; val = (data.oi2 || 0) - (data.iret2); }
    else if (sensor === 'ibat') { reg = 143; val = (data.oib || 0) - (data.ibat); }
    if (reg !== undefined) {
      send({ command: "write_reg", reg, format: 2, value: Math.round(val) });
    }
  }, [data, connected, send]);

  const calibrateGroup = useCallback((group: string) => {
    const groups: Record<string, any[]> = {
      'vcc': appMode === 'tps'
        ? [{ s: 'vret', r: refVcc }, { s: 'vcons', r: refVcc }]
        : [{ s: 'vret', r: refVcc }, { s: 'vcc2', r: refVcc }, { s: 'vcons', r: refVcc }],
      'icc': appMode === 'tps'
        ? [{ s: 'iret', r: refIcc }, { s: 'ibat', r: refIcc }]
        : (scrSubMode === '12'
          ? [{ s: 'iret', r: refIcc }, { s: 'iret2', r: refIcc }, { s: 'ibat', r: refIcc }]
          : [{ s: 'iret', r: refIcc }, { s: 'ibat', r: refIcc }]),
      'vca': appMode === 'tps'
        ? [{ s: 'vca_rs', r: refVca }, { s: 'vca_st', r: refVca }, { s: 'vca_t', r: refVca }]
        : [{ s: 'vca_rs', r: refVca }, { s: 'vca_st', r: refVca }],
      'ica': appMode === 'tps'
        ? [{ s: 'ica_r', r: refIca }, { s: 'ica_s', r: refIca }, { s: 'ica_t', r: refIca }]
        : [{ s: 'ica_r', r: refIca }, { s: 'ica_t', r: refIca }]
    };
    const seq = groups[group];
    if (!seq) return;
    seq.forEach((it, i) => setTimeout(() => calibrateGain(it.s, it.r), i * 500));
  }, [appMode, scrSubMode, refVcc, refIcc, refVca, refIca, calibrateGain]);

  const calibrateAll = useCallback(() => {
    const sequence = appMode === 'tps' ? [
      { s: 'vret', r: refVcc }, { s: 'vcons', r: refVcc }, { s: 'iret', r: refIcc }, { s: 'ibat', r: refIcc },
      { s: 'vca_rs', r: refVca }, { s: 'vca_st', r: refVca }, { s: 'vca_t', r: refVca },
      { s: 'ica_r', r: refIca }, { s: 'ica_s', r: refIca }, { s: 'ica_t', r: refIca }
    ] : [
      { s: 'vret', r: refVcc }, { s: 'vcc2', r: refVcc }, { s: 'vcons', r: refVcc },
      { s: 'iret', r: refIcc },
      ...(scrSubMode === '12' ? [{ s: 'iret2', r: refIcc }] : []),
      { s: 'ibat', r: refIcc },
      { s: 'vca_rs', r: refVca }, { s: 'vca_st', r: refVca },
      { s: 'ica_r', r: refIca }, { s: 'ica_t', r: refIca }
    ];
    sequence.forEach((it, i) => setTimeout(() => calibrateGain(it.s, it.r), i * 500));
  }, [appMode, scrSubMode, refVcc, refIcc, refVca, refIca, calibrateGain]);

  const autoAdjustAll = useCallback(() => {
    const list = appMode === 'tps'
      ? ['vret', 'vcons', 'iret', 'ibat']
      : ['vret', 'vcc2', 'vcons', 'iret', ...(scrSubMode === '12' ? ['iret2'] : []), 'ibat'];
    list.forEach((s, i) => setTimeout(() => autoAdjust(s), i * 500));
  }, [appMode, scrSubMode, autoAdjust]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); calibrateAll(); }
      if (e.key === 'F4') { e.preventDefault(); autoAdjustAll(); }
      if (e.key === 'Escape') {
        if (!isFlashing) setShowFlashModal(false);
        setShowEepromModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlashing, calibrateAll, autoAdjustAll]);

  // --- HEARTBEAT GLOBAL: mantém o Teksea Bridge vivo enquanto a aba está aberta ---
  useEffect(() => {
    const beat = setInterval(() => {
      fetch('http://127.0.0.1:8760/sys/heartbeat').catch(() => {});
    }, 5000);
    return () => clearInterval(beat);
  }, []);

  useEffect(() => {
    setFwAvailable({ jiga: false, burnin: false, cliente: false });
    if (!showFlashModal || !canStartFlash) return;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 4000);
    fetch('http://127.0.0.1:8760/tms/check', { signal: abort.signal, cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('Falha ao consultar firmwares');
        return res.json();
      })
      .then(d => {
        if (!abort.signal.aborted) setFwAvailable({ jiga: d.jiga === true, burnin: d.burnin === true, cliente: d.cliente === true });
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { abort.abort(); clearTimeout(timer); };
  }, [showFlashModal, canStartFlash, appMode]);



  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFlashing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFlashing]);

  // O caminho da pasta agora é gerenciado globalmente pelo bridgePaths no heartbeat

  const handleFlash = (type: string) => { void startFlash(appMode, type); };

  const setupFlashPaths = () => {
    window.location.href = `teksea://tms/setup/${appMode}`;
  };

  const [serialMessage, setSerialMessage] = useState('');
  const [serialPending, setSerialPending] = useState(false);
  const serialRequest = useRef<{ id: string; value: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => { if (serialRequest.current) clearTimeout(serialRequest.current.timer); }, []);
  useEffect(() => {
    const pending = serialRequest.current;
    const result = data.serial;
    if (!pending || !result || result.request_id !== pending.id || result.busy) return;
    clearTimeout(pending.timer);
    serialRequest.current = null;
    setSerialPending(false);
    setSerialMessage(result.message || 'Operação encerrada.');
    if (result.success && result.cpu_ok && result.uge_ok && result.value === pending.value) {
      setSnInput(pending.value < 4294967295 ? String(pending.value + 1) : '');
    }
  }, [data.serial]);
  const syncSerialNumber = async () => {
    const value = Number(snInput);
    if (!connected || !data.uge_ok || serialRequest.current || data.serial?.busy) return;
    if (!snInput || !Number.isInteger(value) || value < 0 || value > 4294967295) {
      setSerialMessage('Informe um inteiro de 0 a 4294967295.');
      return;
    }
    const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      if (serialRequest.current?.id !== id) return;
      serialRequest.current = null;
      setSerialPending(false);
      setSerialMessage('Sem resultado final. Confira CPU e UGE antes de repetir; número não incrementado.');
    }, 10000);
    serialRequest.current = { id, value, timer };
    setSerialPending(true);
    setSerialMessage('Aguardando confirmação da CPU e da UGE...');
    try { await request({ command: 'sync_serial', request_id: id, value }); }
    catch (error) {
      // Uma resposta perdida não significa que a escrita foi recusada.
      if (serialRequest.current?.id === id)
        setSerialMessage(error instanceof Error ? error.message : 'Sem confirmação inicial.');
    }
  };

  const sendReboot = (code: number) => {
    if (!connected) return;
    send({ command: "write_reg", reg: 426, format: 2, value: code });
    setRebootTarget(null);
    setShowEepromModal(false);
  };

  const isDinActive = (bit: number) => {
    if (isOff || data.din === undefined) return false;
    return (data.din & (1 << bit)) !== 0;
  };

  const sn = (v: any) => (isOff || v === undefined || v === 2147483648) ? "-------" : v;

  let diagText = "---";
  let diagColor = "text-slate-500";
  let diagDesc = "";
  let diagTooltip = "";

  let DiagIcon = Info;
  if (!isOff && data.err_cod !== undefined) {
    const fwInfo = `FW: ${data.uge_vers || "---"} | B: ${data.uge_build || "---"}`;
    if (data.err_cod === 32768 || data.err_cod === -32768) {
      diagText = "SISTEMA OK";
      diagColor = "text-emerald-400";
      diagDesc = fwInfo;
      diagTooltip = "Sistema operando normalmente.";
      DiagIcon = Info;
    } else {
      const info = dicionarioFalhas[data.err_cod] || { nome: "DESCONHECIDO", desc: "Erro nao mapeado em base." };
      const txtFalha = info.nome;
      const txtDesc = info.desc;
      const extVal = data.err_ext || 0;
      const txtExt = (info.exts && info.exts[extVal]) ? info.exts[extVal] : `Cod. Ext: ${extVal}`;

      diagText = `[${data.err_cod}-${extVal}] ${txtFalha}`;
      diagColor = "text-red-500";
      diagDesc = fwInfo;
      diagTooltip = `Falha: ${txtFalha}\nDescrição: ${txtDesc}\nDetalhe: ${txtExt}`;
      DiagIcon = ShieldAlert;
    }
  }

  return (
    <>
      <style>{`
        @keyframes scan-move {
          0%   { left: -4%; }
          100% { left: 104%; }
        }
        @keyframes scan-reveal {
          0%   { clip-path: inset(0 0% 0 0); }
          100% { clip-path: inset(0 100% 0 0); }
        }
        .scan-reveal-overlay {
          animation: scan-reveal 1.2s cubic-bezier(0.77,0,0.18,1) forwards;
        }
        .scan-beam {
          animation: scan-move 1.2s cubic-bezier(0.77,0,0.18,1) forwards;
        }
      `}</style>

      {showLoteModal && <LoteModal onClose={handleCloseLoteModal} ugeVers={data.uge_vers} appMode={appMode} scrSubMode={scrSubMode} />}

      {appMode === 'selection' ? (
        <SelectionScreen onSelect={handleSelectMode} onOpenWifi={() => setShowWifiModal(true)} systemTime={systemTime} />
      ) : (
        <div className="h-screen bg-slate-950 flex flex-col font-sans text-slate-200 overflow-hidden">
          <header className="relative bg-slate-900 border-b border-slate-800 px-4 py-2 flex justify-between items-center shadow-md z-10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {appMode === 'tps' ? (
                  <Cpu className="text-blue-500 w-5 h-5" />
                ) : (
                  <CircuitBoard className="text-emerald-500 w-5 h-5" />
                )}
                <h1 className="text-base font-bold tracking-wider text-slate-100">CALIBRADOR {appMode.toUpperCase()}</h1>
                <button
                  onClick={() => setShowLoteModal(true)}
                  className="ml-4 px-3 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <ClipboardList className="w-4 h-4" /> LOTE
                </button>
              </div>
              <button
                onClick={() => handleSelectMode('selection')}
                className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors uppercase font-bold"
              >
                Trocar Produto
              </button>

              {appMode === 'scr' && (
                <div className="flex bg-slate-800/50 p-1 rounded-lg border border-slate-700 mx-2">
                  <button
                    onClick={() => handleSelectSubMode('6')}
                    className={`px-3 py-1 text-[9px] font-bold rounded transition-all ${scrSubMode === '6' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    6 PULSOS
                  </button>
                  <button
                    onClick={() => handleSelectSubMode('12')}
                    className={`px-3 py-1 text-[9px] font-bold rounded transition-all ${scrSubMode === '12' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    12 PULSOS
                  </button>
                </div>
              )}
            </div>

            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-800/70 border border-slate-700 rounded-full text-slate-200 shadow-inner absolute left-1/2 -translate-x-1/2">
              <Clock size={14} className="text-blue-400" />
              <span className="text-sm font-mono font-bold tracking-wider">{systemTime}</span>
            </div>

            <div className="flex items-center gap-3">
              <div className={`px-3 py-1 rounded-full text-xs font-bold border ${connected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                REDE: {connected ? 'OK' : 'OFF'}
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold border ${data.uge_ok ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-red-500/10 text-red-400 border-red-500/30'}`}>
                UGE: {data.uge_ok ? 'LINK OK' : 'OFF'}
              </div>
              {bridgeAlive ? (
                <div className="px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  BRIDGE: OK
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={triggerBridgeStart}
                    title="Clique para tentar iniciar o TEKSEA Bridge"
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                      bridgeStarting
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                        : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30'
                    }`}
                  >
                    BRIDGE: {bridgeStarting ? 'INICIANDO...' : 'OFF'}
                  </button>
                  {bridgeInstallNeeded && (
                    <a
                      href="/instalar_bridge.bat"
                      download="instalar_bridge.bat"
                      title="O Bridge não respondeu. Clique para baixar o instalador."
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/50 flex items-center gap-1 shadow transition-colors"
                    >
                      <Download size={12} /> INSTALAR BRIDGE
                    </a>
                  )}
                </div>
              )}
              <div className={`px-3 py-1 rounded-full text-xs font-bold border ${cloudUser ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                NUVEM: {cloudUser ? cloudUser.toUpperCase() : 'OFF'}
              </div>
              <img src="/Teksea.png" alt="Teksea" className="h-6 ml-2 brightness-0 invert opacity-80" />
            </div>
          </header>

          <main className="flex-1 p-2 flex flex-col gap-2 overflow-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">

              {/* COLUNA 1: TENSÕES CC */}
              <div className="flex flex-col bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                <div className="bg-slate-900 text-slate-300 text-[10px] font-bold px-3 py-2 uppercase tracking-wider border-b border-slate-700">Tensões CC</div>
                <div className="flex-1">
                  <SensorBlock
                    title={appMode === 'tps' ? "Tensão Retificador" : "Tensão Vcc 1"}
                    measureRaw={data.vret} measureDivisor={100} unit=" V" maxValue={150}
                    isOff={isOff} refValue={refVcc} openLimit={5} openThreshold={10}
                    onCalibrate={() => calibrateGain('vret', refVcc)}
                    offsetRaw={data.ov1} onApplyOffset={(val: number) => writeReg(133, 2, val)} onAutoOffset={() => autoAdjust('vret')}
                    gainRaw={data.gv1} onApplyGain={(val: number) => writeReg(132, 5, val)}
                  />
                  {appMode === 'scr' && (
                    <SensorBlock
                      title="Tensão Vcc 2" measureRaw={data.vbat} measureDivisor={100} unit=" V" maxValue={150}
                      isOff={isOff} refValue={refVcc} openLimit={5} openThreshold={10}
                      onCalibrate={() => calibrateGain('vcc2', refVcc)}
                      offsetRaw={data.ov2} onApplyOffset={(val: number) => writeReg(135, 2, val)} onAutoOffset={() => autoAdjust('vcc2')}
                      gainRaw={data.gv2} onApplyGain={(val: number) => writeReg(134, 5, val)}
                    />
                  )}
                  <SensorBlock
                    title={appMode === 'tps' ? "Tensão Consumidor" : "Tensão Vcc 3"}
                    measureRaw={data.vcons} measureDivisor={100} unit=" V" maxValue={150}
                    isOff={isOff} refValue={refVcc} openLimit={5} openThreshold={10}
                    onCalibrate={() => calibrateGain('vcons', refVcc)}
                    offsetRaw={data.ovc} onApplyOffset={(val: number) => writeReg(137, 2, val)} onAutoOffset={() => autoAdjust('vcons')}
                    gainRaw={data.gvc} onApplyGain={(val: number) => writeReg(136, 5, val)}
                  />
                </div>
                <div className="p-2 bg-slate-900/50 border-t border-slate-700 mt-auto">
                  <div className="text-[10px] font-bold text-slate-400 mb-1">Valor Referência (Vcc):</div>
                  <div className="flex gap-2 justify-start">
                    <input
                      type="text" inputMode="numeric" value={refVcc}
                      onChange={e => applyMask(e.target.value, 2, setRefVcc)}
                      className="w-24 px-2 py-1 text-xs font-mono bg-slate-900 border border-slate-600 rounded text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button onClick={() => calibrateGroup('vcc')} disabled={isOff} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50">CALIBRAR</button>
                  </div>
                </div>
              </div>

              {/* COLUNA 2: CORRENTES CC */}
              <div className="flex flex-col bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                <div className="bg-slate-900 text-slate-300 text-[10px] font-bold px-3 py-2 uppercase tracking-wider border-b border-slate-700">Correntes CC</div>
                <div className="flex-1">
                  <SensorBlock
                    title={appMode === 'tps' ? "Corrente Retificador" : "Corrente Icc 1"}
                    measureRaw={data.iret} measureDivisor={100} unit=" A" maxValue={100}
                    isOff={isOff} refValue={refIcc} openLimit={5} openThreshold={2}
                    onCalibrate={() => calibrateGain('iret', refIcc)}
                    offsetRaw={data.oi1} onApplyOffset={(val: number) => writeReg(139, 2, val)} onAutoOffset={() => autoAdjust('iret')}
                    gainRaw={data.gi1} onApplyGain={(val: number) => writeReg(138, 5, val)}
                  />
                  {appMode === 'scr' && scrSubMode === '12' && (
                    <SensorBlock
                      title="Corrente Icc 2" measureRaw={data.iret2} measureDivisor={100} unit=" A" maxValue={100}
                      isOff={isOff} refValue={refIcc} openLimit={5} openThreshold={2}
                      onCalibrate={() => calibrateGain('iret2', refIcc)}
                      offsetRaw={data.oi2} onApplyOffset={(val: number) => writeReg(141, 2, val)} onAutoOffset={() => autoAdjust('iret2')}
                      gainRaw={data.gi2} onApplyGain={(val: number) => writeReg(140, 5, val)}
                    />
                  )}
                  <SensorBlock
                    title={appMode === 'tps' ? "Corrente Bateria" : "Corrente Icc 3"}
                    measureRaw={data.ibat} measureDivisor={100} unit=" A" maxValue={100}
                    isOff={isOff} refValue={refIcc} openLimit={5} openThreshold={2}
                    onCalibrate={() => calibrateGain('ibat', refIcc)}
                    offsetRaw={data.oib} onApplyOffset={(val: number) => writeReg(143, 2, val)} onAutoOffset={() => autoAdjust('ibat')}
                    gainRaw={data.gib} onApplyGain={(val: number) => writeReg(142, 5, val)}
                  />
                </div>
                <div className="p-2 bg-slate-900/50 border-t border-slate-700 mt-auto">
                  <div className="text-[10px] font-bold text-slate-400 mb-1">Valor Referência (Icc):</div>
                  <div className="flex gap-2 justify-start">
                    <input
                      type="text" inputMode="numeric" value={refIcc}
                      onChange={e => applyMask(e.target.value, 2, setRefIcc)}
                      className="w-24 px-2 py-1 text-xs font-mono bg-slate-900 border border-slate-600 rounded text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button onClick={() => calibrateGroup('icc')} disabled={isOff} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50">CALIBRAR</button>
                  </div>
                </div>
              </div>

              {/* COLUNA 3: TENSÕES CA */}
              <div className="flex flex-col bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                <div className="bg-slate-900 text-slate-300 text-[10px] font-bold px-3 py-2 uppercase tracking-wider border-b border-slate-700">Tensões CA</div>
                <div className="flex-1">
                  <SensorBlock
                    title={appMode === 'tps' ? "Tensão R" : "Tensão RS"}
                    measureRaw={data.vrs} measureDivisor={10} unit=" V" maxValue={300}
                    isOff={isOff} refValue={refVca} openLimit={5} openThreshold={10}
                    onCalibrate={() => calibrateGain('vca_rs', refVca)}
                    gainRaw={data.gvrs} onApplyGain={(val: number) => writeReg(144, 5, val)}
                    precision={1}
                  />
                  <SensorBlock
                    title={appMode === 'tps' ? "Tensão S" : "Tensão ST"}
                    measureRaw={data.vst} measureDivisor={10} unit=" V" maxValue={300}
                    isOff={isOff} refValue={refVca} openLimit={5} openThreshold={10}
                    onCalibrate={() => calibrateGain('vca_st', refVca)}
                    gainRaw={data.gvst} onApplyGain={(val: number) => writeReg(145, 5, val)}
                    precision={1}
                  />
                  {appMode === 'tps' && (
                    <SensorBlock
                      title="Tensão T" measureRaw={data.vt} measureDivisor={10} unit=" V" maxValue={300}
                      isOff={isOff} refValue={refVca} openLimit={5} openThreshold={10}
                      onCalibrate={() => calibrateGain('vca_t', refVca)}
                      gainRaw={data.gvt} onApplyGain={(val: number) => writeReg(148, 5, val)}
                      precision={1}
                    />
                  )}
                </div>
                <div className="p-2 bg-slate-900/50 border-t border-slate-700 mt-auto">
                  <div className="text-[10px] font-bold text-slate-400 mb-1">Valor Referência (Vca):</div>
                  <div className="flex gap-2 justify-start mb-2">
                    <input
                      type="text" inputMode="numeric" value={refVca}
                      onChange={e => applyMask(e.target.value, 1, setRefVca)}
                      className="w-24 px-2 py-1 text-xs font-mono bg-slate-900 border border-slate-600 rounded text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button onClick={() => calibrateGroup('vca')} disabled={isOff} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50">CALIBRAR</button>
                  </div>

                  {appMode === 'scr' && (
                    <div className="p-2 border-t border-dashed border-slate-700 mt-auto">
                      <div className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">Sensor Tensão CA:</div>
                      <div className="flex gap-2 items-center">
                        <select value={scaType} onChange={e => setScaType(parseInt(e.target.value))} className="w-24 px-1 py-1 text-[10px] font-bold bg-slate-900 border border-slate-600 rounded text-slate-200 outline-none">
                          <option value={1}>Isolado</option>
                          <option value={2}>Diferencial</option>
                        </select>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="000.00"
                          value={scaRes}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            if (!raw) setScaRes('');
                            else setScaRes((parseInt(raw, 10) / 10).toFixed(1));
                          }}
                          className="w-14 px-1 py-1 text-xs font-mono text-center bg-slate-900 border border-slate-600 rounded text-slate-200 outline-none placeholder:text-slate-600"
                        />
                        <button
                          onClick={() => {
                            let raw = 0;
                            if (scaType === 2) {
                              raw = 33587200; // 0x02008000
                            } else {
                              const valStr = scaRes.replace(/\D/g, '');
                              let val = parseInt(valStr);
                              if (isNaN(val)) val = 3300;
                              raw = 16777216 | val; // 0x01000000 | val
                            }
                            writeReg(197, 4, raw);
                            setTimeout(() => writeReg(426, 2, 1), 500);
                          }}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded transition-colors"
                        >
                          GRAVAR
                        </button>
                        <span className="ml-auto text-[11px] font-mono font-bold text-orange-400" title="Valor Lido Atualmente">
                          {data.rca !== undefined ? (data.rca / 10).toFixed(1) : "---"} kΩ
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* COLUNA 4: CORRENTES CA */}
              <div className="flex flex-col bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                <div className="bg-slate-900 text-slate-300 text-[10px] font-bold px-3 py-2 uppercase tracking-wider border-b border-slate-700">Correntes CA</div>
                <div className="flex-1">
                  <SensorBlock
                    title="Corrente R" measureRaw={data.ir} measureDivisor={100} unit=" A" maxValue={300}
                    isOff={isOff} refValue={refIca} openLimit={5} openThreshold={2}
                    onCalibrate={() => calibrateGain('ica_r', refIca)}
                    gainRaw={data.gir} onApplyGain={(val: number) => writeReg(146, 5, val)}
                  />
                  {appMode === 'tps' && (
                    <SensorBlock
                      title="Corrente S" measureRaw={data.is} measureDivisor={100} unit=" A" maxValue={300}
                      isOff={isOff} refValue={refIca} openLimit={5} openThreshold={2}
                      onCalibrate={() => calibrateGain('ica_s', refIca)}
                      gainRaw={data.gis} onApplyGain={(val: number) => writeReg(149, 5, val)}
                    />
                  )}
                  <SensorBlock
                    title="Corrente T" measureRaw={data.it} measureDivisor={100} unit=" A" maxValue={300}
                    isOff={isOff} refValue={refIca} openLimit={5} openThreshold={2}
                    onCalibrate={() => calibrateGain('ica_t', refIca)}
                    gainRaw={data.git} onApplyGain={(val: number) => writeReg(147, 5, val)}
                  />
                </div>
                <div className="p-2 bg-slate-900/50 border-t border-slate-700 mt-auto">
                  <div className="text-[10px] font-bold text-slate-400 mb-1">Valor Referência (Ica):</div>
                  <div className="flex gap-2 justify-start">
                    <input
                      type="text" inputMode="numeric" value={refIca}
                      onChange={e => applyMask(e.target.value, 2, setRefIca)}
                      className="w-24 px-2 py-1 text-xs font-mono bg-slate-900 border border-slate-600 rounded text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button onClick={() => calibrateGroup('ica')} disabled={isOff} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded transition-colors disabled:opacity-50">CALIBRAR</button>
                  </div>
                </div>
              </div>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-3">
                <h2 className="text-[10px] font-bold text-slate-400 border-b border-slate-700 pb-1 mb-2 uppercase">Identificação</h2>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-slate-900/50 p-2 rounded border border-slate-700 mb-2">
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-xs font-bold text-slate-400">NS:</label>
                    <input
                      type="text" value={snInput} disabled={isOff || serialPending || data.serial?.busy} onChange={e => setSnInput(e.target.value.replace(/[^0-9]/g, ''))}
                      maxLength={10} placeholder="000000"
                      className="w-24 px-2 py-1 text-sm font-mono bg-slate-900 border border-slate-600 rounded text-slate-200 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <button
                      onClick={syncSerialNumber} disabled={isOff || serialPending || data.serial?.busy}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded transition-colors disabled:opacity-50"
                    >
                      GRAVAR
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 sm:border-l border-slate-700 sm:pl-4 min-w-[120px]">
                    <div className="flex justify-between text-xs gap-4">
                      <span className="font-bold text-slate-500">SN CPU:</span>
                      <span className="font-mono font-bold text-orange-400">{sn(data.sncc)}</span>
                      <span role="status" className="text-xs text-amber-300">{serialMessage}</span>
                    </div>
                    <div className="flex justify-between text-xs gap-4">
                      <span className="font-bold text-slate-500">SN UGE:</span>
                      <span className="font-mono font-bold text-orange-400">{sn(data.snug)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-dashed border-slate-700 pt-3">
                  <div className="text-xs text-slate-500 mb-1">Última Falha UGE:</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-lg font-bold ${diagColor} cursor-help transition-all duration-300 hover:brightness-125`}
                      onMouseEnter={() => setShowFaultTooltip(true)}
                      onMouseLeave={() => setShowFaultTooltip(false)}
                      onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                    >
                      {diagText}
                    </span>
                    {diagDesc && <span className="text-xs bg-slate-900 text-slate-400 px-2 py-1 rounded font-mono border border-slate-700">{diagDesc}</span>}
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-3">
                <h2 className="text-[10px] font-bold text-slate-400 border-b border-slate-700 pb-1 mb-2 uppercase">Entradas Digitais</h2>

                <div className="flex justify-between px-2 mb-2">
                  {[1, 2, 3, 4].map(i => <span key={i} className="text-[10px] font-bold text-slate-500">DIN{i}</span>)}
                </div>
                <div className="flex justify-between px-2 mb-4">
                  {[0, 1, 2, 3].map(bit => (
                    <div key={bit} className={`w-10 h-3 rounded-sm border ${isDinActive(bit) ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-700 border-slate-600'}`} />
                  ))}
                </div>

                <div className="flex justify-between px-2 mb-2">
                  {[5, 6, 7, 8].map(i => <span key={i} className="text-[10px] font-bold text-slate-500">DIN{i}</span>)}
                </div>
                <div className="flex justify-between px-2">
                  {[4, 5, 6, 7].map(bit => (
                    <div key={bit} className={`w-10 h-3 rounded-sm border ${isDinActive(bit) ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-700 border-slate-600'}`} />
                  ))}
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-3 flex flex-col">
                <h2 className="text-[10px] font-bold text-slate-400 border-b border-slate-700 pb-1 mb-2 uppercase">Temperatura da Bateria</h2>
                <div className="flex-1 flex items-center justify-center py-4">
                  <span className="text-5xl font-mono font-bold text-orange-400 tracking-wider">
                    {isOff || data.tbat === -32768 || data.tbat === undefined ? '----' : (data.tbat / 10).toFixed(1) + ' °C'}
                  </span>
                </div>
              </div>
            </div>
          </main>

          <footer className="bg-slate-900 border-t border-slate-800 px-4 py-2 flex flex-wrap justify-end items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] gap-2 z-10">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={calibrateAll} disabled={isOff} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded shadow transition-colors flex items-center gap-1.5 disabled:opacity-50">
                <CheckCircle2 size={14} /> CALIBRAR TUDO <span className="opacity-70">(F2)</span>
              </button>
              <button onClick={autoAdjustAll} disabled={isOff} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded shadow border border-slate-600 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                <RefreshCw size={14} /> OFFSETS AUTO <span className="opacity-70">(F4)</span>
              </button>
              <button
                onClick={() => { void request({ command: data.relay?.active || data.relay?.stopping ? 'cancel_test' : 'start_test' }).catch(error => window.alert(error.message)); }}
                disabled={!connected || (isOff && !data.relay?.active && !data.relay?.stopping)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded shadow border transition-colors disabled:opacity-50 ${
                  data.relay?.active || data.relay?.stopping
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600'
                }`}
              >
                TESTAR RELÉS
              </button>
              {appMode === 'scr' && (
                <button
                  onClick={() => {
                    // Reset de Falhas (425) - Garante que o valor seja diferente do anterior enviando o timestamp
                    send({ command: "write_reg", reg: 425, format: 2, value: Math.floor(Date.now() / 1000) % 32767 });
                    // Pequeno delay para processamento do reset antes do comando de ligar (424)
                    setTimeout(() => {
                      send({ command: "write_reg", reg: 424, format: 2, value: 1 });
                    }, 200);
                  }}
                  disabled={isOff}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Zap size={14} /> TESTAR DISPAROS
                </button>
              )}
              <button onClick={() => setShowEepromModal(true)} disabled={isOff} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded shadow border border-slate-600 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                <Settings size={14} /> EEPROM
              </button>
              <button onClick={() => setShowFlashModal(true)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded shadow border border-slate-600 transition-colors flex items-center gap-1.5">
                <Cpu size={14} /> GRAVAR CPU
              </button>
            </div>
          </footer>
        </div>
      )}

      {showEepromModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-[480px] overflow-hidden border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
              <h2 className="text-slate-100 font-bold">OPÇÕES DE REINICIALIZAÇÃO (EEPROM)</h2>
              <button onClick={() => setShowEepromModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6">
              {!rebootTarget ? (
                <>
                  <p className="text-sm text-slate-400 mb-4">Selecione a ação de boot desejada. A CPU irá reiniciar imediatamente.</p>
                  <div className="grid gap-2">
                    {[
                      { code: 1, title: "1. Normal / Salvar", desc: "Reboot normal", danger: false },
                      { code: 2, title: "2. Ajustar Horímetro", desc: "Ajustar horímetro", danger: false },
                      { code: 3, title: "3. Apagar Ajustes", desc: "Apagar somente a memória de ajustes", danger: false },
                      { code: 4, title: "4. Apagar Param. Base", desc: "Apagar parâmetros de painel e ajustes", danger: false },
                      { code: 5, title: "5. Apagar EEPROM", desc: "Apaga toda a EEPROM", danger: true },
                      { code: 6, title: "6. Inicializar EEPROM", desc: "Apaga e Inicializa a EEPROM", danger: true },
                      { code: 7, title: "7. Restaurar", desc: "Forçar a assinatura desta versão de EEPROM", danger: true },
                    ].map(opt => (
                      <button
                        key={opt.code} onClick={() => setRebootTarget(opt.code)}
                        className="flex flex-col text-left p-3 rounded-lg border border-slate-700 hover:border-blue-500 hover:bg-slate-700/50 transition-all group"
                      >
                        <span className={`font-bold text-sm ${opt.danger ? 'text-red-400' : 'text-slate-200'} group-hover:text-blue-400`}>{opt.title}</span>
                        <span className="text-xs text-slate-500">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center text-center py-4">
                  <ShieldAlert size={48} className={rebootTarget >= 5 ? "text-red-500 mb-4" : "text-amber-500 mb-4"} />
                  <h3 className="text-lg font-bold text-white mb-2 uppercase">Confirmar Ação</h3>
                  <p className="text-slate-400 text-sm mb-6">
                    Você selecionou a opção:<br />
                    <b className="text-slate-100">
                      {[
                        "1. Normal / Salvar", "2. Ajustar Horímetro", "3. Apagar Ajustes", 
                        "4. Apagar Param. Base", "5. Apagar EEPROM", "6. Inicializar EEPROM", "7. Restaurar"
                      ][rebootTarget - 1]}
                    </b>
                    <br /><br />
                    A CPU irá reiniciar para aplicar esta ação. Deseja continuar?
                  </p>
                  
                  <div className="flex gap-4 w-full">
                    <button 
                      onClick={() => setRebootTarget(null)}
                      className="flex-1 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors"
                    >
                      VOLTAR
                    </button>
                    <button 
                      onClick={() => sendReboot(rebootTarget)}
                      className={`flex-1 px-4 py-3 text-white font-bold rounded-lg transition-colors shadow-lg ${
                        rebootTarget >= 5 ? 'bg-red-600 hover:bg-red-500 shadow-red-900/40' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40'
                      }`}
                    >
                      SIM, REINICIAR
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="bg-slate-900 px-6 py-4 flex justify-end border-t border-slate-700">
              <button onClick={() => { setRebootTarget(null); setShowEepromModal(false); }} className="px-4 py-2 bg-slate-800 border border-slate-600 rounded shadow-sm text-sm font-bold text-slate-300 hover:bg-slate-700">FECHAR</button>
            </div>
          </div>
        </div>
      )}

      {showFlashModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-[480px] overflow-hidden border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
              <h2 className="text-slate-100 font-bold uppercase tracking-tight">
                GRAVAÇÃO DE FIRMWARE - {appMode === 'tps' ? 'TPS 125' : 'SCR'}
              </h2>
              <button onClick={() => !isFlashing && setShowFlashModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                <XCircle size={20} />
              </button>
            </div>

            {/* Barra de Caminho da Pasta */}
            <div className="bg-slate-900/80 px-6 py-2 border-b border-slate-700 flex items-center gap-2">
              <Search size={12} className="text-slate-500" />
              <span className="text-[10px] text-slate-500 font-bold uppercase whitespace-nowrap">Pasta:</span>
              {bridgeAlive ? (
                <span className="text-[10px] font-mono text-blue-400 truncate" title={appMode === 'tps' ? bridgePaths.tps : bridgePaths.scr}>
                  {appMode === 'tps' ? (bridgePaths.tps || 'Não configurado') : (bridgePaths.scr || 'Não configurado')}
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold text-red-500 animate-pulse">
                  BRIDGE OFFLINE
                </span>
              )}
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-400 mb-6 font-medium">Selecione a imagem de firmware para o {appMode === 'tps' ? 'TPS125' : 'SCR'}:</p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                {(appMode === 'tps' ? [
                  { id: 'jiga', title: 'JIGA', desc: 'Testes de Bancada', color: 'hover:border-orange-500 hover:bg-orange-500/10', available: fwAvailable.jiga },
                  { id: 'burnin', title: 'BURN-IN', desc: 'Teste de Estresse', color: 'hover:border-red-500 hover:bg-red-500/10', available: fwAvailable.burnin },
                  { id: 'cliente', title: 'CLIENTE', desc: 'Versão de Produção', color: 'hover:border-blue-500 hover:bg-blue-500/10', available: fwAvailable.cliente },
                ] : [
                  { id: 'vca_montado', title: 'VCA MONTADO', desc: 'J2_Vca_montado', color: 'hover:border-orange-500 hover:bg-orange-500/10', available: fwAvailable.jiga },
                  { id: 'burnin', title: 'BURN-IN', desc: 'B1_Burn_in', color: 'hover:border-red-500 hover:bg-red-500/10', available: fwAvailable.burnin },
                  { id: 'cliente', title: 'CLIENTE', desc: 'C0_Cliente', color: 'hover:border-blue-500 hover:bg-blue-500/10', available: fwAvailable.cliente },
                ]).map(opt => (
                  <button
                    key={opt.id} onClick={() => handleFlash(opt.id)} disabled={!canStartFlash || !opt.available}
                    className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 border-slate-700 bg-slate-900/50 transition-all ${opt.color} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-700 disabled:hover:bg-slate-900/50`}
                  >
                    <span className="font-bold text-[10px] text-slate-200 mb-1">{opt.title}</span>
                    <span className="text-[9px] text-slate-500 text-center leading-tight">{opt.desc}</span>
                  </button>
                ))}
              </div>

              {(flashOperation.state !== 'idle' || flashNotice) && (
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <div role="status" className="text-xs font-bold text-slate-300 mb-2">{flashStatus}</div>
                  {flashNotice && <p role="status" className="text-xs text-amber-300 mb-2">{flashNotice}</p>}
                  {flashOperation.state === 'unknown' && (
                    <div className="flex flex-wrap items-center gap-4 mb-3">
                      <button onClick={openBridge} disabled={openingBridge} className="text-xs text-blue-300 underline disabled:opacity-50">
                        {openingBridge ? 'AGUARDANDO A PONTE...' : 'ABRIR TEKSEA BRIDGE'}
                      </button>
                      <a
                        href="/instalar_bridge.bat"
                        download="instalar_bridge.bat"
                        className="text-xs text-emerald-400 hover:text-emerald-300 underline flex items-center gap-1"
                      >
                        <Download size={12} /> BAIXAR INSTALADOR DO BRIDGE
                      </a>
                    </div>
                  )}
                  {!flashOperation.cleanup_confirmed && !isFlashing && <p className="text-xs text-amber-300 mb-2">Nova gravação bloqueada até confirmar que o gravador está livre. Fechar a tela não cancela o processo.</p>}
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-4">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                      style={{ width: `${flashProgress}%` }}
                    />
                  </div>
                  <div ref={logRef} className="bg-black text-emerald-400 font-mono text-[10px] p-3 rounded h-32 overflow-y-auto whitespace-pre-wrap leading-tight border border-slate-800">
                    {flashLog.join('\n')}
                  </div>
                </div>
              )}
            </div>
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-t border-slate-700">
              <button onClick={setupFlashPaths} disabled={isFlashing} className="text-xs text-blue-400 hover:text-blue-300 underline font-medium disabled:opacity-50 tracking-tight">⚙ CONFIGURAR PASTAS</button>
              {isFlashing && flashOperation.state !== 'cancelling' && (
                <button className="px-3 py-2 text-sm font-bold text-red-300" onClick={() => {
                  if (window.confirm('Interromper a gravação? Pode ser necessário regravar o equipamento.')) void cancelFlash();
                }}>CANCELAR GRAVAÇÃO</button>
              )}
              <button 
                onClick={() => setShowFlashModal(false)} 
                disabled={isFlashing} 
                className={`px-4 py-2 rounded shadow-sm text-sm font-bold transition-all ${isFlashing ? 'bg-slate-800 border-slate-600 text-slate-500 opacity-50' : flashProgress >= 100 ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow-lg shadow-emerald-900/20' : 'bg-slate-800 border border-slate-600 text-slate-300 hover:bg-slate-700'}`}
              >
                {flashOperation.state === 'succeeded' ? 'CONCLUÍDO' : 'FECHAR'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showWifiModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-slate-800 rounded-xl shadow-2xl w-[420px] overflow-hidden border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-4 flex justify-between items-center border-b border-slate-700">
              <h2 className="text-slate-100 font-bold flex items-center gap-2">
                <Wifi size={18} className="text-blue-400" />
                CONFIGURAÇÕES DE REDE
              </h2>
              <button onClick={() => setShowWifiModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-4 p-3 bg-slate-900/80 border border-slate-700 rounded-lg">
                <div className="flex-1">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">IP Atual AP</div>
                  <div className="text-xs font-mono text-emerald-400">{data.net?.cur_ap || '192.168.4.1'}</div>
                </div>
                <div className="w-px bg-slate-700" />
                <div className="flex-1">
                  <div className="text-[9px] font-bold text-slate-500 uppercase">IP Atual STA</div>
                  <div className="text-xs font-mono text-blue-400">{data.net?.cur_sta || '0.0.0.0'}</div>
                </div>
              </div>

              <div className="space-y-1 relative">
                <label className="text-[10px] font-bold text-slate-500 uppercase">SSID WiFi (Rede Local)</label>
                <div className="relative">
                  <input
                    type="text" value={wifiConfig.ssid} onChange={e => setWifiConfig({ ...wifiConfig, ssid: e.target.value })}
                    placeholder="Deixe vazio para 'Sem Rede'"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-100 focus:ring-1 focus:ring-blue-500 outline-none pr-10"
                  />
                  <button
                    onClick={() => { setIsScanning(true); send({ command: "scan_wifi" }); }}
                    disabled={isScanning}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-400 p-1 rounded-md transition-colors disabled:opacity-30"
                    title="Buscar redes próximas"
                  >
                    {isScanning ? <RefreshCw size={16} className="animate-spin text-blue-500" /> : <Search size={16} />}
                  </button>
                </div>

                {data.type === 'scan_res' && data.list && data.list.length > 0 && (
                  <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 max-h-40 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                      <span className="text-[8px] font-bold text-slate-500 uppercase">Redes Encontradas</span>
                      <button onClick={() => send({ type: 'clear_scan' })} className="text-[8px] text-blue-400 font-bold hover:underline">FECHAR</button>
                    </div>
                    {data.list.map((net: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setWifiConfig({ ...wifiConfig, ssid: net.ssid });
                          // Small hack to hide the list: the backend won't send 'scan_res' again until requested
                          data.list = [];
                        }}
                        className="w-full px-3 py-2 text-left text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white border-b border-slate-700/50 flex justify-between items-center group transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Wifi size={12} className="text-blue-400/60 group-hover:text-blue-400" />
                          {net.ssid}
                        </div>
                        <span className="text-[10px] text-slate-500">{net.rssi} dBm</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Senha WiFi</label>
                <input
                  type="password" value={wifiConfig.pass} onChange={e => setWifiConfig({ ...wifiConfig, pass: e.target.value })}
                  disabled={!wifiConfig.ssid}
                  placeholder="********"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm text-slate-100 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50"
                />
              </div>

              <div className="flex items-center justify-between p-2 bg-slate-900/50 border border-slate-700 rounded-lg">
                <span className="text-xs font-bold text-slate-300">Modo de IP:</span>
                <div className="flex bg-slate-800 p-0.5 rounded-md border border-slate-600">
                  <button
                    onClick={() => setWifiConfig({ ...wifiConfig, dhcp: true })}
                    className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${wifiConfig.dhcp ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >DINÂMICO</button>
                  <button
                    onClick={() => setWifiConfig({ ...wifiConfig, dhcp: false })}
                    className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${!wifiConfig.dhcp ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >ESTÁTICO</button>
                </div>
              </div>

              <div className={`grid grid-cols-1 gap-4 pt-2 transition-opacity duration-300 ${wifiConfig.dhcp ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">IP Estático Desejado</label>
                  <input
                    type="text" value={wifiConfig.ip} onChange={e => setWifiConfig({ ...wifiConfig, ip: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm font-mono text-blue-400 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Gateway</label>
                    <input
                      type="text" value={wifiConfig.gw} onChange={e => setWifiConfig({ ...wifiConfig, gw: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm font-mono text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Máscara</label>
                    <input
                      type="text" value={wifiConfig.mask} onChange={e => setWifiConfig({ ...wifiConfig, mask: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-sm font-mono text-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg mt-2">
                <div className="text-[10px] font-bold text-blue-400 uppercase mb-1">Nota: Ponto de Acesso</div>
                <div className="text-[10px] text-slate-400 leading-tight">
                  O calibrador sempre mantém a rede <b>CALIBRADOR_TPS_SCR</b> ativa para configuração direta via IP <b>192.168.4.1</b>.
                </div>
              </div>
            </div>
            
            <div className="bg-slate-900 px-6 py-4 flex justify-end gap-3 border-t border-slate-700">
              <button onClick={() => setShowWifiModal(false)} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200 transition-colors">CANCELAR</button>
              <span role="status" className="text-xs text-amber-300 mr-3">{wifiMessage}</span>
              <button onClick={saveWifi} disabled={wifiSaving || !connected} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all">{wifiSaving ? 'SALVANDO...' : 'SALVAR CONFIGURAÇÃO'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip de Falha Customizado */}
      {showFaultTooltip && (
        <div
          className="fixed z-[9999] pointer-events-none p-4 rounded-xl border border-slate-700 bg-slate-900/90 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: tooltipPos.x + 15,
            top: tooltipPos.y - 15,
            transform: 'translateY(-100%)',
            maxWidth: '320px'
          }}
        >
          <div className="flex flex-col gap-2">
            <div className={`text-sm font-black uppercase tracking-tighter ${diagColor} flex items-center gap-2`}>
              <DiagIcon size={16} strokeWidth={2.5} className="opacity-90" />
              DETALHES DO EVENTO
            </div>
            <div className="h-px bg-slate-800" />
            <div className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300 font-medium font-sans">
              {diagTooltip}
            </div>
            <div className="mt-1 pt-1 border-t border-slate-800 flex justify-between items-center">
              <span className="text-[8px] text-slate-500 font-bold uppercase">UGE Status</span>
              <span className="text-[8px] text-emerald-500 font-bold font-mono">TELEMETRIA EM TEMPO REAL</span>
            </div>
          </div>
        </div>
      )}

      {/* Overlay de Scan Reveal — fica fixo sobre tudo durante a transição */}
      {isRevealing && (
        <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
          {/* Tela que vai sendo revelada (clone visual simples: fundo escuro) */}
          <div className="absolute inset-0 bg-slate-950 scan-reveal-overlay" />
          {/* O feixe de luz azul que lidera a revelação */}
          <div className="scan-beam absolute top-0 bottom-0 w-[3px] bg-blue-400 shadow-[0_0_24px_6px_rgba(96,165,250,0.7)]">
            <div className="absolute inset-y-0 -left-16 w-16 bg-gradient-to-r from-transparent to-blue-400/20" />
          </div>
        </div>
      )}
    </>
  );
}
