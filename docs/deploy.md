# Deploy

## 1. Preparar o Supabase

1. Crie um projeto Supabase.
2. Aplique, em ordem, as migrations de `supabase/migrations`.
3. Gere um segredo aleatório com pelo menos 64 caracteres.
4. Cadastre o segredo como `PATRIMONIO_GATEWAY_KEY` no ambiente das Edge Functions.
5. Publique `supabase/functions/patrimonio-gateway` com verificação JWT desativada somente porque a função implementa autenticação própria por `x-patrimonio-key`.

O schema habilita RLS e nega acesso direto aos papéis `anon` e `authenticated`. Não substitua essa configuração por políticas abertas: a aplicação acessa os dados exclusivamente pelo gateway servidor-servidor.

## 2. Registrar o aplicativo Microsoft Entra

1. No Microsoft Entra ID, registre um aplicativo Web de locatário único.
2. Cadastre a Redirect URI exata `https://patrimonio-ops-control.dadosepesquisa.chatgpt.site/api/auth/microsoft/callback`.
3. Crie um Client Secret e copie o **valor** no momento da criação; não use o identificador do segredo.
4. Anote o Directory (Tenant) ID e o Application (Client) ID.

O aplicativo solicita somente os escopos OIDC `openid profile email`. Não é necessário conceder acesso ao Microsoft Graph.

## 3. Configurar o OpenAI Sites

O projeto usa Vinext e possui configuração em `.openai/hosting.json`.

Defina estas variáveis no runtime do Sites:

```text
SUPABASE_GATEWAY_URL=https://SEU-PROJETO.supabase.co/functions/v1/patrimonio-gateway
SUPABASE_GATEWAY_KEY=O_MESMO_SEGREDO_DA_EDGE_FUNCTION
PATRIMONIO_WORKSPACE_KEY=64_CARACTERES_HEXADECIMAIS_ALEATORIOS
MICROSOFT_TENANT_ID=SEU_DIRECTORY_TENANT_ID
MICROSOFT_CLIENT_ID=SEU_APPLICATION_CLIENT_ID
MICROSOFT_CLIENT_SECRET=VALOR_DO_CLIENT_SECRET
MICROSOFT_ALLOWED_DOMAINS=gazin.com.br
AUTH_SESSION_SECRET=SEGREDO_ALEATORIO_COM_PELO_MENOS_64_CARACTERES
```

`SUPABASE_GATEWAY_KEY`, `PATRIMONIO_WORKSPACE_KEY`, `MICROSOFT_CLIENT_SECRET` e `AUTH_SESSION_SECRET` devem ser marcadas como secretas. Não use prefixos `NEXT_PUBLIC_` ou `VITE_`.

## 4. Validar e publicar

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
```

Publique o conteúdo de `dist` no projeto Sites e aguarde o deploy chegar a `READY`.

## Verificações pós-deploy

```bash
curl -I https://SEU-DOMINIO/demo/
curl https://SEU-DOMINIO/api/state
curl -I "https://SEU-DOMINIO/api/auth/microsoft/login?return_to=%2Fdemo%2Findex.html"
curl -I https://SEU-DOMINIO/api/export
curl -i -X POST https://SEU-DOMINIO/api/state \
  -H "content-type: application/json" \
  -d '{"type":"update_status","expectedRevision":0}'
```

Resultados esperados:

- `/demo/`: HTTP `200` e interface operacional.
- `GET /api/state`: HTTP `200`, sessão anônima e seed público.
- Login Microsoft: HTTP `302` para `login.microsoftonline.com` quando as credenciais Entra estão configuradas.
- `GET /api/export`: HTTP `200` e conteúdo XLSX.
- `POST /api/state` sem login: HTTP `401`.
- O gateway sem `x-patrimonio-key` retorna `401`.
- O Supabase Security Advisor não aponta tabelas públicas sem RLS.

## Rotação do segredo

1. Gere um novo valor.
2. Atualize `PATRIMONIO_GATEWAY_KEY` no Supabase.
3. Atualize `SUPABASE_GATEWAY_KEY` no Sites.
4. Publique uma nova versão da Edge Function e do site.
5. Verifique leitura autenticada antes de descartar o segredo anterior.

Como a Edge Function aceita um único valor, as etapas 2 a 4 devem ocorrer em janela curta de manutenção. Para rotação sem indisponibilidade, evolua a função para aceitar chaves `current` e `next` durante a transição.

## Implantação fora do Sites

O fluxo Microsoft pode ser mantido, mas a Redirect URI do novo domínio deve ser cadastrada no Entra e as mesmas variáveis precisam existir no runtime do servidor. Não aceite identidade enviada pelo cliente e não exponha os segredos com prefixos públicos.

## Checklist de produção

- [x] Restrição por tenant Microsoft, domínio corporativo e workspace empresarial.
- [ ] RBAC entre administrador, operador e auditor.
- [ ] RBAC para leitura, cadastro, transferência, baixa, importação e auditoria.
- [x] Isolamento da base por chave empresarial secreta.
- [x] Controle de concorrência por revisão e transações relacionais.
- [x] Exportação XLSX do inventário e da auditoria.
- [ ] Backup gerenciado, retenção e teste de restauração.
- [ ] Logs estruturados sem dados pessoais desnecessários.
- [ ] Monitoramento de disponibilidade do gateway e latência das RPCs.
