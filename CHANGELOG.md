# Changelog

Todas as alterações relevantes do Patrimônio Ops Control são registradas neste arquivo.
O formato segue Keep a Changelog e as versões usam Semantic Versioning.

## [0.6.0] - 2026-08-04

### Adicionado

- Aba **Criar cadastro** na tela de login, com nome, e-mail, nome de usuário, senha e descrição da área.
- Painel **Cadastros aguardando aprovação** no módulo **Ambientes**, onde o administrador define função, permissões e departamentos ao aprovar, ou recusa com parecer.
- Rota pública `POST /api/auth/register` e operações `register_access_request` e `review_access_request` no gateway.

### Segurança

- O autocadastro não concede acesso: grava apenas uma solicitação pendente, e a identidade criada no Supabase Auth permanece inerte até a aprovação.
- Senhas continuam fora das tabelas da aplicação; a rota pública repete as proteções do login por senha e limita a 3 solicitações por identificador e 10 por rede a cada hora.
- A distinção entre cadastro pendente e credencial inválida só aparece depois que a senha informada é verificada.
- Cada solicitação é analisada uma única vez, sob trava de linha, e a recusa apaga a identidade criada no Supabase Auth.
- O formulário público não expõe a lista de departamentos.

## [0.5.0] - 2026-08-04

### Adicionado

- Login por nome de usuário ou e-mail e senha, com verificação exclusiva pelo Supabase Auth e Google mantido como alternativa.
- Administração de username, senha inicial, redefinição e desativação de credenciais no módulo **Ambientes**.

### Segurança

- Senhas e tokens do Supabase Auth não são persistidos nas tabelas da aplicação nem enviados ao navegador.
- Tentativas são limitadas por identificador e rede usando chaves HMAC, com resposta genérica contra enumeração de contas.
- Alterações de credencial revogam sessões da aplicação e geram eventos de auditoria.
- Contas Auth externas ao Patrimônio Ops não podem ser redefinidas pelo gateway.
- `postcss` transitivo atualizado para `8.5.23`, corrigindo o alerta moderado `GHSA-fxqj-rqcc-2cmp`.

## [0.4.0] - 2026-08-03

### Adicionado

- Matriz executável de fontes oficiais por domínio, visível para administradores em **Operações > Integrações > Fontes oficiais**.
- Governança documentada para Sabium, Patrimônio Ops, RH/diretório, ITSM, telemetria, MDM, identidade e auditoria.
- Conciliação automática quando o Sabium diverge de campos operacionais protegidos.
- Prévia de importação XLSX com contagem de ativos novos, alterados, inalterados e campos operacionais afetados.

### Alterado

- A carga Sabium reconhece o ativo pelo par patrimônio-base mais incorporação e atualiza somente campos fiscais e de origem.
- Responsável, núcleo, localização, status, série, classificação, marca/modelo e observações não são mais sobrescritos pela carga Sabium.
- A importação XLSX operacional exige confirmação explícita antes de atualizar campos já existentes.
- Núcleos existentes não são mais substituídos pelos placeholders da planilha ou do Sabium.

### Segurança

- A matriz de fontes oficiais tem RLS habilitado e não aceita acesso direto de `anon` ou `authenticated`.
- Alterações de origem Sabium geram movimento de importação; divergências abertas não são duplicadas por reprocessamento.

## [0.3.1] - 2026-08-03

### Alterado

- Auditores passam a consultar automaticamente todos os departamentos ativos, inclusive os criados no futuro.
- A administração de usuários usa a RPC `patrimonio_save_user_access_v4`; vínculos explícitos de departamento permanecem somente para operadores.
- O formulário de acesso identifica administradores e auditores como perfis de alcance global.

### Segurança

- O alcance global do auditor não concede escrita, importação, transferência entre departamentos nem administração de acessos.
- A autorização global do auditor é validada no gateway e no Postgres; a interface não é a fonte da permissão.
- Vínculos individuais antigos de contas de auditoria são removidos para evitar dois modelos de autorização concorrentes.

## [0.3.0] - 2026-08-03

### Adicionado

- Função formal de auditor, separada do administrador global e vinculada explicitamente aos departamentos autorizados.
- Matriz documentada de responsabilidades para administrador, auditor e operador.
- Identificação visual do perfil de auditoria e modo de acompanhamento sem controles de mutação.

### Alterado

- `fabiano.audit@gmail.com` passou de administrador para auditor dos departamentos Atendimento ao Cliente e Gazin LOG.
- A administração de usuários usa a RPC `patrimonio_save_user_access_v3`, com escolha exclusiva de função.
- Exportações do auditor continuam autorizadas e registram a função na auditoria de segurança.

### Segurança

- Restrição no Postgres impede auditor de acumular administração, escrita ou importação.
- Gateway aplica defesa adicional e registra operações negadas em transação separada antes de devolver `403`.
- Dados financeiros, integrações, administração de acessos e transferências entre departamentos permanecem exclusivos de administradores.
- Alterações patrimoniais, baixas e mudanças ou remoções de evidências permanecem bloqueadas para auditores.

## [0.2.0] - 2026-08-03

### Adicionado

- Ambientes isolados por departamento, incluindo Atendimento ao Cliente e Gazin LOG.
- Autorização individual por departamento e permissões independentes de alteração, importação e exportação.
- Integração de ativos do Sabium com código-base, incorporação, identificador de origem, grupo e filial.
- Patrimônios de frota no padrão `número-da-frota.0`, exclusivos do ambiente Gazin LOG.
- Tipos empresariais adicionais, imagens realistas e geração de etiquetas QR.
- Central avançada de operações com inventário cíclico, custódia, manutenção, rastreamento e ciclo de vida.
- Fila mínima de conferência offline com sincronização posterior.
- Documentos privados, garantias, contratos, inspeções, reservas, kits e dados contábeis.
- Registros de integrações externas sem exposição de segredos ao cliente.
- Estrutura de banco para geocercas e alertas automáticos de bateria baixa; a API e a interface para administrar esses registros permanecem fora desta versão.
- Migrações e RPCs transacionais para controles operacionais e ciclo de vida avançado.

### Alterado

- Interface reorganizada como aplicação empresarial responsiva com navegação em header.
- Autenticação restrita ao Google OpenID Connect com PKCE e sessão local `HttpOnly`.
- Visitantes sem sessão são direcionados ao login antes de acessar a área operacional.
- Dados financeiros são projetados apenas para administradores.
- Importador e gateway passaram a percorrer bases acima do limite padrão de mil registros.

### Segurança

- RLS habilitado e acesso direto negado aos papéis públicos nas tabelas patrimoniais.
- Gateway servidor-servidor protegido por HMAC, timestamp, nonce e rate limit.
- Câmera liberada pela política de permissões somente para leitura QR.
- Documentos armazenados em bucket privado com checksum e URLs assinadas de curta duração.
- Auditoria de login, permissões, exportações e mutações patrimoniais.

### Operação

- Estado local anterior à consolidação preservado na branch `recovery/pre-consolidation-2026-08-03`.
- Release consolidada sobre os commits validados pela integração contínua da `main`.

[0.2.0]: https://github.com/Kenjihidehira/patrimonio-ops-control/releases/tag/v0.2.0
[0.3.0]: https://github.com/Kenjihidehira/patrimonio-ops-control/releases/tag/v0.3.0
[0.3.1]: https://github.com/Kenjihidehira/patrimonio-ops-control/releases/tag/v0.3.1
[0.4.0]: https://github.com/Kenjihidehira/patrimonio-ops-control/releases/tag/v0.4.0
