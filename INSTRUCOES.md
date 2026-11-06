# Instruções para criar um descritivo técnico de software

## Como utilizar

Copie este arquivo para a pasta do projeto ou para a subpasta Descritivo. No Codex, abra a pasta do projeto e solicite:

> Leia o arquivo INSTRUCOES_DESCRITIVO_SOFTWARE.md e execute suas instruções para este projeto.

Este arquivo deve ser explicitamente indicado ao Codex. O nome deste arquivo não garante leitura automática.

## Tarefa

Analise o projeto em que este arquivo foi colocado e crie um descritivo técnico e funcional do software em formato Word, destinado a apoiar um processo de certificação. Execute o trabalho até salvar e conferir o documento final; não se limite a propor um plano.

Se este arquivo estiver em Descritivo, considere a pasta imediatamente superior como raiz do projeto. Se estiver na raiz, use essa raiz. Salve o resultado na subpasta Descritivo, criando-a quando necessário.

O arquivo final deve se chamar Descritivo_<Nome_Do_Software>.docx. Use o nome oficial do produto identificado no projeto, substituindo espaços por sublinhados e removendo caracteres inválidos para nomes de arquivo. Exemplo: Descritivo_CoreLink_Horizon.docx.

## Preferências do documento

- Escreva em português do Brasil, com linguagem técnica, formal, clara e objetiva.
- Produza um documento compacto, preferencialmente de 4 a 6 páginas, incluindo as imagens. Ajuste a extensão quando a quantidade de telas ou a complexidade exigir, sem comprometer a legibilidade.
- Dê destaque à arquitetura, às interfaces de software, aos procedimentos de uso e às telas.
- Descreva o funcionamento efetivamente implementado. Este documento é um descritivo do produto, não uma revisão de código nem uma lista de recomendações de melhoria.
- Não invente funcionalidades, precisão, desempenho, resultados de testes, conformidade com normas, certificações ou aprovações.
- Não afirme que o software foi certificado. A finalidade do documento é apoiar sua identificação e descrição no processo de certificação.
- Caso o usuário informe órgão, norma ou modelo obrigatório, adapte o documento às exigências fornecidas. Não presuma uma norma específica.

## Levantamento do projeto

1. Leia as instruções aplicáveis do repositório, como AGENTS.md, e utilize a habilidade de documentos disponível no ambiente.
2. Identifique o nome do produto, a finalidade, os usuários previstos e os cenários de aplicação a partir do código e da documentação.
3. Examine README, manuais, documentos técnicos, configurações e módulos principais. Evite inspecionar dependências vendorizadas e arquivos gerados sem necessidade.
4. Identifique os componentes, suas responsabilidades e o fluxo de informações entre interface, backend, serviços, armazenamento e equipamentos externos, quando existirem.
5. Confira as interfaces relevantes: APIs, protocolos, endpoints, portas, formatos de arquivos, integrações, autenticação e comunicação em tempo real. Inclua somente detalhes úteis para compreender o produto.
6. Identifique perfis, modos de operação, parâmetros, requisitos de execução e sequência de uso.
7. Quando houver divergência entre documentação e código, descreva o comportamento implementado. Explicite condições ou limitações que alterem a operação, sem transformar o descritivo em auditoria.
8. Não modifique o código do projeto. Não inicie o software, conecte a equipamentos, altere configurações externas ou execute rotinas com efeitos reais apenas para redigir o documento. Prefira inspeção estática.

## Imagens obrigatórias

- Procure prints e imagens da interface na pasta Descritivo. Se não houver, procure uma pasta claramente destinada a telas ou evidências visuais do projeto.
- Abra e examine todas as imagens antes de escrever suas descrições.
- Incorpore efetivamente os prints encontrados no arquivo Word. Não substitua as imagens por links, nomes de arquivo ou espaços reservados.
- Utilize todos os prints fornecidos pelo usuário para esta finalidade. Se houver uma coleção extensa ou imagens sem relação com a interface, peça orientação somente quando a seleção for material para o resultado.
- Preserve o conteúdo, a proporção e a resolução das imagens. Não redesenhe telas nem gere prints fictícios.
- Identifique cada figura pelo perfil, modo ou função que aparece na captura e acrescente uma legenda e uma explicação breve dos elementos relevantes.
- Diferencie conexão ao backend, conexão ao equipamento, valores simulados e valores recebidos, quando essas distinções existirem.
- Não apresente uma captura de tela como prova de execução de um ensaio ou de conformidade.
- Utilize páginas horizontais para telas largas quando isso melhorar a leitura. Evite reduzir imagens a ponto de tornar os campos ilegíveis.
- Se não houver imagens, continue com as partes independentes e solicite ao usuário os prints necessários. Não invente evidências visuais.

## Estrutura sugerida

Adapte os títulos ao projeto. Omita seções sem aplicação e evite repetir informações.

### Identificação e finalidade

Título com o nome oficial do software, descrição técnica e funcional, revisão documental e data de elaboração. Apresente a finalidade, o contexto de aplicação e o escopo do documento. Não invente uma versão do produto; diferencie revisão documental de versão do software.

### Arquitetura e fluxo de informações

Explique a organização da aplicação e o caminho dos dados. Use uma tabela compacta de componentes e responsabilidades quando facilitar a leitura. Descreva os serviços em segundo plano e suas relações com a interface.

### Perfis ou modos disponíveis

Apresente os perfis, modos, parâmetros e características que diferenciam as operações. Use tabelas somente quando houver itens comparáveis.

### Interfaces de software e comunicação

Descreva protocolos, APIs, integrações, importações, exportações e comunicação com equipamentos. Informe endereços e portas padrão somente quando confirmados no projeto. Distinga serviço oferecido pelo software de cliente que acessa um serviço externo.

Descreva comportamentos automáticos relevantes, como sincronização, alteração de configurações, persistência, monitoramento e encerramento. Esclareça quais serviços permanecem ativos após parar uma operação quando isso afetar o uso.

### Procedimento de utilização

Apresente uma sequência numerada e prática: preparar o ambiente, abrir a aplicação, selecionar o modo, configurar interfaces, iniciar, acompanhar, parar e encerrar. Utilize os nomes reais dos controles da interface. Não atribua ações ao usuário que a interface não oferece.

### Telas do software

Inclua as imagens com numeração, identificação e descrição. Relacione cada tela às funcionalidades descritas. Registre o estado visível na captura quando necessário para interpretar campos zerados, indisponíveis ou desconectados.

### Referências documentais

Identifique brevemente os arquivos técnicos e materiais do próprio projeto utilizados. Evite expor caminhos pessoais completos, credenciais ou dados sensíveis. Não inclua resultados da análise interna nem referências inventadas.

## Diagramação e verificação

- Utilize estilos de título e cabeçalhos, fonte profissional e hierarquia consistente.
- Mantenha os títulos em preto, sem linhas decorativas, e use espaçamento suficiente entre parágrafos e tabelas.
- Nas tabelas, defina larguras adequadas, bordas discretas, cabeçalhos legíveis e células sem texto cortado.
- Inclua paginação discreta. Evite capa isolada ou páginas quase vazias em um documento compacto.
- Mantenha figuras e respectivas legendas juntas. Ajuste orientação, margens e tamanho de imagem para preservar a leitura.
- Gere o DOCX com as ferramentas disponíveis para documentos e siga o fluxo de renderização e conferência visual da habilidade aplicável.
- Renderize o documento e examine todas as páginas. Corrija sobreposição, cortes, quebras ruins, caracteres ausentes e imagens ilegíveis; repita a conferência após ajustes.
- Se o renderizador padrão estiver indisponível, diagnostique a falha e use uma alternativa permitida no ambiente. Caso não seja possível conferir visualmente, informe essa limitação ao usuário sem afirmar que a diagramação foi validada.
- Confira que todas as imagens previstas estão incorporadas e que o arquivo final abre como DOCX válido.
- Preserve arquivos existentes. Se o nome de saída já existir e o usuário não tiver autorizado substituição, salve uma nova revisão com sufixo _rev02, _rev03 e assim por diante.
- Salve somente os entregáveis solicitados em Descritivo. Mantenha scripts, PDFs e imagens de conferência em uma pasta temporária, salvo solicitação contrária.

## Autonomia e entrega

Use as preferências acima como padrão. Não repita perguntas sobre extensão, tom ou enfoque já definidos neste arquivo. Pergunte apenas por informações indispensáveis que não possam ser obtidas no projeto ou por exigências específicas informadas pelo usuário.

Ao concluir, informe de forma breve o nome e a localização do documento, a quantidade de páginas conferida e a inclusão dos prints. Forneça um link para o DOCX. Não altere o projeto nem inicie tarefas adicionais de correção, publicação ou certificação.
