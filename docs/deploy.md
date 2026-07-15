# Deploy

## OpenAI Sites

O projeto usa Vinext e possui configuração de hosting em `.openai/hosting.json`.

1. Crie um projeto Sites e associe seu `project_id` ao arquivo de hosting.
2. Confirme o binding D1 `DB`.
3. Execute `pnpm install --frozen-lockfile`.
4. Rode `pnpm test`, `pnpm lint`, `pnpm typecheck` e `pnpm build`.
5. Publique o conteúdo de `dist` com a configuração `.openai`.
6. Aguarde o status de deploy `READY` antes de divulgar a URL.

A tabela `workspaces` é criada defensivamente na primeira operação D1. A migration equivalente está em `db/migrations/0001_workspaces.up.sql`, com rollback em `0001_workspaces.down.sql`.

## Verificações pós-deploy

```bash
curl -I https://SEU-DOMINIO/demo/
curl https://SEU-DOMINIO/api/state
curl -i -X POST https://SEU-DOMINIO/api/state \
  -H "content-type: application/json" \
  -d '{"type":"update_status"}'
```

Resultados esperados:

- `/demo/`: HTTP `200` e interface estática.
- `GET /api/state`: HTTP `200`, sessão anônima e seed público.
- `POST /api/state` sem login: HTTP `401`.
- Certificado TLS válido e ausência de redirecionamento para domínio desconhecido.

## Cloudflare fora do Sites

Para implantação direta no Cloudflare Workers:

1. Crie uma base D1.
2. Substitua o `database_id` placeholder da configuração local pelo ID real no ambiente de deploy.
3. Aplique `db/migrations/0001_workspaces.up.sql`.
4. Configure a autenticação e os cabeçalhos confiáveis equivalentes aos usados pela aplicação.
5. Faça o build e deploy com Wrangler.

Não exponha `oai-authenticated-user-email` a partir de um proxy controlado pelo cliente. Fora do Sites, implemente um provedor de identidade que assine e valide a sessão no servidor.

## Checklist de produção

- [ ] Associação entre usuário, empresa e função.
- [ ] RBAC para leitura, cadastro, transferência, baixa e auditoria.
- [ ] Isolamento por tenant no schema e nas consultas.
- [ ] Controle de concorrência por revisão ou transações relacionais.
- [ ] Backup, retenção e exportação dos dados patrimoniais.
- [ ] Logs estruturados sem dados pessoais desnecessários.
- [ ] Política de anexos e antivírus caso R2 seja habilitado.
