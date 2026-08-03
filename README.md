# Patrimônio Ops Control

Sistema web de controle patrimonial para empresas que precisam saber **qual ativo existe, onde está, a qual núcleo pertence e quem responde por ele**. O projeto cobre importação de planilhas, cadastro, alocação, transferências, manutenção, divergências, baixa lógica, exportação e trilha de auditoria.

[![CI](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml/badge.svg)](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml)
[![Publicação](https://img.shields.io/badge/demonstra%C3%A7%C3%A3o-online-126044)](https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo/)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-3978c3.svg)](LICENSE)

**Demonstração pública:** [patrimonio-ops-control.kenjihidehira999.workers.dev/demo](https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo/)

## Problema comercial resolvido

Planilhas patrimoniais isoladas não registram bem responsabilidade, movimentações e exceções. O Patrimônio Ops importa o inventário existente, centraliza os ativos por núcleo e transforma cada alteração em um evento auditável, reduzindo retrabalho em inventários, integração de novos colaboradores, manutenção e desligamentos.

## Escopo funcional

- Patrimônios convencionais com 6 números, frotas no formato `número-da-frota.0` e referências internas distintas para itens ainda não etiquetados.
- Integração com a base Sabium do Gazin LOG, preservando código-base, incorporação, identificador de origem, grupo, filial e situação de baixa.
- Tipos controlados: CPU, monitores, cadeira, notebook, frota, automóvel, implemento rodoviário, componente de frota, equipamento, móvel, extintor, software e outros bens.
- Organização por núcleo, gestor, responsável e localização física.
- Diretório de colaboradores importados, inclusive quando não há patrimônio associado.
- Perfil editável do colaborador com nome, núcleo e relação de patrimônios vinculados.
- Busca por ID, série, modelo, pessoa, local ou núcleo.
- Leitura direta de etiquetas por bipador USB ou Bluetooth configurado como teclado HID, inclusive identificadores decimais do Sabium, com abertura automática do patrimônio em janela de conferência.
- Leitura de QR Code e código de barras pela câmera traseira ou por imagem enviada pelo operador.
- Geração de etiqueta QR única por ativo; no Sabium, o QR usa a chave técnica para distinguir incorporações que compartilham o mesmo identificador visível.
- Inventário cíclico por campanha, com escopo, conferência em lote, fila offline mínima e reconciliação de divergências.
- Termos de custódia com emissão, aceite ou recusa e histórico do responsável.
- Ordens de manutenção com prioridade, fornecedor, prazos, custos e evolução de status.
- Rastreamento por QR, código de barras, RFID UHF, BLE, UWB, GPS ou MDM, com cadastro de tags e ingestão de eventos de localização.
- Solicitações de compra, transferência, baixa, reparo e substituição com decisão auditável.
- Kits patrimoniais, reservas de equipamentos e recolhimento estruturado no desligamento de colaboradores.
- Arquivo privado de notas, garantias, fotos, laudos e contratos com checksum e acesso temporário assinado.
- Garantias, locações, seguros, licenças, depreciação, centro de custo e campos customizados; dados financeiros são restritos a administradores.
- Inspeções fotográficas com fila de análise, resultado estruturado e revisão humana obrigatória.
- Conectores de RH, ERP, MDM, chamados, IoT e diretório, com eventos idempotentes e fila de conciliação.
- Indicadores de utilização, capacidade ociosa, risco, cobertura documental e alertas de vencimento.
- Filtros de tipo, status e núcleo, com ordenação operacional.
- Visualizações rápidas para itens sem responsável, sem patrimônio, em manutenção ou com divergência.
- Paginação configurável para bases extensas, com 15, 25 ou 50 registros por página.
- Lista móvel dedicada e painel inferior de detalhes com abas de resumo e histórico.
- Cadastro de patrimônio e núcleo, além de edição de sigla, nome, localização e gestor do núcleo.
- Inventário dedicado por núcleo, com resumo, busca local e edição cadastral auditável de cada item.
- Transferência entre núcleos, locais e responsáveis.
- Alteração auditável do número patrimonial, inclusive para converter itens `Sem patrimônio` em identificadores oficiais.
- Status: disponível, em uso, manutenção, divergência e baixado.
- Baixa lógica, sem exclusão destrutiva do histórico.
- Auditoria com ator, data, origem, destino e motivo.
- Importação XLSX em duas etapas: pré-validação e confirmação transacional.
- Exportação XLSX com inventário, núcleos, auditoria e histórico de importações.
- Inventário e exportação operacional sem exposição de preço; dados contábeis ficam em área administrativa protegida.
- Ambientes isolados por departamento, com acesso individual, auditoria segregada, administração global e transferência auditável.
- Permissões independentes para consulta, alteração, importação e exportação.
- Desativação imediata, revogação de sessão e auditoria de login e administração.
- Aviso de privacidade, retenção técnica e runbooks de incidente e restauração.

## Tecnologias

- **Interface:** React 19, TypeScript e CSS responsivo organizado por domínio.
- **Aplicação:** Vinext/Vite com App Router e componentes funcionais.
- **API:** Node.js com manipuladores de rota TypeScript executados no Cloudflare Worker.
- **Banco:** Supabase Postgres 17, funções RPC transacionais e índices operacionais.
- **Integração:** Função Edge do Supabase com requisições HMAC, janela curta e nonce de uso único.
- **Documentos:** bucket privado no Supabase Storage, limite de 2,5 MB, checksum SHA-256 e URLs assinadas de curta duração.
- **Leitura móvel:** ZXing para câmera e imagem; IndexedDB somente para a fila mínima de conferências offline.
- **Autenticação:** Google OpenID Connect, PKCE, autorização por departamento e sessão `HttpOnly`.
- **Planilhas:** `read-excel-file` e `write-excel-file`.
- **Qualidade:** Node Test Runner, ESLint, TypeScript e GitHub Actions.

## Executar localmente

Pré-requisitos: Node.js 22.13+ e pnpm 10+.

```bash
pnpm install
cp configuracao.exemplo .env.local
pnpm dev
```

Use [`configuracao.exemplo`](configuracao.exemplo) somente como modelo para criar `.env.local`. Preencha as variáveis Supabase, do provedor de identidade e os segredos de sessão apenas no arquivo local, que é ignorado pelo Git. Acesse `http://localhost:5173/login`.

A rota `/demo` redireciona visitantes sem sessão diretamente para `/login`. O servidor valida `state`, PKCE e assinatura da identidade antes de consultar no Supabase se o usuário está ativo e quais departamentos pode acessar. A sessão local dura oito horas.

## Conectar um leitor de código de barras

O sistema aceita leitores USB ou Bluetooth no modo **HID Keyboard**, também chamado de **teclado**, **keyboard wedge** ou **USB HID**. Não é necessário instalar driver, extensão ou biblioteca no navegador.

1. Conecte o leitor ao computador por USB ou faça o pareamento Bluetooth.
2. No manual do equipamento, selecione o modo `HID Keyboard`.
3. Configure o sufixo de leitura como `Enter` ou `Tab`.
4. Teste no Bloco de Notas: ao bipar, o leitor deve escrever o identificador completo da etiqueta e avançar o cursor.
5. Entre no sistema e bipe a etiqueta em qualquer tela. O inventário será aberto, os filtros serão limpos e uma janela exibirá o patrimônio, responsável, núcleo, localização, modelo, série, histórico e status.

O sufixo `Enter` ou `Tab` continua recomendado para confirmar a leitura imediatamente. Como contingência, quando o leitor apenas preenche os seis números no campo de busca, o sistema abre a mesma janela assim que a API confirma uma correspondência patrimonial exata.

Na janela de conferência, um operador autenticado pode selecionar outro status e informar o motivo obrigatório. A alteração usa a mesma API transacional do painel, incrementa a revisão da base e registra o usuário na auditoria.

São aceitos patrimônios convencionais com seis dígitos, frotas no formato `número.0`, identificadores decimais vindos do Sabium e referências internas no formato `Sxxxxx`. A busca exige autenticação e não grava nem altera o patrimônio. Leitores configurados exclusivamente como porta `COM` ou serial não funcionam neste fluxo; nesses casos, é necessário identificar o fabricante e o modelo para integrar o protocolo específico.

## Ler etiquetas pela câmera

No módulo **Operações > Inventário cíclico**, selecione uma campanha ativa e use **Ler QR**. O navegador solicita acesso à câmera traseira; como contingência, o operador pode escolher uma imagem da etiqueta. O código reconhecido precisa conter um patrimônio convencional, uma frota, um identificador Sabium ou uma referência interna válida.

Quando a conexão estiver indisponível, a conferência pode ser mantida na fila offline. O navegador guarda somente departamento, campanha, identificador do ativo, resultado, local, observação e horário. Nomes, séries, modelos e documentos não são persistidos localmente. A sincronização em lote usa a revisão atual e remove da fila apenas os registros confirmados pelo servidor.

### Validação completa

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
```

## Configurar o login Google

No Google Cloud Console, crie um cliente OAuth do tipo Aplicativo da Web com a URL de retorno:

```text
https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/google/callback
```

Cadastre `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` como segredos. Usuários e departamentos autorizados são administrados no módulo **Ambientes**; cadastrar um usuário não autoriza automaticamente outras contas Gmail nem todo um domínio Google Workspace.

Depois de validar a identidade e o acesso persistido, o servidor cria uma sessão local assinada. Tokens de acesso e atualização do Google não são gravados no navegador nem no banco.

## Planilha-base

O importador aceita dois formatos:

1. Matriz operacional com blocos `Colaborador(a)`, `Núcleo`, `Máquina`, `Tela 1`, `Tela 2`, `Cadeira` e `Notebook`.
2. Arquivo plano exportado pelo próprio sistema, com uma linha por item.

### Preparar uma carga do Sabium

A carga patrimonial do Gazin LOG usa um utilitário administrativo separado do importador XLSX comum. Ele valida as 11 colunas da exportação Sabium, gera chave técnica e fingerprint determinísticos, classifica os tipos e pode dividir a saída em lotes:

```bash
pnpm prepare:sabium -- caminho/arquivo.xlsx work/sabium-normalizado.json 500 1
```

O quarto argumento é o tamanho opcional do lote e o quinto identifica a aba por número ou nome. O campo `rows` do JSON resultante é destinado à RPC protegida `patrimonio_import_sabium_assets`; essa função aceita somente `service_role`, grava exclusivamente no ambiente `gazin-log` e mantém os identificadores de origem imutáveis na interface.

Antes de gravar, a API reabre o XLSX no servidor, normaliza IDs de cinco dígitos com zero à esquerda, rejeita códigos fora do padrão e exclui todas as ocorrências duplicadas. A prévia retorna apenas contagens e posições dos problemas; nomes da planilha não são enviados ao navegador nessa etapa.

A carga inicial validada contém 361 itens e 10 núcleos, exclusivamente a partir da planilha corporativa. A quantidade de colaboradores não é fixa nem deriva da tabela auxiliar de perfis: ela é calculada em cada leitura pelos nomes distintos e não vazios no campo `Responsável` dos itens ativos, excluindo o marcador operacional `Reserva`. Desses itens iniciais, 319 possuem patrimônio oficial e 42 estão marcados como `Sem patrimônio`; estes recebem uma referência interna iniciada por `S`, aparecem como divergência e nunca são apresentados como número patrimonial. Doze ocorrências pertencentes a seis identificadores duplicados são rejeitadas e preservadas no histórico. Nove IDs de cinco dígitos recebem zero à esquerda. O valor `x` continua representando ausência de item.

A planilha corporativa original não faz parte do repositório. O arquivo [`data/seed.json`](data/seed.json) é usado somente pelos testes unitários das regras de domínio e não é importado pelo ambiente de execução nem publicado como base da interface.

## API

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| `GET` | `/api/state` | Obrigatória | Painel, inventário, operações, documentos, integrações, auditoria e sessão |
| `POST` | `/api/state` | Obrigatória | Mutações patrimoniais e dos módulos operacionais avançados |
| `POST` | `/api/documents` | Obrigatória | Validar e armazenar documento no bucket privado |
| `GET` | `/api/documents` | Obrigatória | Autorizar e redirecionar para uma URL assinada temporária |
| `POST` | `/api/import` | Obrigatória | Pré-validar ou confirmar importação XLSX |
| `GET` | `/api/export` | Obrigatória | Gerar cópia de segurança XLSX do ambiente empresarial |

Filtros, payloads e códigos de resposta estão em [`docs/api.md`](docs/api.md).

## Documentação do projeto

- [`docs/contexto-projeto.md`](docs/contexto-projeto.md): objetivo, regras de negócio, arquitetura, segurança, fontes de dados, decisões e pendências.
- [`docs/arquitetura.md`](docs/arquitetura.md): componentes, banco, integrações e decisões arquiteturais.
- [`docs/api.md`](docs/api.md): contratos HTTP, comandos e códigos de resposta.
- [`docs/lgpd.md`](docs/lgpd.md): controles técnicos, tratamento de dados e pendências de governança.
- [`docs/controle-de-acesso.md`](docs/controle-de-acesso.md): matriz de responsabilidades e invariantes de administrador, auditor e operador.
- [`docs/publicacao.md`](docs/publicacao.md): preparação, validação, publicação e verificação de produção.
- [`CHANGELOG.md`](CHANGELOG.md): histórico consolidado das versões.

## Arquitetura e segurança

As telas ficam em [`app/demo`](app/demo) e os componentes funcionais em [`components/patrimonio`](components/patrimonio). O cliente React usa uma camada HTTP tipada e nunca acessa o Supabase diretamente. Leituras obsoletas são canceladas com `AbortController`; o painel sincroniza em segundo plano e também ao recuperar foco, conexão ou visibilidade. A sincronização informa a revisão já carregada e recebe `304 Not Modified` quando não houve mutação, evitando transferir novamente todo o inventário e o histórico.

As regras ficam em [`lib/domain.js`](lib/domain.js), independentes de HTTP e banco. O servidor envia ao gateway apenas a identidade validada e o departamento solicitado; o gateway resolve internamente a chave do ambiente após conferir a permissão. O serviço intermediário do Supabase exige um segredo de servidor, e as tabelas têm RLS habilitado com acesso direto negado a `anon` e `authenticated`.

Mutações e importações usam RPCs transacionais com revisão otimista. Núcleos são reconciliados pela sigla estável e os IDs persistidos são resolvidos antes de gravar patrimônios e perfis. Um responsável encontrado no inventário continua visível mesmo sem perfil auxiliar; o próprio pop-up permite cadastrar esse perfil sem perder as atribuições existentes. Uma gravação obsoleta recebe `409 Conflict`, evitando que duas sessões sobrescrevam silenciosamente o trabalho uma da outra.

A troca do número patrimonial altera a chave do ativo com cascata referencial para os movimentos existentes, exige justificativa e cria um novo evento de auditoria. Quando uma referência interna `Sxxxxx` em divergência recebe um número oficial, o item volta automaticamente para `Em uso` se possuir responsável ou `Disponível` caso contrário.

A referência anterior permanece como alias interno. Assim, reimportar a planilha ainda desatualizada reconcilia a mesma peça física com o novo patrimônio, sem recriar o item `Sem patrimônio` nem reabrir sua divergência.

Documentação completa: [`docs/arquitetura.md`](docs/arquitetura.md).

### Modelo de autorização

Administradores globais controlam departamentos, usuários e transferências. Auditores recebem departamentos específicos, consultam inventário, auditoria, históricos, termos, manutenções e documentos, e podem exportar de forma registrada; o banco impede escrita, importação e administração nesse perfil. Operadores recebem permissões independentes para alteração, importação e exportação. A autorização é novamente consultada no servidor a cada requisição e alterações de acesso incrementam a versão da sessão, invalidando cookies anteriores.

Os controles técnicos e as pendências de governança estão em [`docs/lgpd.md`](docs/lgpd.md). Resposta a incidentes e recuperação estão em [`docs/incidentes.md`](docs/incidentes.md) e [`docs/backup-restauracao.md`](docs/backup-restauracao.md).

## Decisões de UX

A interface segue o padrão de relatório em lista com detalhe do objeto, comum em sistemas corporativos: busca e filtros agrupados, tabela densa, seleção de linha, detalhe contextual e ações progressivas. As referências usadas foram:

- [Snipe-IT - Gestão de ativos](https://snipeitapp.com/product)
- [InvGate - Painel do ciclo de vida de ativos de TI](https://invgate.com/asset-management/product-tour/it-asset-lifecycle-management-dashboard)
- [ManageEngine AssetExplorer](https://www.manageengine.com/products/asset-explorer/)
- [Asset Panda - Gestão de ativos](https://www.assetpanda.com/)
- [SAP Fiori - Relatório em lista](https://experience.sap.com/fiori-design-web/v1-46/list-report-floorplan-sap-fiori-element/)
- [IBM Carbon - Tabela de dados](https://carbondesignsystem.com/components/data-table/usage/)
- [Sistema de design Atlassian - Tabela dinâmica](https://atlassian.design/components/dynamic-table)
- [Shopify Polaris - Filtros de índice](https://polaris-react.shopify.com/components/selection-and-input/index-filters)

A identidade visual usa azul cobalto e amarelo como referências da presença digital da Gazin, mantendo superfícies neutras e cores semânticas independentes para garantir leitura operacional e contraste.

Foram adotados padrões operacionais recorrentes nessas soluções: visibilidade imediata de status, busca por posse e localização, filtros rápidos de exceção, paginação para inventários extensos e acesso contextual ao histórico. O sistema também reúne inventário cíclico, custódia, manutenção, rastreamento, contratos, garantias, contabilidade, reservas, kits, desligamentos, documentos privados, inspeções e integrações em uma central operacional.

O painel oferece temas claro e escuro, respeita a preferência do sistema na primeira visita e persiste a escolha explícita em cookie. Fora da conferência offline, dados operacionais não são persistidos no navegador; a fila IndexedDB contém somente os campos mínimos necessários para sincronizar a contagem.

## Publicação

O projeto está configurado para Cloudflare Workers em [`wrangler.jsonc`](wrangler.jsonc). Use `pnpm deploy:cloudflare` após autenticar o Wrangler e cadastrar os segredos do ambiente de execução. O comando grava o SHA do commit como mensagem e tag da versão do Worker, permitindo rastrear o código publicado. O procedimento reproduzível, as migrações e os controles de pré-publicação estão em [`docs/publicacao.md`](docs/publicacao.md).

GitHub Pages não hospeda este ambiente de execução: ele publica apenas arquivos estáticos e não executa manipuladores de rota, cookies `HttpOnly` ou integrações servidor-servidor. O código e a integração contínua (CI) ficam no GitHub; a API permanece no Worker para não expor os segredos do Supabase.

## Diferenciais comerciais

- Fluxo demonstrável com problema empresarial real, não apenas CRUD genérico.
- Migração assistida da planilha existente, com relatório de inconsistências.
- Histórico imutável das decisões que alteram posse e estado do ativo.
- Persistência relacional, concorrência otimista e base empresarial colaborativa.
- Cópia de segurança XLSX legível por áreas administrativas sem acesso técnico.
- Estados de carregamento, erro, vazio e sessão sem escrita implementados.
- Responsividade para operação em desktop, tablet e celular.
- CI e documentação suficientes para manutenção por outra equipe.

## Evoluções possíveis

- Papéis adicionais por núcleo quando houver necessidade operacional comprovada.
- Assinatura eletrônica externa do termo de responsabilidade com validação jurídica corporativa.
- Provisionamento das credenciais e webhooks reais de RH, ERP, MDM, chamados e diretório corporativo.
- Homologação de leitores e tags RFID UHF, BLE, UWB ou GPS escolhidos pela operação.
- Provedor de visão computacional para preencher resultados de inspeção antes da revisão humana.

## Licença

[MIT](LICENSE)
