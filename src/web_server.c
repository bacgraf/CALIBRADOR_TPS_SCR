#include "web_server.h"
#include "cJSON.h"
#include "can_protocol.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_spiffs.h"
#include "esp_wifi.h"
#include "ihm_state.h"
#include "device_operations.h"
#include <math.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static const char *TAG = "WEB_SERVER";
static httpd_handle_t server = NULL;

/* --------------------------------------------------------------------------
 *  HELPERS
 * -------------------------------------------------------------------------- */

static esp_err_t spiffs_init(void) {
  ESP_LOGI(TAG, "Montando partição SPIFFS (HD Virtual)...");
  esp_vfs_spiffs_conf_t conf = {.base_path = "/spiffs",
                                .partition_label = "storage",
                                .max_files = 10,
                                .format_if_mount_failed = true};

  esp_err_t ret = esp_vfs_spiffs_register(&conf);
  if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Falha na montagem (%s)", esp_err_to_name(ret));
    return ret;
  }
  return ESP_OK;
}

/* --------------------------------------------------------------------------
 *  HANDLERS (HTTP e WebSocket)
 * -------------------------------------------------------------------------- */

// Handler Genérico para arquivos do SPIFFS
static esp_err_t common_get_handler(httpd_req_t *req) {
  char filepath[600];
  const char *uri = req->uri;

  // Rota padrão para root
  if (strcmp(uri, "/") == 0)
    uri = "/index.html";

  snprintf(filepath, sizeof(filepath), "/spiffs%s", uri);

  // Define Content-Type simples
  if (strstr(uri, ".html"))
    httpd_resp_set_type(req, "text/html");
  else if (strstr(uri, ".css"))
    httpd_resp_set_type(req, "text/css");
  else if (strstr(uri, ".js"))
    httpd_resp_set_type(req, "application/javascript");
  else if (strstr(uri, ".png"))
    httpd_resp_set_type(req, "image/png");
  else if (strstr(uri, ".csv"))
    httpd_resp_set_type(req, "text/csv");
  else if (strstr(uri, ".json"))
    httpd_resp_set_type(req, "application/json");
  else if (strstr(uri, ".bat")) {
    httpd_resp_set_type(req, "application/octet-stream");
    httpd_resp_set_hdr(req, "Content-Disposition", "attachment; filename=\"instalar_bridge.bat\"");
  }

  FILE *f = fopen(filepath, "r");
  if (f == NULL) {
    ESP_LOGW(TAG, "Arquivo não encontrado: %s", filepath);
    httpd_resp_send_404(req);
    return ESP_FAIL;
  }

  char chunk[512];
  size_t read_bytes;
  do {
    read_bytes = fread(chunk, 1, sizeof(chunk), f);
    if (read_bytes > 0) {
      httpd_resp_send_chunk(req, chunk, read_bytes);
    }
  } while (read_bytes > 0);

  fclose(f);
  httpd_resp_send_chunk(req, NULL, 0);
  return ESP_OK;
}

static void command_reply(httpd_req_t *req, cJSON *command, bool success, const char *message) {
  cJSON *reply = cJSON_CreateObject();
  if (!reply) return;
  cJSON_AddStringToObject(reply, "type", "command_result");
  cJSON *id = cJSON_GetObjectItem(command, "request_id");
  cJSON *name = cJSON_GetObjectItem(command, "command");
  if (cJSON_IsString(id)) cJSON_AddStringToObject(reply, "request_id", id->valuestring);
  if (cJSON_IsString(name)) cJSON_AddStringToObject(reply, "command", name->valuestring);
  cJSON_AddBoolToObject(reply, "success", success);
  cJSON_AddStringToObject(reply, "message", message);
  char *json = cJSON_PrintUnformatted(reply);
  if (json) {
    httpd_ws_frame_t frame = {.type = HTTPD_WS_TYPE_TEXT, .payload = (uint8_t *)json, .len = strlen(json)};
    httpd_ws_send_frame(req, &frame);
    free(json);
  }
  cJSON_Delete(reply);
}

static esp_err_t ws_handler(httpd_req_t *req) {
  if (req->method == HTTP_GET) {
    ESP_LOGI(TAG, "Conexão WebSocket aceita (FD: %d).",
             httpd_req_to_sockfd(req));
    g_ihm_state.flags.ws_client_connected = true;
    return ESP_OK;
  }

  httpd_ws_frame_t ws_pkt;
  uint8_t *buf = NULL;
  memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));

  // 1. Primeira chamada para descobrir o tamanho do frame
  esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
  if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Falha ao ler frame WS (tamanho)");
    return ret;
  }

  // Se o frame tiver dados (Comando vindo do Navegador)
  if (ws_pkt.len > 4096) return ESP_ERR_INVALID_SIZE;
  if (ws_pkt.len > 0) {
    buf = calloc(1, ws_pkt.len + 1);
    if (buf == NULL)
      return ESP_ERR_NO_MEM;

    ws_pkt.payload = buf;
    ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
    if (ret != ESP_OK) {
      free(buf);
      return ret;
    }

    // Processa comandos JSON de Debug e Escrita CAN
    if (ws_pkt.type == HTTPD_WS_TYPE_TEXT) {
      cJSON *root = cJSON_Parse((const char *)buf);
      if (root) {
        cJSON *cmd = cJSON_GetObjectItem(root, "command");
        if (cJSON_IsString(cmd)) {
          // COMANDO TIPO 1: Alternar Flags de Debug
          if (strcmp(cmd->valuestring, "set_flag") == 0) {
            cJSON *flag = cJSON_GetObjectItem(root, "name");
            if (!flag)
              flag = cJSON_GetObjectItem(root, "flag");
            cJSON *val = cJSON_GetObjectItem(root, "value");

            if (cJSON_IsString(flag) && cJSON_IsNumber(val)) {
              bool b = (val->valueint > 0);
              if (strcmp(flag->valuestring, "ignore_adv") == 0)
                g_ihm_state.flags.ignore_advertise = b;
              else if (strcmp(flag->valuestring, "debug_can") == 0)
                g_ihm_state.flags.debug_print_can = b;
              else if (strcmp(flag->valuestring, "can_debug") == 0)
                g_ihm_state.flags.debug_print_can = b;
              else if (strcmp(flag->valuestring, "telemetry") == 0)
                g_ihm_state.flags.enable_telemetry = b;
              ESP_LOGI(TAG, "### Flag Alterada: %s = %s ###", flag->valuestring,
                       b ? "ON" : "OFF");
            }
          }
          // 2. ESCRITA CAN MANUAL
          else if (strcmp(cmd->valuestring, "write_reg") == 0) {
            cJSON *reg = cJSON_GetObjectItem(root, "reg");
            cJSON *fmt = cJSON_GetObjectItem(root, "format");
            cJSON *val = cJSON_GetObjectItem(root, "value");
            bool valid = cJSON_IsNumber(reg) && cJSON_IsNumber(fmt) && cJSON_IsNumber(val) &&
                         isfinite(reg->valuedouble) && reg->valuedouble >= 0 && reg->valuedouble <= 1023 &&
                         trunc(reg->valuedouble) == reg->valuedouble &&
                         (fmt->valuedouble == 2 || fmt->valuedouble == 4 || fmt->valuedouble == 5);
            // Escritas manuais não podem disputar os registradores de uma operação.
            bool ok = valid && device_operations_manual_write(reg->valueint, fmt->valueint, val->valuedouble);
            command_reply(req, root, ok, ok ? "Comando enviado ao CAN; aplicação não confirmada." :
                                            "Escrita inválida, operação em andamento ou falha de envio.");

          }
          // 2B. LEITURA CAN SOB DEMANDA (para conferência de PIT / diagnóstico de registradores)
          else if (strcmp(cmd->valuestring, "read_reg") == 0) {
            cJSON *reg = cJSON_GetObjectItem(root, "reg");
            cJSON *fmt = cJSON_GetObjectItem(root, "format");
            cJSON *qtd_item = cJSON_GetObjectItem(root, "qtd");
            int qtd = (cJSON_IsNumber(qtd_item) && isfinite(qtd_item->valuedouble)) ? qtd_item->valueint : 1;
            int fmt_val = (cJSON_IsNumber(fmt) && isfinite(fmt->valuedouble)) ? fmt->valueint : -1;
            int max_qtd = (fmt_val == 4) ? 2 : 4;
            bool valid = cJSON_IsNumber(reg) && isfinite(reg->valuedouble) &&
                         reg->valuedouble >= 0 && reg->valuedouble <= 1023 &&
                         trunc(reg->valuedouble) == reg->valuedouble &&
                         (fmt_val == 2 || fmt_val == 4) &&
                         qtd >= 1 && qtd <= max_qtd;
            uint32_t vals[4] = {0};
            bool ok = valid && g_ihm_state.flags.uge_link_ok &&
                      device_operations_read_reg((uint16_t)reg->valueint, (uint8_t)fmt_val, (uint8_t)qtd, vals, 350);
            cJSON *reply = cJSON_CreateObject();
            if (reply) {
              cJSON_AddStringToObject(reply, "type", "command_result");
              cJSON *id = cJSON_GetObjectItem(root, "request_id");
              if (cJSON_IsString(id)) cJSON_AddStringToObject(reply, "request_id", id->valuestring);
              cJSON_AddStringToObject(reply, "command", "read_reg");
              cJSON_AddBoolToObject(reply, "success", ok);
              cJSON_AddNumberToObject(reply, "reg", valid ? reg->valueint : -1);
              cJSON_AddNumberToObject(reply, "format", fmt_val);
              cJSON *arr = cJSON_AddArrayToObject(reply, "values");
              if (ok && arr) {
                for (int i = 0; i < qtd; i++) {
                  if (fmt_val == 2)
                    cJSON_AddItemToArray(arr, cJSON_CreateNumber((double)(int32_t)vals[i]));
                  else
                    cJSON_AddItemToArray(arr, cJSON_CreateNumber((double)vals[i]));
                }
              }
              cJSON_AddStringToObject(reply, "message", ok ? "Leitura CAN concluída." :
                                                             "Falha ou timeout na leitura CAN do registrador.");
              char *json = cJSON_PrintUnformatted(reply);
              if (json) {
                httpd_ws_frame_t frame = {.type = HTTPD_WS_TYPE_TEXT, .payload = (uint8_t *)json, .len = strlen(json)};
                httpd_ws_send_frame(req, &frame);
                free(json);
              }
              cJSON_Delete(reply);
            }
          }
          // 3. PERSISTÊNCIA NA CPU (FLASH)
          else if (strcmp(cmd->valuestring, "write_cpu") == 0) {
            // ihm_state_save_to_nvs();
            ESP_LOGI(TAG, "Comando: Gravar Configurações na FLASH (NVS)");
          }
          // 4. INICIAR TESTE AUTOMÁTICO
          else if (strcmp(cmd->valuestring, "start_test") == 0) {
            bool ok = g_ihm_state.flags.uge_link_ok && relay_start();
            command_reply(req, root, ok, ok ? "Teste iniciado." : "Sem link CAN ou operação em andamento.");
          }
          else if (strcmp(cmd->valuestring, "cancel_test") == 0) {
            relay_cancel();
            command_reply(req, root, true, "Desligamento das saídas solicitado.");
          }
          else if (strcmp(cmd->valuestring, "sync_serial") == 0) {
            cJSON *value = cJSON_GetObjectItem(root, "value");
            cJSON *id = cJSON_GetObjectItem(root, "request_id");
            bool valid = cJSON_IsNumber(value) && isfinite(value->valuedouble) &&
                         value->valuedouble >= 0 && value->valuedouble <= UINT32_MAX &&
                         trunc(value->valuedouble) == value->valuedouble &&
                         cJSON_IsString(id) && strlen(id->valuestring) > 0 && strlen(id->valuestring) <= 64;
            bool ok = valid && g_ihm_state.flags.uge_link_ok && serial_start((uint32_t)value->valuedouble, id->valuestring);
            command_reply(req, root, ok, ok ? "Aguardando confirmação dos dois registradores." :
                                            "Número inválido, sem link CAN ou operação em andamento.");
          }
          // 5. CONFIGURAÇÃO DE WIFI/REDE
          else if (strcmp(cmd->valuestring, "save_wifi") == 0) {
            cJSON *ssid = cJSON_GetObjectItem(root, "ssid");
            cJSON *pass = cJSON_GetObjectItem(root, "pass");
            cJSON *ip = cJSON_GetObjectItem(root, "ip");
            cJSON *gw = cJSON_GetObjectItem(root, "gw");
            cJSON *mask = cJSON_GetObjectItem(root, "mask");
            cJSON *dhcp = cJSON_GetObjectItem(root, "dhcp");

            bool valid = cJSON_IsString(ssid) && cJSON_IsString(pass) && cJSON_IsString(ip) &&
                         cJSON_IsString(gw) && cJSON_IsString(mask) && cJSON_IsBool(dhcp);
            ihm_settings_t candidate = {0};
            if (valid) {
              valid = strlen(ssid->valuestring) <= 32 && strlen(pass->valuestring) <= 64 &&
                      strlen(ip->valuestring) < 16 && strlen(gw->valuestring) < 16 && strlen(mask->valuestring) < 16;
            }
            if (valid) {
              strcpy(candidate.wifi_ssid, ssid->valuestring);
              strcpy(candidate.wifi_pass, pass->valuestring);
              strcpy(candidate.static_ip, ip->valuestring);
              strcpy(candidate.static_gw, gw->valuestring);
              strcpy(candidate.static_mask, mask->valuestring);
              candidate.dhcp_enabled = cJSON_IsTrue(dhcp);
              candidate.ap_enabled = 1;
              valid = ihm_settings_valid(&candidate);
            }
            esp_err_t err = valid ? ihm_state_save_to_nvs(&candidate) : ESP_ERR_INVALID_ARG;
            command_reply(req, root, err == ESP_OK, err == ESP_OK ?
                          "Configurações salvas. Reinicie o ESP32 para aplicar." :
                          (valid ? "Falha ao persistir configuração no NVS." :
                                   "Configuração inválida: confira tipos, senha, IP, máscara e gateway."));

          }
          // 6. ESCANEAMENTO DE REDES
          else if (strcmp(cmd->valuestring, "scan_wifi") == 0) {
            ESP_LOGI(TAG, "Iniciando Scan de Redes WiFi...");
            
            // Força a desconexão se estiver tentando conectar para liberar o rádio para o scan
            // esp_wifi_disconnect(); 
            
            wifi_scan_config_t scan_config = { 0 }; // Initialize all to 0/NULL
            esp_err_t err = esp_wifi_scan_start(&scan_config, true);
            
            if (err != ESP_OK) {
              ESP_LOGE(TAG, "Falha ao iniciar scan: %s", esp_err_to_name(err));
              // Envia erro para o front
              cJSON *res = cJSON_CreateObject();
              cJSON_AddStringToObject(res, "type", "scan_res");
              cJSON_AddStringToObject(res, "error", esp_err_to_name(err));
              cJSON_AddArrayToObject(res, "list");
              char *json_err = cJSON_PrintUnformatted(res);
              httpd_ws_frame_t ws_pkt = { .payload = (uint8_t*)json_err, .len = strlen(json_err), .type = HTTPD_WS_TYPE_TEXT };
              httpd_ws_send_frame(req, &ws_pkt);
              free(json_err);
              cJSON_Delete(res);
            } else {
              uint16_t ap_count = 0;
              esp_wifi_scan_get_ap_num(&ap_count);
              ESP_LOGI(TAG, "Scan concluído. Redes encontradas: %d", ap_count);
              
              if (ap_count > 20) ap_count = 20;
              wifi_ap_record_t *ap_records = (wifi_ap_record_t *)malloc(sizeof(wifi_ap_record_t) * 20);
              if (ap_records) {
                esp_wifi_scan_get_ap_records(&ap_count, ap_records);

                cJSON *res = cJSON_CreateObject();
                cJSON_AddStringToObject(res, "type", "scan_res");
                cJSON *list = cJSON_AddArrayToObject(res, "list");
                for (int i = 0; i < ap_count; i++) {
                  cJSON *item = cJSON_CreateObject();
                  cJSON_AddStringToObject(item, "ssid", (char*)ap_records[i].ssid);
                  cJSON_AddNumberToObject(item, "rssi", ap_records[i].rssi);
                  cJSON_AddItemToArray(list, item);
                }
                char *json_res = cJSON_PrintUnformatted(res);
                httpd_ws_frame_t ws_pkt = { .payload = (uint8_t*)json_res, .len = strlen(json_res), .type = HTTPD_WS_TYPE_TEXT };
                httpd_ws_send_frame(req, &ws_pkt);
                free(json_res);
                cJSON_Delete(res);
                free(ap_records);
              }
            }
          }
        }
        cJSON_Delete(root);
      }
    }
    free(buf);
  }
  return ESP_OK;
}

/* --------------------------------------------------------------------------
 *  PUBLIC METHODS
 * -------------------------------------------------------------------------- */

esp_err_t web_server_start(void) {
  spiffs_init();

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.lru_purge_enable = true;
  config.uri_match_fn = httpd_uri_match_wildcard;
  config.stack_size = 16384; // Dobro ou triplo do padrão para aguentar JSON + WiFi Scan

  ESP_LOGI(TAG, "Iniciando Servidor na porta %d...", config.server_port);
  if (httpd_start(&server, &config) == ESP_OK) {
    // 1. Endpoint Websocket (Prioridade máxima)
    httpd_uri_t ws_uri = {.uri = "/ws",
                          .method = HTTP_GET,
                          .handler = ws_handler,
                          .user_ctx = NULL,
                          .is_websocket = true};
    httpd_register_uri_handler(server, &ws_uri);

    // 2. Handler para arquivos (Curinga - Fica por último)
    httpd_uri_t file_uri = {.uri = "/*",
                            .method = HTTP_GET,
                            .handler = common_get_handler,
                            .user_ctx = NULL};
    httpd_register_uri_handler(server, &file_uri);

    return ESP_OK;
  }
  return ESP_FAIL;
}

static void send_update(void) {
  if (!server)
    return;

  // 1. Cria objeto cJSON com os dados atuais
  cJSON *root = cJSON_CreateObject();
  if (!root) return;

  serial_status_t serial;
  relay_status_t relay;
  device_operations_snapshot(&serial, &relay);
  cJSON *serial_json = cJSON_AddObjectToObject(root, "serial");
  cJSON_AddStringToObject(serial_json, "request_id", serial.request_id);
  cJSON_AddNumberToObject(serial_json, "value", serial.value);
  cJSON_AddBoolToObject(serial_json, "busy", serial.busy);
  cJSON_AddBoolToObject(serial_json, "cpu_ok", serial.cpu_ok);
  cJSON_AddBoolToObject(serial_json, "uge_ok", serial.uge_ok);
  cJSON_AddBoolToObject(serial_json, "success", serial.success);
  cJSON_AddStringToObject(serial_json, "message", serial.message);
  cJSON *relay_json = cJSON_AddObjectToObject(root, "relay");
  cJSON_AddBoolToObject(relay_json, "active", relay.active);
  cJSON_AddBoolToObject(relay_json, "stopping", relay.stopping);
  cJSON_AddBoolToObject(relay_json, "off_confirmed", relay.off_confirmed);
  cJSON_AddStringToObject(relay_json, "message", relay.message);

  // --- TELEMETRIA DE ALTA PRECISÃO (Dashboard Web) ---
  // AVISO: Não alterar estes multiplicadores. A precisão de 0.01 no dashboard
  // depende da transmissão em centi-unidades (*100) via barramento WebSocket.
  cJSON_AddNumberToObject(root, "vret", (int)(g_ihm_state.vret1_avg * 100));
  cJSON_AddNumberToObject(root, "vbat",
                          (int)(g_ihm_state.vbat1_avg * 100)); // Usando vbat1
  cJSON_AddNumberToObject(root, "vcons", (int)(g_ihm_state.vcons_avg * 100));
  cJSON_AddNumberToObject(root, "iret", (int)(g_ihm_state.iret1_avg * 100));
  cJSON_AddNumberToObject(root, "iret2", (int)(g_ihm_state.iret2_avg * 100));
  cJSON_AddNumberToObject(root, "ibat", (int)(g_ihm_state.ibat_avg * 100));

  // CA e Outros (x10 para 1 casa decimal)
  cJSON_AddNumberToObject(root, "tbat", (int)(g_ihm_state.temp_bat_meas * 10));
  cJSON_AddNumberToObject(root, "tret", (int)lroundf(g_ihm_state.tret_avg * 10));

  // CA (x10 e x100)
  cJSON_AddNumberToObject(root, "vrs", (int)(g_ihm_state.vca_rs_rms * 10));
  cJSON_AddNumberToObject(root, "vst", (int)(g_ihm_state.vca_st_rms * 10));
  cJSON_AddNumberToObject(root, "vt", (int)(g_ihm_state.vca_t_rms * 10));
  cJSON_AddNumberToObject(root, "ir", (int)(g_ihm_state.ica_r_rms * 100));
  cJSON_AddNumberToObject(root, "is", (int)(g_ihm_state.ica_s_rms * 100));
  cJSON_AddNumberToObject(root, "it", (int)(g_ihm_state.ica_t_rms * 100));

  // Identificação e Diagnóstico
  cJSON_AddNumberToObject(root, "sncc", (double)g_ihm_state.sn_cpu);

  uint64_t fw_raw = g_ihm_state.uge_fw_raw;
  if (fw_raw > 0) {
      uint16_t tffff = (uint16_t)(fw_raw >> 48);
      int fw_tipo = tffff / 10000;
      int fw_fam = tffff % 10000;

      int fw_vv = (int)((fw_raw >> 40) & 0xFF);
      int fw_ee = (int)((fw_raw >> 32) & 0xFF);
      
      uint16_t npppp = (uint16_t)((fw_raw >> 16) & 0xFFFF);
      int fw_n = npppp / 10000;
      int fw_proj = npppp % 10000;

      int fw_rr = (int)((fw_raw >> 8) & 0xFF);
      int fw_ss = (int)(fw_raw & 0xFF);

      const char* fw_tipo_str = "Desc";
      if (fw_tipo == 0) fw_tipo_str = "Cliente";
      else if (fw_tipo == 1) fw_tipo_str = "Burn-in";
      else if (fw_tipo == 2) fw_tipo_str = "F\xC3\xA1" "brica";
      else if (fw_tipo == 3) fw_tipo_str = "Jiga";
      else if (fw_tipo == 4) fw_tipo_str = "Desenv.";

      char fw_vers_str[64];
      if (fw_tipo == 0) {
          snprintf(fw_vers_str, sizeof(fw_vers_str), "%04d-%02d-%02d-%04d-%02d-%02d", 
                   fw_fam, fw_vv, fw_ee, fw_proj, fw_rr, fw_ss);
      } else {
          snprintf(fw_vers_str, sizeof(fw_vers_str), "%04d-%02d-%02d-%04d-%02d-%02d (%s: %d)", 
                   fw_fam, fw_vv, fw_ee, fw_proj, fw_rr, fw_ss, fw_tipo_str, fw_n);
      }

      cJSON_AddStringToObject(root, "uge_vers", fw_vers_str);
      cJSON_AddStringToObject(root, "uge_build", g_ihm_state.uge_fw_build[0] ? g_ihm_state.uge_fw_build : "---");
  }

  cJSON_AddNumberToObject(root, "snug", (double)g_ihm_state.sn_uge);
  cJSON_AddNumberToObject(root, "upt", (uint32_t)g_ihm_state.horas_set);
  cJSON_AddNumberToObject(root, "cyc", (uint16_t)g_ihm_state.ciclos_set);
  cJSON_AddNumberToObject(root, "din", (uint16_t)g_ihm_state.teste_din);
  cJSON_AddNumberToObject(root, "dout", (uint16_t)g_ihm_state.teste_dout_pri);
  cJSON_AddNumberToObject(root, "err_cod", (uint16_t)g_ihm_state.erro_cod);
  cJSON_AddNumberToObject(root, "err_ext", (uint16_t)g_ihm_state.erro_ext);
  cJSON_AddNumberToObject(root, "rca_t", (uint8_t)g_ihm_state.sca_type);
  cJSON_AddNumberToObject(root, "rca", (uint16_t)g_ihm_state.r_ca_set);

  // Flags de Sistema (para sincronização dos botões)
  cJSON_AddBoolToObject(root, "tele", g_ihm_state.flags.enable_telemetry);
  cJSON_AddBoolToObject(root, "can_d", g_ihm_state.flags.debug_print_can);
  cJSON_AddBoolToObject(root, "ign_a", g_ihm_state.flags.ignore_advertise);
  cJSON_AddBoolToObject(root, "uge_ok", g_ihm_state.flags.uge_link_ok);

  // Ganhos (x10000 para recuperar o valor inteiro bruto do registrador)
  cJSON_AddNumberToObject(root, "gv1", (int)(g_ihm_state.vret1_ganho * 10000));
  cJSON_AddNumberToObject(root, "ov1", (int)(g_ihm_state.vret1_offset * 100));
  cJSON_AddNumberToObject(root, "gv2", (int)(g_ihm_state.vret2_ganho * 10000));
  cJSON_AddNumberToObject(root, "ov2", (int)(g_ihm_state.vret2_offset * 100));
  cJSON_AddNumberToObject(root, "gvc", (int)(g_ihm_state.vcons_ganho * 10000));
  cJSON_AddNumberToObject(root, "ovc", (int)(g_ihm_state.vcons_offset * 100));
  cJSON_AddNumberToObject(root, "gi1", (int)(g_ihm_state.iret1_ganho * 10000));
  cJSON_AddNumberToObject(root, "oi1", (int)(g_ihm_state.iret1_offset * 100));
  cJSON_AddNumberToObject(root, "gi2", (int)(g_ihm_state.iret2_ganho * 10000));
  cJSON_AddNumberToObject(root, "oi2", (int)(g_ihm_state.iret2_offset * 100));
  cJSON_AddNumberToObject(root, "gib", (int)(g_ihm_state.ibat_ganho * 10000));
  cJSON_AddNumberToObject(root, "oib", (int)(g_ihm_state.ibat_offset * 100));

  // Ganhos CA (x10000)
  cJSON_AddNumberToObject(root, "gvrs",
                          (int)lroundf(g_ihm_state.vca_rs_ganho * 10000));
  cJSON_AddNumberToObject(root, "gvst",
                          (int)lroundf(g_ihm_state.vca_st_ganho * 10000));
  cJSON_AddNumberToObject(root, "gvt", (int)lroundf(g_ihm_state.vca_t_ganho * 10000));
  cJSON_AddNumberToObject(root, "gir", (int)lroundf(g_ihm_state.ica_r_ganho * 10000));
  cJSON_AddNumberToObject(root, "gis", (int)lroundf(g_ihm_state.ica_s_ganho * 10000));
  cJSON_AddNumberToObject(root, "git", (int)lroundf(g_ihm_state.ica_t_ganho * 10000));
 
  // Configurações e Status de Rede
  cJSON *net = cJSON_AddObjectToObject(root, "net");
  cJSON_AddStringToObject(net, "ssid", g_ihm_state.settings.wifi_ssid);
  cJSON_AddStringToObject(net, "ip_s", g_ihm_state.settings.static_ip);
  cJSON_AddStringToObject(net, "gw", g_ihm_state.settings.static_gw);
  cJSON_AddStringToObject(net, "mask", g_ihm_state.settings.static_mask);
  cJSON_AddBoolToObject(net, "dhcp", g_ihm_state.settings.dhcp_enabled > 0);

  // IPs ATUAIS (Dinâmico)
  esp_netif_ip_info_t ip_sta, ip_ap;
  esp_netif_t *netif_sta = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
  esp_netif_t *netif_ap = esp_netif_get_handle_from_ifkey("WIFI_AP_DEF");
  
  char ip_str[16];
  if (netif_sta && esp_netif_get_ip_info(netif_sta, &ip_sta) == ESP_OK) {
      esp_ip4addr_ntoa(&ip_sta.ip, ip_str, 16);
      cJSON_AddStringToObject(net, "cur_sta", ip_str);
  } else {
      cJSON_AddStringToObject(net, "cur_sta", "0.0.0.0");
  }

  if (netif_ap && esp_netif_get_ip_info(netif_ap, &ip_ap) == ESP_OK) {
      esp_ip4addr_ntoa(&ip_ap.ip, ip_str, 16);
      cJSON_AddStringToObject(net, "cur_ap", ip_str);
  } else {
      cJSON_AddStringToObject(net, "cur_ap", "192.168.4.1");
  }

  // 2. Renderiza para string JSON mínima
  char *json_str = cJSON_PrintUnformatted(root);
  if (json_str) {
    httpd_ws_frame_t ws_pkt;
    memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));
    ws_pkt.payload = (uint8_t *)json_str;
    ws_pkt.len = strlen(json_str);
    ws_pkt.type = HTTPD_WS_TYPE_TEXT; // MUDANÇA PARA TEXTO

    // Broadcast — conta clientes ativos para atualizar flag de LED
    size_t max_clients = 10;
    int fds[10];
    int ws_count = 0;
    if (httpd_get_client_list(server, &max_clients, fds) != ESP_OK) max_clients = 0;
    for (size_t i = 0; i < max_clients; i++) {
      if (httpd_ws_get_fd_info(server, fds[i]) == HTTPD_WS_CLIENT_WEBSOCKET) {
        if (httpd_ws_send_frame_async(server, fds[i], &ws_pkt) == ESP_OK) {
          ws_count++;
        } else {
          httpd_sess_trigger_close(server, fds[i]);
        }
      }
    }
    // Atualiza flag de conectividade para o LED de status
    g_ihm_state.flags.ws_client_connected = (ws_count > 0);
    free(json_str);
  }
  cJSON_Delete(root);
}

static atomic_bool update_queued = false;
static void send_update_work(void *arg) {
  (void)arg;
  send_update();
  atomic_store(&update_queued, false);
}

void web_server_send_update(void) {
  if (!server || atomic_exchange(&update_queued, true)) return;
  // Serializa broadcast e respostas de comandos na própria tarefa HTTP.
  if (httpd_queue_work(server, send_update_work, NULL) != ESP_OK)
    atomic_store(&update_queued, false);
}
