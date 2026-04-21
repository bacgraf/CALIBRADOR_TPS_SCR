# Sistema de Falhas e Alarmes — UGE SR125

Este documento descreve detalhadamente o funcionamento, a hierarquia e os mecanismos de configuração do sistema de monitoramento de falhas, proteções e alarmes da UGE SR125.

---

## 1. Visão Geral e Conceitos Fundamentais

O sistema classifica anomalias em três níveis hierárquicos:

1. **Alertas:** Informações operacionais e desvios leves. Não interrompem o funcionamento do equipamento. Geralmente acendem LEDs amarelos ou registram status no log (ex: "Descarga de Bateria").
2. **Alarmes (Falhas de Processo):** Condições anormais configuráveis (ex: Subtensão CA, Sobretemperatura). Dependendo da configuração, podem apenas avisar a IHM, reter a falha ou bloquear a operação do retificador.
3. **Proteções (Falhas Graves):** Anomalias críticas que demandam intervenção imediata do hardware e bloqueio de operação via software sem delay configurável (ex: Sobretensão CC crítica). Causam transição imediata para o estado `EST_Protecao`.

### Mecanismos de Ação Configuráveis

Os alarmes e alertas possuem três mecanismos definidos na EEPROM:
* **Retardo (Delay):** Tempo (0 a 180s) que o evento deve persistir ativado antes de consolidar a falha. Atua como um filtro (debounce) contra transientes temporários.
* **Ação (Alarmar / Reter / Bloquear):**
  * *Alarmar:* Notifica via rede CAN e painel.
  * *Reter:* Grava o último estado da falha (Latch). O alarme não desaparece mesmo que o evento cesse, necessitando de um comando explícito de Reconhecimento (Reset).
  * *Bloquear:* Inibe a partida do retificador ou corta imediatamente a operação.
* **Sinótico (LED):** Aloca a sinalização visual de um alarme a um de quatro clusters de LEDs frontais: Entrada CA, Retificador, Bateria, Consumidor.

### Máquina de Estados da Retenção
O estado principal do equipamento (`REG_Estado_Ret`) reage da seguinte forma:
- Operação normal em `EST_Operando`.
- Se ocorre uma proteção ou um alarme com ação de *Bloquear*: altera para `EST_Protecao` (ou `EST_Inibido`). Equipamento para.
- Se a condição de falha desaparece, mas a ação estava como *Reter*: o equipamento altera para `EST_Retido`. Nesta fase, não religa automaticamente até receber um Reset remoto (`REG_Cmd_Reset`).

---

## 2. Mapa de Registradores na CAN (Dicionário de Dados)

A IHM se cadastra para receber os dados de diagnóstico pelos seguintes registradores de 32 bits, que consolidam todo o status:

* **`REG_Alarmes` (Reg 82)**: Bitfield das falhas de processo configuráveis ativas. (Bit 0 ao 31).
* **`REG_Alertas` (Reg 83)**: Bitfield dos alertas ativos, incluindo condições não gravosas. (Bits adicionais da mesma struct global).
* **`REG_Erro_flags` (Reg 84)**: Bitfield das falhas graves de proteção física (hardware e proteções irrecuperáveis do firmware).
* **`REG_Comandos` (Reg 85)**: Bitfield de comandos remotos de intervenção.

A configuração de cada alarme na EEPROM é montada como um registrador inteiro (*Options*) no formato escalar a seguir:
```
[Bits 0-15]  Retardo (Delay) em décimos de segundo (ex: 50 = 5,0 Segundos)
[Bits 16-19] Ação:
             Bit 16 = Alarmar
             Bit 17 = Reter
             Bit 18 = Bloquear
[Bits 20-23] LED associado (0=Nenhum, 1=CA, 2=Ret, 3=Bat, 4=Cons) | (Bit 23=Nível 2)
[Bits 24-28] Comando associado (para entradas digitais, 0 a 31)
[Bit 29]     Inversão Lógica da Entrada (0=NA, 1=NF)
[Bit 30]     Enable (Habilita a lógica para digitais)
```

E o respectivo registrador de relés da EEPROM que endereça ações a portas de expansão e na placa principal.
```
[Bits 0-4] Placa Principal - Relé 1
[Bits 5-9] Placa Principal - Relé 2
(...) - Slots para mais expansões.
```

---

## 3. Status e Diagnóstico (Bloco 5.6 do Datamap)

Este grupo contempla os registradores de uso geral que relatam o exato comportamento da UGE, tempos, diagnósticos vitais e bitfields completos. É o principal painel de leitura para debug imediato de falhas latentes pela IHM.

| Reg | Nome | Tipo | Escala | Descrição e Comportamento Exaustivo |
|---|---|---|---|---|
| **67** | `REG_Crono_Prog` | int32 | bruto | **Cronômetro de progresso da equalização.** Utilizado internamente para rastrear quanto tempo a subrotina (Carga) permaneceu na tensão elevada.<br>Bits [23:0] = tempo decorrido em ms.<br>Bit [30] = ativo ou pausado.<br>Bit [31] = empty. |
| **68** | `REG_Crono_Timeout` | int32 | bruto | **Cronômetro de timeout da equalização.** Estipula o limite imposto, permitindo que a IHM exiba uma barra de progresso descendente até retorno compulsório para flutuação. Retorna as mesmas máscaras descritas no REG 67. |
| **69** | `REG_Tesbat_Cmed` | int16 | ×0.01 | **Carga Medida no Teste.** Amperes-hora acumulados (Ah) drenados da bateria ao se executar uma rotina de ensaio de capacidade de bateria na bancada. |
| **70** | `REG_Tesbat_Emed` | int16 | ×1 | **Energia Medida.** Mesma aplicação que o REG 69, guardando o valor em unidade de Watt-hora [Wh]. |
| **73** | `REG_Car_Modo_ativo` | int16 | inteiro | **Modo de Carga Ativo:** Define qual perfil de tensão o controle está perseguindo.<br>-1 = Salvo na EEPROM.<br>0 = Automático.<br>1 = Flutuação.<br>2 = Equalização.<br>3 = Equalização Profunda.<br>4 = Modo Fonte.<br>5 = Teste_Bat.<br>6 = Emergência. |
| **74** | `REG_Estado_Car` | int16 | inteiro | **Status Físico do Carregador:** Mostra dinamicamente a estufa (Estado visível à IHM).<br>0 = Desligado, 1 = Alarme, 2 = Standby, 3 = Iniciando, 4 = Ligando, 5 = Flutuando, 6 = Equalizando, 7 = Inibida, 8 = Fonte, 9 = Teste_Bat, 10 = Emergência. |
| **75** | `REG_Erro_cod` | int16 | inteiro | **Código da Falha Grave:** Quando em `EST_Protecao`, decodifica fisicamente a variável global `teFalhaGrave` da causa da queda total do conversor (Hardware Limiter Atuado, EEPROM Corrupta, etc). |
| **76** | `REG_Erro_ext` | int16 | inteiro | **Extensão da Falha Grave:** Complementa o REG 75 apontando qual sensor ou módulo de driver cortou os drivers da ponte de tiristores. |
| **77** | `REG_Estado_UDQ` | int16 | inteiro | **Estado da Unidade de Queda (UDQ).** Caso o painel use diodos de queda de tensão em direção ao consumidor. |
| **78** | `REG_Falha_UDQ` | int16 | bruto | **Bitfield de falhas do módulo UDQ.** Informa temperatura, queima de contratador de bypass da Unidade de Queda e desarme disjuntor UDQ. |
| **79** | `REG_UDQ_Acao` | int16 | inteiro | **Ação Atual UDQ:** Em transição, bypassing acoplado, ou introduziu de volta os diodos (reduzindo tensão). |
| **80** | `REG_Estado_Ret` | int16 | inteiro | **Estado Central da Máquina Retificadora:** Controla o PID primário.<br>0 = Init, 1 = Parametrizacao, 2 = Protecao, 3 = Retido, 4 = Desligado, 5 = Espera, 6 = Iniciando, 7 = Pre_Carga, 8 = Pre_Teste, 9 = Parando, 10 = Partida Gradativa, 11 = Operando. |
| **81** | `REG_Ctrl_flags` | int16 | bruto | **Flags de Malhas PID Ativas:** Aponta se a planta está trabalhando limitada à Corrente de Bateria, Limitada a Corrente Retificador Estourada ou seguindo referência limpa de Tensão. |
| **82** | `REG_Alarmes` | int32 | bruto | **Bitfield Categórico dos Alarmes:** Equivalente aos bits 0 a 31 do buffer Global Status em ram. Relaciona a configuração de SEC_AlmOpt1. (Para detalhes do gatilho analógico consultar Capítulo 4 e 5 deste datamap).<br><br>**Mapa de Bits (0 a 31):**<br>`[0]` Power_off (Desligado)<br>`[1]` Standby<br>`[2]` Vca_sub (Subtensão CA)<br>`[3]` Vca_sobre (Sobretensão CA)<br>`[4]` Vca_ffase (Falta de Fase)<br>`[5]` Vca_balanc (Desequilíbrio)<br>`[6]` Fca_sub (Subfrequência)<br>`[7]` Fca_sobre (Sobrefrequência)<br>`[8]` Vca_seq (Sequência Incorreta)<br>`[9]` Vca_dist (Distorção THD-V)<br>`[10]` UR_perda (Perda Comunicação UR)<br>`[11]` Reincidência de Falhas<br>`[12]` UR_Iret_lim (Limite de Corrente UR)<br>`[13]` *Reservado 1*<br>`[14]` Watchdog da Sub-CPU<br>`[15]` Proteção (Falha Grave Atuando)<br>`[16]` D1 (Entrada Digital 1)<br>`[17]` D2<br>`[18]` D3<br>`[19]` D4<br>`[20]` D5<br>`[21]` D6<br>`[22]` D7<br>`[23]` D8 (Entrada Digital 8)<br>`[24]` Vret_sobre (Sobretensão Vret)<br>`[25]` Vcons_sobre (Sobretensão Consumidor)<br>`[26]` Icons_sobre (Sobrecorrente Cons.)<br>`[27]` Temp_Bat (Temperatura Alta. Bat)<br>`[28]` Ibat_fonte (Bateria Corrente Fonte)<br>`[29]` *Reservado 2_0*<br>`[30]` *Reservado 2_1*<br>`[31]` *Empty 1* |
| **83** | `REG_Alertas` | int32 | bruto | **Bitfield Secundário de Alertas:** Referente às atuações normativas e leves de SEC_AlmOpt2. (Equivalente na memória aos bits 32 a 47 globais).<br><br>**Mapa de Bits (0 a 15 de REG 83):**<br>`[0]` Vret_sub (Subtensão Vret)<br>`[1]` Vcons_sub (Subtensão Consumidor)<br>`[2]` Ibat_desc (Bateria em Descarga)<br>`[3]` Vbat_fim (Fim de Descarga Bat.)<br>`[4]` Sens_Tbat (Sensor T. Bat Falho)<br>`[5]` EqAuto_nao (Equ. Auto não Feita)<br>`[6]` EqMan_nao (Equ. Man não Feita)<br>`[7]` Falha_UDQ (Falha Física UDQ)<br>`[8]` Manutencão (Preventiva Atingida)<br>`[9]` CAN (Falha de IHM / Timeout)<br>`[10]` Vcons_alta (Tensão Vcons Alta)<br>`[11]` Cbat_baixa (Resíduo Ah Crítico)<br>`[12]` UR_abnormal_voltage (Tensão Anormal UR)<br>`[13]` UR_ausente (Módulo Faltante - Warning)<br>`[14]` UR_subtensao (Subtensão do Módulo UR)<br>`[15]` UR_sobretensao (Sobretensão Módulo UR)<br>`[16-31]` *Não Preenchidos / Reservados* |
| **84** | `REG_Erro_flags` | int32 | bruto | **Máscara Física de Proteção:** Equivalente ao `tuProtecaoBits`. Falhas drásticas simultâneas que forçaram bloqueios de interruptor sólido imediatos. |
| **85** | `REG_Comandos` | int32 | bruto | **Buffer de Comandos:** Atos como reset manual, master off, em execução por DMA, CAN ou serial remota empilhados no processador neste flag temporário. |
| **86** | `REG_Falha_bloq` | int32 | bruto | **Filtro Retificador:** Máscara dinâmica gerada isolando do `REG_Alarmes` apenas os alarmes momentâneos cuja configuração aponta "Ação: BLOQUEAR". Responsável por segurar hardware. |
| **87** | `REG_Reinicio` | int32 | bruto | **Histórico Mortal:** Registro snapshot do último erro que ativou o sistema rigoroso de Reincidência e derrubou o retificador para always-off. |
| **88** | `REG_Uptime_CPU` | int32 | inteiro | **Métrica Operacional Interna.** Tempo global de firmware correndo contínuo sem reboot quente. Valor em (ms). |
| **89** | `REG_Uptime_Ret` | int32 | inteiro | **Métrica de Chaveamento.** Tempo no qual a saída VCC foi segurada firme ao terminal do cliente sem resets de PID. Valor em (ms). |
| **90** | `REG_Horas` | int32 | inteiro | **Horímetro Absoluto.** Apenas contabilizado quando `REG_Uptime_Ret` é incrementado. Gravado por flush assíncrono na EEPROM. Unidade referenciada em Horas. |
| **91** | `REG_Ciclos` | int16 | inteiro | **Contabilizador de Partidas Reais.** Totalizações de ignições de conversores salvos com a estrutura inteira de horas. |
| **92** | `REG_Boot` | int32 | bruto | **Motivo do RESET/BOOT:** Traz de volta os diagnósticos de Watch-Dog, Queda de RAM, Brownout Low-Voltage detect, etc. |
| **96-99** | `REG_Sin_XXX` | int16 | inteiro | **Matriz Frontal Traseira:** REG 96 (Rede), 97 (Ret), 98 (Bat) e 99 (Cons). Informa precisamente qual luz acender, com que velocidade piscar ou se desligar.<br>0 = Desligado, 1 = Falha, 2 = Progresso, 3 = Operacional, 4 = Alerta1, 5 = Alerta2. |

---

### 3.1. Detalhamento de Códigos de Proteção (REG 75 `Erro_cod` e 76 `Erro_ext`)

Sempre que a UGE assumir o estado `EST_Protecao` (REG 80 = 2), os registradores 75 e 76 devem ser consultados para o diagnóstico.

| Cód (REG 75) | Nome da Falha | Descrição (Causa da Proteção) | Extensão Detalhada (REG 76 `Erro_ext`) |
| :---: | --- | --- | --- |
| **0** | **EEPROM** | Falha na comunicação I2C ou nos dados gravados. | **0:** Memória em branco (Nova). Requer "Inicializar EEPROM".<br>**1:** Versão incompatível.<br>**2:** Erro de Checksum (Parâmetros Base corrompidos).<br>**4:** Erro I2C na Leitura.<br>**8:** Erro I2C na Gravação.<br>**16:** Erro I2C no Apagamento. |
| **1** | **PARAM** | Parametrização de fábrica inválida ou incompleta. | **0:** Alteração pendente. Necessário Reiniciar CPU.<br>**Outro:** ID do Registrador com dado indefinido/inválido (ver **Seção 3.2**). |
| **2** | **REBOOT** | Comando de reinicialização recebido. | Indica o modo de boot escolhido no comando. |
| **3** | **WATCHDOG** | Travamento de CPU recuperado por hardware. | **0:** CPU Principal.<br>**1:** Trap de operação ilegal.<br>**2:** Travamento do CLA (Coprocessador). |
| **4** | **VCC_POL** | Inversão de polaridade de Tensão CC. | **1:** Canal Vret1 (Barramento).<br>**2:** Canal Vret2 (Bateria).<br>**3:** Canal Vcons (Consumidor). |
| **5** | **SENS_VCA** | Falha no sensor de Tensão CA (Offset). | **1:** Canal Vab.<br>**2:** Canal Vbc. |
| **6** | **SENS_ICA** | Falha no sensor de Corrente CA (Offset). | **1:** Canal Ia.<br>**3:** Canal Ic. |
| **7** | **SENS_VCC** | Falha no sensor de Tensão CC. | **1:** Divergência entre Vret1 e Vret2.<br>**2:** Sem feedback de tensão no Consumidor. |
| **8** | **SENS_ICC** | Falha no sensor de Corrente CC Indutor. | **1:** Canal Iret1 (Valor negativo).<br>**2:** Canal Iret2 (Valor negativo). |
| **9** | **SENS_OUTRO** | Reservado | Uso futuro. |
| **10** | **DRIVERS** | Atuação do sinal /FAULT do Gate Driver. | Nível lógico baixo detectado nos Drivers de Potência. |
| **11** | **PRECARGA** | Falha na energização do Trafo (Burn-In). | **Ext:** Número interno do estado da máquina de pré-carga. |
| **12** | **DISPARO** | Falha no disparo dos Tiristores/Potência. | **0:** Sem corrente com controle máximo.<br>**1/2:** Sem detecção no Indutor 1/2.<br>**3/4:** Retificação Meia-Onda (Fase falha) Ponte 1/2.<br>**5/6:** Retificação Monofásica (Braço falho) Ponte 1/2.<br>**7:** Desequilíbrio CA (Capacitor ou Braço). |
| **13** | **PARTIDA** | Corrente inesperada durante ignição. | **0:** Corrente antes de ativar disparo.<br>**1/2:** Corrente detectada no Indutor 1/2 com ângulo máximo. |
| **14** | **REGULACAO** | Anormalidade no controle de malha. | **0:** Queda de tensão interna elevada.<br>**1/2:** Corrente no Indutor 1/2 com controle mínimo.<br>**3/4:** Desbalanço elevado entre Indutores (Iret1 > Iret2 ou vice-versa). |
| **15** | **ICONS_REV** | Corrente reversa no consumidor. | Valor calculado da corrente no consumidor é negativo. |
| **16** | **VCC_SOBRE** | Sobretensão CC Proteção Intrínseca. | **1/2:** Vret1 (Imediata / Temporizada).<br>**3/4:** Vret2 (Imediata / Temporizada).<br>**5/6:** Vcons (Imediata / Temporizada). |
| **17** | **ICC_SOBRE** | Sobrecorrente CC Proteção Intrínseca. | **1/2:** Iret1 (Imediata / Temporizada).<br>**3/4:** Iret2 (Imediata / Temporizada).<br>**5:** Atuação repetitiva do limitador.<br>**6:** Ibat Temporizada. |
| **18** | **ICA_SOBRE** | Sobrecorrente CA Proteção Intrínseca. | **1:** Maior corrente na Fase R.<br>**2:** Maior corrente na Fase S.<br>**3:** Maior corrente na Fase T. |
| **19** | **UDQ** | Falha na Unidade de Queda (Modo Fonte). | **bit 0:** Sobretemperatura (Digital).<br>**bit 1:** Oscilação no controle. |
| **20** | **CURTO** | Curto-Circuito detectado no lado CC. | **0:** Saída Consumidor (Vcc < 20% + Limite I).<br>**1:** Saída Bateria (Vcc < 20% + Limite I). |

---

### 3.2. Mapa de Endereços de Parâmetros (FEXT para Código 1)

Quando o `REG_Erro_cod` (75) for igual a **1 (PARAM)**, o `REG_Erro_ext` (76) indica o parâmetro específico que está com valor indefinido ou inválido:

| FEXT (REG 76) | Parâmetro Base (Projeto) | FEXT (76) | Sensores Internos | FEXT (76) | Sensores Externos |
| :---: | --- | :---: | --- | :---: | --- |
| **160** | SN_Equip (Nº Série) | **192** | SInt_Vret1 | **208** | SExt_Vret1 |
| **161** | Vcc_nom | **193** | SInt_Vret2 | **209** | SExt_Vret2 |
| **162** | Vcc_max | **194** | SInt_Vcons | **210** | SExt_Vcons |
| **163** | Icc_nom | **195** | SInt_Iret | **211** | SExt_Iret |
| **164** | Icc_max | **196** | SInt_Ibat | **212** | SExt_Ibat |
| **165** | Vca_nom | **197** | SInt_Vca | **213** | SExt_Vca |
| **166** | Vca_min | **198** | SInt_Ica | **214** | SExt_Ica |
| **167** | Vca_max | **199** | SInt_Tret | **215** | SExt_Tret |
| **168** | Freq_nom | **200** | SInt_Icons | **216** | SExt_Icons |
| **169** | TR_Vpri (Trafo) | **201** | SInt_Vbat | **217** | SExt_Vbat |
| **170** | TR_Vsec | | | | |
| **171** | TR_Ipri_nom | | | | |
| **172** | TR_FST | | | | |
| **173** | TR_defas1 | | | | |
| **174** | TR_defas2 | | | | |
| **175** | Ctrl_Ret | | | | |
| **176** | Ctrl_UDQ | | | | |
| **177** | Delay_Partida | | | | |
| **178** | Reles_Fixos | | | | |
| **179** | Cap_V | | | | |
| **180** | Cap_Q | | | | |
| **181** | UDQ_diodos | | | | |

---

## 4. Tabela Exaustiva de Proteções (Falhas Graves)

Proteções são imutáveis em termos de retardos, pois representam risco de dano catastrófico ao retificador ou à carga CC se não operarem de forma ultrarrápida. São reportadas no `REG_Erro_flags`.

Eventos comuns que causam falhas de proteção:
* Sobrecorrente massiva no estágio de saída ou choque de paralelismo (Hardware).
* Sobretensão CC Intensa (Além de Vret_max).
* Falha Crítica de EEPROM (Checksum / Valores Inconsistentes irrecuperáveis na memória base).
* Watchdog da Sub-CPU.
* Falha Crítica nos módulos retificadores anexados à UR125.

Quando em falha grave, as informações de debug estão localizadas em:
- `REG_Erro_cod` (75): Código unificado da falha primária que disparou o bloqueio.
- `REG_Erro_ext` (76): Detalhamento isolado referenciando a linha que cortou o pwm.
Para sair do estado de Proteção, e caso o sensor que reportou o evento libere a passagem de continuidade, o sistema muda para `EST_Retido`.

---

## 5. Tabela Exaustiva de Alarmes Configuráveis (Seção `SEC_AlmOpt1`)

Baseado nos registradores 328-359. Cada alarme tem um Limite (Atu), um Opt (onde define o Delay e Reter), e um Rele. 

| Reg Opt / Atu / Rele | Nome / Condição | Descrição Técnica & Sensoriamento | Range do Limite `REG_Atu` |
| --- | --- | --- | --- |
| 330 / 378 / 266 | **Subtensão CA** | Tensão RMS das Fases da Concessionária/Gerador recua além do baseline. | Vca_min – 0.95 pu (BPU_Vca) |
| 331 / 379 / 267 | **Sobretensão CA** | Tensão RMS da Rede CA excede tolerâncias seguras contínuas. | 1.03 – Vca_max pu (BPU_Vca) |
| 332 / 380 / 268 | **Falta de Fase CA** | Diferença geométrica extrema ou queda violenta assimétrica entre R, S, T. | Fixo de Firmware, Não ajustável |
| 333 / 381 / 269 | **Desequilíbrio de Tensão CA** | (UF_V) Mede o grau percentual do desequilíbrio na entrega trifásica. | 1.0 – UFV_L pu |
| 334 / 382 / 270 | **Subfrequência CA**| O desvio em Hz afasta do centro (ex: 60Hz nominais) para baixo. | Fca_min – 1.02 pu (BPU_Fca) |
| 335 / 383 / 271 | **Sobrefrequência CA**| O desvio em Hz afasta acima do parametrizado em base. | 0.75 – Fca_max pu (BPU_Fca) |
| 336 / 384 / 272 | **Sequência de Fase CA** | Avalia se a entrega está Direta(0) ou Inversa(1). | 0 - 1 |
| 337 / 385 / 273 | **Distorção Vca (THD_V)** | Avalia alto conteúdo harmônico na entrada de força. | 1.0 – DFV_L pu |
| 338 / 386 / 274 | **Perda Módulo UR** | Disparado pela UGE quando ocorre Time-Out e Perda RS485 das UR125 conectadas. | Fixo. Avaliação de Time-out interno |
| 339 / 387 / 275 | **Reincidência** | Se múltiplas falhas num tempo encurtado passarem do registro 387. | 0 a 10 Tentativas de Partida. Causa Bloqueio Retido Direto. |
| 352 / 392 / 288 | **Sobretensão CC (Vret)**| Monitora diretamente a barra do Retificador Vret em malha secundária. | Vret_L – (Vcc_Nom + tolerância) |
| 353 / 393 / 289 | **Sobretensão Consumidor**| Utilizado somente se modulo UDQ ativo para evitar a fritura da carga útil | Vret_L – Limite Máximo UDQ |
| 354 / 394 / 290 | **Sobrecorr Consumidor**| Curto-circuito na linha da carga util CC ou excesso de uso. | 0.10 – Ibat_pu x 1.20 |
| 353 / 393 / 289 | **Sobretensão Consumidor**| Utilizado somente se modulo UDQ ativo para evitar a fritura da carga útil | Vret_L – Limite Máximo UDQ |
| 354 / 394 / 290 | **Sobrecorr Consumidor**| Curto-circuito na linha da carga util CC ou excesso de uso. | 0.10 – Ibat_pu x 1.20 |
| 355 / 395 / 291 | **Temperatura de Bat.** | Bateria acima dos specs operacionais causados por runaway terminco da célula | 25°C a 60°C |

---

## 6. Tabela Exaustiva de Alertas (Seção `SEC_AlmOpt2`)

Baseado nos registradores 360-375. Seguem o mesmo modelo de retenção e acionamento, mas lidam primariamente com estados não interativos da planta CA primária, e sim da utilidade CC e Manutenções.

| Reg Opt / Atu / Rele | Nome / Condição | Descrição | Range do Limite `REG_Atu` |
| --- | --- | --- | --- |
| 360 / 400 / 296 | **Subtensão CC Vret** | Condição onde o barramento falhou em escorar a base da Vcc de Flutuação. | ~ Vcc_max - 0.01 pu |
| 361 / 401 / 297 | **Subtensão CC Cons** | O nó após o Dropper da UDQ despenca. | Vcc pu Baseline |
| 362 / 402 / 298 | **Corrente Carga Ibat**| Aviso para quando ocorrer transição severa para o polo de descarga. | 0.01 - 1.0 pu Ibat |
| 363 / 403 / 299 | **Fim Descarga Vbat** | Finalizando Ensaio de Bateria ou Carga Utilitária colapsando. | Baseada na Vret_L |
| 364 / 404 / 300 | **Sens Temp Bat** | Queda abrupta ou rompimento físico sensoriamento TempBateria. | Número Mínimo de Sensores Integros = 0 a 8 |
| 368 / 408 / 304 | **Manutenção Programada**| Cômputo pelo Horímetro e Ciclos se atingiu o estipulado p/ aviso. | 0 - 3.000.000 s |
| 369 / 409 / 305 | **Falha CAN IHM** | A UGE detectou parada de pings IHM / CAN RX Filter Time-Out. | Fixo |
| 371 / 411 / 307 | **Carga Baixa Bat** | Calculador Interno coulombímetro apontou AH extremamente abaixo de 10% | 0 a 10.0 Ah resíduo |

---

## 7. Sistema de Entradas Digitais (D1 a D8)

A UGE permite o cadastro de eventos externos pelos pinos D1 a D8 da placa principal. 
Esses sensores e disjuntores de alarme de bateria abertos, se comunicam pelo conjunto:
- `REG_Opt_D1` (344)
- `REG_Rele_D1` (280)

1. A UGE monitora fisicamente o estado do pino (GND ou Aberto).
2. O firmware aplica o Bit `invert` [29]. Se estiver ativo, trabalhará com o tipo Contato Normalmente Aberto (NA), caso contrário Normalmente Fechado (NF).
3. Aguarda o Delay/Retardo programado.
4. Gera a falha de `Alarme` (podendo ter ação de retenção e bloqueio). Se Bloqueado, um disparo via D1 do tipo "Botão Parada de Emergência Botoeira do Painel Interno", acarreta bloqueio imediato com retenção.

---

## 8. Roteiro de Integração Prática (Via Barramento CAN)

### 8.1 Identificando um Equipamento Bloqueado
* A interface IHM e scripts devem varrer periodicamente os Flags de Estados:
  * Interrogar `REG_Estado_Ret` (80): 
    * Se `2 (EST_Protecao)`, significa hardware atuando bloqueio grave ao vivo.
    * Se `3 (EST_Retido)`, hardware seguro, porém falha retida.
* Checar as falhas em si: 
  * Requisitar os inteiros de Bitfield (`REG_Alarmes` 82 e `REG_Erro_flags` 84).
  * Fazer uma máscara de bit. Um bit em '1' indica qual registrador causou o evento.

### 8.2 Clear Fault (Reset Remoto da Falha)
1. Certifique-se de que a condição causadora da falha cessou. Por exemplo, a Subtensão deve ter superado a histerese. Se não cessar fisicamente, ele re-triggará ao final do delay no bitfield.
2. Escrever via rede CAN (`Req_Write` ou `oper = 1`) para o registro `REG_Cmd_Reset` (425), enviando qualquer valor numérico ou invertendo a numeração contida nele `~valor_antigo` para flip do gatilho na subrotina CAN. Caso positivo, a UGE resetará os *Retenedores (Latches)* e sairá de `EST_Retido` para `EST_Pre_Teste` ou Partida.

### 8.3 Verificando as luzes da IHM e UGE simultaneamente
A UGE possui LEDs vitais mapeados. Cada Alarme configurado deve ter seu `bitfield(20:23) = tuDinLed` apontando ao subset:
* `1` = Falha de Corrente Alternada
* `2` = Falha de Retificador / Modulos (Vret e Hardware Interno)
* `3` = Falha de Baterias (Temp e Ah Coulombímetro)
* `4` = Falha de Consumidor (Modulos UDQ)

> Se múltiplos alarmes ocorrerem simultaneamente, a UGE roteia o LED para quem tem Severidade Máxima. Uma Falha pisca o LED se presente de fato, ou mantém contínuo se retida e esperando visualização (Reconhecimento do Operador). O Sinótico de Nível de Alerta 2 causa pulsos de iluminação mais rápidos.

---

## 9. Tratamento de Reincidência e Restauração Segura

Para prevenir ciclagem (Ligar → Falhar → Reset → Ligar → Falhar repetidamente, queimando semi-condutores), existe em `REG_Atu_Reincidencia` (387) o limite de eventos. 
Quando ativado:
* O retificador conta as transições para Retenção em um buffer de vida com um decremento cronometrado constante.
* Se a conta atingir este treshold, aciona um bloqueio definitivo e impenetrável por Reset local suave (só via hardware ou desligando comando master power-off), salvando a carga do Cliente e também preservando os cartões do conversor CA-CC.
