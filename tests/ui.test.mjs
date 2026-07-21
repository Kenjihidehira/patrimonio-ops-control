import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/demo/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/demo/styles-gazin-theme.css", import.meta.url), "utf8");
const js = await readFile(new URL("../public/demo/app.js", import.meta.url), "utf8");
const themeInit = await readFile(new URL("../public/demo/theme-init.js", import.meta.url), "utf8");
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
const workbook = await readFile(new URL("../lib/workbook.ts", import.meta.url), "utf8");

test("interface contém os fluxos comerciais essenciais", () => {
  for (const marker of [
    "Controle de patrimônios",
    "inventory-body",
    "asset-dialog",
    "identifier-dialog",
    "transfer-dialog",
    "nucleus-dialog",
    "audit-list",
    "import-dialog",
    "import-history",
    "collaborators-view",
    "people-body",
    "edit-nucleus-dialog",
    "collaborator-dialog",
    "export-button",
    "status-form",
  ]) {
    assert.match(`${html}\n${js}`, new RegExp(marker));
  }
  assert.match(html, /id="result-label"/);
  assert.match(js, /dashboard\.resultCount === 1 \? "patrimônio encontrado"/);
  assert.match(js, /type: "update_nucleus"/);
  assert.match(js, /type: "update_collaborator"/);
  assert.match(js, /type: "update_asset_identifier"/);
  assert.match(js, /identifier_change: "Alteração de patrimônio"/);
  assert.match(js, /function openIdentifierDialog/);
  assert.match(html, /id="identifier-form"/);
  assert.match(html, /name="newAssetId" inputmode="numeric" pattern="\[0-9\]\{6\}"/);
  assert.match(js, /collaboratorsWithoutAssets/);
  assert.doesNotMatch(html, /Valor de aquisição/);
  assert.doesNotMatch(js, /<dt>Valor<\/dt>/);
  assert.doesNotMatch(workbook, /"Valor",/);
  assert.doesNotMatch(workbook, /asset\.value/);
  assert.match(css, /--brand-700: #0055A5/i);
  assert.match(css, /--yellow: #FFC400/i);
});

test("campos críticos possuem semântica e validação no cliente", () => {
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /pattern="\[0-9\]\{6\}"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(js, /\/\^\\d\{6\}\$\//);
});

test("layout contém breakpoints de tablet, celular e redução de movimento", () => {
  assert.match(html, /<header class="app-header">/);
  assert.match(html, /src="\.\.\/brand\/cx-mark-header\.png"/);
  assert.match(html, /<nav class="primary-nav" aria-label="Navegação principal">/);
  assert.match(html, /data-view="inventory" aria-current="page"/);
  assert.doesNotMatch(html, /class="nav-index"/);
  assert.match(js, /button\.removeAttribute\("aria-current"\)/);
  assert.doesNotMatch(html, /class="sidebar"/);
  assert.match(css, /\.app-header \{[\s\S]*position: sticky/);
  assert.match(css, /\.primary-nav \{[\s\S]*display: flex/);
  assert.match(css, /@media \(max-width: 940px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("inventário oferece navegação escalável e experiência móvel dedicada", () => {
  for (const marker of [
    "quick-filters",
    "data-quick-filter=\"unassigned\"",
    "data-quick-filter=\"untagged\"",
    "inventory-pagination",
    "mobile-inventory-list",
    "advanced-filters-toggle",
    "data-page-action=\"next\"",
    "page-size",
  ]) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(js, /function getQuickFilteredInventory/);
  assert.match(js, /function assetIdentifierLabel/);
  assert.match(js, /function renderPagination/);
  assert.match(js, /data-detail-tab="history"/);
  assert.match(css, /th \{[\s\S]*position: sticky/);
  assert.match(css, /\.mobile-asset-card/);
  assert.match(css, /\.detail-panel\.is-open/);
});

test("tema escuro usa cores próprias para textos de destaque e ícones", () => {
  assert.match(css, /--heading-text:\s*#FFFFFF/i);
  assert.match(css, /--emphasis-text:\s*#B9DCFF/i);
  assert.match(css, /--icon-accent:\s*#8EC9FF/i);
  assert.match(css, /--icon-muted:\s*#C5D1DF/i);
  assert.match(css, /\.button-secondary\s*>\s*span\[aria-hidden="true"\]/);
  assert.match(css, /\.icon-button\s*\{[^}]*color:\s*var\(--icon-muted\)/s);
});

test("visão de núcleos oferece resumo, busca e hierarquia operacional", () => {
  for (const marker of [
    "nuclei-overview",
    "nuclei-search",
    "nuclei-result-count",
    "nuclei-empty",
  ]) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(js, /const filteredNuclei = nuclei\.filter/);
  assert.match(js, /class="nucleus-progress"/);
  assert.match(js, /aria-label="Editar núcleo/);
  assert.match(css, /\.nuclei-overview/);
  assert.match(css, /\.nucleus-health\.has-alerts/);
  assert.match(css, /\.nucleus-meta/);
  assert.match(css, /\.button\[hidden\]\s*\{[^}]*display:\s*none/s);
});

test("inventário do núcleo permite consultar e editar dados cadastrais", () => {
  for (const marker of [
    "nucleus-inventory-dialog",
    "nucleus-inventory-summary",
    "nucleus-inventory-search",
    "nucleus-inventory-body",
    "nucleus-asset-form",
  ]) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(js, /dashboard\.nucleusInventory/);
  assert.match(js, /data-view-nucleus-inventory/);
  assert.match(js, /type: "update_asset_details"/);
  assert.match(js, /function renderNucleusInventory\(\)/);
  assert.match(css, /\.nucleus-inventory-mobile-card/);
  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /@container \(max-width: 850px\)[\s\S]*\.nucleus-inventory-table-wrap/);
  assert.match(css, /@container \(max-width: 650px\)[\s\S]*\.nucleus-inventory-summary/);
  assert.match(css, /min-width:\s*920px/);
  assert.match(html, /class="nucleus-inventory-code"/);
  assert.match(html, /class="nucleus-inventory-search-control"/);
  assert.match(js, /nucleus-inventory-item-\$\{escapeAttribute\(asset\.type\)\}/);
});

test("perfil do colaborador diferencia patrimônios com ícones por categoria", () => {
  assert.match(js, /function assetTypeIcon\(type\)/);
  for (const type of ["cpu", "monitor_1", "monitor_2", "chair", "notebook"]) {
    assert.match(js, new RegExp(`${type}:`));
  }
  assert.match(js, /data-asset-icon="office-chair"/);
  assert.match(js, /profile-asset-icon-\$\{escapeAttribute\(asset\.type\)\}/);
  assert.match(css, /\.profile-asset-icon svg/);
  assert.match(css, /\.profile-asset-icon-chair/);
  assert.match(css, /--profile-icon-accent:\s*var\(--status-warning-text\)/);
  assert.match(css, /\.nucleus-inventory-mobile-heading \.profile-asset-icon\s*\{[^}]*display:\s*grid;[^}]*width:\s*42px;[^}]*height:\s*42px;[^}]*place-items:\s*center;/s);
  assert.match(js, /class="profile-asset-heading"/);
  assert.match(js, /class="profile-asset-meta"/);
  assert.match(css, /--asset-accent:/);
  assert.match(css, /\.profile-asset-item:hover/);
});

test("tema escuro é acessível, persistido em cookie e não usa armazenamento local", () => {
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /role="switch"/);
  assert.match(html, /theme-init\.js/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(js, /patrimonio_theme=/);
  assert.match(js, /aria-checked/);
  assert.match(themeInit, /prefers-color-scheme: dark/);
  assert.doesNotMatch(`${themeInit}\n${js}`, /localStorage|sessionStorage/);
  assert.match(js, /De \$\{escapeHtml\(movement\.from\)\} para/);
  assert.doesNotMatch(js, /<br \/>→| → /);
});

test("persistência não depende de localStorage e escrita exige autenticação", () => {
  assert.doesNotMatch(`${themeInit}\n${js}`, /localStorage|sessionStorage/);
  assert.match(api, /if \(!user\)/);
  assert.match(api, /status: 401/);
  assert.match(api, /applyPersistedAction/);
  assert.match(api, /error\.code === "23505"/);
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
