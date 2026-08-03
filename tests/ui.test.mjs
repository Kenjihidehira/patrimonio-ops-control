import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  demoPage,
  loginPage,
  layout,
  themeInit,
  app,
  inventory,
  nuclei,
  collaborators,
  environments,
  operational,
  operations,
  dialogs,
  hooks,
  ui,
  types,
  css,
  enterpriseCss,
  loginCss,
  privacyCss,
  api,
  clientApi,
  importApi,
  exportApi,
  departmentsApi,
  workspace,
  googleAuth,
  sharedAuth,
  logoutRoute,
  workbook,
] = await Promise.all([
  read("app/demo/page.tsx"),
  read("app/login/page.tsx"),
  read("app/layout.tsx"),
  read("public/theme-init.js"),
  read("components/patrimonio/PatrimonioApp.tsx"),
  read("components/patrimonio/InventoryView.tsx"),
  read("components/patrimonio/NucleiView.tsx"),
  read("components/patrimonio/CollaboratorsView.tsx"),
  read("components/patrimonio/EnvironmentsView.tsx"),
  read("components/patrimonio/OperationalViews.tsx"),
  read("components/patrimonio/OperationsView.tsx"),
  read("components/patrimonio/Dialogs.tsx"),
  read("components/patrimonio/hooks.ts"),
  read("components/patrimonio/ui.tsx"),
  read("components/patrimonio/types.ts"),
  read("app/demo/patrimonio.css"),
  read("app/demo/enterprise.css"),
  read("app/login/login.css"),
  read("app/privacidade/privacy.css"),
  read("app/api/state/route.ts"),
  read("components/patrimonio/api.ts"),
  read("app/api/import/route.ts"),
  read("app/api/export/route.ts"),
  read("app/api/departments/route.ts"),
  read("lib/workspace.ts"),
  read("app/google-auth.ts"),
  read("app/auth.ts"),
  read("app/api/auth/logout/route.ts"),
  read("lib/workbook.ts"),
]);

const reactUi = [
  demoPage,
  app,
  inventory,
  nuclei,
  collaborators,
  environments,
  operational,
  operations,
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
  assert.match(reactUi, /Valor de aquisição/);
  assert.match(reactUi, /Dados de origem · Sabium/);
  assert.match(workbook, /"Valor de aquisição"/);
  assert.match(workbook, /"Identificador de origem"/);
});

test("operações patrimoniais cobrem inventário, custódia, manutenção e rastreamento", () => {
  assert.match(app, /<OperationsView dashboard=\{dashboard\}/);
  assert.match(operations, /Nova campanha/);
  assert.match(operations, /Emitir termo/);
  assert.match(operations, /Abrir ordem de manutenção/);
  assert.match(operations, /Ler QR pela câmera/);
  assert.match(operations, /QRCode\.toDataURL/);
  assert.match(operations, /tracking_tag_not_configured|Cadastre a etiqueta/);
  assert.match(enterpriseCss, /\.operations-workspace/);
  assert.match(enterpriseCss, /@media \(max-width: 640px\)[\s\S]*\.operations-summary/);
});

test("estado remoto usa requisições canceláveis e sincronização de atividade", () => {
  assert.match(hooks, /AbortController/);
  assert.match(hooks, /DASHBOARD_REFRESH_INTERVAL_MS = 30_000/);
  assert.match(hooks, /window\.addEventListener\("focus"/);
  assert.match(hooks, /window\.addEventListener\("online"/);
  assert.match(hooks, /document\.addEventListener\("visibilitychange"/);
  assert.match(hooks, /dashboardRef\.current\?\.revision/);
  assert.match(hooks, /window\.location\.replace\(cause\.signInUrl\)/);
  assert.match(clientApi, /knownRevision !== null/);
  assert.match(clientApi, /response\.status === 304/);
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
  assert.match(app, /<header className=\{`app-header \$\{mobileNavigationOpen \? "is-open" : ""\}`\}>/);
  assert.match(app, /className="app-brand"/);
  assert.match(app, /className="app-brand-logo app-brand-logo--gazin"/);
  assert.match(app, /src="\/brand\/gazin-logo\.png"/);
  assert.match(
    enterpriseCss,
    /\.app-brand-logo\.app-brand-logo--gazin\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent/,
  );
  assert.match(app, /className="primary-nav"/);
  assert.match(app, /className="mobile-menu-toggle"/);
  assert.doesNotMatch(app, /className="navigation-scrim"/);
  assert.doesNotMatch(app, /className="sidebar-department"/);
  assert.match(app, /className="nav-item-icon"/);
  assert.match(app, /<NavigationIcon view=\{item\} \/>/);
  assert.match(app, /<small>Gestão empresarial<\/small>/);
  assert.doesNotMatch(app, /header-status|DatabaseStatusIcon|Base operacional/);
  assert.match(app, /aria-current=\{view === item \? "page"/);
  assert.match(css, /\.app-header\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /\.header-actions\s*\{[\s\S]*align-items:\s*flex-end/);
  assert.match(css, /@media \(max-width: 940px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(enterpriseCss, /\/\* Horizontal application header \*\//);
  assert.match(enterpriseCss, /\.app-header-inner\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(enterpriseCss, /\.header-actions\s*\{[\s\S]*align-items:\s*flex-end/);
  assert.match(enterpriseCss, /\.app-header\.is-open/);
  assert.match(enterpriseCss, /@media \(max-width: 820px\)/);
  assert.match(enterpriseCss, /Responsive hardening: a single final cascade/);
  assert.match(enterpriseCss, /@media \(max-width: 1180px\)/);
  assert.match(enterpriseCss, /@media \(max-width: 900px\)/);
  assert.match(enterpriseCss, /@media \(max-width: 360px\)/);
  assert.match(
    enterpriseCss,
    /@media \(max-width: 900px\)[\s\S]*\.table-scroll table\s*\{[\s\S]*display:\s*none[\s\S]*\.mobile-inventory-list\s*\{[\s\S]*display:\s*grid/,
  );
  assert.match(
    enterpriseCss,
    /@media \(max-width: 900px\)[\s\S]*\.detail-panel\s*\{[\s\S]*position:\s*fixed[\s\S]*\.detail-panel\.is-open/,
  );
  assert.match(
    enterpriseCss,
    /@media \(max-width: 720px\)[\s\S]*\.app-header \.session-control form\s*\{[\s\S]*display:\s*block/,
  );
  assert.match(app, /window\.matchMedia\("\(min-width: 1181px\)"\)/);
  assert.match(enterpriseCss, /prefers-reduced-motion/);
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
  assert.match(css, /\.inventory-layout\s*\{[\s\S]*minmax\(410px, 440px\)/);
  assert.match(css, /\.table-scroll\s*\{[\s\S]*min-height:\s*0/);
  assert.match(enterpriseCss, /\.table-panel\s*\{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*align-self:\s*stretch/);
  assert.match(enterpriseCss, /\.table-scroll\s*\{[\s\S]*flex:\s*1 1 auto[\s\S]*max-height:\s*none/);
  assert.match(css, /\.inventory-asset-detail \.status-editor-heading/);
  assert.match(inventory, /className="inventory-search-control"/);
  assert.match(inventory, /className=\{`table-item-icon table-item-icon-\$\{asset\.type\}`\}/);
  assert.match(inventory, /<SummaryIcon type="discrepancy" \/>/);
  assert.match(css, /\.mobile-asset-card/);
  assert.match(css, /\.detail-panel\.is-open/);
  for (const image of ["cpu.png", "monitor.png", "chair.png", "notebook.png", "fleet.png"]) {
    assert.match(ui, new RegExp(`/assets/item-types/${image.replace(".", "\\.")}`));
  }
  assert.match(ui, /className=\{`asset-type-image \$\{className\}`\.trim\(\)\}/);
  assert.match(enterpriseCss, /\/\* Realistic asset type thumbnails \*\//);
});

test("leitor LS2208 em modo HID localiza patrimônio sem API de hardware", () => {
  assert.match(hooks, /SCANNER_CHARACTER_TIMEOUT_MS = 100/);
  assert.match(hooks, /SCANNABLE_IDENTIFIER_PATTERN = \/\^\(\?:\\d\{1,10\}\(\?:\\\.\\d\{1,6\}\)\?\|S\[A-Z0-9\]\{5\}\)\$\//);
  assert.match(hooks, /export function normalizeScannedIdentifier/);
  assert.match(hooks, /document\.addEventListener\("keydown", handleKeydown, true\)/);
  assert.match(hooks, /event\.key === "Enter" \|\| event\.key === "Tab"/);
  assert.match(app, /normalizeScannedIdentifier\(debouncedSearch\)/);
  assert.match(app, /lastProcessedScanRef\.current === identifier/);
  assert.match(app, /const matchingAssets = next\.inventory\.filter\(\(item\) =>[\s\S]*item\.sourceIdentifier === identifier[\s\S]*item\.baseCode === identifier/);
  assert.match(app, /if \(matchingAssets\.length > 1\)[\s\S]*setFilterDraft\(scanFilters\)/);
  assert.match(app, /const next = await refresh\([\s\S]*setFilterDraft\(scanFilters\);[\s\S]*openScannedAsset\(asset, identifier\)/);
  assert.match(app, /openScannedAsset\(asset, identifier\)/);
  assert.match(app, /setModal\(\{ kind: "scanner", assetId: asset\.id, scanToken: scanSequenceRef\.current \}\)/);
  assert.match(app, /key=\{modal\.kind === "scanner" \? "scanner" : JSON\.stringify\(modal\)\}/);
  assert.match(dialogs, /className="scanner-asset-modal"/);
  assert.match(dialogs, /key=\{scanToken\}/);
  assert.match(dialogs, /tabState\.scanToken === scanToken \? tabState\.tab : "summary"/);
  assert.match(dialogs, /aria-live="polite"/);
  assert.match(dialogs, /type: "update_status"/);
  assert.match(ui, /className="detail-header-row"/);
  assert.match(ui, /scanner-asset-type-icon-\$\{asset\.type\}/);
  assert.match(ui, /className=\{`detail-tab/);
  assert.match(ui, /data-status=\{asset\.status\}/);
  assert.match(ui, /className="status-editor-heading"/);
  assert.match(ui, /className="status-current-state"/);
  assert.match(ui, /aria-label="Fechar detalhes"/);
  assert.match(ui, /key=\{`\$\{asset\.id\}:\$\{asset\.status\}`\}/);
  assert.match(ui, /<span>Novo status<\/span>/);
  assert.match(ui, /<TransferIcon \/> Transferir/);
  assert.match(ui, /<CheckIcon \/> Salvar alteração/);
  assert.doesNotMatch(reactUi, /navigator\.(usb|serial)/);
  assert.match(css, /\.scanner-status\[data-state="success"\]/);
  assert.match(css, /\.scanner-status\[data-state="error"\]/);
  assert.match(css, /\.scanner-asset-detail \.detail-grid/);
  assert.match(css, /\.scanner-asset-detail \.status-form/);
  assert.match(css, /--scanner-status-accent/);
  assert.match(css, /@keyframes scanner-modal-enter/);
  assert.match(css, /@keyframes scanner-content-swap/);
});

test("leitura sem correspondência oferece cadastro auditável com o identificador lido", () => {
  assert.match(app, /kind: "scanner-missing"/);
  assert.match(app, /openMissingScannedAsset\(identifier\)/);
  assert.match(app, /isOfficialPatrimonyId\(identifier\)/);
  assert.match(dialogs, /function ScannerMissingDialog/);
  assert.match(dialogs, /Deseja adicionar este item ao inventário\?/);
  assert.match(dialogs, /Adicionar ao inventário/);
  assert.match(dialogs, /kind: "create-asset",[\s\S]*initialId: modal\.identifier/);
  assert.match(dialogs, /readOnly=\{Boolean\(initialId\)\}/);
  assert.match(dialogs, /defaultValue=\{initialId\}/);
  assert.match(dialogs, /kind: "scanner", assetId: id, scanToken: createAssetScanToken/);
  assert.match(dialogs, /type: "create_asset"/);
  assert.match(css, /\.scanner-missing-modal/);
  assert.match(css, /\.scanner-create-modal/);
});

test("cadastro de frota deriva o patrimônio e só aparece no Gazin LOG", () => {
  assert.match(dialogs, /activeDepartmentSlug === "gazin-log"/);
  assert.match(dialogs, /value !== "fleet" \|\| isFleetEnvironment/);
  assert.match(dialogs, /<span>Número da frota<\/span>/);
  assert.match(dialogs, /Patrimônio gerado:/);
  assert.match(dialogs, /toFleetPatrimonyId\(formValue\(form, "fleetNumber"\)\)/);
  assert.match(app, /next\.environment\.activeDepartment\.slug !== "gazin-log"/);
  assert.match(importApi, /Itens do tipo Frota só podem ser importados no ambiente Gazin LOG/);
  assert.match(ui, /Frota \{fleetNumber\} · #\{asset\.id\}/);
});

test("visão de núcleos oferece diretório SaaS responsivo, busca e edição auditável", () => {
  assert.match(nuclei, /className="nuclei-overview"/);
  assert.match(nuclei, /<OperationalMetric/);
  assert.match(nuclei, /className="search-control"/);
  assert.match(nuclei, /Filtrar núcleos por situação/);
  assert.match(nuclei, /aria-pressed=/);
  assert.match(nuclei, /className="nuclei-table"/);
  assert.match(nuclei, /className="nuclei-mobile-list"/);
  assert.match(nuclei, /Gestor responsável/);
  assert.match(nuclei, /Taxa de alocação/);
  assert.match(nuclei, /Ver inventário/);
  assert.match(enterpriseCss, /\.nuclei-table-shell/);
  assert.match(enterpriseCss, /\.nucleus-mobile-card/);
  assert.match(dialogs, /type: "update_nucleus"/);
  assert.match(dialogs, /type: "update_asset_details"/);
  assert.match(dialogs, /className="nucleus-inventory-dialog"/);
  assert.match(dialogs, /className="nucleus-inventory-mobile"/);
  assert.match(css, /container-type:\s*inline-size/);
});

test("perfil do colaborador diferencia patrimônios por categoria", () => {
  assert.match(collaborators, /Colaboradores por núcleo/);
  assert.match(collaborators, /className="people-mobile-list"/);
  assert.match(collaborators, /className="collaborator-avatar"/);
  assert.match(dialogs, /Patrimônios vinculados/);
  assert.match(ui, /chair: "\/assets\/item-types\/chair\.png"/);
  for (const type of ["cpu", "monitor_1", "monitor_2", "chair", "notebook"]) {
    assert.match(types, new RegExp(type));
  }
  assert.match(enterpriseCss, /\.profile-asset-icon\s*\{[\s\S]*width:\s*50px/);
  assert.match(enterpriseCss, /\.asset-type-image/);
});

test("áreas operacionais compartilham métricas, filtros e cartões responsivos", () => {
  assert.match(ui, /export function OperationalMetric/);
  assert.match(ui, /<div className="operational-metric-icon">/);
  assert.match(operational, /Buscar no histórico/);
  assert.match(operational, /Tipo de evento/);
  assert.match(operational, /Rejeitados/);
  assert.match(operational, /<div className="audit-item-icon">/);
  assert.match(operational, /<div className="import-file-icon">/);
  assert.match(collaborators, /className="operational-summary operational-summary-three"/);
  assert.match(css, /\.operational-metric/);
  assert.match(css, /\.audit-flow-point/);
  assert.match(css, /\.import-run-metrics/);
  assert.match(css, /\.people-mobile-card/);
});

test("ambientes isolam departamentos, usuários e transferências administrativas", () => {
  assert.match(app, /className="department-switcher"/);
  assert.match(app, /dashboard\.environment\.activeDepartment/);
  assert.match(app, /environment\?\.isAdmin/);
  assert.match(environments, /Acesso por usuário/);
  assert.match(environments, /Transferir entre departamentos/);
  assert.match(environments, /Colaborador e seus itens/);
  assert.match(environments, /fetchDepartmentNuclei/);
  assert.match(environments, /saveDepartmentUser/);
  assert.match(environments, /transferDepartment/);
  assert.match(departmentsApi, /save_user_access/);
  assert.match(departmentsApi, /transfer_department_entity/);
});

test("tema escuro é acessível, usa cookie e não armazena dados localmente", () => {
  assert.match(app, /role="switch"/);
  assert.match(app, /aria-checked=\{theme === "dark"\}/);
  assert.match(app, /className="theme-toggle-label" suppressHydrationWarning/);
  assert.match(hooks, /patrimonio_theme=/);
  assert.match(hooks, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(layout, /\/theme-init\.js/);
  assert.match(themeInit, /prefers-color-scheme: dark/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /--heading-text:\s*#FFFFFF/i);
  assert.match(css, /--icon-accent:\s*#8EC9FF/i);
  assert.match(
    css,
    /\.theme-toggle-track > span\s*\{[\s\S]*transform:\s*translateX\(0\);[\s\S]*transform 240ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  );
  assert.match(app, /className="theme-transition-overlay" aria-hidden="true"/);
  assert.match(
    css,
    /\.theme-transition-overlay\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*2147483647;[\s\S]*background-color:\s*var\(--canvas\);[\s\S]*opacity:\s*0/,
  );
  assert.match(css, /--theme-cover-duration:\s*100ms/);
  assert.match(css, /--theme-color-duration:\s*90ms/);
  assert.match(css, /--theme-reveal-duration:\s*120ms/);
  assert.match(css, /--theme-transition-easing:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(css, /theme-transition-active\.theme-transition-covered \.theme-transition-overlay[\s\S]*opacity:\s*1/);
  assert.match(css, /theme-transition-active\.theme-transition-revealing \.theme-transition-overlay[\s\S]*opacity:\s*0/);
  assert.doesNotMatch(css, /:root::after\s*\{[\s\S]*z-index:\s*2147483647/);
  assert.match(hooks, /THEME_COVER_DURATION_MS = 100/);
  assert.match(hooks, /THEME_COLOR_SETTLE_MS = 90/);
  assert.match(hooks, /THEME_REVEAL_DURATION_MS = 120/);
  assert.match(hooks, /classList\.add\("theme-transition-covered"\)/);
  assert.match(hooks, /classList\.add\("theme-transition-revealing"\)/);
  assert.match(hooks, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(hooks, /startViewTransition/);
  assert.doesNotMatch(reactUi, /localStorage|sessionStorage/);
});

test("visual empresarial permanece plano e sem efeitos neon", () => {
  const applicationStyles = [css, enterpriseCss, loginCss, privacyCss].join("\n");
  assert.doesNotMatch(applicationStyles, /(?:linear|radial|conic)-gradient|drop-shadow/);
  assert.match(enterpriseCss, /--canvas: #111d29/);
  assert.match(loginCss, /--login-canvas: #18232D/);
  assert.match(loginCss, /\.provider-button[\s\S]*background: var\(--login-button-start\)/);
});

test("persistência permanece no servidor e escrita exige autenticação", () => {
  assert.match(api, /Sua sessão expirou/);
  assert.match(api, /status: 401/);
  assert.match(api, /status: 304/);
  assert.doesNotMatch(api, /authenticated: Boolean\(user\)/);
  assert.match(api, /applyPersistedAction/);
  assert.match(api, /error\.code === "23505"/);
  assert.match(importApi, /MAX_FILE_BYTES/);
  assert.match(importApi, /mode === "preview"/);
  assert.match(exportApi, /if \(!user\)/);
  assert.match(workspace, /source: "locked"/);
  assert.doesNotMatch(workspace, /seed\.json/);
  assert.doesNotMatch(reactUi, /SUPABASE_GATEWAY_KEY|PATRIMONIO_WORKSPACE_KEY/);
});

test("rota operacional redireciona visitantes sem sessão para o login", () => {
  assert.match(demoPage, /await getAuthenticatedUser\(\)/);
  assert.match(demoPage, /if \(!user\) redirect\(loginPagePath\("\/demo"\)\)/);
});

test("tela React de login oferece somente Google com navegação responsiva", () => {
  assert.match(loginPage, /Continuar com Google/);
  assert.match(loginPage, /\/api\/auth\/google\/login/);
  assert.match(loginPage, /\/brand\/cx-mark-header\.png/);
  assert.match(loginPage, /className="login-card"/);
  assert.match(loginPage, /role="alert"/);
  assert.match(loginCss, /\.login-shell\s*\{[\s\S]*place-items:\s*center/);
  assert.match(loginCss, /\.login-shell::before\s*\{/);
  assert.match(loginCss, /\.login-card\s*\{[\s\S]*width:\s*min\(100%, 600px\)/);
  assert.match(loginCss, /\.login-card\s*\{[\s\S]*background:\s*var\(--login-card\)/);
  assert.match(loginCss, /\.login-card::before\s*\{/);
  assert.match(loginCss, /:root\[data-theme="dark"\]/);
  assert.match(loginCss, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(loginPage, /brand-mark|brand-panel|access-panel|Voltar ao sistema/);
  assert.doesNotMatch(loginPage, /GitHub|\/api\/auth\/github\//);
  assert.doesNotMatch(loginPage, /Microsoft/);
});

test("autenticação Google preserva PKCE, autorização por departamento e sessão protegida", () => {
  assert.match(googleAuth, /code_challenge_method: "S256"/);
  assert.match(googleAuth, /openid profile email/);
  assert.match(googleAuth, /payload\.email_verified !== true/);
  assert.match(googleAuth, /getSystemAccess/);
  assert.match(sharedAuth, /getSystemAccess/);
  assert.match(sharedAuth, /HttpOnly/i);
  assert.match(sharedAuth, /SameSite=|sameSite/i);
  assert.match(sharedAuth, /const APP_PATH = "\/demo"/);
  assert.match(sharedAuth, /const LOGIN_PATH = "\/login"/);
  assert.match(logoutRoute, /export async function POST/);
  assert.doesNotMatch(logoutRoute, /export async function GET/);
  assert.match(app, /<form action=\{dashboard\?\.session\.signOutUrl\} method="post">/);
});
