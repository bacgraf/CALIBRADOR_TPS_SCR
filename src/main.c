#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include <stdio.h>

#include "can_driver.h"
#include "device_operations.h"
#include "can_protocol.h"
#include "ihm_state.h"
#include "nvs_flash.h"
#include "uge_datamap.h"
#include "web_server.h"
#include "wifi_manager.h"

#define STATUS_LED_GPIO GPIO_NUM_2



/**
 * @brief Tarefa dedicada à recepção contínua de mensagens CAN
 */
void can_receive_task(void *pvParameter) {
  twai_message_t rx_msg;
  while (1) {
    if (twai_receive(&rx_msg, pdMS_TO_TICKS(1000)) == ESP_OK) {
      can_protocol_print_msg(&rx_msg);
    }
  }
}

/**
 * @brief Tarefa de Telemetria Ativa (Envio de Comandos)
 */
void telemetry_task(void *pvParameter) {
  uint8_t step = 0;
  uint32_t published = 0;
  uint32_t last_probe_ms = 0;
  while (1) {
    uint32_t now_ms = pdTICKS_TO_MS(xTaskGetTickCount());
    uint32_t last_can = g_last_can_msg_ms;
    g_ihm_state.flags.uge_link_ok =
        last_can > 0 && (uint32_t)(now_ms - last_can) <= 3000;

    bool can_ready = can_driver_check_and_recover(now_ms, g_ihm_state.flags.uge_link_ok);

    device_operations_tick(now_ms);
    // Publicação e teste continuam mesmo com consultas periódicas desligadas.
    // Quando sem link com a UGE, reduz a frequência de sondagem (250ms) para não saturar a fila TX.
    bool should_poll = can_ready && g_ihm_state.flags.enable_telemetry &&
                       (g_ihm_state.flags.uge_link_ok || (uint32_t)(now_ms - last_probe_ms) >= 250);
    if (should_poll) {
      last_probe_ms = now_ms;
      switch (step) {
        case 0: can_protocol_transmit_req_read(REG_VRET1_AVG, 2, 4); break;    // 104-107
        case 1: can_protocol_transmit_req_read(REG_IRET2_AVG, 2, 4); break;    // 108-111
        case 2: can_protocol_transmit_req_read(REG_VCA_ST_RMS, 2, 4); break;   // 112-115
        case 3: can_protocol_transmit_req_read(REG_ICA_T_RMS, 2, 3); break;    // 116-118 (Ica_T_rms, Ica_T_avg, Tret_avg)
        case 4: can_protocol_transmit_req_read(REG_VCA_T_RMS, 2, 1); break;    // 430 (int16)
        case 5: can_protocol_transmit_req_read(REG_ICA_S_RMS, 2, 1); break;    // 432 (int16)
        
        case 6: can_protocol_transmit_req_read(REG_VRET1_GANHO, 2, 4); break;  // 132-135
        case 7: can_protocol_transmit_req_read(REG_VCONS_GANHO, 2, 4); break;  // 136-139
        case 8: can_protocol_transmit_req_read(REG_IRET2_GANHO, 2, 4); break;  // 140-143
        case 9: can_protocol_transmit_req_read(REG_VCA_RS_GANHO, 2, 4); break; // 144-147
        case 10: can_protocol_transmit_req_read(REG_VCA_T_GANHO, 2, 2); break; // 148-149
        
        case 11: if (!serial_busy()) can_protocol_transmit_req_read(REG_SN_CPU, 4, 2); break;      // 128-129 (i32)
        case 12: can_protocol_transmit_req_read(REG_HORAS_SET, 4, 1); break;   // 130 (i32)
        case 13: can_protocol_transmit_req_read(REG_CICLOS_SET, 2, 1); break;  // 131
        case 14: can_protocol_transmit_req_read(REG_TESTE_DIN, 2, 2); break;   // 416-417
        case 15: can_protocol_transmit_req_read(REG_TEMP_BAT, 2, 1); 
                 can_protocol_transmit_req_read(REG_SINT_VCA, 4, 1); break;    // 14 e 197
        case 16: can_protocol_transmit_req_read(1, 6, 1); break;               // REG_Vers_FW (int64)
        case 17: can_protocol_transmit_req_read(2, 7, 1); break;               // REG_Vers_Build (str8)
        case 18: can_protocol_transmit_req_read(75, 2, 2); break;              // 75 e 76 (Erro Cod e Erro Ext)
        default: break;
      }

      step = (step + 1) % 19;
    }
    last_can = g_last_can_msg_ms;
    uint32_t link_now = pdTICKS_TO_MS(xTaskGetTickCount());
    g_ihm_state.flags.uge_link_ok =
        last_can > 0 && (uint32_t)(link_now - last_can) <= 3000;
    // Uma perda de link durante o teste dispara tentativa de desligamento.
    if (!g_ihm_state.flags.uge_link_ok && relay_busy()) relay_cancel();
    if ((uint32_t)(now_ms - published) >= 500) {
      published = now_ms;
      web_server_send_update();
    }
    gpio_set_level(STATUS_LED_GPIO, g_ihm_state.flags.ws_client_connected || ((now_ms / 1000) % 2 == 0));
    vTaskDelay(pdMS_TO_TICKS(25));
  }
}

void app_main(void) {
  // Inicializar LED de Status (GPIO 2 — LED embutido do DevKit)
  gpio_config_t led_conf = {
      .pin_bit_mask = (1ULL << STATUS_LED_GPIO),
      .mode         = GPIO_MODE_OUTPUT,
      .pull_up_en   = GPIO_PULLUP_DISABLE,
      .pull_down_en = GPIO_PULLDOWN_DISABLE,
      .intr_type    = GPIO_INTR_DISABLE,
  };
  gpio_config(&led_conf);
  gpio_set_level(STATUS_LED_GPIO, 0); // Apagado na inicialização

  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ret = nvs_flash_init();
  }
  ESP_ERROR_CHECK(ret);
  
  // Carrega configurações persistidas antes de iniciar WiFi
  ihm_state_load_from_nvs();

  device_operations_init();
  wifi_manager_init();
  web_server_start();

  if (!can_driver_init()) {
    while (1) vTaskDelay(pdMS_TO_TICKS(1000));
  }

  xTaskCreatePinnedToCore(can_receive_task, "can_rx_task", 4096, NULL, 5, NULL, 1);
  xTaskCreatePinnedToCore(telemetry_task, "telemetry_task", 4096, NULL, 4, NULL, 1);

  while (1) vTaskDelay(pdMS_TO_TICKS(10000));
}
