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
#include "can_protocol.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "ihm_state.h"
#include "uge_datamap.h"
#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

// Diagnóstico de latência global
int64_t g_ping_start = 0;
bool g_waiting_ping = false;
uint32_t g_last_can_msg_ms = 0; // Timestamp da última mensagem recebida da UGE

void can_protocol_print_msg(twai_message_t *msg) {
  if (!msg->extd)
    return; // Ignora se não for Extended ID (29-bits)

  tuCAN_ID id_dec;
  id_dec.all =
      msg->identifier; // Cast nativo via memory map! Lindo e performático.

  // Destino 1=IHM, 15=Broadcast
  if (id_dec.bit.origem == END_UGE &&
      (id_dec.bit.destino == END_IHM || id_dec.bit.destino == END_BROADCAST)) {

    // Verifica a nossa NOVA Flag para silenciar o Spam do ADVERTISE (Op=3)
    if (g_ihm_state.flags.ignore_advertise &&
        id_dec.bit.operacao == OP_ADVERTISE) {
      return; // Se estiver habilitado, sai correndo!
    }

    // ==========================================
    // PARSER & INJEÇÃO DE DADOS (DATA STORE)
    // ==========================================
    // OP_RESP_READ (4) ou OP_ADVERTISE (3)
    if ((id_dec.bit.operacao == OP_RESP_READ && id_dec.bit.Nack == 0 && msg->data_length_code > 0) ||
        (id_dec.bit.operacao == OP_ADVERTISE && id_dec.bit.Nack == 1 && msg->data_length_code > 0)) {

      // Atualiza o heartbeat do link CAN com a UGE
      g_last_can_msg_ms = pdTICKS_TO_MS(xTaskGetTickCount());

      // Se estivemos esperando um ping pelo reg 11 (VRET)
      if (g_waiting_ping && id_dec.bit.reg == REG_VRET) {
        g_waiting_ping = false;
      }

      // Suportando a leitura de múltiplos registradores de 16bits empacotados!
      if (id_dec.bit.formato == 2 && msg->data_length_code % 2 == 0) {
        uint8_t qtd = msg->data_length_code / 2;
        for (int i = 0; i < qtd; i++) {
          int32_t raw_val =
              (int16_t)((msg->data[i * 2] << 8) | msg->data[i * 2 + 1]);
          ihm_state_update_register(id_dec.bit.reg + i, raw_val);
        }
      }
      // Suportando a leitura de dados de 32-bits (Formato 4)!
      else if (id_dec.bit.formato == 4 && msg->data_length_code % 4 == 0) {
        uint8_t qtd = msg->data_length_code / 4;
        for (int i = 0; i < qtd; i++) {
          int32_t raw_val =
              (int32_t)((msg->data[i * 4] << 24) |
                        (msg->data[i * 4 + 1] << 16) |
                        (msg->data[i * 4 + 2] << 8) | msg->data[i * 4 + 3]);

          // No mapa de dados da UGE SR125, cada variável ocupa 1 índice ÚNICO
          // (+1), independente de ser int16 ou int32.
          ihm_state_update_register(id_dec.bit.reg + i, raw_val);
        }
      }
      // Suporta leitura de int64_t (Formato 6) para Firmware
      else if (id_dec.bit.formato == 6 && msg->data_length_code == 8) {
          uint64_t raw_val = 0;
          for (int i = 0; i < 8; i++) {
              raw_val = (raw_val << 8) | msg->data[i];
          }
          if (id_dec.bit.reg == 1) { // REG_Vers_FW
              g_ihm_state.uge_fw_raw = raw_val;
          }
      }
      // Suporta leitura de str8 (Formato 7) para Build String
      else if (id_dec.bit.formato == 7 && msg->data_length_code > 0) {
          if (id_dec.bit.reg == 2) { // REG_Vers_Build
              int len = msg->data_length_code < 8 ? msg->data_length_code : 8;
              memcpy(g_ihm_state.uge_fw_build, msg->data, len);
              g_ihm_state.uge_fw_build[len] = '\0';
          }
      }
    }
    // ==========================================

    // Se o debug no console não estiver ativado, também sai da printagem visual
    // grossa
    if (!g_ihm_state.flags.debug_print_can) {
      return;
    }

    // Mapeando Strings amigáveis para a "Operação" Ocorrida
    const char *op_str = "Desc";
    switch (id_dec.bit.operacao) {
    case OP_REQ_READ:
      op_str = "Req_Read";
      break;
    case OP_REQ_WRITE:
      op_str = "Req_Write";
      break;
    case OP_ADVERTISE:
      op_str = "Advertise";
      break;
    case OP_RESP_READ:
      op_str = "Resp_Read";
      break;
    case OP_RESP_WRITE:
      op_str = "Resp_Write";
      break;
    }

    printf("[%s] Reg: %3u | Fmt: %u | Seq: %u | Nack: %u | ", op_str,
           id_dec.bit.reg, id_dec.bit.formato, id_dec.bit.seq, id_dec.bit.Nack);

    // Tratamento especial para formato 7 (string8)
    if (id_dec.bit.formato == 7) {
      char txt[9] = {0}; // 8 bytes + nulo terminador
      memcpy(txt, msg->data, msg->data_length_code);
      printf("Dados(Str): %s\n", txt);
    } else {
      printf("Dados(Hex): ");
      for (int i = 0; i < msg->data_length_code; i++) {
        printf("%02X ", msg->data[i]);
      }
      printf("\n");
    }
  }
}

bool can_protocol_transmit_req_read(uint16_t reg_number, uint8_t formato,
                                    uint8_t qtd) {
  tuCAN_ID tx_id;
  tx_id.all = 0; // Zera por segurança

  tx_id.bit.destino = END_UGE;
  tx_id.bit.origem = END_IHM;
  tx_id.bit.rede = 0; // 0 default
  tx_id.bit.pri = 1;  // 1 default
  tx_id.bit.operacao = OP_REQ_READ;
  tx_id.bit.reg = reg_number;
  tx_id.bit.formato = formato;
  tx_id.bit.Nack = 0; // IMPORTANTE: 0 = UGE responde, 1 = Silêncio

  // Alternancia do bit SEQ pode ser necessária mas pra request_read isolada
  // serve 0
  static uint8_t flag_seq = 0;
  tx_id.bit.seq = flag_seq;
  flag_seq = !flag_seq;

  twai_message_t tx_msg = {0};
  tx_msg.identifier = tx_id.all;
  tx_msg.extd = 1;             // Utiliza a estrutura Extended (29-bits)
  tx_msg.data_length_code = 1; // Requisita lendo byte único de instrução
  tx_msg.data[0] = qtd;        // Quantos registradores? (Max 4 se int16)

  // Bloqueia no max 10ms se a fila TX estiver meio cheia
  if (twai_transmit(&tx_msg, pdMS_TO_TICKS(10)) == ESP_OK) {
    return true;
  }
  return false;
}

bool can_protocol_transmit_req_write(uint16_t reg_number, uint8_t formato,
                                     float value) {
  tuCAN_ID tx_id;
  tx_id.all = 0;

  tx_id.bit.destino = END_UGE;
  tx_id.bit.origem = END_IHM;
  tx_id.bit.rede = 0;
  tx_id.bit.pri = 1;
  tx_id.bit.operacao = OP_REQ_WRITE;
  tx_id.bit.reg = reg_number;
  tx_id.bit.formato = formato;
  tx_id.bit.Nack = 0;

  static uint8_t flag_seq_w = 0;
  tx_id.bit.seq = flag_seq_w;
  flag_seq_w = !flag_seq_w;

  twai_message_t tx_msg = {0};
  tx_msg.identifier = tx_id.all;
  tx_msg.extd = 1;

  // Agradecimento à União para evitar truncagem de Floats e casts indesejados!
  union {
    float f;
    uint32_t u;
  } raw;
  raw.f = value;

  if (formato == 2) { // int16
    int16_t short_val = (int16_t)value;
    tx_msg.data_length_code = 2;
    tx_msg.data[0] = (uint8_t)(short_val >> 8);
    tx_msg.data[1] = (uint8_t)(short_val & 0xFF);
  } else if (formato == 4) { // int32 (Número de Série)
    uint32_t long_val = (uint32_t)value;
    tx_msg.data_length_code = 4;
    tx_msg.data[0] = (uint8_t)(long_val >> 24);
    tx_msg.data[1] = (uint8_t)(long_val >> 16);
    tx_msg.data[2] = (uint8_t)(long_val >> 8);
    tx_msg.data[3] = (uint8_t)(long_val & 0xFF);
  } else if (formato == 5) { // float32 (Ganhos de Calibração)
    tx_msg.data_length_code = 4;
    tx_msg.data[0] = (uint8_t)(raw.u >> 24);
    tx_msg.data[1] = (uint8_t)(raw.u >> 16);
    tx_msg.data[2] = (uint8_t)(raw.u >> 8);
    tx_msg.data[3] = (uint8_t)(raw.u & 0xFF);
  } else {
    return false;
  }

  if (twai_transmit(&tx_msg, pdMS_TO_TICKS(10)) == ESP_OK) {
    if (g_ihm_state.flags.debug_print_can) {
      printf("[Req_Write] Reg: %3u | Fmt: %u | Val: %.2f | Dados(Hex): ",
             reg_number, formato, value);
      for (int i = 0; i < tx_msg.data_length_code; i++) {
        printf("%02X ", tx_msg.data[i]);
      }
      printf("\n");
    }
    return true;
  }
  return false;
}
