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
