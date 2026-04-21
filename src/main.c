#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include <stdio.h>

#include "can_driver.h"
#include "can_protocol.h"
#include "ihm_state.h"
#include "nvs_flash.h"
#include "uge_datamap.h"
#include "web_server.h"
#include "wifi_manager.h"

#define STATUS_LED_GPIO GPIO_NUM_2

static const char *TAG = "IHM_TPS125_MAIN";

/**
 * @brief Tarefa dedicada à recepção contínua de mensagens CAN
 */
void can_receive_task(void *pvParameter) {
  twai_message_t rx_msg;
  while (1) {
    if (twai_receive(&rx_msg, portMAX_DELAY) == ESP_OK) {
      can_protocol_print_msg(&rx_msg);
    }
  }
}

/**
 * @brief Tarefa de Telemetria Ativa (Envio de Comandos)
 */
void telemetry_task(void *pvParameter) {
  uint8_t step = 0;
  static int test_step = 0;   
  static int test_cycle = 0; 
  static int test_ticks = 0;
  static uint16_t led_ticks = 0; // Contador para blink do LED de status

  while (1) {
    if (!g_ihm_state.flags.enable_telemetry) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }

    // --- CONTROLE DE TESTE AUTOMÁTICO DE RELÉS ---
    if (g_ihm_state.flags.relay_test_active) {
        test_ticks++;
        if (test_ticks >= 8) { 
            test_ticks = 0;
            if (test_step < 12) {
                uint16_t next_val = (test_step % 2 == 0) ? (1 << (test_step / 2)) : 0;
                can_protocol_transmit_req_write(REG_TESTE_DOUT_PRI, 2, next_val);
                g_ihm_state.teste_dout_pri = next_val; 
                test_step++;
            } else {
                test_step = 0;
                test_cycle++;
                if (test_cycle >= 3) {
                    g_ihm_state.flags.relay_test_active = false;
                    test_cycle = 0;
                }
            }
        }
        step = 0; 
    } else {
        test_step = 0; test_cycle = 0; test_ticks = 0;
    }

    // --- PASSOS SEQUENCIAIS DE TELEMETRIA ---
    switch (step) {
        case 0: can_protocol_transmit_req_read(REG_VRET1_AVG, 2, 4); break;    // 104-107
        case 1: can_protocol_transmit_req_read(REG_IRET2_AVG, 2, 4); break;    // 108-111
        case 2: can_protocol_transmit_req_read(REG_VCA_ST_RMS, 2, 4); break;   // 112-115
        case 3: can_protocol_transmit_req_read(REG_ICA_T_RMS, 2, 2); break;    // 116-117
        case 4: can_protocol_transmit_req_read(REG_VCA_T_RMS, 4, 1); break;    // 118 (f32)
        case 5: can_protocol_transmit_req_read(REG_ICA_S_RMS, 4, 1); break;    // 149 (f32) - Check Map
        
        case 6: can_protocol_transmit_req_read(REG_VRET1_GANHO, 2, 4); break;  // 132-135
        case 7: can_protocol_transmit_req_read(REG_VCONS_GANHO, 2, 4); break;  // 136-139
        case 8: can_protocol_transmit_req_read(REG_IRET2_GANHO, 2, 4); break;  // 140-143
        case 9: can_protocol_transmit_req_read(REG_VCA_RS_GANHO, 2, 4); break; // 144-147
        case 10: can_protocol_transmit_req_read(REG_VCA_T_GANHO, 2, 2); break; // 148-149
        
        case 11: can_protocol_transmit_req_read(REG_SN_CPU, 4, 2); break;      // 128-129 (i32)
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

    step++;
    if (step > 18) {
        step = 0;
        
        // --- LOG DE MONITORAMENTO VIA SERIAL (Só imprime se Telemetria estiver ON) ---
        if (g_ihm_state.flags.enable_telemetry) {
            ESP_LOGI(TAG, "\n------ MONITORAMENTO TPS125 ------"
                     "\nVcc: Vret=%.2fV | Vcons=%.2fV | Ibat=%.2fA"
                     "\nCA : VcaRS=%.1fV | IcaR=%.2fA | Freq=%.1fHz"
                     "\nBat: Temp=%.1f C | DIN: 0x%02X"
                     "\n----------------------------------",
                     g_ihm_state.vret1_avg, g_ihm_state.vcons_avg, g_ihm_state.ibat_avg,
                     g_ihm_state.vca_rs_rms, g_ihm_state.ica_r_rms, g_ihm_state.fca_meas,
                     g_ihm_state.temp_bat_meas, g_ihm_state.teste_din);
        }

        web_server_send_update();

        // --- WATCHDOG DO LINK CAN (UGE) ---
        // Se não chegar nenhuma resposta da UGE por mais de 3 segundos, marca OFF
        uint32_t now_ms = pdTICKS_TO_MS(xTaskGetTickCount());
        if (g_last_can_msg_ms > 0 && (now_ms - g_last_can_msg_ms) > 500) {
            g_ihm_state.flags.uge_link_ok = false;
        } else if (g_last_can_msg_ms > 0) {
            g_ihm_state.flags.uge_link_ok = true;
        }

        // --- CONTROLE DO LED DE STATUS (GPIO 2) ---
        // Conectado: LED aceso fixo
        // Sem cliente: pisca lento (~1s on / 1s off, ciclo de 40 ticks x 25ms)
        led_ticks++;
        if (g_ihm_state.flags.ws_client_connected) {
            gpio_set_level(STATUS_LED_GPIO, 1); // Aceso fixo
            led_ticks = 0;
        } else {
            // 40 ticks * 25ms = 1000ms por half-cycle
            gpio_set_level(STATUS_LED_GPIO, (led_ticks < 40) ? 1 : 0);
            if (led_ticks >= 80) led_ticks = 0;
        }
    }
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

  wifi_manager_init();
  web_server_start();

  if (!can_driver_init()) {
    while (1) vTaskDelay(pdMS_TO_TICKS(1000));
  }

  xTaskCreatePinnedToCore(can_receive_task, "can_rx_task", 4096, NULL, 5, NULL, 1);
  xTaskCreatePinnedToCore(telemetry_task, "telemetry_task", 4096, NULL, 4, NULL, 1);

  while (1) vTaskDelay(pdMS_TO_TICKS(10000));
}