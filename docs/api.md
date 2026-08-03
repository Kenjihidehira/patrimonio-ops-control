# API

Base local: `http://localhost:5173/api`

Respostas dinâmicas usam `cache-control: no-store`. A identidade vem de uma sessão local assinada após o servidor concluir o fluxo OpenID Connect do Google e validar a conta.

## Autenticação

| Método | Rota | Finalidade |
| --- | --- | --- |
| `GET` | `/api/auth/google/login` | Iniciar o código de autorização do Google com `state`, PKCE e `nonce` |
| `GET` | `/api/auth/google/callback` | Validar retorno OpenID Connect, identidade e lista de autorizados; criar sessão `HttpOnly` |
| `POST` | `/api/auth/logout` | Encerrar a sessão local |

`return_to` aceita apenas caminhos relativos locais e nunca pode apontar para as próprias rotas de autenticação.

## `GET /api/state`

Retorna revisão, resumo, inventário filtrado, colaboradores, núcleos, auditoria, histórico de importações, catálogos, ambiente, sessão e o contexto agregado da central de operações.

### Parâmetros de consulta

| Parâmetro | Valores | Padrão |
| --- | --- | --- |
| `search` | Texto livre | vazio |
| `type` | `cpu`, `monitor_1`, `monitor_2`, `chair`, `notebook`, `fleet`, `car`, `trailer`, `vehicle_component`, `equipment`, `furniture`, `extinguisher`, `software`, `other` | `all` |
| `status` | `available`, `allocated`, `maintenance`, `discrepancy`, `retired` | `all` |
| `nucleus` | Identificador de núcleo | `all` |
| `sort` | `recent`, `asset_asc`, `nucleus`, `status` | `recent` |
| `department` | Slug de um departamento liberado ao usuário | primeiro departamento autorizado |
| `revision` | Revisão inteira já carregada em sincronizações de segundo plano | vazio |

Usuários anônimos recebem `401` com a URL local de login. Quando `revision`
coincide com a revisão persistida, a API retorna `304 Not Modified` sem
recarregar inventário e movimentações. Operadores recebem apenas os departamentos
vinculados; administradores e auditores podem acessar todos os departamentos
ativos, preservadas as restrições de mutação do perfil de auditoria.

## `/api/departments`

- `GET`: carrega os núcleos e a revisão do departamento de destino autorizado.
- `POST save_user_access`: administrador ativa ou desativa usuário, define a função global de administrador ou auditor, ou libera departamentos e permissões específicas para operadores.
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

`newAssetId` aceita seis dígitos para bens convencionais e o formato `número-da-frota.0` para frotas, sempre com unicidade no ambiente empresarial. Identificadores importados do Sabium são imutáveis por esse comando. A operação preserva núcleo, responsável, localização e movimentos anteriores, além de registrar a troca na auditoria.

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

### Central de operações

Os comandos abaixo usam o mesmo contrato autenticado de `POST /api/state`, sempre com `departmentSlug` e `expectedRevision`. A escrita é executada por RPC transacional e o servidor obtém o ator da sessão.

| Domínio | Ações aceitas |
| --- | --- |
| Inventário | `create_inventory_campaign`, `record_inventory_check`, `record_inventory_checks_batch`, `complete_inventory_campaign` |
| Custódia | `create_custody_term`, `respond_custody_term` |
| Manutenção | `create_maintenance_order`, `update_maintenance_order` |
| Rastreamento | `assign_tracking_tag`, `record_tracking_event` |
| Ciclo de vida | `create_lifecycle_request`, `decide_lifecycle_request`, `create_asset_kit`, `dissolve_asset_kit` |
| Reservas e desligamentos | `create_reservation`, `update_reservation_status`, `create_offboarding_case`, `update_offboarding_asset`, `complete_offboarding_case` |
| Documentos e contratos | `delete_asset_document`, `create_asset_contract`, `update_asset_contract_status` |
| Contábil e cadastro | `upsert_asset_accounting`, `create_custom_field`, `set_asset_custom_value` |
| Inspeções | `create_asset_inspection`, `record_asset_inspection_result`, `review_asset_inspection` |
| Integrações | `create_integration`, `record_integration_event`, `create_reconciliation_issue`, `resolve_reconciliation_issue` |

Dados contábeis, custos contratuais e configuração técnica de integrações são devolvidos somente para administradores. A projeção pública de um conector nunca inclui segredo, senha, token ou chave de API.

Geocercas e alertas de rastreamento possuem estrutura persistida no banco, mas `create_tracking_geofence`, `set_tracking_geofence_status` e `update_tracking_alert` ainda não são aceitos pelo gateway HTTP. Eles não fazem parte do contrato público desta versão.

## `/api/documents`

### `POST /api/documents`

Recebe `multipart/form-data`, exige permissão de alteração e aceita os campos `file`, `department`, `assetId`, `category`, `revision`, `note` e `retentionUntil`. O arquivo deve ter até 2,5 MB e ser PDF, JPEG, PNG, WebP, TXT, DOCX ou XLSX.

O servidor normaliza o nome, envia o conteúdo por canal assinado ao gateway, calcula SHA-256 e registra os metadados na mesma revisão do departamento. O bucket é privado e uma falha na gravação do metadado remove o objeto recém-enviado.

### `GET /api/documents`

Recebe `department` e `id` na consulta. Depois de validar sessão e acesso ao departamento, responde `302` para uma URL privada assinada por 60 segundos. O endereço permanente do objeto não é exposto ao cliente.

## `POST /api/import`

Exige autenticação, permissão de importação e recebe `multipart/form-data`.

| Campo | Valores | Obrigatório |
| --- | --- | --- |
| `file` | Arquivo `.xlsx` de até 2 MB | sim |
| `mode` | `preview` ou `commit` | sim |
| `revision` | Revisão inteira conhecida pelo cliente | apenas em `commit` |
| `confirmOperationalOverwrite` | `true` para confirmar alterações em campos operacionais existentes | apenas quando a prévia exigir |

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
  "newAssetCount": 12,
  "updateAssetCount": 40,
  "unchangedAssetCount": 309,
  "protectedFieldChangeCount": 58,
  "requiresOperationalConfirmation": true,
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

Na confirmação, o arquivo é reprocessado e a revisão é comparada dentro da transação. Quando a prévia identificar alteração em responsável, núcleo, localização, status, série, classificação, modelo ou observações, a API exige `confirmOperationalOverwrite=true`; sem isso, responde `409`. Campos fiscais de aquisição não são atualizados por esse canal. A resposta concluída informa `revision`, `inserted`, `updated`, `rejected` e `collaborators`.

## `GET /api/export`

Gera um `.xlsx` sem preços de aquisição e com quatro abas:

- `Inventário`
- `Núcleos`
- `Auditoria`
- `Importações`

Exige autenticação e permissão explícita de exportação. Auditores recebem essa permissão sem adquirir escrita, importação ou administração. A função do usuário, a autorização e o departamento são registrados na auditoria de segurança; requisições anônimas recebem `401` e perfis sem permissão recebem `403`.

## Códigos de resposta

| Código | Situação |
| --- | --- |
| `200` | Leitura, prévia ou mutação concluída |
| `304` | Sincronização sem alteração desde a revisão informada |
| `400` | Corpo da requisição, modo ou arquivo inválido |
| `401` | Sessão ausente ou expirada |
| `403` | Departamento ou operação não autorizado para o perfil |
| `409` | Revisão obsoleta; recarregamento necessário |
| `413` | Planilha vazia, maior que 2 MB ou acima dos limites estruturais |
| `415` | Formato de planilha ou documento não permitido |
| `422` | Regra de domínio violada ou importação sem linhas válidas |
| `429` | Limite de requisições, importações ou exportações atingido |
| `500` | Falha inesperada de infraestrutura |
