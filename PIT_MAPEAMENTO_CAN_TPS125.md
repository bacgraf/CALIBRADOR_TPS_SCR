# Mapeamento PIT → Mapa de Memória CAN (UGE TPS125)

Este documento associa cada parâmetro da planilha **PIT (Plano de Inspeção e Testes — Tekpower TPS125)** ao seu respectivo registrador no mapa de memória CAN da UGE TPS125, servindo de referência para leitura, validação e **escrita automática via barramento CAN (`Req_Write`, `oper = 1`)**.

**Documentos de referência:**
- [DATAMAP.md](DATAMAP.md) — Mapa completo de registradores da UGE TPS125
- [CAN_PROTOCOL.md](CAN_PROTOCOL.md) — Protocolo físico, montagem do Extended ID (29 bits) e regras de `Req_Write` / `Ack`
- [ALARMES_E_FALHAS.md](ALARMES_E_FALHAS.md) — Estrutura de alarmes, alertas, ações e entradas digitais

---

## 1. Regras de Conversão e Escrita na UGE

### 1.1 Fórmulas de Conversão
Os valores trafegam em **Big Endian** como inteiros escalados:

- **Sem base PU:**
  ```text
  valor_rede = round(valor_PIT / escala)
  ```
- **Com base PU (`BPU_Vcc`, `BPU_Icc`, `BPU_Vca`, `BPU_Fca`):**
  ```text
  valor_pu   = valor_PIT / base_nominal
  valor_rede = round(valor_pu / escala)
  ```
  > *Nota de verificação (conforme `CAN_PROTOCOL.md` §4.2):* para setpoints `×0.1` com base `BPU_Vcc`, a UGE utiliza o valor em décimos da grandeza nominal (ex.: `135.0 V` → `1350`, `1.056 × 125.0 × 10 = 1320`). Validar sempre o retorno no `Ack` (payload com valor corrigido se houver saturação).

- **Valor Vazio (`EMPTY`):** quando o PIT traz `-` ou `---` (desabilitado/não aplicável):
  - `int16`: `0x8000` (`-32768`)
  - `int32`: `0x80000000`

### 1.2 Sequência Obrigatória de Gravação (2 Fases)
1. **Fase 1 — Parâmetros Base e Sensores** *(retificador obrigatoriamente desligado)*:
   - Escrever `SEC_Base` (`160–182`), `SEC_Sens_Int` (`192–199`) e `SEC_Sens_Ext` (`208–215`).
   - Enviar `REG_Cmd_Reboot` (`426`) com `RBT_Normal = 1` (ou `RBT_Ajustes = 3`).
   - Aguardar a UGE reiniciar e retomar os anúncios CAN (~1,5–2,5 s) com as bases `BPU_*` e limites de fábrica recalculados.
2. **Fase 2 — Parâmetros de Usuário, Alarmes, Entradas Digitais e Relés**:
   - Escrever `SEC_Carga` (`224–258`), `SEC_AlmAtu1/2` (`376–415`), `SEC_AlmOpt1/2` (`328–375`) e `SEC_Reles1/2` (`264–327`).
   - **Dependência de ordem:** ao elevar tensões, gravar `REG_Vset_equ` (`233`) antes de `REG_Vset_flu` (`232`) para evitar saturação pelo valor anterior.
   - **Controle de fluxo EEPROM:** aguardar o `Resp_Write` (Ack ou Nack) de cada escrita antes de enviar a próxima (`delayed_ack.pending` suporta apenas 1 escrita pendente por vez) e alternar o bit `seq` a cada nova requisição.

---

## 2. Seção 2 do PIT — Parâmetros Base (`SEC_Base`, `SEC_Sens_Int`, `SEC_Sens_Ext`)

| Seção PIT | Parâmetro PIT | Exemplo PIT (125/150) | Reg CAN | Nome do Registrador | Perm | Tipo | Escala / Codificação |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :--- |
| 2.1 | SAÍDA CC — TENS. NOM. | `125 V` | **161** | `REG_Vcc_nom` | R/W | `int16` | `×0.1` V (12–500 V → `1250`) |
| 2.1 | SAÍDA CC — CORR. NOM. | `150 A` | **163** | `REG_Icc_nom` | R/W | `int16` | `×0.1` A (10–700 A → `1500`) |
| 2.1 | SAÍDA CC — TENS. MAX. | `110 %` | **162** | `REG_Vcc_max` | R/W | `int16` | `×0.001` pu (1.00–1.50 pu → `1100`) |
| 2.1 | SAÍDA CC — CORR. MAX. | `110 %` | **164** | `REG_Icc_max` | R/W | `int16` | `×0.001` pu (0.10–1.10 pu → `1100`) |
| 2.1 | SAÍDA CC — TENS. EME. | `135 V` | **169** | `REG_UR_Vcc_eme` | R/W | `int16` | `×0.1` V (91–145 V → `1350`) |
| 2.2 | UR — N. URs | `8 módulos` | **170** | `REG_UR_Quantidade` | R/W | `int16` | `×1` (1–32 → `8`) |
| 2.3 | ENTRADA CA — TENS. NOM. | `220 V` | **165** | `REG_Vca_nom` | R/W | `int16` | `×0.1` V (100–500 Vrms → `2200`) |
| 2.3 | ENTRADA CA — SISTEMA | `3P4W-380` | **171** | `REG_UR_Sistema` | R/W | `int16` | `0`=1P2W-127, `1`=1P2W-220, `2`=3P3W-220, **`3`=3P4W-380** |
| 2.4 | SENSOR ICA — TIPO | `TC` | **198** | `REG_SInt_Ica` | R/W | `int32` | `tuParamSensorInt` (`tipo=1` `SAA_TC5A`, `valor=0x8000`) |
| 2.4 | SENSOR ICA — TC / ESPIRAS | `50 A` / `1` | **214** | `REG_SExt_Ica` | R/W | `int32` | `tuParamSensorExt` (`valor1=500`, `valor2=1`) — **enviar 2×** (1ª grava TC, 2ª grava espiras) |
| 2.5 | SENSOR I RET — TIPO | `ShuntIso60mV` | **195** | `REG_SInt_Iret` | R/W | `int32` | `tuParamSensorInt` (`tipo=1` `SAD_ShuntIso60mV`, `valor=0x8000`) |
| 2.5 | SENSOR I RET — SHUNT | `150 A` | **211** | `REG_SExt_Iret` | R/W | `int32` | `tuParamSensorExt` (`tipo=0`, `valor1=1500` [0.1 A]) |
| 2.6 | SENSOR I BAT — TIPO | `ShuntIso60mV` | **196** | `REG_SInt_Ibat` | R/W | `int32` | `tuParamSensorInt` (`1`=`SAD_ShuntIso60mV`, `2`=`SAD_ShuntDif60mV`, `valor=0x8000`) |
| 2.6 | SENSOR I BAT — SHUNT | `150 A` | **212** | `REG_SExt_Ibat` | R/W | `int32` | `tuParamSensorExt` (`tipo=0`, `valor1=1500` [0.1 A]) |
| 2.7 | RELÉS FIXOS (CA, UDQ 1–3, CC) | `0` (todos) | **178** | `REG_Reles_Fixos` | R/W | `int32` | Bitfield bruto (`0` = nenhum alocado) |
| 2.8 | CONTROLADOR — Nº DIODOS UDQ | `---` | **181** | `REG_UDQ_diodos` | R/W | `int16` | `×1` (4–20; `0x8000` EMPTY se `---`) |
| 2.8 | CONTROLADOR — D. BLOQUEIO | `0` | **182** | `REG_UDQ_Opcoes` | R/W | `int16` | Bitfield bruto *(índice ctrl em `176` `REG_Ctrl_UDQ`)* |
| 2.9 | EQUIPAMENTO — Nº SÉRIE | `15743` | **160** | `REG_SN_Equip` | R/W | `int32` | `×1` inteiro (máx. 6 dígitos → `15743`) |
| *Ação* | Reiniciar "NORMAL" UGE | — | **426** | `REG_Cmd_Reboot` | CMD | `int16` | `1`=`RBT_Normal`, `3`=`RBT_Ajustes` |

### Estruturas de Bits — Sensores Internos e Externos (confirmadas via DWARF do firmware)
```text
tuParamSensorInt (int32 — regs 192–199):
  bits [15:0]  — valor  (16 bits — resistor divisor em 0.1 kΩ, quando aplicável)
  bits [23:16] — rsvd   (8 bits)
  bits [30:24] — tipo   (7 bits — ex: 0=ShuntDif60mV/TC5A, 1=ShuntIso60mV)
  bit  [31]    — empty

tuParamSensorExt (int32 — regs 208–215):
  bits [15:0]  — valor1 (16 bits — corrente nominal em 0.1 A ou tensão TP em 0.1 V)
  bits [23:16] — valor2 (8 bits  — nº de espiras do TC, 1–9)
  bits [30:24] — tipo   (7 bits)
  bit  [31]    — empty
```

---

## 3. Seção 3 do PIT — Calibração (`SEC_Calibracao`)

| Seção PIT | Parâmetro PIT | Reg CAN | Nome do Registrador | Perm | Tipo | Escala / Fórmula |
| :---: | :--- | :---: | :--- | :---: | :---: | :--- |
| 3.1 | [V] Tensão Retificador — OFFSET | **133** *(e 135)* | `REG_Vret1_offset` *(Vret2: 135)* | R/W | `int16` | `×0.01` (±5% pu) |
| 3.1 | [V] Tensão Retificador — GANHO | **132** *(e 134)* | `REG_Vret1_ganho` *(Vret2: 134)* | R/W | `int16` | `×0.0001` (`ganho = 1.0 + val × 0.0001`) |
| 3.2 | [V] Tensão Consumidor — OFFSET | **137** | `REG_Vcons_offset` | R/W | `int16` | `×0.01` (±5% pu) |
| 3.2 | [V] Tensão Consumidor — GANHO | **136** | `REG_Vcons_ganho` | R/W | `int16` | `×0.0001` |
| 3.3 | [I] Corrente Retificador — OFFSET | **139** | `REG_Iret1_offset` *(141 rsvd)* | R/W | `int16` | `×0.01` (±5% pu) |
| 3.3 | [I] Corrente Retificador — GANHO | **138** | `REG_Iret1_ganho` *(140 rsvd)* | R/W | `int16` | `×0.0001` |
| 3.4 | [IB] Corrente Bateria — OFFSET | **143** | `REG_Ibat_offset` | R/W | `int16` | `×0.01` (±5% pu) |
| 3.4 | [IB] Corrente Bateria — GANHO | **142** | `REG_Ibat_ganho` | R/W | `int16` | `×0.0001` |
| 3.5 | [V] Tensão Rede — `Vr(rms)` GANHO | **144** | `REG_Vca_RS_ganho` | R/W | `int16` | `×0.0001` |
| 3.5 | [V] Tensão Rede — `Vs(rms)` GANHO | **145** | `REG_Vca_ST_ganho` | R/W | `int16` | `×0.0001` |
| 3.5 | [V] Tensão Rede — `Vt(rms)` GANHO | **148** | `REG_Vca_T_ganho` | R/W | `int16` | `×0.0001` |
| 3.6 | [I] Corrente Rede — `Ir(rms)` GANHO | **146** | `REG_Ica_R_ganho` | R/W | `int16` | `×0.0001` |
| 3.6 | [I] Corrente Rede — `Is(rms)` GANHO | **149** | `REG_Ica_S_ganho` | R/W | `int16` | `×0.0001` |
| 3.6 | [I] Corrente Rede — `It(rms)` GANHO | **147** | `REG_Ica_T_ganho` | R/W | `int16` | `×0.0001` |
| 3.7 | Horímetro — HORAS | **130** | `REG_Horas_set` | R/W | `int32` | `×1` h *(leitura em `90` `REG_Horas`)* |
| 3.7 | Horímetro — CICLOS | **131** | `REG_Ciclos_set` | R/W | `int16` | `×1` *(leitura em `91` `REG_Ciclos`)* |
| 3.8 | Número de Série — CPU | **128** | `REG_SN_CPU` | R/W | `int32` | `×1` (máx. 6 dígitos) |
| 3.8 | Número de Série — UGE | **129** | `REG_SN_UGE` | R/W | `int32` | `×1` (máx. 6 dígitos) |

---

## 4. Seção 6.1 (e 4.1) do PIT — Parâmetros de Usuário (`SEC_Carga`)

| Cód. | Descrição PIT | Exemplo PIT | Reg CAN | Nome do Registrador | Perm | Tipo | Escala | Base PU | Unidade |
| :---: | :--- | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **P01** | Tensão de Flutuação | `135 V` | **232** | `REG_Vset_flu` | R/W | `int16` | `×0.1` | `BPU_Vcc` | V |
| **P02** | Tensão de Equalização | `135 V` | **233** | `REG_Vset_equ` | R/W | `int16` | `×0.1` | `BPU_Vcc` | V |
| **P03** | Tensão de Carga Profunda | `-` | **234** | `REG_Vset_prof` | R/W | `int16` | `×0.1` | `BPU_Vcc` | V |
| **P04** | Tensão Máxima Consumidor | `-` | **235** | `REG_Vset_cons` | R/W | `int16` | `×0.1` | `BPU_Vcc` | V |
| **P05** | Tensão Modo Emergência UDQ | `-` | **236** | `REG_Vset_emerg` | R/W | `int16` | `×0.1` | `BPU_Vcc` | V |
| **P06** | Corrente Retificador | `150 A` | **237** | `REG_Iset_ret` | R/W | `int16` | `×0.1` | `BPU_Icc` | A |
| **P07** | Corrente Bateria | `75 A` | **238** | `REG_Iset_bat` | R/W | `int16` | `×0.1` | `BPU_Icc` | A |
| **P08** | Corrente Atuação Equalização | `30 A` | **239** | `REG_Ilimiar_equ` | R/W | `int16` | `×0.1` | `BPU_Icc` | A |
| **P09** | Tempo Retardo Equalização | `1 min` (`60 s`) | **240** | `REG_Tequ_delay` | R/W | `int32` | `×1000` | — | s (ms) |
| **P10** | Corrente Atuação Flutuação | `12,75 A` | **241** | `REG_Ilimiar_flu` | R/W | `int16` | `×0.1` | `BPU_Icc` | A |
| **P11** | Tempo Retenção Equalização | `0 min` (`0 s`) | **242** | `REG_Tequ_retem` | R/W | `int32` | `×1000` | — | s (ms) |
| **P12** | Tempo Máx. Equalização Auto. | `10 h` (`36000 s`) | **243** | `REG_Tequ_max` | R/W | `int32` | `×1000` | — | s (ms) |
| **P13** | Número Sensores Temp. Bateria | `1` | **404** | `REG_Atu_Sens_Tbat` | R/W | `int16` | `×1` | — | 0–8 |
| **P14** | Temperatura de Referência | `25 ºC` | **244** | `REG_Vcomp_ref` | R/W | `int16` | `×0.1` | — | °C |
| **P15** | Coeficiente de Compensação | `0,3 V/ºC` | **245** | `REG_Vcomp_coef` | R/W | `int16` | `×0.001` | — | pu/°C |
| **P16** | Temp. Mínima para Compensar | `25 ºC` | **246** | `REG_Vcomp_min` | R/W | `int16` | `×0.1` | — | °C |
| **P17** | Teste Bateria — Tensão Final | `105 V` | **248** | `REG_Vset_teste` | R/W | `int16` | `×0.1` | `BPU_Vcc` | V |
| **P18** | Teste Bateria — Corrente Descarga | `0 A` | **249** | `REG_Iset_teste` | R/W | `int16` | `×0.1` | `BPU_Icc` | A |
| **P19** | Retorno LVD | `---` | **250** | `REG_Tlvd_retorno` | R/W | `int32` | `×1000` | — | s (ms) |

---

## 5. Seção 6.2 (e 4.2) do PIT — Alarmes (`AL01` a `AL27`)

Cada alarme na UGE é composto por **3 registradores**:
1. **Limiar (`REG_Atu_*`, `int16`)** — valor de atuação (coluna `VALOR` da Seção 6.2).
2. **Opções (`REG_Opt_*`, `int32`, `tuAlarmeOptions`)** — `RETARDO` (Seção 6.2) + `AÇÃO` (`ALM/BLQ/RT`, Seção 4.2).
3. **Relés (`REG_Rele_*`, `int32`, `tuReles`)** — colunas `PRINCIP.`, `EXP. 1`, `EXP. 2` (Seção 6.2).

| Cód. | Descrição PIT | Exemplo PIT | Reg Limiar (`Atu`) | Reg Opções (`Opt`) | Reg Relés (`Rele`) | Escala / Base (`Atu`) |
| :---: | :--- | :--- | :---: | :---: | :---: | :--- |
| **AL01** | Subtensão CA | `187 V` / `3,0s` / P6 | **378** `REG_Atu_Vca_sub` | **330** `REG_Opt_Vca_sub` | **266** `REG_Rele_Vca_sub` | `×0.1` (`BPU_Vca`) |
| **AL02** | Sobretensão CA | `253 V` / `3,0s` / P6 | **379** `REG_Atu_Vca_sobre` | **331** `REG_Opt_Vca_sobre` | **267** `REG_Rele_Vca_sobre` | `×0.1` (`BPU_Vca`) |
| **AL03** | Subfrequência CA | `57 Hz` / `3,0s` / P6 | **382** `REG_Atu_Fca_sub` | **334** `REG_Opt_Fca_sub` | **270** `REG_Rele_Fca_sub` | `×0.1` (`BPU_Fca`) |
| **AL04** | Sobrefrequência CA | `63 Hz` / `3,0s` / P6 | **383** `REG_Atu_Fca_sobre` | **335** `REG_Opt_Fca_sobre` | **271** `REG_Rele_Fca_sobre` | `×0.1` (`BPU_Fca`) |
| **AL05** | Falta de Fase | `N/A` / `3,0s` / P6 | **380** `REG_Atu_Vca_ffase` *(R)* | **332** `REG_Opt_Vca_ffase` | **268** `REG_Rele_Vca_ffase` | Fixo (somente leitura) |
| **AL06** | Sequência de Fase | `0` / `0,0s` / P6 | **384** `REG_Atu_Vca_seq` | **336** `REG_Opt_Vca_seq` | **272** `REG_Rele_Vca_seq` | `×1` (`0`=pos, `1`=neg) |
| **AL07** | Desequilíbrio de Fase | `5 %` / `3,0s` / P6 | **381** `REG_Atu_Vca_balanc` | **333** `REG_Opt_Vca_balanc` | **269** `REG_Rele_Vca_balanc` | `×0.1` % |
| **AL08** | VCA Anormal Distorção | `20 %` / `3,0s` / P6 | **385** `REG_Atu_Vca_dist` | **337** `REG_Opt_Vca_dist` | **273** `REG_Rele_Vca_dist` | `×0.1` % |
| **AL09** | Perda de Supervisão | `N/A` | **409** `REG_Atu_CAN` *(R)* | **369** `REG_Opt_CAN` *(R)* | **305** `REG_Rele_CAN` *(R)* | Fixo (CAN IHM↔UGE) |
| **AL10** | Proteção Interna | `N/A` / E1-7 | **391** `REG_Atu_Protecao` *(R)* | **343** `REG_Opt_Protecao` *(R)* | **279** `REG_Rele_Protecao` | Fixo |
| **AL11** | Subtensão Consumidor | `112,5 V` / `3,0s` / E1-8 | **401** `REG_Atu_Vcons_sub` | **361** `REG_Opt_Vcons_sub` | **297** `REG_Rele_Vcons_sub` | `×0.1` (`BPU_Vcc`) |
| **AL12** | Sobretensão Consumidor | `140 V` / `3,0s` / E1-8 | **393** `REG_Atu_Vcons_sobre` | **353** `REG_Opt_Vcons_sobre` | **289** `REG_Rele_Vcons_sobre` | `×0.1` (`BPU_Vcc`) |
| **AL13** | Subtensão Ret./Bateria | `112,5 V` / `3,0s` / E1-8 | **400** `REG_Atu_Vret_sub` | **360** `REG_Opt_Vret_sub` | **296** `REG_Rele_Vret_sub` | `×0.1` (`BPU_Vcc`) |
| **AL14** | Sobretensão Ret./Bateria | `146 V` / `3,0s` / E1-8 | **392** `REG_Atu_Vret_sobre` | **352** `REG_Opt_Vret_sobre` | **288** `REG_Rele_Vret_sobre` | `×0.1` (`BPU_Vcc`) |
| **AL15** | Bateria em Descarga | `3 A` / `60,0s` / P5 | **402** `REG_Atu_Ibat_desc` | **362** `REG_Opt_Ibat_desc` | **298** `REG_Rele_Ibat_desc` | `×0.1` (`BPU_Icc`) |
| **AL16** | Fim de Bateria | `105 V` / `3,5s` / E1-3 | **403** `REG_Atu_Vbat_fim` | **363** `REG_Opt_Vbat_fim` | **299** `REG_Rele_Vbat_fim` | `×0.1` (`BPU_Vcc`) |
| **AL17** | Sobrecarga Consumidor | `157,5 A` / `3,0s` | **394** `REG_Atu_Icons_sobre` | **354** `REG_Opt_Icons_sobre` | **290** `REG_Rele_Icons_sobre` | `×0.1` (`BPU_Icc`) |
| **AL18** | Flutuação Anormal | `N/A` / `60,0s` | **396** `REG_Atu_Ibat_fonte` *(R)* | **356** `REG_Opt_Ibat_fonte` *(R)* | **292** `REG_Rele_Ibat_fonte` | Fixo *(ou `412/372/308` UR)* |
| **AL19** | Sobretemperatura Bateria | `45 ºC` / `3,0s` / E1-4 | **395** `REG_Atu_Temp_Bat` | **355** `REG_Opt_Temp_Bat` | **291** `REG_Rele_Temp_Bat` | `×0.1` °C |
| **AL20** | Manutenção | `43,8 kh` | **408** `REG_Atu_Manutencao` | **368** `REG_Opt_Manutencao` | **304** `REG_Rele_Manutencao` | `×1000` s (0–3.000.000 s) |
| **AL21** | Falha UDQ | `N/A` / `1,0s` | **407** `REG_Atu_Falha_UDQ` *(R)* | **367** `REG_Opt_Falha_UDQ` *(R)* | **303** `REG_Rele_Falha_UDQ` | Fixo |
| **AL22** | Falha CA Reincidente | `3 falhas` / `60,0s` | **387** `REG_Atu_Reincidencia` | **339** `REG_Opt_Reincidencia` | **275** `REG_Rele_Reincidencia` | `×1` (0–10 ciclos) |
| **AL23** | Falha Sensor Temp. Bat. | `N/A` / `5,0s` | **404** `REG_Atu_Sens_Tbat` | **364** `REG_Opt_Sens_Tbat` | **300** `REG_Rele_Sens_Tbat` | `×1` (mesmo reg do `P13`) |
| **AL24** | Equal. Auto. Não Concluída | `N/A` | **405** `REG_Atu_EqAuto_nao` *(R)* | **365** `REG_Opt_EqAuto_nao` *(R)* | **301** `REG_Rele_EqAuto_nao` | Fixo |
| **AL25** | Operação Man. Não Concluída | `N/A` | **406** `REG_Atu_EqMan_nao` *(R)* | **366** `REG_Opt_EqMan_nao` *(R)* | **302** `REG_Rele_EqMan_nao` | Fixo |
| **AL26** | Tensão Alta Consumidor | `N/A` / `3,0s` | **410** `REG_Atu_Vcons_alta` *(R)* | **370** `REG_Opt_Vcons_alta` | **306** `REG_Rele_Vcons_alta` | Fixo |
| **AL27** | Bateria Capacidade Baixa | `600 Ah` / `480 min` | **411** `REG_Atu_Cbat_baixa` | **371** `REG_Opt_Cbat_baixa` | **307** `REG_Rele_Cbat_baixa` | `×0.1` (`BPU_Icc`) |

### Estruturas de Bits — Opções de Alarme e Relés
```text
tuAlarmeOptions (int32 — regs 328–375):
  bits [15:0]  — retardo  : tempo em décimos de segundo (ex: 3,0 s → 30; faixa 0–1800)
  bits [19:16] — acao     : bit0=ALM (alarmar), bit1=RT (reter), bit2=BLQ (bloquear)
  bits [23:20] — led      : bits[2:0] sinótico (0=Nenhum, 1=CA, 2=Ret, 3=Bat, 4=Cons), bit[3] nível (0=ALM/Alerta1, 1=FLT/Alerta2)
  bits [28:24] — comando  : comando associado (somente entradas digitais D1–D8)
  bit  [29]    — invert   : inversão lógica da entrada digital (NA/NF)
  bit  [30]    — enable   : habilita entrada digital (0=DESL, 1=habilitada)
  bit  [31]    — empty

tuReles (int32 — regs 264–327):
  bits [4:0]   — RP1  : relé 1 placa principal (0=nenhum, 1–6)
  bits [9:5]   — RP2  : relé 2 placa principal (0=nenhum, 1–6)
  bits [14:10] — RE11 : relé 1 expansão 1      (0=nenhum, 1–8)
  bits [19:15] — RE12 : relé 2 expansão 1      (0=nenhum, 1–8)
  bits [24:20] — RE21 : relé 1 expansão 2      (0=nenhum, 1–8)
  bits [29:25] — RE22 : relé 2 expansão 2      (0=nenhum, 1–8)
  bit  [31]    — empty
```

---

## 6. Seção 6.3 do PIT — Entradas Digitais (`CN1` a `CN8`)

| Entrada PIT | Exemplo PIT (Descrição / Config.) | Reg Opções (`int32` `tuAlarmeOptions`) | Reg Relés (`int32` `tuReles`) |
| :---: | :--- | :---: | :---: |
| **CN1** | `FUGA NEGATIVA` · `CON,ALM` · `NA` · `3,0s` · `ALM` · E1-1 | **344** `REG_Opt_D1` | **280** `REG_Rele_D1` |
| **CN2** | `FUGA POSITIVA` · `CON,ALM` · `NA` · `3,0s` · `ALM` · P4 | **345** `REG_Opt_D2` | **281** `REG_Rele_D2` |
| **CN3** | `ENTRADA DIGITAL D3` · `DESL` | **346** `REG_Opt_D3` | **282** `REG_Rele_D3` |
| **CN4** | `ENTRADA DIGITAL D4` · `DESL` | **347** `REG_Opt_D4` | **283** `REG_Rele_D4` |
| **CN5** | `ENTRADA DIGITAL D5` · `DESL` | **348** `REG_Opt_D5` | **284** `REG_Rele_D5` |
| **CN6** | `ENTRADA DIGITAL D6` · `DESL` | **349** `REG_Opt_D6` | **285** `REG_Rele_D6` |
| **CN7** | `ENTRADA DIGITAL D7` · `DESL` | **350** `REG_Opt_D7` | **286** `REG_Rele_D7` |
| **CN8** | `ENTRADA DIGITAL D8` · `DESL` | **351** `REG_Opt_D8` | **287** `REG_Rele_D8` |

> **Nota:** A descrição textual (`FUGA NEGATIVA`, `FUGA POSITIVA`, etc.) é armazenada apenas na **IHM**; na UGE gravam-se somente o bitfield de opções (`REG_Opt_D*`) e o mapeamento de relés (`REG_Rele_D*`).

---

## 7. Seção 6.4 do PIT — Saídas Relé de Status (`01` a `22`)

Todos os registradores abaixo são `R/W`, tipo `int32` (`tuReles`):

| Status PIT | Descrição PIT | Exemplo PIT | Reg CAN | Nome do Registrador |
| :---: | :--- | :---: | :---: | :--- |
| **01** | DESLIGADO PELO USUÁRIO | — | **264** | `REG_Rele_Power_off` |
| **02** | RETIFICADOR EM STANDBY | — | **265** | `REG_Rele_Standby` |
| **03** | RETIFICADOR DISPONÍVEL | — | **318** | `REG_Rele_Disponivel` |
| **04** | RETIFICADOR LIGADO | E1-2 | **317** | `REG_Rele_Ligado` |
| **05** | CARGA AUTOMÁTICA | E1-6 | **319** | `REG_Rele_Auto` |
| **06** | CARGA MANUAL | E1-5 | **320** | `REG_Rele_Manual` |
| **07** | CARREGADOR EM EQUALIZAÇÃO | — | **322** | `REG_Rele_Equa` |
| **08** | CARREGADOR EM FLUTUAÇÃO | — | **323** | `REG_Rele_Flut` |
| **09** | UDQ ATIVA | — | **324** | `REG_Rele_UDQ_ativa` |
| **10** | CARGA INIBIDA | — | **321** | `REG_Rele_Inibida` |
| **11** | COMANDO REMOTO | — | **325** | `REG_Rele_Remoto` |
| **12** | TESTE DE BATERIA | — | **326** | `REG_Rele_Teste_Bat` |
| **13** | UR EM MODO MANUAL | — | **312** | `REG_Rele_UR_manual_mode` |
| **14** | 02 OU MAIS URs EM FALHA | — | **274** | `REG_Rele_UR_perda` *(ou `313` `REG_Rele_UR_protection_status`)* |
| **15** | UR EM FALHA | — | **314** | `REG_Rele_UR_module_fault` |
| **16** | UR EM SOBRETEMPERATURA | — | **315** | `REG_Rele_UR_over_temperature` |
| **17** | UR LIGADA | — | **316** | `REG_Rele_UR_power_on` |
| **18** | UR AUSENTE | — | **309** | `REG_Rele_UR_ausente` |
| **19** | UR EM SUBTENSÃO | — | **310** | `REG_Rele_UR_subtensao` |
| **20** | UR EM SOBRETENSÃO | — | **311** | `REG_Rele_UR_sobretensao` |
| **21** | RETIFICADOR EM LIMITAÇÃO DE CORRENTE | — | **276** | `REG_Rele_UR_Iret_lim` |
| **22** | TESTE DE RELÉS | — | **327** | `REG_Rele_Teste` |

---

## 8. Campos do PIT sem Escrita na UGE CAN

| Seção PIT | Campos | Motivo |
| :---: | :--- | :--- |
| **1** | Cliente, Modelo, Projeto, OC, PV, OP, ET, Área | Metadados administrativos do documento (exceto `Nº Série`, que grava em `REG_SN_Equip = 160`). |
| **4.1 / 4.2** | Limites Mínimo e Máximo de Parâmetros e Alarmes | Calculados internamente pela UGE a partir dos Parâmetros Base (`SEC_Base`). Apenas a coluna `AÇÃO` (`ALM/BLQ/RT`) da Seção 4.2 entra em `REG_Opt_*`. |
| **5.1 / 5.2 / 5.3** | Número de Dígitos, Sequência de Tela, Vínculo, Habilitar Teste de Bateria | Configurações locais da **IHM** (não existem registradores no DataMap da UGE). |
| **6.3** | Coluna `DESCRIÇÃO` (texto das entradas D1–D8) | Texto exibido apenas na **IHM**. |
| **Rodapé do CSV** | Tabelas de listas suspensas (`Entrada CA`, `Relés Fixos`, etc.) | Listas de validação de dados exportadas da planilha Excel original — devem ser ignoradas pelo parser. |
