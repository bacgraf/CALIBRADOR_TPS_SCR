#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include "esp_err.h"

// Configuração de rede (Estático conforme requested)
#define WIFI_SSID      "PLC"
#define WIFI_PASS      "12345678"
#define STATIC_IP      "192.168.137.119"
#define STATIC_GW      "192.168.137.1"
#define STATIC_NETMASK "255.255.255.0"

/**
 * @brief Inicializa o Wi-Fi no modo AP+STA
 */
esp_err_t wifi_manager_init(void);

#endif // WIFI_MANAGER_H
