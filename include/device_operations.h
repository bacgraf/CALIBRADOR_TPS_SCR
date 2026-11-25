#ifndef DEVICE_OPERATIONS_H
#define DEVICE_OPERATIONS_H
#include <stdbool.h>
#include <stdint.h>

typedef struct {
    char request_id[65];
    uint32_t value;
    bool busy, cpu_ok, uge_ok, success;
    char message[128];
} serial_status_t;
typedef struct {
    bool active, stopping, off_confirmed;
    char message[128];
} relay_status_t;

void device_operations_init(void);
bool serial_start(uint32_t value, const char *request_id);
bool serial_busy(void);
bool relay_start(void);
void relay_cancel(void);
bool relay_busy(void);
bool device_operations_manual_write(uint16_t reg, uint8_t format, double value);
bool device_operations_read_reg(uint16_t reg, uint8_t format, uint8_t qtd, uint32_t *out_values, uint32_t timeout_ms);
void device_operations_tick(uint32_t now);
void device_operations_on_read(uint16_t reg, uint32_t value);
void device_operations_snapshot(serial_status_t *serial, relay_status_t *relay);
#endif
