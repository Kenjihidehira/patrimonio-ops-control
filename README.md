# Patrimônio Ops Control

Sistema web de controle patrimonial para empresas que precisam saber **qual ativo existe, onde está, a qual núcleo pertence e quem responde por ele**. O projeto cobre importação de planilhas, cadastro, alocação, transferências, manutenção, divergências, baixa lógica, exportação e trilha de auditoria.

[![CI](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml/badge.svg)](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml)
[![Deploy](https://img.shields.io/badge/demo-online-126044)](https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo/)
[![License: MIT](https://img.shields.io/badge/license-MIT-3978c3.svg)](LICENSE)

**Demo pública:** [patrimonio-ops-control.kenjihidehira999.workers.dev/demo](https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo/)

## Problema comercial resolvido

Planilhas patrimoniais isoladas não registram bem responsabilidade, movimentações e exceções. O Patrimônio Ops importa o inventário existente, centraliza os ativos por núcleo e transforma cada alteração em um evento auditável, reduzindo retrabalho em inventários, onboarding, manutenção e desligamentos.

## Escopo funcional

- Patrimônios oficiais com exatamente 6 números e referências internas distintas para itens ainda não etiquetados.
- Tipos controlados: CPU (Computador), Monitor 1, Monitor 2, Cadeira e Notebook.
- Organização por núcleo, gestor, responsável e localização física.
- Diretório de colaboradores importados, inclusive quando não há patrimônio associado.
- Perfil editável do colaborador com nome, núcleo e relação de patrimônios vinculados.
- Busca por ID, série, modelo, pessoa, local ou núcleo.
- Filtros de tipo, status e núcleo, com ordenação operacional.
- Visualizações rápidas para itens sem responsável, sem patrimônio, em manutenção ou com divergência.
- Paginação configurável para bases extensas, com 15, 25 ou 50 registros por página.
- Lista móvel dedicada e painel inferior de detalhes com abas de resumo e histórico.
- Cadastro de patrimônio e núcleo, além de edição de sigla, nome, localização e gestor do núcleo.
- Transferência entre núcleos, locais e responsáveis.
- Alteração auditável do número patrimonial, inclusive para converter itens `Sem patrimônio` em identificadores oficiais.
- Status: disponível, em uso, manutenção, divergência e baixado.
- Baixa lógica, sem exclusão destrutiva do histórico.
- Auditoria com ator, data, origem, destino e motivo.
- Importação XLSX em duas etapas: pré-validação e confirmação transacional.
- Exportação XLSX com inventário, núcleos, auditoria e histórico de importações.
- Operação sem exposição de preço ou valor de aquisição dos patrimônios.
- Acesso público sem dados patrimoniais e workspace empresarial compartilhado no Supabase.

## Stack

- **Frontend:** HTML semântico, CSS responsivo e JavaScript modular.
- **Aplicação:** Vinext, React 19 e TypeScript.
- **API:** Route Handlers compatíveis com Next.js em Cloudflare Worker.
- **Banco:** Supabase Postgres 17, funções RPC transacionais e índices operacionais.
- **Integração:** Supabase Edge Function autenticada por segredo de servidor.
- **Autenticação:** GitHub OAuth e Google OpenID Connect, PKCE, allowlists e sessão `HttpOnly` compartilhada.
- **Planilhas:** `read-excel-file` e `write-excel-file`.
- **Qualidade:** Node Test Runner, ESLint, TypeScript e GitHub Actions.

## Executar localmente

Pré-requisitos: Node.js 22.13+ e pnpm 10+.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Preencha as variáveis Supabase, dos provedores de identidade e os segredos de sessão de `.env.example` apenas em `.env.local`. O arquivo é ignorado pelo Git. Acesse `http://localhost:5173/login/`.

A interface anônima não recebe dados patrimoniais. A leitura da base empresarial, importação, exportação e operações de escrita exigem um login presente em `GITHUB_ALLOWED_LOGINS` ou um e-mail exato em `GOOGLE_ALLOWED_EMAILS`. O servidor valida `state`, PKCE, assinatura da identidade e allowlist antes de criar uma sessão local de oito horas.

### Validação completa

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
```

## Configurar o login GitHub

1. Em **GitHub > Settings > Developer settings > OAuth Apps**, registre um OAuth App.
2. Use `https://patrimonio-ops-control.kenjihidehira999.workers.dev` como Homepage URL.
3. Use `https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/github/callback` como Authorization callback URL.
4. Armazene `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` somente no ambiente do servidor.
5. Mantenha em `GITHUB_ALLOWED_LOGINS` apenas os operadores autorizados.

O fluxo segue a documentação oficial do [GitHub OAuth Web Application Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps). O access token é usado no servidor apenas para obter a identidade atual e não é persistido no navegador nem incluído na sessão local.

## Configurar o login Google

No Google Cloud Console, crie um OAuth Client do tipo Web application com a callback:

```text
https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/google/callback
```

Cadastre `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` como secrets. Preencha `GOOGLE_ALLOWED_EMAILS` com uma lista explícita de e-mails separados por vírgula. O sistema não autoriza automaticamente qualquer conta Gmail ou qualquer conta de um domínio Google Workspace.

GitHub e Google convergem para a mesma sessão local assinada. Tokens de acesso e atualização dos provedores não são gravados no navegador nem no banco.

## Planilha-base

O importador aceita dois formatos:

1. Matriz operacional com blocos `Colaborador(a)`, `Núcleo`, `Máquina`, `Tela 1`, `Tela 2`, `Cadeira` e `Notebook`.
2. Arquivo plano exportado pelo próprio sistema, com uma linha por item.

Antes de gravar, a API reabre o XLSX no servidor, normaliza IDs de cinco dígitos com zero à esquerda, rejeita códigos fora do padrão e exclui todas as ocorrências duplicadas. A prévia retorna apenas contagens e posições dos problemas; nomes da planilha não são enviados ao navegador nessa etapa.

A base sincronizada contém 361 itens, 102 colaboradores e 10 núcleos, exclusivamente a partir da planilha corporativa. Desses itens, 319 possuem patrimônio oficial e 42 estão marcados como `Sem patrimônio`; estes recebem uma referência interna iniciada por `S`, aparecem como divergência e nunca são apresentados como número patrimonial. Doze ocorrências pertencentes a seis identificadores duplicados são rejeitadas e preservadas no histórico. Nove IDs de cinco dígitos recebem zero à esquerda. O valor `x` continua representando ausência de item.

A planilha corporativa original não faz parte do repositório. O arquivo [`data/seed.json`](data/seed.json) é usado somente pelos testes unitários das regras de domínio e não é importado pelo runtime nem publicado como base da interface.

## API

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| `GET` | `/api/state` | Opcional | Dashboard, inventário, colaboradores, núcleos, auditoria, importações e sessão |
| `POST` | `/api/state` | Obrigatória | Cadastro, transferência, mudança de status, criação ou edição de núcleo |
| `POST` | `/api/import` | Obrigatória | Pré-validar ou confirmar importação XLSX |
| `GET` | `/api/export` | Obrigatória | Gerar backup XLSX do workspace empresarial |

Filtros, payloads e códigos de resposta estão em [`docs/api.md`](docs/api.md).

## Arquitetura e segurança

As regras ficam em [`lib/domain.js`](lib/domain.js), independentes de HTTP e banco. O servidor usa uma chave empresarial aleatória, disponível apenas no runtime, para localizar a base compartilhada. O gateway Supabase também exige um segredo de servidor; as tabelas têm RLS habilitado e negam acesso direto a `anon` e `authenticated`.

Mutações e importações usam RPCs transacionais com revisão otimista. Núcleos são reconciliados pela sigla estável e os IDs persistidos são resolvidos antes de gravar patrimônios e colaboradores. Ao renomear um colaborador, suas atribuições existentes são preservadas na mesma transação. Uma gravação obsoleta recebe `409 Conflict`, evitando que duas sessões sobrescrevam silenciosamente o trabalho uma da outra.

A troca do número patrimonial altera a chave do ativo com cascata referencial para os movimentos existentes, exige justificativa e cria um novo evento de auditoria. Quando uma referência interna `Sxxxxx` em divergência recebe um número oficial, o item volta automaticamente para `Em uso` se possuir responsável ou `Disponível` caso contrário.

Documentação completa: [`docs/architecture.md`](docs/architecture.md).

### Limitação produtiva explícita

Todos os logins presentes na allowlist acessam a mesma base e possuem as mesmas permissões de escrita. Ainda não há RBAC por função ou núcleo. Antes de ampliar o acesso para perfis somente leitura, auditores ou múltiplas empresas, adicione `organizations`, `memberships` e políticas de autorização por papel.

## Decisões de UX

A interface segue o padrão `list report + object detail`, comum em sistemas corporativos: busca e filtros agrupados, tabela densa, seleção de linha, detalhe contextual e ações progressivas. As referências usadas foram:

- [Snipe-IT - Asset Management](https://snipeitapp.com/product)
- [InvGate - IT Asset Lifecycle Dashboard](https://invgate.com/asset-management/product-tour/it-asset-lifecycle-management-dashboard)
- [ManageEngine AssetExplorer](https://www.manageengine.com/products/asset-explorer/)
- [Asset Panda - Asset Management](https://www.assetpanda.com/)
- [SAP Fiori - List Report](https://experience.sap.com/fiori-design-web/v1-46/list-report-floorplan-sap-fiori-element/)
- [IBM Carbon - Data Table](https://carbondesignsystem.com/components/data-table/usage/)
- [Atlassian Design System - Dynamic Table](https://atlassian.design/components/dynamic-table)
- [Shopify Polaris - Index Filters](https://polaris-react.shopify.com/components/selection-and-input/index-filters)

A identidade visual usa azul cobalto e amarelo como referências da presença digital da Gazin, mantendo superfícies neutras e cores semânticas independentes para garantir leitura operacional e contraste.

Foram adotados padrões operacionais recorrentes nessas soluções: visibilidade imediata de status, busca por posse e localização, filtros rápidos de exceção, paginação para inventários extensos e acesso contextual ao histórico. Recursos financeiros, contratos, garantias, QR Code e campos customizados não foram reproduzidos porque não existem na planilha-base atual.

O painel oferece temas claro e escuro, respeita a preferência do sistema na primeira visita e persiste a escolha explícita sem armazenar dados operacionais no navegador.

## Deploy

O projeto está configurado para Cloudflare Workers em [`wrangler.jsonc`](wrangler.jsonc). Use `pnpm deploy:cloudflare` após autenticar o Wrangler e cadastrar os secrets do runtime. O procedimento reproduzível, as migrations e os controles de pré-publicação estão em [`docs/deploy.md`](docs/deploy.md).

GitHub Pages não hospeda este runtime: ele publica apenas arquivos estáticos e não executa Route Handlers, cookies `HttpOnly` ou integrações servidor-servidor. O código e a CI ficam no GitHub; o backend permanece no Worker para não expor os segredos do Supabase.

## Diferenciais comerciais

- Fluxo demonstrável com problema empresarial real, não apenas CRUD genérico.
- Migração assistida da planilha existente, com relatório de inconsistências.
- Histórico imutável das decisões que alteram posse e estado do ativo.
- Persistência relacional, concorrência otimista e base empresarial colaborativa.
- Backup XLSX legível por áreas administrativas sem acesso técnico.
- Estados de carregamento, erro, vazio e sessão sem escrita implementados.
- Responsividade para operação em desktop, tablet e celular.
- CI e documentação suficientes para manutenção por outra equipe.

## Evoluções possíveis

- RBAC por empresa, núcleo e função.
- Etiquetas QR Code e leitura por câmera.
- Termo digital de responsabilidade e aceite do colaborador.
- Anexos de nota fiscal, laudo e foto do ativo em Supabase Storage.
- Inventário cíclico com conferência offline e reconciliação.
- Integrações com RH, chamados de manutenção e diretório corporativo.

## Licença

[MIT](LICENSE)
