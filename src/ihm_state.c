#include "ihm_state.h"
#include "esp_log.h"
#include "uge_datamap.h"

// Define a instância global do estado da IHM e os valores iniciais da Flag
ihm_state_t g_ihm_state = {.flags = {.ignore_advertise = true,
                                     .debug_print_can = false,
                                     .enable_telemetry = true  },
                           .settings = {.wifi_ssid = "",
                                        .wifi_pass = "",
                                        .static_ip = "192.168.1.100",
                                        .static_gw = "192.168.1.1",
                                        .static_mask = "255.255.255.0",
                                        .dhcp_enabled = 1,
                                        .ap_enabled = 1},
                           .vret_meas = 0.0f};

// Responsável por receber o valor bruto da struct, escalar e armazenar em
// estado
void ihm_state_update_register(uint16_t reg, int32_t raw_value) {
  switch (reg) {
  // 5.2 - Medições CC (Todos x0.1)
  case REG_VRET:
    g_ihm_state.vret_meas = ((float)raw_value) * 0.1f;
    break;
  case REG_VBAT:
    g_ihm_state.vbat_meas = ((float)raw_value) * 0.1f;
    break;
  case REG_VCONS:
    g_ihm_state.vcons_meas = ((float)raw_value) * 0.1f;
    break;
  case REG_TEMP_BAT:
    g_ihm_state.temp_bat_meas = ((float)raw_value) * 0.1f;
    break;
  case REG_IRET:
    g_ihm_state.iret_meas = ((float)raw_value) * 0.1f;
    break;
  case REG_IBAT:
    g_ihm_state.ibat_meas = ((float)raw_value) * 0.1f;
    break;
  case REG_ICONS:
    g_ihm_state.icons_meas = ((float)raw_value) * 0.1f;
    break;

  // 5.3 - Medições CA
  case REG_VCA_RS:
    g_ihm_state.vca_rs_meas = ((float)raw_value) * 1.0f;
    break; // x1
  case REG_VCA_ST:
    g_ihm_state.vca_st_meas = ((float)raw_value) * 1.0f;
    break; // x1
  case REG_VCA_TR:
    g_ihm_state.vca_tr_meas = ((float)raw_value) * 1.0f;
    break; // x1
  case REG_VCA_FREQ:
    g_ihm_state.fca_meas = ((float)raw_value) * 0.1f;
    break; // x0.1
  case REG_ICA_R:
    g_ihm_state.ica_r_meas = ((float)raw_value) * 0.1f;
    break; // x0.1
  case REG_ICA_S:
    g_ihm_state.ica_s_meas = ((float)raw_value) * 0.1f;
    break; // x0.1
  case REG_ICA_T:
    g_ihm_state.ica_t_meas = ((float)raw_value) * 0.1f;
    break;

  // -------------------------------------------------------------------------
  // 5.7 - Diagnóstico Avançado (MODO JIGA)
  // ATENÇÃO: Escala CRÍTICA para calibração. NÃO ALTERAR SEM CONSULTAR DATAMAP.
  // -------------------------------------------------------------------------
  case REG_VRET1_AVG:
    g_ihm_state.vret1_avg = ((float)raw_value) * 0.01f; // ESCALA CENTI (x0.01)
    break;
  case REG_VBAT1_AVG:
    g_ihm_state.vbat1_avg = ((float)raw_value) * 0.01f; // ESCALA CENTI (x0.01)
    break;
    break;
  case REG_VCONS_AVG:
    g_ihm_state.vcons_avg = ((float)raw_value) * 0.01f; // ESCALA CENTI (x0.01)
    break;
  case REG_IRET1_AVG:
    g_ihm_state.iret1_avg = ((float)raw_value) * 0.01f; // ESCALA CENTI (x0.01)
    break;
  case REG_IRET2_AVG:
    g_ihm_state.iret2_avg = ((float)raw_value) * 0.01f; // ESCALA CENTI (x0.01)
    break;
  case REG_IBAT_AVG:
    g_ihm_state.ibat_avg = ((float)raw_value) * 0.01f; // ESCALA CENTI (x0.01)
    break;
  case REG_VCA_RS_RMS:
    g_ihm_state.vca_rs_rms = ((float)raw_value) * 0.1f;
    break;
  case REG_VCA_RS_AVG:
    g_ihm_state.vca_rs_avg_dc = ((float)raw_value) * 0.1f;
    break;
  case REG_VCA_ST_RMS:
    g_ihm_state.vca_st_rms = ((float)raw_value) * 0.1f;
    break;
  case REG_VCA_ST_AVG:
    g_ihm_state.vca_st_avg_dc = ((float)raw_value) * 0.1f;
    break;
  case REG_ICA_R_RMS:
    g_ihm_state.ica_r_rms = ((float)raw_value) * 0.01f;
    break;
  case REG_ICA_R_AVG:
    g_ihm_state.ica_r_avg_dc = ((float)raw_value) * 0.01f;
    break;
  case REG_ICA_T_RMS:
    g_ihm_state.ica_t_rms = ((float)raw_value) * 0.01f;
    break;
  case REG_ICA_T_AVG:
    g_ihm_state.ica_t_avg_dc = ((float)raw_value) * 0.01f;
    break;
  case REG_VCA_T_RMS:
    g_ihm_state.vca_t_rms = ((float)raw_value) * 0.1f;
    break;
  case REG_ICA_S_RMS:
    g_ihm_state.ica_s_rms = ((float)raw_value) * 0.01f;
    break;
  case REG_TRET_AVG:
    // Mapear para Temp do Retificador se necessário, por ora apenas break
    break;
  // 5.8 Parâmetros de Calibração
  case REG_SN_CPU:
    g_ihm_state.sn_cpu = (uint32_t)raw_value;
    break;
  case REG_SN_UGE:
    g_ihm_state.sn_uge = (uint32_t)raw_value;
    break;
  case REG_HORAS_SET:
    g_ihm_state.horas_set = (uint32_t)raw_value;
    break;
  case REG_CICLOS_SET:
    g_ihm_state.ciclos_set = (uint16_t)raw_value;
    break;

  case REG_VRET1_GANHO:
    g_ihm_state.vret1_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_VRET1_OFFSET:
    g_ihm_state.vret1_offset = ((float)raw_value) * 0.01f;
    break;
  case REG_VRET2_GANHO:
    g_ihm_state.vret2_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_VRET2_OFFSET:
    g_ihm_state.vret2_offset = ((float)raw_value) * 0.01f;
    break;
  case REG_VCONS_GANHO:
    g_ihm_state.vcons_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_VCONS_OFFSET:
    g_ihm_state.vcons_offset = ((float)raw_value) * 0.01f;
    break;
  case REG_IRET1_GANHO:
    g_ihm_state.iret1_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_IRET1_OFFSET:
    g_ihm_state.iret1_offset = ((float)raw_value) * 0.01f;
    break;
  case REG_IRET2_GANHO:
    g_ihm_state.iret2_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_IRET2_OFFSET:
    g_ihm_state.iret2_offset = ((float)raw_value) * 0.01f;
    break;
  case REG_IBAT_GANHO:
    g_ihm_state.ibat_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_IBAT_OFFSET:
    g_ihm_state.ibat_offset = ((float)raw_value) * 0.01f;
    break;

  case REG_VCA_RS_GANHO:
    g_ihm_state.vca_rs_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_VCA_ST_GANHO:
    g_ihm_state.vca_st_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_ICA_R_GANHO:
    g_ihm_state.ica_r_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_ICA_T_GANHO:
    g_ihm_state.ica_t_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_VCA_T_GANHO:
    g_ihm_state.vca_t_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_ICA_S_GANHO:
    g_ihm_state.ica_s_ganho = ((float)raw_value) * 0.0001f;
    break;
  case REG_SINT_VCA: // 197
    g_ihm_state.sca_type = (uint8_t)((raw_value >> 24) & 0xFF);
    g_ihm_state.r_ca_set = (uint16_t)(raw_value & 0xFFFF);
    break;

  // 5.16 Entradas e Saídas Digitais (Testes)
  case REG_TESTE_DIN:
    g_ihm_state.teste_din = (uint16_t)raw_value;
    break;
  case REG_TESTE_DOUT_PRI:
    g_ihm_state.teste_dout_pri = (uint16_t)raw_value;
    break;

  case 75: // REG_Erro_cod
    g_ihm_state.erro_cod = (uint16_t)raw_value;
    break;
  case 76: // REG_Erro_ext
    g_ihm_state.erro_ext = (uint16_t)raw_value;
    break;

  default:
    // Reg não implementado ainda
    break;
  }
}
#include "nvs.h"
#include "nvs_flash.h"

void ihm_state_save_to_nvs(void) {
  nvs_handle_t my_handle;
  esp_err_t err = nvs_open("storage", NVS_READWRITE, &my_handle);
  if (err == ESP_OK) {
    nvs_set_blob(my_handle, "settings", &g_ihm_state.settings,
                 sizeof(ihm_settings_t));
    nvs_commit(my_handle);
    nvs_close(my_handle);
    ESP_LOGI("IHM_STATE", "Configurações salvas no NVS");
  }
}

void ihm_state_load_from_nvs(void) {
  nvs_handle_t my_handle;
  esp_err_t err = nvs_open("storage", NVS_READONLY, &my_handle);
  if (err == ESP_OK) {
    size_t required_size = sizeof(ihm_settings_t);
    err = nvs_get_blob(my_handle, "settings", &g_ihm_state.settings,
                       &required_size);
    nvs_close(my_handle);
    if (err == ESP_OK) {
      ESP_LOGI("IHM_STATE", "Configurações carregadas do NVS");
    } else {
      ESP_LOGW("IHM_STATE",
               "Nenhuma configuração encontrada no NVS, usando padrão");
    }
  }
}
