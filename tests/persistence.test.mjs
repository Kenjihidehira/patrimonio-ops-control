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
const gateway = await readFile(
  new URL("../supabase/functions/patrimonio-gateway/index.ts", import.meta.url),
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
