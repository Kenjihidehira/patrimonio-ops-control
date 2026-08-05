import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("middleware aplica cabeçalhos de segurança e CSP com nonce", () => {
  const middleware = read("proxy.ts");
  for (const header of [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
  ]) {
    assert.match(middleware, new RegExp(header));
  }
  // O nonce viaja no cabeçalho da requisição para que o Next.js o aplique aos
  // scripts que injeta, no lugar da reescrita de HTML feita pelo Worker.
  assert.match(middleware, /requestHeaders\.set\("x-nonce", nonce\)/);
  assert.match(middleware, /requestHeaders\.set\("content-security-policy", contentSecurityPolicy\)/);
  assert.match(middleware, /script-src 'self' 'nonce-\$\{nonce\}'/);
  assert.match(middleware, /style-src 'self' 'nonce-\$\{nonce\}'/);
  assert.match(middleware, /frame-ancestors 'none'/);
  assert.match(middleware, /object-src 'none'/);
  assert.match(middleware, /camera=\(self\)/);
  assert.match(middleware, /geolocation=\(self\)/);
  assert.match(middleware, /microphone=\(\)/);
  assert.doesNotMatch(read("app/layout.tsx"), /dangerouslySetInnerHTML/);
});

test("permissão de eval fica restrita ao desenvolvimento", () => {
  const middleware = read("proxy.ts");
  assert.match(middleware, /process\.env\.NODE_ENV === "development" \? " 'unsafe-eval'" : ""/);
  // A política de produção nunca recebe a permissão literalmente.
  assert.doesNotMatch(middleware, /script-src 'self' 'nonce-\$\{nonce\}' 'unsafe-eval'/);
});

test("aplicação não depende mais de APIs exclusivas da Cloudflare", () => {
  for (const file of [
    "app/auth.ts",
    "lib/supabase.ts",
    "app/credential-auth.ts",
    "app/register-auth.ts",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /cloudflare:workers/);
    assert.doesNotMatch(source, /cf-connecting-ip/);
  }
  assert.match(read("app/auth.ts"), /process\.env\[name\]/);
  assert.match(read("package.json"), /"build": "next build"/);
  assert.doesNotMatch(read("package.json"), /wrangler|vinext|@cloudflare/);
});

test("migração LGPD mantém tabelas protegidas e funções restritas ao service role", () => {
  const migration = read("supabase/migrations/20260727190544_lgpd_security_controls.sql");
  for (const table of [
    "patrimonio_security_events",
    "patrimonio_request_limits",
    "patrimonio_gateway_nonces",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.match(migration, /security invoker/g);
  assert.match(migration, /patrimonio_save_user_access_v2/);
  assert.match(migration, /patrimonio_authorize_operation/);
});

test("login oferece aviso de privacidade e a página informa os direitos", () => {
  const login = read("app/login/page.tsx");
  const privacy = read("app/privacidade/page.tsx");
  assert.match(login, /\/privacidade/);
  assert.match(privacy, /Controlador e encarregado/);
  assert.match(privacy, /Seus direitos/);
  assert.match(privacy, /transferência internacional/i);
});
