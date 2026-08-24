# Publicação

## 1. Preparar o Supabase

1. Crie um projeto Supabase.
2. Aplique, em ordem, as migrações de `supabase/migrations`.
3. Gere um segredo aleatório com pelo menos 64 caracteres.
4. Cadastre o segredo como `PATRIMONIO_GATEWAY_KEY` no ambiente das Edge Functions.
5. Publique `supabase/functions/patrimonio-gateway` com verificação JWT desativada somente porque a função valida assinatura HMAC, timestamp e nonce de uso único.
6. Mantenha o provedor de e-mail do Supabase Auth habilitado. As contas de senha são criadas confirmadas pelo gateway administrativo; cadastro público continua desnecessário.

O esquema habilita RLS e nega acesso direto aos papéis `anon` e `authenticated`. Não substitua essa configuração por políticas abertas: a aplicação acessa os dados exclusivamente pelo serviço intermediário servidor-servidor.

## 2. Registrar o Google OAuth

No Google Cloud Console, crie um cliente OAuth do tipo Aplicativo da Web com a URL de retorno exata:

```text
https://patrimonio-ops-control.vercel.app/api/auth/google/callback
```

Mantenha a tabela de usuários e associações por departamento como lista fechada. Não autorize automaticamente todo o domínio `gmail.com`.

Defina `GOOGLE_WORKSPACE_DOMAIN` somente depois de confirmar que todas as contas autorizadas pertencem ao Google Workspace corporativo. A validação do claim `hd` bloqueará contas Gmail externas.

O login por senha não exige segredos adicionais na aplicação. Depois da publicação, um administrador autenticado configura ou redefine a credencial em **Ambientes > Usuários e acessos**. Entregue a senha inicial por canal seguro; ela não pode ser recuperada ou exibida pelo Patrimônio Ops.

## 3. Configurar o projeto na Vercel

O projeto é Next.js padrão: a Vercel o reconhece sem configuração adicional. Não há `vercel.json`, e o build é o `next build`.

Autentique a interface de linha de comando e vincule o diretório:

```bash
pnpm dlx vercel login
```

```bash
pnpm dlx vercel link
```

Cadastre as variáveis de ambiente no projeto, em **Settings > Environment Variables**, para os ambientes de produção e de pré-visualização:

```text
SUPABASE_GATEWAY_URL=https://SEU_PROJETO.supabase.co/functions/v1/patrimonio-gateway
SUPABASE_GATEWAY_KEY=O_MESMO_SEGREDO_DA_EDGE_FUNCTION
GOOGLE_CLIENT_ID=CLIENT_ID_DO_GOOGLE
GOOGLE_CLIENT_SECRET=CLIENT_SECRET_DO_GOOGLE
AUTH_SESSION_SECRET=SEGREDO_ALEATORIO_COM_PELO_MENOS_64_CARACTERES
GOOGLE_WORKSPACE_DOMAIN=DOMINIO_WORKSPACE_CONFIRMADO_OU_VAZIO
```

Nenhum desses valores pode usar os prefixos `NEXT_PUBLIC_`: eles seriam expostos ao navegador. Também não devem ser gravados no Git — apenas em `.env.local`, ignorado pelo versionamento, para o ambiente local.

Os cabeçalhos de segurança e o Content Security Policy com nonce por requisição são aplicados em [`proxy.ts`](../proxy.ts), executado pela Vercel em toda requisição que renderiza HTML.

## 4. Validar e publicar

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
```

```bash
pnpm dlx vercel deploy --prod
```

Cada envio à branch `main` também dispara a publicação automática quando o repositório está conectado ao projeto na Vercel.

## Verificações após a publicação

```bash
curl -I https://patrimonio-ops-control.vercel.app/demo
curl -I https://patrimonio-ops-control.vercel.app/login
curl https://patrimonio-ops-control.vercel.app/api/state
curl -I "https://patrimonio-ops-control.vercel.app/api/auth/google/login?return_to=%2Fdemo"
curl -i -X POST https://patrimonio-ops-control.vercel.app/api/auth/credentials/login \
  -H "origin: https://patrimonio-ops-control.vercel.app" \
  -H "content-type: application/x-www-form-urlencoded" \
  --data-urlencode "login=conta-inexistente" \
  --data-urlencode "password=senha-invalida"
curl -I https://patrimonio-ops-control.vercel.app/api/export
curl -i -X POST https://patrimonio-ops-control.vercel.app/api/state \
  -H "content-type: application/json" \
  -d '{"type":"update_status","expectedRevision":0}'
```

Resultados esperados:

- `/demo` sem sessão: HTTP `307` para `/login?return_to=%2Fdemo`; autenticado: interface React operacional.
- `/login`: HTTP `200` e opções de acesso por usuário ou e-mail e por Google.
- Credenciais inválidas: HTTP `303` para `/login` com erro genérico; nenhuma informação confirma se a conta existe.
- `GET /api/state` sem sessão: HTTP `401` e `Cache-Control: no-store`; autenticado: estado do departamento autorizado.
- O login retorna HTTP `302` para o Google quando suas credenciais estão configuradas; uma configuração ausente retorna para `/login` com erro controlado.
- `GET /api/export` sem login: HTTP `401`; autenticado: HTTP `200` e conteúdo XLSX da base empresarial.
- `POST /api/state` sem login: HTTP `401`.
- O serviço intermediário sem assinatura HMAC válida retorna `401`.
- O Supabase Security Advisor não aponta tabelas públicas sem RLS.

## Rotação do segredo

1. Gere um novo valor.
2. Prepare uma versão temporária da Função Edge que aceite assinaturas com as duas chaves.
3. Atualize `SUPABASE_GATEWAY_KEY` na Vercel e republique a aplicacao.
4. Verifique leitura, escrita e auditoria autenticadas.
5. Atualize `PATRIMONIO_GATEWAY_KEY` e publique a Função Edge aceitando somente a nova chave.
6. Remova imediatamente a compatibilidade temporária.

Não mantenha hash ou chave anterior no código.

## Domínio personalizado

Para usar um domínio próprio, adicione-o em **Settings > Domains** no projeto da Vercel e atualize a URL de retorno do Google antes de remover a URL `vercel.app`. Não aceite identidade enviada pelo cliente e não exponha os segredos na interface.

GitHub Pages não substitui esta hospedagem. O serviço `github.io` publica arquivos estáticos, mas não executa as rotas `/api`, não emite cookies `HttpOnly` e não pode guardar os segredos do Supabase ou do aplicativo OAuth. Dividir a interface em `github.io` e a API em outro domínio também criaria uma sessão entre sites dependente de cookies de terceiros. Por isso, o GitHub permanece como repositório e integração contínua (CI); o ambiente de execução fica na Vercel.

## Checklist de produção

- [x] Restrição por lista interna de usuários autorizados nos dois provedores.
- [x] Senhas com hash exclusivo no Supabase Auth, rate limit e resposta sem enumeração de conta.
- [x] Separação entre administrador global, alteração, importação, exportação e leitura.
- [x] Desativação de usuário e revogação de sessão.
- [x] Auditoria de login, bloqueios, administração, importação e exportação.
- [x] Isolamento da base por chave empresarial secreta.
- [x] Assinatura HMAC, timestamp e nonce de uso único no gateway.
- [x] Controle de concorrência por revisão e transações relacionais.
- [x] Exportação XLSX do inventário e da auditoria.
- [ ] Confirmar cópia de segurança gerenciada, RPO/RTO e teste de restauração.
- [x] Retenção automática de registros técnicos vencidos.
- [x] Minimização de e-mails em movimentos e importações.
- [ ] Arquivar DPAs e mecanismo de transferência internacional.
- [ ] Monitoramento de disponibilidade do serviço intermediário e latência das RPCs.
