#ifndef WEB_SERVER_H
#define WEB_SERVER_H

#include "esp_err.h"

/**
 * @brief Inicia o servidor HTTP e ativa o endpoint WebSocket.
 * Também faz a montagem da partição SPIFFS.
 */
esp_err_t web_server_start(void);

/**
 * @brief Envia um broadcast de dados via WebSocket para todos
 * os clientes conectados. Chamado quando a telemetria atualiza o estado.
 */
void web_server_send_update(void);

#endif // WEB_SERVER_H
