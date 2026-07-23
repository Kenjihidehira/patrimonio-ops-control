# Patrimônio Ops Control

Sistema web de controle patrimonial para empresas que precisam saber **qual ativo existe, onde está, a qual núcleo pertence e quem responde por ele**. O projeto cobre importação de planilhas, cadastro, alocação, transferências, manutenção, divergências, baixa lógica, exportação e trilha de auditoria.

[![CI](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml/badge.svg)](https://github.com/Kenjihidehira/patrimonio-ops-control/actions/workflows/ci.yml)
[![Publicação](https://img.shields.io/badge/demonstra%C3%A7%C3%A3o-online-126044)](https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo/)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-3978c3.svg)](LICENSE)

**Demonstração pública:** [patrimonio-ops-control.kenjihidehira999.workers.dev/demo](https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo/)

## Problema comercial resolvido

Planilhas patrimoniais isoladas não registram bem responsabilidade, movimentações e exceções. O Patrimônio Ops importa o inventário existente, centraliza os ativos por núcleo e transforma cada alteração em um evento auditável, reduzindo retrabalho em inventários, integração de novos colaboradores, manutenção e desligamentos.

## Escopo funcional

- Patrimônios oficiais com exatamente 6 números e referências internas distintas para itens ainda não etiquetados.
- Tipos controlados: CPU (Computador), Monitor 1, Monitor 2, Cadeira e Notebook.
- Organização por núcleo, gestor, responsável e localização física.
- Diretório de colaboradores importados, inclusive quando não há patrimônio associado.
- Perfil editável do colaborador com nome, núcleo e relação de patrimônios vinculados.
- Busca por ID, série, modelo, pessoa, local ou núcleo.
- Leitura direta de etiquetas por bipador USB ou Bluetooth configurado como teclado HID, com abertura automática do patrimônio em janela de conferência.
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
- Operação sem exposição de preço ou valor de aquisição dos patrimônios.
- Acesso público sem dados patrimoniais e ambiente empresarial compartilhado no Supabase.

## Tecnologias

- **Interface:** HTML semântico, CSS responsivo e JavaScript modular.
- **Aplicação:** Vinext, React 19 e TypeScript.
- **API:** manipuladores de rota compatíveis com Next.js em Cloudflare Worker.
- **Banco:** Supabase Postgres 17, funções RPC transacionais e índices operacionais.
- **Integração:** Função Edge do Supabase autenticada por segredo de servidor.
- **Autenticação:** GitHub OAuth e Google OpenID Connect, PKCE, allowlists e sessão `HttpOnly` compartilhada.
- **Planilhas:** `read-excel-file` e `write-excel-file`.
- **Qualidade:** Node Test Runner, ESLint, TypeScript e GitHub Actions.

## Executar localmente

Pré-requisitos: Node.js 22.13+ e pnpm 10+.

```bash
pnpm install
cp configuracao.exemplo .env.local
pnpm dev
```

Use [`configuracao.exemplo`](configuracao.exemplo) somente como modelo para criar `.env.local`. Preencha as variáveis Supabase, dos provedores de identidade e os segredos de sessão apenas no arquivo local, que é ignorado pelo Git. Acesse `http://localhost:5173/login/`.

A interface anônima não recebe dados patrimoniais. A leitura da base empresarial, importação, exportação e operações de escrita exigem um login presente em `GITHUB_ALLOWED_LOGINS` ou um e-mail exato em `GOOGLE_ALLOWED_EMAILS`. O servidor valida `state`, PKCE, assinatura da identidade e lista de autorizados antes de criar uma sessão local de oito horas.

## Conectar um leitor de código de barras

O sistema aceita leitores USB ou Bluetooth no modo **HID Keyboard**, também chamado de **teclado**, **keyboard wedge** ou **USB HID**. Não é necessário instalar driver, extensão ou biblioteca no navegador.

1. Conecte o leitor ao computador por USB ou faça o pareamento Bluetooth.
2. No manual do equipamento, selecione o modo `HID Keyboard`.
3. Configure o sufixo de leitura como `Enter` ou `Tab`.
4. Teste no Bloco de Notas: ao bipar, o leitor deve escrever os seis números da etiqueta e avançar o cursor.
5. Entre no sistema e bipe a etiqueta em qualquer tela. O inventário será aberto, os filtros serão limpos e uma janela exibirá o patrimônio, responsável, núcleo, localização, modelo, série, histórico e status.

Na janela de conferência, um operador autenticado pode selecionar outro status e informar o motivo obrigatório. A alteração usa a mesma API transacional do painel, incrementa a revisão da base e registra o usuário na auditoria.

Somente identificadores oficiais com seis dígitos e referências internas no formato `Sxxxxx` são aceitos. A busca exige autenticação e não grava nem altera o patrimônio. Leitores configurados exclusivamente como porta `COM` ou serial não funcionam neste fluxo; nesses casos, é necessário identificar o fabricante e o modelo para integrar o protocolo específico.

### Validação completa

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
```

## Configurar o login GitHub

1. No GitHub, acesse **Configurações > Configurações do desenvolvedor > Aplicativos OAuth** e registre um aplicativo OAuth.
2. Use `https://patrimonio-ops-control.kenjihidehira999.workers.dev` como URL da página inicial.
3. Use `https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/github/callback` como URL de retorno da autorização.
4. Armazene `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET` somente no ambiente do servidor.
5. Mantenha em `GITHUB_ALLOWED_LOGINS` apenas os operadores autorizados.

O fluxo segue a documentação oficial do [fluxo OAuth para aplicações Web do GitHub](https://docs.github.com/pt/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps). O token de acesso é usado no servidor apenas para obter a identidade atual e não é persistido no navegador nem incluído na sessão local.

## Configurar o login Google

No Google Cloud Console, crie um cliente OAuth do tipo Aplicativo da Web com a URL de retorno:

```text
https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/google/callback
```

Cadastre `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` como segredos. Preencha `GOOGLE_ALLOWED_EMAILS` com uma lista explícita de e-mails separados por vírgula. O sistema não autoriza automaticamente qualquer conta Gmail ou qualquer conta de um domínio Google Workspace.

GitHub e Google convergem para a mesma sessão local assinada. Tokens de acesso e atualização dos provedores não são gravados no navegador nem no banco.

## Planilha-base

O importador aceita dois formatos:

1. Matriz operacional com blocos `Colaborador(a)`, `Núcleo`, `Máquina`, `Tela 1`, `Tela 2`, `Cadeira` e `Notebook`.
2. Arquivo plano exportado pelo próprio sistema, com uma linha por item.

Antes de gravar, a API reabre o XLSX no servidor, normaliza IDs de cinco dígitos com zero à esquerda, rejeita códigos fora do padrão e exclui todas as ocorrências duplicadas. A prévia retorna apenas contagens e posições dos problemas; nomes da planilha não são enviados ao navegador nessa etapa.

A carga inicial validada contém 361 itens e 10 núcleos, exclusivamente a partir da planilha corporativa. A quantidade de colaboradores não é fixa nem deriva da tabela auxiliar de perfis: ela é calculada em cada leitura pelos nomes distintos e não vazios no campo `Responsável` dos itens ativos. Desses itens iniciais, 319 possuem patrimônio oficial e 42 estão marcados como `Sem patrimônio`; estes recebem uma referência interna iniciada por `S`, aparecem como divergência e nunca são apresentados como número patrimonial. Doze ocorrências pertencentes a seis identificadores duplicados são rejeitadas e preservadas no histórico. Nove IDs de cinco dígitos recebem zero à esquerda. O valor `x` continua representando ausência de item.

A planilha corporativa original não faz parte do repositório. O arquivo [`data/seed.json`](data/seed.json) é usado somente pelos testes unitários das regras de domínio e não é importado pelo ambiente de execução nem publicado como base da interface.

## API

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| `GET` | `/api/state` | Opcional | Painel, inventário, colaboradores, núcleos, auditoria, importações e sessão |
| `POST` | `/api/state` | Obrigatória | Cadastro, transferência, status, edição cadastral e gestão de núcleos |
| `POST` | `/api/import` | Obrigatória | Pré-validar ou confirmar importação XLSX |
| `GET` | `/api/export` | Obrigatória | Gerar cópia de segurança XLSX do ambiente empresarial |

Filtros, payloads e códigos de resposta estão em [`docs/api.md`](docs/api.md).

## Arquitetura e segurança

As regras ficam em [`lib/domain.js`](lib/domain.js), independentes de HTTP e banco. O servidor usa uma chave empresarial aleatória, disponível apenas no ambiente de execução, para localizar a base compartilhada. O serviço intermediário do Supabase também exige um segredo de servidor; as tabelas têm RLS habilitado e negam acesso direto a `anon` e `authenticated`.

Mutações e importações usam RPCs transacionais com revisão otimista. Núcleos são reconciliados pela sigla estável e os IDs persistidos são resolvidos antes de gravar patrimônios e perfis. Um responsável encontrado no inventário continua visível mesmo sem perfil auxiliar; o próprio pop-up permite cadastrar esse perfil sem perder as atribuições existentes. Uma gravação obsoleta recebe `409 Conflict`, evitando que duas sessões sobrescrevam silenciosamente o trabalho uma da outra.

A troca do número patrimonial altera a chave do ativo com cascata referencial para os movimentos existentes, exige justificativa e cria um novo evento de auditoria. Quando uma referência interna `Sxxxxx` em divergência recebe um número oficial, o item volta automaticamente para `Em uso` se possuir responsável ou `Disponível` caso contrário.

A referência anterior permanece como alias interno. Assim, reimportar a planilha ainda desatualizada reconcilia a mesma peça física com o novo patrimônio, sem recriar o item `Sem patrimônio` nem reabrir sua divergência.

Documentação completa: [`docs/arquitetura.md`](docs/arquitetura.md).

### Limitação produtiva explícita

Todos os logins presentes na lista de autorizados acessam a mesma base e possuem as mesmas permissões de escrita. Ainda não há controle de acesso por papéis (RBAC) para função ou núcleo. Antes de ampliar o acesso para perfis somente leitura, auditores ou múltiplas empresas, adicione `organizations`, `memberships` e políticas de autorização por papel.

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

Foram adotados padrões operacionais recorrentes nessas soluções: visibilidade imediata de status, busca por posse e localização, filtros rápidos de exceção, paginação para inventários extensos e acesso contextual ao histórico. O leitor HID de código de barras é suportado sem acesso privilegiado ao hardware. Recursos financeiros, contratos, garantias, leitura de QR Code por câmera e campos customizados não foram reproduzidos porque não existem na planilha-base atual.

O painel oferece temas claro e escuro, respeita a preferência do sistema na primeira visita e persiste a escolha explícita sem armazenar dados operacionais no navegador.

## Publicação

O projeto está configurado para Cloudflare Workers em [`wrangler.jsonc`](wrangler.jsonc). Use `pnpm deploy:cloudflare` após autenticar o Wrangler e cadastrar os segredos do ambiente de execução. O procedimento reproduzível, as migrações e os controles de pré-publicação estão em [`docs/publicacao.md`](docs/publicacao.md).

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

- RBAC por empresa, núcleo e função.
- Etiquetas QR Code e leitura por câmera.
- Termo digital de responsabilidade e aceite do colaborador.
- Anexos de nota fiscal, laudo e foto do ativo em Supabase Storage.
- Inventário cíclico com conferência offline e reconciliação.
- Integrações com RH, chamados de manutenção e diretório corporativo.

## Licença

[MIT](LICENSE)
