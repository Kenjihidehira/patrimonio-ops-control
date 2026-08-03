import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  auditorMigration,
  globalAccessMigration,
  gateway,
  types,
  environments,
  application,
  operations,
  accessDocs,
] = await Promise.all([
  read("supabase/migrations/20260803123916_separate_auditor_role.sql"),
  read("supabase/migrations/20260803131304_grant_auditor_global_department_access.sql"),
  read("supabase/functions/patrimonio-gateway/index.ts"),
  read("components/patrimonio/types.ts"),
  read("components/patrimonio/EnvironmentsView.tsx"),
  read("components/patrimonio/PatrimonioApp.tsx"),
  read("components/patrimonio/OperationsCenterView.tsx"),
  read("docs/controle-de-acesso.md"),
]);

test("banco materializa auditor como função separada e somente leitura", () => {
  assert.match(auditorMigration, /add column is_auditor boolean not null default false/);
  assert.match(auditorMigration, /patrimonio_users_auditor_read_only_check/);
  assert.match(auditorMigration, /not is_admin[\s\S]*not can_write[\s\S]*not can_import/);
  assert.match(auditorMigration, /patrimonio_save_user_access_v3/);
  assert.match(auditorMigration, /target_is_auditor boolean := target_active[\s\S]*not target_is_admin/);
  assert.match(auditorMigration, /target_can_write boolean := target_active[\s\S]*not target_is_auditor/);
  assert.match(auditorMigration, /target_can_import boolean := target_active[\s\S]*not target_is_auditor/);
  assert.match(auditorMigration, /target_can_export boolean := target_active[\s\S]*target_is_auditor/);
  assert.match(auditorMigration, /'isAuditor', app_user\.is_auditor/);
});

test("Fabiano permanece auditor separado de administrador e sem mutações", () => {
  assert.match(auditorMigration, /'fabiano\.audit@gmail\.com'/);
  assert.match(auditorMigration, /set is_admin = false,[\s\S]*is_auditor = true/);
  assert.match(auditorMigration, /can_write = false,[\s\S]*can_import = false,[\s\S]*can_export = true/);
  assert.match(auditorMigration, /session_version = public\.patrimonio_users\.session_version \+ 1/);
});

test("banco concede alcance global de leitura a auditores e mantém vínculos somente para operadores", () => {
  assert.match(globalAccessMigration, /patrimonio_save_user_access_v4/);
  assert.match(globalAccessMigration, /security invoker[\s\S]*set search_path = public, pg_temp/);
  assert.match(
    globalAccessMigration,
    /not app_user\.is_admin[\s\S]*and not app_user\.is_auditor[\s\S]*patrimonio_department_memberships/,
  );
  assert.match(
    globalAccessMigration,
    /if target_active[\s\S]*and not target_is_admin[\s\S]*and not target_is_auditor[\s\S]*cardinality\(normalized_departments\) = 0/,
  );
  assert.match(
    globalAccessMigration,
    /delete from public\.patrimonio_department_memberships membership[\s\S]*app_user\.is_auditor/,
  );
  assert.match(globalAccessMigration, /when target_is_admin or target_is_auditor then 'all_active'/);
  assert.match(globalAccessMigration, /from public, anon, authenticated/);
  assert.match(globalAccessMigration, /to service_role/);
});

test("gateway aplica defesa em profundidade e preserva administração exclusiva", () => {
  assert.match(gateway, /rpc\/patrimonio_save_user_access_v5/);
  assert.match(gateway, /p_can_view_financial_data: body\.user\?\.canViewFinancialData === true/);
  assert.match(gateway, /p_is_auditor: body\.user\?\.isAuditor === true/);
  assert.match(gateway, /const departments = user\.is_admin \|\| user\.is_auditor/);
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
  assert.match(environments, /accessForm\.isAdmin[\s\S]*\|\| accessForm\.isAuditor[\s\S]*\|\| accessForm\.departmentSlugs/);
  assert.match(environments, /disabled=\{accessForm\.isAdmin \|\| accessForm\.isAuditor/);
  assert.match(environments, /Todos os departamentos/);
  assert.match(application, /Perfil de auditoria/);
  assert.match(application, /exportação controlada estão liberados/);
  assert.match(operations, /is-auditor-read-only/);
  assert.match(operations, /Controles de alteração foram removidos deste perfil/);
});

test("documentação define matriz de segregação sem atribuir administração ao auditor", () => {
  assert.match(accessDocs, /Matriz de responsabilidades/);
  assert.match(accessDocs, /Consultar departamentos \| Todos \| Todos \| Somente os vinculados/);
  assert.match(accessDocs, /Criar administradores ou alterar acessos \| Sim \| Não \| Não/);
  assert.match(accessDocs, /Remover ou modificar documentos de evidência \| Sim, com trilha \| Não/);
  assert.match(accessDocs, /todos os departamentos ativos/);
  assert.match(accessDocs, /Apenas operadores dependem/);
});
