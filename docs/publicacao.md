# Publicação

## 1. Preparar o Supabase

1. Crie um projeto Supabase.
2. Aplique, em ordem, as migrações de `supabase/migrations`.
3. Gere um segredo aleatório com pelo menos 64 caracteres.
4. Cadastre o segredo como `PATRIMONIO_GATEWAY_KEY` no ambiente das Edge Functions.
5. Publique `supabase/functions/patrimonio-gateway` com verificação JWT desativada somente porque a função implementa autenticação própria por `x-patrimonio-key`.

O esquema habilita RLS e nega acesso direto aos papéis `anon` e `authenticated`. Não substitua essa configuração por políticas abertas: a aplicação acessa os dados exclusivamente pelo serviço intermediário servidor-servidor.

## 2. Registrar o aplicativo OAuth do GitHub

1. No GitHub, abra **Configurações > Configurações do desenvolvedor > Aplicativos OAuth > Novo aplicativo OAuth**.
2. Use `Patrimônio Ops Control` como nome.
3. Use `https://patrimonio-ops-control.kenjihidehira999.workers.dev` como URL da página inicial.
4. Cadastre a URL de retorno exata `https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/github/callback`.
5. Gere um segredo do cliente e copie o valor no momento da criação.

O aplicativo não solicita escopos de repositório nem de e-mail. O token temporário serve somente para consultar o perfil público autenticado em `/user`; a lista de autorizados decide quem pode abrir a base empresarial.

## 3. Registrar o Google OAuth

No Google Cloud Console, crie um cliente OAuth do tipo Aplicativo da Web com a URL de retorno exata:

```text
https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/google/callback
```

Mantenha `GOOGLE_ALLOWED_EMAILS` como lista fechada de e-mails. Não use apenas o domínio `gmail.com` como autorização.

## 4. Configurar o Cloudflare Worker

O projeto usa Vinext e possui configuração nativa em `wrangler.jsonc`.

Autentique o Wrangler e confirme a conta antes da primeira publicação:

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
```

`SUPABASE_GATEWAY_URL` e `GITHUB_ALLOWED_LOGINS` ficam em `wrangler.jsonc`. Cadastre credenciais, segredos e a lista de e-mails Google autorizados diretamente no Worker:

```text
SUPABASE_GATEWAY_KEY=O_MESMO_SEGREDO_DA_EDGE_FUNCTION
PATRIMONIO_WORKSPACE_KEY=64_CARACTERES_HEXADECIMAIS_ALEATORIOS
GITHUB_CLIENT_ID=CLIENT_ID_DO_OAUTH_APP
GITHUB_CLIENT_SECRET=CLIENT_SECRET_DO_OAUTH_APP
GOOGLE_CLIENT_ID=CLIENT_ID_DO_GOOGLE
GOOGLE_CLIENT_SECRET=CLIENT_SECRET_DO_GOOGLE
GOOGLE_ALLOWED_EMAILS=EMAILS_AUTORIZADOS_SEPARADOS_POR_VIRGULA
AUTH_SESSION_SECRET=SEGREDO_ALEATORIO_COM_PELO_MENOS_64_CARACTERES
```

Use `pnpm exec wrangler secret put NOME_DA_VARIAVEL` para cada valor. Não grave segredos no `wrangler.jsonc`, no Git ou em variáveis com prefixos `NEXT_PUBLIC_` ou `VITE_`.

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

## Verificações após a publicação

```bash
curl -I https://patrimonio-ops-control.kenjihidehira999.workers.dev/demo
curl -I https://patrimonio-ops-control.kenjihidehira999.workers.dev/login
curl https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/state
curl -I "https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/github/login?return_to=%2Fdemo"
curl -I "https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/auth/google/login?return_to=%2Fdemo"
curl -I https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/export
curl -i -X POST https://patrimonio-ops-control.kenjihidehira999.workers.dev/api/state \
  -H "content-type: application/json" \
  -d '{"type":"update_status","expectedRevision":0}'
```

Resultados esperados:

- `/demo`: HTTP `200` e interface React operacional.
- `/login`: HTTP `200` e opções GitHub e Google.
- `GET /api/state`: HTTP `200`, sessão anônima e projeção vazia (`source = locked`).
- Cada login retorna HTTP `302` para o provedor quando suas credenciais estão configuradas; uma configuração ausente retorna para `/login` com erro controlado.
- `GET /api/export` sem login: HTTP `401`; autenticado: HTTP `200` e conteúdo XLSX da base empresarial.
- `POST /api/state` sem login: HTTP `401`.
- O serviço intermediário sem `x-patrimonio-key` retorna `401`.
- O Supabase Security Advisor não aponta tabelas públicas sem RLS.

## Rotação do segredo

1. Gere um novo valor.
2. Atualize `PATRIMONIO_GATEWAY_KEY` no Supabase.
3. Atualize `SUPABASE_GATEWAY_KEY` no Cloudflare Worker.
4. Publique uma nova versão da Função Edge e do site.
5. Verifique leitura autenticada antes de descartar o segredo anterior.

A Função Edge aceita a chave configurada e, durante a transição atual, o resumo criptográfico SHA-256 da chave rotacionada. Depois que todos os consumidores usarem a nova chave, remova a chave anterior e o resumo de transição em uma nova publicação para encerrar a janela de compatibilidade.

## Domínio personalizado

Para usar um domínio próprio, adicione-o em **Workers e Pages > patrimonio-ops-control > Domínios** e atualize as três URLs de retorno antes de remover a URL `workers.dev`. Não aceite identidade enviada pelo cliente e não exponha os segredos na interface.

GitHub Pages não substitui o Worker neste projeto. O serviço `github.io` publica arquivos estáticos, mas não executa as rotas `/api`, não emite cookies `HttpOnly` e não pode guardar os segredos do Supabase ou do aplicativo OAuth. Dividir a interface em `github.io` e a API em `workers.dev` também criaria uma sessão entre sites dependente de cookies de terceiros. Por isso, o GitHub permanece como repositório e integração contínua (CI); o ambiente de execução fica no Worker.

## Checklist de produção

- [x] Restrição por lista de logins GitHub e e-mails Google autorizados.
- [ ] Controle de acesso por papéis (RBAC) entre administrador, operador e auditor.
- [ ] Controle de acesso por papéis para leitura, cadastro, transferência, baixa, importação e auditoria.
- [x] Isolamento da base por chave empresarial secreta.
- [x] Controle de concorrência por revisão e transações relacionais.
- [x] Exportação XLSX do inventário e da auditoria.
- [ ] Cópia de segurança gerenciada, retenção e teste de restauração.
- [ ] Logs estruturados sem dados pessoais desnecessários.
- [ ] Monitoramento de disponibilidade do serviço intermediário e latência das RPCs.
