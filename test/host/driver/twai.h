#pragma once
#include <stdint.h>
#include <stdbool.h>
#include "esp_err.h"

typedef enum {
    TWAI_MODE_NORMAL,
    TWAI_MODE_NO_ACK,
    TWAI_MODE_LISTEN_ONLY
} twai_mode_t;

typedef enum {
    TWAI_STATE_STOPPED,
    TWAI_STATE_RUNNING,
    TWAI_STATE_BUS_OFF,
    TWAI_STATE_RECOVERING
} twai_state_t;

typedef struct {
    int tx_io;
    int rx_io;
    twai_mode_t mode;
    uint32_t tx_queue_len;
    uint32_t rx_queue_len;
} twai_general_config_t;

#define TWAI_GENERAL_CONFIG_DEFAULT(tx, rx, m) \
    { .tx_io = (tx), .rx_io = (rx), .mode = (m), .tx_queue_len = 5, .rx_queue_len = 5 }

typedef struct {
    uint32_t brp;
    uint8_t tseg_1;
    uint8_t tseg_2;
    uint8_t sjw;
    bool triple_sampling;
} twai_timing_config_t;

typedef struct {
    uint32_t acceptance_code;
    uint32_t acceptance_mask;
    bool single_filter;
} twai_filter_config_t;

#define TWAI_FILTER_CONFIG_ACCEPT_ALL() \
    { .acceptance_code = 0, .acceptance_mask = 0xFFFFFFFF, .single_filter = true }

typedef struct {
    twai_state_t state;
    uint32_t msgs_to_tx;
    uint32_t msgs_to_rx;
    uint32_t tx_error_counter;
    uint32_t rx_error_counter;
    uint32_t tx_failed_count;
    uint32_t rx_missed_count;
    uint32_t rx_overrun_count;
    uint32_t arb_lost_count;
    uint32_t bus_error_count;
} twai_status_info_t;

typedef struct {
    uint32_t identifier;
    bool extd, rtr;
    uint8_t data_length_code;
    uint8_t data[8];
} twai_message_t;

esp_err_t twai_driver_install(const twai_general_config_t *g_config,
                              const twai_timing_config_t *t_config,
                              const twai_filter_config_t *f_config);
esp_err_t twai_start(void);
esp_err_t twai_stop(void);
esp_err_t twai_get_status_info(twai_status_info_t *status_info);
esp_err_t twai_initiate_recovery(void);
esp_err_t twai_clear_transmit_queue(void);
esp_err_t twai_clear_receive_queue(void);
esp_err_t twai_transmit(const twai_message_t *message, uint32_t ticks);
