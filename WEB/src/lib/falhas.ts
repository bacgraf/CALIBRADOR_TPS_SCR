export const dicionarioFalhas: Record<string, any> = {
  "0": {
    "nome": "EEPROM",
    "desc": "Falha de comunicacao I2C ou dados base.",
    "exts": {
      "0": "Memoria em branco (Nova). Necessita Init.",
      "1": "Versao incompativel.",
      "2": "Erro de Checksum/Corrupto.",
      "4": "Erro I2C na Leitura.",
      "8": "Erro I2C na Gravacao.",
      "16": "Erro I2C no Apagamento."
    }
  },
  "1": {
    "nome": "PARAM",
    "desc": "Parametrizacao de fabrica invalida ou incompleta.",
    "exts": {
      "0": "Alteracao pendente. Reinicie CPU.",
      "160": "SN_Equip (Nº Serie Equipamento)",
      "161": "Vcc_nom (Tensão CC Nominal)",
      "162": "Vcc_max (Tensão CC Máxima)",
      "163": "Icc_nom (Corrente CC Nominal)",
      "164": "Icc_max (Corrente CC Máxima)",
      "165": "Vca_nom (Tensão CA Nominal)",
      "166": "Vca_min (Tensão CA Mínima)",
      "167": "Vca_max (Tensão CA Máxima)",
      "168": "Freq_nom (Frequência Rede)",
      "169": "REG_UR_Vcc_eme(Tensão em modo de emergência das UR inválida)",
      "170": "REG_UR_Quantidade	(Quantida de URs inválida ou não inicializada)",
      "171": "REG_UR_Sistema	(Tipo de sistema inválido ou não inicializado)",
      "172": "TR_FST (Fator Sobretensão Trafo)",
      "173": "TR_defas1 (Defasagem TR 1)",
      "174": "TR_defas2 (Defasagem TR 2)",
      "175": "Ctrl_Ret (Controlador Retificador)",
      "176": "Ctrl_UDQ (Controlador UDQ)",
      "177": "Delay_Partida (Hot Stand-by)",
      "178": "Reles_Fixos (Relés Fixos)",
      "179": "Cap_V (Tensão Nominal Cap. CA)",
      "180": "Cap_Q (Pot. Reativa Cap. CA)",
      "181": "UDQ_diodos (Número Diodos UDQ)",
      "192": "SInt_Vret1 (Sensor Interno Vret1)",
      "193": "SInt_Vret2 (Sensor Interno Vret2)",
      "194": "SInt_Vcons (Sensor Interno Vcons)",
      "195": "SInt_Iret (Sensor Interno Iret)",
      "196": "SInt_Ibat (Sensor Interno Ibat)",
      "197": "SInt_Vca (Sensor Interno Vca)",
      "198": "SInt_Ica (Sensor Interno Ica)",
      "199": "SInt_Tret (Sensor Interno Temp. Ret.)",
      "200": "SInt_Icons (Sensor Interno Icons)",
      "201": "SInt_Vbat (Sensor Interno Vbat)",
      "208": "SExt_Vret1 (Sensor Externo Vret1)",
      "209": "SExt_Vret2 (Sensor Externo Vret2)",
      "210": "SExt_Vcons (Sensor Externo Vcons)",
      "211": "SExt_Iret (Sensor Externo Iret)",
      "212": "SExt_Ibat (Sensor Externo Ibat)",
      "213": "SExt_Vca (Sensor Externo Vca)",
      "214": "SExt_Ica (Sensor Externo Ica)",
      "215": "SExt_Tret (Sensor Externo Temp. Ret.)",
      "216": "SInt_Icons (Sensor Interno Icons)",
      "217": "SExt_Vbat (Sensor Externo Vbat)"
    }
  },
  "2": {
    "nome": "REBOOT",
    "desc": "Comando de reinicializacao recebido.",
    "exts": {}
  },
  "3": {
    "nome": "WATCHDOG",
    "desc": "Travamento de CPU recuperado por hardware.",
    "exts": {
      "0": "Trava na CPU Principal.",
      "1": "Trap de operacao ilegal.",
      "2": "Travamento do Coprocessador (CLA)."
    }
  },
  "4": {
    "nome": "VCC_POL",
    "desc": "Inversao de polaridade de Tensao CC nos bornes.",
    "exts": {
      "1": "Inversao no Canal Vret1.",
      "2": "Inversao no Canal Vret2.",
      "3": "Inversao no Canal Vcons."
    }
  },
  "5": {
    "nome": "SENS_VCA",
    "desc": "Falha/Rompimento no sensor de Tensao CA.",
    "exts": {
      "1": "Canal de Leitura Vab.",
      "2": "Canal de Leitura Vbc."
    }
  },
  "6": {
    "nome": "SENS_ICA",
    "desc": "Falha no sensor de Corrente CA.",
    "exts": {
      "1": "Canal de Corrente Ia.",
      "3": "Canal de Corrente Ic."
    }
  },
  "7": {
    "nome": "SENS_VCC",
    "desc": "Falha de feedback de Tensao CC.",
    "exts": {
      "1": "Divergencia entre medicao Vret1 e Vret2.",
      "2": "Sem tensao CC reportada no Consumidor."
    }
  },
  "8": {
    "nome": "SENS_ICC",
    "desc": "Falha no sensor de Corrente CC do Indutor.",
    "exts": {
      "1": "Leitura do Iret1 em negativo constante.",
      "2": "Leitura do Iret2 em negativo constante."
    }
  },
  "10": {
    "nome": "DRIVERS",
    "desc": "Atuacao massiva do chip isolador /FAULT.",
    "exts": {}
  },
  "11": {
    "nome": "PRECARGA",
    "desc": "Falha na subrotina de energizacao de Trafo.",
    "exts": {}
  },
  "12": {
    "nome": "DISPARO",
    "desc": "Falha severa na comutacao SCR de Potencia.",
    "exts": {
      "0": "Angulo maximo e zero amperes.",
      "1": "Sem deteccao no Indutor 1.",
      "2": "Sem deteccao no Indutor 2.",
      "3": "Retificacao Meia-Onda Ponte 1.",
      "4": "Retificacao Meia-Onda Ponte 2.",
      "5": "Reitificacao Monofasica.",
      "7": "Extremo Desequilibrio nos capacitores AC."
    }
  },
  "13": {
    "nome": "PARTIDA",
    "desc": "Presenca de Corrente parasita antes de trigar.",
    "exts": {}
  },
  "14": {
    "nome": "REGULACAO",
    "desc": "Deficiencia no controle de malha PID.",
    "exts": {
      "0": "Queda de tensao interna altissima (Cabos?)",
      "3": "Desbalanco catastrofico Iret1 > Iret2",
      "4": "Desbalanco catastrofico Iret2 > Iret1"
    }
  },
  "16": {
    "nome": "VCC_SOBRE",
    "desc": "Sobretensao de saida Intrinseca.",
    "exts": {
      "1": "Vret1 Pico Imediato (> Hardware Limiter)",
      "2": "Vret1 Estourado por Tempo > 200ms",
      "5": "Consumidor Ultrapassou Limite UDQ"
    }
  },
  "17": {
    "nome": "ICC_SOBRE",
    "desc": "Sobrecorrente CC Intrinseca.",
    "exts": {
      "1": "Retificador excedeu Hard-Limit de fábrica.",
      "5": "Religacao massiva atuando proteção final",
      "6": "Corrente excessiva de Baterias sustentada."
    }
  },
  "18": {
    "nome": "ICA_SOBRE",
    "desc": "Sobrecorrente de Entrada.",
    "exts": {
      "1": "Surto Fase R.",
      "2": "Surto Fase S.",
      "3": "Surto Fase T."
    }
  },
  "19": {
    "nome": "UDQ",
    "desc": "Protecao Acionada no modulo Step-Down CC.",
    "exts": {
      "0": "Sem erro (Normal)",
      "1": "Aquecimento excesivo ou Fritura Dissipador"
    }
  },
  "20": {
    "nome": "CURTO",
    "desc": "Deteccao de Baixissima Impedancia.",
    "exts": {
      "0": "Nos bornes direcionais do Consumidor.",
      "1": "Nos cabos ou banco de Baterias CC."
    }
  }
};
