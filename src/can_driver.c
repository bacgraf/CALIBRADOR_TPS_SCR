#include "can_driver.h"
#include "esp_log.h"

static const char *TAG = "CAN_DRIVER";

bool can_driver_init(void) {
    // Configura os pinos TX e RX. Usaremos o modo NORMAL para enviar mensagens ativas 
    // e prover o ACK exigido pela UGE SR125.
    twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
    g_config.tx_queue_len = 10; // Espaço para 10 pacotes TX
    g_config.rx_queue_len = 20; // Espaço para 20 pacotes RX simultâneos

    // Velocidade do barramento: 62.5 kbps (baseado no manual da UGE)
    // Calculado para o clock base de 80MHz do controlador do ESP32
    twai_timing_config_t t_config = {
        .brp = 80,
        .tseg_1 = 10,
        .tseg_2 = 5,
        .sjw = 3,
        .triple_sampling = false
    };

    // Nenhum filtro - vamos capturar todo o tráfego da rede para a IHM
    twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

    // Instala o driver TWAI
    if (twai_driver_install(&g_config, &t_config, &f_config) != ESP_OK) {
        ESP_LOGE(TAG, "Falha ao instalar o driver TWAI.");
        return false;
    }
    ESP_LOGI(TAG, "Driver TWAI instalado com sucesso.");

    // Inicia o driver TWAI
    if (twai_start() != ESP_OK) {
        ESP_LOGE(TAG, "Falha ao iniciar o driver TWAI.");
        return false;
    }
    ESP_LOGI(TAG, "Driver TWAI iniciado e barramento acoplado.");

    return true;
}

bool can_driver_check_and_recover(uint32_t now_ms, bool uge_link_ok) {
    static uint32_t last_rx_overrun = 0;
    static uint32_t last_offline_reset_ms = 0;
    static uint32_t recovery_started_ms = 0;

    twai_status_info_t status;
    if (twai_get_status_info(&status) != ESP_OK) {
        return false;
    }

    if (status.state == TWAI_STATE_BUS_OFF) {
        ESP_LOGW(TAG, "TWAI em BUS_OFF (TEC=%lu, REC=%lu, BusErr=%lu). Iniciando recovery...",
                 (unsigned long)status.tx_error_counter,
                 (unsigned long)status.rx_error_counter,
                 (unsigned long)status.bus_error_count);
        twai_initiate_recovery();
        recovery_started_ms = now_ms;
        return false;
    }

    if (status.state == TWAI_STATE_RECOVERING) {
        if ((uint32_t)(now_ms - recovery_started_ms) >= 3000) {
            ESP_LOGW(TAG, "TWAI aguardando conclusao de recovery...");
            recovery_started_ms = now_ms;
        }
        return false;
    }

    if (status.state == TWAI_STATE_STOPPED) {
        ESP_LOGI(TAG, "TWAI em STOPPED. Limpando filas e reiniciando controlador...");
        twai_clear_transmit_queue();
        twai_clear_receive_queue();
        if (twai_start() == ESP_OK) {
            last_rx_overrun = 0;
            last_offline_reset_ms = now_ms;
            ESP_LOGI(TAG, "TWAI reiniciado com sucesso (RUNNING).");
            return true;
        }
        return false;
    }

    // TWAI_STATE_RUNNING: verifica RX FIFO overrun
    if (status.rx_overrun_count != last_rx_overrun) {
        ESP_LOGW(TAG, "TWAI RX Overrun detectado (%lu). Limpando fila RX...",
                 (unsigned long)status.rx_overrun_count);
        last_rx_overrun = status.rx_overrun_count;
        twai_clear_receive_queue();
    }

    if (!uge_link_ok) {
        // Evita acumular requisições antigas na fila enquanto a UGE está desligada, em boot ou em gravação JTAG
        if (status.msgs_to_tx > 1) {
            twai_clear_transmit_queue();
        }
        // Se estiver sem link e o controlador entrou em Error Passive (TEC/REC >= 128),
        // recicla o driver periodicamente para abortar frame travado no buffer TX de hardware.
        if ((status.tx_error_counter >= 128 || status.rx_error_counter >= 128) &&
            (uint32_t)(now_ms - last_offline_reset_ms) >= 3000) {
            ESP_LOGW(TAG, "TWAI sem link e em Error Passive (TEC=%lu, REC=%lu). Reciclando controlador...",
                     (unsigned long)status.tx_error_counter,
                     (unsigned long)status.rx_error_counter);
            last_offline_reset_ms = now_ms;
            if (twai_stop() == ESP_OK) {
                twai_clear_transmit_queue();
                twai_clear_receive_queue();
                twai_start();
            }
        }
    } else {
        last_offline_reset_ms = now_ms;
    }

    return true;
}
