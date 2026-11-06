# Gravação e recuperação de erros

Atualize `teksea_bridge.py`, `flash_controller.py`, `stop_bridge.py` e `kill_bridge.bat` juntos. A interface web também precisa ser atualizada: a API de início agora usa POST. Não execute o instalador nem altere o registro do Windows apenas para atualizar esses arquivos.

Depois que a gravação terminar com erro, a tela mantém o diagnóstico e o log. “Fechar” permite sair; os botões de firmware ficam disponíveis para nova tentativa somente após a ponte confirmar o encerramento dos processos.

“Cancelar gravação” interrompe o DSLite e os filhos daquela operação. Interromper a gravação pode exigir regravar o equipamento. Se a ponte ficar inacessível, “Fechar” fecha somente a tela: o processo pode continuar, e a aplicação precisa recuperar seu estado antes de permitir outra tentativa.

O timeout padrão é 300 segundos. Ajuste `flash_timeout_seconds` em `config.json` após medir os tempos reais da bancada (limite aceito: 30 a 3600 segundos). A ausência de mensagens no log não é considerada falha por si só.

## Endereço autorizado da interface

Por padrão, são aceitas estas origens:

- `http://192.168.4.1`
- `http://192.168.1.100`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Se o ESP32 receber outro endereço, acrescente `allowed_origins` ao `config.json`, preservando os caminhos existentes. A lista substitui os padrões; mantenha nela todos os endereços usados, com protocolo e porta exatos, sem barra final. Não use `*`.

```json
{
  "tps_root": "C:/caminho/dos/firmwares/TPS",
  "scr_root": "C:/caminho/dos/firmwares/SCR",
  "flash_timeout_seconds": 300,
  "allowed_origins": ["http://192.168.4.1", "http://192.168.1.100", "http://localhost:3000"]
}
```

Os nomes de firmware devem corresponder exatamente ao arquivo. Se necessário, configure `tps_fw_jiga`, `tps_fw_burnin`, `tps_fw_cliente` e equivalentes `scr_fw_*`. Para SCR, `scr_fw_jiga` define a imagem VCA montado. Arquivo ausente não é substituído automaticamente por outro de nome parecido.

`kill_bridge.bat` usa a API local para cancelar a operação, aguardar a limpeza e encerrar somente esta ponte. Ele não mata todos os processos Python do computador. Se a limpeza não for confirmada, apresenta o erro e preserva o diagnóstico.

## Validação

Sem conectar o gravador:

```powershell
cd TEKSEA_BRIDGE
python -m unittest -v test_flash_controller test_bridge_http
```

Os testes de processos usam Job Objects reais do Windows, mas executam processos Python de teste, não DSLite. A validação física com o equipamento, inclusive do timeout e de drivers TI, continua necessária.

Referência do mecanismo de contenção: [Windows Job Objects](https://learn.microsoft.com/windows/win32/procthread/job-objects).
