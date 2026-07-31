import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("worker aplica cabeçalhos de segurança e CSP com nonce", () => {
  const worker = read("worker/index.ts");
  for (const header of [
    "content-security-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
  ]) {
    assert.match(worker, new RegExp(header));
  }
  assert.match(worker, /HTMLRewriter/);
  assert.match(worker, /new NonceElementHandler\(nonce, true\)/);
  assert.match(worker, /this\.inlineOnly && element\.getAttribute\("src"\)/);
  assert.match(worker, /camera=\(self\)/);
  assert.match(worker, /microphone=\(\)/);
  assert.doesNotMatch(read("app/layout.tsx"), /dangerouslySetInnerHTML/);
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
