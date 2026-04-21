# Decodificação da Versão de Firmware via CAN (UGE TPS125)

Este documento detalha o processo de obtenção e decodificação da versão de firmware da UGE TPS125 através do barramento CAN. Os dados aqui abstraídos complementam o `DATAMAP.md` e o `CAN_PROTOCOL.md`.

## 1. Como obter a versão via CAN

A versão do sistema é transmitida pela UGE em dois registradores principais:

| Registrador | ID | Formato | Tamanho (Bytes) | Descrição |
| :--- | :---: | :---: | :---: | :--- |
| **REG_Vers_FW** | 1 | `int64` (6) | 8 bytes | Informações sobre Família, Projeto, Versão, Edição e Variante de código. |
| **REG_Vers_Build** | 2 | `str8` (7) | 8 bytes | String ASCII contendo o Build (ex: `280225A`). |

### 1.1 Obtenção Passiva (Advertise no Boot)
Aproximadamente 500 ms pós a inicialização do módulo CAN (modo operante), a UGE emite via *Broadcast* uma única vez (**Advertise**, `oper = 3`) os registradores `REG_Vers_FW` e `REG_Vers_Build`.

### 1.2 Obtenção Ativa (Req_Read)
A qualquer momento, a IHM pode requisitar de forma ativa a versão, enviando um **Req_Read** (`oper = 0`):

**Mensagem `Req_Read` para a versão numérica:**
*   **Campos do ID:** Destino = 2 (UGE), Origem = 1 (IHM), Reg = 1, Formato = 6 (`int64`), Oper = 0 (`Req_Read`).
*   **Payload (DLC = 1):** `[0x01]` (Solicita leitura de 1 registrador).

A resposta virá como um **Resp_Read** (`oper = 4`) transportando 8 bytes no **Payload**.

---

## 2. Decodificação da Estrutura Numérica (REG_Vers_FW)

O `DATAMAP.md` menciona a utilização de um formato *BCD empacotado*, porém a extração prática e a definição da estrutura do tipo `tuNumeroSW_dec` em C demonstram que os dados transitam em **valores inteiros puros**, enfileirados sob a estrutura de um `int64` (64 bits).

### 2.1 Mapeamento de Bits (Bitfield)

A UGE empacota as informações e transmite em representação **Big Endian** sobre o barramento CAN (Ou seja, o Byte 0 do Payload é o mais Significativo - MSB, enquanto o Byte 7 é o menos Significativo - LSB). 

Mapeamento da leitura correspondente aos 8 Bytes do DataFrame:

| Bytes do CAN | Tamanho da Variável | Nome Interno | Representação | Extração Dinâmica |
| :---: | :---: | :---: | :--- | :--- |
| **Byte 0 e 1** | `uint16` (16 bits) | **TFFFF** | Tipo do Código + Número da Família | Até o valor numérico 59999 |
| **Byte 2** | `int8` (8 bits) | **VV** | Versão Maior | De -128 a 127 |
| **Byte 3** | `int8` (8 bits) | **EE** | Edição (Versão Menor) | De -128 a 127 |
| **Byte 4 e 5** | `uint16` (16 bits) | **NPPPP** | Variante de Projeto + Número do Projeto | Até o valor numérico 59999 |
| **Byte 6** | `int8` (8 bits) | **RR** | Revisão | De -128 a 127 |
| **Byte 7** | `int8` (8 bits) | **SS** | Sub-revisão | De -128 a 127 |

### 2.2 Entendendo o Formato Base-10 (BCD)

Nos atributos estendidos (TFFFF e NPPPP), o firmware utiliza aritmética Decimal Base 10 (onde cada casa decimal representa semanticamente um escopo e não necessita de descompactação binária hexadecimal) para codificar as variantes.

A separação dessas informações é feita mediante cálculo matémático de divisão por múltiplos de 10 mil (`10.000`):

*   **Extraindo Tipo (T) e Família (FFFF):**
    *   `Tipo` = TFFFF / 10000
    *   `Familia` = TFFFF % 10000
*   **Extraindo Prefixo/Variante (N) e Projeto (PPPP):**
    *   `Variante` = NPPPP / 10000
    *   `Projeto` = NPPPP % 10000

---

## 3. Comportamento das Variantes Confirmadas (Dump Prático)

Abaixo seguem os Dumps provados sob execução real analisando a resposta da rede CAN com o **Reg=1** (Tamanho Total de 64 bits/8 bytes), e como a decodificação matemática revela perfeitamente o propósito do Firmware.

### 3.1 Firmware Padrão (Cliente)
*   **Dados (Hex):** `00 9A 00 00 04 3B 06 03`

| Campo | Valor Hex | Valor Base 10 | Decodificação Final |
| :--- | :---: | :---: | :--- |
| **TFFFF** | `0x009A` | 154 | Tipo (**T**): **0** (Cliente) – Família (**F**): **154** |
| **VV.EE** | `00` `00` | 0 e 0 | Versão (**V**): **0** – Edição/Especial (**E**): **0** |
| **NPPPP** | `0x043B` | 1083 | Soft.Temp (**N**): **0** – PCB/Projeto (**P**): **1083** |
| **RR.SS** | `06` `03` | 6 e 3 | Rev PCB (**R**): **6** – Rev Software (**S**): **3** |

*   **String Final na IHM:** `0154-00-00-1083-06-03`

### 3.2 Firmware Especial (Burn-in)
*   **Dados (Hex):** `27 AA 00 00 2B 4B 06 03`

| Campo | Valor Hex | Valor Base 10 | Decodificação Final |
| :--- | :---: | :---: | :--- |
| **TFFFF** | `0x27AA` | 10154 | Tipo (**T**): **1** (Burn-in) – Família (**F**): **154** |
| **VV.EE** | `00` `00` | 0 e 0 | Versão (**V**): **0** – Edição/Especial (**E**): **0** |
| **NPPPP** | `0x2B4B` | 11083 | Soft.Temp (**N**): **1** – PCB/Projeto (**P**): **1083** |
| **RR.SS** | `06` `03` | 6 e 3 | Rev PCB (**R**): **6** – Rev Software (**S**): **3** |

*   **String Final na IHM:** `0154-00-00-1083-06-03 (Burn-in: 1)`

### 3.3 Firmware de Inspeção (Jiga)
*   **Dados (Hex):** `75 CA 00 00 2B 4B 06 03`

| Campo | Valor Hex | Valor Base 10 | Decodificação Final |
| :--- | :---: | :---: | :--- |
| **TFFFF** | `0x75CA` | 30154 | Tipo (**T**): **3** (Jiga) – Família (**F**): **154** |
| **VV.EE** | `00` `00` | 0 e 0 | Versão (**V**): **0** – Edição/Especial (**E**): **0** |
| **NPPPP** | `0x2B4B` | 11083 | Soft.Temp (**N**): **1** – PCB/Projeto (**P**): **1083** |
| **RR.SS** | `06` `03` | 6 e 3 | Rev PCB (**R**): **6** – Rev Software (**S**): **3** |

*   **String Final na IHM:** `0154-00-00-1083-06-03 (Jiga: 1)`

---

## 4. Algoritmo Orientado (Linguagem C) Recomendado para IHM

```c
#include <stdint.h>
#include <stdio.h>

void decodificar_firmware(uint8_t payload[8]) {
    
    // Leitura Big Endian por escopo dos arrays de bytes
    uint16_t tffff = (payload[0] << 8) | payload[1];
    int8_t vv      = payload[2];
    int8_t ee      = payload[3];
    uint16_t npppp = (payload[4] << 8) | payload[5];
    int8_t rr      = payload[6];
    int8_t ss      = payload[7];

    // Separação em Base Decimal
    int tipo       = tffff / 10000;
    int familia    = tffff % 10000;
    int variante   = npppp / 10000;
    int projeto    = npppp % 10000;

    // Resolução visual do modelo
    const char* modelo_str;
    if (tipo == 0)      modelo_str = "Cliente";
    else if (tipo == 1) modelo_str = "Burn-in";
    else if (tipo == 3) modelo_str = "Jiga";
    else                modelo_str = "Desconhecido";

    // Impressão para o Usuário
    printf("--- UGE FIRMWARE INFO ---\n");
    printf("Modelo     : %s (Tipo %d)\n", modelo_str, tipo);
    printf("Familia    : [%d]\n", familia);
    printf("Projeto    : [%d] (Variante %d)\n", projeto, variante);
    printf("Versao Completa: v%d.%d.%d.%d\n", vv, ee, rr, ss);
}
```
