# Plano de implementação — Calibrador TPS/SCR

Status: itens 1 a 6 concluídos em software na branch `fix/calibracao-e-recuperacao-gravacao`.
As conclusões abaixo são de software; ensaios no equipamento estão separados e não foram executados.

| Item | Estado |
| --- | --- |
| 1 — Números de série | Concluído em software: precisão, confirmação parcial e timeout aprovados em host; bancada pendente |
| 2 — Telemetria e relés | Concluído em software: sequência, cancelamento e desligamento não confirmado aprovados em host; bancada pendente |
| 3 — Wi-Fi/NVS | Concluído em software: validação, falha de commit e migração aprovadas em host; bancada pendente |
| 4 — Recuperação da gravação | Concluído em software: 13 testes Python e 8 testes da interface aprovados; bancada pendente |
| 5 — Abertura da ponte | Concluído em software: novo clique escolhido pelo usuário; 11 testes da interface aprovados |
| 6 — Publicação web | Concluído em software: 6 testes de publicação aprovados e validação UNC realizada |

## Objetivo e prioridade

Corrigir os seis pontos da análise, incluindo os problemas relatados de tela presa após erro de gravação e DSLite que permanece aberto. Priorizar recuperação da gravação (item 4). A abertura da ponte (item 5) foi implementada com novo clique obrigatório para iniciar a gravação.

## Diagnóstico da gravação

Evidências em `WEB/src/App.tsx`:

- Fechar, cancelar e Escape dependem de `isFlashing` ser falso.
- Falhas ao consultar progresso apenas exibem “Conectando ao Bridge Local...”, sem prazo final.
- Erros recebidos normalmente liberam a tela, mas resultado e log desaparecem porque só são renderizados enquanto `isFlashing` é verdadeiro.

Evidências em `TEKSEA_BRIDGE/teksea_bridge.py`:

- `run_flash` lê stdout até EOF e depois chama `process.wait()`, sem limite de duração. Um processo ou filho que mantenha o pipe aberto pode impedir a publicação do resultado final.
- Não há cancelamento nem limpeza garantida da árvore de processos em `finally`.
- Cada pedido de flash inicia outra thread, sem exclusão mútua.
- O watchdog considera status diferente de `Idle` com progresso inferior a 100 como gravação ativa, inclusive após falha concluída.

Esses são caminhos identificados no código, não uma reprodução do erro específico. Confirmar em bancada quais processos ficam abertos e qual a última mensagem emitida.

## 1. Preservar números de série

Arquivos: `src/web_server.c`, `src/can_protocol.c`, `include/can_protocol.h`, `WEB/src/App.tsx`.

1. Remover a conversão intermediária para `float`. Usar `double` na interface de escrita e converter para o tipo final conforme o formato CAN.
2. Validar tipo, faixa e integralidade antes de converter números de série para `uint32_t`. Converter para `float` apenas no formato float32.
3. Preservar identificadores, bitfields e ordem dos bytes do protocolo.
4. Tratar falha de envio; consultar os registradores 128 e 129 e correlacionar respostas posteriores à escrita com a operação pendente.
5. Incrementar o próximo número apenas quando ambos os valores forem confirmados. Em falha parcial, divergência ou timeout, manter o número e mostrar quais gravações foram confirmadas.

Aceitação: `16777217`, `202600001` e limites permitidos sem perda de precisão; rejeição de frações e valores fora da faixa; resposta antiga ou confirmação parcial não incrementa o número.

## 2. Separar telemetria, relés e publicação de estado

Arquivos: `src/main.c`, `src/web_server.c`, `WEB/src/lib/useWebSocket.ts` e controles relacionados na interface.

1. Agendar independentemente consulta CAN, teste de relés, atualização WebSocket, verificação do link e LED.
2. Não zerar continuamente `step` durante o teste. Desligar telemetria suspende consultas periódicas, mantendo publicação e controles funcionando.
3. Atualizar o link antes de publicar o estado e alinhar o timeout documentado com o implementado.
4. Implementar término e cancelamento do teste com solicitação de desligamento das saídas. Se o CAN falhar, indicar desligamento não confirmado, sem presumir que o estado físico acompanhou uma variável local.
5. Alinhar o watchdog do navegador à publicação e cancelar temporizadores de reconexão ao desmontar a conexão.

Aceitação: teste completo sem queda da interface; telemetria desativada e reativada; cancelamento; perda de CAN/WebSocket; indicação de saída cujo desligamento não pôde ser confirmado.

## 3. Validar configuração Wi-Fi e persistência

Arquivos: `src/web_server.c`, `include/ihm_state.h`, `src/ihm_state.c`, `src/wifi_manager.c`, `WEB/src/App.tsx`.

1. Validar tipos JSON, comprimentos em bytes, endereços e coerência de IP, gateway e máscara.
2. Preparar a configuração em estrutura temporária, garantindo terminação nula das strings internas e respeitando os limites do driver.
3. Se a estrutura persistida mudar, versionar/migrar o blob NVS e verificar seu tamanho na leitura.
4. Tratar erros de abertura, escrita e commit. Somente confirmar sucesso e substituir o estado em memória após persistência bem-sucedida.
5. Mostrar o erro na interface e preservar a configuração anterior quando a entrada for inválida.

Aceitação: campos ausentes, tipos incorretos, comprimentos máximos, endereços inválidos, falha de persistência, migração e reinício com configuração válida.

## 4. Recuperação de erros e controle do DSLite

Implementação concluída em software: `flash_controller.py` supervisiona o processo e seus filhos em Job Object; um worker só cria o DSLite após associação ao Job. Timeout padrão de 300 s, configurável entre 30 e 3600 s. Cancelamento e timeout encerram a árvore, e falha de limpeza bloqueia nova tentativa. A interface preserva resultado/log, permite fechar em erro ou estado desconhecido e recupera o estado da ponte. O script de encerramento deixou de matar todos os processos pythonw.

Validação executada: 7 testes reais de processos Windows, 6 testes HTTP sem Microsoft/hardware e 8 testes de estado da interface; checagem TypeScript aprovada. Compatibilidade com o DSLite físico e calibração do timeout ainda exigem bancada. Não há detecção genérica pela palavra “error”: usa-se código de saída e timeout, até existirem mensagens fatais comprovadas.

Arquivos principais: `TEKSEA_BRIDGE/teksea_bridge.py`, `TEKSEA_BRIDGE/flash_controller.py`, `WEB/src/lib/useFlashController.ts` e `WEB/src/App.tsx`. O encerramento por `kill_bridge.bat` agora usa a API local com cancelamento identificado.

### 4.1 Operação identificada e exclusiva

1. Criar identificador único por operação e registrar produto, variante, estado, horários, progresso, log limitado, código de saída e presença de processo ativo.
2. Definir estados `preparing`, `running`, `cancelling`, `succeeded`, `failed`, `cancelled`, `timed_out`. A disponibilidade para nova gravação deve depender da limpeza confirmada dos processos, não apenas do nome do estado ou da porcentagem.
3. Reservar a operação antes de iniciar sua thread e proteger atualizações com sincronização. Rejeitar nova gravação concorrente com HTTP 409.
4. Alterar início para `POST /tms/flash`, validar produto, variante, executável, configuração e firmware. Identificar o arquivo exato; não selecionar silenciosamente outro por busca ambígua.
5. Consultar progresso por operação e implementar `POST /tms/cancel` com seu identificador. Cancelamento repetido não pode atingir uma gravação posterior.
6. Restringir e validar origens permitidas nas operações de alteração, considerando ESP32 e desenvolvimento. Definir a configuração de origens e proteção de acesso local durante a implementação.

### 4.2 Supervisão e limpeza de processos

1. Rastrear processo e filhos por operação, mantendo execução sem janela.
2. Separar leitura do log da supervisão. A verificação de timeout e cancelamento deve funcionar mesmo sem novas linhas ou com stdout aberto indefinidamente.
3. Definir timeout total configurável com base no tempo medido em bancada. Silêncio no log, isoladamente, não deve encerrar uma gravação legítima.
4. Reconhecer falhas pelo código de saída e por mensagens fatais comprovadas. Não considerar qualquer ocorrência da palavra “error” como motivo para matar o processo.
5. Preferir contenção da árvore em Windows Job Object com encerramento ao fechar. Validar associação antes de permitir criação de filhos, usando criação suspensa/retomada se necessário. Confirmar compatibilidade com o DSLite instalado.
6. Em cancelamento, timeout, exceção ou erro fatal confirmado, tentar encerramento controlado quando suportado; após prazo limitado, encerrar forçadamente somente os processos pertencentes à operação.
7. Executar limpeza em `finally`: fechar streams e handles, aguardar com prazo limitado e verificar remanescentes, inclusive filhos quando o processo principal já terminou.
8. Não usar encerramento global por nome de imagem (`DSLite.exe` ou `pythonw.exe`). Preservar outras ferramentas TI e outros programas Python.
9. Se a limpeza falhar, publicar erro específico e manter nova gravação bloqueada. Permitir fechar a tela, mas liberar exclusividade apenas após comprovar encerramento.
10. Fazer o watchdog da ponte consultar operações/processos realmente ativos. Erro concluído não mantém a ponte viva indefinidamente. Perda do heartbeat do navegador, por si só, não cancela gravação legítima.

### 4.3 Tela recuperável

1. Separar preparação, gravação, cancelamento, resultado final e perda de comunicação. Não representar todos esses casos apenas por `isFlashing`.
2. Preservar mensagem e log após sucesso, erro, cancelamento ou timeout.
3. Disponibilizar “Fechar” nos resultados finais. “Tentar novamente” somente após confirmar que a ponte está livre.
4. Disponibilizar “Cancelar gravação” durante execução, com confirmação de que a interrupção pode exigir regravar o equipamento. Exibir “Encerrando...” enquanto aguarda limpeza.
5. Quando a ponte ficar inacessível, permitir “Fechar tela” com “Estado da gravação desconhecido”. Fechar não significa cancelar; bloquear nova tentativa até reconciliar o estado com a ponte.
6. Limitar duração das requisições, validar HTTP/JSON e consultar progresso sequencialmente, evitando sobreposição. Ignorar respostas atrasadas de outra operação.
7. Se a resposta ao início se perder, consultar o identificador da operação antes de reenviar: a gravação pode já ter começado.
8. Ao reabrir o modal ou recarregar a página, recuperar operação ativa e último resultado, sem iniciar automaticamente outra gravação.

### 4.4 Aceitação

- Erro reconhecido mantém log visível e permite fechar sem recarregar a página.
- DSLite travado atinge timeout, sua árvore é encerrada e o resultado aparece.
- Cancelamento afeta somente a operação selecionada.
- Nova tentativa só é liberada após limpeza confirmada.
- Falha de comunicação não prende o usuário na tela nem aparece como sucesso ou cancelamento confirmado.
- Duas abas ou cliques repetidos não iniciam dois gravadores.
- Falha de limpeza é indicada e não libera disputa pelo hardware.
- Falhas normais não exigem intervenção no Gerenciador de Tarefas.

## 5. Abertura da ponte — concluído em software

Decisão do usuário: após abrir a ponte, exigir novo clique no firmware desejado para gravar.

Implementado em `WEB/src/lib/useFlashController.ts` e `WEB/src/App.tsx`:

1. Ao abrir a tela de gravação, consultar a ponte. Se não responder, solicitar abertura por `teksea://start` uma única vez.
2. Aguardar até 15 segundos, orientando o operador a autorizar a abertura no navegador. Consultar o estado da operação antes de liberar os controles.
3. Quando a ponte estiver pronta e livre, mostrar “Ponte pronta. Clique no firmware desejado para iniciar a gravação.” Atualizar a disponibilidade dos firmwares.
4. Iniciar a gravação somente no novo clique. Não guardar nem reenviar automaticamente um pedido de gravação.
5. Se a ponte não responder no prazo, mostrar orientação sobre instalação/permissão e permitir tentar abrir novamente ou fechar a tela.
6. Se houver gravação ativa ou limpeza não confirmada, manter novo início bloqueado. Resposta perdida de uma solicitação de gravação não dispara abertura nem repetição automática.
7. Remover o iframe que tentava abrir a ponte ao carregar a página; a abertura acompanha a tela de gravação.

Validação: os 11 testes da interface passaram, incluindo abertura única/novo clique, timeout com nova tentativa e recuperação de operação ativa. Checagem TypeScript e build web aprovados. A abertura real do protocolo e a permissão do navegador ainda precisam ser verificadas na estação de bancada.

## 6. Publicação recuperável dos arquivos web

Concluído: preparação em `prepare_web_data.ps1` com validação de assets, hashes da cópia, backup e restauração. A opção filesystem utiliza `data` existente. O batch valida erros e aceita caminhos UNC por `pushd`. Testes aprovados: build ausente, asset ausente, falha de cópia, falha na troca com restauração, sucesso com backup e filesystem sem build. Validação por caminho UNC também aprovada. Nenhum upload foi realizado.

Arquivo: `build_and_upload.bat`.

1. Resolver e validar o diretório do projeto, inclusive UNC; verificar falhas ao mudar de pasta e trabalhar com caminhos explícitos.
2. Validar `WEB/dist/index.html` e assets antes de substituir arquivos.
3. Copiar para pasta temporária dentro do projeto e verificar o resultado.
4. Manter `data` anterior como backup até concluir a troca; restaurar se a substituição falhar.
5. Propagar erros de build/cópia/preparação e impedir upload em caso de falha.
6. Fazer “apenas filesystem” usar `data` existente sem sincronização com `WEB/dist`.
7. Validar capacidade SPIFFS durante geração. Backup local protege os arquivos, mas não torna atômica a gravação física da flash.

Aceitação: build/asset ausente, cópia interrompida, execução por UNC, pasta temporária incompleta e opção filesystem sem novo build.

## Sequência de implementação e testes

1. Criar branch e preservar arquivos locais não rastreados, inclusive `TEKSEA_BRIDGE/LEIAME.txt` e `data/Thumbs.db`.
2. Registrar uma reprodução controlada do erro DSLite: processo principal, filhos, última mensagem e código de saída.
3. Priorizar item 4: contrato, exclusividade, supervisão/limpeza e recuperação da tela, em commits revisáveis.
4. Implementar itens 1, 2, 3 e 6 separadamente. Item 5 implementado após escolha de novo clique pelo usuário.
5. Testar o controlador com processo simulado: sucesso, saída não zero, silêncio, travamento, filho sobrevivente, exceção após início, cancelamento e falha de limpeza. Isolar serviços Microsoft desses testes.
6. Testar a interface com ponte simulada: indisponibilidade, resposta perdida/inválida/atrasada, fechamento e reabertura, cancelamento e concorrência.
7. Compilar firmware e interface; verificar sintaxe e executar testes da ponte.
8. Validar em bancada DSLite real, limites de duração, regravação após falha, números de série, relés e persistência Wi-Fi.
9. Revisar critérios, diffs e logs antes de publicar ou atualizar equipamentos, conforme autorização da implementação.

## Limites

Por decisão operacional de 9 de setembro de 2026, a validação de origem HTTP do
TEKSEA Bridge foi comentada. A ponte responde a qualquer origem enquanto essa
configuração permanecer desativada. O código anterior foi preservado em
`TEKSEA_BRIDGE/teksea_bridge.py` para permitir reativação futura.

As correções de firmware, interface, ponte e publicação foram implementadas. Passaram os testes de host, os 13 testes da ponte, os 11 testes da interface, os 6 testes de publicação, a checagem TypeScript e os builds de produção web, ESP32 e SPIFFS. Os arquivos foram integrados ao projeto com conferência de hashes; a publicação anterior de `data` foi preservada em `.data-backup-5dda9f1cd4d94e9ab9c7dd217d08bcb5`. Os arquivos locais `TEKSEA_BRIDGE/LEIAME.txt` e `data/Thumbs.db` foram preservados. A plataforma foi fixada em espressif32@6.13.0 para compatibilidade com o sdkconfig ESP-IDF 5.5.3 existente.

O travamento original não foi reproduzido em hardware. Os tempos de supervisão, a compatibilidade do DSLite com Job Object, a temporização CAN e as saídas físicas precisam de bancada, conforme `test/VALIDACAO.md`. Nenhum equipamento foi gravado e nenhuma alteração foi enviada ao GitHub. O item 5 foi concluído com novo clique obrigatório, conforme decisão do usuário.
