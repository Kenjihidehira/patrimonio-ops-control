import assert from "node:assert/strict";
import test from "node:test";

// Teste de INTEGRACAO das rotas de API: bate numa instancia de verdade e
// confirma que a superficie autenticada recusa quem nao tem sessao.
//
// Por que separado da suite rapida (`pnpm test`): as rotas do Next dependem do
// escopo de requisicao (`cookies()` via AsyncLocalStorage), entao nao ha teste
// unitario limpo do handler — chamar `GET(request)` fora de uma requisicao
// lanca. A forma honesta e exercitar um servidor rodando. Este arquivo NAO entra
// no `pnpm test` de propósito; roda com `pnpm test:routes` contra producao (ou
// contra `ROUTES_BASE_URL=http://localhost:3000` apos `pnpm build && pnpm start`).
//
// Ele reproduz, como contrato versionado, o que o pentest desta base verificou
// a mao: as 10 rotas de leitura/escrita respondem 401 sem cookie, o logout so
// aceita POST, e o login tem checagem de origem antes da senha.

const BASE = (process.env.ROUTES_BASE_URL ?? "https://patrimonio-ops-control.vercel.app").replace(/\/$/, "");

async function status(method, path, { body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "user-agent": "routes-integration", ...headers },
    body,
    redirect: "manual",
  });
  return res.status;
}

const NEGADO = new Set([401, 403, 302, 303, 307]);

test(`base alcancavel: ${BASE}`, async () => {
  const s = await status("GET", "/login");
  assert.ok(s === 200 || NEGADO.has(s), `/login respondeu ${s} — a base esta no ar?`);
});

test("rotas de leitura recusam sem sessao", async () => {
  for (const rota of ["/api/state", "/api/export", "/api/departments", "/api/documents"]) {
    const s = await status("GET", rota);
    assert.ok(NEGADO.has(s), `GET ${rota} devolveu ${s}; esperava 401/403/redir`);
  }
});

test("rotas de escrita recusam sem sessao, antes de gravar", async () => {
  for (const rota of ["/api/state", "/api/import", "/api/departments"]) {
    const s = await status("POST", rota, {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "noop" }),
    });
    assert.ok(NEGADO.has(s) || s === 400 || s === 415, `POST ${rota} devolveu ${s}`);
  }
});

test("logout so aceita POST", async () => {
  const s = await status("GET", "/api/auth/logout");
  assert.ok(s === 405 || s === 404, `GET /api/auth/logout devolveu ${s}; esperava 405`);
});

test("login confere a origem antes da senha (anti-CSRF)", async () => {
  // Sem Origin casada, o login recusa na porta — nunca chega a checar a senha.
  const s = await status("POST", "/api/auth/credentials/login", {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "login=x@y.com&password=z",
  });
  assert.equal(s, 403, `login sem origem devolveu ${s}; esperava 403`);
});

test("sessao forjada e recusada", async () => {
  const forjado = "eyJhbGciOiJIUzI1NiJ9.eyJraW5kIjoic2Vzc2lvbiJ9.assinatura-invalida";
  const s = await status("GET", "/api/state", {
    headers: { cookie: `__Host-patrimonio_session=${forjado}` },
  });
  assert.notEqual(s, 200, "cookie de sessao forjado foi aceito");
});
