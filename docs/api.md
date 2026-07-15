# API

Base local: `http://localhost:5173/api/state`

Todas as respostas usam JSON e `cache-control: no-store`.

## `GET /api/state`

Retorna resumo, inventário filtrado, núcleos, auditoria, catálogos e contexto da sessão.

### Query params

| Parâmetro | Valores | Padrão |
| --- | --- | --- |
| `search` | Texto livre | vazio |
| `type` | `cpu`, `monitor_1`, `monitor_2`, `chair`, `notebook` | `all` |
| `status` | `available`, `allocated`, `maintenance`, `discrepancy`, `retired` | `all` |
| `nucleus` | Identificador de núcleo | `all` |
| `sort` | `recent`, `asset_asc`, `nucleus`, `status` | `recent` |

Exemplo:

```http
GET /api/state?search=Beatriz&type=notebook&nucleus=nuc-fin&sort=asset_asc
Accept: application/json
```

Usuários anônimos recebem o seed público. Usuários autenticados recebem o workspace D1.

## `POST /api/state`

Exige Sign in with ChatGPT. O ator da movimentação é obtido da sessão autenticada.

### Cadastrar patrimônio

```json
{
  "type": "create_asset",
  "asset": {
    "id": "654321",
    "type": "notebook",
    "nucleusId": "nuc-ti",
    "status": "available",
    "brandModel": "Lenovo ThinkPad E14",
    "serial": "LN-E14-9931",
    "acquiredAt": "2026-07-15",
    "value": 5600,
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
  "assetId": "104293",
  "nucleusId": "nuc-rh",
  "location": "Mesa RH-05",
  "assignee": "Renata Melo",
  "note": "Equipamento destinado ao onboarding"
}
```

### Atualizar status

```json
{
  "type": "update_status",
  "assetId": "104281",
  "status": "maintenance",
  "note": "Falha de inicialização confirmada pelo suporte"
}
```

### Criar núcleo

```json
{
  "type": "create_nucleus",
  "nucleus": {
    "id": "nuc-juridico",
    "code": "JUR",
    "name": "Jurídico",
    "location": "Matriz - 2º andar",
    "manager": "Renata Melo"
  }
}
```

## Códigos de resposta

| Código | Situação |
| --- | --- |
| `200` | Leitura ou mutação concluída |
| `400` | JSON inválido |
| `401` | Sessão não autenticada |
| `422` | Regra de domínio violada |
| `500` | Falha inesperada de infraestrutura |

Erros de domínio retornam uma mensagem operacional, por exemplo:

```json
{
  "error": "O identificador deve conter exatamente 6 números."
}
```
