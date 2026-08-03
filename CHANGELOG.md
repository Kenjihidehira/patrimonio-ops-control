# Changelog

Todas as alterações relevantes do Patrimônio Ops Control são registradas neste arquivo.
O formato segue Keep a Changelog e as versões usam Semantic Versioning.

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
