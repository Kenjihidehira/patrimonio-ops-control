# Deploy

## 1. Preparar o Supabase

1. Crie um projeto Supabase.
2. Aplique, em ordem, as migrations de `supabase/migrations`.
3. Gere um segredo aleatório com pelo menos 64 caracteres.
4. Cadastre o segredo como `PATRIMONIO_GATEWAY_KEY` no ambiente das Edge Functions.
5. Publique `supabase/functions/patrimonio-gateway` com verificação JWT desativada somente porque a função implementa autenticação própria por `x-patrimonio-key`.

O schema habilita RLS e nega acesso direto aos papéis `anon` e `authenticated`. Não substitua essa configuração por políticas abertas: a aplicação acessa os dados exclusivamente pelo gateway servidor-servidor.

## 2. Configurar o OpenAI Sites

O projeto usa Vinext e possui configuração em `.openai/hosting.json`.

Defina estas variáveis no runtime do Sites:

```text
SUPABASE_GATEWAY_URL=https://SEU-PROJETO.supabase.co/functions/v1/patrimonio-gateway
SUPABASE_GATEWAY_KEY=O_MESMO_SEGREDO_DA_EDGE_FUNCTION
```

`SUPABASE_GATEWAY_KEY` deve ser marcada como secreta. Não use prefixos `NEXT_PUBLIC_` ou `VITE_`.

## 3. Validar e publicar

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
curl -I https://SEU-DOMINIO/api/export
curl -i -X POST https://SEU-DOMINIO/api/state \
  -H "content-type: application/json" \
  -d '{"type":"update_status","expectedRevision":0}'
```

Resultados esperados:

- `/demo/`: HTTP `200` e interface operacional.
- `GET /api/state`: HTTP `200`, sessão anônima e seed público.
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

Fora do OpenAI Sites, substitua Sign in with ChatGPT por um provedor que valide a sessão no servidor. Nunca aceite `oai-authenticated-user-email` de um proxy controlado pelo cliente.

O gateway e o schema podem ser mantidos. A nova camada de autenticação deve fornecer uma identidade verificada para derivação do tenant e registro do ator.

## Checklist de produção

- [ ] Associação entre usuário, empresa e função.
- [ ] RBAC para leitura, cadastro, transferência, baixa, importação e auditoria.
- [x] Isolamento por tenant nas consultas e chaves.
- [x] Controle de concorrência por revisão e transações relacionais.
- [x] Exportação XLSX do inventário e da auditoria.
- [ ] Backup gerenciado, retenção e teste de restauração.
- [ ] Logs estruturados sem dados pessoais desnecessários.
- [ ] Monitoramento de disponibilidade do gateway e latência das RPCs.
