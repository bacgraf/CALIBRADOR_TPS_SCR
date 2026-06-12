#ifndef CAN_DRIVER_H
#define CAN_DRIVER_H

#include "driver/twai.h"
#include <stdbool.h>

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

#endif // CAN_DRIVER_H
