import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nucleusMigration = await readFile(
  new URL("../supabase/migrations/20260716144553_reconcile_import_nuclei_by_code.sql", import.meta.url),
  "utf8",
);
const collaboratorMigration = await readFile(
  new URL("../supabase/migrations/20260716144718_reconcile_import_collaborators_by_code.sql", import.meta.url),
  "utf8",
);
const collaboratorProfileMigration = await readFile(
  new URL("../supabase/migrations/20260716150928_add_collaborator_profile_editing.sql", import.meta.url),
  "utf8",
);
const gateway = await readFile(
  new URL("../supabase/functions/patrimonio-gateway/index.ts", import.meta.url),
  "utf8",
);
const untaggedAssetMigration = await readFile(
  new URL("../supabase/migrations/20260717113000_support_untagged_assets.sql", import.meta.url),
  "utf8",
);
const collaboratorPolicyMigration = await readFile(
  new URL("../supabase/migrations/20260717113500_explicit_collaborator_rls_policy.sql", import.meta.url),
  "utf8",
);
const identifierMigration = await readFile(
  new URL("../supabase/migrations/20260717133000_allow_asset_identifier_updates.sql", import.meta.url),
  "utf8",
);
const assetAliasMigration = await readFile(
  new URL("../supabase/migrations/20260717143000_preserve_asset_aliases_on_import.sql", import.meta.url),
  "utf8",
);
const nucleusInventoryEditMigration = await readFile(
  new URL("../supabase/migrations/20260720143000_edit_nucleus_inventory_items.sql", import.meta.url),
  "utf8",
);
const responsibleRegistrationMigration = await readFile(
  new URL("../supabase/migrations/20260723103000_register_responsibles_from_inventory.sql", import.meta.url),
  "utf8",
);
const departmentMigration = await readFile(
  new URL("../supabase/migrations/20260727153629_add_department_environments.sql", import.meta.url),
  "utf8",
);
const operationalMigration = await readFile(
  new URL("../supabase/migrations/20260731124837_add_operational_control.sql", import.meta.url),
  "utf8",
);
const advancedLifecycleMigration = await readFile(
  new URL("../supabase/migrations/20260731155452_add_advanced_asset_lifecycle.sql", import.meta.url),
  "utf8",
);
const advancedContextMigration = await readFile(
  new URL("../supabase/migrations/20260731155615_add_advanced_context_query.sql", import.meta.url),
  "utf8",
);
const advancedIndexMigration = await readFile(
  new URL("../supabase/migrations/20260731183517_add_advanced_fk_indexes.sql", import.meta.url),
  "utf8",
);
const advancedFinancialMigration = await readFile(
  new URL("../supabase/migrations/20260731183814_harden_advanced_financial_writes.sql", import.meta.url),
  "utf8",
);

test("importação reconcilia núcleos pela sigla persistida", () => {
  assert.match(nucleusMigration, /on conflict \(owner_key, code\) do update/);
  assert.match(nucleusMigration, /persisted_nucleus\.code = upper\(source_nucleus\.code\)/);
  assert.match(nucleusMigration, /persisted_nucleus\.id/);
  assert.doesNotMatch(nucleusMigration, /v_row_count = 0 or/);
});

test("colaboradores usam o núcleo persistido e o gateway carrega a coleção", () => {
  assert.match(collaboratorMigration, /persisted_nucleus\.id/);
  assert.match(collaboratorMigration, /patrimonio_import_workspace/);
  assert.match(gateway, /patrimonio_collaborators/);
  assert.match(gateway, /rpc\/patrimonio_import_workspace/);
});

test("edição de colaborador preserva atribuições na mesma transação", () => {
  assert.match(collaboratorProfileMigration, /update_collaborator/);
  assert.match(collaboratorProfileMigration, /update public\.patrimonio_assets asset/);
  assert.match(collaboratorProfileMigration, /update public\.patrimonio_collaborators/);
  assert.match(collaboratorProfileMigration, /patrimonio_collaborators_owner_nucleus_name_uidx/);
});

test("responsável sem perfil pode ser cadastrado sem perder seus itens", () => {
  assert.match(responsibleRegistrationMigration, /register_responsible/);
  assert.match(responsibleRegistrationMigration, /previousName/);
  assert.match(responsibleRegistrationMigration, /update public\.patrimonio_assets/);
  assert.match(responsibleRegistrationMigration, /insert into public\.patrimonio_collaborators/);
  assert.match(responsibleRegistrationMigration, /grant execute[\s\S]*service_role/);
});

test("banco distingue patrimônio oficial de referência interna", () => {
  assert.match(untaggedAssetMigration, /\[0-9\]\{6\}/);
  assert.match(untaggedAssetMigration, /S\[A-Z0-9\]\{5\}/);
});

test("colaboradores negam acesso direto por política RLS explícita", () => {
  assert.match(collaboratorPolicyMigration, /patrimonio_collaborators_no_direct_access/);
  assert.match(collaboratorPolicyMigration, /to anon, authenticated/);
  assert.match(collaboratorPolicyMigration, /using \(false\)/);
});

test("alteração do patrimônio preserva histórico e ocorre em transação auditável", () => {
  assert.match(identifierMigration, /on update cascade/);
  assert.match(identifierMigration, /update_asset_identifier/);
  assert.match(identifierMigration, /identifier_change/);
  assert.match(identifierMigration, /\^\[0-9\]\{6\}\$/);
  assert.match(identifierMigration, /asset_code_exists/);
  assert.match(identifierMigration, /for update/);
  assert.match(identifierMigration, /set code = v_to_label/);
});

test("reimportação reconhece a referência anterior sem recriar item sem patrimônio", () => {
  assert.match(assetAliasMigration, /create table public\.patrimonio_asset_aliases/);
  assert.match(assetAliasMigration, /on update cascade/);
  assert.match(assetAliasMigration, /insert into public\.patrimonio_asset_aliases/);
  assert.match(assetAliasMigration, /jsonb_array_elements\(p_assets\) with ordinality/);
  assert.match(assetAliasMigration, /jsonb_set\(source\.item, '\{code\}'/);
  assert.match(assetAliasMigration, /to_jsonb\(asset\.status\)/);
  assert.match(assetAliasMigration, /patrimonio_asset_aliases_no_direct_access/);
});

test("edição do inventário do núcleo é transacional, validada e auditável", () => {
  assert.match(nucleusInventoryEditMigration, /update_asset_details/);
  assert.match(nucleusInventoryEditMigration, /for update/);
  assert.match(nucleusInventoryEditMigration, /unchanged_asset_details/);
  assert.match(nucleusInventoryEditMigration, /details_update/);
  assert.match(nucleusInventoryEditMigration, /Campos atualizados:/);
  assert.match(nucleusInventoryEditMigration, /grant execute[\s\S]*service_role/);
});

test("departamentos possuem isolamento, acesso por usuário e transferência auditável", () => {
  assert.match(departmentMigration, /create table public\.patrimonio_departments/);
  assert.match(departmentMigration, /create table public\.patrimonio_department_memberships/);
  assert.match(departmentMigration, /create table public\.patrimonio_department_transfers/);
  assert.match(departmentMigration, /Atendimento ao Cliente/);
  assert.match(departmentMigration, /Gazin LOG/);
  assert.match(departmentMigration, /patrimonio_save_user_access/);
  assert.match(departmentMigration, /patrimonio_transfer_department_entity/);
  assert.match(departmentMigration, /admin_required/);
  assert.match(departmentMigration, /department_transfer/);
  assert.match(departmentMigration, /using \(false\) with check \(false\)/);
  assert.match(gateway, /access\.active\.owner_key/);
  assert.doesNotMatch(gateway, /access\.active\.ownerKey/);
});

test("sincronização por revisão evita recarregar inventário sem alteração", () => {
  assert.match(gateway, /const knownRevision = normalizeRevision\(body\.knownRevision\)/);
  assert.match(gateway, /knownRevision === revision/);
  assert.match(gateway, /notModified: true/);
  assert.match(gateway, /if \(!workspace\.length\)/);
});

test("operações físicas possuem inventário, custódia, manutenção e rastreamento transacionais", () => {
  for (const table of [
    "patrimonio_inventory_campaigns",
    "patrimonio_custody_terms",
    "patrimonio_maintenance_orders",
    "patrimonio_tracking_tags",
    "patrimonio_tracking_events",
  ]) {
    assert.match(operationalMigration, new RegExp(`create table public\\.${table}`));
    assert.match(operationalMigration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(operationalMigration, /create_inventory_campaign/);
  assert.match(operationalMigration, /respond_custody_term/);
  assert.match(operationalMigration, /update_maintenance_order/);
  assert.match(operationalMigration, /rfid_uhf/);
  assert.match(operationalMigration, /uwb/);
  assert.match(operationalMigration, /mdm/);
  assert.match(gateway, /rpc\/patrimonio_apply_operational_action/);
});

test("ciclo de vida avançado mantém tabelas privadas e escrita em RPC única", () => {
  for (const table of [
    "patrimonio_asset_documents",
    "patrimonio_asset_contracts",
    "patrimonio_asset_accounting",
    "patrimonio_asset_kits",
    "patrimonio_reservations",
    "patrimonio_offboarding_cases",
    "patrimonio_lifecycle_requests",
    "patrimonio_integrations",
    "patrimonio_reconciliation_issues",
    "patrimonio_asset_inspections",
  ]) {
    assert.match(advancedLifecycleMigration, new RegExp(`create table public\\.${table}`));
    assert.match(advancedLifecycleMigration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(advancedLifecycleMigration, new RegExp(`${table}_no_direct_access`));
  }
  assert.match(advancedLifecycleMigration, /create or replace function public\.patrimonio_apply_advanced_action/);
  assert.match(advancedLifecycleMigration, /record_inventory_checks_batch/);
  assert.match(advancedLifecycleMigration, /asset_unavailable_for_reservation/);
  assert.match(advancedLifecycleMigration, /offboarding_has_pending_assets/);
  assert.match(advancedLifecycleMigration, /configuration \?\| array\['secret', 'password', 'token', 'apiKey', 'api_key'\]/);
  assert.match(advancedLifecycleMigration, /to service_role/);
  assert.match(gateway, /rpc\/patrimonio_apply_advanced_action/);
});

test("documentos usam bucket privado, checksum e URLs assinadas", () => {
  assert.match(advancedLifecycleMigration, /'patrimonio-documents'/);
  assert.match(advancedLifecycleMigration, /public, file_size_limit, allowed_mime_types/);
  assert.match(advancedLifecycleMigration, /false,[\s\S]*2500000/);
  assert.match(gateway, /sha256Hex\(fileBytes\)/);
  assert.match(gateway, /storage\/v1/);
  assert.match(gateway, /object\/sign/);
  assert.match(gateway, /expiresIn: 60/);
  assert.match(gateway, /"x-upsert": "false"/);
});

test("contexto avançado é agregado e oculta finanças de não administradores", () => {
  assert.match(advancedContextMigration, /patrimonio_load_advanced_context/);
  assert.match(advancedContextMigration, /case when coalesce\(p_is_admin, false\) then monthly_cost else null end/);
  assert.match(advancedContextMigration, /'assetAccounting', case when coalesce\(p_is_admin, false\)/);
  assert.match(advancedContextMigration, /'integrations', case when coalesce\(p_is_admin, false\)/);
  assert.match(gateway, /loadAdvancedData\(ownerKey, identifier, access\.isAdmin\)/);
  assert.match(gateway, /rpc\/patrimonio_load_advanced_context/);
});

test("chaves estrangeiras avançadas possuem índices de cobertura", () => {
  assert.match(advancedIndexMigration, /patrimonio_asset_contracts \(owner_key, document_id\)/);
  assert.match(advancedIndexMigration, /patrimonio_asset_custom_values \(owner_key, field_id\)/);
  assert.match(advancedIndexMigration, /patrimonio_asset_inspections \(owner_key, document_id\)/);
  assert.match(advancedIndexMigration, /patrimonio_lifecycle_requests \(owner_key, asset_code\)/);
  assert.match(advancedIndexMigration, /patrimonio_reconciliation_issues \(owner_key, integration_id\)/);
});

test("escritas financeiras avançadas são protegidas no banco", () => {
  assert.match(advancedFinancialMigration, /upsert_asset_accounting[\s\S]*not coalesce\(p_is_admin, false\)/);
  assert.match(advancedFinancialMigration, /create_asset_contract[\s\S]*jsonb_set\(v_action, '\{contract,monthlyCost\}', '0'::jsonb/);
  assert.match(advancedFinancialMigration, /from public, anon, authenticated/);
  assert.match(advancedFinancialMigration, /to service_role/);
});
