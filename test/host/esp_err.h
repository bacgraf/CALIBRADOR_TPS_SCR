#pragma once
typedef int esp_err_t;
#define ESP_OK 0
#define ESP_FAIL -1
#define ESP_ERR_INVALID_ARG 1
#define ESP_ERR_INVALID_SIZE 2
#define ESP_ERR_NVS_NOT_FOUND 3
static inline const char *esp_err_to_name(int err) { return err ? "error" : "OK"; }
