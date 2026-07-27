# API

Base local: `http://localhost:5173/api`

Respostas dinâmicas usam `cache-control: no-store`. A identidade vem de uma sessão local assinada após o servidor concluir o fluxo OpenID Connect do Google e validar a conta.

## Autenticação

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/api/auth/google/login` | Iniciar o código de autorização do Google com `state`, PKCE e `nonce` |
| `GET` | `/api/auth/google/callback` | Validar retorno OpenID Connect, identidade e lista de autorizados; criar sessão `HttpOnly` |
| `GET` | `/api/auth/logout` | Encerrar a sessão local |

`return_to` aceita apenas caminhos relativos locais e nunca pode apontar para as próprias rotas de autenticação.

## `GET /api/state`

Retorna revisão, resumo, inventário filtrado, colaboradores, núcleos, auditoria, histórico de importações, catálogos e contexto da sessão.

### Parâmetros de consulta

| Parâmetro | Valores | Padrão |
| --- | --- | --- |
| `search` | Texto livre | vazio |
| `type` | `cpu`, `monitor_1`, `monitor_2`, `chair`, `notebook` | `all` |
| `status` | `available`, `allocated`, `maintenance`, `discrepancy`, `retired` | `all` |
| `nucleus` | Identificador de núcleo | `all` |
| `sort` | `recent`, `asset_asc`, `nucleus`, `status` | `recent` |
| `department` | Slug de um departamento liberado ao usuário | primeiro departamento autorizado |

Usuários anônimos recebem uma projeção vazia. Contas Google ativas recebem apenas os departamentos vinculados ao usuário; administradores globais podem acessar todos.

## `/api/departments`

- `GET`: carrega os núcleos e a revisão do departamento de destino autorizado.
- `POST save_user_access`: administrador ativa ou desativa usuário, libera departamentos e define permissões de alteração, importação e exportação.
- `POST transfer_department_entity`: administrador transfere patrimônio ou colaborador com seus itens, preservando auditoria.

## `POST /api/state`

Exige autenticação e permissão de alteração. Toda ação inclui `expectedRevision`; o ator é obtido da sessão.

### Cadastrar patrimônio

```json
{
  "type": "create_asset",
  "expectedRevision": 3,
  "asset": {
    "id": "654321",
    "type": "notebook",
    "nucleusId": "nuc-ti",
    "status": "available",
    "brandModel": "Lenovo ThinkPad E14",
    "serial": "LN-E14-9931",
    "acquiredAt": "2026-07-15",
    "assignee": "",
    "location": "Cofre de equipamentos",
    "notes": "Reserva técnica"
  }
}
```

### Transferir patrimônio

```json
{
  "type": "transfer_asset",
  "expectedRevision": 4,
  "assetId": "104293",
  "nucleusId": "nuc-rh",
  "location": "Mesa RH-05",
  "assignee": "Renata Melo",
  "note": "Equipamento destinado à integração do novo colaborador"
}
```

### Atualizar status

```json
{
  "type": "update_status",
  "expectedRevision": 5,
  "assetId": "104281",
  "status": "maintenance",
  "note": "Falha de inicialização confirmada pelo suporte"
}
```

### Alterar número patrimonial

```json
{
  "type": "update_asset_identifier",
  "expectedRevision": 6,
  "assetId": "S1A2B3",
  "newAssetId": "654320",
  "note": "Etiqueta aplicada após conferência física"
}
```

`newAssetId` aceita somente seis dígitos e precisa ser único no ambiente empresarial. A operação preserva núcleo, responsável, localização e movimentos anteriores, além de registrar a troca na auditoria.

### Editar dados cadastrais do item

```json
{
  "type": "update_asset_details",
  "expectedRevision": 7,
  "assetId": "104281",
  "asset": {
    "type": "notebook",
    "brandModel": "Dell Latitude 5550",
    "serial": "BR-LAT-0042",
    "assignee": "João Martins",
    "location": "Matriz - estação 42",
    "acquiredAt": "2026-07-20",
    "notes": "Conferido fisicamente"
  },
  "note": "Cadastro corrigido durante inventário do núcleo"
}
```

A operação exige uma alteração real e um motivo. Patrimônio, núcleo e status não fazem parte desse corpo da requisição: esses dados usam os fluxos próprios de identificação, transferência e status para manter a trilha de auditoria consistente.

### Criar núcleo

```json
{
  "type": "create_nucleus",
  "expectedRevision": 6,
  "nucleus": {
    "id": "nuc-juridico",
    "code": "JUR",
    "name": "Jurídico",
    "location": "Matriz - 2º andar",
    "manager": "Renata Melo"
  }
}
```

### Editar núcleo

```json
{
  "type": "update_nucleus",
  "expectedRevision": 7,
  "nucleus": {
    "id": "nuc-juridico",
    "code": "J",
    "name": "Jurídico",
    "location": "Matriz - 2º andar",
    "manager": "Renata Melo"
  }
}
```

### Editar colaborador

```json
{
  "type": "update_collaborator",
  "expectedRevision": 8,
  "collaborator": {
    "id": "col-joao-martins",
    "name": "João da Silva Martins",
    "nucleusId": "nuc-ti"
  }
}
```

Uma alteração de nome atualiza as atribuições existentes na mesma transação. Alterar o núcleo do perfil não transfere patrimônios automaticamente; transferências continuam exigindo a ação auditável específica.

## `POST /api/import`

Exige autenticação, permissão de importação e recebe `multipart/form-data`.

| Campo | Valores | Obrigatório |
| --- | --- | --- |
| `file` | Arquivo `.xlsx` de até 2 MB | sim |
| `mode` | `preview` ou `commit` | sim |
| `revision` | Revisão inteira conhecida pelo cliente | apenas em `commit` |

Prévia:

```bash
curl -X POST http://localhost:5173/api/import \
  -F "mode=preview" \
  -F "file=@patrimonios.xlsx"
```

Resposta resumida:

```json
{
  "totalCandidates": 373,
  "acceptedCount": 361,
  "untaggedCount": 42,
  "rejectedCount": 12,
  "adjustedCount": 9,
  "nucleusCount": 10,
  "collaboratorCount": 102,
  "canCommit": true,
  "errors": [],
  "warnings": []
}
```

Na confirmação, o arquivo é reprocessado e a revisão é comparada dentro da transação. A resposta informa `revision`, `inserted`, `updated`, `rejected` e `collaborators`.

## `GET /api/export`

Gera um `.xlsx` sem preços de aquisição e com quatro abas:

- `Inventário`
- `Núcleos`
- `Auditoria`
- `Importações`

Exige autenticação e permissão explícita de exportação. A autorização e o departamento são registrados na auditoria de segurança; requisições anônimas recebem `401` e perfis sem permissão recebem `403`.

## Códigos de resposta

| Código | Situação |
| --- | --- |
| `200` | Leitura, prévia ou mutação concluída |
| `400` | Corpo da requisição, modo ou arquivo inválido |
| `401` | Sessão não autenticada para escrita |
| `403` | Departamento ou operação não autorizado para o perfil |
| `409` | Revisão obsoleta; recarregamento necessário |
| `413` | Arquivo vazio, maior que 2 MB ou planilha acima dos limites estruturais |
| `415` | Formato diferente de `.xlsx` |
| `422` | Regra de domínio violada ou importação sem linhas válidas |
| `429` | Limite de requisições, importações ou exportações atingido |
| `500` | Falha inesperada de infraestrutura |
