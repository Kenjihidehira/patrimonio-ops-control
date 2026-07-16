# Deploy

## 1. Preparar o Supabase

1. Crie um projeto Supabase.
2. Aplique, em ordem, as migrations de `supabase/migrations`.
3. Gere um segredo aleatório com pelo menos 64 caracteres.
4. Cadastre o segredo como `PATRIMONIO_GATEWAY_KEY` no ambiente das Edge Functions.
5. Publique `supabase/functions/patrimonio-gateway` com verificação JWT desativada somente porque a função implementa autenticação própria por `x-patrimonio-key`.

O schema habilita RLS e nega acesso direto aos papéis `anon` e `authenticated`. Não substitua essa configuração por políticas abertas: a aplicação acessa os dados exclusivamente pelo gateway servidor-servidor.

## 2. Registrar o GitHub OAuth App

1. Abra **GitHub > Settings > Developer settings > OAuth Apps > New OAuth App**.
2. Use `Patrimônio Ops Control` como nome.
3. Use `https://patrimonio-ops-control.kenjihidehira999.workers.dev` como Homepage URL.
4. Cadastre a callback exata `https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/github/callback`.
5. Gere um Client Secret e copie o valor no momento da criação.

O aplicativo não solicita escopos de repositório nem de e-mail. O token temporário serve somente para consultar o perfil público autenticado em `/user`; a allowlist decide quem pode abrir a base empresarial.

## 3. Registrar Microsoft Entra e Google

Crie uma aplicação web no Microsoft Entra ID usando a callback exata:

```text
https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/microsoft/callback
```

Use um tenant específico. A aplicação solicita somente `openid profile email`; `MICROSOFT_ALLOWED_DOMAINS` restringe o acesso depois da validação do tenant e do ID token.

No Google Cloud Console, crie um OAuth Client do tipo Web application com a callback exata:

```text
https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/google/callback
```

Mantenha `GOOGLE_ALLOWED_EMAILS` como lista fechada de e-mails. Não use apenas o domínio `gmail.com` como autorização.

## 4. Configurar o Cloudflare Worker

O projeto usa Vinext e possui configuração nativa em `wrangler.jsonc`.

Autentique o Wrangler e confirme a conta antes do primeiro deploy:

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

`SUPABASE_GATEWAY_URL`, `GITHUB_ALLOWED_LOGINS`, `MICROSOFT_ALLOWED_DOMAINS` e `GOOGLE_ALLOWED_EMAILS` ficam em `wrangler.jsonc`. Cadastre credenciais e segredos no Worker:

```text
SUPABASE_GATEWAY_KEY=O_MESMO_SEGREDO_DA_EDGE_FUNCTION
PATRIMONIO_WORKSPACE_KEY=64_CARACTERES_HEXADECIMAIS_ALEATORIOS
GITHUB_CLIENT_ID=CLIENT_ID_DO_OAUTH_APP
GITHUB_CLIENT_SECRET=CLIENT_SECRET_DO_OAUTH_APP
MICROSOFT_TENANT_ID=TENANT_ID_DO_ENTRA
MICROSOFT_CLIENT_ID=CLIENT_ID_DO_ENTRA
MICROSOFT_CLIENT_SECRET=CLIENT_SECRET_DO_ENTRA
GOOGLE_CLIENT_ID=CLIENT_ID_DO_GOOGLE
GOOGLE_CLIENT_SECRET=CLIENT_SECRET_DO_GOOGLE
AUTH_SESSION_SECRET=SEGREDO_ALEATORIO_COM_PELO_MENOS_64_CARACTERES
```

Use `pnpm exec wrangler secret put NOME_DA_VARIAVEL` para cada valor. Não grave secrets no `wrangler.jsonc`, no Git ou em variáveis com prefixos `NEXT_PUBLIC_` ou `VITE_`.

## 5. Validar e publicar

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
pnpm deploy:cloudflare
```

O endereço de produção é `https://patrimonio-ops-control.kenjihidehira999.workers.dev`.

## Verificações pós-deploy

```bash
curl -I https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo/
curl -I https://patrimonio-ops-control.kenjihidehira999.workers.dev/login/
curl https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/state
curl -I "https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/github/login?return_to=%2Fdemo%2Findex.html"
curl -I "https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/microsoft/login?return_to=%2Fdemo%2Findex.html"
curl -I "https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/google/login?return_to=%2Fdemo%2Findex.html"
curl -I https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/export
curl -i -X POST https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/state \
  -H "content-type: application/json" \
  -d '{"type":"update_status","expectedRevision":0}'
```

Resultados esperados:

- `/demo/`: HTTP `200` e interface operacional.
- `/login/`: HTTP `200` e opções GitHub, Microsoft e Google.
- `GET /api/state`: HTTP `200`, sessão anônima e projeção vazia (`source = locked`).
- Cada login retorna HTTP `302` para o provedor quando suas credenciais estão configuradas; configuração ausente retorna para `/login/` com erro controlado.
- `GET /api/export` sem login: HTTP `401`; autenticado: HTTP `200` e conteúdo XLSX da base empresarial.
- `POST /api/state` sem login: HTTP `401`.
- O gateway sem `x-patrimonio-key` retorna `401`.
- O Supabase Security Advisor não aponta tabelas públicas sem RLS.

## Rotação do segredo

1. Gere um novo valor.
2. Atualize `PATRIMONIO_GATEWAY_KEY` no Supabase.
3. Atualize `SUPABASE_GATEWAY_KEY` no Cloudflare Worker.
4. Publique uma nova versão da Edge Function e do site.
5. Verifique leitura autenticada antes de descartar o segredo anterior.

A Edge Function aceita a chave configurada e, durante a transição atual, o hash SHA-256 da chave rotacionada. Depois que todos os consumidores usarem a nova chave, remova a chave anterior e o hash de transição em uma nova publicação para encerrar a janela de compatibilidade.

## Domínio personalizado

Para usar um domínio próprio, adicione-o em **Workers & Pages > patrimonio-ops-control > Domains** e atualize as três callbacks antes de remover a URL `workers.dev`. Não aceite identidade enviada pelo cliente e não exponha os secrets no frontend.

GitHub Pages não substitui o Worker neste projeto. O serviço `github.io` publica arquivos estáticos, mas não executa as rotas `/api`, não emite cookies `HttpOnly` e não pode guardar os segredos do Supabase ou do OAuth App. Dividir a interface em `github.io` e a API em `workers.dev` também criaria sessão cross-site dependente de cookies de terceiros. Por isso, GitHub permanece como repositório e CI; o runtime fica no Worker.

## Checklist de produção

- [x] Restrição por allowlist de login GitHub, tenant/domínio Microsoft e e-mail Google.
- [ ] RBAC entre administrador, operador e auditor.
- [ ] RBAC para leitura, cadastro, transferência, baixa, importação e auditoria.
- [x] Isolamento da base por chave empresarial secreta.
- [x] Controle de concorrência por revisão e transações relacionais.
- [x] Exportação XLSX do inventário e da auditoria.
- [ ] Backup gerenciado, retenção e teste de restauração.
- [ ] Logs estruturados sem dados pessoais desnecessários.
- [ ] Monitoramento de disponibilidade do gateway e latência das RPCs.
