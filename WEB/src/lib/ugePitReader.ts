/**
 * Leitor e decodificador completo dos registradores de configuracao da UGE TPS125
 * via barramento CAN (comando WebSocket `read_reg`).
 */

export interface ReadBatch {
  reg: number;
  format: 2 | 4;
  qtd: number;
  label: string;
}

export const EMPTY_I16 = -32768;
export const EMPTY_I32_U = 0x80000000;

export const UGE_READ_BATCHES: ReadBatch[] = [
  // Horimetro (130..131)
  { reg: 130, format: 4, qtd: 1, label: 'Horas_set' },
  { reg: 131, format: 2, qtd: 1, label: 'Ciclos_set' },

  // Base (160..182)
  { reg: 160, format: 4, qtd: 1, label: 'SN_Equip' },
  { reg: 161, format: 2, qtd: 4, label: 'Vcc/Icc nom/max' },
  { reg: 165, format: 2, qtd: 4, label: 'Vca nom/min/max/Freq' },
  { reg: 169, format: 2, qtd: 3, label: 'UR eme/qtd/sistema' },
  { reg: 178, format: 4, qtd: 1, label: 'Reles_Fixos' },
  { reg: 181, format: 2, qtd: 2, label: 'UDQ diodos/opcoes' },

  // Sensores internos (192..198) e externos (211..214)
  { reg: 192, format: 4, qtd: 2, label: 'SInt Vret1/Vret2' },
  { reg: 194, format: 4, qtd: 2, label: 'SInt Vcons/Iret' },
  { reg: 196, format: 4, qtd: 2, label: 'SInt Ibat/Vca' },
  { reg: 198, format: 4, qtd: 1, label: 'SInt Ica' },
  { reg: 211, format: 4, qtd: 2, label: 'SExt Iret/Ibat' },
  { reg: 213, format: 4, qtd: 2, label: 'SExt Vca/Ica' },

  // Parametros de Carga P01..P19
  { reg: 232, format: 2, qtd: 4, label: 'P01..P04' },
  { reg: 236, format: 2, qtd: 4, label: 'P05..P08' },
  { reg: 240, format: 4, qtd: 1, label: 'P09 Tequ_delay' },
  { reg: 241, format: 2, qtd: 1, label: 'P10 Ilimiar_flu' },
  { reg: 242, format: 4, qtd: 2, label: 'P11..P12' },
  { reg: 244, format: 2, qtd: 3, label: 'P14..P16' },
  { reg: 248, format: 2, qtd: 2, label: 'P17..P18' },
  { reg: 250, format: 4, qtd: 1, label: 'P19 Tlvd_retorno' },

  // Limiares de Alarme (Atu)
  { reg: 378, format: 2, qtd: 2, label: 'Atu AL01/AL02' },
  { reg: 381, format: 2, qtd: 4, label: 'Atu AL07/AL03/AL04/AL06' },
  { reg: 385, format: 2, qtd: 1, label: 'Atu AL08' },
  { reg: 387, format: 2, qtd: 1, label: 'Atu AL22' },
  { reg: 392, format: 2, qtd: 4, label: 'Atu AL14/AL12/AL17/AL19' },
  { reg: 400, format: 2, qtd: 4, label: 'Atu AL13/AL11/AL15/AL16' },
  { reg: 404, format: 2, qtd: 1, label: 'P13/AL23 Sens_Tbat' },
  { reg: 408, format: 2, qtd: 1, label: 'Atu AL20' },
  { reg: 411, format: 2, qtd: 1, label: 'Atu AL27' },

  // Opcoes de Alarme e Entradas Digitais (Opt)
  { reg: 330, format: 4, qtd: 2, label: 'Opt AL01/AL02' },
  { reg: 332, format: 4, qtd: 2, label: 'Opt AL05/AL07' },
  { reg: 334, format: 4, qtd: 2, label: 'Opt AL03/AL04' },
  { reg: 336, format: 4, qtd: 2, label: 'Opt AL06/AL08' },
  { reg: 339, format: 4, qtd: 1, label: 'Opt AL22' },
  { reg: 344, format: 4, qtd: 2, label: 'Opt CN1/CN2' },
  { reg: 346, format: 4, qtd: 2, label: 'Opt CN3/CN4' },
  { reg: 348, format: 4, qtd: 2, label: 'Opt CN5/CN6' },
  { reg: 350, format: 4, qtd: 2, label: 'Opt CN7/CN8' },
  { reg: 352, format: 4, qtd: 2, label: 'Opt AL14/AL12' },
  { reg: 354, format: 4, qtd: 2, label: 'Opt AL17/AL19' },
  { reg: 360, format: 4, qtd: 2, label: 'Opt AL13/AL11' },
  { reg: 362, format: 4, qtd: 2, label: 'Opt AL15/AL16' },
  { reg: 364, format: 4, qtd: 1, label: 'Opt AL23' },
  { reg: 368, format: 4, qtd: 1, label: 'Opt AL20' },
  { reg: 370, format: 4, qtd: 2, label: 'Opt AL26/AL27' },

  // Reles de Alarmes, Entradas Digitais e Status (264..327)
  { reg: 264, format: 4, qtd: 2, label: 'Rele ST01/ST02' },
  { reg: 266, format: 4, qtd: 2, label: 'Rele AL01/AL02' },
  { reg: 268, format: 4, qtd: 2, label: 'Rele AL05/AL07' },
  { reg: 270, format: 4, qtd: 2, label: 'Rele AL03/AL04' },
  { reg: 272, format: 4, qtd: 2, label: 'Rele AL06/AL08' },
  { reg: 274, format: 4, qtd: 2, label: 'Rele ST14/AL22' },
  { reg: 276, format: 4, qtd: 1, label: 'Rele ST21' },
  { reg: 279, format: 4, qtd: 1, label: 'Rele AL10' },
  { reg: 280, format: 4, qtd: 2, label: 'Rele CN1/CN2' },
  { reg: 282, format: 4, qtd: 2, label: 'Rele CN3/CN4' },
  { reg: 284, format: 4, qtd: 2, label: 'Rele CN5/CN6' },
  { reg: 286, format: 4, qtd: 2, label: 'Rele CN7/CN8' },
  { reg: 288, format: 4, qtd: 2, label: 'Rele AL14/AL12' },
  { reg: 290, format: 4, qtd: 2, label: 'Rele AL17/AL19' },
  { reg: 292, format: 4, qtd: 1, label: 'Rele AL18' },
  { reg: 296, format: 4, qtd: 2, label: 'Rele AL13/AL11' },
  { reg: 298, format: 4, qtd: 2, label: 'Rele AL15/AL16' },
  { reg: 300, format: 4, qtd: 2, label: 'Rele AL23/AL24' },
  { reg: 302, format: 4, qtd: 2, label: 'Rele AL25/AL21' },
  { reg: 304, format: 4, qtd: 1, label: 'Rele AL20' },
  { reg: 306, format: 4, qtd: 2, label: 'Rele AL26/AL27' },
  { reg: 309, format: 4, qtd: 2, label: 'Rele ST18/ST19' },
  { reg: 311, format: 4, qtd: 2, label: 'Rele ST20/ST13' },
  { reg: 314, format: 4, qtd: 2, label: 'Rele ST15/ST16' },
  { reg: 316, format: 4, qtd: 2, label: 'Rele ST17/ST04' },
  { reg: 318, format: 4, qtd: 2, label: 'Rele ST03/ST05' },
  { reg: 320, format: 4, qtd: 2, label: 'Rele ST06/ST10' },
  { reg: 322, format: 4, qtd: 2, label: 'Rele ST07/ST08' },
  { reg: 324, format: 4, qtd: 2, label: 'Rele ST09/ST11' },
  { reg: 326, format: 4, qtd: 2, label: 'Rele ST12/ST22' },
];

const UR_SISTEMA_NAMES: Record<number, string> = {
  0: '1P2W-127',
  1: '1P2W-220',
  2: '3P3W-220',
  3: '3P4W-380',
};

const SINOTICO_NAMES: Record<number, string> = {
  0: 'NENHUM',
  1: 'AC,ALM',
  9: 'AC,FLT',
  2: 'RET,ALM',
  10: 'RET,FLT',
  3: 'BAT,ALM',
  11: 'BAT,FLT',
  4: 'CON,ALM',
  12: 'CON,FLT',
};

const DIN_CMD_NAMES: Record<number, string> = {
  0: 'NENHUM',
  1: 'INIBIR',
  2: 'REMOTO',
  3: 'DESLIGA',
  4: 'RESET',
  5: 'CARG.MAN',
  6: 'EQUAL.',
  17: 'EMG.UDQ',
  18: 'STD_BY',
  19: 'DJ_CA',
  20: 'DJB_DES',
  21: 'DJC_DES',
};

export function isEmpty16(v: number | undefined): boolean {
  return v === undefined || v === EMPTY_I16 || v === 32768;
}

export function isEmpty32(v: number | undefined): boolean {
  return v === undefined || ((v >>> 0) === EMPTY_I32_U);
}

export function unpackReles(raw: number | undefined) {
  if (isEmpty32(raw)) return { rp1: 0, rp2: 0, re11: 0, re12: 0, re21: 0, re22: 0 };
  const u = (raw as number) >>> 0;
  return {
    rp1: (u >>> 0) & 0x1f,
    rp2: (u >>> 5) & 0x1f,
    re11: (u >>> 10) & 0x1f,
    re12: (u >>> 15) & 0x1f,
    re21: (u >>> 20) & 0x1f,
    re22: (u >>> 25) & 0x1f,
  };
}

export function unpackAcao(acaoBits: number): string {
  if (!acaoBits) return 'NENHUM';
  const parts: string[] = [];
  if (acaoBits & 1) parts.push('ALM');
  if (acaoBits & 4) parts.push('BLQ');
  if (acaoBits & 2) parts.push('RT');
  return parts.length ? parts.join(',') : 'NENHUM';
}

export function unpackAlarmeOptions(raw: number | undefined, isMinutes = false) {
  if (isEmpty32(raw)) {
    return { retardo_raw: '—', retardo_s: null as number | null, acao: '—', sinotico: 'NENHUM', comando: 'NENHUM', tipo: 'DESL' };
  }
  const u = (raw as number) >>> 0;
  const ret = u & 0xffff;
  const acao = (u >>> 16) & 0xf;
  const led = (u >>> 20) & 0xf;
  const cmd = (u >>> 24) & 0x1f;
  const invert = (u >>> 29) & 1;
  const enable = (u >>> 30) & 1;
  return {
    retardo_s: isMinutes ? ret * 60 : ret / 10,
    retardo_raw: isMinutes ? `${ret}min` : `${(ret / 10).toFixed(1).replace('.', ',')}s`,
    acao: unpackAcao(acao),
    sinotico: SINOTICO_NAMES[led] ?? `LED#${led}`,
    comando: DIN_CMD_NAMES[cmd] ?? `CMD#${cmd}`,
    tipo: enable ? (invert ? 'NF' : 'NA') : 'DESL',
  };
}

export function unpackSensorInt(raw: number | undefined, kind: 'vcc' | 'icc' | 'vca' | 'ica'): string {
  if (isEmpty32(raw)) return 'EMPTY';
  const u = (raw as number) >>> 0;
  const empty = (u >>> 31) & 1;
  if (empty) return 'EMPTY';
  const tipo = (u >>> 24) & 0x7f;
  const valor = u & 0xffff;
  const valStr = valor === 0x8000 ? '' : ` (${(valor / 10).toFixed(1)} kΩ)`;
  if (kind === 'vcc') {
    const tName = tipo === 1 ? 'Diferencial' : tipo === 2 ? 'Isolado' : `Tipo ${tipo}`;
    return `${tName}${valStr}`;
  }
  if (kind === 'icc') {
    return tipo === 1 ? 'ShuntIso60mV' : tipo === 2 ? 'ShuntDif60mV' : `Tipo ${tipo}`;
  }
  if (kind === 'vca') {
    const tName = tipo === 1 ? 'Isolado' : tipo === 2 ? 'Diferencial' : `Tipo ${tipo}`;
    return `${tName}${valStr}`;
  }
  return tipo === 1 ? 'TC 5A' : `Tipo ${tipo}`;
}

export function unpackSensorExt(raw: number | undefined, kind: 'shunt' | 'vca' | 'ica'): string {
  if (isEmpty32(raw)) return 'EMPTY';
  const u = (raw as number) >>> 0;
  const empty = (u >>> 31) & 1;
  if (empty) return 'EMPTY';
  const tipo = (u >>> 24) & 0x7f;
  const valor2 = (u >>> 16) & 0xff;
  const valor1 = u & 0xffff;
  if (kind === 'shunt') {
    return valor1 === 0x8000 ? 'EMPTY' : `${(valor1 / 10).toFixed(1)} A`;
  }
  if (kind === 'vca') {
    if (tipo === 0) return 'Direto';
    const tName = tipo === 1 ? 'TP 24V' : tipo === 2 ? 'TP 115V' : `Tipo ${tipo}`;
    return `${tName} (${valor1 === 0x8000 ? '---' : `${(valor1 / 10).toFixed(1)} V`})`;
  }
  const tcStr = valor1 === 0x8000 ? 'EMPTY' : `${(valor1 / 10).toFixed(1)} A`;
  const espStr = valor2 === 0x80 ? 'EMPTY!' : `${valor2} esp.`;
  return `${tcStr} / ${espStr}`;
}

function s4(n: number): number {
  const v = n & 0xf;
  return v >= 8 ? v - 16 : v;
}

export interface UgeSnapshot {
  timestamp: string;
  regsRead: number;
  regsTotal: number;
  raw: Record<number, number>;
  base: Record<string, any>;
  sensores: Array<{ reg: number; nome: string; valor: string; rawHex: string }>;
  parametros: Record<string, { descricao: string; valor: number | null; unidade: string; reg: number }>;
  alarmes: Record<string, {
    descricao: string;
    valor: number | null;
    unidade: string;
    retardo_raw: string;
    acao: string;
    reles: ReturnType<typeof unpackReles>;
  }>;
  entradas_digitais: Record<string, {
    descricao: string;
    tipo: string;
    sinotico: string;
    retardo_raw: string;
    acao: string;
    comando: string;
    reles: ReturnType<typeof unpackReles>;
  }>;
  saidas_rele: Record<string, { descricao: string; reles: ReturnType<typeof unpackReles> }>;
}

const PARAM_DEFS: Array<[string, number, string, string, number, boolean]> = [
  ['P01', 232, 'TENSÃO DE FLUTUAÇÃO', 'V', 0.1, false],
  ['P02', 233, 'TENSÃO DE EQUALIZAÇÃO', 'V', 0.1, false],
  ['P03', 234, 'TENSÃO DE CARGA PROFUNDA', 'V', 0.1, false],
  ['P04', 235, 'TENSÃO MÁXIMA CONSUMIDOR', 'V', 0.1, false],
  ['P05', 236, 'TENSÃO MODO EMERGÊNCIA UDQ', 'V', 0.1, false],
  ['P06', 237, 'CORRENTE RETIFICADOR', 'A', 0.1, false],
  ['P07', 238, 'CORRENTE BATERIA', 'A', 0.1, false],
  ['P08', 239, 'CORRENTE ATUAÇÃO EQUALIZAÇÃO', 'A', 0.1, false],
  ['P09', 240, 'TEMPO RETARDO EQUALIZAÇÃO', 'min', 1 / 60, true],
  ['P10', 241, 'CORRENTE ATUAÇÃO FLUTUAÇÃO', 'A', 0.1, false],
  ['P11', 242, 'TEMPO RETENÇÃO EQUALIZAÇÃO', 'min', 1 / 60, true],
  ['P12', 243, 'TEMPO MÁX. EQUALIZAÇÃO AUTO.', 'h', 1 / 3600, true],
  ['P13', 404, 'NÚMERO SENSORES TEMP. BATERIA', 'sensores', 1, false],
  ['P14', 244, 'TEMPERATURA DE REFERÊNCIA', 'ºC', 0.1, false],
  ['P15', 245, 'COEFICIENTE DE COMPENSAÇÃO', 'V/ºC', 0.001, false],
  ['P16', 246, 'TEMP. MÍNIMA PARA COMPENSAR', 'ºC', 0.1, false],
  ['P17', 248, 'TESTE BATERIA - TENSÃO FINAL', 'V', 0.1, false],
  ['P18', 249, 'TESTE BATERIA - CORRENTE DESCARGA', 'A', 0.1, false],
  ['P19', 250, 'RETORNO LVD', 'min', 1 / 60, true],
];

const ALARM_DEFS: Array<[string, string, number | null, number, string, number | null, number | null]> = [
  ['AL01', 'SUBTENSÃO CA', 378, 0.1, 'V', 330, 266],
  ['AL02', 'SOBRETENSÃO CA', 379, 0.1, 'V', 331, 267],
  ['AL03', 'SUBFREQUÊNCIA CA', 382, 0.1, 'Hz', 334, 270],
  ['AL04', 'SOBREFREQUÊNCIA CA', 383, 0.1, 'Hz', 335, 271],
  ['AL05', 'FALTA DE FASE', null, 1, '-', 332, 268],
  ['AL06', 'SEQUÊNCIA DE FASE', 384, 1, '-', 336, 272],
  ['AL07', 'DESEQUILÍBRIO DE FASE', 381, 0.1, '%', 333, 269],
  ['AL08', 'VCA ANORMAL DISTORÇÃO', 385, 0.1, '%', 337, 273],
  ['AL09', 'PERDA DE SUPERVISÃO', null, 1, '-', null, null],
  ['AL10', 'PROTEÇÃO INTERNA', null, 1, '-', null, 279],
  ['AL11', 'SUBTENSÃO CONSUMIDOR', 401, 0.1, 'V', 361, 297],
  ['AL12', 'SOBRETENSÃO CONSUMIDOR', 393, 0.1, 'V', 353, 289],
  ['AL13', 'SUBTENSÃO RETIFICADOR/BATERIA', 400, 0.1, 'V', 360, 296],
  ['AL14', 'SOBRETENSÃO RETIFICADOR/BATERIA', 392, 0.1, 'V', 352, 288],
  ['AL15', 'BATERIA EM DESCARGA', 402, 0.1, 'A', 362, 298],
  ['AL16', 'FIM DE BATERIA', 403, 0.1, 'V', 363, 299],
  ['AL17', 'SOBRECARGA CONSUMIDOR', 394, 0.1, 'A', 354, 290],
  ['AL18', 'FLUTUAÇÃO ANORMAL', null, 1, '-', null, 292],
  ['AL19', 'SOBRETEMPERATURA BATERIA', 395, 0.1, 'ºC', 355, 291],
  ['AL20', 'MANUTENÇÃO', 408, 0.1, 'kh', 368, 304],
  ['AL21', 'FALHA UDQ', null, 1, '-', null, 303],
  ['AL22', 'FALHA CA REINCIDENTE', 387, 1, 'falhas', 339, 275],
  ['AL23', 'FALHA SENSOR TEMP. BATERIA', 404, 1, '-', 364, 300],
  ['AL24', 'EQUAL. AUTO. NÃO CONCLUÍDA', null, 1, '-', null, 301],
  ['AL25', 'OPERAÇÃO MAN. NÃO CONCLUÍDA', null, 1, '-', null, 302],
  ['AL26', 'TENSÃO ALTA CONSUMIDOR', null, 1, '-', 370, 306],
  ['AL27', 'BATERIA CAPACIDADE BAIXA', 411, 0.1, 'Ah', 371, 307],
];

const STATUS_DEFS: Array<[string, number, string]> = [
  ['01', 264, 'DESLIGADO PELO USUÁRIO'],
  ['02', 265, 'RETIFICADOR EM STANDBY'],
  ['03', 318, 'RETIFICADOR DISPONÍVEL'],
  ['04', 317, 'RETIFICADOR LIGADO'],
  ['05', 319, 'CARGA AUTOMÁTICA'],
  ['06', 320, 'CARGA MANUAL'],
  ['07', 322, 'CARREGADOR EM EQUALIZAÇÃO'],
  ['08', 323, 'CARREGADOR EM FLUTUAÇÃO'],
  ['09', 324, 'UDQ ATIVA'],
  ['10', 321, 'CARGA INIBIDA'],
  ['11', 325, 'COMANDO REMOTO'],
  ['12', 326, 'TESTE DE BATERIA'],
  ['13', 312, 'UR EM MODO MANUAL'],
  ['14', 274, '02 OU MAIS URs EM FALHA'],
  ['15', 314, 'UR EM FALHA'],
  ['16', 315, 'UR EM SOBRETEMPERATURA'],
  ['17', 316, 'UR LIGADA'],
  ['18', 309, 'UR AUSENTE'],
  ['19', 310, 'UR EM SUBTENSÃO'],
  ['20', 311, 'UR EM SOBRETENSÃO'],
  ['21', 276, 'RETIFICADOR EM LIMITAÇÃO DE CORRENTE'],
  ['22', 327, 'TESTE DE RELÉS'],
];

export function decodeUgeRegisters(raw: Record<number, number>, regsRead: number, regsTotal: number): UgeSnapshot {
  const r16 = (reg: number, scale = 1): number | null => {
    const v = raw[reg];
    if (isEmpty16(v)) return null;
    return Math.round(v * scale * 1000) / 1000;
  };
  const r32 = (reg: number, scale = 1): number | null => {
    const v = raw[reg];
    if (isEmpty32(v)) return null;
    return Math.round(v * scale * 1000) / 1000;
  };

  const rfRaw = raw[178];
  const rf = isEmpty32(rfRaw)
    ? { desconexao_ca: 0, udq_estagio_1: 0, udq_estagio_2: 0, udq_estagio_3: 0, desconexao_cc: 0 }
    : {
        desconexao_ca: s4((rfRaw >>> 0) & 0xf),
        udq_estagio_1: s4((rfRaw >>> 12) & 0xf),
        udq_estagio_2: s4((rfRaw >>> 16) & 0xf),
        udq_estagio_3: s4((rfRaw >>> 20) & 0xf),
        desconexao_cc: s4((rfRaw >>> 24) & 0xf),
      };

  const sistRaw = raw[171];
  const sextIca = raw[214];
  const sextIret = raw[211];
  const sextIbat = raw[212];

  const base: Record<string, any> = {
    horimetro_horas: r32(130, 1),
    horimetro_ciclos: r16(131, 1),
    sn_equip: r32(160, 1),
    vcc_nom: r16(161, 0.1),
    vcc_max_pct: r16(162, 0.1), // pu x1000 -> % (ex: 1100 -> 110%)
    icc_nom: r16(163, 0.1),
    icc_max_pct: r16(164, 0.1),
    vca_nom: r16(165, 0.1),
    vca_min_pct: r16(166, 0.1),
    vca_max_pct: r16(167, 0.1),
    freq_nom: r16(168, 0.1),
    ur_vcc_eme: r16(169, 0.1),
    ur_quantidade: r16(170, 1),
    ur_sistema: isEmpty16(sistRaw) ? null : (UR_SISTEMA_NAMES[sistRaw] ?? `#${sistRaw}`),
    reles_fixos: rf,
    udq_diodos: r16(181, 1),
    udq_diodo_bloqueio: isEmpty16(raw[182]) ? null : (raw[182] & 0x3),
    sensor_ica_tipo: (() => {
      const s = unpackSensorInt(raw[198], 'ica');
      return s === 'TC 5A' ? 'TC' : s;
    })(),
    sensor_ica_tc_a: isEmpty32(sextIca) || (sextIca & 0xffff) === 0x8000 ? null : (sextIca & 0xffff) / 10,
    sensor_ica_espiras: isEmpty32(sextIca) || ((sextIca >>> 16) & 0xff) === 0x80 ? null : ((sextIca >>> 16) & 0xff),
    sensor_iret_tipo: unpackSensorInt(raw[195], 'icc'),
    sensor_iret_shunt_a: isEmpty32(sextIret) || (sextIret & 0xffff) === 0x8000 ? null : (sextIret & 0xffff) / 10,
    sensor_ibat_tipo: unpackSensorInt(raw[196], 'icc'),
    sensor_ibat_shunt_a: isEmpty32(sextIbat) || (sextIbat & 0xffff) === 0x8000 ? null : (sextIbat & 0xffff) / 10,
  };

  const hex32 = (reg: number) => raw[reg] === undefined ? '—' : `0x${(raw[reg] >>> 0).toString(16).padStart(8, '0')}`;
  const sensores = [
    { reg: 192, nome: 'SInt Vret1 (Tensão Ret. 1)', valor: unpackSensorInt(raw[192], 'vcc'), rawHex: hex32(192) },
    { reg: 193, nome: 'SInt Vret2 (Tensão Ret. 2)', valor: unpackSensorInt(raw[193], 'vcc'), rawHex: hex32(193) },
    { reg: 194, nome: 'SInt Vcons (Tensão Cons.)', valor: unpackSensorInt(raw[194], 'vcc'), rawHex: hex32(194) },
    { reg: 195, nome: 'SInt Iret (Corr. Ret.)', valor: unpackSensorInt(raw[195], 'icc'), rawHex: hex32(195) },
    { reg: 211, nome: 'SExt Iret (Shunt Ret.)', valor: unpackSensorExt(raw[211], 'shunt'), rawHex: hex32(211) },
    { reg: 196, nome: 'SInt Ibat (Corr. Bat.)', valor: unpackSensorInt(raw[196], 'icc'), rawHex: hex32(196) },
    { reg: 212, nome: 'SExt Ibat (Shunt Bat.)', valor: unpackSensorExt(raw[212], 'shunt'), rawHex: hex32(212) },
    { reg: 197, nome: 'SInt Vca (Tensão CA)', valor: unpackSensorInt(raw[197], 'vca'), rawHex: hex32(197) },
    { reg: 213, nome: 'SExt Vca (TP Externo)', valor: unpackSensorExt(raw[213], 'vca'), rawHex: hex32(213) },
    { reg: 198, nome: 'SInt Ica (Corr. CA)', valor: unpackSensorInt(raw[198], 'ica'), rawHex: hex32(198) },
    { reg: 214, nome: 'SExt Ica (TC + Espiras)', valor: unpackSensorExt(raw[214], 'ica'), rawHex: hex32(214) },
  ];

  const parametros: UgeSnapshot['parametros'] = {};
  for (const [code, reg, desc, unit, scale, is32] of PARAM_DEFS) {
    parametros[code] = {
      descricao: desc,
      valor: is32 ? r32(reg, scale) : r16(reg, scale),
      unidade: unit,
      reg,
    };
  }

  const alarmes: UgeSnapshot['alarmes'] = {};
  for (const [code, desc, regAtu, scale, unit, regOpt, regRele] of ALARM_DEFS) {
    const opt = regOpt !== null ? unpackAlarmeOptions(raw[regOpt], code === 'AL27') : { retardo_raw: '—', acao: '—' };
    alarmes[code] = {
      descricao: desc,
      valor: regAtu !== null ? r16(regAtu, scale) : null,
      unidade: unit,
      retardo_raw: opt.retardo_raw,
      acao: opt.acao,
      reles: regRele !== null ? unpackReles(raw[regRele]) : unpackReles(undefined),
    };
  }

  const entradas_digitais: UgeSnapshot['entradas_digitais'] = {};
  for (let i = 1; i <= 8; i++) {
    const code = `CN${i}`;
    const opt = unpackAlarmeOptions(raw[343 + i], false);
    entradas_digitais[code] = {
      descricao: `ENTRADA DIGITAL D${i}`,
      tipo: opt.tipo,
      sinotico: opt.sinotico,
      retardo_raw: opt.retardo_raw,
      acao: opt.acao,
      comando: opt.comando,
      reles: unpackReles(raw[279 + i]),
    };
  }

  const saidas_rele: UgeSnapshot['saidas_rele'] = {};
  for (const [code, reg, desc] of STATUS_DEFS) {
    saidas_rele[code] = {
      descricao: desc,
      reles: unpackReles(raw[reg]),
    };
  }

  return {
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    regsRead,
    regsTotal,
    raw,
    base,
    sensores,
    parametros,
    alarmes,
    entradas_digitais,
    saidas_rele,
  };
}
