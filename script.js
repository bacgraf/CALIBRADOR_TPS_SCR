/* SCRIPT PARA DASHBOARD CALIBRADOR TPS125 */
let socket;
const status = document.getElementById('ws-status');
window.dicionarioFalhas = {}; // Guardará o mapeamento de falhas

function connectWS() {
    socket = new WebSocket(`ws://${window.location.hostname}/ws`);

    socket.onopen = () => {
        window.lastWsPulse = Date.now(); // Inicia batimento
        const wsEl = el("ws-status");
        if (wsEl) {
            wsEl.innerText = "REDE: OK";
            wsEl.className = "status-badge status-connected";
        }
    };

    socket.onmessage = (event) => {
        try {
            window.lastWsPulse = Date.now(); // Recebeu dado, atualiza batimento
            const data = JSON.parse(event.data);
            window.lastData = data;

            // Atualiza badges de status
            const ugeEl = el('uge-status');
            const wsEl = el('ws-status');
            if (wsEl) {
                wsEl.innerText = "REDE: OK";
                wsEl.className = "status-badge status-connected";
            }

            if (ugeEl) {
                if (data.uge_ok) {
                    ugeEl.innerText = "UGE: LINK OK";
                    ugeEl.className = "status-badge status-connected";
                } else {
                    ugeEl.innerText = "UGE: OFF";
                    ugeEl.className = "status-badge status-disconnected";
                }
            }

            // Atualiza firmware
            const fwEl = el('uge-fw');
            if (fwEl) {
                if (!data.uge_ok || !data.uge_vers) {
                    fwEl.innerText = "FW: ---";
                    fwEl.className = "status-badge status-disconnected";
                } else {
                    fwEl.innerText = "FW: " + data.uge_vers + " | B: " + data.uge_build;
                    fwEl.className = "status-badge status-connected";
                }
            }

            // Helpers de Formatação (Retornam "---" se a UGE estiver offline)
            const isOff = !data.uge_ok;

            const f = (v, d, unit) => {
                if (isOff || v === undefined || v <= -32700) return "---" + (unit || "");
                return (v / d).toFixed(2) + unit;
            };

            const g = (v) => {
                if (isOff || v === undefined || v <= -32700) return "---%";
                const val = v / 100;
                return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
            };

            const o = (v, d) => {
                if (isOff || v === undefined || v <= -32768) return "---";
                return (v / d).toFixed(2);
            };

            const sn = (v) => {
                if (isOff || v === undefined || v === 2147483648) return "-------";
                return v;
            }

            // Helper de Diagnóstico Visual por Canal
            // rawVal: valor bruto do JSON | divisor: ex 100 para V/A
            // refId: id do campo de referência do grupo
            // openLimit: limite absoluto para canal aberto (5V ou 5A)
            // openThreshold: se ref <= este valor, considera canal "aberto"
            const checkHealth = (rawVal, divisor, refId, openLimit, openThreshold) => {
                if (isOff || rawVal === undefined || rawVal <= -32700) return false;
                const measured = Math.abs(rawVal / divisor);
                const refInput = el(refId);
                const ref = refInput ? parseFloat(refInput.value) : 0;
                if (isNaN(ref) || ref <= openThreshold) {
                    // Canal aberto: leitura deve ser próxima de zero
                    return measured > openLimit;
                } else {
                    // Canal carregado: tolerância de 10%
                    return Math.abs((rawVal / divisor) - ref) > ref * 0.10;
                }
            };

            const setVal = (id, text, bad) => {
                const e = el(id);
                if (!e) return;
                e.innerText = text;
                e.style.color = bad ? '#e53935' : '';
            };

            // 1. Atualização das Medidas Instantâneas (com diagnóstico de cor)
            setVal('vret1_avg', f(data.vret, 100, " V"), checkHealth(data.vret, 100, 'cal_v_ref', 5, 10));
            setVal('vbat1_avg', f(data.vbat, 100, " V"), checkHealth(data.vbat, 100, 'cal_v_ref', 5, 10));
            setVal('vcons_avg', f(data.vcons, 100, " V"), checkHealth(data.vcons, 100, 'cal_v_ref', 5, 10));
            setVal('iret1_avg', f(data.iret, 100, " A"), checkHealth(data.iret, 100, 'cal_i_ref', 5, 2));
            setVal('ibat_avg', f(data.ibat, 100, " A"), checkHealth(data.ibat, 100, 'cal_i_ref', 5, 2));
            if (el('sn_cpu')) el('sn_cpu').innerText = sn(data.sncc);
            if (el('sn_uge')) el('sn_uge').innerText = sn(data.snug);
            if (el('temp_bat')) el('temp_bat').innerText = f(data.tbat, 10, " °C");

            // Tradutor do Diag Web
            if (el('diag_err')) {
                if (isOff || data.err_cod === undefined) {
                    el('diag_err').innerText = "---";
                    if (el('diag_desc')) el('diag_desc').innerText = "";
                    el('diag_err').style.color = "";
                } else if (data.err_cod === 32768 || data.err_cod === -32768) {
                    el('diag_err').innerText = "SISTEMA OK";
                    if (el('diag_desc')) {
                        const vers = data.uge_vers || "---";
                        const build = data.uge_build || "---";
                        el('diag_desc').innerHTML = `<div class="fw-info-tag">FW: ${vers} | B: ${build}</div>`;
                    }
                    el('diag_err').style.color = "#4caf50";
                } else {
                    const info = window.dicionarioFalhas[data.err_cod];
                    const txtFalha = info ? info.nome : "DESCONHECIDO";
                    const txtDesc = info ? info.desc : "Erro nao mapeado em base.";
                    const extVal = data.err_ext || 0;
                    const txtExt = (info && info.exts && info.exts[extVal]) ? info.exts[extVal] : `Pino/Cod ${extVal}`;

                    // Formato solicitado: [COD-EXT]
                    el('diag_err').innerText = `[${data.err_cod}-${extVal}]`;

                    // Informações detalhadas ao passar o mouse (Tooltip)
                    el('diag_err').title = `Nome: ${txtFalha}\nDescrição: ${txtDesc}\nDetalhe: ${txtExt}`;

                    if (el('diag_desc')) el('diag_desc').innerText = ""; // Limpa a linha de baixo para o dashboard ficar limpo
                    el('diag_err').style.color = "#ff5252";
                }
            }

            setVal('vca_rs', f(data.vrs, 10, " V"), checkHealth(data.vrs, 10, 'cal_vca_ref', 5, 10));
            setVal('vca_st', f(data.vst, 10, " V"), checkHealth(data.vst, 10, 'cal_vca_ref', 5, 10));
            setVal('vca_t', f(data.vt, 10, " V"), checkHealth(data.vt, 10, 'cal_vca_ref', 5, 10));
            setVal('ica_r', f(data.ir, 100, " A"), checkHealth(data.ir, 100, 'cal_ica_ref', 5, 2));
            setVal('ica_s', f(data.is, 100, " A"), checkHealth(data.is, 100, 'cal_ica_ref', 5, 2));
            setVal('ica_t', f(data.it, 100, " A"), checkHealth(data.it, 100, 'cal_ica_ref', 5, 2));

            // 2. Atualização dos Valores Lidos (EEPROM/RAM da UGE)
            const u = isOff ? "---" : (v, d) => (v / d).toFixed(2);
            if (el('v1_o')) el('v1_o').innerText = o(data.ov1, 100) + (isOff ? "" : " V");
            if (el('v1_g')) el('v1_g').innerText = g(data.gv1);
            if (el('vc_o')) el('vc_o').innerText = o(data.ovc, 100) + (isOff ? "" : " V");
            if (el('vc_g')) el('vc_g').innerText = g(data.gvc);

            if (el('ir1_o')) el('ir1_o').innerText = o(data.oi1, 100) + (isOff ? "" : " A");
            if (el('ir1_g')) el('ir1_g').innerText = g(data.gi1);
            if (el('ib_o')) el('ib_o').innerText = o(data.oib, 100) + (isOff ? "" : " A");
            if (el('ib_g')) el('ib_g').innerText = g(data.gib);

            if (el('vrs_g')) el('vrs_g').innerText = g(data.gvrs);
            if (el('vst_g')) el('vst_g').innerText = g(data.gvst);
            if (el('vt_g')) el('vt_g').innerText = g(data.gvt);
            if (el('irr_g')) el('irr_g').innerText = g(data.gir);
            if (el('irs_g')) el('irs_g').innerText = g(data.gis);
            if (el('irt_g')) el('irt_g').innerText = g(data.git);

            // 3. Atualização das Entradas Digitais (LEDs)
            const din = isOff ? 0 : (data.din || 0);
            for (let i = 0; i < 8; i++) {
                const led = el(`din_bit-${i}`);
                if (led) led.className = `bit-led ${(din & (1 << i)) ? 'active' : ''}`;
            }

            // 4. Diagnóstico
            if (el('sn_cpu')) el('sn_cpu').innerText = sn(data.sncc);
            if (el('sn_uge')) el('sn_uge').innerText = sn(data.snug);
            if (el('upt')) el('upt').innerText = isOff ? "---" : data.upt;
            if (el('cyc')) el('cyc').innerText = isOff ? "---" : data.cyc;

            // 5. Atualização das Flags de Sistema (Feedback Visual)
            const updateBtn = (id, active) => {
                const b = el(id);
                if (b) b.className = active ? "btn-active" : "";
            };
            updateBtn('btn_telemetry', data.tele);
            updateBtn('btn_debug_can', data.can_d);
            updateBtn('btn_ignore_adv', data.ign_a);

            // 6. Estado da Interface (Bloqueia comandos se UGE estiver OFF)
            document.querySelectorAll('button, input').forEach(item => {
                // Mantém os botões de sistema do dashboard (se houver algum global)
                if (item.classList.contains('sys-btn')) return;
                item.disabled = isOff;
            });

        } catch (e) { console.error("Erro no parser JSON:", e); }
    };

    socket.onclose = () => {
        const wsEl = el("ws-status");
        if (wsEl) {
            wsEl.innerText = "REDE: OFF";
            wsEl.className = "status-badge status-disconnected";
        }
        const ugeEl = el("uge-status");
        if (ugeEl) {
            ugeEl.innerText = "UGE: OFF";
            ugeEl.className = "status-badge status-disconnected";
        }
        // Desabilita tudo preventivamente, exceto botões de sistema
        document.querySelectorAll('button, input').forEach(it => {
            if (!it.classList.contains('sys-btn')) it.disabled = true;
        });
        setTimeout(connectWS, 2000);
    };
}

// Máscara de entrada decimal: formata automaticamente enquanto o usuário digita
// Exemplo: digitar "12500" vira "125.00" (decimais = casas decimais)
window.maskDecimal = (input, decimals) => {
    let raw = input.value.replace(/\D/g, ''); // Remove tudo que não é dígito
    if (raw === '') { input.value = ''; return; }
    const num = parseInt(raw, 10);
    input.value = (num / Math.pow(10, decimals)).toFixed(decimals);
};

const el = (id) => document.getElementById(id);

window.writeReg = (reg, format, inputId) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const input = el(inputId);
    let val = parseFloat(input.value);
    if (isNaN(val)) return;
    const finalVal = (format === 4 || format === 5) ? val : Math.round(val * 100);
    socket.send(JSON.stringify({ command: "write_reg", reg: reg, format: format, value: finalVal }));
};

window.syncSerialNumber = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const input = el('in_sn_global');
    let val = parseInt(input.value.replace(/\D/g, ''));
    if (isNaN(val)) { alert("SN Inválido!"); return; }

    // Envia para CPU (128) e UGE (129)
    socket.send(JSON.stringify({ command: "write_reg", reg: 128, format: 4, value: val }));
    setTimeout(() => {
        socket.send(JSON.stringify({ command: "write_reg", reg: 129, format: 4, value: val }));
    }, 100);
    input.value = ""; // Limpa campo
};

window.sendDebugFlag = (name) => {
    if (!socket || !window.lastData) return;
    // Mapeamento: Clique -> Flag JSON correspondente
    const map = { 'telemetry': 'tele', 'can_debug': 'can_d', 'ignore_adv': 'ign_a' };
    const jsonKey = map[name];

    // Inverte o estado atual (se for true vira 0, se for false vira 1)
    const currentState = window.lastData[jsonKey];
    const newValue = currentState ? 0 : 1;

    console.log(`Alterando flag [${name}]: ${currentState} -> ${newValue}`);
    socket.send(JSON.stringify({ command: "set_flag", name: name, value: newValue }));
};

window.calibrateGain = (sensor, refId) => {
    if (!window.lastData || !socket) return;
    const refVal = parseFloat(el(refId).value);
    if (isNaN(refVal)) return;

    const d = window.lastData;
    let dev_raw, read_raw;
    const map = {
        'vret': { reg: 132, g: 'gv1', r: 'vret', d: 100 },
        'vcons': { reg: 136, g: 'gvc', r: 'vcons', d: 100 },
        'iret': { reg: 138, g: 'gi1', r: 'iret', d: 100 },
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
    dev_raw = d[cfg.g]; read_raw = d[cfg.r];

    // Ignora se o sensor está em erro de comunicação (-32768) ou com leitura zero
    if (read_raw !== undefined && Math.abs(read_raw) > 1 && read_raw > -32700) {
        const currentGain = 1.0 + (dev_raw * 0.0001);
        const currentRead = read_raw / cfg.d;
        const newGain = currentGain * (refVal / currentRead);

        // Converte o novo ganho absoluto de volta para desvio int16
        const newDeviation = Math.round((newGain - 1.0) * 10000);
        socket.send(JSON.stringify({ command: "write_reg", reg: cfg.reg, format: 2, value: newDeviation }));
    } else {
        console.warn(`[SKIP] Calibração abortada para ${sensor}: Leitura inválida (${read_raw / cfg.d})`);
    }
};

window.autoAdjust = (sensor) => {
    if (!window.lastData || !socket) return;
    const d = window.lastData;
    let reg, val;
    if (sensor === 'vret') { reg = 133; val = (d.ov1 || 0) - (d.vret); }
    else if (sensor === 'vcons') { reg = 137; val = (d.ovc || 0) - (d.vcons); }
    else if (sensor === 'iret') { reg = 139; val = (d.oi1 || 0) - (d.iret); }
    else if (sensor === 'ibat') { reg = 143; val = (d.oib || 0) - (d.ibat); }
    if (reg !== undefined) { socket.send(JSON.stringify({ command: "write_reg", reg: reg, format: 2, value: Math.round(val) })); }
};

window.autoAdjustAll = () => {
    const sensors = ['vret', 'vcons', 'iret', 'ibat'];
    sensors.forEach((s, i) => { setTimeout(() => window.autoAdjust(s), i * 500); });
};

window.calibrateGroup = (group) => {
    const groups = {
        'vcc': [{ s: 'vret', r: 'cal_v_ref' }, { s: 'vcons', r: 'cal_v_ref' }],
        'icc': [{ s: 'iret', r: 'cal_i_ref' }, { s: 'ibat', r: 'cal_i_ref' }],
        'vca': [{ s: 'vca_rs', r: 'cal_vca_ref' }, { s: 'vca_st', r: 'cal_vca_ref' }, { s: 'vca_t', r: 'cal_vca_ref' }],
        'ica': [{ s: 'ica_r', r: 'cal_ica_ref' }, { s: 'ica_s', r: 'cal_ica_ref' }, { s: 'ica_t', r: 'cal_ica_ref' }]
    };
    const seq = groups[group];
    if (!seq) return;
    seq.forEach((it, i) => { setTimeout(() => window.calibrateGain(it.s, it.r), i * 500); });
};

window.calibrateAll = () => {
    const sequence = [
        { s: 'vret', r: 'cal_v_ref' }, { s: 'vcons', r: 'cal_v_ref' }, { s: 'iret', r: 'cal_i_ref' }, { s: 'ibat', r: 'cal_i_ref' },
        { s: 'vca_rs', r: 'cal_vca_ref' }, { s: 'vca_st', r: 'cal_vca_ref' }, { s: 'vca_t', r: 'cal_vca_ref' },
        { s: 'ica_r', r: 'cal_ica_ref' }, { s: 'ica_s', r: 'cal_ica_ref' }, { s: 'ica_t', r: 'cal_ica_ref' }
    ];
    sequence.forEach((it, i) => { setTimeout(() => window.calibrateGain(it.s, it.r), i * 500); });
};

window.startAutoTest = () => { if (socket) socket.send(JSON.stringify({ command: "start_test" })); };

/* FUNÇÕES DO MODAL DE EEPROM */
window.showEepromModal = () => { el('eeprom-modal').style.display = 'flex'; };
window.hideEepromModal = () => { el('eeprom-modal').style.display = 'none'; };

window.sendReboot = (code) => {
    const titles = ["", "NORMAL/SALVAR", "AJUSTAR HORÍMETRO", "APAGAR AJUSTES", "APAGAR PARAM. BASE", "APAGAR EEPROM", "INICIALIZAR EEPROM", "RESTAURAR FÁBRICA"];
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    if (confirm(`Executar comando [${titles[code]}] e reiniciar a CPU?`)) {
        socket.send(JSON.stringify({ command: "write_reg", reg: 426, format: 2, value: code }));
        hideEepromModal();
    }
};

/* FUNÇÕES DO MODAL DE GRAVAÇÃO (FIRMWARE FLASH) */
let pollingInterval = null;
let isFlashing = false;

window.showFlashModal = () => {
    if (isFlashing) return; // Não reabre se já estiver gravando (teoricamente o modal já está aberto)
    el('flash-modal').style.display = 'flex';
    el('flash-progress-container').style.display = 'none';
    el('flash-progress-bar').style.width = '0%';
    el('flash-status').innerText = 'Aguardando início...';

    // Checa disponibilidade dos firmwares no Python Bridge
    fetch('http://localhost:8765/check')
        .then(res => res.json())
        .then(data => {
            const jigaBtn = document.querySelector('.fw-opt.jiga');
            const burninBtn = document.querySelector('.fw-opt.burnin');
            const clienteBtn = document.querySelector('.fw-opt.cliente');

            if (jigaBtn) jigaBtn.disabled = !data.jiga;
            if (burninBtn) burninBtn.disabled = !data.burnin;
            if (clienteBtn) clienteBtn.disabled = !data.cliente;
        })
        .catch(err => console.log('Erro ao checar firmwares (Bridge ativo?):', err));
};

window.hideFlashModal = () => {
    if (isFlashing) {
        console.warn("Fechamento bloqueado: Gravação em andamento.");
        return;
    }
    el('flash-modal').style.display = 'none';
    if (pollingInterval) clearInterval(pollingInterval);
};

window.selectFirmware = (type) => {
    isFlashing = true;
    // Mostra a barra de progresso
    el('flash-progress-container').style.display = 'block';
    el('flash-status').innerText = 'Iniciando Bridge Python...';

    // Tenta avisar o Bridge por debaixo dos panos (Comunicação Direta via HTTP)
    fetch(`http://localhost:8765/flash?type=${type}`)
        .then(res => {
            if (!res.ok) throw new Error("Bridge retornou erro");
            // Sucesso! O Bridge já estava aberto e começou a gravar.
            startPolling();
        })
        .catch(err => {
            // Falhou. O Bridge está fechado. Vamos usar o protocolo para abri-arlo!
            const espIP = window.location.hostname || "192.168.4.1";
            window.location.href = `tms-flash://${espIP}/${type}`;
            startPolling();
        });
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(pollFlashProgress, 800);
};

window.setupFlashPaths = () => {
    // Comando especial para o Python abrir o seletor de pastas
    window.location.href = `tms-flash://setup`;
};

async function pollFlashProgress() {
    try {
        const response = await fetch('http://localhost:8765/progress', { mode: 'cors' });
        const data = await response.json();

        const bar = el('flash-progress-bar');
        const status = el('flash-status');

        if (data.progress !== undefined) {
            bar.style.width = `${data.progress}%`;
            status.innerText = data.status || `Gravando: ${data.progress}%`;

            // Atualiza o Console de Log
            if (data.log && Array.isArray(data.log)) {
                const logEl = el('flash-log');
                logEl.innerText = data.log.join('\n');
                logEl.scrollTop = logEl.scrollHeight; // Auto-scroll
            }

            if (data.progress >= 100) {
                status.innerText = "GRAVAÇÃO CONCLUÍDA COM SUCESSO!";
                clearInterval(pollingInterval);
                isFlashing = false; // Libera o fechamento
                setTimeout(() => { if (confirm("Gravação Terminada. Fechar janela?")) hideFlashModal(); }, 1500);
            }
            if (data.error) {
                status.innerText = "ERRO: " + data.error;
                status.style.color = "red";
                clearInterval(pollingInterval);
                isFlashing = false; // Libera o fechamento em caso de erro
            }
        }
    } catch (e) {
        // Se falhar o fetch, apenas aguarda (o bridge pode estar iniciando)
        console.log("Aguardando Bridge Local...");
        el('flash-status').innerText = "Conectando ao Bridge Local...";
    }
}

window.onload = () => {
    // 1. Carrega o dicionário de falhas primeiro (Via JSON)
    fetch('/falhas.json')
        .then(res => res.json())
        .then(json => {
            window.dicionarioFalhas = json;
            console.log("JSON de falhas de diagnostico carregado!");
        }).catch(err => console.warn('JSON nao encontrado.'));

    connectWS();
    // Watchdog de Rede: Checa a cada 1s se parou de chegar dados (timeout 5s)
    setInterval(() => {
        if (window.lastWsPulse && (Date.now() - window.lastWsPulse) > 5000) {
            if (socket && socket.readyState === WebSocket.OPEN) {
                console.warn("[Watchdog] Timeout de Rede detectado! Forçando fechamento.");
                socket.close(); // Isso vai disparar o onclose automaticamente
            }
        }
    }, 1000);
};
document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') { e.preventDefault(); window.calibrateAll(); }
    if (e.key === 'F4') { e.preventDefault(); window.autoAdjustAll(); }
    if (e.key === 'Escape') {
        if (!isFlashing) hideFlashModal();
        hideEepromModal();
    }
});

// Fechar modais ao clicar fora da área de conteúdo (no overlay)
window.onclick = (event) => {
    const flashModal = el('flash-modal');
    const eepromModal = el('eeprom-modal');
    if (event.target === flashModal && !isFlashing) hideFlashModal();
    if (event.target === eepromModal) hideEepromModal();
};

// Proteção contra fechamento de aba/navegador ou Refresh (F5) durante gravação
window.onbeforeunload = (e) => {
    if (isFlashing) {
        e.preventDefault();
        e.returnValue = ''; // Aciona o alerta de confirmação do navegador
    }
};
