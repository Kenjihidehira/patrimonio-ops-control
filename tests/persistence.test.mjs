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
const fleetMigration = await readFile(
  new URL("../supabase/migrations/20260730142028_support_gazin_log_fleet_assets.sql", import.meta.url),
  "utf8",
);
const sabiumMigration = await readFile(
  new URL("../supabase/migrations/20260730185027_validate_sabium_source_updates.sql", import.meta.url),
  "utf8",
);
const operationalControlMigration = await readFile(
  new URL("../supabase/migrations/20260731124837_add_operational_control.sql", import.meta.url),
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

test("frotas usam patrimônio número-da-frota.0 somente no ambiente Gazin LOG", () => {
  assert.match(fleetMigration, /alter column code type varchar\(16\)/);
  assert.match(fleetMigration, /\[0-9\]\{1,10\}\\\.0/);
  assert.match(fleetMigration, /'notebook', 'fleet'/);
  assert.match(fleetMigration, /department\.slug = 'gazin-log'/);
  assert.match(fleetMigration, /fleet_department_required/);
  assert.match(fleetMigration, /on update cascade/);
  assert.match(fleetMigration, /patrimonio_apply_action/);
  assert.match(fleetMigration, /grant execute[\s\S]*service_role/);
});

test("carga Sabium preserva identidade de origem sem sobrescrever identificadores repetidos", () => {
  assert.match(sabiumMigration, /source_fingerprint varchar\(64\)/);
  assert.match(sabiumMigration, /source_identifier varchar\(80\)/);
  assert.match(sabiumMigration, /source_description varchar\(500\)/);
  assert.match(sabiumMigration, /operation_value numeric\(14, 2\)/);
  assert.match(sabiumMigration, /patrimonio_assets_owner_source_fingerprint_uidx/);
  assert.match(sabiumMigration, /G\[A-F0-9\]\{20\}/);
  assert.match(sabiumMigration, /patrimonio_import_sabium_assets/);
  assert.match(sabiumMigration, /jsonb_array_length\(p_rows\)/);
  assert.match(sabiumMigration, /source_system = 'sabium'/);
  assert.match(sabiumMigration, /grant execute[\s\S]*service_role/);
  assert.match(gateway, /source_identifier,source_description,asset_group,branch_code/);
});

test("gateway pagina todos os patrimônios acima do limite de 1000 linhas", () => {
  assert.match(gateway, /const DATA_PAGE_SIZE = 1_000/);
  assert.match(gateway, /return dataRequestAll\(/);
  assert.match(gateway, /order=updated_at\.desc,code\.asc/);
  assert.match(gateway, /"Range-Unit": "items"/);
  assert.match(gateway, /Range: `\$\{from\}-\$\{from \+ pageSize - 1\}`/);
  assert.match(gateway, /if \(batch\.length < pageSize\) return rows/);
});

test("controles operacionais são persistentes, isolados e auditáveis", () => {
  for (const table of [
    "patrimonio_inventory_campaigns",
    "patrimonio_inventory_campaign_assets",
    "patrimonio_custody_terms",
    "patrimonio_maintenance_orders",
    "patrimonio_tracking_tags",
    "patrimonio_tracking_events",
  ]) {
    assert.match(operationalControlMigration, new RegExp(`create table public\\.${table}`));
    assert.match(operationalControlMigration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(operationalControlMigration, new RegExp(`revoke all on table public\\.${table}`));
  }
  assert.match(operationalControlMigration, /patrimonio_apply_operational_action/);
  assert.match(operationalControlMigration, /security invoker/);
  assert.match(operationalControlMigration, /custody_term_identity_mismatch/);
  assert.match(operationalControlMigration, /tracking_tag_not_configured/);
  assert.match(operationalControlMigration, /checked_count = target_count/);
  assert.match(operationalControlMigration, /grant execute[\s\S]*to service_role/);
  assert.match(gateway, /operationalActionTypes/);
  assert.match(gateway, /loadOperationalData/);
  assert.match(gateway, /rpc\/patrimonio_apply_operational_action/);
});

test("sincronização por revisão evita recarregar inventário sem alteração", () => {
  assert.match(gateway, /const knownRevision = normalizeRevision\(body\.knownRevision\)/);
  assert.match(gateway, /knownRevision === revision/);
  assert.match(gateway, /notModified: true/);
  assert.match(gateway, /if \(!workspace\.length\)/);
});
