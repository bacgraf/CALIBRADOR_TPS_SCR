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
