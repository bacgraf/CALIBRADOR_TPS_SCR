#include "device_operations.h"
#include "can_protocol.h"
#include "uge_datamap.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include <stdio.h>
#include <string.h>

static SemaphoreHandle_t lock;
static serial_status_t serial;
static relay_status_t relay;
static unsigned serial_phase, relay_step;
static uint32_t serial_started, serial_next, relay_next, relay_stop_started;
static bool serial_waiting, relay_waiting;
static uint32_t millis(void) { return pdTICKS_TO_MS(xTaskGetTickCount()); }
static bool due(uint32_t now, uint32_t deadline) { return (int32_t)(now - deadline) >= 0; }

void device_operations_init(void) {
    lock = xSemaphoreCreateMutex();
    configASSERT(lock);
    snprintf(relay.message, sizeof(relay.message), "Nenhum teste iniciado");
}

bool serial_busy(void) {
    xSemaphoreTake(lock, portMAX_DELAY);
    bool busy = serial.busy;
    xSemaphoreGive(lock);
    return busy;
}

bool relay_busy(void) {
    xSemaphoreTake(lock, portMAX_DELAY);
    bool busy = relay.active || relay.stopping;
    xSemaphoreGive(lock);
    return busy;
}

bool serial_start(uint32_t value, const char *request_id) {
    xSemaphoreTake(lock, portMAX_DELAY);
    if (serial.busy || relay.active || relay.stopping) {
        xSemaphoreGive(lock);
        return false;
    }
    if (strcmp(serial.request_id, request_id) == 0) {
        bool same = serial.value == value;
        xSemaphoreGive(lock);
        return same;
    }
    memset(&serial, 0, sizeof(serial));
    snprintf(serial.request_id, sizeof(serial.request_id), "%s", request_id);
    serial.value = value;
    serial.busy = true;
    snprintf(serial.message, sizeof(serial.message), "Gravando e confirmando CPU e UGE...");
    serial_phase = 0;
    serial_waiting = false;
    serial_started = serial_next = millis();
    xSemaphoreGive(lock);
    return true;
}

bool relay_start(void) {
    xSemaphoreTake(lock, portMAX_DELAY);
    if (serial.busy || relay.active || relay.stopping) {
        xSemaphoreGive(lock);
        return false;
    }
    relay.active = true;
    relay.off_confirmed = false;
    relay_step = 0;
    relay_next = millis();
    snprintf(relay.message, sizeof(relay.message), "Teste de relés em andamento");
    xSemaphoreGive(lock);
    return true;
}

static void stop_relays(uint32_t now) {
    relay.active = false;
    relay.stopping = true;
    relay.off_confirmed = false;
    relay_waiting = false;
    relay_next = relay_stop_started = now;
    snprintf(relay.message, sizeof(relay.message), "Solicitando desligamento das saídas...");
}

void relay_cancel(void) {
    xSemaphoreTake(lock, portMAX_DELAY);
    if (!relay.stopping) stop_relays(millis());
    xSemaphoreGive(lock);
}

bool device_operations_manual_write(uint16_t reg, uint8_t format, double value) {
    xSemaphoreTake(lock, portMAX_DELAY);
    bool blocked = ((reg == REG_SN_CPU || reg == REG_SN_UGE) && serial.busy) ||
                   (reg == REG_TESTE_DOUT_PRI && (relay.active || relay.stopping));
    bool sent = !blocked && can_protocol_transmit_req_write(reg, format, value);
    xSemaphoreGive(lock);
    return sent;
}

void device_operations_tick(uint32_t now) {
    xSemaphoreTake(lock, portMAX_DELAY);
    if (serial.busy) {
        if ((uint32_t)(now - serial_started) >= 6000) {
            serial.busy = false;
            snprintf(serial.message, sizeof(serial.message), "Sem confirmação: CPU %s; UGE %s. Número não incrementado.",
                     serial.cpu_ok ? "OK" : "pendente", serial.uge_ok ? "OK" : "pendente");
        } else if (due(now, serial_next)) {
            bool sent = false;
            if (serial_phase < 2) {
                uint16_t reg = serial_phase == 0 ? REG_SN_CPU : REG_SN_UGE;
                sent = can_protocol_transmit_req_write(reg, 4, (double)serial.value);
                serial_phase++;
                serial_next = now + 500; // Mantém espaçamento de persistência entre as duas escritas.
            } else {
                // Só aceita respostas recebidas após iniciar a leitura explícita.
                // A telemetria desses registradores fica suspensa durante a operação.
                sent = can_protocol_transmit_req_read(REG_SN_CPU, 4, 2);
                serial_waiting = sent;
                serial_next = now + 250;
            }
            if (!sent) {
                serial.busy = false;
                snprintf(serial.message, sizeof(serial.message), "Falha ao enviar comando CAN. Confira CPU e UGE antes de repetir.");
            }
        }
    }
    if (relay.active && due(now, relay_next)) {
        if (relay_step >= 36) {
            stop_relays(now);
        } else {
            uint16_t value = (relay_step % 2 == 0) ? (1U << ((relay_step % 12) / 2)) : 0;
            if (!can_protocol_transmit_req_write(REG_TESTE_DOUT_PRI, 2, value)) {
                stop_relays(now);
            } else {
                relay_step++;
                relay_next = now + 200;
            }
        }
    }
    if (relay.stopping) {
        if ((uint32_t)(now - relay_stop_started) >= 4000) {
            relay.stopping = false;
            snprintf(relay.message, sizeof(relay.message), "ATENÇÃO: desligamento das saídas não confirmado. Verifique o equipamento.");
        } else if (due(now, relay_next)) {
            relay_waiting = can_protocol_transmit_req_write(REG_TESTE_DOUT_PRI, 2, 0) &&
                            can_protocol_transmit_req_read(REG_TESTE_DOUT_PRI, 2, 1);
            relay_next = now + 250;
        }
    }
    xSemaphoreGive(lock);
}

void device_operations_on_read(uint16_t reg, uint32_t value) {
    xSemaphoreTake(lock, portMAX_DELAY);
    if (serial.busy && serial_waiting) {
        if (reg == REG_SN_CPU) serial.cpu_ok = value == serial.value;
        if (reg == REG_SN_UGE) serial.uge_ok = value == serial.value;
        if (serial.cpu_ok && serial.uge_ok) {
            serial.busy = false;
            serial.success = true;
            snprintf(serial.message, sizeof(serial.message), "Número confirmado na CPU e na UGE.");
        }
    }
    if (relay.stopping && relay_waiting && reg == REG_TESTE_DOUT_PRI && value == 0) {
        relay.stopping = false;
        relay.off_confirmed = true;
        snprintf(relay.message, sizeof(relay.message), "Saídas desligadas: leitura CAN confirmou zero.");
    }
    xSemaphoreGive(lock);
}

void device_operations_snapshot(serial_status_t *out_serial, relay_status_t *out_relay) {
    xSemaphoreTake(lock, portMAX_DELAY);
    *out_serial = serial;
    *out_relay = relay;
    xSemaphoreGive(lock);
}
