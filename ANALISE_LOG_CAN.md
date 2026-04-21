# Análise Prática do Barramento CAN (UGE TPS125)

Este documento registra o comportamento prático do barramento CAN entre a UGE (Unidade de Gerenciamento) e a IHM, baseado em capturas reais feitas pelo ESP32 operando como Sniffer. O objetivo é servir como guia de referência rápida para comportamentos e diagnósticos da rede.

## 1. Comportamento Sem Node de Resposta ("Listen Only")

**Cenário:** ESP32 configurado em `TWAI_MODE_LISTEN_ONLY` conectado sozinho à UGE.
**Sintoma:** Log inundado (spam) com a mesma mensagem repetida inúmeras vezes em intervalos curtos.

**Causa Raiz (Norma ISO-11898):**
O protocolo CAN exige que pelo menos um nó na rede confirme o recebimento de uma mensagem escrevendo um bit Dominante (`0`) no slot de **ACK** (Acknowledge) ao final do frame. 
Quando operamos o ESP32 em modo "Listen Only", ele apenas lê a tensão diferencial, mas **não escreve o ACK**. Como consequência:
1. O controlador CAN da UGE detecta um "Ack Error".
2. O periférico enxerga a transmissão como falha.
3. A retranmissão automática de mensagens com erro está ativada no firmware da UGE. Logo, a UGE reenvia a mesma mensagem infinitamente na tentativa de obter um ACK.

**Solução para desenvolvimento:** 
Para eliminar o loop de repetições quando testando a UGE apenas com o ESP32, o driver TWAI deve ser inicializado em `TWAI_MODE_NORMAL`. Dessa forma, o ESP32 fornecerá os ACKs em nível de hardware e a UGE seguirá seu fluxo normal de firmware, enviando pacotes singulares conforme a especificação.

---

## 2. Sequência Perfeita de Boot (Com IHM presente)

**Cenário:** UGE inicializando com a IHM verdadeira conectada ao barramento, e ESP32 atuando como Sniffer passivo.
**Sintoma:** O barramento flui de maneira impecável, alinhado 100% à Seção 6.1 do `CAN_PROTOCOL.md`. Os eventos de tempo medidos batem rigorosamente com a especificação da arquitetura C2000.

### Cronologia do Boot (Dados Reais do Log)

*   **`T = 0s` a `~1.5s` (Modo Silencioso):** 
    O hardware CAN da UGE é inicializado pelo firmware, contudo, permanece em modo INIT. Ocorre a leitura da EEPROM interna e setup dos pinos lógicos. Nenhuma mensagem transita na rede.

*   **`T = BOOT + 500ms` (As 3 Mensagens de Boas Vindas):**
    Ocorrendo o `CANEnable`, a placa obedece a um atraso cravado de 500ms e despeja três mensagens em fila para a IHM anunciando que está viva, separadas cirurgicamente pela rotina de *Delay* do RTOS (intervalo entre 20ms e 30ms):
    1.  **Reg 1 (`REG_Vers_FW`)**: Msg `0x1BC00C21` -> Retorna a assinatura Int64 do compilado FW. (Bit `seq`=1)
    2.  **Reg 2 (`REG_Vers_Build`)**: Msg `0x0BE01421` -> Retorna a string do lote ASCII (ex: `140322B`). (Bit `seq`=0)
    3.  **Reg 92 (`REG_Boot`)**: Msg `0x1B82E421` -> Retorna `Int32(0)` indicando flag de boot/reset limpo. (Bit `seq`=1)

*   **`T = BOOT + 1.78s` (O Respiro Interno de ~1,28s):**
    Imediatamente após a última mensagem de boot (`REG_Boot`), nota-se no log um salto temporal sem comunicação CAN de **~1,28 segundos**. Esta lacuna condiz perfeitamente com o tempo de 1,325s que um ciclo principal de 53 aquisições leva para ser percorrido internamente pela placa. O software UGE utiliza esta primeira varredura invisível para estabilizar as leituras dos conversores analógicos-digitais (V/I), amarrar estados térmicos e assentar status de alarmes *antes* de enviá-los de forma interativa.

*   **A partir de `T = BOOT + 3.0s` (Ciclo de Máquina Infinito - *Advertise*):**
    A UGE entra em estado permanente de `Push`. Ela empacota grupos lógicos de até 4 registradores (ex: Vret, Vbat) e envia ao barramento utilizando a Operação = 3 (`Advertise`) e Flag = `Nack=1` (Não precisando de resposta de software da IHM).
    Os envios mantêm um sincronismo de ~25ms entre si de forma contínua e repetem-se a cada ~1,3 segundos (`53 * 25ms`). O campo estendido `seq` no bit 28 oscila eternamente de `0x0B...` para `0x1B...` indicando sucesso à IHM.

### Tabela de Resumo de Decode de ID (Boas Vindas)

| Ordem | ID Estendido | Operação | Reg ID (Dec) | Significado | Payload Notável |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1º** | `0x1BC00C21` | `3` (Advertise)| `1` | Versão de FW (Int64)| `75 CA 00 01 2B 4B 06 00` |
| **2º** | `0x0BE01421` | `3` (Advertise)| `2` | Build (Str8) | `31 34 30 33 32 32 42 00` |
| **3º** | `0x1B82E421` | `3` (Advertise)| `92` | State Boot (Int32) | `00 00 00 00` |

---
**Conclusão:** 
O protocolo descrito no `CAN_PROTOCOL.md` reflete perfeitamente a implementação do Firmware C2000 em nível de bit e temporização. Para aplicações customizadas, a camada de rede CAN baseada no ESP32 precisa imitar o Bit Timing `BRP=80, Tseg1=10, Tseg2=5` para bater os exatos 62.5 kbps em formato Extendido e em Modo Normal (ACK enable).
