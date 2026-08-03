import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  migration,
  gateway,
  integrationUi,
  importRoute,
  importDialog,
  governance,
  genericImportMigration,
] = await Promise.all([
  read("supabase/migrations/20260803134636_enforce_data_source_ownership.sql"),
  read("supabase/functions/patrimonio-gateway/index.ts"),
  read("components/patrimonio/operations/IntegrationOperations.tsx"),
  read("app/api/import/route.ts"),
  read("components/patrimonio/Dialogs.tsx"),
  read("docs/governanca-dados.md"),
  read("supabase/migrations/20260803135137_protect_generic_import_fields.sql"),
]);

test("matriz de fontes oficiais é versionada, privada e somente leitura pelo gateway", () => {
  assert.match(migration, /create table public\.patrimonio_data_source_policies/);
  assert.match(migration, /alter table public\.patrimonio_data_source_policies enable row level security/);
  assert.match(migration, /using \(false\)[\s\S]*with check \(false\)/);
  assert.match(migration, /grant select on table public\.patrimonio_data_source_policies to service_role/);
  assert.doesNotMatch(migration, /grant all on table public\.patrimonio_data_source_policies/);
  assert.match(gateway, /isAdmin === true[\s\S]*patrimonio_data_source_policies/);
  assert.match(gateway, /Promise\.resolve\(\[\]\)/);
});

test("Sabium usa identidade natural e preserva campos operacionais", () => {
  assert.match(migration, /unique \(base_code, incorporation\)/);
  assert.match(migration, /patrimonio_assets_owner_sabium_natural_key_uidx/);
  assert.match(migration, /asset\.base_code = source_row\.base_code/);
  assert.match(migration, /asset\.incorporation = source_row\.incorporation/);
  assert.match(migration, /sabium_operational_conflict/);
  assert.match(migration, /nenhuma correção operacional foi sobrescrita/);
  assert.match(migration, /on conflict do nothing/);

  const fiscalUpdate = migration.match(
    /update public\.patrimonio_assets asset\s+set([\s\S]*?)\s+from sabium_import_rows source_row/,
  )?.[1] ?? "";
  assert.match(fiscalUpdate, /acquired_at = source_row\.acquired_at/);
  assert.match(fiscalUpdate, /source_description = source_row\.source_description/);
  for (const protectedField of [
    "assignee =",
    "nucleus_id =",
    "location =",
    "status =",
    "serial =",
    "type =",
    "brand_model =",
    "notes =",
  ]) {
    assert.doesNotMatch(fiscalUpdate, new RegExp(protectedField));
  }
});

test("planilha operacional compara impacto e exige confirmação de sobrescrita", () => {
  assert.match(importRoute, /analyzeImportImpact/);
  assert.match(importRoute, /protectedFieldChangeCount/);
  assert.match(importRoute, /confirmOperationalOverwrite/);
  assert.match(importRoute, /canonicalCodeByAlias/);
  assert.match(importRoute, /canonicalCodeByAlias\.has\(sourceCode\) \? existing\.status/);
  assert.match(importRoute, /status: 409/);
  assert.match(importDialog, /operationalOverwriteConfirmed/);
  assert.match(importDialog, /Confirmo a atualização/);
  assert.match(migration, /patrimonio_import_assets_without_aliases/);
  assert.match(migration, /on conflict \(owner_key, code\) do nothing/);
  assert.match(genericImportMigration, /acquired_at = patrimonio_assets\.acquired_at/);
  assert.match(genericImportMigration, /acquisition_value = patrimonio_assets\.acquisition_value/);
  assert.match(genericImportMigration, /excluded\.location = 'Não informada na planilha'/);
  assert.match(genericImportMigration, /excluded\.brand_model = 'Não informado na planilha'/);
  assert.match(genericImportMigration, /excluded\.notes = 'Importado da planilha de patrimônios\.'/);
  assert.match(genericImportMigration, /persisted_asset\.location/);
  assert.match(gateway, /loadAssetAliases\(ownerKey\)/);
});

test("interface e documentação expõem a política sem fingir integrações planejadas", () => {
  assert.match(integrationUi, /Fontes oficiais/);
  assert.match(integrationUi, /Matriz de fontes oficiais/);
  assert.match(integrationUi, /Campos sob domínio/);
  assert.match(governance, /RH, telemetria e MDM continuam marcados como planejados/);
  assert.match(governance, /não transforma esse conector em fonte oficial/);
});
