#ifndef CAN_DRIVER_H
#define CAN_DRIVER_H

#include "driver/twai.h"
#include <stdbool.h>
#include <stdint.h>

// Pinos nativos do hardware definidos para o devkit.
#define CAN_TX_PIN 26
#define CAN_RX_PIN 27

/**
 * @brief Inicializa o controlador TWAI (CAN do ESP32).
 * Configura pinos, baud rate para 62.5 kbps e instala/inicia o driver no modo
 * Normal.
 * @return true se sucesso, false se alguma configuração falhar.
 */
bool can_driver_init(void);

/**
 * @brief Supervisiona o estado do controlador TWAI e executa auto-recuperação
 * caso entre em BUS_OFF, STOPPED, RX overrun ou saturação de fila TX sem link.
 * @param now_ms Timestamp atual do sistema em milissegundos.
 * @param uge_link_ok Indica se o link lógico com a UGE está ativo.
 * @return true se o controlador está em TWAI_STATE_RUNNING e pronto para transmitir.
 */
bool can_driver_check_and_recover(uint32_t now_ms, bool uge_link_ok);

#endif // CAN_DRIVER_H
