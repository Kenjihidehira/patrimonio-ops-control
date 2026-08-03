import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [migration, gateway, types, environments, application, operations, accessDocs] = await Promise.all([
  read("supabase/migrations/20260803123916_separate_auditor_role.sql"),
  read("supabase/functions/patrimonio-gateway/index.ts"),
  read("components/patrimonio/types.ts"),
  read("components/patrimonio/EnvironmentsView.tsx"),
  read("components/patrimonio/PatrimonioApp.tsx"),
  read("components/patrimonio/OperationsCenterView.tsx"),
  read("docs/controle-de-acesso.md"),
]);

test("banco materializa auditor como função separada e somente leitura", () => {
  assert.match(migration, /add column is_auditor boolean not null default false/);
  assert.match(migration, /patrimonio_users_auditor_read_only_check/);
  assert.match(migration, /not is_admin[\s\S]*not can_write[\s\S]*not can_import/);
  assert.match(migration, /patrimonio_save_user_access_v3/);
  assert.match(migration, /target_is_auditor boolean := target_active[\s\S]*not target_is_admin/);
  assert.match(migration, /target_can_write boolean := target_active[\s\S]*not target_is_auditor/);
  assert.match(migration, /target_can_import boolean := target_active[\s\S]*not target_is_auditor/);
  assert.match(migration, /target_can_export boolean := target_active[\s\S]*target_is_auditor/);
  assert.match(migration, /'isAuditor', app_user\.is_auditor/);
});

test("Fabiano deixa de ser administrador e recebe somente departamentos explicitamente vinculados", () => {
  assert.match(migration, /'fabiano\.audit@gmail\.com'/);
  assert.match(migration, /set is_admin = false,[\s\S]*is_auditor = true/);
  assert.match(migration, /can_write = false,[\s\S]*can_import = false,[\s\S]*can_export = true/);
  assert.match(migration, /insert into public\.patrimonio_department_memberships[\s\S]*where department\.active/);
  assert.match(migration, /session_version = public\.patrimonio_users\.session_version \+ 1/);
});

test("gateway aplica defesa em profundidade e preserva administração exclusiva", () => {
  assert.match(gateway, /rpc\/patrimonio_save_user_access_v3/);
  assert.match(gateway, /p_is_auditor: body\.user\?\.isAuditor === true/);
  assert.match(gateway, /select=identifier,display_name,is_admin,is_auditor,active/);
  assert.match(gateway, /isAuditor: user\.is_auditor === true/);
  assert.match(gateway, /canWrite: user\.is_admin === true \|\| \(user\.is_auditor !== true && user\.can_write === true\)/);
  assert.match(gateway, /if \(user\.is_admin !== true\) throw httpError\("admin_required"/);
  assert.match(gateway, /await authorizeOperation\(identifier, access\.active\.slug, "write"\)/);
  assert.match(gateway, /error\?\.message === "operation_not_allowed"/);
  assert.match(gateway, /p_event_type: "operation_denied"/);
  assert.match(gateway, /p_retention_days: 730/);
});

test("interface identifica auditor e remove controles de mutação do módulo operacional", () => {
  assert.match(types, /isAuditor: boolean/);
  assert.match(environments, /<option value="auditor">Auditor<\/option>/);
  assert.match(environments, /role === "auditor" \? false/);
  assert.match(environments, /Exportação controlada/);
  assert.match(application, /Perfil de auditoria/);
  assert.match(application, /exportação controlada estão liberados/);
  assert.match(operations, /is-auditor-read-only/);
  assert.match(operations, /Controles de alteração foram removidos deste perfil/);
});

test("documentação define matriz de segregação sem atribuir administração ao auditor", () => {
  assert.match(accessDocs, /Matriz de responsabilidades/);
  assert.match(accessDocs, /Criar administradores ou alterar acessos \| Sim \| Não \| Não/);
  assert.match(accessDocs, /Remover ou modificar documentos de evidência \| Sim, com trilha \| Não/);
  assert.match(accessDocs, /Novos departamentos não são liberados/);
});
