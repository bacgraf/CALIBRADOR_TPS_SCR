# Protocolo de Comunicação CAN — UGE TPS125 ↔ IHM

Este documento descreve o protocolo de comunicação CAN utilizado entre a UGE (Unidade de Gerenciamento) do retificador modular TPS125 e a IHM (Interface Homem-Máquina).

> **Status:** Em construção

---

## 1. Configuração Física

### 1.1 Periférico CAN

A UGE utiliza o módulo **CANA** do microcontrolador TMS320F28375S da Texas Instruments.

Referência no código: `CANA_BASE` — definido pelo controlSUITE em `inc/hw_memmap.h`.

### 1.2 Clock

O módulo CAN é alimentado pelo clock da CPU (SYSCLKOUT), selecionado na inicialização:

```c
CANClkSourceSelect(CANA_BASE, 0);  // 0 = SYSCLKOUT
```

O clock da CPU neste projeto é de **200 MHz**.

### 1.3 Baud Rate

A taxa de comunicação é configurada em:

```c
CANBitRateSet(CANA_BASE, 200000000, 62500);
```

| Parâmetro | Valor |
|---|---|
| Clock de entrada | 200 MHz |
| Baud rate | **62.500 bps** |

O driver da TI (`CANBitRateSet`) calcula automaticamente os parâmetros de bit timing (TSEG1, TSEG2, SJW, prescaler) a partir do clock e do baud rate desejado. Os valores possíveis de divisor total vão de 5 a 13 time quanta por bit.

### 1.4 Tipo de Frame

Todas as mensagens utilizam **CAN Extended ID (29 bits)**. O flag `MSG_OBJ_EXTENDED_ID` é configurado em todos os mailboxes de transmissão e recepção.

### 1.5 Recuperação de Bus-Off

A recuperação automática do estado bus-off está habilitada com um intervalo de **2 segundos**:

```c
CanaRegs.CAN_ABOTR = 62500 * 2;  // 125.000 bit times ≈ 2s @ 62.5 kbps
CanaRegs.CAN_CTL.bit.ABO = 1;    // Habilita auto bus-off recovery
```

Isso significa que, caso o controlador CAN entre em estado bus-off (TEC ≥ 256), ele tentará se reconectar automaticamente após 2 segundos.

### 1.6 Retransmissão Automática

A retransmissão automática de mensagens com erro **está habilitada** (comportamento padrão). A linha que a desabilitaria está comentada no código:

```c
//CANRetrySet(CANA_BASE, false); //Retransmissão desativada para debug
```

### 1.7 Resumo para Configuração do Adaptador CAN

Para conectar um adaptador CAN (ex: PCAN-USB, CANable, SocketCAN) ao barramento da UGE, utilize os seguintes parâmetros:

| Parâmetro | Valor |
|---|---|
| Baud rate | 62.500 bps (62,5 kbps) |
| Tipo de ID | Estendido (29 bits) |
| Formato de frame | CAN 2.0B |
| Terminação | 120 Ω (verificar se já existe no barramento) |

---

## 2. Estrutura do ID CAN (29 bits)

### 2.1 Visão Geral

O protocolo utiliza os 29 bits do CAN Extended ID como um **bitfield estruturado**, onde cada campo carrega uma informação específica da mensagem. Não se trata de um endereço numérico simples — cada trecho do ID tem um significado.

A definição no código fonte (`CAN_Supervisao.h`) é:

```c
typedef union {
    Uint32 all;
    struct {
        // ID Base (11 bits)
        Uint32 destino    :4;
        Uint32 origem     :4;
        Uint32 rede       :2;
        Uint32 prioridade :1;

        // ID Estendido (18 bits)
        Uint32 reg        :10;
        Uint32 formato    :3;
        Uint32 oper       :3;
        Uint32 Nack       :1;
        Uint32 seq        :1;

        Uint32 rsvd       :3;  // não utilizados
    } bit;
} tuCAN_ID;
```

### 2.2 Mapa de Bits

Os 29 bits do ID são organizados do **bit menos significativo (LSB)** ao **mais significativo (MSB)**:

```
Bit:  28  27 | 26  25  24 | 23  22  21 | 20  19  18  17  16  15  14  13  12  11 | 10 | 9   8 | 7   6   5   4 | 3   2   1   0
      seq Nack|   oper     |  formato   |                reg                      | pri|  rede |    origem     |   destino
```

| Campo       | Bits    | Largura | Faixa de Valores | Descrição                                      |
|-------------|---------|---------|------------------|-------------------------------------------------|
| `destino`   | [3:0]   | 4 bits  | 0–15             | Endereço do destinatário                        |
| `origem`    | [7:4]   | 4 bits  | 0–15             | Endereço do remetente                           |
| `rede`      | [9:8]   | 2 bits  | 0–3              | Endereço da rede lógica                         |
| `prioridade`| [10]    | 1 bit   | 0–1              | Prioridade da mensagem                          |
| `reg`       | [20:11] | 10 bits | 0–1023           | Número do registrador no mapa de dados          |
| `formato`   | [23:21] | 3 bits  | 0–7              | Formato dos dados no payload                    |
| `oper`      | [26:24] | 3 bits  | 0–7              | Código da operação                              |
| `Nack`      | [27]    | 1 bit   | 0–1              | Flag de Nack / supressão de resposta            |
| `seq`       | [28]    | 1 bit   | 0–1              | Número de sequência (detecção de duplicatas)    |

> **Nota sobre bit ordering:** O compilador TI para C2000 organiza bitfields do LSB para o MSB. O campo `destino` ocupa os bits [3:0] do valor inteiro de 29 bits, e `seq` ocupa o bit [28].

### 2.3 Descrição dos Campos

#### `destino` (4 bits)

Endereço do dispositivo destinatário da mensagem.

| Valor | Dispositivo       |
|-------|--------------------|
| 0     | Indefinido         |
| 1     | IHM                |
| 2     | Retificador (UGE)  |
| 15    | Difusão (broadcast)|

#### `origem` (4 bits)

Endereço do dispositivo que originou a mensagem. Mesmos valores da tabela acima.

A UGE sempre transmite com `origem = 2`. A IHM simulada deve transmitir com `origem = 1`.

#### `rede` (2 bits)

Identificador da rede lógica. Utilizado para filtrar mensagens quando há múltiplas redes no mesmo barramento físico. O mailbox de recepção da UGE filtra por `rede = 0`.

#### `prioridade` (1 bit)

Bit de prioridade da mensagem. A UGE configura `prioridade = 1` em todas as suas transmissões.

> **Nota CAN:** No barramento CAN, bits dominantes (0) vencem a arbitragem. Como o bit de prioridade está na posição 10 do ID (parte do ID base de 11 bits), o valor `1` neste campo **não** significa maior prioridade no barramento — é apenas um campo lógico do protocolo da aplicação.

#### `reg` (10 bits)

Número do registrador no mapa de dados da aplicação (DataMap). Endereça até 1024 registradores (0–1023). O mapa atual utiliza 512 posições (`DATAMAP_SIZE = 512`).

Exemplos:
- `reg = 11` → REG_Vret (tensão do retificador)
- `reg = 15` → REG_Iret (corrente do retificador)
- `reg = 424` → REG_Cmd_Liga (comando ligar/desligar)

A lista completa de registradores será detalhada em uma seção futura.

#### `formato` (3 bits)

Define o formato dos dados transportados no payload da mensagem.

| Valor | Tipo     | Bytes/registro | Máx. registros por mensagem |
|-------|----------|----------------|-----------------------------|
| 0     | int8     | 1              | *(incompleto no firmware)*  |
| 2     | int16    | 2              | 4                           |
| 4     | int32    | 4              | 2                           |
| 5     | float32  | 4              | 2                           |
| 6     | int64    | 8              | 1                           |
| 7     | string8  | 8              | 1                           |

> Os valores 1 e 3 (int12 e int20) existem na definição de tipos mas **não são suportados** na comunicação CAN.

#### `oper` (3 bits)

Código da operação. O bit 2 indica a **direção**: 0 = requisição (IHM → UGE), 1 = resposta (UGE → IHM).

| Valor | Nome          | Direção    | Descrição                                |
|-------|---------------|------------|------------------------------------------|
| 0     | Req_Read      | IHM → UGE  | Solicita leitura de registradores        |
| 1     | Req_Write     | IHM → UGE  | Solicita escrita em um registrador       |
| 3     | Advertise     | UGE → IHM  | Anúncio periódico de valores atualizados |
| 4     | Resp_Read     | UGE → IHM  | Resposta a uma leitura                   |
| 5     | Resp_Write    | UGE → IHM  | Ack de uma escrita                       |

Na resposta, o campo `oper` é derivado da requisição com o bit 2 setado: `oper_resp = oper_req | 0b100`.

#### `Nack` (1 bit)

Tem significado diferente conforme a direção da mensagem:

- **Na requisição (IHM → UGE):**
  - `Nack = 0` → A UGE deve responder (Ack ou Nack)
  - `Nack = 1` → A UGE **não** deve responder (fire-and-forget). Usado nos anúncios (Advertise).

- **Na resposta (UGE → IHM):**
  - `Nack = 0` → Operação aceita (Ack)
  - `Nack = 1` → Operação rejeitada (Nack). O payload contém 1 byte com o código de erro.

#### `seq` (1 bit)

Número de sequência, alternado a cada nova mensagem para um mesmo destinatário. Utilizado pela UGE para **detectar mensagens duplicadas**:

- Se a UGE receber uma mensagem com o mesmo ID completo (incluindo `seq`) de uma mensagem já processada, ela reenvia a mesma resposta anterior sem reprocessar.
- Para garantir que uma nova requisição seja processada, a IHM deve **alternar o bit `seq`** a cada mensagem enviada para o mesmo destino.

### 2.4 Exemplo de Montagem do ID

**Cenário:** IHM quer ler o registrador REG_Vret (reg=11) no formato int16 (formato=2).

| Campo       | Valor | Binário       |
|-------------|-------|---------------|
| destino     | 2     | `0010`        |
| origem      | 1     | `0001`        |
| rede        | 0     | `00`          |
| prioridade  | 1     | `1`           |
| reg         | 11    | `0000001011`  |
| formato     | 2     | `010`         |
| oper        | 0     | `000`         |
| Nack        | 0     | `0`           |
| seq         | 0     | `0`           |

Montagem (bit 28 → bit 0):

```
seq  Nack oper    formato reg              pri rede origem  destino
 0    0   000     010     0000001011       1   00   0001    0010
```

Valor inteiro de 29 bits: `0x0045_8412`

```
ID (hex) = 0x00458412
```

> **Dica prática:** Na maioria das ferramentas CAN, o ID estendido é informado como um número de 29 bits. Basta montar o `tuCAN_ID.all` conforme a tabela acima e usar os 29 bits inferiores como o ID da mensagem.

---

## 3. Endereços de Rede

Cada dispositivo no barramento CAN possui um endereço de 4 bits, codificado nos campos `origem` e `destino` do ID. O protocolo suporta até 15 endereços (0–14), sendo 15 reservado para difusão.

### 3.1 Tabela de Endereços

| Valor | Nome            | Descrição                                      |
|-------|-----------------|------------------------------------------------|
| 0     | `END_Indefinido`| Não utilizado / inválido                       |
| 1     | `END_IHM`       | Interface Homem-Máquina                        |
| 2     | `END_Retificador`| UGE TPS125 (este firmware)                     |
| 3–14  | —               | Reservados para expansão futura                |
| 15    | `END_Difusao`   | Broadcast — mensagem para todos os dispositivos|

### 3.2 Regras de Endereçamento

- A UGE **sempre** transmite com `origem = 2` e **rejeita** mensagens cuja origem seja ela mesma (`origem == END_Retificador`) ou difusão (`origem == END_Difusao`).
- A IHM simulada deve transmitir com `origem = 1` e `destino = 2`.
- O mailbox de recepção da UGE filtra por `destino = 2` e `rede = 0`. Mensagens com outro destino são ignoradas pelo hardware.

### 3.3 Campo `rede`

O campo `rede` (2 bits) permite segmentar logicamente o barramento em até 4 redes independentes. Neste sistema, apenas a rede `0` é utilizada. O filtro de recepção da UGE exige `rede = 0`:

```c
id->bit.rede = 0;
mask->bit.rede = 0b11;  // filtra os 2 bits de rede
```

Ao montar mensagens para a UGE, a IHM deve sempre usar `rede = 0`.

### 3.4 Broadcast

O endereço de difusão (`destino = 15`) está definido no código mas o mailbox de broadcast **não está implementado** nesta versão do firmware (está comentado em `CANS_Config_Mailboxes`). A UGE não processa mensagens broadcast recebidas.

---

## 4. Operações

O protocolo define cinco operações, codificadas no campo `oper` (3 bits) do ID. O bit 2 indica a direção: `0` = requisição (IHM → UGE), `1` = resposta (UGE → IHM).

| Valor | Nome           | Direção    |
|-------|----------------|------------|
| 0     | `Req_Read`     | IHM → UGE  |
| 1     | `Req_Write`    | IHM → UGE  |
| 3     | `Advertise`    | UGE → IHM  |
| 4     | `Resp_Read`    | UGE → IHM  |
| 5     | `Resp_Write`   | UGE → IHM  |

### 4.1 Req_Read — Leitura de Registradores

A IHM solicita a leitura de um ou mais registradores consecutivos.

**Regras:**
- O campo `reg` no ID indica o **primeiro** registrador a ler.
- O payload contém **1 byte** com a quantidade de registradores a ler (`qtd`).
- `qtd` deve ser ≥ 1 e ≤ `qtd_max` do formato escolhido (4 para int16, 2 para int32/float32, 1 para int64/str8).
- A UGE responde com `Resp_Read` contendo os valores em sequência no payload.

**Formato do payload da requisição:**

```
Byte 0: qtd  (número de registradores a ler, 1 byte)
```

**Formato do payload da resposta (`Resp_Read`):**

```
Para int16 (2 bytes/reg, Big Endian):
  Byte 0-1: valor do reg+0  [MSB, LSB]
  Byte 2-3: valor do reg+1  [MSB, LSB]
  ...

Para int32 / float32 (4 bytes/reg, Big Endian):
  Byte 0-3: valor do reg+0  [B3, B2, B1, B0]
  Byte 4-7: valor do reg+1  [B3, B2, B1, B0]

Para int64 / str8 (8 bytes, 1 registro):
  Byte 0-7: valor do reg+0  [B7..B0]
```

> Todos os valores são transmitidos em **Big Endian** (byte mais significativo primeiro).

**Exemplo — Ler Vret, Vbat, Vcons e Temp_Bat (REG_Vret=11, qtd=4, formato int16):**

Requisição (IHM → UGE):
```
ID campos: destino=2, origem=1, rede=0, pri=1, reg=11, fmt=2(int16), oper=0, Nack=0, seq=0
DLC: 1
Payload: [0x04]
```

Resposta (UGE → IHM), supondo Vret=125.3V, Vbat=125.3V, Vcons=124.8V, Temp=25.1°C:
```
ID campos: destino=1, origem=2, rede=0, pri=1, reg=11, fmt=2(int16), oper=4, Nack=0, seq=0
DLC: 8
Payload: [0x04 0xE5  0x04 0xE5  0x04 0xE0  0x00 0xFB]
          \_Vret=1253_/  \_Vbat=1253_/  \_Vcons=1248_/ \_Tbat=251_/
```
> mult=_deci: valor_real = valor_int16 × 0.1 → 1253 × 0.1 = 125.3 V

---

### 4.2 Req_Write — Escrita de Registrador

A IHM escreve o valor de **um único** registrador. Escrita em lote (múltiplos registradores) não é suportada.

**Regras:**
- O campo `reg` no ID indica o registrador a escrever.
- O payload contém o valor no formato indicado por `formato` (1 registro apenas).
- A UGE valida o valor (limites, permissões, estado do sistema) antes de aceitar.
- Se `Nack=0` na requisição, a UGE responde com `Resp_Write` (Ack ou Nack).
- Se `Nack=1` na requisição, a UGE **não responde** (fire-and-forget).
- Registradores mapeados na EEPROM geram um **Ack atrasado**: a UGE aguarda a gravação na EEPROM antes de responder.

**Formato do payload da requisição:**

```
Para int16 (2 bytes, Big Endian):
  Byte 0-1: valor  [MSB, LSB]

Para int32 / float32 (4 bytes, Big Endian):
  Byte 0-3: valor  [B3, B2, B1, B0]
```

**Formato do payload da resposta (`Resp_Write`):**

- **Ack** (`Nack=0`): payload vazio (DLC=0), ou com o valor corrigido (DLC>0) se a função de validação ajustou o valor recebido.
- **Nack** (`Nack=1`): payload de 1 byte com o código de erro.

**Exemplo — Ligar o retificador (REG_Cmd_Liga=424, valor=1, formato int16):**

Requisição (IHM → UGE):
```
ID campos: destino=2, origem=1, rede=0, pri=1, reg=424, fmt=2(int16), oper=1, Nack=0, seq=0
DLC: 2
Payload: [0x00 0x01]
```

Resposta Ack (UGE → IHM):
```
ID campos: destino=1, origem=2, rede=0, pri=1, reg=424, fmt=2(int16), oper=5, Nack=0, seq=0
DLC: 0
Payload: (vazio)
```

Resposta Nack — ex: retificador já ligado (UGE → IHM):
```
ID campos: destino=1, origem=2, rede=0, pri=1, reg=424, fmt=2(int16), oper=5, Nack=1, seq=0
DLC: 1
Payload: [0x0A]   (NACK_Ligado = 0x0A)
```

**Exemplo — Alterar tensão de flutuação (REG_Vset_flu=232, valor=1.056 pu, formato int16):**

O registrador usa `base=BPU_Vcc` e `mult=_deci`. O valor em pu é multiplicado pela base nominal (ex: 125V) e pelo fator de escala (×10):

```
valor_int16 = round(1.056 × 125.0 × 10) = round(1320.0) = 1320 = 0x0528
```

Requisição (IHM → UGE):
```
ID campos: destino=2, origem=1, rede=0, pri=1, reg=232, fmt=2(int16), oper=1, Nack=0, seq=1
DLC: 2
Payload: [0x05 0x28]
```

---

### 4.3 Advertise — Anúncio Periódico

A UGE envia anúncios periodicamente **sem que a IHM precise solicitar**. É um mecanismo de push para manter a IHM atualizada.

**Regras:**
- Intervalo: **25 ms** entre cada anúncio.
- A UGE percorre ciclicamente uma lista de 53 sequências definidas em `DataList`.
- Cada anúncio pode conter até 4 registradores int16 ou 2 registradores int32 em um único frame.
- O campo `Nack=1` no ID indica que **não se espera resposta** da IHM.
- O bit `seq` é alternado a cada anúncio para o mesmo destino, permitindo à IHM detectar frames perdidos.
- O campo `reg` no ID indica o **primeiro** registrador do grupo anunciado.

**Formato do payload:**

Idêntico ao payload de `Resp_Read` — valores em Big Endian, empacotados sequencialmente.

**Exemplo — Anúncio de Vret, Vbat, Vcons, Temp_Bat (reg=11, fmt=int16, qtd=4):**

```
ID campos: destino=1, origem=2, rede=0, pri=1, reg=11, fmt=2(int16), oper=3, Nack=1, seq=0
DLC: 8
Payload: [0x04 0xE5  0x04 0xE5  0x04 0xE0  0x00 0xFB]
```

**Sequência completa de anúncios (DataList):**

Na inicialização, a UGE envia uma vez os seguintes registradores:

| reg | Nome           | Formato | qtd |
|-----|----------------|---------|-----|
| 1   | REG_Vers_FW    | int64   | 1   |
| 2   | REG_Vers_Build | str8    | 1   |
| 92  | REG_Boot       | int32   | 1   |

Em seguida, entra no ciclo normal de 53 sequências repetidas indefinidamente:

| reg | Registradores                                              | Formato | qtd |
|-----|------------------------------------------------------------|---------|-----|
| 11  | Vret, Vbat, Vcons, Temp_Bat                                | int16   | 4   |
| 15  | Iret, Ibat, Icons, Reserved1                               | int16   | 4   |
| 19  | Vca_RS, Vca_ST, Vca_TR, Vca_freq                           | int16   | 4   |
| 23  | Ica_R, Ica_S, Ica_T, Vca_seq                               | int16   | 4   |
| 73  | Car_Modo_ativo, Estado_Car, Erro_cod, Erro_ext              | int16   | 4   |
| 82  | Alarmes, Alertas                                           | int32   | 2   |
| 96  | Sin_Rede, Sin_Ret, Sin_Bat, Sin_Cons                       | int16   | 4   |
| 67  | Crono_Prog, Crono_Timeout                                  | int32   | 2   |
| 232 | Vset_flu, Vset_equ, Vset_prof, Vset_cons                   | int16   | 4   |
| 236 | Vset_emerg, Iset_ret, Iset_bat, Ilimiar_equ                | int16   | 4   |
| 240 | Tequ_delay                                                 | int32   | 1   |
| 241 | Ilimiar_flu                                                | int16   | 1   |
| 242 | Tequ_retem, Tequ_max                                       | int32   | 2   |
| 404 | Atu_Sens_Tbat                                              | int16   | 1   |
| 244 | Vcomp_ref, Vcomp_coef, Vcomp_min                           | int16   | 3   |
| 248 | Vset_teste, Iset_teste, Tlvd_retorno                       | int16   | 3   |
| 378 | Atu_Vca_sub, Atu_Vca_sobre                                 | int16   | 2   |
| 382 | Atu_Fca_sub, Atu_Fca_sobre                                 | int16   | 2   |
| 384 | Atu_Vca_seq                                                | int16   | 1   |
| 381 | Atu_Vca_balanc                                             | int16   | 1   |
| 385 | Atu_Vca_dist                                               | int16   | 1   |
| 401 | Atu_Vcons_sub                                              | int16   | 1   |
| 393 | Atu_Vcons_sobre                                            | int16   | 1   |
| 400 | Atu_Vret_sub                                               | int16   | 1   |
| 392 | Atu_Vret_sobre                                             | int16   | 1   |
| 402 | Atu_Ibat_desc, Atu_Vbat_fim                                | int16   | 2   |
| 394 | Atu_Icons_sobre, Atu_Temp_Bat                              | int16   | 2   |
| 408 | Atu_Manutencao                                             | int16   | 1   |
| 387 | Atu_Reincidencia                                           | int16   | 1   |
| 411 | Atu_Cbat_baixa                                             | int16   | 1   |
| 371 | Opt_Cbat_baixa                                             | int32   | 1   |
| 427 | Cmd_Car_Modo                                               | int16   | 1   |
| 425 | Cmd_Reset                                                  | int16   | 1   |
| 434 | UR0_Data, UR1_Data                                         | int32   | 2   |
| 436 | UR2_Data, UR3_Data                                         | int32   | 2   |
| 438 | UR4_Data, UR5_Data                                         | int32   | 2   |
| 440 | UR6_Data, UR7_Data                                         | int32   | 2   |
| 442 | UR8_Data, UR9_Data                                         | int32   | 2   |
| 444 | UR10_Data, UR11_Data                                       | int32   | 2   |
| 446 | UR12_Data, UR13_Data                                       | int32   | 2   |
| 448 | UR14_Data, UR15_Data                                       | int32   | 2   |
| 450 | UR16_Data, UR17_Data                                       | int32   | 2   |
| 452 | UR18_Data, UR19_Data                                       | int32   | 2   |
| 454 | UR20_Data, UR21_Data                                       | int32   | 2   |
| 456 | UR22_Data, UR23_Data                                       | int32   | 2   |
| 458 | UR24_Data, UR25_Data                                       | int32   | 2   |
| 460 | UR26_Data, UR27_Data                                       | int32   | 2   |
| 462 | UR28_Data, UR29_Data                                       | int32   | 2   |
| 464 | UR30_Data, UR31_Data                                       | int32   | 2   |
| 466 | UR_Status_manual_mode, UR_Status_protection_status         | int32   | 2   |
| 468 | UR_Status_module_fault, UR_Status_over_temperature         | int32   | 2   |
| 470 | UR_Status_power_on, UR_Status_ausente                      | int32   | 2   |
| 472 | UR_Status_subtensao, UR_Status_sobretensao                 | int32   | 2   |

> O ciclo completo de 53 anúncios leva aproximadamente **53 × 25ms = 1,325s** para ser concluído.

---

### 4.4 Nack — Resposta de Erro

Quando a UGE rejeita uma operação, responde com `Nack=1` no ID e 1 byte de payload contendo o código de erro.

**Códigos de Nack do protocolo** (definidos em `teCAN_Nack`):

| Código | Nome               | Descrição                                      |
|--------|--------------------|------------------------------------------------|
| 0xD0   | NACK_Conversao     | Conversão de formato não suportada             |
| 0xD1   | NACK_Sinal         | Valor com sinal inválido (ex: negativo em campo positivo) |
| 0xD2   | NACK_Excessao      | Bug interno — registrador não tratado          |
| 0xE0   | NACK_Inexistente   | Registrador não mapeado                        |
| 0xE1   | NACK_Permissao_W   | Registrador sem permissão de escrita           |
| 0xE2   | NACK_Permissao_R   | Registrador sem permissão de leitura           |
| 0xF0   | NACK_Mal_Formado   | Mensagem mal formada (ex: DLC incorreto)       |
| 0xF1   | NACK_Operacao      | Operação não suportada                         |
| 0xF2   | NACK_Formato       | Formato de dados não suportado                 |
| 0xF3   | NACK_Quantidade    | Quantidade de registradores fora da faixa      |

**Códigos de Nack da aplicação** (definidos em `teDataNack`):

| Código | Nome                | Descrição                                              |
|--------|---------------------|--------------------------------------------------------|
| 0x01   | NACK_Silencio       | Operação rejeitada silenciosamente                     |
| 0x02   | NACK_Ocupado        | Sistema ocupado, tentar novamente                      |
| 0x03   | NACK_Vazio          | Valor vazio não permitido neste contexto               |
| 0x04   | NACK_Intervalo      | Valor fora do intervalo aceitável                      |
| 0x05   | NACK_Invalido       | Parâmetro inválido                                     |
| 0x06   | NACK_Inconsistente  | Inconsistência com outro registrador                   |
| 0x07   | NACK_EEPROM_Init    | EEPROM não inicializada                                |
| 0x08   | NACK_EEPROM_Erro    | Erro de escrita na EEPROM                              |
| 0x09   | NACK_Jiga           | Operação indisponível em modo jiga                     |
| 0x0A   | NACK_Ligado         | Operação só permitida com retificador desligado        |
| 0x0D   | NACK_Remoto         | Bloqueado por comando remoto                           |
| 0x0E   | NACK_Carga_Inibida  | Modo de carga inibido                                  |
| 0x0F   | NACK_Retido         | Necessário reconhecer falhas antes de ligar            |
| 0x10   | NACK_Aguarde        | Aguardar antes de religar                              |
| 0x13   | NACK_Desligado      | Operação só permitida com retificador operando         |
| 0x17   | NACK_Nao_Flutuando  | Operação só permitida em estado de flutuação           |

---

### 4.5 Detecção de Mensagens Duplicadas

A UGE mantém um buffer `recent[16]` indexado pelo endereço de origem, guardando o ID e o payload da última requisição e resposta de cada dispositivo.

Ao receber uma mensagem, a UGE compara o ID completo (incluindo `seq`) com o salvo:
- Se for **igual** ao anterior: reenvia a mesma resposta sem reprocessar.
- Se for **diferente**: processa normalmente e salva a nova requisição/resposta.

Para garantir que cada nova requisição seja processada, a IHM deve **alternar o bit `seq`** a cada mensagem enviada para o mesmo destino.

---

## 5. Mapa de Registradores

O mapa completo de registradores está documentado no arquivo **[DATAMAP.md](DATAMAP.md)**.

O mapa possui **512 posições** (`DATAMAP_SIZE = 512`), com registradores ativos distribuídos entre os endereços 1 e 473. Posições sem entrada retornam `NACK_Inexistente`.

Os registradores estão organizados nos seguintes grupos:

| Grupo | Faixa | Descrição |
|---|---|---|
| Versão e boot | 1–6 | Versão de firmware, build, expansões |
| Medições CC | 11–18 | Tensões e correntes CC e temperatura |
| Medições CA | 19–26 | Tensões, correntes e frequência CA |
| Grandezas elétricas | 35–52 | Potência, fator de potência, harmônicos |
| Temperatura de bateria | 59–66 | Sensores individuais de temperatura |
| Status e diagnóstico | 67–99 | Estado do sistema, alarmes, sinóticos |
| Diagnóstico avançado | 104–118 | Médias e RMS de sensores |
| Calibração | 128–149 | Números de série, ganhos e offsets |
| Parâmetros base | 160–182 | Nominais, limites, configuração UR125 |
| Sensores internos | 192–199 | Configuração dos sensores internos |
| Sensores externos | 208–215 | Configuração dos sensores externos |
| Parâmetros de carga | 224–258 | Setpoints, temporizações, compensação |
| Configuração de relés | 264–327 | Mapeamento de relés por alarme/status |
| Opções de alarme | 328–375 | Retardo e ação de cada alarme |
| Limiares de alarme | 376–415 | Valores de atuação de cada alarme |
| Testes e comandos | 416–427 | Entradas/saídas digitais, comandos |
| Módulos UR125 | 430–473 | Dados e status dos módulos retificadores |

---

## 6. Comportamentos e Casos Especiais

### 6.1 Sequência de Inicialização da CAN

A CAN passa por duas fases de inicialização distintas:

**Fase 1 — Inicialização do hardware** (`CANS_Init_Hardware`, chamada em `HW_Init`):
- O periférico CANA é configurado (clock, baud rate, bus-off recovery).
- O controlador permanece em modo `INIT` — **não transmite nem recebe** nenhuma mensagem.

**Fase 2 — Habilitação lógica** (`CANEnable`, chamada ao final de `EST_Parametrizacao`):
- Ocorre somente após a EEPROM ser carregada e os parâmetros validados.
- A partir deste momento o controlador começa a operar no barramento.
- Os mailboxes de recepção são configurados em `CANS_Init_Logica`, chamada durante `APP_Init`.

**Delay inicial dos anúncios:**
Após o `CANEnable`, a UGE aguarda **500 ms** antes de enviar o primeiro anúncio:

```c
static unsigned tempo_anuncios = 500; // ms
```

Portanto, a IHM deve aguardar pelo menos 500 ms após detectar a UGE no barramento antes de esperar receber anúncios. Requisições de leitura e escrita podem ser enviadas imediatamente após o `CANEnable`.

**Sequência completa esperada pela IHM:**

```
1. UGE liga → hardware CAN inicializado (modo INIT, barramento silencioso)
2. ~1-2s depois → CANEnable (UGE começa a receber)
3. +500ms → primeiro anúncio enviado (REG_Vers_FW, int64)
4. +25ms  → segundo anúncio (REG_Vers_Build, str8)
5. +25ms  → terceiro anúncio (REG_Boot, int32)
6. +25ms  → início do ciclo normal de 53 anúncios
```

---

### 6.2 Bloqueio por Ack Pendente

A UGE suporta apenas **um Ack pendente por vez**. Enquanto houver um Write aguardando confirmação da EEPROM, qualquer novo Write recebido é **silenciosamente descartado** — sem resposta, sem Nack:

```c
if (CAN_Sup.delayed_ack.pending) {
    // Não faz nada. O remetente deverá fazer uma retransmissão.
    return;
}
```

**Implicações para a IHM:**
- Após enviar um Write em registrador persistido na EEPROM, aguardar o Ack antes de enviar outro Write.
- O tempo de espera depende do tempo de gravação da EEPROM, que pode variar de alguns ms a dezenas de ms.
- Se o Ack não chegar dentro de um timeout razoável (~600 ms), reenviar a mensagem com o **mesmo** `seq` — a UGE detectará como duplicata e reenviará a resposta se já tiver processado.
- Registradores **sem** seção EEPROM (`sec=SEC_Nenhuma`) respondem imediatamente e não causam bloqueio.

---

### 6.3 Ack com Valor Corrigido

Quando a UGE aceita um Write mas a função de validação do grupo precisou **ajustar o valor** recebido (ex: saturar fora dos limites, aplicar consistência com outro parâmetro), o Ack é enviado com o valor efetivamente gravado no payload:

```c
if (CAN_Sup.delayed_ack.changed) {
    // Lê o valor da aplicação e monta o payload
    MAP_Read_Host(regno, ntype, &buf);
    CANS_Montar_Corpo(&msg, 1);
}
```

**Exemplos de situações que geram Ack com valor corrigido:**
- `REG_Vset_flu` enviado maior que `REG_Vset_equ` → saturado ao valor de equalização.
- `REG_Vset_equ` enviado menor que `REG_Vset_flu` → ajustado para o valor de flutuação.
- Qualquer parâmetro enviado fora dos limites válidos → saturado ao limite mais próximo.

**A IHM deve sempre verificar o payload do Ack** para confirmar o valor que foi efetivamente gravado, especialmente em parâmetros com dependências entre si.

---

### 6.4 Reboot e CAN

Quando a IHM envia `REG_Cmd_Reboot`, a UGE não reinicia imediatamente. O reboot é **agendado** e só ocorre quando todas as condições abaixo forem satisfeitas simultaneamente:

```c
if ((E2P.estado == EPE_Ocioso) &&
    (!CAN_Sup.delayed_ack.pending) &&
    (!Horimetro.write_pending)) {
    // aguarda 5ms para esvaziar TX da CAN
    DELAY_US(5000);
    Reboot(causa);
}
```

| Condição | Descrição |
|----------|-----------|
| EEPROM ociosa | Nenhuma gravação em andamento |
| Sem Ack pendente | Ack do último Write já foi enviado |
| Horímetro gravado | Dados do horímetro já foram persistidos |

Após o reboot, a UGE reinicia do zero — a IHM perderá a comunicação por alguns segundos até o `CANEnable` ser chamado novamente (ver seção 6.1).

---

### 6.5 Mailbox TX_Requisicao (Reservado)

O mailbox `MBX_Requisicao` (número 3) está configurado com `destino = END_IHM` e `origem = END_Retificador`, mas **não é utilizado** em nenhuma parte do firmware atual. Está reservado para uma funcionalidade futura onde a UGE poderia iniciar requisições para a IHM (ex: solicitar confirmação de um comando).

A IHM simulada pode ignorar mensagens com `oper = Req_Read` ou `oper = Req_Write` vindas da UGE, pois não são geradas pelo firmware atual.

---

### 6.6 Detecção de Frames Perdidos via Campo `seq`

Nos anúncios (Advertise), o bit `seq` é gerenciado por um bitfield `tx_seq` indexado pelo **endereço de destino**:

```c
CAN_Sup.tx_seq.all ^= (1U << destino);  // inverte o bit do destino
id.bit.seq = (CAN_Sup.tx_seq.all >> destino) & 1;
```

Isso significa que o bit `seq` **alterna a cada anúncio enviado para a IHM**, independentemente do registrador anunciado. A IHM pode usar isso para detectar frames perdidos:

- Se dois anúncios consecutivos chegarem com o **mesmo** valor de `seq`, um frame foi perdido entre eles.
- Se o `seq` alternar normalmente, nenhum frame foi perdido.

> Nota: este mecanismo detecta apenas a perda de **um** frame entre dois recebidos. Perdas múltiplas consecutivas não são detectáveis apenas pelo `seq`.

Para requisições (Read/Write), o `seq` tem função diferente — é usado para detecção de duplicatas (ver seção 4.5). A IHM deve alternar o `seq` a cada nova requisição enviada para a UGE.
