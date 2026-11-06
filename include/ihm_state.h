#ifndef IHM_STATE_H
#define IHM_STATE_H

#include <stdbool.h>
#include <stdint.h>
#include "esp_err.h"

// Struct de Flags de Comportamento
typedef struct {
    bool ignore_advertise;
    bool debug_print_can;
    bool enable_telemetry;

    bool ws_client_connected;  // Cliente WebSocket ativo (para LED de status)
    bool uge_link_ok;          // Link CAN com a UGE ativo (timeout 3s)
} ihm_flags_t;

// Configurações de Rede e Sistema (Persistidas em NVS)
typedef struct {
    char wifi_ssid[33];
    char wifi_pass[65];
    char static_ip[16];
    char static_gw[16];
    char static_mask[16];
    uint16_t dhcp_enabled;    // 1 = DHCP, 0 = Estático
    uint16_t ap_enabled;      // 1 = AP+STA, 0 = STA Only
} ihm_settings_t;

/**
 * @brief Estrutura Central de Estado (Packed para Web-Telemetry)
 */
typedef struct __attribute__((packed)) {
    // 0..2: Flags
    ihm_flags_t flags;

    // Configurações (Não enviadas em todo broadcast de telemetria)
    ihm_settings_t settings;

    // 3..30: Medições CA/CC Básicas (7 floats = 28 bytes)
    float vret_meas, vbat_meas, vcons_meas, temp_bat_meas;
    float iret_meas, ibat_meas, icons_meas;

    // 31..58: Medições CA Básicas (7 floats = 28 bytes)
    float vca_rs_meas, vca_st_meas, vca_tr_meas, fca_meas;
    float ica_r_meas, ica_s_meas, ica_t_meas;

    // 59..114: Diagnóstico RMS e Médias (15 floats!)
    float vret1_avg, vbat1_avg, vcons_avg, iret1_avg, iret2_avg, ibat_avg, tbat_avg;
    float vca_rs_rms, vca_st_rms, vca_t_rms;
    float ica_r_rms, ica_s_rms, ica_t_rms;
    float vca_rs_avg_dc, vca_st_avg_dc, vca_t_avg_dc;
    float ica_r_avg_dc, ica_t_avg_dc;

    // 115..126: IDs (3 uint32 = 12 bytes)
    uint32_t sn_cpu, sn_uge, horas_set;

    // 127..135: Firmware (8 bytes do raw e 9 da string c char nulo)
    uint64_t uge_fw_raw;
    char uge_fw_build[9];

    // 127..214: Calibração Completa (22 floats = 88 bytes)
    float vret1_ganho, vret1_offset;
    float vret2_ganho, vret2_offset; 
    float vcons_ganho, vcons_offset;
    float iret1_ganho, iret1_offset;
    float iret2_ganho, iret2_offset; 
    float ibat_ganho, ibat_offset;
    float vca_rs_ganho, vca_st_ganho, vca_t_ganho;     // [144, 145, 148]
    float ica_r_ganho, ica_s_ganho, ica_t_ganho;       // [146, 149, 147]

    // 215..220: Status e IOs (3 uint16 = 6 bytes)
    uint16_t ciclos_set;
    uint16_t teste_din;
    uint16_t teste_dout_pri;
    uint16_t erro_cod;
    uint16_t erro_ext;
    uint8_t sca_type;
    uint16_t r_ca_set;

} ihm_state_t;

extern ihm_state_t g_ihm_state;

void ihm_state_update_register(uint16_t reg, int32_t raw_value);
bool ihm_settings_valid(const ihm_settings_t *settings);
esp_err_t ihm_state_save_to_nvs(const ihm_settings_t *settings);
void ihm_state_load_from_nvs(void);

#endif // IHM_STATE_H
