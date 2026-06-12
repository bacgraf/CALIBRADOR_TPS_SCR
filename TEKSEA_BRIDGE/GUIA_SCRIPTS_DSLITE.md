# Documentação Exaustiva de Scripts DSLite — Calibrador TPS125

> **Localização dos scripts:** `TPS 125\ccs_base\DebugServer\scripts\`
> **Formato:** Os scripts `.dsls` são arquivos JSON interpretados sequencialmente pelo motor do **DSLite** da Texas Instruments (parte do Code Composer Studio / UniFlash).

---

## Índice

1. [Arquitetura e Conceitos do DSLite](#1-arquitetura-e-conceitos-do-dslite)
2. [Comandos de Definição de Interface (defineOption)](#2-comandos-de-definição-de-interface)
3. [Script: `flash.dsls`](#3-script-flash-dsls)
4. [Script: `f29Flash.dsls`](#4-script-f29flash-dsls)
5. [Script: `load.dsls`](#5-script-load-dsls)
6. [Script: `noConnectFlash.dsls`](#6-script-noconnectflash-dsls)
7. [Script: `serial.dsls`](#7-script-serial-dsls)
8. [Script: `cc13xx-cc26xx-mass-erase.dsls`](#8-script-cc13xx-cc26xx-mass-erase-dsls)
9. [Script: `cc23xx-unlock-debug-access.dsls`](#9-script-cc23xx-unlock-debug-access-dsls)
10. [Script: `memory.dsls`](#10-script-memory-dsls)
11. [Script: `identifyProbe.dsls`](#11-script-identifyprobe-dsls)
12. [Script: `help.dsls`](#12-script-help-dsls)
13. [Índice de Todos os Comandos Internos DSLite](#13-índice-de-todos-os-comandos-internos-dslite)
14. [Referência de Variáveis de Template](#14-referência-de-variáveis-de-template)
15. [Tabela Comparativa de Scripts](#15-tabela-comparativa-de-scripts)
16. [Guia de Uso por Cenário](#16-guia-de-uso-por-cenário)

---

## 1. Arquitetura e Conceitos do DSLite

### 1.1 Sintaxe Geral de Execução

O DSLite é invocado pela linha de comando do Windows usando o executável `dslite.bat` ou `dslite`:

```powershell
dslite <modo> --config=<arquivo.ccxml> [opções] [arquivo_binário...]
```

- **`<modo>`**: O nome do script (sem extensão), ex: `flash`, `load`, `memory`.
- **`--config`**: Aponta para o arquivo `.ccxml` que descreve o hardware alvo (processador, sonda, protocolo JTAG/cJTAG/SWD).
- **`[opções]`**: Parâmetros específicos do script selecionado.
- **`[arquivo_binário]`**: Arquivo `.out` (ELF/COFF) ou `.bin` a ser gravado.

### 1.2 Arquivos `.ccxml`

O arquivo CCXML (Connection Configuration XML) descreve o alvo físico. Pode ser gerado pelo:
- **Code Composer Studio**: Project Properties → General → Connection = Export CCXML.
- **UniFlash**: Interface gráfica → "Save Configuration".

### 1.3 Estrutura de um Script `.dsls`

Cada script é uma sequência de objetos JSON, um por linha, no formato:

```json
{"command": "nomeDoComando", "data": [...], "log": [...], "enableIf": [...]}
```

| Campo | Descrição |
|:---|:---|
| `command` | Nome do comando interno do DSLite a executar. |
| `data` | Array com os argumentos do comando. Pode conter templates `@variavel@`. |
| `log` | Formato de saída no console (printf-style), opcionalmente com campos de variáveis. |
| `enableIf` | Condição booleana; o comando só executa se a condição for verdadeira. |

### 1.4 Sistema de Templates

As variáveis entre `@` são resolvidas em tempo de execução pelo motor do DSLite:

| Template | Resolve para |
|:---|:---|
| `@variavel@` | Valor da opção `variavel` passada na linha de comando |
| `@not_variavel@` | Negação booleana da opção `variavel` |
| `@variavel...@` | Expansão de opções multi-token (lista) |
| `@baseDir@` | Diretório base de instalação dos scripts |

---

## 2. Comandos de Definição de Interface

Estes comandos são sempre declarados no início dos scripts para construir a interface de linha de comando. Eles não interagem com o hardware.

### `defineOption`

Define uma opção que aceita um valor.

```json
{"command": "defineOption", "data": ["nome,atalho", "descrição", valorPadrão]}
```

| Campo `data[2]` | Tipo | Comportamento |
|:---|:---|:---|
| `true` | boolean | Opção obrigatória; erro se omitida |
| `false` | boolean | Opção opcional sem valor padrão |
| `"valor"` | string/number | Opção opcional com valor padrão definido |

**Exemplo de invocação:** `--config=meu_alvo.ccxml` ou `-c meu_alvo.ccxml`

---

### `defineValuelessOption`

Define uma flag binária (sem valor associado). Pode ser `true` ou `false`.

```json
{"command": "defineValuelessOption", "data": ["nome,atalho", "descrição"]}
```

**Exemplo de invocação:** `--verbose` ou `-e` (presença = `true`, ausência = `false`)

---

### `defineDefaultOption`

Define uma opção opcional com valor padrão explícito.

```json
{"command": "defineDefaultOption", "data": ["nome,atalho", "descrição", valorDefault]}
```

**Exemplo:** `"core,n"` com default `0` → se `-n` não for passado, usa o Core 0.

---

### `defineMultiTokenOption`

Define uma opção que pode ser repetida múltiplas vezes na linha de comando.

```json
{"command": "defineMultiTokenOption", "data": ["nome,atalho", "descrição"]}
```

**Exemplo de invocação:** `--before=Erase --before=BlankCheck` (executa as duas operações em sequência)

---

### `defineUsage`

Define a string de ajuda/uso exibida com `--help`.

```json
{"command": "defineUsage", "data": ["dslite flash --config=ccxml-file [options] [flash-file1 ...]"]}
```

---

### `acceptTrailingOperand`

Permite que arquivos passados ao final da linha de comando (sem flag) sejam capturados na variável `@operands@`.

```json
{"command": "acceptTrailingOperand"}
```

---

### `parseCommandLine`

Processa efetivamente a linha de comando com base em todas as definições anteriores. Deve ser chamado após todas as definições.

```json
{"command": "parseCommandLine"}
```

---

### `verifySomeOptionsSupplied`

Valida se pelo menos uma das opções listadas foi fornecida; caso contrário, exibe um erro e aborta.

```json
{"command": "verifySomeOptionsSupplied", "data": [["opção1", "opção2"], "mensagem de erro"]}
```

---

## 3. Script: `flash.dsls`

**Arquivo:** `flash.dsls`
**Propósito:** Script principal de gravação de firmware. Suporta o ciclo completo: apagamento, programação, verificação e execução.

### 3.1 Opções da Linha de Comando

| Opção longa | Atalho | Obrigatório | Padrão | Descrição |
|:---|:---:|:---:|:---:|:---|
| `--config` | `-c` | ✅ Sim | — | Arquivo `.ccxml` que descreve o alvo. Pode ser exportado do CCS ou UniFlash. |
| `--list-cores` | `-N` | Não | — | Lista os cores disponíveis no alvo e seus índices. Útil para DSPs multi-core. |
| `--core` | `-n` | Não | `0` | Índice zero-based do core a operar. Ex: `-n 1` para o Core CPU2 no TMS320F28379D. |
| `--list-settings` | `-S` | Não | — | Aceita regex; exibe as configurações do flasher que casam com o padrão. Use `.*` para listar tudo. |
| `--list-ops` | `-p` | Não | — | Lista todas as operações de flash suportadas pelo alvo (ex: `Erase`, `BlankCheck`, `Verify`). |
| `--list-device-cmds` | `-I` | Não | — | Lista comandos GEL disponíveis no alvo, se existirem. |
| `--load-settings` | `-l` | Não | — | Aplica um arquivo de configurações salvo pelo UniFlash GUI. |
| `--setting` | `-s` | Não | — | Sobrescreve uma configuração específica no formato `id=value`. Pode ser repetido. Ex: `-s SWD_Speed=4`. |
| `--before` | `-b` | Não | — | Operação(ões) a executar **antes** da carga. Repetível. Ex: `--before=Erase`. |
| `--flash` | `-f` | Não | — | Força o modo de gravação (padrão implícito quando `--verify` não está ativo). |
| `--verify` | `-v` | Não | — | Verifica o conteúdo da memória contra o arquivo após a gravação. |
| `--after` | `-a` | Não | — | Operação(ões) a executar **após** a carga. Repetível. Ex: `--after=Verify`. |
| `--list-resets` | `-R` | Não | — | Lista os tipos de reset disponíveis para o alvo. |
| `--run` | `-u` | Não | — | Inicia a execução do código no alvo ao final da operação. |
| `--reset` | `-r` | Não | — | Tipo de reset a executar após a gravação (ex: `Reset`, `POR`). Use `--list-resets` para ver opções. |
| `--post-flash-device-cmd` | `-O` | Não | — | Executa um comando GEL após o flash. Ex: `-O LockDevice`. |
| `--timeout` | `-t` | Não | ∞ | Timeout global em segundos. A operação é abortada se exceder esse tempo. |
| `--log` | `-g` | Não | — | Habilita log detalhado em arquivo. Ex: `--log=flash.log`. |
| `--verbose` | `-e` | Não | — | Exibe mensagens de progresso no console em tempo real. |
| `--help` | `-h` | Não | — | Exibe a ajuda e encerra. |

### 3.2 Fluxo de Execução Detalhado

```
[Inicialização]
  │
  ├─ Exibe versão do DSLite (se --verbose)
  ├─ Configura log em arquivo (se --log)
  ├─ Registra listeners de eventos (statusMessage, gelOutput, progress.update)
  ├─ Define timeout global
  │
[Configuração de Hardware]
  │
  ├─ configure(@config@)          → Carrega o .ccxml e inicializa o DebugServer
  ├─ listCores()                  → Exibe cores (se --list-cores)
  ├─ switchToCore(@core@)         → Seleciona o core (padrão: 0)
  ├─ GEL_CLI_ListCommands()       → Lista comandos (se --list-device-cmds)
  │
[Conexão]
  │
  ├─ targetState.connect()        → Conecta JTAG/SWD, halts o processador
  ├─ settings.setCLI({AutoRunToLabelOnRestart: false, AutoRunToLabelOnReset: false})
  ├─ switchToDebugger()
  ├─ debuggerSettings.loadSettingsFromFile(@load-settings@)
  ├─ switchToCore(@core@)         → Garante core correto após reconexão
  ├─ settings.setCLI(@setting...@)→ Aplica overrides de configuração
  │
[Consultas Pré-Carga]
  │
  ├─ settings.getSettingsAsFormattedString() → Se --list-settings
  ├─ flash.listSupportedOperations()         → Se --list-ops
  │
[Operações de Flash]
  │
  ├─ flash.performOperation(@before...@)     → Ex: Erase (se --before)
  ├─ symbols.loadProgramOnly(@operands@)     → Grava arquivo (se --flash ou padrão)
  ├─ symbols.verifyProgram(@operands@)       → Verifica (se --verify)
  ├─ flash.performOperation(@after...@)      → Ex: BlankCheck (se --after)
  │
[Pós-Carga]
  │
  ├─ targetState.getResetsCLI()              → Lista resets (se --list-resets)
  ├─ targetState.resetCLI(@reset@)           → Executa reset (se --reset)
  ├─ targetState.run(true)                   → Roda o firmware (se --run)
  ├─ GEL_CLI_@post-flash-device-cmd@()      → Comando pós-flash (se --post-flash-device-cmd)
  │
[Finalização]
  │
  ├─ switchToDebugger()
  ├─ waitForIdle()                           → Aguarda todas as operações finalizarem
  ├─ deConfigure()                           → Desconecta e libera a sonda USB
  └─ logMessage("Success")                   → Exibe sucesso (se --verbose)
```

### 3.3 Exemplos de Uso

```powershell
# Gravação básica com verificação e execução posterior
dslite flash --config=TMS320F28375S.ccxml --verify --run firmware.out

# Apagar antes de gravar e verificar
dslite flash --config=TMS320F28375S.ccxml --before=Erase --verify firmware.out

# Gravar com log detalhado em arquivo e timeout de 60 segundos
dslite flash --config=TMS320F28375S.ccxml --log=gravacao.log --timeout=60 --verbose firmware.out

# Listar todas as operações flash disponíveis no alvo
dslite flash --config=TMS320F28375S.ccxml --list-ops

# Listar todos os settings com regex
dslite flash --config=TMS320F28375S.ccxml --list-settings=.*

# Gravar em um segundo core (multi-core)
dslite flash --config=TMS320F28379D_dual.ccxml --core=1 firmware_cpu2.out

# Sobrescrever velocidade JTAG e gravar
dslite flash --config=TMS320F28375S.ccxml --setting=SWD_Speed=4 firmware.out

# Apagar e verificar em branco (sem gravar)
dslite flash --config=TMS320F28375S.ccxml --before=Erase --after=BlankCheck
```

---

## 4. Script: `f29Flash.dsls`

**Arquivo:** `f29Flash.dsls`
**Propósito:** Versão especializada do flash para processadores **C2000 família F29** (ex: TMS320F28375S, F28379D). Esses chips exigem uma etapa obrigatória de gerenciamento de bancos de memória e um reset físico via pino **XRSn** antes da gravação efetiva.

### 4.1 Opções da Linha de Comando

Idênticas às do `flash.dsls` (mesmas opções, mesmo `-c`, `-b`, `-v`, `-u`, `-r`, `-n`, `-t`, `-g`, `-e`, `-h`).

> ⚠️ **Atenção:** Este script NÃO inclui `--list-settings` e `--list-ops` nas consultas intermediárias como o `flash.dsls` genérico. Essas opções existem na definição, mas o fluxo interno não exibe os resultados dessas listagens no mesmo ponto do script.

### 4.2 Fluxo de Execução Detalhado

```
[Inicialização]
  │  (idêntico ao flash.dsls)
  │
[Primeira Conexão — Configuração de Banco]
  │
  ├─ configure(@config@)
  ├─ switchToCore(@core@)
  ├─ targetState.connect()
  ├─ settings.setCLI({AutoRunToLabelOnRestart: false, AutoRunToLabelOnReset: false})
  ├─ switchToDebugger()
  ├─ debuggerSettings.loadSettingsFromFile(@load-settings@)
  ├─ switchToCore(@core@)
  ├─ settings.setCLI(@setting...@)
  │
  ├─ flash.performOperation("ProgramBANKMGMT")  ← *** EXCLUSIVO F29 ***
  │     Grava a tabela de gerenciamento de bancos na região BANKM da flash.
  │     Isso é necessário para autorizar acesso de escrita aos bancos de memória principais.
  │
  ├─ expressions.evaluate("Device_Reset_XRSn()") ← *** EXCLUSIVO F29 ***
  │     Envia um pulso físico no pino XRSn do processador.
  │     Causa um reset completo de hardware (Power-On-Reset equivalente).
  │
[Desconexão e Reconexão Obrigatória]
  │
  ├─ targetState.disconnect()   → Encerra a sessão JTAG atual
  ├─ targetState.connect()      → Reabre a sessão após o reset de hardware
  ├─ settings.setCLI(...)
  ├─ switchToDebugger()
  ├─ debuggerSettings.loadSettingsFromFile(@load-settings@)
  ├─ switchToCore(@core@)
  ├─ settings.setCLI(@setting...@)
  │
[Gravação Principal]
  │
  ├─ symbols.loadProgramOnly(@operands@)  → Grava o firmware principal
  ├─ flash.performOperation(@after...@)   → Operações pós-gravação
  ├─ targetState.getResetsCLI()
  ├─ targetState.resetCLI(@reset@)
  ├─ targetState.run(true)               → Inicia execução (se --run)
  ├─ GEL_CLI_@post-flash-device-cmd@()
  │
[Finalização]
  │
  ├─ switchToDebugger()
  ├─ waitForIdle()
  ├─ deConfigure()
  └─ logMessage("Success")
```

### 4.3 Por que o Ciclo de Disconnect/Reconnect?

O pino **XRSn** (External Reset, active-low) reinicia completamente o chip, incluindo os registradores de controle do debug JTAG. Após esse reset, a sessão JTAG da sonda não é mais válida. Por isso o script:
1. Desconecta (`targetState.disconnect`)
2. Aguarda o chip subir novamente
3. Reconecta (`targetState.connect`) com uma sessão JTAG limpa

### 4.4 Exemplos de Uso

```powershell
# Gravação completa em TMS320F28375S (CPU C2000)
dslite f29Flash --config=TMS320F28375S.ccxml --verbose firmware.out

# Com verificação e execução
dslite f29Flash --config=TMS320F28375S.ccxml --verify --run firmware.out

# Com timeout de 120 segundos (recomendado para F29 por causa do ciclo de reset)
dslite f29Flash --config=TMS320F28375S.ccxml --timeout=120 --verbose firmware.out

# Operação pós-flash via GEL
dslite f29Flash --config=TMS320F28375S.ccxml --post-flash-device-cmd=LockDevice firmware.out
```

---

## 5. Script: `load.dsls`

**Arquivo:** `load.dsls`
**Propósito:** Carregamento rápido de programa na memória do alvo (RAM ou Flash) e início imediato da execução. Usado principalmente durante o ciclo de desenvolvimento.

### 5.1 Opções da Linha de Comando

| Opção longa | Atalho | Obrigatório | Padrão | Descrição |
|:---|:---:|:---:|:---:|:---|
| `--config` | `-c` | ✅ Sim | — | Arquivo `.ccxml` do alvo. |
| `--file` | `-f` | Não* | — | Arquivo ELF/COFF/binário a carregar. *Existe por compatibilidade; prefira passar o arquivo como operando final. |
| `--timeout` | `-t` | Não | ∞ | Timeout em segundos. |
| `--log` | `-g` | Não | — | Arquivo de log detalhado. |
| `--core` | `-n` | Não | `0` | Índice do core. |
| `--help` | `-h` | Não | — | Exibe ajuda e encerra. |

> ⚠️ **Notas:**
> - `--file (-f)` existe apenas por retrocompatibilidade. O modo recomendado é passar o arquivo no final da linha de comando (operando).
> - Este script **sempre** executa o código após o load (`targetState.run`). Não há flag `--run`; a execução é incondicional.
> - `AutoRunToLabelOnRestart` e `AutoRunToLabelOnReset` são explicitamente desativados para garantir que o processador inicie do **reset vector**, não do símbolo `main`.

### 5.2 Fluxo de Execução Detalhado

```
[Inicialização]
  │
  ├─ Valida que ao menos um arquivo foi fornecido (via --file ou operando)
  ├─ Exibe versão do DSLite
  ├─ Configura log
  ├─ Registra listeners de progresso (exibidos SEMPRE, não só com --verbose)
  ├─ Define timeout
  │
[Configuração de Hardware]
  │
  ├─ configure(@config@)
  ├─ switchToCore(@core@)
  │
[Conexão]
  │
  ├─ logMessage("Connecting...")
  ├─ targetState.connect()
  ├─ settings.set({AutoRunToLabelOnRestart: false, AutoRunToLabelOnReset: false})
  │     Nota: usa settings.set (não setCLI); aplica a todos os contextos do debugger.
  │
[Carga]
  │
  ├─ symbols.loadProgramOnly(@file@)     → Se --file foi usado (modo compatibilidade)
  ├─ symbols.loadProgramOnly(@operands@) → Se arquivo passado como operando (modo padrão)
  │     Nota: As duas linhas têm condição mutuamente exclusiva.
  │
[Execução]
  │
  ├─ logMessage("Running...")
  ├─ targetState.run(true)   → SEMPRE executado; não há condição --run aqui.
  │
[Finalização]
  │
  ├─ switchToDebugger()
  ├─ waitForIdle()
  ├─ deConfigure()
  └─ logMessage("Success")
```

### 5.3 Exemplos de Uso

```powershell
# Carregar e rodar firmware (modo padrão)
dslite load --config=TMS320F28375S.ccxml firmware.out

# Usando a flag --file (modo compatibilidade)
dslite load --config=TMS320F28375S.ccxml --file=firmware.out

# Em um core específico (ex: CPU2 de um dual-core)
dslite load --config=TMS320F28379D.ccxml --core=1 firmware_cpu2.out

# Com timeout de 30 segundos
dslite load --config=TMS320F28375S.ccxml --timeout=30 firmware.out

# Com log detalhado habilitado
dslite load --config=TMS320F28375S.ccxml --log=load.log firmware.out
```

---

## 6. Script: `noConnectFlash.dsls`

**Arquivo:** `noConnectFlash.dsls`
**Propósito:** Variante do `flash.dsls` que **omite o comando `targetState.connect`**. Projetado para situações onde o chip está em estado instável ou onde um `connect` formal faria o chip entrar em um loop de erro.

### 6.1 Opções da Linha de Comando

Idênticas às do `flash.dsls`:

| Opção longa | Atalho | Obrigatório | Padrão | Descrição |
|:---|:---:|:---:|:---:|:---|
| `--config` | `-c` | ✅ Sim | — | Arquivo `.ccxml` do alvo. |
| `--list-cores` | `-N` | Não | — | Lista cores disponíveis. |
| `--core` | `-n` | Não | `0` | Índice do core. |
| `--list-settings` | `-S` | Não | — | Lista configurações (regex). |
| `--list-ops` | `-p` | Não | — | Lista operações flash suportadas. |
| `--list-device-cmds` | `-I` | Não | — | Lista comandos GEL disponíveis. |
| `--load-settings` | `-l` | Não | — | Aplica arquivo de settings do UniFlash. |
| `--setting` | `-s` | Não | — | Sobrescreve setting específico (`id=value`). Repetível. |
| `--before` | `-b` | Não | — | Operação pré-carga. Repetível. |
| `--flash` | `-f` | Não | — | Força modo de gravação. |
| `--verify` | `-v` | Não | — | Verifica após gravação. |
| `--after` | `-a` | Não | — | Operação pós-carga. Repetível. |
| `--list-resets` | `-R` | Não | — | Lista tipos de reset. |
| `--run` | `-u` | Não | — | Executa após gravar. |
| `--reset` | `-r` | Não | — | Tipo de reset a executar. |
| `--post-flash-device-cmd` | `-O` | Não | — | Comando GEL pós-flash. |
| `--timeout` | `-t` | Não | ∞ | Timeout em segundos. |
| `--log` | `-g` | Não | — | Log em arquivo. |
| `--verbose` | `-e` | Não | — | Progresso no console. |
| `--help` | `-h` | Não | — | Ajuda. |

### 6.2 Diferença Crítica vs. `flash.dsls`

| Etapa | `flash.dsls` | `noConnectFlash.dsls` |
|:---|:---:|:---:|
| `switchToDebugger()` antes de settings | ✅ Presente | ❌ Ausente |
| `targetState.connect()` | ✅ Presente | ❌ **Ausente** |
| `debuggerSettings.loadSettingsFromFile()` via `switchToDebugger` | ✅ Presente | ❌ Ausente |
| `settings.loadSettingsFromFile()` direto | ❌ Ausente | ✅ Presente |

O script usa `settings.loadSettingsFromFile` e `settings.setCLI` diretamente no contexto atual, sem precisar do `switchToDebugger` que normalmente antecede o `connect`.

### 6.3 Quando Usar

- Chip em estado de loop de watchdog que impede o handshake JTAG.
- Sonda já conectada e inicializada externamente (ex: em linhas de produção com software próprio).
- Dispositivos que entram em modo de *power-down* ao detectar a sequência de `connect`.
- Depuração de problemas com o próprio sequenciamento de conexão.

### 6.4 Exemplos de Uso

```powershell
# Tentativa de gravação em chip instável
dslite noConnectFlash --config=TMS320F28375S.ccxml --verbose firmware.out

# Com apagamento antes (chip pode estar corrompido)
dslite noConnectFlash --config=TMS320F28375S.ccxml --before=Erase firmware.out

# Com verificação e execução
dslite noConnectFlash --config=TMS320F28375S.ccxml --verify --run firmware.out
```

---

## 7. Script: `serial.dsls`

**Arquivo:** `serial.dsls`
**Propósito:** Gravação simplificada e rápida, sem verificação nem execução. Ideal para serialização de placas (gravação de número de série, data de fabricação, etc.) em linhas de produção.

### 7.1 Opções da Linha de Comando

| Opção longa | Atalho | Obrigatório | Padrão | Descrição |
|:---|:---:|:---:|:---:|:---|
| `--config` | `-c` | ✅ Sim | — | Arquivo `.ccxml` do alvo. |
| `--load-settings` | `-l` | Não | — | Aplica arquivo de settings do UniFlash. |
| `--setting` | `-s` | Não | — | Sobrescreve setting específico. Repetível. |
| `--before` | `-b` | Não | — | Operação pré-carga. Repetível. |
| `--flash` | `-f` | Não | — | Força modo de gravação. |
| `--after` | `-a` | Não | — | Operação pós-carga. Repetível. |
| `--log` | `-g` | Não | — | Log em arquivo. |
| `--verbose` | `-e` | Não | — | Progresso no console. |
| `--core` | `-n` | Não | `0` | Índice do core. |
| `--list-ops` | `-p` | Não | — | Lista operações flash. |
| `--list-settings` | `-S` | Não | — | Lista settings (regex). |
| `--help` | `-h` | Não | — | Ajuda. |

> ⚠️ **Ausências Notáveis** comparado ao `flash.dsls`:
> - ❌ Sem `--verify` / `-v`
> - ❌ Sem `--run` / `-u`
> - ❌ Sem `--reset` / `-r`
> - ❌ Sem `--timeout` / `-t`
> - ❌ Sem `--list-cores` / `-N`
> - ❌ Sem `--list-resets` / `-R`
> - ❌ Sem `--post-flash-device-cmd` / `-O`

### 7.2 Fluxo de Execução Detalhado

```
[Inicialização]
  │
  ├─ Valida opções mínimas (--before, operandos, --after, --list-ops ou --list-settings)
  ├─ Exibe versão (se --verbose)
  ├─ Configura log
  ├─ Registra listeners (statusMessage, gelOutput, progress)
  │
[Configuração e Conexão]
  │
  ├─ configure(@config@)
  ├─ debuggerSettings.loadSettingsFromFile(@load-settings@)  ← Antes do switchToCore
  ├─ switchToCore(@core@)
  ├─ logMessage("Connecting...")  (se --verbose)
  ├─ targetState.connect()
  ├─ settings.set({AutoRunToLabelOnRestart: false, AutoRunToLabelOnReset: false})
  ├─ settings.set(@setting...@)
  │
[Consultas]
  │
  ├─ settings.getSettingsAsFormattedString(@list-settings@)  → Se --list-settings
  ├─ flash.listSupportedOperations()                         → Se --list-ops
  │
[Operações]
  │
  ├─ flash.performOperation(@before...@)     → Ex: Erase (se --before)
  ├─ symbols.loadProgramOnly(@operands@)     → Grava apenas se --flash ativo
  ├─ flash.performOperation(@after...@)      → Ex: operação customizada (se --after)
  │
[Finalização — SEM RUN]
  │
  ├─ logMessage("Running...")  ← ⚠️ Mensagem enganosa; NÃO executa targetState.run()
  ├─ switchToDebugger()
  ├─ waitForIdle()
  ├─ deConfigure()
  └─ logMessage("Success")
```

### 7.3 Exemplos de Uso

```powershell
# Gravar dados de serialização em endereço específico
dslite serial --config=alvo.ccxml --before=Erase numeros_serie.out

# Gravar sem apagar (apenas sobrescrever região de serial)
dslite serial --config=alvo.ccxml numeros_serie.out

# Com log para auditoria de linha de produção
dslite serial --config=alvo.ccxml --log=producao.log --verbose serial_data.out

# Listar operações antes de usar
dslite serial --config=alvo.ccxml --list-ops
```

---

## 8. Script: `cc13xx-cc26xx-mass-erase.dsls`

**Arquivo:** `cc13xx-cc26xx-mass-erase.dsls`
**Propósito:** Ferramenta de recuperação para dispositivos **CC13xx** (CC1310, CC1312, CC1352) e **CC26xx** (CC2640, CC2650, CC2652) que estão com o debug bloqueado por configurações de proteção CCFG (Customer Configuration).

### 8.1 Opções da Linha de Comando

| Opção longa | Atalho | Obrigatório | Descrição |
|:---|:---:|:---:|:---|
| `--debugProbe` | `-d` | Condicional* | Nome da sonda de debug. O script resolve automaticamente o `.ccxml` de 2-pin cJTAG. Valores válidos: `XDS110`, `XDS100v3`, `XDS200`. |
| `--config` | `-c` | Condicional* | Arquivo `.ccxml` manual. Recomendado usar configuração de **2-pin cJTAG** para chips bloqueados. |
| `--help` | `-h` | Não | Exibe ajuda e encerra. |

> ⚠️ **Regra Exclusiva:** Use **`-d` OU `-c`**, nunca ambos simultaneamente. O script detecta isso e exibe erro: `"Error: Please do not specify both debugProbe and config option."`.

### 8.2 Resolução Automática de CCXML

Quando `-d` é usado, o script monta o caminho do `.ccxml` assim:

```
@baseDir@arm/cc13xx_cc26xx_2pin_cJTAG_@debugProbe@.ccxml
```

Exemplos de arquivos gerados:
- `-d XDS110` → `arm/cc13xx_cc26xx_2pin_cJTAG_XDS110.ccxml`
- `-d XDS200` → `arm/cc13xx_cc26xx_2pin_cJTAG_XDS200.ccxml`

### 8.3 Fluxo de Execução Detalhado

```
[Inicialização]
  │
  ├─ logEvent("gelOutput") → Captura output do GEL em tempo real
  │
[Configuração Condicional]
  │
  ├─ configure(@config@)   → Se --config foi fornecido (NÃO --debugProbe)
  ├─ configure(@baseDir@arm/cc13xx_cc26xx_2pin_cJTAG_@debugProbe@.ccxml)
  │                        → Se --debugProbe foi fornecido (NÃO --config)
  │
  ├─ Bloco de erro (se ambos foram fornecidos):
  │   logMessage("Error: Please do not specify both debugProbe and config option.")
  │
[Operação de Mass Erase]
  │
  ├─ switchToCore(0)
  ├─ logMessage("Performing Device Unlock via Mass Erase...")
  ├─ expressions.evaluate("MassErase()")   ← Função GEL que apaga TODA a flash
  │     Isso apaga: código, dados, e CCFG (Customer Configuration).
  │     O CCFG contém as flags de proteção, então o apagamento remove o bloqueio.
  │
[Finalização]
  │
  ├─ switchToDebugger()
  ├─ waitForIdle()
  ├─ deConfigure()
  └─ logMessage("Device Unlocked")
```

### 8.4 O que é `MassErase()`?

A função GEL `MassErase()` é implementada no arquivo `.gel` do alvo (parte do CCS). Ela:
1. Entra em modo de programação de flash via JTAG.
2. Envia o comando de apagamento massivo para o controlador de flash interno.
3. Aguarda a conclusão do apagamento de **todos** os setores, incluindo o **CCFG** (setor de configuração do cliente que contém as flags `CCFG_PROT_95_64` etc.).
4. Retorna o controle ao GEL.

### 8.5 Exemplos de Uso

```powershell
# Desbloquear usando sonda XDS110 (modo automático de ccxml)
dslite cc13xx-cc26xx-mass-erase -d XDS110

# Desbloquear usando sonda XDS200
dslite cc13xx-cc26xx-mass-erase -d XDS200

# Usando ccxml manual customizado (2-pin cJTAG recomendado)
dslite cc13xx-cc26xx-mass-erase --config=meu_cc2640_cjtag.ccxml

# Exibir ajuda
dslite cc13xx-cc26xx-mass-erase --help
```

---

## 9. Script: `cc23xx-unlock-debug-access.dsls`

**Arquivo:** `cc23xx-unlock-debug-access.dsls`
**Propósito:** Recuperação para dispositivos da nova família **CC23xx** (ex: CC2340R5), que usa um mecanismo de proteção diferente dos CC13xx/CC26xx anteriores.

### 9.1 Opções da Linha de Comando

| Opção longa | Atalho | Obrigatório | Descrição |
|:---|:---:|:---:|:---|
| `--config` | `-c` | ✅ Sim | Arquivo `.ccxml` do alvo. Sem seleção automática por nome de sonda. |
| `--help` | `-h` | Não | Ajuda. |

> ⚠️ **Diferença:** Ao contrário do script CC13xx/CC26xx, **não existe** o flag `-d` para auto-resolução de sonda. O arquivo `.ccxml` deve sempre ser fornecido manualmente.

### 9.2 Fluxo de Execução Detalhado

```
[Inicialização]
  │
  ├─ logEvent("gelOutput")
  │
[Configuração]
  │
  ├─ configure(@config@)    → Carrega .ccxml; sem opção alternativa
  │
[Operação de Unlock]
  │
  ├─ switchToCore(0)
  ├─ logMessage("Performing Debug Access Unlock...")
  ├─ expressions.evaluate("ChipErase()")   ← Função GEL diferente do MassErase
  │     O CC23xx usa uma sequência de desbloqueio diferente da geração anterior.
  │     ChipErase() acessa o registrador CCFG através do protocolo proprietário
  │     TI SimpleLink, zerando as flags de proteção de acesso ao debug.
  │
[Finalização]
  │
  ├─ switchToDebugger()
  ├─ waitForIdle()
  ├─ deConfigure()
  └─ logMessage("Completed.")
```

### 9.3 Diferença entre `MassErase()` e `ChipErase()`

| Aspecto | `MassErase()` (CC13xx/CC26xx) | `ChipErase()` (CC23xx) |
|:---|:---|:---|
| **Família** | SimpleLink 1ª/2ª geração | SimpleLink 3ª geração |
| **Protocolo** | cJTAG / JTAG padrão | Protocolo simplificado |
| **O que apaga** | Todos os setores de flash + CCFG | Chip inteiro via comando ROM |
| **Impacto** | Remove todo código e configuração | Remove todo código e configuração |
| **Velocidade** | Mais lento (setor a setor) | Mais rápido (comando único ROM) |

### 9.4 Exemplos de Uso

```powershell
# Desbloquear CC2340R5 com ccxml manual
dslite cc23xx-unlock-debug-access --config=CC2340R5_xds110.ccxml

# Com sonda XDS200
dslite cc23xx-unlock-debug-access --config=CC2340R5_xds200.ccxml
```

---

## 10. Script: `memory.dsls`

**Arquivo:** `memory.dsls`
**Propósito:** Extração (dump) de regiões de memória do alvo para arquivo em disco. Permite backup de firmware, calibração, números de série e análise forense.

### 10.1 Opções da Linha de Comando

| Opção longa | Atalho | Obrigatório | Padrão | Descrição |
|:---|:---:|:---:|:---:|:---|
| `--config` | `-c` | ✅ Sim | — | Arquivo `.ccxml` do alvo. |
| `--coff` | `-f` | Não | — | Exporta no formato COFF em vez de binário puro. |
| `--range` | `-r` | ✅ Sim | — | Região de memória a extrair. Formato: `address,length` ou `address@page,length`. Repetível (só para formato COFF). |
| `--size` | `-s` | Não | `8` | Tamanho em bits de cada elemento lido (para endianness): `8`, `16` ou `32`. Apenas para binário. |
| `--output` | `-o` | ✅ Sim | — | Arquivo de saída (ex: `dump.bin` ou `dump.coff`). |
| `--timeout` | `-t` | Não | ∞ | Timeout em segundos. |
| `--log` | `-g` | Não | — | Log detalhado em arquivo. |
| `--verbose` | `-e` | Não | — | Progresso no console. |
| `--core` | `-n` | Não | `0` | Índice do core. |
| `--help` | `-h` | Não | — | Ajuda. |

### 10.2 Formato do `--range`

```
--range=ADDRESS,LENGTH
--range=ADDRESS@PAGE,LENGTH
```

- **`ADDRESS`**: Endereço inicial em hexadecimal (com ou sem `0x`). Ex: `0x80000`.
- **`LENGTH`**: Número de bytes (ou words, dependendo do `--size`) a ler. Ex: `0x400` (1024 elementos).
- **`PAGE`**: Número de página de memória (relevante para arquiteturas de memória paginada como C2000).

**Exemplos de ranges:**
```
--range=0x0,0x1000          → Primeiros 4KB a partir do endereço 0x0
--range=0x80000,0x400       → 1024 bytes a partir de 0x80000
--range=0x3F8000@0,0x2000   → 8KB da página 0 a partir de 0x3F8000 (C2000)
```

### 10.3 Formato do `--size`

| Valor | Significado | Uso |
|:---:|:---|:---|
| `8` | Byte (8 bits) | Padrão. Correto para a maioria dos dispositivos ARM (CC13xx, CC26xx). |
| `16` | Word (16 bits) | **Obrigatório** para DSPs C2000 que têm memória endereçável por word de 16 bits. |
| `32` | DWord (32 bits) | Para dispositivos com endereçamento nativo de 32 bits. |

### 10.4 Formatos de Saída

| Formato | Flag | Descrição |
|:---|:---:|:---|
| **Binário** (padrão) | (sem flag) | Dados brutos em ordem de memória. Compatível com `dd`, `hexdump`, editores hex. |
| **COFF** | `--coff` | Preserva informações de seções, endereços e símbolos. Carregável em CCS ou ferramentas TI. Suporta múltiplos `--range`. |

### 10.5 Fluxo de Execução Detalhado

```
[Inicialização]
  │
  ├─ Valida que --range foi fornecido
  ├─ Exibe versão (se --verbose)
  ├─ Configura log
  ├─ Registra listeners
  ├─ Define timeout
  │
[Configuração e Conexão]
  │
  ├─ configure(@config@)
  ├─ switchToCore(@core@)
  ├─ logMessage("Connecting...") (se --verbose)
  ├─ targetState.connect()       → Conecta; NÃO executa run
  │
[Extração]
  │
  ├─ logMessage("Reading memory...") (se --verbose)
  ├─ memory.exportAsBin(@range@, @size@, @output@)   → Se NÃO --coff
  ├─ memory.exportAsCoff(@range@, @output@)          → Se --coff
  │
[Finalização]
  │
  ├─ switchToDebugger()
  ├─ waitForIdle()
  ├─ deConfigure()
  └─ logMessage("Success") (se --verbose)
```

### 10.6 Exemplos de Uso

```powershell
# Extrair 4KB de firmware ARM (CC2640) a partir de 0x0
dslite memory --config=cc2640.ccxml --range=0x0,0x1000 --output=firmware_dump.bin

# Extrair calibração armazenada na flash do TMS320F28375S (word de 16 bits)
dslite memory --config=TMS320F28375S.ccxml --range=0x80000,0x400 --size=16 --output=calibracao.bin

# Extrair múltiplas seções em formato COFF
dslite memory --config=alvo.ccxml --coff --range=0x0,0x8000 --range=0x80000,0x400 --output=snapshot.coff

# Backup completo com log de auditoria
dslite memory --config=alvo.ccxml --range=0x0,0x40000 --output=backup.bin --log=backup.log --verbose

# Extrair por página (C2000)
dslite memory --config=TMS320F28375S.ccxml --range=0x3F8000@0,0x2000 --size=16 --output=firmware_c2000.bin
```

---

## 11. Script: `identifyProbe.dsls`

**Arquivo:** `identifyProbe.dsls`
**Propósito:** Identificação física de sondas de debug conectadas ao PC, através do piscar dos LEDs da sonda.

### 11.1 Opções da Linha de Comando

| Opção longa | Atalho | Obrigatório | Padrão | Descrição |
|:---|:---:|:---:|:---:|:---|
| `--config` | `-c` | ✅ Sim | — | Arquivo `.ccxml` da sonda a identificar. |
| `--log` | `-g` | Não | (sem log) | Arquivo de log. Padrão é `true` (habilitado com arquivo auto-gerado). |
| `--conId` | `-i` | Não | `0` | ID de conexão. Em sistemas com múltiplas sondas, seleciona qual sonda específica piscar. |
| `--help` | `-h` | Não | — | Ajuda. |

### 11.2 Fluxo de Execução Detalhado

```
[Inicialização]
  │
  ├─ getVersion() → Exibe versão do DSLite
  ├─ logging.configure() → Configura log (habilitado por padrão com arquivo)
  │
[Identificação]
  │
  └─ blinkLEDs(@config@, @conId@)
        Envia comando USB para a sonda identificada pelo .ccxml.
        Os LEDs físicos da sonda (ex: o LED verde do XDS110) começam a piscar
        de forma diferente da operação normal, permitindo a identificação visual.
```

### 11.3 Exemplos de Uso

```powershell
# Identificar sonda padrão
dslite identifyProbe --config=minha_sonda.ccxml

# Identificar uma sonda específica em sistema com múltiplos XDS110
dslite identifyProbe --config=bancada_01.ccxml --conId=0
dslite identifyProbe --config=bancada_02.ccxml --conId=1
```

---

## 12. Script: `help.dsls`

**Arquivo:** `help.dsls`
**Propósito:** Exibe a lista de modos de operação disponíveis na instalação atual do DSLite.

### 12.1 Sem opções de linha de comando.

### 12.2 Saída Gerada

```
DSLite version X.X.X.XXXX

DSLite [operation] [Args...]

    load
        Loads the specified file and exits, leaving the
        target running

    flash
        Performs multiple flash-based operations as
        specified on the command line including
        erasing, loading, verifying, and device-
        specific flash operations

    memory
        Extracts memory from the target into a coff or
        binary file

    identifyProbe
        Identify a connected debug probe

    help
        Prints this message
```

### 12.3 Uso

```powershell
dslite help
```

---

## 13. Índice de Todos os Comandos Internos DSLite

Esta seção documenta todos os comandos `"command"` encontrados nos scripts da pasta.

### Comandos de Definição de Interface

| Comando | Descrição |
|:---|:---|
| `defineOption` | Declara uma opção de linha de comando que aceita valor. |
| `defineValuelessOption` | Declara uma flag booleana (sem valor). |
| `defineDefaultOption` | Declara opção com valor padrão explícito. |
| `defineMultiTokenOption` | Declara opção que pode ser repetida múltiplas vezes. |
| `defineUsage` | Define a string de uso exibida com `--help`. |
| `acceptTrailingOperand` | Permite capturar arquivos passados sem flag como `@operands@`. |
| `parseCommandLine` | Processa a linha de comando com base nas definições anteriores. |
| `verifySomeOptionsSupplied` | Aborta com erro se nenhuma das opções listadas foi fornecida. |

### Comandos de Sistema e Log

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `getVersion` | — | Obtém a versão do DSLite. Usado com `log` para exibir. |
| `logging.configure` | `[enabled, filepath]` | Configura log detalhado em arquivo. |
| `logMessage` | `[mensagem]` | Imprime mensagem literal no console. |
| `logEvent` | `[eventName, formato, campos]` | Registra listener de evento. Quando o evento ocorre, formata e imprime. |
| `logEventIf` | `[eventName, formato, campos, condições, valores]` | Igual ao `logEvent`, mas com condição de filtragem de campos. |
| `setTimeout` | `[segundos]` | Define timeout global para a operação inteira. |

### Comandos de Hardware e Debug

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `configure` | `[ccxml_path]` | Carrega o arquivo `.ccxml` e inicializa o DebugServer. |
| `deConfigure` | — | Encerra a sessão, libera a sonda. Sempre chamado ao final. |
| `switchToCore` | `[index]` | Seleciona o core ativo (0-based). |
| `switchToDebugger` | — | Muda o contexto para o Debugger (necessário antes de `loadSettingsFromFile`). |
| `listCores` | — | Lista os cores disponíveis na configuração. |
| `waitForIdle` | — | Bloqueia até todas as operações pendentes finalizarem. |
| `blinkLEDs` | `[ccxml, conId]` | Faz os LEDs da sonda piscarem para identificação. |

### Comandos de Conexão com Alvo

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `targetState.connect` | — | Conecta via JTAG/SWD/cJTAG; coloca o processador em Halt. |
| `targetState.disconnect` | — | Encerra a sessão de debug; libera o target. |
| `targetState.run` | `[waitForRunState]` | Inicia a execução do firmware no target. `true` = aguarda o estado de "running". |
| `targetState.resetCLI` | `[tipo]` | Executa reset do tipo especificado. |
| `targetState.getResetsCLI` | — | Retorna a lista de tipos de reset disponíveis formatada como string. |

### Comandos de Configuração do Debugger

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `settings.set` | `[objeto ou string]` | Define configurações no contexto atual (core). |
| `settings.setCLI` | `[objeto ou array de strings]` | Define configurações no modo CLI; suporta expansão de `@setting...@`. |
| `settings.getSettingsAsFormattedString` | `[regex]` | Retorna settings que casam com a regex como string formatada. |
| `debuggerSettings.loadSettingsFromFile` | `[filepath]` | Aplica arquivo de configuração salvo pelo UniFlash. Contexto: Debugger. |

### Comandos de Flash

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `flash.performOperation` | `[operação]` | Executa uma operação nomeada de flash (ex: `Erase`, `BlankCheck`, `Verify`, `ProgramBANKMGMT`). |
| `flash.listSupportedOperations` | — | Retorna lista de operações de flash suportadas pelo alvo. |

### Comandos de Programação de Símbolos

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `symbols.loadProgramOnly` | `[arquivo(s)]` | Grava o arquivo (`.out`/`.bin`) na memória. Não baixa informações de debug. |
| `symbols.verifyProgram` | `[arquivo(s)]` | Lê a memória e compara com o arquivo local. Falha se diferente. |

### Comandos de Memória

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `memory.exportAsBin` | `[range, size, output]` | Extrai memória e salva como arquivo binário puro. |
| `memory.exportAsCoff` | `[range, output]` | Extrai memória e salva no formato COFF (com metadados de seções). |

### Comandos de Expressões GEL

| Comando | Argumentos | Descrição |
|:---|:---|:---|
| `expressions.evaluate` | `[expressão]` | Avalia uma expressão GEL no contexto do target. |

**Funções GEL utilizadas:**

| Função GEL | Script | Descrição |
|:---|:---|:---|
| `MassErase()` | `cc13xx-cc26xx-mass-erase.dsls` | Apaga todos os setores de flash, incluindo CCFG. Desbloqueia o debug. |
| `ChipErase()` | `cc23xx-unlock-debug-access.dsls` | Apagamento via comando ROM. Desbloqueia o debug em CC23xx. |
| `Device_Reset_XRSn()` | `f29Flash.dsls` | Aplica pulso no pino XRSn do C2000, forçando Power-On-Reset. |
| `GEL_CLI_ListCommands()` | `flash.dsls`, `f29Flash.dsls` | Lista todos os comandos GEL disponíveis no alvo. |
| `GEL_CLI_<comando>()` | `flash.dsls`, `noConnectFlash.dsls` | Executa o comando GEL cujo nome é passado via `--post-flash-device-cmd`. |

---

## 14. Referência de Variáveis de Template

| Template | Tipo | Disponível em | Significado |
|:---|:---:|:---|:---|
| `@config@` | string | Todos | Valor de `--config` |
| `@debugProbe@` | string | `cc13xx-mass-erase` | Valor de `--debugProbe` |
| `@not_debugProbe@` | bool | `cc13xx-mass-erase` | Verdadeiro se `--debugProbe` não foi passado |
| `@not_config@` | bool | `cc13xx-mass-erase` | Verdadeiro se `--config` não foi passado |
| `@core@` | int | Flash, Load, Memory | Valor de `--core` (padrão: 0) |
| `@operands@` | array | Flash, Load, Serial | Arquivos passados como argumentos finais |
| `@not_operands@` | bool | Load | Verdadeiro se nenhum operando foi passado |
| `@file@` | string | Load | Valor de `--file` |
| `@not_flash@` | bool | Flash, noConnectFlash | Verdadeiro se `--flash` não foi passado |
| `@not_verify@` | bool | Flash, noConnectFlash | Verdadeiro se `--verify` não foi passado |
| `@flash@` | bool | Flash, Serial | Verdadeiro se `--flash` foi passado |
| `@verify@` | bool | Flash, noConnectFlash | Verdadeiro se `--verify` foi passado |
| `@run@` | bool | Flash, Load, noConnectFlash | Verdadeiro se `--run` foi passado |
| `@verbose@` | bool | Todos | Verdadeiro se `--verbose` foi passado |
| `@before...@` | array | Flash, Serial, noConnectFlash | Expansão de todas as ocorrências de `--before` |
| `@after...@` | array | Flash, Serial, f29Flash | Expansão de todas as ocorrências de `--after` |
| `@setting...@` | array | Flash, Serial, noConnectFlash | Expansão de todas as ocorrências de `--setting` |
| `@load-settings@` | string | Flash, Serial, f29Flash | Valor de `--load-settings` |
| `@list-settings@` | string\|bool | Flash, Serial | Valor (regex) de `--list-settings` |
| `@list-ops@` | bool | Flash, Serial | Verdadeiro se `--list-ops` foi passado |
| `@list-cores@` | bool | Flash, f29Flash | Verdadeiro se `--list-cores` foi passado |
| `@list-device-cmds@` | bool | Flash, f29Flash | Verdadeiro se `--list-device-cmds` foi passado |
| `@list-resets@` | bool | Flash, f29Flash, noConnectFlash | Verdadeiro se `--list-resets` foi passado |
| `@reset@` | string | Flash, f29Flash, noConnectFlash | Valor de `--reset` |
| `@post-flash-device-cmd@` | string | Flash, f29Flash, noConnectFlash | Valor de `--post-flash-device-cmd` |
| `@timeout@` | int\|false | Flash, Load, Memory, f29Flash | Valor de `--timeout` |
| `@log@` | string\|false | Todos | Valor de `--log` |
| `@output@` | string | Memory | Valor de `--output` |
| `@range@` | array | Memory | Expansão de `--range` |
| `@size@` | int | Memory | Valor de `--size` (padrão: 8) |
| `@not_coff@` | bool | Memory | Verdadeiro se `--coff` NÃO foi passado |
| `@coff@` | bool | Memory | Verdadeiro se `--coff` foi passado |
| `@conId@` | int | identifyProbe | Valor de `--conId` (padrão: 0) |
| `@baseDir@` | string | cc13xx-mass-erase | Diretório base de instalação dos scripts |

---

## 15. Tabela Comparativa de Scripts

| Funcionalidade | `flash` | `f29Flash` | `load` | `noConnectFlash` | `serial` | `memory` |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `targetState.connect` | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `symbols.loadProgramOnly` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `symbols.verifyProgram` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `targetState.run` | Cond. | Cond. | ✅ (sempre) | Cond. | ❌ | ❌ |
| `flash.performOperation` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `ProgramBANKMGMT` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `Device_Reset_XRSn()` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Disconnect/Reconnect | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `memory.exportAsBin` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `--verify` disponível | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `--run` disponível | ✅ | ✅ | N/A | ✅ | ❌ | ❌ |
| `--timeout` disponível | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `--before/--after` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

---

## 16. Guia de Uso por Cenário

### 16.1 Linha de Produção — Gravação de Firmware Novo

```powershell
# 1. Apagar, gravar e verificar
dslite flash --config=TMS320F28375S.ccxml --before=Erase --verify --verbose firmware_cliente.out

# 2. Gravar número de série logo após
dslite serial --config=TMS320F28375S.ccxml --before=Erase numeros_serie.out
```

### 16.2 Desenvolvimento — Iteração Rápida

```powershell
# Testar nova versão de firmware sem apagamento (mais rápido)
dslite load --config=TMS320F28375S.ccxml firmware_debug.out
```

### 16.3 Campo — Recuperação de Placa Bloqueada (CC13xx/CC26xx)

```powershell
# Passo 1: Desbloquear o chip
dslite cc13xx-cc26xx-mass-erase -d XDS110

# Passo 2: Regravar o firmware de campo
dslite flash --config=xds110_cc2640.ccxml --before=Erase --verify --run firmware_campo.out
```

### 16.4 Campo — Recuperação de Placa Bloqueada (CC23xx)

```powershell
# Passo 1: Desbloquear o chip
dslite cc23xx-unlock-debug-access --config=CC2340R5.ccxml

# Passo 2: Regravar
dslite flash --config=CC2340R5.ccxml --before=Erase --verify --run firmware_campo.out
```

### 16.5 Placa C2000 (TMS320F28375S) — Gravação Completa

```powershell
# Usar o script especializado para C2000
dslite f29Flash --config=TMS320F28375S.ccxml --timeout=120 --verify --run firmware.out
```

### 16.6 Auditoria — Backup de Calibração da Placa

```powershell
# Extrair 1KB da zona de calibração (endereço hipotético 0x80000)
dslite memory --config=TMS320F28375S.ccxml --range=0x80000,0x400 --size=16 \
              --output=calibracao_sn12345.bin --verbose
```

### 16.7 Diagnóstico — Identificar Sonda Correta em Bancada

```powershell
# Piscar LED da sonda associada ao .ccxml passado
dslite identifyProbe --config=bancada_01.ccxml
```

### 16.8 Chip Travado — Tentativa de Gravação Forçada

```powershell
# Quando o connect formal falha, tentar noConnectFlash
dslite noConnectFlash --config=TMS320F28375S.ccxml --before=Erase --verbose firmware.out
```

---

*Documentação gerada para o projeto Calibrador TPS125 — Plataforma TI DSLite.*
*Baseada na análise direta dos scripts `.dsls` localizados em `TPS 125\ccs_base\DebugServer\scripts\`.*
