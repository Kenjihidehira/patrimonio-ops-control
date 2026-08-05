import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  migration,
  gateway,
  credentialAuth,
  credentialRoute,
  sharedAuth,
  serverApi,
  loginPage,
  environments,
  privacyPage,
] = await Promise.all([
  read("supabase/migrations/20260804142509_add_credential_login.sql"),
  read("supabase/functions/patrimonio-gateway/index.ts"),
  read("app/credential-auth.ts"),
  read("app/api/auth/credentials/login/route.ts"),
  read("app/auth.ts"),
  read("lib/supabase.ts"),
  read("app/login/page.tsx"),
  read("components/patrimonio/EnvironmentsView.tsx"),
  read("app/privacidade/page.tsx"),
]);

test("banco vincula username ao Supabase Auth sem armazenar senha", () => {
  assert.match(migration, /add column username varchar\(32\)/);
  assert.match(migration, /auth_user_id uuid references auth\.users\(id\) on delete set null/);
  assert.match(migration, /create unique index patrimonio_users_username_key/);
  assert.match(migration, /create unique index patrimonio_users_auth_user_key/);
  assert.match(migration, /session_version = session_version \+ 1/);
  assert.match(migration, /credential_login_configured/);
  assert.match(migration, /revoke all on function public\.patrimonio_resolve_credential_login/);
  assert.match(migration, /grant execute on function public\.patrimonio_set_user_credentials[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /add column (?:credential_)?password/i);
});

test("gateway verifica senha no Supabase, limita tentativas e não expõe tokens", () => {
  assert.match(gateway, /case "authenticate_credentials"/);
  assert.match(gateway, /auth\/v1\/token\?grant_type=password/);
  assert.match(gateway, /authenticate_credentials_login: \[8, 900\]/);
  assert.match(gateway, /authenticate_credentials_network: \[30, 900\]/);
  assert.match(gateway, /crypto\.subtle\.sign\(\s*"HMAC"/);
  assert.match(gateway, /app_metadata: \{ patrimonio_managed: true \}/);
  assert.match(gateway, /credential_identity_unmanaged/);
  assert.match(gateway, /identifier: targetEmail,[\s\S]*displayName:[\s\S]*subject:[\s\S]*sessionVersion:/);
  assert.doesNotMatch(gateway, /return\s*\{\s*access_token|return\s*\{\s*refresh_token/);
  assert.doesNotMatch(gateway, /console\.(?:log|error|warn)\([^\n]*password/i);
});

test("rota de credenciais aceita somente formulário local pequeno e cria sessão comum", () => {
  assert.match(credentialRoute, /export async function POST/);
  assert.doesNotMatch(credentialRoute, /export const GET/);
  assert.match(credentialAuth, /fetchSite === "same-origin"/);
  assert.match(credentialAuth, /new URL\(origin\)\.host === host/);
  assert.match(credentialAuth, /application\/x-www-form-urlencoded/);
  assert.match(credentialAuth, /new TextEncoder\(\)\.encode\(body\)\.length > MAX_FORM_BYTES/);
  assert.match(credentialAuth, /safeRelativeReturnPath/);
  assert.match(credentialAuth, /provider: "credentials"/);
  assert.match(sharedAuth, /identity\.provider === "credentials" \? 303 : 302/);
  assert.match(sharedAuth, /value === "google" \|\| value === "credentials"/);
  assert.match(serverApi, />\("authenticate_credentials", \{ login, password, clientAddress \}\);/);
  assert.doesNotMatch(credentialAuth, /console\.(?:log|error|warn)\([^\n]*password/i);
});

test("interface permite entrar, configurar, redefinir e desabilitar credenciais", () => {
  assert.match(loginPage, /action="\/api\/auth\/credentials\/login" method="post"/);
  assert.match(loginPage, /name="login"[\s\S]*autoComplete="username"/);
  assert.match(loginPage, /name="password"[\s\S]*autoComplete="current-password"/);
  assert.match(loginPage, /\/api\/auth\/google\/login/);
  assert.match(environments, /credentialMode/);
  assert.match(environments, /"configure"/);
  assert.match(environments, /"disable"/);
  assert.match(environments, /autoComplete="new-password"/);
  assert.match(environments, /minLength=\{12\}/);
  assert.match(environments, /hasCredentials/);
  assert.match(privacyPage, /Supabase Auth/);
  assert.match(privacyPage, /hash/);
});
