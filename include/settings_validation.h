#ifndef SETTINGS_VALIDATION_H
#define SETTINGS_VALIDATION_H
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <ctype.h>

static inline bool settings_ipv4(const char *text, uint32_t *value) {
    uint32_t result = 0;
    for (int part = 0; part < 4; part++) {
        unsigned octet = 0, digits = 0;
        while (*text >= '0' && *text <= '9') {
            octet = octet * 10 + (unsigned)(*text++ - '0');
            if (++digits > 3 || octet > 255) return false;
        }
        if (!digits) return false;
        result = (result << 8) | octet;
        if (part < 3) { if (*text++ != '.') return false; }
        else if (*text != '\0') return false;
    }
    *value = result;
    return true;
}

static inline bool settings_network_valid(const char *ip, const char *gateway, const char *mask) {
    uint32_t address, gw, netmask;
    if (!settings_ipv4(ip, &address) || !settings_ipv4(gateway, &gw) || !settings_ipv4(mask, &netmask)) return false;
    uint32_t hosts = ~netmask;
    if (!netmask || hosts < 3 || (hosts & (hosts + 1)) != 0) return false;
    if ((address >> 24) == 0 || (address >> 24) >= 224 || (address >> 24) == 127) return false;
    if (!(address & hosts) || (address & hosts) == hosts) return false;
    if (gw == 0) return true; // Rede local sem gateway.
    return (gw & netmask) == (address & netmask) && (gw & hosts) != 0 && (gw & hosts) != hosts && gw != address;
}

static inline bool settings_password_valid(const char *password) {
    size_t n = strlen(password);
    if (n == 0 || (n >= 8 && n <= 63)) return true;
    if (n != 64) return false;
    for (size_t i = 0; i < n; i++) if (!isxdigit((unsigned char)password[i])) return false;
    return true;
}
#endif
