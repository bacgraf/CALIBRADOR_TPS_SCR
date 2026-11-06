#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include "can_driver.h"
#include "can_protocol.h"
#include "device_operations.h"
#include "ihm_state.h"
#include "settings_validation.h"
#include "uge_datamap.h"
#include "nvs.h"

static uint32_t clock_ms = 100;
static bool transmit_ok = true, commit_ok = true;
static twai_message_t last_tx;
static unsigned writes;
static unsigned char stored[256], pending[256];
static size_t stored_size, pending_size;
static const char *stored_key = "settings_v2";
static twai_status_info_t mock_twai_status = { .state = TWAI_STATE_RUNNING };
static unsigned recovery_calls, start_calls, stop_calls, clear_tx_calls, clear_rx_calls;

uint32_t xTaskGetTickCount(void) { return clock_ms; }
esp_err_t twai_driver_install(const twai_general_config_t *g, const twai_timing_config_t *t, const twai_filter_config_t *f) {
    (void)g; (void)t; (void)f; return ESP_OK;
}
esp_err_t twai_start(void) {
    start_calls++;
    mock_twai_status.state = TWAI_STATE_RUNNING;
    mock_twai_status.tx_error_counter = 0;
    mock_twai_status.rx_error_counter = 0;
    return ESP_OK;
}
esp_err_t twai_stop(void) {
    stop_calls++;
    mock_twai_status.state = TWAI_STATE_STOPPED;
    return ESP_OK;
}
esp_err_t twai_get_status_info(twai_status_info_t *status_info) {
    *status_info = mock_twai_status;
    return ESP_OK;
}
esp_err_t twai_initiate_recovery(void) {
    recovery_calls++;
    mock_twai_status.state = TWAI_STATE_RECOVERING;
    return ESP_OK;
}
esp_err_t twai_clear_transmit_queue(void) {
    clear_tx_calls++;
    mock_twai_status.msgs_to_tx = 0;
    return ESP_OK;
}
esp_err_t twai_clear_receive_queue(void) {
    clear_rx_calls++;
    mock_twai_status.msgs_to_rx = 0;
    return ESP_OK;
}
esp_err_t twai_transmit(const twai_message_t *msg, uint32_t ticks) {
    (void)ticks;
    last_tx = *msg;
    tuCAN_ID id = {.all = msg->identifier};
    if (id.bit.operacao == OP_REQ_WRITE) writes++;
    return transmit_ok ? ESP_OK : ESP_FAIL;
}
esp_err_t nvs_open(const char *name, int mode, nvs_handle_t *handle) { (void)name; (void)mode; *handle=1; return ESP_OK; }
void nvs_close(nvs_handle_t handle) { (void)handle; }
esp_err_t nvs_set_blob(nvs_handle_t handle, const char *name, const void *data, size_t size) {
    (void)handle; (void)name; assert(size <= sizeof(pending)); memcpy(pending, data, size); pending_size=size; return ESP_OK;
}
esp_err_t nvs_commit(nvs_handle_t handle) {
    (void)handle;
    if (!commit_ok) return ESP_FAIL;
    memcpy(stored, pending, pending_size); stored_size=pending_size; stored_key="settings_v2"; return ESP_OK;
}
esp_err_t nvs_get_blob(nvs_handle_t handle, const char *name, void *data, size_t *size) {
    (void)handle;
    if (!stored_size || strcmp(name, stored_key)) return ESP_ERR_NVS_NOT_FOUND;
    if (*size < stored_size) return ESP_ERR_INVALID_SIZE;
    memcpy(data, stored, stored_size); *size=stored_size; return ESP_OK;
}
static void tick(uint32_t now) { clock_ms=now; device_operations_tick(now); }

static void test_wire_numbers(void) {
    uint32_t values[] = {0, 16777217, 202600001, UINT32_MAX};
    for (unsigned i=0; i<sizeof(values)/sizeof(values[0]); i++) {
        uint32_t value=values[i];
        assert(can_protocol_transmit_req_write(128, 4, (double)value));
        assert(last_tx.data_length_code == 4);
        uint32_t wire=((uint32_t)last_tx.data[0]<<24)|((uint32_t)last_tx.data[1]<<16)|((uint32_t)last_tx.data[2]<<8)|last_tx.data[3];
        assert(wire == value);
        tuCAN_ID id={0}; id.bit.origem=END_UGE; id.bit.destino=END_IHM;
        id.bit.operacao=OP_RESP_READ; id.bit.formato=4; id.bit.reg=128;
        last_tx.identifier=id.all;
        can_protocol_print_msg(&last_tx);
        assert(g_ihm_state.sn_cpu == value);
    }
    assert(!can_protocol_transmit_req_write(128, 4, 4294967296.0));
    assert(!can_protocol_transmit_req_write(128, 4, 1.5));
    assert(!can_protocol_transmit_req_write(128, 4, NAN));
    assert(!can_protocol_transmit_req_write(132, 2, 32768));
    assert(can_protocol_transmit_req_write(132, 2, -32768));
    assert(last_tx.data[0] == 0x80 && last_tx.data[1] == 0);
    assert(can_protocol_transmit_req_write(132, 5, 1.5));
    assert(last_tx.data[0] == 0x3f && last_tx.data[1] == 0xc0);
    puts("OK wire numbers / range / endianness");
}

static void test_serial_confirmation(void) {
    serial_status_t serial; relay_status_t relay;
    clock_ms=100;
    assert(serial_start(202600001, "first"));
    assert(!serial_start(1, "other"));
    assert(!relay_start());
    assert(!device_operations_manual_write(128, 4, 99));
    device_operations_on_read(128, 202600001); device_operations_on_read(129, 202600001);
    device_operations_snapshot(&serial,&relay); assert(serial.busy && !serial.success);
    tick(100); tick(600); tick(1100);
    device_operations_on_read(128, 202600001);
    device_operations_on_read(129, 202600000);
    device_operations_snapshot(&serial,&relay); assert(serial.busy && serial.cpu_ok && !serial.uge_ok);
    device_operations_on_read(129, 202600001);
    device_operations_snapshot(&serial,&relay); assert(!serial.busy && serial.success);
    unsigned completed_writes = writes;
    assert(serial_start(202600001, "first"));
    tick(1100);
    assert(writes == completed_writes); // Repetir o mesmo ID não regrava.
    assert(serial_start(17, "timeout"));
    tick(1100); tick(1600); tick(2100);
    device_operations_on_read(128,17); tick(7100);
    device_operations_snapshot(&serial,&relay); assert(!serial.busy && !serial.success && serial.cpu_ok && !serial.uge_ok);
    transmit_ok=false;
    assert(serial_start(18, "send-error")); tick(7100);
    device_operations_snapshot(&serial,&relay); assert(!serial.busy && !serial.success);
    transmit_ok=true;
    puts("OK serial fresh read / partial / timeout / send failure");
}

static void test_relays(void) {
    serial_status_t serial; relay_status_t relay;
    clock_ms=10000; writes=0;
    assert(relay_start());
    // O estado da telemetria não interfere na sequência do controlador.
    g_ihm_state.flags.enable_telemetry=false;
    for (uint32_t now=10000; now<=17200; now+=200) tick(now);
    device_operations_snapshot(&serial,&relay);
    assert(!relay.active && relay.stopping && writes==37);
    device_operations_on_read(417, 1); assert(relay_busy());
    device_operations_on_read(417, 0);
    device_operations_snapshot(&serial,&relay); assert(!relay.stopping && relay.off_confirmed);
    assert(relay_start()); tick(17200); relay_cancel(); tick(17200); tick(21200);
    device_operations_snapshot(&serial,&relay); assert(!relay.active && !relay.stopping && !relay.off_confirmed);
    puts("OK relay cycles / cancel / unconfirmed shutdown");
}

static void test_network_and_nvs(void) {
    ihm_settings_t candidate = {.wifi_ssid="rede", .wifi_pass="12345678", .static_ip="192.168.1.100",
        .static_gw="192.168.1.1", .static_mask="255.255.255.0", .dhcp_enabled=0, .ap_enabled=1};
    assert(ihm_settings_valid(&candidate));
    assert(!settings_network_valid("192.168.1.0","192.168.1.1","255.255.255.0"));
    assert(!settings_network_valid("192.168.1.2","192.168.2.1","255.255.255.0"));
    assert(!settings_network_valid("192.168.1.2","192.168.1.1","255.0.255.0"));
    assert(!settings_password_valid("short"));
    memset(candidate.wifi_ssid,'s',32); candidate.wifi_ssid[32]=0;
    assert(ihm_state_save_to_nvs(&candidate)==ESP_OK);
    memset(g_ihm_state.settings.wifi_ssid,0,sizeof(g_ihm_state.settings.wifi_ssid));
    ihm_state_load_from_nvs(); assert(strlen(g_ihm_state.settings.wifi_ssid)==32);
    strcpy(candidate.wifi_ssid,"nova"); commit_ok=false;
    assert(ihm_state_save_to_nvs(&candidate)!=ESP_OK);
    assert(strlen(g_ihm_state.settings.wifi_ssid)==32);
    commit_ok=true;
    struct { char ssid[32],pass[64],ip[16],gw[16],mask[16]; uint16_t dhcp,ap; } legacy={0};
    memset(legacy.ssid,'l',32); memset(legacy.pass,'a',64); legacy.dhcp=1; legacy.ap=1;
    memcpy(stored,&legacy,sizeof(legacy)); stored_size=sizeof(legacy); stored_key="settings";
    ihm_state_load_from_nvs();
    assert(strlen(g_ihm_state.settings.wifi_ssid)==32 && strlen(g_ihm_state.settings.wifi_pass)==64);
    assert(stored_size==sizeof(ihm_settings_t) && !strcmp(stored_key,"settings_v2"));
    puts("OK WiFi validation / NVS commit failure / restart / legacy migration");
}

static void test_can_recovery_and_heartbeat(void) {
    // 1. Heartbeat deve atualizar mesmo com ignore_advertise = true em frames OP_ADVERTISE
    g_ihm_state.flags.ignore_advertise = true;
    g_last_can_msg_ms = 0;
    clock_ms = 5000;
    tuCAN_ID adv_id = {0};
    adv_id.bit.origem = END_UGE;
    adv_id.bit.destino = END_IHM;
    adv_id.bit.operacao = OP_ADVERTISE;
    adv_id.bit.Nack = 1;
    adv_id.bit.formato = 2;
    adv_id.bit.reg = REG_VRET;
    twai_message_t adv_msg = { .identifier = adv_id.all, .extd = true, .data_length_code = 2, .data = {0x04, 0xE2} };
    can_protocol_print_msg(&adv_msg);
    assert(g_last_can_msg_ms == 5000);

    // 2. Heartbeat deve atualizar em OP_RESP_WRITE (Ack de escrita)
    clock_ms = 6200;
    tuCAN_ID ack_id = {0};
    ack_id.bit.origem = END_UGE;
    ack_id.bit.destino = END_IHM;
    ack_id.bit.operacao = OP_RESP_WRITE;
    ack_id.bit.Nack = 0;
    ack_id.bit.formato = 2;
    ack_id.bit.reg = REG_VRET1_GANHO;
    twai_message_t ack_msg = { .identifier = ack_id.all, .extd = true, .data_length_code = 0 };
    can_protocol_print_msg(&ack_msg);
    assert(g_last_can_msg_ms == 6200);

    // 3. Bit de sequência unificado e preservado em caso de falha de envio (twai_transmit)
    assert(can_protocol_transmit_req_write(REG_VRET1_GANHO, 2, 10));
    tuCAN_ID id1 = { .all = last_tx.identifier };
    uint32_t seq1 = id1.bit.seq;
    transmit_ok = false;
    assert(!can_protocol_transmit_req_write(REG_VRET1_GANHO, 2, 10));
    transmit_ok = true;
    assert(can_protocol_transmit_req_write(REG_VRET1_GANHO, 2, 10));
    tuCAN_ID id2 = { .all = last_tx.identifier };
    assert(id2.bit.seq == (seq1 ^ 1U)); // Não repetiu o mesmo seq após falha intermediária

    // 4. Ciclo completo de recuperação BUS_OFF -> RECOVERING -> STOPPED -> RUNNING
    recovery_calls = start_calls = stop_calls = clear_tx_calls = clear_rx_calls = 0;
    mock_twai_status.state = TWAI_STATE_BUS_OFF;
    mock_twai_status.tx_error_counter = 256;
    assert(!can_driver_check_and_recover(7000, false));
    assert(recovery_calls == 1 && mock_twai_status.state == TWAI_STATE_RECOVERING);
    assert(!can_driver_check_and_recover(7100, false));
    mock_twai_status.state = TWAI_STATE_STOPPED;
    assert(can_driver_check_and_recover(7200, false));
    assert(start_calls == 1 && clear_tx_calls == 1 && clear_rx_calls == 1);
    assert(mock_twai_status.state == TWAI_STATE_RUNNING);

    // 5. Limpeza de RX overrun e reciclagem em Error Passive sem link
    mock_twai_status.rx_overrun_count = 3;
    mock_twai_status.msgs_to_tx = 5;
    assert(can_driver_check_and_recover(7500, false));
    assert(clear_rx_calls == 2 && clear_tx_calls == 2);
    mock_twai_status.tx_error_counter = 128;
    assert(can_driver_check_and_recover(10500, false));
    assert(stop_calls == 1 && start_calls == 2);

    puts("OK CAN bus-off recovery / RX overrun / unified seq / advertise heartbeat");
}

int main(void) {
    device_operations_init();
    test_wire_numbers(); test_serial_confirmation(); test_relays(); test_network_and_nvs();
    test_can_recovery_and_heartbeat();
    puts("All firmware host tests passed.");
    return 0;
}
