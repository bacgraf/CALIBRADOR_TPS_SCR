# Validação das correções

Os testes abaixo não gravam hardware e não acessam Microsoft/SharePoint.

## Firmware em host

Com Zig 0.14.1 no PATH (ou outro compilador C compatível):

```powershell
zig cc -std=c11 -Itest/host -Iinclude test/host/test_firmware.c src/can_protocol.c src/device_operations.c src/ihm_state.c -o test/host/test_firmware.exe
./test/host/test_firmware.exe
```

Compila os módulos reais com stubs de CAN, FreeRTOS e NVS. Verifica precisão, limites e bytes enviados, confirmação parcial e timeout do número de série, sequência/cancelamento dos relés, validação de rede, falha de commit e migração da configuração antiga.

## Interface

```powershell
cd WEB
npm ci
npm run lint
npm test
npm run build
```

## Publicação web

Na raiz do projeto:

```powershell
python -m unittest discover -s test -v
```

Os testes usam diretórios temporários próprios. Verificam build ausente, asset ausente, falha de cópia, restauração após falha na troca, backup e uso de `data` sem novo build.

## Compilação embarcada

```powershell
pio run
pio run -t buildfs
```

`platformio.ini` fixa a plataforma 6.13.0, compatível com o sdkconfig ESP-IDF 5.5.3 do projeto. Nenhum comando acima faz upload.

## Bancada pendente

- Confirmar CPU e UGE após gravar número de série e verificar resultado após reinicialização.
- Testar ciclo completo, cancelamento e perda de CAN com observação das saídas físicas.
- Verificar Wi-Fi com configuração anterior migrada e após salvar nova configuração.
- Reproduzir erro do DSLite real e confirmar encerramento de todos os processos daquele gravador.
- Medir duração normal da gravação para ajustar o timeout de 300 s se necessário.

Os testes de host não validam temporização real do CAN, persistência física da UGE, drivers TI ou estado elétrico das saídas.
