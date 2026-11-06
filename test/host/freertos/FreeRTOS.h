#pragma once
#include <assert.h>
#include <stdint.h>
#define portMAX_DELAY UINT32_MAX
#define pdMS_TO_TICKS(x) (x)
#define pdTICKS_TO_MS(x) (x)
#define configASSERT(x) assert(x)
