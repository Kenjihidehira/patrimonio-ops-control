import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  migration,
  gateway,
  registerAuth,
  registerRoute,
  credentialAuth,
  sharedAuth,
  serverApi,
  departmentsRoute,
  clientApi,
  loginPage,
  environments,
  types,
] = await Promise.all([
  read("supabase/migrations/20260804160000_add_self_service_access_requests.sql"),
  read("supabase/functions/patrimonio-gateway/index.ts"),
  read("app/register-auth.ts"),
  read("app/api/auth/register/route.ts"),
  read("app/credential-auth.ts"),
  read("app/auth.ts"),
  read("lib/supabase.ts"),
  read("app/api/departments/route.ts"),
  read("components/patrimonio/api.ts"),
  read("app/login/page.tsx"),
  read("components/patrimonio/EnvironmentsView.tsx"),
  read("components/patrimonio/types.ts"),
]);

test("banco guarda a solicitação sem senha e nega acesso direto", () => {
  assert.match(migration, /create table public\.patrimonio_access_requests/);
  assert.match(migration, /status varchar\(12\) not null default 'pending'/);
  assert.match(migration, /check \(status in \('pending', 'approved', 'rejected'\)\)/);
  assert.match(migration, /create unique index patrimonio_access_requests_pending_identifier_key/);
  assert.match(migration, /create unique index patrimonio_access_requests_pending_username_key/);
  assert.match(migration, /alter table public\.patrimonio_access_requests enable row level security/);
  assert.match(migration, /patrimonio_access_requests_no_direct_access[\s\S]*using \(false\) with check \(false\)/);
  assert.match(migration, /revoke all on table public\.patrimonio_access_requests from anon, authenticated/);
  assert.doesNotMatch(migration, /password/i);
});

test("cadastro pendente não concede acesso e exige aprovação administrativa", () => {
  assert.match(migration, /create or replace function public\.patrimonio_register_access_request/);
  assert.match(migration, /create or replace function public\.patrimonio_review_access_request/);
  assert.match(migration, /message = 'access_request_duplicate'/);
  assert.match(migration, /message = 'access_request_already_reviewed'/);
  assert.match(migration, /and active\s*\n\s*and is_admin\s*\n\s*\) then\s*\n\s*raise exception using errcode = '42501', message = 'admin_required'/);
  assert.match(migration, /perform public\.patrimonio_save_user_access_v5/);
  assert.match(migration, /perform public\.patrimonio_set_user_credentials/);
  assert.match(migration, /access_request_submitted/);
  assert.match(migration, /access_request_approved/);
  assert.match(migration, /access_request_rejected/);
  assert.match(migration, /revoke all on function public\.patrimonio_register_access_request[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.patrimonio_review_access_request[\s\S]*to service_role/);
});

test("aprovação só é possível uma vez e trava a linha durante a análise", () => {
  assert.match(migration, /where id = p_request_id\s*\n\s*for update/);
  assert.match(migration, /if target_request\.status <> 'pending' then/);
});

test("gateway limita autocadastro por identificador e por rede", () => {
  assert.match(gateway, /case "register_access_request"/);
  assert.match(gateway, /case "review_access_request"/);
  assert.match(gateway, /register_access_request_identifier: \[3, 3600\]/);
  assert.match(gateway, /register_access_request_network: \[10, 3600\]/);
  assert.match(gateway, /enforceRegistrationRateLimits\(identifier \|\| "invalid-identifier", clientAddressValue\)/);
  assert.match(gateway, /credentialRateIdentifier\(`register:\$\{identifier\}`\)/);
});

test("gateway exige administrador para revisar e apaga identidade recusada", () => {
  assert.match(gateway, /case "review_access_request": \{\s*\n\s*await requireGlobalAdmin\(identifier\)/);
  assert.match(gateway, /if \(decision === "reject"\)[\s\S]*method: "DELETE"/);
  assert.match(gateway, /patrimonio_access_request: true/);
});

test("identidade criada no cadastro é removida quando o registro falha", () => {
  assert.match(gateway, /if \(createdAuthUser\) \{[\s\S]*method: "DELETE"/);
  assert.match(gateway, /credential_identity_unmanaged/);
});

test("solicitações pendentes só chegam a administradores", () => {
  assert.match(gateway, /access\.isAdmin \? loadAccessRequests\(\) : Promise\.resolve\(\[\]\)/);
  assert.match(gateway, /async function loadAccessRequests/);
  assert.doesNotMatch(gateway, /patrimonio_access_requests\?select=[^"]*auth_user_id[^"]*&order=created_at/);
});

test("login distingue cadastro pendente de credencial inválida após conferir a senha", () => {
  assert.match(gateway, /patrimonio_resolve_pending_access_request/);
  assert.match(gateway, /const pendingResponse = await passwordGrant\(pendingEmail, password\)/);
  assert.match(gateway, /throw httpError\("access_request_pending", 403, "access_request_pending"\)/);
  assert.match(credentialAuth, /error\.message === "access_request_pending"\s*\n?\s*\? "pending_approval"/);
  assert.match(loginPage, /credentials_pending_approval/);
});

test("rota pública de cadastro repete as proteções do login por senha", () => {
  assert.match(registerRoute, /export async function POST/);
  assert.doesNotMatch(registerRoute, /export const GET/);
  assert.match(registerAuth, /fetchSite === "same-origin"/);
  assert.match(registerAuth, /new URL\(origin\)\.host === host/);
  assert.match(registerAuth, /application\/x-www-form-urlencoded/);
  assert.match(registerAuth, /new TextEncoder\(\)\.encode\(body\)\.length > MAX_FORM_BYTES/);
  assert.match(registerAuth, /safeRelativeReturnPath/);
  assert.match(registerAuth, /password !== passwordConfirmation/);
  assert.match(registerAuth, /password\.length < MIN_PASSWORD_LENGTH/);
  assert.doesNotMatch(registerAuth, /console\.(?:log|error|warn)\([^\n]*password/i);
  assert.match(sharedAuth, /export function registrationSuccessResponse/);
  assert.match(serverApi, /"register_access_request",\s*\n?\s*\{ request, clientAddress \}/);
});

test("cadastro pede apenas nome, e-mail e senha", () => {
  assert.match(loginPage, /action="\/api\/auth\/register" method="post"/);
  for (const field of ["display_name", "identifier", "password", "password_confirmation"]) {
    assert.match(loginPage, new RegExp(`name="${field}"`));
  }
  assert.match(loginPage, /Criar cadastro/);
  assert.match(loginPage, /registration_duplicate/);
  assert.match(loginPage, /Um administrador precisa aprovar a solicitação/);
  // O que o servidor resolve sozinho não é pedido a quem se cadastra.
  assert.doesNotMatch(loginPage, /name="username"/);
  assert.doesNotMatch(loginPage, /name="justification"/);
  assert.doesNotMatch(loginPage, /name="department_slug"/);
  assert.doesNotMatch(registerAuth, /form\.get\("username"\)/);
});

test("nome de usuário é derivado do e-mail e resolve homônimos", () => {
  assert.match(gateway, /async function deriveAvailableUsername/);
  assert.match(gateway, /const username = await deriveAvailableUsername\(identifier\)/);
  assert.match(gateway, /String\(identifier\)\.split\("@"\)\[0\]/);
  assert.match(gateway, /patrimonio_resolve_pending_access_request/);
  assert.match(gateway, /attempt === 0 \? "" : String\(attempt \+ 1\)/);
  assert.match(gateway, /usernamePattern\.test\(candidate\)/);
});

test("painel administrativo aprova, recusa e registra parecer", () => {
  assert.match(types, /export type AccessRequest/);
  assert.match(types, /accessRequests: AccessRequest\[\]/);
  assert.match(clientApi, /type: "review_access_request"/);
  assert.match(departmentsRoute, /body\.type === "review_access_request"/);
  assert.match(departmentsRoute, /access_request_already_reviewed/);
  assert.match(environments, /Cadastros aguardando aprovação/);
  assert.match(environments, /submitReview\("approve"\)/);
  assert.match(environments, /submitReview\("reject"\)/);
  assert.match(environments, /Aprovar e liberar acesso/);
  assert.match(environments, /reviewNote/);
});
