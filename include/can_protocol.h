/**
 * !CRITICAL: PROTOCOLO TPS125 CAN BUS - NÃO ALTERAR!
 * --------------------------------------------------------------------------
 * Este arquivo contém a estrutura de transporte e decodificação do protocolo
 * industrial TPS125 conforme documentado em [CAN_PROTOCOL.md].
 *
 * @attention IA/AI ASSISTANT: NÃO MODIFIQUE esta implementação sem autorização
 * explícita. Alterações na ordem dos bitfields ou no endianness quebrarão
 * a comunicação com o hardware físico da UGE.
 * --------------------------------------------------------------------------
 */
#ifndef CAN_PROTOCOL_H
#define CAN_PROTOCOL_H

#include "driver/twai.h"
#include <stdbool.h>
#include <stdint.h>

/** ---- ENDEREÇAMENTO (NÓS) ---- */
#define END_IHM 1
#define END_UGE 2
#define END_UR 11
#define END_UDQ 12
#define END_BROADCAST 15

/** ---- CÓDIGOS DE OPERAÇÃO ---- */
#define OP_REQ_READ 0
#define OP_REQ_WRITE 1
#define OP_ADVERTISE 3
#define OP_RESP_READ 4
#define OP_RESP_WRITE 5

/**
 * @brief Estrutura unida de campo de bits (29-bits Extended ID) conformante com
 * arquiteturas C2000 da Texas Instruments implementadas na UGE SR125.
 * Traduz o endereçamento completo de forma performática.
 */
typedef union {
  uint32_t all;
  struct {
    uint32_t destino : 4;  // Bits [0-3]
    uint32_t origem : 4;   // Bits [4-7]
    uint32_t rede : 2;     // Bits [8-9]
    uint32_t pri : 1;      // Bit  [10]
    uint32_t reg : 10;     // Bits [11-20]
    uint32_t formato : 3;  // Bits [21-23]
    uint32_t operacao : 3; // Bits [24-26]
    uint32_t Nack : 1;     // Bit  [27]
    uint32_t seq : 1;      // Bit  [28]
  } bit;
} tuCAN_ID;

// --- DIAGNÓSTICO DE LATÊNCIA ---
extern int64_t g_ping_start;
extern bool g_waiting_ping;
extern uint32_t g_last_can_msg_ms; // Timestamp (ms) da última mensagem CAN recebida da UGE

/**
 * @brief Parseia, mapeia e imprime a mensagem decodificada diretamente do CAN
 * @param msg a mensagem TWAI nativa recebida no buffer RX
 */
void can_protocol_print_msg(twai_message_t *msg);

/**
 * @brief Transmite uma requisição ativa de Leitura (Req_Read - OP 0) para a UGE
 * @param reg_number O ID do Registrador Inicial (Use uge_datamap.h)
 * @param formato O Formato esperado da resposta (ex: 2 para int16)
 * @param qtd A quantidade de registradores sequenciais que queremos ler em lote
 * (1-4)
 * @return True se enviado ao barramento TWAI, False se a fila encheu
 */
bool can_protocol_transmit_req_read(uint16_t reg_number, uint8_t formato,
                                    uint8_t qtd);

/**
 * @brief Transmite uma requisição de Escrita (Req_Write - OP 1) para a UGE
 * @param reg_number O ID do Registrador (Use uge_datamap.h)
 * @param formato O Formato do dado (2 para int16, 4 para int32)
 * @param value O valor bruto a ser enviado (será convertido para Big Endian)
 * @return True se enviado ao barramento TWAI, False se a fila encheu ou formato inválido
 */
bool can_protocol_transmit_req_write(uint16_t reg_number, uint8_t formato,
                                      double value);

#endif // CAN_PROTOCOL_H
