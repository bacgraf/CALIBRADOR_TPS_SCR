#include "wifi_manager.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "ihm_state.h"
#include <string.h>

static const char *TAG = "WIFI_MANAGER";

static void event_handler(void *arg, esp_event_base_t event_base,
                          int32_t event_id, void *event_data) {
  if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
    ESP_LOGI(TAG, "Wi-Fi STA Iniciado... conectando em '%s'", g_ihm_state.settings.wifi_ssid);
    esp_wifi_connect();
  } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
    ESP_LOGW(TAG, "STA Desconectado... tentando reconectar...");
    esp_wifi_connect();
  } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    ESP_LOGI(TAG, "STA Conectado! IP: " IPSTR, IP2STR(&event->ip_info.ip));
  }
}

esp_err_t wifi_manager_init(void) {
  // 1. Inicializa stack TCP
  esp_netif_init();
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  
  // Cria interfaces
  esp_netif_t *sta_netif = esp_netif_create_default_wifi_sta();
  esp_netif_create_default_wifi_ap();

  // 2. CONFIGURAÇÃO DE IP STA
  if (g_ihm_state.settings.dhcp_enabled) {
    ESP_LOGI(TAG, "STA: Usando IP Dinâmico (DHCP)");
    esp_netif_dhcpc_start(sta_netif);
  } else {
    ESP_LOGI(TAG, "STA: Usando IP Estático %s", g_ihm_state.settings.static_ip);
    esp_netif_dhcpc_stop(sta_netif);
    esp_netif_ip_info_t ip_info;
    esp_netif_str_to_ip4(g_ihm_state.settings.static_ip, &ip_info.ip);
    esp_netif_str_to_ip4(g_ihm_state.settings.static_gw, &ip_info.gw);
    esp_netif_str_to_ip4(g_ihm_state.settings.static_mask, &ip_info.netmask);
    esp_netif_set_ip_info(sta_netif, &ip_info);
  }

  // 3. Inicializa Radio Wi-Fi
  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));

  // 4. Registra Handlers
  ESP_ERROR_CHECK(esp_event_handler_instance_register(
      WIFI_EVENT, ESP_EVENT_ANY_ID, &event_handler, NULL, NULL));
  ESP_ERROR_CHECK(esp_event_handler_instance_register(
      IP_EVENT, IP_EVENT_STA_GOT_IP, &event_handler, NULL, NULL));

  // 5. Configuração STA
  wifi_config_t sta_config = {0};
  strncpy((char *)sta_config.sta.ssid, g_ihm_state.settings.wifi_ssid, 32);
  strncpy((char *)sta_config.sta.password, g_ihm_state.settings.wifi_pass, 64);

  // 6. Configuração AP
  wifi_config_t ap_config = {
      .ap = {
          .ssid = "CALIBRADOR_TPS_SCR",
          .ssid_len = strlen("CALIBRADOR_TPS_SCR"),
          .channel = 1,
          .password = "teksea123",
          .max_connection = 4,
          .authmode = WIFI_AUTH_WPA_WPA2_PSK
      },
  };
  if (strlen("teksea123") == 0) {
      ap_config.ap.authmode = WIFI_AUTH_OPEN;
  }

  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_config));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_config));
  ESP_ERROR_CHECK(esp_wifi_start());

  ESP_LOGI(TAG, "Wi-Fi Inicializado em modo AP+STA.");
  return ESP_OK;
}
