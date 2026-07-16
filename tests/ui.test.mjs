import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/demo/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/demo/styles.css", import.meta.url), "utf8");
const js = await readFile(new URL("../public/demo/app.js", import.meta.url), "utf8");
const api = await readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
const importApi = await readFile(new URL("../app/api/import/route.ts", import.meta.url), "utf8");
const exportApi = await readFile(new URL("../app/api/export/route.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../lib/workspace.ts", import.meta.url), "utf8");
const githubAuth = await readFile(new URL("../app/github-auth.ts", import.meta.url), "utf8");
const googleAuth = await readFile(new URL("../app/google-auth.ts", import.meta.url), "utf8");
const sharedAuth = await readFile(new URL("../app/auth.ts", import.meta.url), "utf8");
const loginHtml = await readFile(new URL("../public/login/index.html", import.meta.url), "utf8");
const loginCss = await readFile(new URL("../public/login/styles.css", import.meta.url), "utf8");
const loginJs = await readFile(new URL("../public/login/app.js", import.meta.url), "utf8");

test("interface contém os fluxos comerciais essenciais", () => {
  for (const marker of [
    "Controle de patrimônios",
    "inventory-body",
    "asset-dialog",
    "transfer-dialog",
    "nucleus-dialog",
    "audit-list",
    "import-dialog",
    "import-history",
    "collaborators-view",
    "people-body",
    "edit-nucleus-dialog",
    "export-button",
    "status-form",
  ]) {
    assert.match(`${html}\n${js}`, new RegExp(marker));
  }
  assert.match(html, /id="result-label"/);
  assert.match(js, /dashboard\.resultCount === 1 \? "patrimônio encontrado"/);
  assert.match(js, /type: "update_nucleus"/);
  assert.match(js, /collaboratorsWithoutAssets/);
});

test("campos críticos possuem semântica e validação no cliente", () => {
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /pattern="\[0-9\]\{6\}"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(js, /\/\^\\d\{6\}\$\//);
});

test("layout contém breakpoints de tablet, celular e redução de movimento", () => {
  assert.match(css, /@media \(max-width: 940px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("persistência não depende de localStorage e escrita exige autenticação", () => {
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.match(api, /if \(!user\)/);
  assert.match(api, /status: 401/);
  assert.match(api, /applyPersistedAction/);
  assert.match(importApi, /MAX_FILE_BYTES/);
  assert.match(importApi, /status: 401/);
  assert.match(importApi, /mode === "preview"/);
  assert.match(exportApi, /if \(!user\)/);
  assert.match(exportApi, /status: 401/);
  assert.match(workspace, /source: "locked"/);
  assert.doesNotMatch(workspace, /seed\.json/);
  assert.match(js, /elements\.exportButton/);
});

test("tela de login oferece GitHub e Google com navegação acessível e responsiva", () => {
  assert.match(loginHtml, /Continuar com GitHub/);
  assert.match(loginHtml, /Continuar com Google/);
  assert.doesNotMatch(loginHtml, /Microsoft|microsoft/);
  assert.match(loginHtml, /role="alert"/);
  assert.match(loginCss, /@media \(max-width: 760px\)/);
  assert.match(loginCss, /prefers-reduced-motion/);
  assert.doesNotMatch(`${loginJs}\n${js}`, /localStorage|sessionStorage/);
  assert.match(loginJs, /safeReturnPath/);
});

test("autenticação multiprovedor usa PKCE, OIDC, allowlists e sessão protegida", () => {
  assert.match(api, /getAuthenticatedUser/);
  for (const providerAuth of [githubAuth, googleAuth]) {
    assert.match(providerAuth, /code_challenge_method: "S256"/);
    assert.match(providerAuth, /readOAuthTransaction/);
  }
  assert.match(githubAuth, /isAllowedGitHubLogin/);
  assert.match(githubAuth, /https:\/\/api\.github\.com\/user/);
  assert.match(googleAuth, /isAllowedGoogleEmail/);
  assert.match(googleAuth, /payload\.email_verified !== true/);
  assert.match(googleAuth, /jwtVerify/);
  assert.match(sharedAuth, /payload\.state !== state/);
  assert.match(sharedAuth, /HttpOnly; SameSite=Lax/);
  assert.match(sharedAuth, /AUTH_SESSION_SECRET/);
});
