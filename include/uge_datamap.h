#ifndef UGE_DATAMAP_H
#define UGE_DATAMAP_H

/**
 * Mapeamento de Registradores da UGE TPS125 para o ESP32 (Calibrador TPS).
 * Adicionados os grupos obrigatórios definidos pelo usuário.
 */

// ==========================================
// 1. Versão de Firmware e Build
// ==========================================
#define REG_VERS_FW 1
#define REG_VERS_BUILD 2

// ==========================================
// 2. Leituras CC (Tensões, Correntes, Offsets e Ganhos)
// ==========================================
// Leituras
#define REG_VRET 11
#define REG_VBAT 12
#define REG_VCONS 13
#define REG_IRET 15
#define REG_IBAT 16
#define REG_ICONS 17

// Ganhos e Offsets (Calibração)
#define REG_SN_CPU 128
#define REG_SN_UGE 129
#define REG_HORAS_SET 130
#define REG_CICLOS_SET 131
#define REG_VRET1_GANHO 132
#define REG_VRET1_OFFSET 133
#define REG_VRET2_GANHO 134
#define REG_VRET2_OFFSET 135
#define REG_VCONS_GANHO 136
#define REG_VCONS_OFFSET 137
#define REG_IRET1_GANHO 138
#define REG_IRET1_OFFSET 139
#define REG_IRET2_GANHO 140  // Reservado
#define REG_IRET2_OFFSET 141 // Reservado
#define REG_IBAT_GANHO 142
#define REG_IBAT_OFFSET 143

// ==========================================
// 3. Leituras CA (Tensões, Correntes e Ganhos)
// ==========================================
// Leituras
#define REG_VCA_RS 19
#define REG_VCA_ST 20
#define REG_VCA_TR 21
#define REG_ICA_R 23
#define REG_ICA_S 24
#define REG_ICA_T 25

// Ganhos (Calibração)
#define REG_VCA_RS_GANHO 144
#define REG_VCA_ST_GANHO 145
#define REG_ICA_R_GANHO 146
#define REG_ICA_T_GANHO 147
#define REG_VCA_T_GANHO 148
#define REG_ICA_S_GANHO 149
#define REG_SINT_VCA 197

// ==========================================
// 4. Temperatura da Bateria
// ==========================================
#define REG_TEMP_BAT 14   // Média
#define REG_TEMP_BAT_0 59 // Individual Sensor 0
#define REG_TEMP_BAT_1 60
#define REG_TEMP_BAT_2 61
#define REG_TEMP_BAT_3 62
#define REG_TEMP_BAT_4 63
#define REG_TEMP_BAT_5 64
#define REG_TEMP_BAT_6 65
#define REG_TEMP_BAT_7 66

// ==========================================
// 5. Entradas e Saídas Digitais
// ==========================================
#define REG_TESTE_DIN 416
#define REG_TESTE_DOUT_PRI 417

// ==========================================
// 6. Comandos e Testes (Liga/Desliga e Reboot)
// ==========================================
#define REG_CMD_LIGA 424   // Liga/Desliga retificador (0=desligar, 1=ligar)
#define REG_CMD_REBOOT 426 // Reinicia a CPU com base nos códigos abaixo

// Códigos para REG_CMD_REBOOT (Tabela de códigos teReboot)
#define RBT_NORMAL 1    // Reboot normal
#define RBT_HORIMETRO 2 // Reboot para gravação do horímetro
#define RBT_AJUSTES 3   // Reboot para aplicar ajustes de parâmetros base
#define RBT_PAINEL 4    // Reboot solicitado pelo painel
#define RBT_APAGAR 5    // Reboot para apagar configurações
#define RBT_FORMATAR 6  // Reboot para formatar EEPROM
#define RBT_RESTAURAR 7 // Reboot para restaurar padrão de fábrica

// ==========================================
// X. Registradores Legados/Mantidos
// ==========================================
#define REG_VERS_EXP1 5
#define REG_VERS_EXP2 6
#define REG_VCA_FREQ 22
#define REG_VCA_SEQ 26
#define REG_CAR_MODO_ATIVO 73
#define REG_ESTADO_CAR 74
#define REG_ERRO_COD 75
#define REG_ESTADO_RET 80
#define REG_ALARMES 82
#define REG_ALERTAS 83
#define REG_BOOT 92
#define REG_SIN_REDE 96
#define REG_SIN_RET 97
#define REG_SIN_BAT 98
#define REG_SIN_CONS 99
#define REG_CAR_MODO_SALVO 224
#define REG_VSET_FLU 232
#define REG_VSET_EQU 233
#define REG_VSET_CONS 235
#define REG_VSET_EMERG 236
#define REG_CMD_RESET 425
#define REG_CMD_CAR_MODO 427

// ==========================================
// 5.7. Diagnóstico Avançado de Sensores (Médias e RMS)
// ==========================================
#define REG_VRET1_AVG     104
#define REG_VRET2_AVG     105
#define REG_VBAT1_AVG     105  // Alias para clareza no código de bateria
#define REG_VCONS_AVG     106
#define REG_IRET1_AVG     107
#define REG_IRET2_AVG     108
#define REG_IBAT_AVG      109
#define REG_VCA_RS_RMS    110
#define REG_VCA_RS_AVG    111
#define REG_VCA_ST_RMS    112
#define REG_VCA_ST_AVG    113
#define REG_ICA_R_RMS     114
#define REG_ICA_R_AVG     115
#define REG_ICA_T_RMS     116
#define REG_ICA_T_AVG     117
#define REG_TRET_AVG      118
#define REG_VCA_T_RMS     430
#define REG_ICA_S_RMS     432

#endif // UGE_DATAMAP_H
