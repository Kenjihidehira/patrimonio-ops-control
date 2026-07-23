import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  demoPage,
  loginPage,
  layout,
  app,
  inventory,
  nuclei,
  collaborators,
  operational,
  dialogs,
  hooks,
  ui,
  types,
  css,
  loginCss,
  api,
  importApi,
  exportApi,
  workspace,
  githubAuth,
  googleAuth,
  sharedAuth,
  workbook,
] = await Promise.all([
  read("app/demo/page.tsx"),
  read("app/login/page.tsx"),
  read("app/layout.tsx"),
  read("components/patrimonio/PatrimonioApp.tsx"),
  read("components/patrimonio/InventoryView.tsx"),
  read("components/patrimonio/NucleiView.tsx"),
  read("components/patrimonio/CollaboratorsView.tsx"),
  read("components/patrimonio/OperationalViews.tsx"),
  read("components/patrimonio/Dialogs.tsx"),
  read("components/patrimonio/hooks.ts"),
  read("components/patrimonio/ui.tsx"),
  read("components/patrimonio/types.ts"),
  read("app/demo/patrimonio.css"),
  read("app/login/login.css"),
  read("app/api/state/route.ts"),
  read("app/api/import/route.ts"),
  read("app/api/export/route.ts"),
  read("lib/workspace.ts"),
  read("app/github-auth.ts"),
  read("app/google-auth.ts"),
  read("app/auth.ts"),
  read("lib/workbook.ts"),
]);

const reactUi = [
  demoPage,
  app,
  inventory,
  nuclei,
  collaborators,
  operational,
  dialogs,
  hooks,
  ui,
  types,
].join("\n");

test("interface operacional foi convertida para componentes React e TypeScript", () => {
  assert.match(demoPage, /<PatrimonioApp \/>/);
  assert.match(app, /export default function PatrimonioApp/);
  assert.match(inventory, /export function InventoryView/);
  assert.match(nuclei, /export function NucleiView/);
  assert.match(collaborators, /export function CollaboratorsView/);
  assert.match(dialogs, /export function Dialogs/);
  assert.match(types, /export type Dashboard/);
  assert.doesNotMatch(reactUi, /innerHTML|querySelector|document\.createElement\(["']table/);
});

test("interface contém os fluxos comerciais essenciais", () => {
  for (const marker of [
    "Controle de patrimônios",
    "Novo patrimônio",
    "Transferir patrimônio",
    "Alterar patrimônio",
    "Novo núcleo",
    "Editar núcleo",
    "Inventário do núcleo",
    "Perfil do colaborador",
    "Importar planilha XLSX",
    "Trilha de auditoria",
    "Histórico de importações",
  ]) {
    assert.match(reactUi, new RegExp(marker));
  }
  assert.match(dialogs, /type: "update_asset_identifier"/);
  assert.match(dialogs, /type: "update_asset_details"/);
  assert.match(dialogs, /"update_collaborator"/);
  assert.match(dialogs, /"register_responsible"/);
  assert.doesNotMatch(reactUi, /Valor de aquisição/);
  assert.doesNotMatch(workbook, /"Valor",|asset\.value/);
});

test("estado remoto usa requisições canceláveis e sincronização de atividade", () => {
  assert.match(hooks, /AbortController/);
  assert.match(hooks, /DASHBOARD_REFRESH_INTERVAL_MS = 10_000/);
  assert.match(hooks, /window\.addEventListener\("focus"/);
  assert.match(hooks, /window\.addEventListener\("online"/);
  assert.match(hooks, /document\.addEventListener\("visibilitychange"/);
  assert.match(hooks, /current\?\.revision === next\.revision/);
  assert.match(collaborators, /dashboard\.collaborators\.length/);
  assert.match(collaborators, /responsáveis distintos/);
});

test("campos críticos possuem semântica e validação no cliente", () => {
  assert.match(layout, /lang="pt-BR"/);
  assert.match(dialogs, /pattern="\[0-9\]\{6\}"/);
  assert.match(dialogs, /inputMode="numeric"/);
  assert.match(dialogs, /maxLength=\{6\}/);
  assert.match(inventory, /<caption className="sr-only">/);
  assert.match(ui, /role=\{error \? "alert" : "status"\}/);
});

test("layout contém breakpoints de tablet, celular e redução de movimento", () => {
  assert.match(app, /className="app-header"/);
  assert.match(app, /className="primary-nav"/);
  assert.match(app, /aria-current=\{view === item \? "page"/);
  assert.match(css, /\.app-header\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /@media \(max-width: 940px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("inventário oferece filtros, paginação e experiência móvel dedicada", () => {
  for (const marker of [
    "quick-filters",
    "inventory-layout",
    "pagination",
    "mobile-inventory-list",
    "advanced-filters-toggle",
    "detail-panel",
  ]) {
    assert.match(inventory, new RegExp(marker));
  }
  assert.match(inventory, /pageSize, setPageSize/);
  assert.match(inventory, /15 por página/);
  assert.match(inventory, /50 por página/);
  assert.match(css, /th\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /\.mobile-asset-card/);
  assert.match(css, /\.detail-panel\.is-open/);
});

test("leitor LS2208 em modo HID localiza patrimônio sem API de hardware", () => {
  assert.match(hooks, /SCANNER_CHARACTER_TIMEOUT_MS = 100/);
  assert.match(hooks, /SCANNABLE_IDENTIFIER_PATTERN = \/\^\(\?:\\d\{6\}\|S\[A-Z0-9\]\{5\}\)\$\//);
  assert.match(hooks, /export function normalizeScannedIdentifier/);
  assert.match(hooks, /document\.addEventListener\("keydown", handleKeydown, true\)/);
  assert.match(hooks, /event\.key === "Enter" \|\| event\.key === "Tab"/);
  assert.match(app, /normalizeScannedIdentifier\(debouncedSearch\)/);
  assert.match(app, /lastProcessedScanRef\.current === identifier/);
  assert.match(app, /dashboard\.inventory\.find\(\(item\) => item\.id === identifier\)/);
  assert.match(app, /openScannedAsset\(asset, identifier\)/);
  assert.match(app, /setModal\(\{ kind: "scanner", assetId: asset\.id \}\)/);
  assert.match(dialogs, /className="scanner-asset-modal"/);
  assert.match(dialogs, /type: "update_status"/);
  assert.match(ui, /className="detail-header-row"/);
  assert.match(ui, /scanner-asset-type-icon-\$\{asset\.type\}/);
  assert.match(ui, /className=\{`detail-tab/);
  assert.match(ui, /data-status=\{scannerContext \? asset\.status/);
  assert.match(ui, /className="status-editor-heading"/);
  assert.match(ui, /<TransferIcon \/> Transferir/);
  assert.match(ui, /<CheckIcon \/> Salvar status/);
  assert.doesNotMatch(reactUi, /navigator\.(usb|serial)/);
  assert.match(css, /\.scanner-status\[data-state="success"\]/);
  assert.match(css, /\.scanner-status\[data-state="error"\]/);
  assert.match(css, /\.scanner-asset-detail \.detail-grid/);
  assert.match(css, /\.scanner-asset-detail \.status-form/);
  assert.match(css, /--scanner-status-accent/);
  assert.match(css, /@keyframes scanner-modal-enter/);
});

test("visão de núcleos oferece resumo, busca e edição auditável", () => {
  assert.match(nuclei, /className="nuclei-overview"/);
  assert.match(nuclei, /Buscar núcleo/);
  assert.match(nuclei, /Taxa de alocação/);
  assert.match(nuclei, /Ver inventário/);
  assert.match(dialogs, /type: "update_nucleus"/);
  assert.match(dialogs, /type: "update_asset_details"/);
  assert.match(dialogs, /className="nucleus-inventory-dialog"/);
  assert.match(dialogs, /className="nucleus-inventory-mobile"/);
  assert.match(css, /container-type:\s*inline-size/);
});

test("perfil do colaborador diferencia patrimônios por categoria", () => {
  assert.match(collaborators, /Colaboradores por núcleo/);
  assert.match(dialogs, /Patrimônios vinculados/);
  assert.match(ui, /data-asset-icon="office-chair"/);
  for (const type of ["cpu", "monitor_1", "monitor_2", "chair", "notebook"]) {
    assert.match(types, new RegExp(type));
  }
  assert.match(css, /\.profile-asset-icon svg/);
  assert.match(css, /\.profile-asset-icon-chair/);
});

test("tema escuro é acessível, usa cookie e não armazena dados localmente", () => {
  assert.match(app, /role="switch"/);
  assert.match(app, /aria-checked=\{theme === "dark"\}/);
  assert.match(hooks, /patrimonio_theme=/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /--heading-text:\s*#FFFFFF/i);
  assert.match(css, /--icon-accent:\s*#8EC9FF/i);
  assert.doesNotMatch(reactUi, /localStorage|sessionStorage/);
});

test("persistência permanece no servidor e escrita exige autenticação", () => {
  assert.match(api, /if \(!user\)/);
  assert.match(api, /status: 401/);
  assert.match(api, /applyPersistedAction/);
  assert.match(api, /error\.code === "23505"/);
  assert.match(importApi, /MAX_FILE_BYTES/);
  assert.match(importApi, /mode === "preview"/);
  assert.match(exportApi, /if \(!user\)/);
  assert.match(workspace, /source: "locked"/);
  assert.doesNotMatch(workspace, /seed\.json/);
  assert.doesNotMatch(reactUi, /SUPABASE_GATEWAY_KEY|PATRIMONIO_WORKSPACE_KEY/);
});

test("tela React de login oferece GitHub e Google com navegação responsiva", () => {
  assert.match(loginPage, /Continuar com GitHub/);
  assert.match(loginPage, /Continuar com Google/);
  assert.match(loginPage, /\/api\/auth\/github\/login/);
  assert.match(loginPage, /\/api\/auth\/google\/login/);
  assert.match(loginPage, /role="alert"/);
  assert.match(loginCss, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(loginPage, /Microsoft/);
});

test("autenticação multiprovedor preserva PKCE, allowlists e sessão protegida", () => {
  assert.match(githubAuth, /code_challenge_method: "S256"/);
  assert.match(githubAuth, /isAllowedGitHubLogin/);
  assert.match(googleAuth, /openid profile email/);
  assert.match(googleAuth, /payload\.email_verified !== true/);
  assert.match(googleAuth, /isAllowedGoogleEmail/);
  assert.match(sharedAuth, /HttpOnly/i);
  assert.match(sharedAuth, /SameSite=|sameSite/i);
  assert.match(sharedAuth, /const APP_PATH = "\/demo"/);
  assert.match(sharedAuth, /const LOGIN_PATH = "\/login"/);
});
