# Patrimônio Ops Control

Sistema web de controle patrimonial para empresas que precisam saber **qual ativo existe, onde está, a qual núcleo pertence e quem responde por ele**. O projeto cobre importação de planilhas, cadastro, alocação, transferências, manutenção, divergências, baixa lógica, exportação e trilha de auditoria.

[![CI](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml/badge.svg)](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml)
[![Deploy](https://img.shields.io/badge/demo-online-126044)](https://patrimonio-ops-control.dadosepesquisa.chatgpt.site/demo/)
[![License: MIT](https://img.shields.io/badge/license-MIT-3978c3.svg)](LICENSE)

**Demo pública:** [patrimonio-ops-control.dadosepesquisa.chatgpt.site/demo](https://patrimonio-ops-control.dadosepesquisa.chatgpt.site/demo/)

![Dashboard do Patrimônio Ops](docs/dashboard.jpg)

## Problema comercial resolvido

Planilhas patrimoniais isoladas não registram bem responsabilidade, movimentações e exceções. O Patrimônio Ops importa o inventário existente, centraliza os ativos por núcleo e transforma cada alteração em um evento auditável, reduzindo retrabalho em inventários, onboarding, manutenção e desligamentos.

## Escopo funcional

- Identificadores únicos com exatamente 6 números.
- Tipos controlados: CPU (Computador), Monitor 1, Monitor 2, Cadeira e Notebook.
- Organização por núcleo, gestor, responsável e localização física.
- Busca por ID, série, modelo, pessoa, local ou núcleo.
- Filtros de tipo, status e núcleo, com ordenação operacional.
- Cadastro de patrimônio e núcleo com validação no cliente e no domínio.
- Transferência entre núcleos, locais e responsáveis.
- Status: disponível, em uso, manutenção, divergência e baixado.
- Baixa lógica, sem exclusão destrutiva do histórico.
- Auditoria com ator, data, origem, destino e motivo.
- Importação XLSX em duas etapas: pré-validação e confirmação transacional.
- Exportação XLSX com inventário, núcleos, auditoria e histórico de importações.
- Seed público sanitizado e workspace empresarial compartilhado no Supabase.

## Stack

- **Frontend:** HTML semântico, CSS responsivo e JavaScript modular.
- **Aplicação:** Vinext, React 19 e TypeScript.
- **API:** Route Handlers compatíveis com Next.js em Cloudflare Worker.
- **Banco:** Supabase Postgres 17, funções RPC transacionais e índices operacionais.
- **Integração:** Supabase Edge Function autenticada por segredo de servidor.
- **Autenticação:** Microsoft Entra ID com OpenID Connect, Authorization Code, PKCE e sessão `HttpOnly`.
- **Planilhas:** `read-excel-file` e `write-excel-file`.
- **Qualidade:** Node Test Runner, ESLint, TypeScript e GitHub Actions.

## Executar localmente

Pré-requisitos: Node.js 22.13+ e pnpm 10+.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Preencha as variáveis Supabase, Microsoft Entra e os segredos de sessão de `.env.example` apenas em `.env.local`. O arquivo é ignorado pelo Git. Acesse `http://localhost:5173/demo/`.

A interface anônima funciona com o seed público. A base empresarial e as operações de escrita exigem uma conta do tenant Microsoft e de um domínio listado em `MICROSOFT_ALLOWED_DOMAINS`. O servidor valida assinatura, emissor, audiência, expiração, `nonce`, tenant e domínio antes de criar uma sessão local de oito horas.

### Validação completa

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
```

## Configurar o login Microsoft

1. Registre um aplicativo Web de locatário único no Microsoft Entra ID.
2. Cadastre `https://patrimonio-ops-control.dadosepesquisa.chatgpt.site/api/auth/microsoft/callback` como Redirect URI do tipo Web.
3. Crie um Client Secret e armazene-o somente em `MICROSOFT_CLIENT_SECRET` no ambiente do servidor.
4. Configure o Tenant ID, Client ID, domínios autorizados e `AUTH_SESSION_SECRET` conforme `.env.example`.

O fluxo segue a documentação oficial do [Authorization Code com PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), a [validação de ID tokens](https://learn.microsoft.com/en-us/entra/identity-platform/id-tokens) e as regras de [Redirect URI](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-redirect-uri). Nenhum access token ou refresh token é persistido no navegador.

## Planilha-base

O importador aceita dois formatos:

1. Matriz operacional com blocos `Colaborador(a)`, `Núcleo`, `Máquina`, `Tela 1`, `Tela 2`, `Cadeira` e `Notebook`.
2. Arquivo plano exportado pelo próprio sistema, com uma linha por patrimônio.

Antes de gravar, a API reabre o XLSX no servidor, normaliza IDs de cinco dígitos com zero à esquerda, rejeita códigos fora do padrão e exclui todas as ocorrências duplicadas. A prévia retorna apenas contagens e posições dos problemas; nomes da planilha não são enviados ao navegador nessa etapa.

A carga inicial da planilha corporativa registrou 318 patrimônios válidos em 10 núcleos. Treze ocorrências foram rejeitadas e preservadas no histórico da importação: uma com identificador fora do padrão e 12 ocorrências pertencentes a seis identificadores duplicados. Nove IDs de cinco dígitos receberam zero à esquerda.

A planilha corporativa original não faz parte do repositório. O arquivo [`data/seed.json`](data/seed.json) contém apenas dados fictícios para demonstração e não expõe nomes ou dados operacionais reais.

## API

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| `GET` | `/api/state` | Opcional | Dashboard, inventário, núcleos, auditoria, importações e sessão |
| `POST` | `/api/state` | Obrigatória | Cadastro, transferência, mudança de status ou novo núcleo |
| `POST` | `/api/import` | Obrigatória | Pré-validar ou confirmar importação XLSX |
| `GET` | `/api/export` | Opcional | Gerar backup XLSX do workspace atual |

Filtros, payloads e códigos de resposta estão em [`docs/api.md`](docs/api.md).

## Arquitetura e segurança

As regras ficam em [`lib/domain.js`](lib/domain.js), independentes de HTTP e banco. O servidor usa uma chave empresarial aleatória, disponível apenas no runtime, para localizar a base compartilhada. O gateway Supabase também exige um segredo de servidor; as tabelas têm RLS habilitado e negam acesso direto a `anon` e `authenticated`.

Mutações e importações usam RPCs transacionais com revisão otimista. Uma gravação obsoleta recebe `409 Conflict`, evitando que duas sessões sobrescrevam silenciosamente o trabalho uma da outra.

Documentação completa: [`docs/architecture.md`](docs/architecture.md).

### Limitação produtiva explícita

Todos os usuários aceitos pelo tenant e domínio configurados acessam a mesma base e possuem as mesmas permissões de escrita. Ainda não há RBAC por função ou núcleo. Antes de ampliar o acesso para perfis somente leitura, auditores ou múltiplas empresas, adicione `organizations`, `memberships` e políticas de autorização por papel.

## Decisões de UX

A interface segue o padrão `list report + object detail`, comum em sistemas corporativos: busca e filtros agrupados, tabela densa, seleção de linha, detalhe contextual e ações progressivas. As referências usadas foram:

- [SAP Fiori - List Report](https://experience.sap.com/fiori-design-web/v1-46/list-report-floorplan-sap-fiori-element/)
- [IBM Carbon - Data Table](https://carbondesignsystem.com/components/data-table/usage/)
- [Atlassian Design System - Dynamic Table](https://atlassian.design/components/dynamic-table)
- [Shopify Polaris - Index Filters](https://polaris-react.shopify.com/components/selection-and-input/index-filters)

## Deploy

O projeto está configurado para OpenAI Sites em [`.openai/hosting.json`](.openai/hosting.json). O procedimento reproduzível, as migrations e os controles de pré-publicação estão em [`docs/deploy.md`](docs/deploy.md).

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
