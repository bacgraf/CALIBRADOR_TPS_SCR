# Mapa de Registradores CAN — UGE TPS125

Este documento descreve todos os registradores disponíveis na comunicação CAN entre a UGE TPS125 e a IHM.

> **Status:** Validado contra DWARF / COFF do compilador TI C2000 (`com.teksea.retificador125.uge-280225A-burnin.out`)

## Convenções

### Permissões
- **R** — Somente leitura
- **R/W** — Leitura e escrita
- **CMD** — Comando (escrita executa uma ação, sem valor armazenado)

### Escala (mult)
Os valores numéricos transmitidos na rede são inteiros escalados em unidades SI. Para converter entre valor de rede e valor real (SI):

```
valor_real_SI = valor_rede × escala
valor_rede    = round(valor_real_SI / escala)
```

| Código | Escala (×) | Exemplo |
|--------|-----------|---------|
| un     | 1         | inteiro sem escala |
| deci   | 0.1       | 1253 ↔ 125.3 V |
| centi  | 0.01      | 9876 ↔ 98.76 |
| milli  | 0.001     | 300 ↔ 0.300 V/°C |
| micro* | 0.0001    | 150 ↔ +1.50% ganho |
| deca   | 10        | 125 ↔ 1250 W |
| kilo   | 1000      | 60 (s na rede) ↔ 60.000 ms na RAM |

### Base PU (armazenamento interno na UGE)
Registradores marcados com `BPU_*` são armazenados **internamente na RAM da UGE em por unidade (pu)** (`float`), mas **trafegam no barramento CAN já convertidos em unidades SI escaladas** (`V`, `A`, `Hz`, `V/°C`, `Ah`). A própria UGE multiplica/divide pela base nominal ao enviar/receber na CAN:

```
valor_rede = round(valor_SI / escala)
valor_pu_interno = (valor_rede × escala) / base_nominal
```

| Base     | Grandeza         |
|----------|-----------------|
| BPU_Vcc  | Tensão CC nominal (ex: 125 V) |
| BPU_Icc  | Corrente CC nominal (ex: 100 A) |
| BPU_Vca  | Tensão CA nominal (ex: 220 V) |
| BPU_Fca  | Frequência CA nominal (ex: 60 Hz) |

### Valor Vazio (EMPTY)
Quando um registrador não possui valor válido, a UGE retorna o valor especial **EMPTY** para o tipo correspondente:

| Tipo   | Valor EMPTY |
|--------|-------------|
| int16  | `0x8000` (-32768) |
| int32  | `0x80000000` |
| float32| `NaN` |
| int64  | `0x8000000000000000` |

---

## 5.1 Versão e Boot (1–6)

| Reg | Nome | Perm | Tipo | Escala | Base | Descrição |
|-----|------|------|------|--------|------|-----------|
| 1 | REG_Vers_FW | R | int64 | — | — | Número de versão do firmware (formato BCD estruturado) |
| 2 | REG_Vers_Build | R | str8 | — | — | String de build (7 caracteres, ex: `280225A`) |
| 5 | REG_Vers_Exp1 | R | int64 | — | — | Versão do firmware da placa de expansão de relés 1 |
| 6 | REG_Vers_Exp2 | R | int64 | — | — | Versão do firmware da placa de expansão de relés 2 |

> `REG_Vers_FW` é anunciado uma única vez no boot (`tuNumeroSW_dec`, 64 bits):
> - `bits [7:0]` — `SS`
> - `bits [15:8]` — `RR`
> - `bits [31:16]` — `NPPPP`
> - `bits [39:32]` — `EE`
> - `bits [47:40]` — `VV`
> - `bits [63:48]` — `TFFFF`

---

## 5.2 Medições CC (11–18)

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Descrição |
|-----|------|------|------|--------|------|---------|-----------|
| 11 | REG_Vret | R | int16 | ×0.1 | — | V | Tensão de saída do retificador |
| 12 | REG_Vbat | R | int16 | ×0.1 | — | V | Tensão de bateria (mesmo sensor que Vret) |
| 13 | REG_Vcons | R | int16 | ×0.1 | — | V | Tensão no consumidor |
| 14 | REG_Temp_Bat | R | int16 | ×0.1 | — | °C | Temperatura média da bateria |
| 15 | REG_Iret | R | int16 | ×0.1 | — | A | Corrente de saída do retificador |
| 16 | REG_Ibat | R | int16 | ×0.1 | — | A | Corrente de bateria (positivo = carga, negativo = descarga) |
| 17 | REG_Icons | R | int16 | ×0.1 | — | A | Corrente no consumidor |
| 18 | REG_Reserved1 | R | int16 | ×0.1 | — | — | Reservado (retorna EMPTY) |

> REG_Ibat pode ser negativo durante teste de bateria (descarga). Em standby, REG_Ibat e REG_Icons retornam EMPTY.

---

## 5.3 Medições CA (19–26)

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Descrição |
|-----|------|------|------|--------|------|---------|-----------|
| 19 | REG_Vca_RS | R | int16 | ×1 | — | V | Tensão CA fase R-S (RMS) |
| 20 | REG_Vca_ST | R | int16 | ×1 | — | V | Tensão CA fase S-T (RMS) |
| 21 | REG_Vca_TR | R | int16 | ×1 | — | V | Tensão CA fase T-R (RMS) |
| 22 | REG_Vca_freq | R | int16 | ×0.1 | — | Hz | Frequência da rede CA |
| 23 | REG_Ica_R | R | int16 | ×0.1 | — | A | Corrente CA fase R (RMS) |
| 24 | REG_Ica_S | R | int16 | ×0.1 | — | A | Corrente CA fase S (RMS) |
| 25 | REG_Ica_T | R | int16 | ×0.1 | — | A | Corrente CA fase T (RMS) |
| 26 | REG_Vca_seq | R | int16 | ×1 | — | — | Sequência de fases (0=positiva, 1=negativa) |

> REG_Vca_RS/ST/TR retornam EMPTY se o PLL não estiver estabilizado.

---

## 5.4 Grandezas Elétricas (35–52)

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Descrição |
|-----|------|------|------|--------|------|---------|-----------|
| 35 | REG_Vsint | R | int16 | ×0.1 | BPU_Vcc | V | Tensão síntese (aponta para `_EMPTY_F32` no TPS125) |
| 36 | REG_Alfa1 | — | — | — | — | — | Não mapeado no TPS125 (`ptr=0` → `NACK_Inexistente`, legado SCR) |
| 37 | REG_Alfa2 | — | — | — | — | — | Não mapeado no TPS125 (`ptr=0` → `NACK_Inexistente`, legado SCR) |
| 38 | REG_Vripple | R | int16 | ×0.01 | — | V | Ripple de tensão CC (RMS AC) |
| 39 | REG_Iret_dif | R | int16 | ×1 | — | — | Diferença de corrente entre sensores (`_EMPTY_F32`) |
| 40 | REG_Rendimento | R | int16 | ×0.01 | — | % | Rendimento do retificador |
| 41 | REG_Pcc | R | int16 | ×10 | — | W | Potência ativa CC |
| 42 | REG_Pca | R | int16 | ×10 | — | W | Potência ativa CA |
| 43 | REG_Sca | R | int16 | ×10 | — | VA | Potência aparente CA |
| 44 | REG_FP | R | int16 | ×0.01 | — | — | Fator de potência total |
| 45 | REG_P1 | R | int16 | ×10 | — | W | Potência ativa fundamental |
| 46 | REG_Q1 | R | int16 | ×10 | — | VAr | Potência reativa fundamental |
| 47 | REG_S1 | R | int16 | ×10 | — | VA | Potência aparente fundamental |
| 48 | REG_FD | R | int16 | ×0.01 | — | — | Fator de deslocamento (cos φ) |
| 49 | REG_UF_V | R | int16 | ×0.1 | — | % | Desequilíbrio de tensão CA |
| 50 | REG_DF_V | R | int16 | ×0.1 | — | % | Distorção harmônica de tensão (THD-V) |
| 51 | REG_UF_I | R | int16 | ×0.1 | — | % | Desequilíbrio de corrente CA |
| 52 | REG_DF_I | R | int16 | ×0.1 | — | % | Distorção harmônica de corrente (THD-I) |

> Registradores 35–52 retornam EMPTY se o conversor não estiver em estado ≥ EST_Pre_Teste.

---

## 5.5 Temperatura de Bateria Individual (59–66)

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Descrição |
|-----|------|------|------|--------|------|---------|-----------|
| 59 | REG_Temp_Bat_0 | R | int16 | ×0.1 | — | °C | Temperatura sensor 0 |
| 60 | REG_Temp_Bat_1 | R | int16 | ×0.1 | — | °C | Temperatura sensor 1 |
| 61 | REG_Temp_Bat_2 | R | int16 | ×0.1 | — | °C | Temperatura sensor 2 |
| 62 | REG_Temp_Bat_3 | R | int16 | ×0.1 | — | °C | Temperatura sensor 3 |
| 63 | REG_Temp_Bat_4 | R | int16 | ×0.1 | — | °C | Temperatura sensor 4 |
| 64 | REG_Temp_Bat_5 | R | int16 | ×0.1 | — | °C | Temperatura sensor 5 |
| 65 | REG_Temp_Bat_6 | R | int16 | ×0.1 | — | °C | Temperatura sensor 6 |
| 66 | REG_Temp_Bat_7 | R | int16 | ×0.1 | — | °C | Temperatura sensor 7 |

> Retornam EMPTY para sensores não conectados ou não configurados.

---

## 5.6 Status e Diagnóstico (67–99)

| Reg | Nome | Perm | Tipo | Escala | Base | Descrição |
|-----|------|------|------|--------|------|-----------|
| 67 | REG_Crono_Prog | R | int32 | bruto | — | Cronômetro de progresso da equalização (ver nota) |
| 68 | REG_Crono_Timeout | R | int32 | bruto | — | Cronômetro de timeout da equalização (ver nota) |
| 69 | REG_Tesbat_Cmed | R | int16 | ×0.01 | — | Carga medida no teste de bateria [Ah] |
| 70 | REG_Tesbat_Emed | R | int16 | ×1 | — | Energia medida no teste de bateria [Wh] |
| 73 | REG_Car_Modo_ativo | R | int16 | inteiro | — | Modo de carga ativo (ver tabela abaixo) |
| 74 | REG_Estado_Car | R | int16 | inteiro | — | Status do carregador para exibição na IHM (ver tabela abaixo) |
| 75 | REG_Erro_cod | R | int16 | inteiro | — | Código da última falha grave (ver `teFalhaGrave`) |
| 76 | REG_Erro_ext | R | int16 | inteiro | — | Código estendido da última falha grave |
| 77 | REG_Estado_UDQ | R | int16 | inteiro | — | Estado do módulo UDQ |
| 78 | REG_Falha_UDQ | R | int16 | bruto | — | Bitfield de falhas do módulo UDQ |
| 79 | REG_UDQ_Acao | R | int16 | inteiro | — | Ação atual do módulo UDQ |
| 80 | REG_Estado_Ret | R | int16 | inteiro | — | Estado da máquina principal (ver tabela abaixo) |
| 81 | REG_Ctrl_flags | R | int16 | bruto | — | Flags de status das malhas de controle |
| 82 | REG_Alarmes | R | int32 | bruto | — | Bitfield de alarmes e falhas (bits 0–31 de `tuGlobalStatusBits`) |
| 83 | REG_Alertas | R | int32 | bruto | — | Bitfield de alertas (bits 32–63 de `tuGlobalStatusBits`) |
| 84 | REG_Erro_flags | R | int32 | bruto | — | Bitfield de falhas graves ativas (`tuProtecaoBits`) |
| 85 | REG_Comandos | R | int32 | bruto | — | Bitfield de comandos ativos (`tuComandoRet`) |
| 86 | REG_Falha_bloq | R | int32 | bruto | — | Bitfield de falhas que bloqueiam a partida |
| 87 | REG_Reinicio | R | int32 | bruto | — | Bitfield de falhas que causaram o último reinício |
| 88 | REG_Uptime_CPU | R | int32 | inteiro | — | Tempo de funcionamento da CPU [ms] |
| 89 | REG_Uptime_Ret | R | int32 | inteiro | — | Tempo de funcionamento do retificador [ms] |
| 90 | REG_Horas | R | int32 | inteiro | — | Horímetro — horas acumuladas |
| 91 | REG_Ciclos | R | int16 | inteiro | — | Horímetro — ciclos de partida acumulados |
| 92 | REG_Boot | R | int32 | bruto | — | Informações do último boot (causa do reset) |
| 96 | REG_Sin_Rede | R | int16 | inteiro | — | Sinótico da entrada CA (ver tabela abaixo) |
| 97 | REG_Sin_Ret | R | int16 | inteiro | — | Sinótico do retificador (ver tabela abaixo) |
| 98 | REG_Sin_Bat | R | int16 | inteiro | — | Sinótico da bateria (ver tabela abaixo) |
| 99 | REG_Sin_Cons | R | int16 | inteiro | — | Sinótico do consumidor (ver tabela abaixo) |

### Valores de REG_Estado_Ret (teEstado)

| Valor | Nome | Descrição |
|-------|------|-----------|
| 0 | EST_Init | Inicialização |
| 1 | EST_Parametrizacao | Carregando parâmetros da EEPROM |
| 2 | EST_Protecao | Falha grave — retificador bloqueado |
| 3 | EST_Retido | Falha retida — aguardando reset |
| 4 | EST_Desligado | Desligado pelo usuário |
| 5 | EST_Espera | Aguardando delay de standby |
| 6 | EST_Iniciando | Iniciando |
| 7 | EST_Pre_Carga | Pré-carga em andamento |
| 8 | EST_Pre_Teste | Pré-teste |
| 9 | EST_Parando | Parando |
| 10 | EST_Partida | Partida gradativa |
| 11 | EST_Operando | Operando normalmente |

### Valores de REG_Estado_Car (teEstadoCargaSup)

| Valor | Nome | Descrição |
|-------|------|-----------|
| 0 | ECS_Desligado | Desligado |
| 1 | ECS_Alarme | Em alarme |
| 2 | ECS_Standby | Em standby |
| 3 | ECS_Iniciando | Iniciando |
| 4 | ECS_Ligando | Ligando |
| 5 | ECS_Flutuando | Flutuação |
| 6 | ECS_Equalizando | Equalização |
| 7 | ECS_Inibida | Carga inibida |
| 8 | ECS_Fonte | Modo fonte |
| 9 | ECS_Teste_Bat | Teste de bateria |
| 10 | ECS_Emergencia | Modo emergência |

### Valores de REG_Car_Modo_ativo (teModoCarga)

| Valor | Nome | Descrição |
|-------|------|-----------|
| -1 | MCG_Salvo | Último modo salvo na EEPROM |
| 0 | MCG_Auto | Automático (flutuação/equalização automática) |
| 1 | MCG_Flutuacao | Flutuação manual |
| 2 | MCG_Equalizacao | Equalização manual |
| 3 | MCG_Profunda | Equalização profunda |
| 4 | MCG_Fonte | Modo fonte |
| 5 | MCG_Teste_Bat | Teste de bateria |
| 6 | MCG_Emergencia | Emergência |

### Valores dos Sinóticos (teSinotico)

| Valor | Nome | Descrição |
|-------|------|-----------|
| 0 | SIN_Desligado | Desligado / inativo |
| 1 | SIN_Falha | Falha presente |
| 2 | SIN_Progresso | Em progresso / transitório |
| 3 | SIN_Operacional | Operando normalmente |
| 4 | SIN_Alerta1 | Alerta nível 1 |
| 5 | SIN_Alerta2 | Alerta nível 2 |

### Nota sobre REG_Crono_Prog, REG_Crono_Timeout e UDQ (78–79)

`REG_Crono_Prog` e `REG_Crono_Timeout` são do tipo `tuCronometro` (`int32` bruto):

```
bits [23:0]  — tempo em ms
bits [29:24] — rsvd
bit  [30]    — ativo (1 = cronômetro rodando)
bit  [31]    — empty
```

`REG_Falha_UDQ` (78) usa `tuUDQ_Falhas` (`int16` bruto):
```
bit  [0]     — temperatura
bit  [1]     — queda
bit  [2]     — oscilacao
bit  [3]     — sensor
bits [14:4]  — rsvd
bit  [15]    — empty
```

`REG_UDQ_Acao` (79) usa `tuUDQ_Acao` (`int16` bruto):
```
bit  [0]     — UDQ1
bit  [1]     — UDQ2
bit  [2]     — UDQ3
bits [15:3]  — rsvd
```

---

## 5.7 Diagnóstico Avançado de Sensores (104–118)

Médias e valores RMS de sensores, disponíveis principalmente em modo jiga de bancada. Em operação normal retornam EMPTY.

| Reg | Nome | Perm | Tipo | Escala | Unidade | Descrição |
|-----|------|------|------|--------|---------|-----------|
| 104 | REG_Vret1_avg | R | int16 | ×0.01 | V | Média de Vret sensor 1 |
| 105 | REG_Vret2_avg | R | int16 | ×0.01 | V | Média de Vret sensor 2 |
| 106 | REG_Vcons_avg | R | int16 | ×0.01 | V | Média de Vcons |
| 107 | REG_Iret1_avg | R | int16 | ×0.01 | A | Média de Iret sensor 1 |
| 108 | REG_Iret2_avg | R | int16 | — | A | Média de Iret sensor 2 (reservado, retorna EMPTY) |
| 109 | REG_Ibat_avg | R | int16 | ×0.01 | A | Média de Ibat |
| 110 | REG_Vca_RS_rms | R | int16 | ×0.1 | V | RMS de Vca R-S |
| 111 | REG_Vca_RS_avg | R | int16 | ×0.1 | V | Offset (média DC) de Vca R-S |
| 112 | REG_Vca_ST_rms | R | int16 | ×0.1 | V | RMS de Vca S-T |
| 113 | REG_Vca_ST_avg | R | int16 | ×0.1 | V | Offset (média DC) de Vca S-T |
| 114 | REG_Ica_R_rms | R | int16 | ×0.01 | A | RMS de Ica fase R |
| 115 | REG_Ica_R_avg | R | int16 | ×0.01 | A | Offset (média DC) de Ica fase R |
| 116 | REG_Ica_T_rms | R | int16 | ×0.01 | A | RMS de Ica fase T |
| 117 | REG_Ica_T_avg | R | int16 | ×0.01 | A | Offset (média DC) de Ica fase T |
| 118 | REG_Tret_avg | R | int16 | ×0.1 | °C | Temperatura média do retificador (reservado, retorna EMPTY) |
| 430 | REG_Vca_T_rms | R | int16 | ×0.1 | V | RMS de Vca fase T |
| 432 | REG_Ica_S_rms | R | int16 | ×0.01 | A | RMS de Ica fase S |

---

## 5.8 Calibração (128–149)

Parâmetros de calibração de sensores e identificação do equipamento. Requerem permissão de fábrica para escrita. Persistidos na seção `SEC_Calibracao` da EEPROM.

| Reg | Nome | Perm | Tipo | Escala | Descrição |
|-----|------|------|------|--------|-----------|
| 128 | REG_SN_CPU | R/W | int32 | inteiro | Número de série da CPU (máx. 6 dígitos) |
| 129 | REG_SN_UGE | R/W | int32 | inteiro | Número de série da UGE (máx. 6 dígitos) |
| 130 | REG_Horas_set | R/W | int32 | inteiro | Ajuste do horímetro — horas |
| 131 | REG_Ciclos_set | R/W | int16 | inteiro | Ajuste do horímetro — ciclos |
| 132 | REG_Vret1_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Vret sensor 1 (±5%) |
| 133 | REG_Vret1_offset | R/W | int16 | ×0.01 | Offset de calibração de Vret sensor 1 (±5% pu) |
| 134 | REG_Vret2_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Vret sensor 2 (±5%) |
| 135 | REG_Vret2_offset | R/W | int16 | ×0.01 | Offset de calibração de Vret sensor 2 (±5% pu) |
| 136 | REG_Vcons_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Vcons (±5%) |
| 137 | REG_Vcons_offset | R/W | int16 | ×0.01 | Offset de calibração de Vcons (±5% pu) |
| 138 | REG_Iret1_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Iret sensor 1 (±5%) |
| 139 | REG_Iret1_offset | R/W | int16 | ×0.01 | Offset de calibração de Iret sensor 1 (±5% pu) |
| 140 | REG_Iret2_ganho | R | int16 | — | Ganho de calibração de Iret sensor 2 (reservado, `_EMPTY_F32`) |
| 141 | REG_Iret2_offset | R | int16 | — | Offset de calibração de Iret sensor 2 (reservado, `_EMPTY_F32`) |
| 142 | REG_Ibat_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Ibat (±5%) |
| 143 | REG_Ibat_offset | R/W | int16 | ×0.01 | Offset de calibração de Ibat (±5% pu) |
| 144 | REG_Vca_RS_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Vca R-S (±5% ou ±10% com TP) |
| 145 | REG_Vca_ST_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Vca S-T |
| 146 | REG_Ica_R_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Ica fase R (±5% ou ±10% com TC) |
| 147 | REG_Ica_T_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Ica fase T |
| 148 | REG_Vca_T_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Vca fase T |
| 149 | REG_Ica_S_ganho | R/W | int16 | ×0.0001 | Ganho de calibração de Ica fase S |

> Ganho = 0 significa sem correção (fator 1.0). Valor transmitido representa o **desvio** em relação a 1.0: `ganho_real = 1.0 + valor × 0.0001`.

---

## 5.9 Parâmetros Base (160–182)

Parâmetros nominais e de configuração do equipamento. A maioria requer o retificador desligado para escrita. Persistidos na seção `SEC_Base` da EEPROM. Uma escrita neste grupo fora da inicialização força uma falha grave de parâmetro e desliga o conversor.

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Descrição |
|-----|------|------|------|--------|------|---------|-----------|
| 160 | REG_SN_Equip | R/W | int32 | inteiro | — | — | Número de série do equipamento (máx. 6 dígitos) |
| 161 | REG_Vcc_nom | R/W | int16 | ×0.1 | — | V | Tensão CC nominal (12–500 V, padrão 125 V) |
| 162 | REG_Vcc_max | R/W | int16 | ×0.001 | — | pu | Limite máximo de tensão CC (1.00–1.50 pu, padrão 1.10) |
| 163 | REG_Icc_nom | R/W | int16 | ×0.1 | — | A | Corrente CC nominal (10–700 A) |
| 164 | REG_Icc_max | R/W | int16 | ×0.001 | — | pu | Limite máximo de corrente CC (0.10–1.10 pu, padrão 1.10) |
| 165 | REG_Vca_nom | R/W | int16 | ×0.1 | — | V | Tensão CA nominal (100–500 Vrms) |
| 166 | REG_Vca_min | R/W | int16 | ×0.001 | — | pu | Tensão CA mínima (0.80–0.90 pu, padrão 0.90) |
| 167 | REG_Vca_max | R/W | int16 | ×0.001 | — | pu | Tensão CA máxima (1.10–1.20 pu, padrão 1.10) |
| 168 | REG_Freq_nom | R/W | int16 | ×0.1 | — | Hz | Frequência nominal (somente 60.0 Hz suportado) |
| 169 | REG_UR_Vcc_eme | R/W | int16 | ×0.1 | — | V | Tensão de emergência dos módulos UR (91–145 V, padrão 132 V) |
| 170 | REG_UR_Quantidade | R/W | int16 | inteiro | — | — | Quantidade de módulos UR conectados (1–32) |
| 171 | REG_UR_Sistema | R/W | int16 | inteiro | — | — | Sistema de alimentação dos módulos UR (ver tabela abaixo) |
| 172 | REG_UR_Reservado1 | — | — | — | — | — | Não mapeado (`ptr=0` → `NACK_Inexistente`) |
| 173 | REG_UR_Reservado2 | — | — | — | — | — | Não mapeado (`ptr=0` → `NACK_Inexistente`) |
| 174 | REG_UR_Reservado3 | — | — | — | — | — | Não mapeado (`ptr=0` → `NACK_Inexistente`) |
| 175 | REG_Ctrl_Ret | R/W | int16 | inteiro | — | — | Índice do controlador do retificador (legado, ignorado) |
| 176 | REG_Ctrl_UDQ | R/W | int16 | inteiro | — | — | Índice do controlador UDQ (somente 0 suportado) |
| 177 | REG_Delay_Partida | R/W | int32 | ×1000 | — | s | Delay de standby antes de religar [enviado em s; ms internamente] |
| 178 | REG_Reles_Fixos | R/W | int32 | bruto | — | — | Configuração de relés fixos (`tuRelesFixos`, ver abaixo) |
| 179 | REG_Cap_V | R | int16 | — | — | — | Capacidade de tensão (reservado, `_EMPTY_F32`) |
| 180 | REG_Cap_Q | R | int16 | — | — | — | Capacidade de potência reativa (reservado, `_EMPTY_F32`) |
| 181 | REG_UDQ_diodos | R/W | int16 | inteiro | — | — | Número de diodos por estágio UDQ (4–20) |
| 182 | REG_UDQ_Opcoes | R/W | int16 | bruto | — | — | Opções do módulo UDQ (`tuUDQ_Opcoes`, ver abaixo) |

### Estrutura de `REG_Reles_Fixos` (`tuRelesFixos`, `int32`)

Cada slot de relé possui 4 bits com sinal (`-6` a `+6`, `0` = desabilitado):
```
bits [3:0]   — entrada  : Desconexão CA
bits [7:4]   — precarga : Pré-carga
bits [11:8]  — stand_by : Standby
bits [15:12] — UDQ1     : UDQ Estágio 1
bits [19:16] — UDQ2     : UDQ Estágio 2
bits [23:20] — UDQ3     : UDQ Estágio 3
bits [27:24] — LVD      : Desconexão CC (LVD)
bits [30:28] — rsvd8    : Reservado
bit  [31]    — empty    : Flag EMPTY
```

### Estrutura de `REG_UDQ_Opcoes` (`tuUDQ_Opcoes`, `int16`)

```
bits [1:0]   — diodo_bloq   : Quantidade/opção de diodo de bloqueio (0–3)
bit  [2]     — cmd_paralelo : Comando paralelo
bit  [3]     — cmd_serie    : Comando série
bits [14:4]  — rsvd         : Reservado
bit  [15]    — empty        : Flag EMPTY
```

### Valores de REG_UR_Sistema (UR125_Sistema)

| Valor | Nome | Descrição |
|-------|------|-----------|
| 0 | UR125_SISTEMA_1P2W_127 | Monofásico 2 fios, 127 V |
| 1 | UR125_SISTEMA_1P2W_220 | Monofásico 2 fios, 220 V |
| 2 | UR125_SISTEMA_3P3W_220 | Trifásico 3 fios, 220 V |
| 3 | UR125_SISTEMA_3P4W_380 | Trifásico 4 fios, 380 V |

---

## 5.10 Configuração de Sensores Internos (192–199)

Parâmetros de configuração dos sensores internos da placa CPU. Persistidos na seção `SEC_Sens_Int` da EEPROM. Requerem o retificador desligado para escrita fora da inicialização.

Cada registrador é um `int32` bruto com a estrutura `tuParamSensorInt` (confirmada via DWARF do compilador TI C2000):

```
bits [15:0]  — valor (16 bits, ex: resistor em décimos de kΩ; 0x8000 quando não aplicável)
bits [23:16] — rsvd  (8 bits reservados)
bits [30:24] — tipo  (7 bits)
bit  [31]    — empty
```

| Reg | Nome | Perm | Tipo | Descrição |
|-----|------|------|------|-----------|
| 192 | REG_SInt_Vret1 | R/W | int32 | Configuração do sensor interno de Vret 1 |
| 193 | REG_SInt_Vret2 | R/W | int32 | Configuração do sensor interno de Vret 2 |
| 194 | REG_SInt_Vcons | R/W | int32 | Configuração do sensor interno de Vcons |
| 195 | REG_SInt_Iret | R/W | int32 | Configuração do sensor interno de Iret |
| 196 | REG_SInt_Ibat | R/W | int32 | Configuração do sensor interno de Ibat |
| 197 | REG_SInt_Vca | R/W | int32 | Configuração do sensor interno de Vca |
| 198 | REG_SInt_Ica | R/W | int32 | Configuração do sensor interno de Ica |
| 199 | REG_SInt_Tret | R/W | int32 | Configuração do sensor interno de temperatura do retificador |

### Tipos de sensor de tensão CC (SVD)

| Tipo | Nome | Valor (campo `valor`) |
|------|------|-----------------------|
| 0 | SVD_Diferencial | Resistor divisor em décimos de kΩ (10.0–390.0 kΩ) |
| 1 | SVD_Isolado | Resistor divisor em décimos de kΩ (8.2–330.0 kΩ) |

### Tipos de sensor de corrente CC (SAD)

| Tipo | Nome | Descrição |
|------|------|-----------|
| 0 | SAD_ShuntDif60mV | Shunt diferencial 60 mV (não isolado) |
| 1 | SAD_ShuntIso60mV | Shunt isolado 60 mV (aceito em Iret e Ibat no TPS125) |

### Tipos de sensor de tensão CA (SVA)

| Tipo | Nome | Valor (campo `valor`) |
|------|------|-----------------------|
| 0 | SVA_Isolado | Resistor em décimos de kΩ (padrão 300.0 kΩ) |
| 1 | SVA_Diferencial | Resistor em décimos de kΩ (20.0–22.0 kΩ) |

### Tipos de sensor de corrente CA (SAA)

| Tipo | Nome | Descrição |
|------|------|-----------|
| 0 | SAA_TC5A | Transformador de corrente 5 A |

---

## 5.11 Configuração de Sensores Externos (208–215)

Parâmetros de configuração de sensores externos (TPs, TCs, shunts externos). Persistidos na seção `SEC_Sens_Ext` da EEPROM.

Cada registrador é um `int32` bruto com a estrutura `tuParamSensorExt` (confirmada via DWARF do compilador TI C2000):

```
bits [15:0]  — valor 1 (16 bits — corrente nominal em 0.1 A ou tensão TP em 0.1 V)
bits [23:16] — valor 2 (8 bits  — número de espiras do TC, 1–9)
bits [30:24] — tipo do sensor (7 bits)
bit  [31]    — empty
```

| Reg | Nome | Perm | Tipo | Descrição |
|-----|------|------|------|-----------|
| 208 | REG_SExt_Vret1 | R/W | int32 | Configuração do sensor externo de Vret 1 |
| 209 | REG_SExt_Vret2 | R/W | int32 | Configuração do sensor externo de Vret 2 |
| 210 | REG_SExt_Vcons | R/W | int32 | Configuração do sensor externo de Vcons |
| 211 | REG_SExt_Iret | R/W | int32 | Configuração do sensor externo de Iret (shunt externo) |
| 212 | REG_SExt_Ibat | R/W | int32 | Configuração do sensor externo de Ibat (shunt externo) |
| 213 | REG_SExt_Vca | R/W | int32 | Configuração do sensor externo de Vca (TP) |
| 214 | REG_SExt_Ica | R/W | int32 | Configuração do sensor externo de Ica (TC externo) |
| 215 | REG_SExt_Tret | R/W | int32 | Configuração do sensor externo de temperatura (reservado) |

### Tipos de sensor externo de corrente CC (shunt)

`valor1` = corrente nominal do shunt em décimos de A (10.0–800.0 A). `tipo` = 0.

### Tipos de sensor externo de tensão CA (SVAE)

| Tipo | Nome | Valor1 |
|------|------|--------|
| 0 | SVAE_Direto | Não aplicável (medição direta) |
| 1 | SVAE_TP24 | Tensão primária do TP em décimos de V (100.0–1000.0 V), secundário 24 V |
| 2 | SVAE_TP115 | Tensão primária do TP em décimos de V (100.0–1000.0 V), secundário 115 V |

### Sensor externo de corrente CA (TC externo)

`valor1` = corrente nominal do TC em décimos de A (10.0–300.0 A). `valor2` = número de espiras (1–9).

---

## 5.12 Parâmetros de Carga (224–258)

Setpoints e temporizações do carregador de baterias. Persistidos na seção `SEC_Carga` da EEPROM, exceto REG_Transicao e REG_Inibir_Carga.

### Modo e opções gerais

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Descrição |
|-----|------|------|------|--------|------|---------|-----------|
| 224 | REG_Car_Modo_salvo | R | int16 | inteiro | — | — | Último modo de carga salvo na EEPROM (somente leitura via CAN) |
| 225 | REG_Tequ_man | R/W | int32 | ×1000 | — | s | Tempo máximo de equalização manual (60s–24h) |
| 226 | REG_Tequ_prof | R/W | int32 | ×1000 | — | s | Tempo máximo de equalização profunda (60s–24h) |
| 229 | REG_Transicao | R/W | int16 | inteiro | — | s | Tempo de transição entre modos de carga (0–60 s) |
| 230 | REG_Fonte_Opcoes | R/W | int16 | bruto | — | — | Opções do modo fonte (bitfield `tuFonteOpcoes`) |
| 231 | REG_Inibir_Carga | R/W | int16 | inteiro | — | — | Inibir carga (0=não, 1=sim) |

### Setpoints de tensão

Armazenados internamente em pu relativo a `BPU_Vcc`; transmitidos na CAN em décimos de Volt (`escala ×0.1`: `valor_SI = valor_rede × 0.1`, ex.: `1350` ↔ `135.0 V`).

| Reg | Nome | Perm | Tipo | Faixa (pu) | Descrição |
|-----|------|------|------|------------|-----------|
| 227 | REG_Vset_fonte | R/W | int16 | Vret_L–Vcc_max | Setpoint de tensão no modo fonte |
| 232 | REG_Vset_flu | R/W | int16 | Vret_L–1.056 | Setpoint de tensão de flutuação |
| 233 | REG_Vset_equ | R/W | int16 | Vret_L–1.152 | Setpoint de tensão de equalização |
| 234 | REG_Vset_prof | R/W | int16 | Vret_L–1.152 | Setpoint de tensão de equalização profunda |
| 235 | REG_Vset_cons | R/W | int16 | Vret_L–1.10 | Setpoint de tensão do consumidor (UDQ) |
| 236 | REG_Vset_emerg | R/W | int16 | Vret_L–1.056 | Setpoint de tensão de emergência |
| 248 | REG_Vset_teste | R/W | int16 | Vret_L–Vcc_max | Setpoint de tensão no teste de bateria |

### Setpoints de corrente

Armazenados internamente em pu relativo a `BPU_Icc`; transmitidos na CAN em décimos de Ampère (`escala ×0.1`: `valor_SI = valor_rede × 0.1`, ex.: `1500` ↔ `150.0 A`).

| Reg | Nome | Perm | Tipo | Faixa (pu) | Descrição |
|-----|------|------|------|------------|-----------|
| 228 | REG_Iset_fonte | R/W | int16 | Iret_L–Icc_max | Limite de corrente no modo fonte |
| 237 | REG_Iset_ret | R/W | int16 | Iret_L–Icc_max | Limite de corrente do retificador |
| 238 | REG_Iset_bat | R/W | int16 | Ibat_L–Ibat_H | Limite de corrente de bateria |
| 249 | REG_Iset_teste | R/W | int16 | 0 ou Ibat_L–1.0 | Corrente de descarga no teste de bateria (0=sem controle) |

### Limiares de equalização

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Descrição |
|-----|------|------|------|--------|------|---------|-----------|
| 239 | REG_Ilimiar_equ | R/W | int16 | ×0.1 | BPU_Icc | A | Corrente limiar para fim de equalização |
| 241 | REG_Ilimiar_flu | R/W | int16 | ×0.1 | BPU_Icc | A | Corrente limiar para retorno à flutuação |

### Temporizações de equalização

| Reg | Nome | Perm | Tipo | Escala | Unidade | Descrição |
|-----|------|------|------|--------|---------|-----------|
| 240 | REG_Tequ_delay | R/W | int32 | ×1000 | s | Delay para início da equalização automática (0–5 min) |
| 242 | REG_Tequ_retem | R/W | int32 | ×1000 | s | Tempo de retenção na equalização (0–4h) |
| 243 | REG_Tequ_max | R/W | int32 | ×1000 | s | Tempo máximo de equalização automática (1h–50h) |
| 247 | REG_Tpartida_grad | R/W | int32 | ×1000 | s | Tempo de partida gradativa de corrente (0–10 s) |
| 250 | REG_Tlvd_retorno | R/W | int32 | ×1000 | s | Delay de retorno do LVD após subtensão (0–1h) |

### Compensação de temperatura

| Reg | Nome | Perm | Tipo | Escala | Unidade | Descrição |
|-----|------|------|------|--------|---------|-----------|
| 244 | REG_Vcomp_ref | R/W | int16 | ×0.1 | °C | Temperatura de referência para compensação (25–35°C, padrão 25°C) |
| 245 | REG_Vcomp_coef | R/W | int16 | ×0.001 | V/°C | Coeficiente de compensação (`base=BPU_Vcc`; na CAN em mV/°C, ex: `300` ↔ `0.300 V/°C`) |
| 246 | REG_Vcomp_min | R/W | int16 | ×0.1 | °C | Temperatura mínima para aplicar compensação (0–35°C) |

### Contadores e histórico

| Reg | Nome | Perm | Tipo | Escala | Descrição |
|-----|------|------|------|--------|-----------|
| 256 | REG_Last_Power_off | R/W | int16 | inteiro | Código do último desligamento |
| 257 | REG_Cont_Equ_Ini | R/W | int32 | inteiro | Contador de inícios de equalização (0–32000) |
| 258 | REG_Cont_Equ_Fim | R/W | int32 | inteiro | Contador de fins de equalização (0–32000) |

### Nota sobre REG_Fonte_Opcoes (`tuFonteOpcoes`, `int16`)

```
bit  [0]    — bateria : modo fonte com bateria habilitada
bit  [1]    — UDQ     : modo fonte com UDQ habilitada
bit  [2]    — fabrica : modo fonte de fábrica (habilita bateria e UDQ)
bits [14:3] — rsvd    : reservado
bit  [15]   — empty   : flag EMPTY
```

---

## 5.13 Configuração de Relés (264–327)

Cada registrador mapeia um evento/status a relés de saída físicos. Persistidos nas seções `SEC_Reles1` (264–295) e `SEC_Reles2` (296–327) da EEPROM.

Cada registrador é um `int32` com a estrutura `tuReles`:

```
bits [4:0]   — RP1  : relé 1 da placa principal (0=nenhum, 1–6=relé)
bits [9:5]   — RP2  : relé 2 da placa principal (0=nenhum, 1–6=relé)
bits [14:10] — RE11 : relé 1 da expansão 1 (0=nenhum, 1–8=relé)
bits [19:15] — RE12 : relé 2 da expansão 1 (0=nenhum, 1–8=relé)
bits [24:20] — RE21 : relé 1 da expansão 2 (0=nenhum, 1–8=relé)
bits [29:25] — RE22 : relé 2 da expansão 2 (0=nenhum, 1–8=relé)
bit  [30]    — rsvd : reservado
bit  [31]    — empty
```

> Valor 0 em qualquer campo significa que o evento não aciona nenhum relé naquele slot. Relés fixos (configurados em REG_Reles_Fixos) não podem ser usados.

### SEC_Reles1 — Falhas e alarmes intrínsecos (264–295)

| Reg | Nome | Perm | Evento associado |
|-----|------|------|-----------------|
| 264 | REG_Rele_Power_off | R/W | Desligado pelo usuário |
| 265 | REG_Rele_Standby | R/W | Em standby |
| 266 | REG_Rele_Vca_sub | R/W | Subtensão CA |
| 267 | REG_Rele_Vca_sobre | R/W | Sobretensão CA |
| 268 | REG_Rele_Vca_ffase | R/W | Falta de fase CA |
| 269 | REG_Rele_Vca_balanc | R/W | Desequilíbrio de tensão CA |
| 270 | REG_Rele_Fca_sub | R/W | Subfrequência CA |
| 271 | REG_Rele_Fca_sobre | R/W | Sobrefrequência CA |
| 272 | REG_Rele_Vca_seq | R/W | Sequência de fases incorreta |
| 273 | REG_Rele_Vca_dist | R/W | Distorção harmônica de tensão CA |
| 274 | REG_Rele_UR_perda | R/W | Perda de módulos UR |
| 275 | REG_Rele_Reincidencia | R/W | Reincidência de falhas |
| 276 | REG_Rele_UR_Iret_lim | R/W | Limitação de corrente pelos módulos UR |
| 277 | REG_Rele_rsvd1 | R/W | Reservado |
| 278 | REG_Rele_Watchdog | R | Watchdog (somente leitura) |
| 279 | REG_Rele_Protecao | R/W | Falha grave de proteção |
| 280 | REG_Rele_D1 | R/W | Entrada digital D1 |
| 281 | REG_Rele_D2 | R/W | Entrada digital D2 |
| 282 | REG_Rele_D3 | R/W | Entrada digital D3 |
| 283 | REG_Rele_D4 | R/W | Entrada digital D4 |
| 284 | REG_Rele_D5 | R/W | Entrada digital D5 |
| 285 | REG_Rele_D6 | R/W | Entrada digital D6 |
| 286 | REG_Rele_D7 | R/W | Entrada digital D7 |
| 287 | REG_Rele_D8 | R/W | Entrada digital D8 |
| 288 | REG_Rele_Vret_sobre | R/W | Sobretensão CC de saída |
| 289 | REG_Rele_Vcons_sobre | R/W | Sobretensão no consumidor |
| 290 | REG_Rele_Icons_sobre | R/W | Sobrecorrente no consumidor |
| 291 | REG_Rele_Temp_Bat | R/W | Temperatura de bateria alta |
| 292 | REG_Rele_Ibat_fonte | R/W | Corrente de bateria como fonte |
| 293 | REG_Rele_rsvd2_0 | R/W | Reservado |
| 294 | REG_Rele_rsvd2_1 | R/W | Reservado |
| 295 | REG_Rele_empty1 | R/W | Reservado |

### SEC_Reles2 — Alertas e status (296–327)

| Reg | Nome | Perm | Evento associado |
|-----|------|------|-----------------|
| 296 | REG_Rele_Vret_sub | R/W | Subtensão CC de saída |
| 297 | REG_Rele_Vcons_sub | R/W | Subtensão no consumidor |
| 298 | REG_Rele_Ibat_desc | R/W | Corrente de descarga de bateria |
| 299 | REG_Rele_Vbat_fim | R/W | Tensão de fim de descarga |
| 300 | REG_Rele_Sens_Tbat | R/W | Falha no sensor de temperatura de bateria |
| 301 | REG_Rele_EqAuto_nao | R/W | Equalização automática não realizada |
| 302 | REG_Rele_EqMan_nao | R/W | Equalização manual não realizada |
| 303 | REG_Rele_Falha_UDQ | R/W | Falha no módulo UDQ |
| 304 | REG_Rele_Manutencao | R/W | Manutenção programada |
| 305 | REG_Rele_CAN | R | Falha de comunicação CAN (somente leitura) |
| 306 | REG_Rele_Vcons_alta | R/W | Tensão do consumidor alta |
| 307 | REG_Rele_Cbat_baixa | R/W | Carga de bateria baixa |
| 308 | REG_Rele_UR_abnormal_voltage | R/W | Tensão anormal nos módulos UR |
| 309 | REG_Rele_UR_ausente | R/W | Módulo UR ausente |
| 310 | REG_Rele_UR_subtensao | R/W | Subtensão em módulo UR |
| 311 | REG_Rele_UR_sobretensao | R/W | Sobretensão em módulo UR |
| 312 | REG_Rele_UR_manual_mode | R/W | Módulo UR em modo manual |
| 313 | REG_Rele_UR_protection_status | R/W | Módulo UR em proteção |
| 314 | REG_Rele_UR_module_fault | R/W | Falha em módulo UR |
| 315 | REG_Rele_UR_over_temperature | R/W | Sobretemperatura em módulo UR |
| 316 | REG_Rele_UR_power_on | R/W | Módulos UR energizados |
| 317 | REG_Rele_Ligado | R/W | Retificador ligado |
| 318 | REG_Rele_Disponivel | R/W | Retificador disponível |
| 319 | REG_Rele_Auto | R/W | Modo de carga automático |
| 320 | REG_Rele_Manual | R/W | Modo de carga manual |
| 321 | REG_Rele_Inibida | R/W | Carga inibida |
| 322 | REG_Rele_Equa | R/W | Equalizando |
| 323 | REG_Rele_Flut | R/W | Flutuando |
| 324 | REG_Rele_UDQ_ativa | R/W | UDQ ativa |
| 325 | REG_Rele_Remoto | R/W | Modo remoto ativo |
| 326 | REG_Rele_Teste_Bat | R/W | Teste de bateria em andamento |
| 327 | REG_Rele_Teste | R/W | Teste de relés em andamento |

---

## 5.14 Opções de Alarme (328–375)

Cada registrador configura o comportamento de um alarme específico: retardo de atuação, ação (alarmar/reter/bloquear) e LED sinótico associado. Persistidos nas seções `SEC_AlmOpt1` (328–359) e `SEC_AlmOpt2` (360–375) da EEPROM.

Cada registrador é um int32 com a estrutura `tuAlarmeOptions`:

```
bits [15:0]  — retardo   : retardo de atuação em décimos de segundo (0–180.0 s)
bits [19:16] — acao      : ação do alarme (bitfield, ver tabela abaixo)
bits [23:20] — led       : LED sinótico associado (ver tabela abaixo)
bits [28:24] — comando   : comando associado a entradas digitais (somente D1–D8)
bit  [29]    — invert    : inverte a lógica da entrada digital
bit  [30]    — enable    : habilita a entrada digital
bit  [31]    — empty
```

### Campo `acao` (bits 19:16)

| Bit | Significado |
|-----|-------------|
| 0 | alarmar — gera alarme visível na IHM |
| 1 | reter — retém o alarme mesmo após condição desaparecer |
| 2 | bloquear — bloqueia a partida do retificador |

> Se `bloquear=1`, então `alarmar=1` é forçado automaticamente. Se `alarmar=0`, então `reter` é ignorado.

### Campo `led` (bits 23:20)

Estrutura `tuDinLed`:
```
bits [2:0] — led   : sinótico associado (0=nenhum, 1=CA, 2=Ret, 3=Bat, 4=Cons)
bit  [3]   — nivel : nível do alerta (0=alerta1, 1=alerta2)
```

### SEC_AlmOpt1 — Falhas e alarmes intrínsecos (328–359)

| Reg | Nome | Evento |
|-----|------|--------|
| 328 | REG_Opt_Power_off | Desligado pelo usuário |
| 329 | REG_Opt_Standby | Em standby |
| 330 | REG_Opt_Vca_sub | Subtensão CA |
| 331 | REG_Opt_Vca_sobre | Sobretensão CA |
| 332 | REG_Opt_Vca_ffase | Falta de fase CA |
| 333 | REG_Opt_Vca_balanc | Desequilíbrio de tensão CA |
| 334 | REG_Opt_Fca_sub | Subfrequência CA |
| 335 | REG_Opt_Fca_sobre | Sobrefrequência CA |
| 336 | REG_Opt_Vca_seq | Sequência de fases incorreta |
| 337 | REG_Opt_Vca_dist | Distorção harmônica de tensão CA |
| 338 | REG_Opt_UR_perda | Perda de módulos UR |
| 339 | REG_Opt_Reincidencia | Reincidência de falhas |
| 340 | REG_Opt_UR_Iret_lim | Limitação de corrente pelos módulos UR |
| 341 | REG_Opt_rsvd1 | Reservado |
| 342 | REG_Opt_Watchdog | Watchdog |
| 343 | REG_Opt_Protecao | Falha grave de proteção (somente leitura) |
| 344 | REG_Opt_D1 | Entrada digital D1 |
| 345 | REG_Opt_D2 | Entrada digital D2 |
| 346 | REG_Opt_D3 | Entrada digital D3 |
| 347 | REG_Opt_D4 | Entrada digital D4 |
| 348 | REG_Opt_D5 | Entrada digital D5 |
| 349 | REG_Opt_D6 | Entrada digital D6 |
| 350 | REG_Opt_D7 | Entrada digital D7 |
| 351 | REG_Opt_D8 | Entrada digital D8 |
| 352 | REG_Opt_Vret_sobre | Sobretensão CC de saída |
| 353 | REG_Opt_Vcons_sobre | Sobretensão no consumidor |
| 354 | REG_Opt_Icons_sobre | Sobrecorrente no consumidor |
| 355 | REG_Opt_Temp_Bat | Temperatura de bateria alta |
| 356 | REG_Opt_Ibat_fonte | Corrente de bateria como fonte (somente leitura) |
| 357 | REG_Opt_rsvd2_0 | Reservado |
| 358 | REG_Opt_rsvd2_1 | Reservado |
| 359 | REG_Opt_empty1 | Reservado |

### SEC_AlmOpt2 — Alertas (360–375)

| Reg | Nome | Evento |
|-----|------|--------|
| 360 | REG_Opt_Vret_sub | Subtensão CC de saída |
| 361 | REG_Opt_Vcons_sub | Subtensão no consumidor |
| 362 | REG_Opt_Ibat_desc | Corrente de descarga de bateria |
| 363 | REG_Opt_Vbat_fim | Tensão de fim de descarga |
| 364 | REG_Opt_Sens_Tbat | Falha no sensor de temperatura de bateria |
| 365 | REG_Opt_EqAuto_nao | Equalização automática não realizada (somente leitura) |
| 366 | REG_Opt_EqMan_nao | Equalização manual não realizada (somente leitura) |
| 367 | REG_Opt_Falha_UDQ | Falha no módulo UDQ (somente leitura) |
| 368 | REG_Opt_Manutencao | Manutenção programada |
| 369 | REG_Opt_CAN | Falha de comunicação CAN (somente leitura) |
| 370 | REG_Opt_Vcons_alta | Tensão do consumidor alta |
| 371 | REG_Opt_Cbat_baixa | Carga de bateria baixa (campo `retardo` em minutos — base `60000 ms`, ex: `480` = 480 min) |

> Posições não mapeadas neste bloco (`ptr=0` → `NACK_Inexistente`): `328`, `329`, `341`, `342`, `357`–`359`.
| 372 | REG_Opt_UR_abnormal_voltage | Tensão anormal nos módulos UR |
| 373 | REG_Opt_UR_ausente | Módulo UR ausente |
| 374 | REG_Opt_UR_subtensao | Subtensão em módulo UR |
| 375 | REG_Opt_UR_sobretensao | Sobretensão em módulo UR |

---

## 5.15 Limiares de Alarme (376–415)

Valores de atuação de cada alarme. Persistidos nas seções `SEC_AlmAtu1` (376–399) e `SEC_AlmAtu2` (400–415) da EEPROM.

### SEC_AlmAtu1 — Falhas intrínsecas (376–399)

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Faixa | Descrição |
|-----|------|------|------|--------|------|---------|-------|-----------|
| 376 | REG_Atu_Power_off | R | — | — | — | — | — | Reservado |
| 377 | REG_Atu_Standyby | R | — | — | — | — | — | Reservado |
| 378 | REG_Atu_Vca_sub | R/W | int16 | ×0.1 | BPU_Vca | V | Vca_min–0.95 pu | Limiar de subtensão CA |
| 379 | REG_Atu_Vca_sobre | R/W | int16 | ×0.1 | BPU_Vca | V | 1.03–Vca_max pu | Limiar de sobretensão CA |
| 380 | REG_Atu_Vca_ffase | R | int16 | ×0.001 | — | V | — | Limiar de falta de fase (somente leitura, fixo) |
| 381 | REG_Atu_Vca_balanc | R/W | int16 | ×0.1 | — | % | 1.0–UFV_L pu | Limiar de desequilíbrio de tensão CA |
| 382 | REG_Atu_Fca_sub | R/W | int16 | ×0.1 | BPU_Fca | Hz | Fca_min–1.02 pu | Limiar de subfrequência CA |
| 383 | REG_Atu_Fca_sobre | R/W | int16 | ×0.1 | BPU_Fca | Hz | 0.75–Fca_max pu | Limiar de sobrefrequência CA |
| 384 | REG_Atu_Vca_seq | R/W | int16 | inteiro | — | — | 0–1 | Sequência de fases (0=positiva, 1=negativa) |
| 385 | REG_Atu_Vca_dist | R/W | int16 | ×0.1 | — | % | 1.0–DFV_L pu | Limiar de distorção harmônica de tensão CA |
| 386 | REG_Atu_UR_perda | R/W | int16 | inteiro | — | — | — | Reservado (retorna EMPTY) |
| 387 | REG_Atu_Reincidencia | R/W | int16 | inteiro | — | — | 0–10 | Número de falhas para bloqueio por reincidência |
| 388 | REG_Atu_UR_Iret_lim | R/W | int16 | inteiro | — | — | — | Reservado (retorna EMPTY) |
| 389 | REG_Atu_rsvd1 | R | — | — | — | — | — | Reservado |
| 390 | REG_Atu_Watchdog | R | — | — | — | — | — | Reservado |
| 391 | REG_Atu_Protecao | R | — | — | — | — | — | Reservado |
| 392 | REG_Atu_Vret_sobre | R/W | int16 | ×0.1 | BPU_Vcc | V | Vret_L–Vcc_max+0.05 pu | Limiar de sobretensão CC de saída |
| 393 | REG_Atu_Vcons_sobre | R/W | int16 | ×0.1 | BPU_Vcc | V | Vret_L–Vcc_max+0.05 pu | Limiar de sobretensão no consumidor |
| 394 | REG_Atu_Icons_sobre | R/W | int16 | ×0.1 | BPU_Icc | A | 0.10–Ibat_pu×1.20 | Limiar de sobrecorrente no consumidor |
| 395 | REG_Atu_Temp_Bat | R/W | int16 | ×0.1 | — | °C | 25–60°C | Limiar de temperatura de bateria alta |
| 396 | REG_Atu_Ibat_fonte | R | int16 | ×0.1 | BPU_Icc | A | — | Limiar de corrente de bateria como fonte (somente leitura, fixo) |
| 397 | REG_Atu_rsvd2_0 | R | — | — | — | — | — | Reservado |
| 398 | REG_Atu_rsvd2_1 | R | — | — | — | — | — | Reservado |
| 399 | REG_Atu_empty1 | R | — | — | — | — | — | Reservado |

### SEC_AlmAtu2 — Alertas (400–415)

| Reg | Nome | Perm | Tipo | Escala | Base | Unidade | Faixa | Descrição |
|-----|------|------|------|--------|------|---------|-------|-----------|
| 400 | REG_Atu_Vret_sub | R/W | int16 | ×0.1 | BPU_Vcc | V | Vret_L–Vcc_max-0.01 pu | Limiar de subtensão CC de saída |
| 401 | REG_Atu_Vcons_sub | R/W | int16 | ×0.1 | BPU_Vcc | V | Vret_L–Vcc_max-0.01 pu | Limiar de subtensão no consumidor |
| 402 | REG_Atu_Ibat_desc | R/W | int16 | ×0.1 | BPU_Icc | A | 0.01–1.0 pu | Limiar de corrente de descarga de bateria |
| 403 | REG_Atu_Vbat_fim | R/W | int16 | ×0.1 | BPU_Vcc | V | Vret_L–Vcc_max-0.01 pu | Tensão de fim de descarga (teste de bateria) |
| 404 | REG_Atu_Sens_Tbat | R/W | int16 | inteiro | — | — | 0–8 | Número mínimo de sensores de temperatura válidos |
| 405 | REG_Atu_EqAuto_nao | R | — | — | — | — | — | Reservado |
| 406 | REG_Atu_EqMan_nao | R | — | — | — | — | — | Reservado |
| 407 | REG_Atu_Falha_UDQ | R | — | — | — | — | — | Reservado |
| 408 | REG_Atu_Manutencao | R/W | int16 | ×0.1 | — | kh | 0–300.0 kh | Intervalo de manutenção programada (na CAN `0–3000` ↔ `0–300.0 kh`; internamente `_long` ×1000 décimos de hora) |
| 409 | REG_Atu_CAN | — | — | — | — | — | — | Não mapeado (`ptr=0` → `NACK_Inexistente`) |
| 410 | REG_Atu_Vcons_alta | — | — | — | — | — | — | Não mapeado (`ptr=0` → `NACK_Inexistente`) |
| 411 | REG_Atu_Cbat_baixa | R/W | int16 | ×0.1 | BPU_Icc | Ah | 0–10.0×Icc_nom | Limiar de carga mínima de bateria (ex: `6000` ↔ `600.0 Ah`) |
| 412 | REG_Atu_UR_abnormal_voltage | R/W | int16 | ×0.1 | — | V | 6.25–6.50 V | Limiar de tensão anormal entre módulos UR |
| 413 | REG_Atu_UR_ausente | R | — | — | — | — | — | Reservado (retorna EMPTY) |
| 414 | REG_Atu_UR_subtensao | R | — | — | — | — | — | Reservado (retorna EMPTY) |
| 415 | REG_Atu_UR_sobretensao | R | — | — | — | — | — | Reservado (retorna EMPTY) |

---

## 5.16 Testes e Comandos (416–427)

| Reg | Nome | Perm | Tipo | Escala | Descrição |
|-----|------|------|------|--------|-----------|
| 416 | REG_Teste_Din | R | int16 | bruto | Estado atual das entradas digitais (bitfield, D1=bit0 … D8=bit7) |
| 417 | REG_Teste_Dout_pri | R/W | int16 | bruto | Teste de saídas digitais da placa principal (exclusivo firmware `-jiga`; `ptr=0` em `burnin`/produção) |
| 418 | REG_Teste_Dout_exp1 | R/W | int16 | bruto | Teste de saídas digitais da expansão 1 (exclusivo firmware `-jiga`; `ptr=0` em `burnin`/produção) |
| 419 | REG_Teste_Dout_exp2 | R/W | int16 | bruto | Teste de saídas digitais da expansão 2 (exclusivo firmware `-jiga`; `ptr=0` em `burnin`/produção) |
| 424 | REG_Cmd_Liga | CMD | int16 | inteiro | Liga/desliga o retificador (0=desligar, 1=ligar) |
| 425 | REG_Cmd_Reset | CMD | int16 | inteiro | Reset de falhas (qualquer valor diferente do anterior dispara o reset) |
| 426 | REG_Cmd_Reboot | CMD | int16 | inteiro | Reboot da CPU (ver tabela de códigos abaixo) |
| 427 | REG_Cmd_Car_Modo | CMD | int16 | inteiro | Seleciona modo de carga (ver `teModoCarga` na seção 5.6) |

### Códigos de REG_Cmd_Reboot (teReboot)

| Valor | Nome | Descrição |
|-------|------|-----------|
| 1 | RBT_Normal | Reboot normal |
| 2 | RBT_Horimetro | Reboot para gravação do horímetro |
| 3 | RBT_Ajustes | Reboot para aplicar ajustes de parâmetros base |
| 4 | RBT_Painel | Reboot solicitado pelo painel |
| 5 | RBT_Apagar | Reboot para apagar configurações |
| 6 | RBT_Formatar | Reboot para formatar EEPROM |
| 7 | RBT_Restaurar | Reboot para restaurar padrão de fábrica |

### Condições de Nack para REG_Cmd_Liga

| Nack | Condição |
|------|----------|
| NACK_Remoto | Sistema em modo remoto com comando de desligar alocado |

### Condições de Nack para REG_Cmd_Car_Modo

| Nack | Condição |
|------|----------|
| NACK_Remoto | Sistema em modo remoto com comando de modo alocado |
| NACK_Stand_by | Tentativa de equalizar em standby |
| NACK_Carga_Inibida | Tentativa de equalizar com carga inibida |
| NACK_Opcional | Modo profundo sem disjuntor de consumidor configurado |
| NACK_DJ_Cons_on | Modo profundo com disjuntor de consumidor fechado |
| NACK_DJ_Bat_on | Modo fonte com disjuntor de bateria fechado |
| NACK_Desligado | Teste de bateria com retificador desligado |
| NACK_DJ_Bat_off | Teste de bateria com disjuntor de bateria aberto |
| NACK_DJ_Cons_off | Teste de bateria com disjuntor de consumidor aberto |
| NACK_Nao_Flutuando | Teste de bateria fora do estado de flutuação |
| NACK_Sem_Icons | Teste de bateria sem corrente mínima no consumidor |

### Condições de Nack para REG_Cmd_Reboot

| Nack | Condição |
|------|----------|
| NACK_Intervalo | Código de reboot inválido (fora de 1–7) |
| NACK_Ligado | Retificador operando (estado > EST_Desligado) |

---

## 5.17 Módulos UR125 (434–473)

### Dados individuais dos módulos (434–465)

Um registrador int32 por módulo, formato bruto (`UR125_Module_Data`). Todos são anunciados periodicamente.

```
bits [11:0]  — Vout               : tensão de saída × 10 (0–1450 → 0.0–145.0 V)
bits [20:12] — Iout               : corrente de saída × 10 (0–220 → 0.0–22.0 A)
bit  [21]    — active             : módulo ativo (1=comunicando)
bit  [22]    — power_off          : módulo desligado
bit  [23]    — manual_mode        : módulo em modo manual
bit  [24]    — protection_status  : proteção ativa
bit  [25]    — module_fault       : falha interna no módulo
bit  [26]    — overvoltage_fault  : falha de sobretensão
bit  [27]    — output_undervoltage: subtensão de saída
bit  [28]    — over_temperature   : sobretemperatura
bit  [29]    — input_out_of_range : entrada CA fora da faixa
bit  [30]    — phase_loss         : perda de fase CA
bit  [31]    — output_overvoltage : sobretensão de saída
```

| Reg | Nome | Módulo |
|-----|------|--------|
| 434 | REG_UR0_Data | Módulo 0 |
| 435 | REG_UR1_Data | Módulo 1 |
| 436 | REG_UR2_Data | Módulo 2 |
| 437 | REG_UR3_Data | Módulo 3 |
| 438 | REG_UR4_Data | Módulo 4 |
| 439 | REG_UR5_Data | Módulo 5 |
| 440 | REG_UR6_Data | Módulo 6 |
| 441 | REG_UR7_Data | Módulo 7 |
| 442 | REG_UR8_Data | Módulo 8 |
| 443 | REG_UR9_Data | Módulo 9 |
| 444 | REG_UR10_Data | Módulo 10 |
| 445 | REG_UR11_Data | Módulo 11 |
| 446 | REG_UR12_Data | Módulo 12 |
| 447 | REG_UR13_Data | Módulo 13 |
| 448 | REG_UR14_Data | Módulo 14 |
| 449 | REG_UR15_Data | Módulo 15 |
| 450 | REG_UR16_Data | Módulo 16 |
| 451 | REG_UR17_Data | Módulo 17 |
| 452 | REG_UR18_Data | Módulo 18 |
| 453 | REG_UR19_Data | Módulo 19 |
| 454 | REG_UR20_Data | Módulo 20 |
| 455 | REG_UR21_Data | Módulo 21 |
| 456 | REG_UR22_Data | Módulo 22 |
| 457 | REG_UR23_Data | Módulo 23 |
| 458 | REG_UR24_Data | Módulo 24 |
| 459 | REG_UR25_Data | Módulo 25 |
| 460 | REG_UR26_Data | Módulo 26 |
| 461 | REG_UR27_Data | Módulo 27 |
| 462 | REG_UR28_Data | Módulo 28 |
| 463 | REG_UR29_Data | Módulo 29 |
| 464 | REG_UR30_Data | Módulo 30 |
| 465 | REG_UR31_Data | Módulo 31 |

### Status agregado dos módulos (466–473)

Cada registrador é um int32 bruto onde cada **bit** corresponde a um módulo (bit 0 = módulo 0, bit 31 = módulo 31). Valor 1 indica que aquele módulo está com a condição ativa.

| Reg | Nome | Perm | Condição |
|-----|------|------|----------|
| 466 | REG_UR_Status_manual_mode | R | Módulo em modo manual |
| 467 | REG_UR_Status_protection_status | R | Módulo em proteção (reservado, retorna 0) |
| 468 | REG_UR_Status_module_fault | R | Falha interna no módulo |
| 469 | REG_UR_Status_over_temperature | R | Sobretemperatura no módulo |
| 470 | REG_UR_Status_power_on | R | Módulo energizado e sem power_off |
| 471 | REG_UR_Status_ausente | R | Módulo ausente (não respondendo) |
| 472 | REG_UR_Status_subtensao | R | Subtensão de saída no módulo |
| 473 | REG_UR_Status_sobretensao | R | Sobretensão de saída no módulo |

> REG_UR_Status_protection_status (467) está mapeado para NULL no firmware atual — retorna sempre 0.

### Exemplo de leitura de REG_UR0_Data

Supondo valor recebido `0x00A804E5` (int32, Big Endian):

```
bits [11:0]  = 0x4E5 = 1253 → Vout = 125.3 V
bits [20:12] = 0x014 = 20   → Iout = 2.0 A
bit  [21]    = 1             → active = true
bits [31:22] = 0             → sem falhas
```
