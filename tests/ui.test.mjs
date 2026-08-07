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
  dashboardView,
  inventory,
  nuclei,
  collaborators,
  environments,
  operational,
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
  credentialAuthSource,
  logoutRoute,
  workbook,
  operationsCenter,
  inventoryOperations,
  lifecycleOperations,
  documentsOperations,
  integrationOperations,
  qrScanner,
  offlineInventory,
  documentsApi,
] = await Promise.all([
  read("app/demo/page.tsx"),
  read("app/login/page.tsx"),
  read("app/layout.tsx"),
  read("public/theme-init.js"),
  read("components/patrimonio/PatrimonioApp.tsx"),
  read("components/patrimonio/DashboardView.tsx"),
  read("components/patrimonio/InventoryView.tsx"),
  read("components/patrimonio/NucleiView.tsx"),
  read("components/patrimonio/CollaboratorsView.tsx"),
  read("components/patrimonio/EnvironmentsView.tsx"),
  read("components/patrimonio/OperationalViews.tsx"),
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
  read("app/credential-auth.ts"),
  read("app/api/auth/logout/route.ts"),
  read("lib/workbook.ts"),
  read("components/patrimonio/OperationsCenterView.tsx"),
  read("components/patrimonio/operations/InventoryOperations.tsx"),
  read("components/patrimonio/operations/LifecycleOperations.tsx"),
  read("components/patrimonio/operations/DocumentsOperations.tsx"),
  read("components/patrimonio/operations/IntegrationOperations.tsx"),
  read("components/patrimonio/operations/QrCameraScanner.tsx"),
  read("components/patrimonio/operations/offlineInventory.ts"),
  read("app/api/documents/route.ts"),
]);

const reactUi = [
  demoPage,
  app,
  dashboardView,
  inventory,
  nuclei,
  collaborators,
  environments,
  operational,
  dialogs,
  hooks,
  ui,
  types,
  operationsCenter,
  inventoryOperations,
  lifecycleOperations,
  documentsOperations,
  integrationOperations,
  qrScanner,
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

test("dashboard executivo é a entrada padrão e usa somente indicadores sustentados pelos dados", () => {
  assert.match(app, /useState<ViewId>\("dashboard"\)/);
  assert.match(app, /dashboard: "Dashboard"/);
  assert.match(app, /<DashboardView/);
  assert.match(dashboardView, /Distribuição operacional/);
  assert.match(dashboardView, /Movimentações registradas/);
  assert.match(dashboardView, /Atenção da gestão/);
  assert.match(dashboardView, /Pendências por núcleo/);
  assert.match(dashboardView, /Inventário físico/);
  assert.match(dashboardView, /Idade do backlog/);
  assert.match(dashboardView, /Cobertura dos controles/);
  assert.match(dashboardView, /Filtros do dashboard/);
  assert.match(dashboardView, /dashboard-filter-nucleus/);
  assert.match(dashboardView, /dashboard-filter-type/);
  assert.match(dashboardView, /dashboard-filter-status/);
  assert.match(dashboardView, /dashboard-filter-source/);
  assert.match(dashboardView, /buildFilteredDashboardAnalytics/);
  assert.doesNotMatch(dashboardView, /style=\{\{/);
  assert.match(dashboardView, /<progress/);
  assert.doesNotMatch(dashboardView, /MTBF|MTTR|custo por km/i);
});

test("interface contém os fluxos comerciais essenciais", () => {
  // Os títulos das telas são os próprios nomes das visões, sem legenda:
  // software corporativo não se apresenta em toda tela.
  assert.match(reactUi, /inventory: \{ title: "Inventário" \}/);
  assert.doesNotMatch(reactUi, /description: "Localize ativos/);
  for (const marker of [
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
  assert.doesNotMatch([inventory, dialogs, operational].join("\n"), /Valor de aquisição/);
  assert.match(documentsOperations, /Valor de aquisição/);
  assert.match(workbook, /includeFinancials/);
  assert.match(workbook, /Valor de aquisição/);
  assert.match(workbook, /Custos contratuais/);
  assert.match(workbook, /Solicitações financeiras/);
  assert.match(exportApi, /scope === "financial" \? "export_financial" : "export"/);
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

test("mutações reaproveitam o painel retornado sem uma recarga completa adicional", () => {
  assert.match(clientApi, /Promise<\{ dashboard: Dashboard; message: string \}>/);
  assert.match(clientApi, /fetch\(`\/api\/state\?\$\{query\}`/);
  assert.match(api, /needsWorkspaceBeforeMutation/);
  assert.match(api, /if \(!isOperationalAction\) applyAction/);
  assert.match(api, /dashboard:\s*\{/);
  assert.match(app, /applyDashboard\(result\.dashboard\)/);
  assert.doesNotMatch(
    app,
    /const result = await mutateDashboard[\s\S]{0,500}await refresh\(\{ quiet: true \}\)/,
  );
  assert.match(hooks, /!options\.quiet \|\| !dashboardRef\.current/);
});

test("campos críticos possuem semântica e validação no cliente", () => {
  assert.match(layout, /lang="pt-BR"/);
  assert.match(dialogs, /pattern="\[0-9\]\{6\}"/);
  assert.match(dialogs, /inputMode="numeric"/);
  assert.match(dialogs, /maxLength=\{6\}/);
  assert.match(inventory, /<caption className="sr-only">/);
  assert.match(ui, /role=\{error \? "alert" : "status"\}/);
});

test("cabeçalho mantém a saída acessível no celular", () => {
  // Uma regra anterior oculta `.session-control form`; sem reexibi-lo no bloco
  // móvel, o botão Sair fica com tamanho zero e o usuário não consegue sair.
  assert.match(
    enterpriseCss,
    /\.app-header \.session-control form \{\s*display: block;/,
  );
  assert.match(
    enterpriseCss,
    /\.app-header \.session-sign-out \{[\s\S]*?min-height: 36px;/,
  );
});

test("no celular as ações do cabeçalho ficam dentro do menu", () => {
  // Fechado, o cabeçalho guarda apenas marca e botão de menu; a faixa de
  // departamento, tema e saída só aparece com a navegação aberta.
  assert.match(
    enterpriseCss,
    /\.header-actions \{\s*display: none;\s*grid-column: 1 \/ -1;\s*grid-row: 3;/,
  );
  assert.match(
    enterpriseCss,
    /\.app-header\.is-open \.header-actions \{\s*display: grid;\s*\}/,
  );
  assert.match(enterpriseCss, /\.primary-nav \{\s*grid-row: 2;/);
});

test("layout contém breakpoints de tablet, celular e redução de movimento", () => {
  assert.match(app, /<header className=\{`app-header \$\{mobileNavigationOpen \? "is-open" : ""\}`\}>/);
  assert.match(app, /className="app-brand"/);
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
  assert.doesNotMatch(css, /min-width:\s*320px/);
  assert.match(enterpriseCss, /\/\* Horizontal application header \*\//);
  assert.match(enterpriseCss, /\.app-header-inner\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
  assert.match(enterpriseCss, /\.header-actions\s*\{[\s\S]*align-items:\s*flex-end/);
  assert.match(enterpriseCss, /\.app-header\.is-open/);
  assert.match(enterpriseCss, /@media \(max-width: 820px\)/);
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
  assert.match(css, /\.inventory-asset-detail \.status-editor-heading/);
  assert.match(inventory, /className="inventory-search-control"/);
  assert.match(inventory, /className=\{`table-item-icon table-item-icon-\$\{asset\.type\}`\}/);
  assert.match(inventory, /<SummaryIcon type="discrepancy" \/>/);
  assert.match(css, /\.mobile-asset-card/);
  assert.match(css, /\.detail-panel\.is-open/);
  for (const image of ["cpu.png", "monitor.png", "chair.png", "notebook.png"]) {
    assert.match(ui, new RegExp(`/assets/item-types/${image.replace(".", "\\.")}`));
  }
  assert.match(ui, /className=\{`asset-type-image \$\{className\}`\.trim\(\)\}/);
  assert.match(enterpriseCss, /\/\* Realistic asset type thumbnails \*\//);
});

test("leitor LS2208 em modo HID localiza patrimônio sem API de hardware", () => {
  assert.match(hooks, /SCANNER_CHARACTER_TIMEOUT_MS = 100/);
  assert.match(hooks, /SCANNABLE_IDENTIFIER_PATTERN = \/\^\(\?:\\d\{1,10\}\(\?:\\\.\\d\{1,6\}\)\?\|S\[A-Z0-9\]\{5\}\|G\[A-F0-9\]\{20\}\)\$\//);
  assert.match(hooks, /export function normalizeScannedIdentifier/);
  assert.match(hooks, /document\.addEventListener\("keydown", handleKeydown, true\)/);
  assert.match(hooks, /event\.key === "Enter" \|\| event\.key === "Tab"/);
  assert.match(app, /normalizeScannedIdentifier\(debouncedSearch\)/);
  assert.match(app, /lastProcessedScanRef\.current === identifier/);
  assert.match(app, /item\.id === identifier[\s\S]*item\.sourceIdentifier === identifier[\s\S]*item\.baseCode === identifier/);
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
  assert.match(app, /isFleetPatrimonyId\(identifier\)[\s\S]*activeDepartment\.slug !== "gazin-log"/);
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

test("tema escuro é acessível e persiste somente a preferência em cookie", () => {
  assert.match(app, /role="switch"/);
  assert.match(app, /aria-checked=\{theme === "dark"\}/);
  assert.match(app, /className="theme-toggle-label" suppressHydrationWarning/);
  assert.match(hooks, /patrimonio_theme=/);
  assert.match(hooks, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(layout, /\/theme-init\.js/);
  assert.match(themeInit, /prefers-color-scheme: dark/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /--heading-text:\s*#FFFFFF/i);
  // Azul institucional derivado da logo Gazin, clareado para o tema escuro.
  assert.match(css, /--icon-accent:\s*#AEB3FF/i);
  assert.doesNotMatch(reactUi, /localStorage|sessionStorage/);
});

test("a paleta institucional vem do azul da logo Gazin", () => {
  // O bloco de tokens do enterprise.css carrega depois e é o que vale.
  assert.match(enterpriseCss, /--brand-700: #0B109F;/);
  assert.match(enterpriseCss, /--sidebar-bg: #080B73;/);
  assert.match(enterpriseCss, /--action-bg: #0B109F;/);
  assert.match(loginCss, /--brand-700: #0B109F;/);
  // O cobalto anterior não era a cor da marca e não deve voltar.
  assert.doesNotMatch(enterpriseCss, /#315f87|#0055A5/i);
});

test("visual empresarial permanece plano e sem efeitos neon", () => {
  // A superfície chapada continua valendo para o sistema. A tela de login é a
  // exceção deliberada: adota o degradê da referência aprovada, e só ela.
  const applicationStyles = [css, enterpriseCss, privacyCss].join("\n");
  assert.doesNotMatch(applicationStyles, /(?:linear|radial|conic)-gradient/);
  assert.doesNotMatch([applicationStyles, loginCss].join("\n"), /drop-shadow/);
  // O fundo institucional e recriado em CSS: brilho no alto, feixes diagonais
  // e a base azul escurecendo. Tom unico, sem seguir o tema do sistema.
  assert.match(loginCss, /linear-gradient\(163deg, #0F2E86/);
  assert.match(loginCss, /repeating-linear-gradient\(/);
  assert.doesNotMatch(loginCss, /data-theme="dark"\] \.login-shell/);
  assert.match(enterpriseCss, /--canvas: #111d29/);
  // O azul da marca toma a tela; o cartão claro é o único ponto de foco.
  assert.match(loginCss, /--login-canvas: #080B73;/);
  assert.match(loginCss, /--login-canvas: #070A3A;/);
  assert.match(loginCss, /\.credential-submit \{[\s\S]*?background: var\(--login-button-start\)/);
  // Entrar é a ação primária e o Google é alternativa: dois botões sólidos na
  // mesma cor obrigam a ler os dois para descobrir qual é qual.
  assert.match(loginCss, /\.provider-button \{[\s\S]*?background: var\(--login-button-start\)/);
});

test("o login usa cartão centrado com faixa amarela", () => {
  // Largura fluida em vez de fixa, com piso para o celular e teto para o
  // formulario nao esticar a ponto de perder relacao com o texto.
  assert.match(loginCss, /width: min\(100%, clamp\(340px, 62vw, 560px\)\);/);
  // Com largura sobrando, senha e confirmacao ficam lado a lado.
  assert.match(loginCss, /@media \(min-width: 760px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  // O formulario volta a ter caixa, translucida para o fundo atravessar.
  assert.match(loginCss, /\.login-card \{[\s\S]*?background: rgba\(255, 255, 255, 0\.08\)/);
  assert.match(loginCss, /\.credential-submit \{[\s\S]*?background: var\(--yellow\)/);
  assert.match(loginCss, /\.login-mode-active \{\s*background: var\(--login-button-start\);/);
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

test("tela React de login oferece credenciais e Google com navegação responsiva", () => {
  assert.match(loginPage, /action="\/api\/auth\/credentials\/login"/);
  assert.match(loginPage, /name="login"/);
  assert.match(loginPage, /autoComplete="username"/);
  assert.match(loginPage, /name="password"/);
  assert.match(loginPage, /autoComplete="current-password"/);
  assert.match(loginPage, /Continuar com Google/);
  assert.match(loginPage, /\/api\/auth\/google\/login/);
  // A mesma logo Gazin identifica o produto em toda parte, inclusive no login.
  assert.match(loginPage, /\/brand\/gazin-logo\.png/);
  assert.match(loginPage, /className="login-card"/);
  assert.match(loginPage, /role="alert"/);
  assert.match(loginCss, /\.login-shell \{[\s\S]*?place-items: center/);
  assert.match(loginCss, /\.login-card \{[\s\S]*?background: var\(--login-card\)/);
  // A marca assina por cima do cartão, sem painel proprio.
  assert.match(loginCss, /\.login-brand \{\s*padding: 0 0 20px;\s*background: transparent;/);
  // A logo perde a placa: sobre o fundo escuro sao as letras brancas que leem.
  assert.doesNotMatch(loginCss, /\.login-brand-plate \{[\s\S]*?background: #FFFFFF;/);
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

test("central operacional reúne o ciclo físico, financeiro e integrado do patrimônio", () => {
  for (const marker of [
    "Inventário cíclico",
    "Custódia",
    "Manutenção",
    "Rastreamento",
    "Ciclo de vida",
    "Documentos",
    "Integrações",
  ]) {
    assert.match(reactUi, new RegExp(marker));
  }
  assert.match(app, /operations:\s*\{/);
  assert.match(operationsCenter, /Índice de risco/);
  assert.match(operationsCenter, /<span>Utilização<\/span>/);
  assert.match(operationsCenter, /Cobertura documental/);
  assert.match(inventoryOperations, /create_inventory_campaign/);
  assert.match(lifecycleOperations, /create_asset_kit/);
  assert.match(lifecycleOperations, /create_reservation/);
  assert.match(lifecycleOperations, /create_offboarding_case/);
  assert.match(documentsOperations, /create_asset_contract/);
  assert.match(documentsOperations, /upsert_asset_accounting/);
  assert.match(documentsOperations, /create_custom_field/);
  assert.match(integrationOperations, /create_reconciliation_issue/);
});

test("leitor QR usa câmera, imagem de contingência e parser restrito", () => {
  assert.match(qrScanner, /BrowserMultiFormatReader/);
  assert.match(qrScanner, /facingMode: \{ ideal: "environment" \}/);
  assert.match(qrScanner, /decodeFromImageUrl/);
  assert.match(qrScanner, /accept="image\/\*"/);
  assert.match(qrScanner, /extractAssetIdentifier/);
  assert.match(inventoryOperations, /<QrCameraScanner/);
});

test("inventário offline usa IndexedDB com fila mínima e sincronização em lote", () => {
  assert.match(offlineInventory, /indexedDB\.open/);
  assert.match(offlineInventory, /departmentSlug/);
  assert.match(offlineInventory, /campaignId/);
  assert.match(offlineInventory, /assetId/);
  assert.match(offlineInventory, /MAX_OFFLINE_AGE_MS = 30/);
  assert.doesNotMatch(offlineInventory, /assignee|serial|model|localStorage|sessionStorage/);
  assert.match(inventoryOperations, /record_inventory_checks_batch/);
  assert.match(inventoryOperations, /navigator\.onLine/);
});

test("documentos privados exigem sessão e aplicam limites antes do gateway", () => {
  assert.match(documentsApi, /await getAuthenticatedUser\(\)/);
  assert.match(documentsApi, /status: 401/);
  assert.match(documentsApi, /MAX_FILE_BYTES = 2_500_000/);
  assert.match(documentsApi, /allowedMimeTypes/);
  assert.match(documentsApi, /uploadAssetDocument/);
  assert.match(documentsApi, /getAssetDocumentUrl/);
  assert.match(documentsApi, /status: 302/);
});

test("login traz avatar decorativo, campos com ícone e manter conectado", () => {
  // O avatar é decorativo: antes do login não há usuário conhecido, logo não
  // existe foto de perfil para exibir.
  assert.match(loginPage, /className="login-avatar" aria-hidden="true"/);
  assert.match(loginCss, /\.login-avatar-ring \{[\s\S]*?border-radius: 50%/);
  assert.match(loginPage, /className="login-field login-field-icon"/);
  assert.match(loginPage, /className="field-icon" aria-hidden="true"/);
  // Rótulo continua existindo para leitor de tela, mesmo com placeholder visível.
  assert.match(loginPage, /<span className="sr-only">Usuário ou e-mail<\/span>/);
  assert.match(loginPage, /<input type="checkbox" name="remember" \/>/);
  assert.match(loginPage, /Esqueci minha senha/);
});

test("manter conectado estende a sessão sem torná-la permanente", () => {
  assert.match(sharedAuth, /const REMEMBERED_SESSION_SECONDS = 30 \* 24 \* 60 \* 60;/);
  assert.match(sharedAuth, /const lifetime = remember \? REMEMBERED_SESSION_SECONDS : SESSION_SECONDS;/);
  assert.match(sharedAuth, /setExpirationTime\(`\$\{lifetime\}s`\)/);
  assert.match(credentialAuthSource, /form\.get\("remember"\) === "on"/);
  // A autorização continua sendo reconsultada a cada requisição.
  assert.match(sharedAuth, /isIdentityStillAuthorized/);
});
