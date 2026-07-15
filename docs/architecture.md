# Arquitetura

## Visão geral

```mermaid
flowchart LR
    UI[Interface operacional] --> API[Route Handlers]
    API --> AUTH[Microsoft Entra ID / OIDC]
    API --> DOMAIN[Domínio patrimonial]
    API --> XLSX[Leitura e escrita XLSX]
    API --> GATEWAY[Supabase Edge Function]
    GATEWAY --> RPC[RPCs transacionais]
    RPC --> PG[(Supabase Postgres)]
    SEED[Seed público sanitizado] --> API
```

O navegador nunca recebe a URL privilegiada nem o segredo do gateway. A API do Cloudflare Worker chama a Edge Function pelo servidor, e a função executa apenas as operações permitidas contra o Postgres.

## Responsabilidades

| Camada | Arquivos | Responsabilidade |
| --- | --- | --- |
| Interface | `public/demo/*` | Estado visual, filtros, formulários, acessibilidade e chamadas HTTP |
| API | `app/api/*` | Sessão, contratos HTTP, upload, exportação e respostas padronizadas |
| Domínio | `lib/domain.js` | Invariantes, ações, auditoria e projeção do dashboard |
| Planilhas | `lib/spreadsheet-import.js`, `lib/workbook.ts` | Leitura, normalização, prévia e geração XLSX |
| Identidade | `app/microsoft-auth.ts`, `app/api/auth/*` | OAuth, PKCE, validação OIDC e sessão local |
| Persistência | `lib/supabase.ts`, `lib/workspace.ts` | Chave empresarial, gateway e hidratação do estado |
| Banco | `supabase/migrations/*` | Tabelas, índices, RLS, RPCs e integridade referencial |
| Gateway | `supabase/functions/patrimonio-gateway/index.ts` | Autenticação servidor-servidor e lista fechada de operações |
| Plataforma | `.openai/*` | Configuração de hosting e variáveis do runtime |

## Invariantes do domínio

1. O identificador do patrimônio contém exatamente seis dígitos e é único no workspace.
2. O tipo pertence ao catálogo fechado de cinco itens.
3. Todo patrimônio referencia um núcleo existente.
4. Toda mutação incrementa a revisão do workspace.
5. Transferências, mudanças de status e importações geram movimentos auditáveis.
6. Patrimônio baixado não pode ser transferido.
7. Baixa é lógica; o registro e seu histórico não são apagados.
8. Valores monetários e datas são normalizados antes da persistência.
9. Uma revisão obsoleta não pode sobrescrever uma revisão mais nova.

## Modelo de persistência

O Postgres usa cinco tabelas relacionais:

| Tabela | Finalidade |
| --- | --- |
| `patrimonio_workspaces` | Base empresarial identificada por chave aleatória e contador de revisão |
| `patrimonio_nuclei` | Núcleos, gestores e localizações |
| `patrimonio_assets` | Inventário, estado operacional e dados de aquisição |
| `patrimonio_movements` | Histórico imutável de cadastro, transferência, status e importação |
| `patrimonio_import_runs` | Resultado e avisos de cada importação |

Chaves estrangeiras preservam integridade e índices cobrem status, núcleo, tipo, responsável, atualização, movimentos e histórico de importações. As RPCs `patrimonio_apply_action` e `patrimonio_import_assets` executam validação de revisão, escrita e auditoria na mesma transação.

## Fluxos de dados

### Leitura anônima

1. A API não encontra identidade autenticada.
2. Carrega e valida `data/seed.json`.
3. Aplica busca, filtros e ordenação no domínio.
4. Retorna `session.source = seed`; nenhuma escrita é permitida.

### Leitura autenticada

1. A API inicia Authorization Code com PKCE, `state` e `nonce`.
2. O Microsoft Entra autentica a conta e devolve o código para a Redirect URI registrada.
3. O servidor troca o código e valida assinatura, emissor, audiência, expiração, `nonce`, `tid`, `oid` e domínio do ID token.
4. Uma sessão local assinada, `HttpOnly`, `Secure` e `SameSite=Lax` mantém apenas nome, e-mail, tenant e identificador do usuário por oito horas.
5. A API usa `PATRIMONIO_WORKSPACE_KEY` para carregar a base empresarial compartilhada e retorna `session.source = supabase`.

### Mutação

1. A API bloqueia requisições sem identidade com `401`.
2. O cliente envia `expectedRevision`.
3. O domínio valida a ação antes da chamada externa.
4. A RPC bloqueia a linha do workspace, compara a revisão e grava dados e auditoria atomicamente.
5. Revisão divergente retorna `409 Conflict`; sucesso devolve a nova projeção.

### Importação XLSX

1. A API aceita apenas `.xlsx` de até 2 MB.
2. A prévia reconhece a matriz original ou o formato plano exportado.
3. IDs de cinco dígitos recebem zero à esquerda; inválidos e todas as ocorrências duplicadas são rejeitados.
4. A confirmação reprocessa o arquivo no servidor e chama uma RPC transacional.
5. Ativos são inseridos ou atualizados por código, movimentos são adicionados e o resultado é registrado.

### Exportação XLSX

1. O workspace atual é projetado pelo domínio.
2. O servidor gera as abas `Inventário`, `Núcleos`, `Auditoria` e `Importações`.
3. O arquivo é entregue com `no-store`, `nosniff` e nome datado.

## Segurança

- Nenhum secret é versionado ou exposto ao cliente.
- O ator vem da sessão Microsoft validada, nunca do payload.
- A chave empresarial é aleatória, tem 256 bits e permanece somente no runtime do servidor.
- O ID token é validado por chave pública do endpoint JWKS oficial; `state`, PKCE e `nonce` protegem o fluxo OAuth.
- Access tokens, refresh tokens e Client Secret nunca são enviados ao JavaScript da interface.
- O gateway aceita somente operações enumeradas e exige `x-patrimonio-key`.
- RLS está habilitado e políticas negam acesso direto a `anon` e `authenticated`.
- O upload tem limite de tamanho, extensão controlada e parser estruturado.
- A prévia não devolve nomes dos colaboradores da planilha.
- Redirects de autenticação são restritos a caminhos relativos seguros.
- Erros internos e detalhes do banco não são expostos ao navegador.
- Conteúdo dinâmico é escapado antes de entrar em templates HTML.
- Não existe exclusão física exposta pela API.

## Limitações e evolução produtiva

O workspace atual representa uma empresa e é compartilhado por todos os usuários aceitos pelo tenant e domínio configurados. A sessão identifica o ator da auditoria, mas todos possuem as mesmas permissões. Para múltiplas empresas ou perfis distintos, o próximo incremento deve introduzir `organizations`, `memberships` e papéis como administrador, operador e auditor.

Também faltam recuperação de desastre automatizada, política formal de retenção e armazenamento de anexos. A exportação XLSX reduz o risco operacional, mas não substitui backup gerenciado do Postgres.

## Decisões registradas

### ADR-001: baixa lógica em vez de exclusão

**Decisão:** representar a baixa pelo status `retired`.

**Motivo:** patrimônio exige rastreabilidade fiscal e operacional. Excluir o registro destruiria evidência.

### ADR-002: domínio independente de framework

**Decisão:** manter validação e ações em JavaScript puro.

**Motivo:** testes rápidos, portabilidade e separação entre regra de negócio, HTTP e persistência.

### ADR-003: Postgres relacional e RPCs transacionais

**Decisão:** persistir núcleos, ativos, movimentos e importações em tabelas normalizadas; mutações passam por RPC.

**Motivo:** integridade referencial, consultas indexadas e atomicidade são requisitos reais do fluxo patrimonial.

### ADR-004: gateway servidor-servidor

**Decisão:** manter as tabelas fechadas para chaves públicas e expor uma Edge Function mínima à API do Cloudflare Worker.

**Motivo:** a integração de deploy não deve colocar uma chave privilegiada no navegador nem depender de identidade forjada pelo cliente.

### ADR-005: Microsoft Entra com sessão local mínima

**Decisão:** usar OIDC Authorization Code com PKCE e converter o ID token validado em uma sessão curta assinada pela aplicação.

**Motivo:** manter a identidade corporativa no tenant Microsoft sem persistir tokens de acesso no navegador ou acoplar o domínio patrimonial ao provedor OAuth.

### ADR-006: workspace empresarial compartilhado

**Decisão:** usar uma chave aleatória secreta por empresa em vez de derivar o workspace do e-mail de cada usuário.

**Motivo:** os operadores autorizados precisam colaborar sobre o mesmo inventário; a identidade individual continua registrada como ator de cada movimento.
