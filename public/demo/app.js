const apiUrl = "/api/state";

const elements = {
  inventoryBody: document.querySelector("#inventory-body"),
  inventoryState: document.querySelector("#inventory-state"),
  inventoryContainer: document.querySelector("#inventory-table-container"),
  mobileInventoryList: document.querySelector("#mobile-inventory-list"),
  quickFilters: document.querySelector("#quick-filters"),
  pagination: document.querySelector("#inventory-pagination"),
  paginationSummary: document.querySelector("#pagination-summary"),
  currentPage: document.querySelector("#current-page"),
  totalPages: document.querySelector("#total-pages"),
  pageSize: document.querySelector("#page-size"),
  detail: document.querySelector("#asset-detail"),
  detailScrim: document.querySelector("#detail-scrim"),
  resultCount: document.querySelector("#result-count"),
  resultLabel: document.querySelector("#result-label"),
  revision: document.querySelector("#revision-badge"),
  session: document.querySelector("#session-control"),
  demoNotice: document.querySelector("#demo-notice"),
  signInLink: document.querySelector("#sign-in-link"),
  themeToggle: document.querySelector("#theme-toggle"),
  sidebarSource: document.querySelector("#sidebar-source"),
  nucleiGrid: document.querySelector("#nuclei-grid"),
  nucleiSearch: document.querySelector("#nuclei-search"),
  nucleiEmpty: document.querySelector("#nuclei-empty"),
  nucleiResultCount: document.querySelector("#nuclei-result-count"),
  nucleiTotal: document.querySelector("#nuclei-total"),
  nucleiAssets: document.querySelector("#nuclei-assets"),
  nucleiAllocated: document.querySelector("#nuclei-allocated"),
  nucleiAlerts: document.querySelector("#nuclei-alerts"),
  auditList: document.querySelector("#audit-list"),
  auditCount: document.querySelector("#audit-count"),
  toastRegion: document.querySelector("#toast-region"),
  search: document.querySelector("#search-input"),
  typeFilter: document.querySelector("#type-filter"),
  statusFilter: document.querySelector("#status-filter"),
  nucleusFilter: document.querySelector("#nucleus-filter"),
  sortFilter: document.querySelector("#sort-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  advancedFiltersToggle: document.querySelector("#advanced-filters-toggle"),
  advancedFilters: document.querySelector("#advanced-filters"),
  newAsset: document.querySelector("#new-asset-button"),
  newNucleus: document.querySelector("#new-nucleus-button"),
  importButton: document.querySelector("#import-button"),
  exportButton: document.querySelector("#export-button"),
  importHistory: document.querySelector("#import-history"),
  importCount: document.querySelector("#import-count"),
  peopleBody: document.querySelector("#people-body"),
  peopleEmpty: document.querySelector("#people-empty"),
  peopleSearch: document.querySelector("#people-search"),
  peopleStatusFilter: document.querySelector("#people-status-filter"),
  peopleNucleusFilter: document.querySelector("#people-nucleus-filter"),
  assetDialog: document.querySelector("#asset-dialog"),
  identifierDialog: document.querySelector("#identifier-dialog"),
  transferDialog: document.querySelector("#transfer-dialog"),
  nucleusDialog: document.querySelector("#nucleus-dialog"),
  editNucleusDialog: document.querySelector("#edit-nucleus-dialog"),
  nucleusInventoryDialog: document.querySelector("#nucleus-inventory-dialog"),
  collaboratorDialog: document.querySelector("#collaborator-dialog"),
  importDialog: document.querySelector("#import-dialog"),
  assetForm: document.querySelector("#asset-form"),
  identifierForm: document.querySelector("#identifier-form"),
  transferForm: document.querySelector("#transfer-form"),
  nucleusForm: document.querySelector("#nucleus-form"),
  editNucleusForm: document.querySelector("#edit-nucleus-form"),
  nucleusAssetForm: document.querySelector("#nucleus-asset-form"),
  collaboratorForm: document.querySelector("#collaborator-form"),
  importForm: document.querySelector("#import-form"),
  importFile: document.querySelector("#import-file"),
  importPreview: document.querySelector("#import-preview"),
  importIssues: document.querySelector("#preview-issues"),
  importCommit: document.querySelector("#commit-import-button"),
  assetFormError: document.querySelector("#asset-form-error"),
  identifierFormError: document.querySelector("#identifier-form-error"),
  transferFormError: document.querySelector("#transfer-form-error"),
  nucleusFormError: document.querySelector("#nucleus-form-error"),
  editNucleusFormError: document.querySelector("#edit-nucleus-form-error"),
  nucleusAssetFormError: document.querySelector("#nucleus-asset-form-error"),
  collaboratorFormError: document.querySelector("#collaborator-form-error"),
  importFormError: document.querySelector("#import-form-error"),
  assetTypeInput: document.querySelector("#asset-type-input"),
  assetStatusInput: document.querySelector("#asset-status-input"),
  assetNucleusInput: document.querySelector("#asset-nucleus-input"),
  transferNucleusInput: document.querySelector("#transfer-nucleus-input"),
  collaboratorNucleusInput: document.querySelector("#collaborator-nucleus-input"),
  collaboratorAssetsList: document.querySelector("#collaborator-assets-list"),
  nucleusInventoryListView: document.querySelector("#nucleus-inventory-list-view"),
  nucleusInventorySearch: document.querySelector("#nucleus-inventory-search"),
  nucleusInventoryBody: document.querySelector("#nucleus-inventory-body"),
  nucleusInventoryMobile: document.querySelector("#nucleus-inventory-mobile"),
  nucleusInventoryEmpty: document.querySelector("#nucleus-inventory-empty"),
  nucleusAssetTypeInput: document.querySelector("#nucleus-asset-type"),
  viewEyebrow: document.querySelector("#view-eyebrow"),
  viewTitle: document.querySelector("#view-title"),
  viewDescription: document.querySelector("#view-description"),
};

const viewCopy = {
  inventory: {
    eyebrow: "Operações / Inventário",
    title: "Controle de patrimônios",
    description: "Localize ativos, acompanhe responsáveis e trate divergências por núcleo.",
  },
  nuclei: {
    eyebrow: "Estrutura / Núcleos",
    title: "Responsabilidade por núcleo",
    description: "Acompanhe concentração, alocação e alertas em cada área da empresa.",
  },
  audit: {
    eyebrow: "Governança / Auditoria",
    title: "Histórico de movimentações",
    description: "Rastreie quem alterou cada patrimônio, quando e por qual motivo.",
  },
  imports: {
    eyebrow: "Dados / Importações",
    title: "Carga e qualidade da base",
    description: "Acompanhe arquivos processados, ajustes automáticos e linhas excluídas.",
  },
  collaborators: {
    eyebrow: "Pessoas / Colaboradores",
    title: "Lotação e responsabilidade",
    description: "Identifique colaboradores com ou sem patrimônios associados em cada núcleo.",
  },
};

let dashboard = null;
let selectedAssetId = null;
let filterTimer = null;
let importPreview = null;
let hasStoredTheme = Boolean(readThemeCookie());
let activeQuickFilter = "all";
let currentPage = 1;
let pageSize = 25;
let detailTab = "summary";
let mobileDetailOpen = false;
let selectedNucleusId = null;

bindEvents();
setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
handleAuthResult();
void loadDashboard();

function bindEvents() {
  elements.themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme, { persist: true });
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
    if (!hasStoredTheme) setTheme(event.matches ? "dark" : "light");
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  elements.search.addEventListener("input", () => {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => {
      currentPage = 1;
      void loadDashboard({ quiet: true });
    }, 240);
  });

  [elements.typeFilter, elements.nucleusFilter, elements.sortFilter].forEach((control) => {
    control.addEventListener("change", () => {
      currentPage = 1;
      void loadDashboard({ quiet: true });
    });
  });
  elements.statusFilter.addEventListener("change", () => {
    activeQuickFilter = "all";
    currentPage = 1;
    void loadDashboard({ quiet: true });
  });
  elements.nucleiSearch.addEventListener("input", renderNuclei);
  elements.nucleusInventorySearch.addEventListener("input", renderNucleusInventory);

  elements.quickFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-filter]");
    if (!button || !dashboard?.session.authenticated) return;
    activeQuickFilter = button.dataset.quickFilter;
    currentPage = 1;
    renderInventory();
    renderDetail();
  });
  elements.advancedFiltersToggle.addEventListener("click", () => {
    const open = elements.advancedFilters.classList.toggle("is-open");
    elements.advancedFiltersToggle.setAttribute("aria-expanded", String(open));
    elements.advancedFiltersToggle.textContent = open ? "Ocultar filtros" : "Filtros";
  });

  elements.pagination.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page-action]");
    if (!button || button.disabled) return;
    changePage(button.dataset.pageAction);
  });
  elements.pageSize.addEventListener("change", () => {
    pageSize = Number(elements.pageSize.value);
    currentPage = 1;
    renderInventory();
    renderDetail();
  });
  elements.detailScrim.addEventListener("click", closeMobileDetail);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileDetailOpen) closeMobileDetail();
  });

  elements.clearFilters.addEventListener("click", () => {
    elements.search.value = "";
    elements.typeFilter.value = "all";
    elements.statusFilter.value = "all";
    elements.nucleusFilter.value = "all";
    elements.sortFilter.value = "recent";
    activeQuickFilter = "all";
    currentPage = 1;
    void loadDashboard({ quiet: true });
  });

  elements.newAsset.addEventListener("click", openAssetDialog);
  elements.importButton.addEventListener("click", openImportDialog);
  elements.exportButton.addEventListener("click", handleExport);
  elements.newNucleus.addEventListener("click", () => {
    elements.nucleusForm.reset();
    clearFormError(elements.nucleusFormError);
    elements.nucleusDialog.showModal();
  });

  elements.peopleSearch.addEventListener("input", renderCollaborators);
  elements.peopleStatusFilter.addEventListener("change", renderCollaborators);
  elements.peopleNucleusFilter.addEventListener("change", renderCollaborators);

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
  });

  [elements.assetDialog, elements.identifierDialog, elements.transferDialog, elements.nucleusDialog, elements.editNucleusDialog, elements.nucleusInventoryDialog, elements.collaboratorDialog, elements.importDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  elements.assetForm.addEventListener("submit", handleAssetSubmit);
  elements.identifierForm.addEventListener("submit", handleIdentifierSubmit);
  elements.transferForm.addEventListener("submit", handleTransferSubmit);
  elements.nucleusForm.addEventListener("submit", handleNucleusSubmit);
  elements.editNucleusForm.addEventListener("submit", handleNucleusUpdate);
  elements.nucleusAssetForm.addEventListener("submit", handleNucleusAssetUpdate);
  document.querySelector("#back-to-nucleus-inventory").addEventListener("click", showNucleusInventoryList);
  document.querySelector("#cancel-nucleus-asset-edit").addEventListener("click", showNucleusInventoryList);
  elements.collaboratorForm.addEventListener("submit", handleCollaboratorUpdate);
  elements.importForm.addEventListener("submit", handleImportPreview);
  elements.importCommit.addEventListener("click", handleImportCommit);
  elements.importFile.addEventListener("change", resetImportPreview);
}

async function loadDashboard({ quiet = false } = {}) {
  if (!quiet) setInventoryLoading();

  const params = new URLSearchParams({
    search: elements.search.value.trim(),
    type: elements.typeFilter.value,
    status: elements.statusFilter.value,
    nucleus: elements.nucleusFilter.value,
    sort: elements.sortFilter.value,
  });

  try {
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: { accept: "application/json" },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha ao carregar dados.");
    dashboard = data;

    if (!dashboard.inventory.some((asset) => asset.id === selectedAssetId)) {
      selectedAssetId = dashboard.inventory[0]?.id ?? null;
    }

    populateOptions();
    renderDashboard();
  } catch (error) {
    setInventoryError(error.message);
    showToast(error.message, true);
  }
}

function renderDashboard() {
  renderSummary();
  renderSession();
  renderInventory();
  renderDetail();
  renderNuclei();
  renderCollaborators();
  renderAudit();
  renderImports();
}

function renderSummary() {
  if (!dashboard.session.authenticated) {
    for (const selector of ["#kpi-total", "#kpi-allocated", "#kpi-maintenance", "#kpi-discrepancies"]) {
      document.querySelector(selector).textContent = "--";
    }
    document.querySelector("#kpi-total-context").textContent = "dados protegidos";
    elements.resultCount.textContent = "--";
    elements.resultLabel.textContent = "aguardando autenticação";
    elements.revision.textContent = "Base protegida";
    return;
  }

  document.querySelector("#kpi-total").textContent = dashboard.summary.total;
  document.querySelector("#kpi-allocated").textContent = dashboard.summary.allocated;
  document.querySelector("#kpi-maintenance").textContent = dashboard.summary.maintenance;
  document.querySelector("#kpi-discrepancies").textContent = dashboard.summary.discrepancies;
  const retiredLabel = dashboard.summary.retired === 1 ? "baixado" : "baixados";
  document.querySelector("#kpi-total-context").textContent =
    `${dashboard.summary.available} disponíveis • ${dashboard.summary.retired} ${retiredLabel}`;
  elements.resultCount.textContent = dashboard.resultCount;
  elements.resultLabel.textContent =
    dashboard.resultCount === 1 ? "patrimônio encontrado" : "patrimônios encontrados";
  elements.revision.textContent = `Revisão ${dashboard.revision}`;
}

function renderSession() {
  const session = dashboard.session;
  const initial = (session.displayName || "V").trim().charAt(0).toUpperCase();
  elements.session.innerHTML = `
    <span class="session-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
    <span class="session-text">
      <small>${session.authenticated ? providerLabel(session.provider) : "Acesso restrito"}</small>
      <strong title="${escapeAttribute(session.displayName)}">${escapeHtml(session.displayName)}</strong>
    </span>
    ${session.authenticated ? `<a class="session-sign-out" href="${escapeAttribute(session.signOutUrl)}">Sair</a>` : ""}
  `;
  elements.demoNotice.hidden = session.authenticated;
  elements.signInLink.href = session.signInUrl;
  elements.sidebarSource.textContent = session.authenticated ? "Base empresarial Supabase" : "Dados protegidos";
  for (const button of [elements.importButton, elements.exportButton, elements.newAsset, elements.newNucleus]) {
    button.disabled = !session.authenticated;
  }
  const writeTitle = session.authenticated ? "" : "Entre com uma conta autorizada para acessar a planilha";
  elements.importButton.title = session.authenticated ? "Importar planilha XLSX" : writeTitle;
  elements.exportButton.title = session.authenticated ? "Exportar planilha XLSX" : writeTitle;
  elements.newAsset.title = writeTitle;
  elements.newNucleus.title = writeTitle;
}

function renderInventory() {
  elements.inventoryContainer.setAttribute("aria-busy", "false");
  const filteredInventory = getQuickFilteredInventory();
  renderQuickFilters();
  updateInventoryResult(filteredInventory.length);

  if (!filteredInventory.some((asset) => asset.id === selectedAssetId)) {
    selectedAssetId = filteredInventory[0]?.id ?? null;
    mobileDetailOpen = false;
  }

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / pageSize));
  currentPage = Math.min(currentPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filteredInventory.slice(pageStart, pageStart + pageSize);
  if (pageItems.length && !pageItems.some((asset) => asset.id === selectedAssetId)) {
    selectedAssetId = pageItems[0].id;
    mobileDetailOpen = false;
  }

  if (!filteredInventory.length) {
    elements.inventoryBody.innerHTML = "";
    elements.mobileInventoryList.innerHTML = "";
    elements.inventoryState.hidden = false;
    elements.inventoryState.innerHTML = `
      <strong>${dashboard.session.authenticated ? "Nenhum patrimônio encontrado" : "Dados protegidos"}</strong>
      <span>${dashboard.session.authenticated ? "Revise os filtros rápidos ou limpe a busca para ampliar os resultados." : "Entre com uma conta autorizada para carregar exclusivamente os dados importados da planilha."}</span>
    `;
    renderPagination(0, 0, 1);
    return;
  }

  elements.inventoryState.hidden = true;
  elements.inventoryBody.innerHTML = pageItems
    .map(
      (asset) => `
        <tr class="${asset.id === selectedAssetId ? "is-selected" : ""}" data-asset-row="${escapeAttribute(asset.id)}">
          <td>
            <button class="asset-id-button" type="button" data-asset-id="${escapeAttribute(asset.id)}">
              ${escapeHtml(assetIdentifierLabel(asset))}
            </button>
            <span class="cell-secondary">${escapeHtml(asset.hasPatrimony ? asset.serial || "Sem número de série" : `Referência interna ${asset.id}`)}</span>
          </td>
          <td>
            <span class="cell-primary">${escapeHtml(dashboard.options.assetTypes[asset.type])}</span>
            <span class="cell-secondary">${escapeHtml(asset.brandModel)}</span>
          </td>
          <td>
            <span class="cell-primary">${escapeHtml(asset.nucleus.code)}</span>
            <span class="cell-secondary">${escapeHtml(asset.nucleus.name)}</span>
          </td>
          <td>
            <span class="cell-primary">${escapeHtml(asset.assignee || "Não alocado")}</span>
            <span class="cell-secondary">${escapeHtml(asset.location)}</span>
          </td>
          <td>${statusBadge(asset.status)}</td>
          <td>
            <span class="cell-primary">${escapeHtml(asset.lastMovement ? movementLabel(asset.lastMovement.type) : "Sem movimentação")}</span>
            <span class="cell-secondary">${asset.lastMovement ? formatDateTime(asset.lastMovement.at) : formatDateTime(asset.createdAt)}</span>
          </td>
        </tr>
      `,
    )
    .join("");

  elements.mobileInventoryList.innerHTML = pageItems
    .map(
      (asset) => `
        <button class="mobile-asset-card ${asset.id === selectedAssetId ? "is-selected" : ""}" type="button" data-asset-id="${escapeAttribute(asset.id)}">
          <span class="mobile-asset-heading">
            <span>
              <strong>${escapeHtml(assetIdentifierLabel(asset))} · ${escapeHtml(dashboard.options.assetTypes[asset.type])}</strong>
              <small>${escapeHtml(asset.hasPatrimony ? asset.brandModel : `Referência interna ${asset.id}`)}</small>
            </span>
            ${statusBadge(asset.status)}
          </span>
          <span class="mobile-asset-metadata">
            <span><small>Núcleo</small><strong>${escapeHtml(asset.nucleus.code)} · ${escapeHtml(asset.nucleus.name)}</strong></span>
            <span><small>Responsável</small><strong>${escapeHtml(asset.assignee || "Não alocado")}</strong></span>
            <span><small>Última movimentação</small><strong>${asset.lastMovement ? formatDateTime(asset.lastMovement.at) : formatDateTime(asset.createdAt)}</strong></span>
          </span>
        </button>
      `,
    )
    .join("");

  for (const container of [elements.inventoryBody, elements.mobileInventoryList]) {
    container.querySelectorAll("[data-asset-id]").forEach((button) => {
      button.addEventListener("click", () => selectAsset(button.dataset.assetId));
    });
  }
  renderPagination(filteredInventory.length, pageStart, totalPages);
}

function getQuickFilteredInventory() {
  const inventory = dashboard?.inventory || [];
  return inventory.filter((asset) => {
    if (activeQuickFilter === "unassigned") return isUnassigned(asset.assignee);
    if (activeQuickFilter === "untagged") return !asset.hasPatrimony;
    if (activeQuickFilter === "maintenance") return asset.status === "maintenance";
    if (activeQuickFilter === "discrepancy") return asset.status === "discrepancy";
    return true;
  });
}

function renderQuickFilters() {
  const inventory = dashboard?.inventory || [];
  const counts = {
    all: inventory.length,
    unassigned: inventory.filter((asset) => isUnassigned(asset.assignee)).length,
    untagged: inventory.filter((asset) => !asset.hasPatrimony).length,
    maintenance: inventory.filter((asset) => asset.status === "maintenance").length,
    discrepancy: inventory.filter((asset) => asset.status === "discrepancy").length,
  };

  elements.quickFilters.querySelectorAll("[data-quick-filter]").forEach((button) => {
    const active = button.dataset.quickFilter === activeQuickFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !dashboard.session.authenticated;
    button.querySelector("[data-quick-count]").textContent = counts[button.dataset.quickFilter];
  });
}

function renderPagination(total, pageStart, totalPages) {
  const shownStart = total ? pageStart + 1 : 0;
  const shownEnd = Math.min(pageStart + pageSize, total);
  elements.paginationSummary.textContent = total
    ? `Mostrando ${shownStart}–${shownEnd} de ${total} registros`
    : "Nenhum registro para mostrar";
  elements.currentPage.textContent = currentPage;
  elements.totalPages.textContent = totalPages;
  elements.pagination.querySelectorAll("[data-page-action]").forEach((button) => {
    const backwards = ["first", "previous"].includes(button.dataset.pageAction);
    button.disabled = total === 0 || (backwards ? currentPage === 1 : currentPage === totalPages);
  });
}

function changePage(action) {
  const totalPages = Math.max(1, Math.ceil(getQuickFilteredInventory().length / pageSize));
  if (action === "first") currentPage = 1;
  if (action === "previous") currentPage = Math.max(1, currentPage - 1);
  if (action === "next") currentPage = Math.min(totalPages, currentPage + 1);
  if (action === "last") currentPage = totalPages;
  renderInventory();
  renderDetail();
  document.querySelector("#inventory-table-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateInventoryResult(count) {
  if (!dashboard.session.authenticated) return;
  elements.resultCount.textContent = count;
  elements.resultLabel.textContent = count === 1 ? "patrimônio encontrado" : "patrimônios encontrados";
}

function isUnassigned(assignee) {
  const value = normalizedText(assignee);
  return !value || value === "nao alocado" || value === "sem responsavel";
}

function renderDetail() {
  const asset = dashboard?.inventory.find((item) => item.id === selectedAssetId);
  if (!asset) {
    mobileDetailOpen = false;
    updateMobileDetailState();
    elements.detail.innerHTML = `
      <div class="empty-detail">
        <span class="empty-symbol" aria-hidden="true">#</span>
        <h2 id="detail-title">Selecione um patrimônio</h2>
        <p>Os dados de aquisição, alocação e movimentações aparecerão aqui.</p>
      </div>
    `;
    return;
  }

  const statusOptions = Object.entries(dashboard.options.statuses)
    .map(([value, label]) => `<option value="${value}" ${value === asset.status ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");

  elements.detail.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-row">
        <div>
          <p class="eyebrow">${asset.hasPatrimony ? "Patrimônio selecionado" : "Item sem identificação patrimonial"}</p>
          <h2 id="detail-title">${escapeHtml(assetIdentifierLabel(asset))}</h2>
          <p class="detail-type">${escapeHtml(dashboard.options.assetTypes[asset.type])}${asset.hasPatrimony ? "" : ` · Referência interna ${escapeHtml(asset.id)}`}</p>
        </div>
        <div class="detail-header-controls">
          ${statusBadge(asset.status)}
          <button class="icon-button detail-close" id="close-detail-panel" type="button" aria-label="Fechar detalhes" title="Fechar detalhes">X</button>
        </div>
      </div>
      <div class="detail-actions">
        <button class="button button-secondary button-small" id="transfer-asset-button" type="button" ${asset.status === "retired" || !dashboard.session.authenticated ? "disabled" : ""}>
          Transferir
        </button>
        <button class="button button-secondary button-small" id="change-asset-id" type="button" ${dashboard.session.authenticated ? "" : "disabled"}>
          Alterar patrimônio
        </button>
        <button class="button button-secondary button-small" id="copy-asset-id" type="button">Copiar referência</button>
      </div>
    </div>
    <div class="detail-tabs" role="tablist" aria-label="Detalhes do patrimônio">
      <button class="detail-tab ${detailTab === "summary" ? "is-active" : ""}" type="button" role="tab" data-detail-tab="summary" aria-selected="${detailTab === "summary"}">Resumo</button>
      <button class="detail-tab ${detailTab === "history" ? "is-active" : ""}" type="button" role="tab" data-detail-tab="history" aria-selected="${detailTab === "history"}">Histórico <span>${asset.movements.length}</span></button>
    </div>
    <div class="detail-body detail-tab-panel" data-detail-panel="summary" ${detailTab === "summary" ? "" : "hidden"}>
      <dl class="detail-grid">
        <div>
          <dt>Núcleo</dt>
          <dd>${escapeHtml(asset.nucleus.name)}</dd>
        </div>
        <div>
          <dt>Responsável</dt>
          <dd>${escapeHtml(asset.assignee || "Não alocado")}</dd>
        </div>
        <div>
          <dt>Localização</dt>
          <dd>${escapeHtml(asset.location)}</dd>
        </div>
        <div>
          <dt>Número de série</dt>
          <dd>${escapeHtml(asset.serial || "Não informado")}</dd>
        </div>
        <div>
          <dt>Aquisição</dt>
          <dd>${formatDate(asset.acquiredAt)}</dd>
        </div>
        <div class="detail-wide">
          <dt>Marca e modelo</dt>
          <dd>${escapeHtml(asset.brandModel)}</dd>
        </div>
        <div class="detail-wide">
          <dt>Observações</dt>
          <dd>${escapeHtml(asset.notes || "Sem observações")}</dd>
        </div>
      </dl>

      <form class="status-form" id="status-form">
        <label class="field">
          <span>Atualizar status</span>
          <select name="status" required ${dashboard.session.authenticated ? "" : "disabled"}>${statusOptions}</select>
        </label>
        <button class="button button-primary button-small" type="submit" ${dashboard.session.authenticated ? "" : "disabled"}>Registrar</button>
        <label class="field field-wide">
          <span>Motivo da alteração</span>
          <input name="note" maxlength="500" required placeholder="Informe o motivo para auditoria" ${dashboard.session.authenticated ? "" : "disabled"} />
        </label>
      </form>
    </div>
    <div class="detail-body detail-tab-panel" data-detail-panel="history" ${detailTab === "history" ? "" : "hidden"}>
      <section class="movement-section" aria-labelledby="movement-title">
        <h3 id="movement-title">Movimentações recentes</h3>
        <ol class="movement-list">
          ${asset.movements.slice(0, 5).map(renderMovement).join("")}
        </ol>
      </section>
    </div>
  `;

  updateMobileDetailState();
  elements.detail.querySelector("#transfer-asset-button").addEventListener("click", () => openTransferDialog(asset));
  elements.detail.querySelector("#change-asset-id").addEventListener("click", () => openIdentifierDialog(asset));
  elements.detail.querySelector("#close-detail-panel").addEventListener("click", closeMobileDetail);
  elements.detail.querySelectorAll("[data-detail-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      detailTab = button.dataset.detailTab;
      renderDetail();
    });
  });
  elements.detail.querySelector("#copy-asset-id").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(asset.id);
      showToast(`${asset.hasPatrimony ? "Patrimônio" : "Referência interna"} ${asset.id} copiado.`);
    } catch {
      showToast("Não foi possível copiar o identificador.", true);
    }
  });
  elements.detail.querySelector("#status-form").addEventListener("submit", (event) => handleStatusSubmit(event, asset));
}

function renderNuclei() {
  const nuclei = dashboard?.nuclei || [];
  const query = normalizedText(elements.nucleiSearch.value);
  const filteredNuclei = nuclei.filter((nucleus) =>
    normalizedText(`${nucleus.code} ${nucleus.name} ${nucleus.location} ${nucleus.manager}`).includes(query),
  );
  const totalAssets = nuclei.reduce((total, nucleus) => total + nucleus.total, 0);
  const allocatedAssets = nuclei.reduce((total, nucleus) => total + nucleus.allocated, 0);
  const nucleiWithAlerts = nuclei.filter((nucleus) => nucleus.alerts > 0).length;

  elements.nucleiTotal.textContent = nuclei.length;
  elements.nucleiAssets.textContent = totalAssets;
  elements.nucleiAllocated.textContent = allocatedAssets;
  elements.nucleiAlerts.textContent = nucleiWithAlerts;
  elements.nucleiResultCount.textContent = `${filteredNuclei.length} ${filteredNuclei.length === 1 ? "núcleo encontrado" : "núcleos encontrados"}`;
  elements.nucleiEmpty.hidden = filteredNuclei.length > 0;

  elements.nucleiGrid.innerHTML = filteredNuclei
    .map(
      (nucleus) => `
        <article class="nucleus-card ${nucleus.alerts ? "has-alerts" : ""}">
          <div class="nucleus-card-header">
            <div class="nucleus-identity">
              <span class="nucleus-code">${escapeHtml(nucleus.code)}</span>
              <span class="nucleus-health ${nucleus.alerts ? "has-alerts" : ""}">${nucleus.alerts ? `${nucleus.alerts} ${nucleus.alerts === 1 ? "alerta" : "alertas"}` : "Sem alertas"}</span>
            </div>
            <button class="icon-button nucleus-edit" type="button" data-edit-nucleus="${escapeAttribute(nucleus.id)}" aria-label="Editar núcleo ${escapeAttribute(nucleus.name)}" title="Editar núcleo" ${dashboard.session.authenticated ? "" : "disabled"}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path d="M12 20h9" stroke-width="2" stroke-linecap="round" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
          <h3>${escapeHtml(nucleus.name)}</h3>
          <div class="nucleus-meta">
            <div><span>Localização</span><strong>${escapeHtml(nucleus.location)}</strong></div>
            <div><span>Gestor responsável</span><strong>${escapeHtml(nucleus.manager)}</strong></div>
          </div>
          <div class="nucleus-allocation">
            <div><span>Taxa de alocação</span><strong>${nucleus.total ? Math.min(100, Math.round((nucleus.allocated / nucleus.total) * 100)) : 0}%</strong></div>
            <div class="nucleus-progress" role="progressbar" aria-label="Taxa de alocação de ${escapeAttribute(nucleus.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${nucleus.total ? Math.min(100, Math.round((nucleus.allocated / nucleus.total) * 100)) : 0}">
              <span style="--allocation: ${nucleus.total ? Math.min(100, Math.round((nucleus.allocated / nucleus.total) * 100)) : 0}%"></span>
            </div>
          </div>
          <div class="nucleus-metrics">
            <div><span>Ativos</span><strong>${nucleus.total}</strong></div>
            <div><span>Em uso</span><strong>${nucleus.allocated}</strong></div>
            <div><span>Alertas</span><strong>${nucleus.alerts}</strong></div>
          </div>
          <button class="button button-secondary nucleus-inventory-button" type="button" data-view-nucleus-inventory="${escapeAttribute(nucleus.id)}">
            <span class="nucleus-inventory-button-icon" aria-hidden="true">${assetTypeIcon("cpu")}</span>
            Ver inventário
            <span aria-hidden="true">→</span>
          </button>
        </article>
      `,
    )
    .join("");

  elements.nucleiGrid.querySelectorAll("[data-edit-nucleus]").forEach((button) => {
    button.addEventListener("click", () => openNucleusEditDialog(button.dataset.editNucleus));
  });
  elements.nucleiGrid.querySelectorAll("[data-view-nucleus-inventory]").forEach((button) => {
    button.addEventListener("click", () => openNucleusInventoryDialog(button.dataset.viewNucleusInventory));
  });
}

function renderNucleusInventory() {
  const nucleus = dashboard?.nuclei.find((item) => item.id === selectedNucleusId);
  if (!nucleus) return;
  const query = normalizedText(elements.nucleusInventorySearch.value);
  const assets = (dashboard.nucleusInventory || [])
    .filter((asset) => asset.nucleusId === nucleus.id)
    .filter((asset) => !query || normalizedText([
      asset.id,
      dashboard.options.assetTypes[asset.type],
      asset.brandModel,
      asset.serial,
      asset.assignee,
      asset.location,
      dashboard.options.statuses[asset.status],
    ].join(" ")).includes(query))
    .sort((left, right) => left.id.localeCompare(right.id));

  document.querySelector("#nucleus-inventory-total").textContent = nucleus.total;
  document.querySelector("#nucleus-inventory-allocated").textContent = nucleus.allocated;
  document.querySelector("#nucleus-inventory-alerts").textContent = nucleus.alerts;
  document.querySelector("#nucleus-inventory-untagged").textContent = nucleus.untagged;
  document.querySelector("#nucleus-inventory-result-count").textContent =
    `${assets.length} ${assets.length === 1 ? "item encontrado" : "itens encontrados"}`;
  elements.nucleusInventoryEmpty.hidden = assets.length > 0;

  elements.nucleusInventoryBody.innerHTML = assets.map((asset) => `
    <tr>
      <td><strong>${escapeHtml(assetIdentifierLabel(asset))}</strong><span class="cell-secondary">${escapeHtml(asset.serial || "Série não informada")}</span></td>
      <td><span class="nucleus-inventory-item nucleus-inventory-item-${escapeAttribute(asset.type)}"><span aria-hidden="true">${assetTypeIcon(asset.type)}</span><span><strong>${escapeHtml(dashboard.options.assetTypes[asset.type])}</strong><small>${escapeHtml(asset.brandModel)}</small></span></span></td>
      <td title="${escapeAttribute(asset.assignee || "Disponível")}">${escapeHtml(asset.assignee || "Disponível")}</td>
      <td title="${escapeAttribute(asset.location)}">${escapeHtml(asset.location)}</td>
      <td>${statusBadge(asset.status)}</td>
      <td><button class="icon-button nucleus-asset-edit-button" type="button" data-edit-nucleus-asset="${escapeAttribute(asset.id)}" aria-label="Editar ${escapeAttribute(assetIdentifierLabel(asset))}" title="Editar informações" ${dashboard.session.authenticated ? "" : "disabled"}>${editIcon()}</button></td>
    </tr>
  `).join("");

  elements.nucleusInventoryMobile.innerHTML = assets.map((asset) => `
    <article class="nucleus-inventory-mobile-card nucleus-inventory-mobile-card-${escapeAttribute(asset.type)}">
      <div class="nucleus-inventory-mobile-heading">
        <span class="profile-asset-icon profile-asset-icon-${escapeAttribute(asset.type)}" aria-hidden="true">${assetTypeIcon(asset.type)}</span>
        <div><strong>${escapeHtml(assetIdentifierLabel(asset))}</strong><span>${escapeHtml(dashboard.options.assetTypes[asset.type])}</span></div>
        ${statusBadge(asset.status)}
      </div>
      <dl>
        <div><dt>Responsável</dt><dd>${escapeHtml(asset.assignee || "Disponível")}</dd></div>
        <div><dt>Localização</dt><dd>${escapeHtml(asset.location)}</dd></div>
        <div><dt>Modelo</dt><dd>${escapeHtml(asset.brandModel)}</dd></div>
      </dl>
      <button class="button button-secondary button-small" type="button" data-edit-nucleus-asset="${escapeAttribute(asset.id)}" ${dashboard.session.authenticated ? "" : "disabled"}>Editar informações</button>
    </article>
  `).join("");

  elements.nucleusInventoryDialog.querySelectorAll("[data-edit-nucleus-asset]").forEach((button) => {
    button.addEventListener("click", () => openNucleusAssetEditor(button.dataset.editNucleusAsset));
  });
}

function renderCollaborators() {
  const collaborators = dashboard?.collaborators || [];
  document.querySelector("#people-total").textContent = dashboard?.summary.collaborators || 0;
  document.querySelector("#people-without-assets").textContent = dashboard?.summary.collaboratorsWithoutAssets || 0;

  const query = normalizedText(elements.peopleSearch.value);
  const status = elements.peopleStatusFilter.value;
  const nucleusId = elements.peopleNucleusFilter.value;
  const filtered = collaborators.filter((person) => {
    if (query && !normalizedText(`${person.name} ${person.nucleus.name} ${person.nucleus.code}`).includes(query)) return false;
    if (status === "with-assets" && !person.hasAssets) return false;
    if (status === "without-assets" && person.hasAssets) return false;
    return nucleusId === "all" || person.nucleusId === nucleusId;
  });

  elements.peopleBody.innerHTML = filtered
    .map(
      (person) => `
        <tr>
          <td>
            <button class="collaborator-name-button" type="button" data-open-collaborator="${escapeAttribute(person.id)}">
              ${escapeHtml(person.name)}
            </button>
          </td>
          <td>
            <span class="cell-primary">${escapeHtml(person.nucleus.code)}</span>
            <span class="cell-secondary">${escapeHtml(person.nucleus.name)}</span>
          </td>
          <td>
            <span class="asset-count">${person.assetCount}</span>
            <span class="cell-secondary">${person.assets.length ? person.assets.map((asset) => escapeHtml(assetIdentifierLabel(asset))).join(" · ") : "Nenhum item vinculado"}</span>
          </td>
          <td><span class="people-status ${person.hasAssets ? "has-assets" : "without-assets"}">${person.hasAssets ? "Com patrimônio" : "Sem patrimônio"}</span></td>
          <td class="people-action-cell">
            <button class="button button-secondary button-small" type="button" data-open-collaborator="${escapeAttribute(person.id)}">Ver perfil</button>
          </td>
        </tr>
      `,
    )
    .join("");
  elements.peopleEmpty.hidden = filtered.length > 0;
  elements.peopleBody.querySelectorAll("[data-open-collaborator]").forEach((button) => {
    button.addEventListener("click", () => openCollaboratorDialog(button.dataset.openCollaborator));
  });
}

function renderAudit() {
  const records = dashboard.audit.slice(0, 40);
  elements.auditCount.textContent = `${records.length} ${records.length === 1 ? "registro" : "registros"}`;
  elements.auditList.innerHTML = records
    .map(
      (record) => `
        <article class="audit-item">
          <div>
            <span class="audit-asset">${escapeHtml(assetIdentifierLabel(record))}</span>
            <small>${escapeHtml(record.assetType)}</small>
          </div>
          <div>
            <strong>${escapeHtml(record.typeLabel)}</strong>
            <span>${formatDateTime(record.at)}</span>
          </div>
          <div class="audit-flow">
            <span class="audit-flow-label">De</span>
            <strong>${escapeHtml(record.from)}</strong>
            <span class="audit-flow-label">para</span>
            <strong>${escapeHtml(record.to)}</strong>
          </div>
          <div class="audit-actor">
            <strong>${escapeHtml(record.actor)}</strong>
            <span>${escapeHtml(record.note || "Sem observação")}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderImports() {
  const imports = dashboard.imports || [];
  elements.importCount.textContent = `${imports.length} ${imports.length === 1 ? "importação" : "importações"}`;
  if (!imports.length) {
    elements.importHistory.innerHTML = `
      <div class="empty-imports">
        <strong>Nenhuma importação registrada</strong>
        <span>${dashboard.session.authenticated ? "Nenhuma carga adicional foi registrada nesta base empresarial." : "Entre com uma conta autorizada para consultar o histórico empresarial."}</span>
      </div>
    `;
    return;
  }

  elements.importHistory.innerHTML = imports
    .map(
      (run) => `
        <article class="import-run">
          <div>
            <strong>${escapeHtml(run.fileName)}</strong>
            <span>${formatDateTime(run.createdAt)} • ${escapeHtml(run.importedBy)}</span>
          </div>
          <dl>
            <div><dt>Inseridos</dt><dd>${run.inserted}</dd></div>
            <div><dt>Atualizados</dt><dd>${run.updated}</dd></div>
            <div><dt>Excluídos</dt><dd>${run.rejected}</dd></div>
          </dl>
        </article>
      `,
    )
    .join("");
}

function populateOptions() {
  const current = {
    type: elements.typeFilter.value,
    status: elements.statusFilter.value,
    nucleus: elements.nucleusFilter.value,
    peopleNucleus: elements.peopleNucleusFilter.value,
  };
  const assetTypeOptions = Object.entries(dashboard.options.assetTypes)
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join("");
  const statusOptions = Object.entries(dashboard.options.statuses)
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join("");
  const nucleusOptions = dashboard.nuclei
    .map((nucleus) => `<option value="${escapeAttribute(nucleus.id)}">${escapeHtml(nucleus.code)} — ${escapeHtml(nucleus.name)}</option>`)
    .join("");

  elements.typeFilter.innerHTML = `<option value="all">Todos os itens</option>${assetTypeOptions}`;
  elements.statusFilter.innerHTML = `<option value="all">Todos os status</option>${statusOptions}`;
  elements.nucleusFilter.innerHTML = `<option value="all">Todos os núcleos</option>${nucleusOptions}`;
  elements.assetTypeInput.innerHTML = `<option value="">Selecione</option>${assetTypeOptions}`;
  elements.nucleusAssetTypeInput.innerHTML = assetTypeOptions;
  elements.assetStatusInput.innerHTML = statusOptions;
  elements.assetNucleusInput.innerHTML = `<option value="">Selecione</option>${nucleusOptions}`;
  elements.transferNucleusInput.innerHTML = nucleusOptions;
  elements.peopleNucleusFilter.innerHTML = `<option value="all">Todos os núcleos</option>${nucleusOptions}`;
  elements.collaboratorNucleusInput.innerHTML = nucleusOptions;

  if (elements.typeFilter.querySelector(`[value="${cssEscape(current.type)}"]`)) elements.typeFilter.value = current.type;
  if (elements.statusFilter.querySelector(`[value="${cssEscape(current.status)}"]`)) elements.statusFilter.value = current.status;
  if (elements.nucleusFilter.querySelector(`[value="${cssEscape(current.nucleus)}"]`)) elements.nucleusFilter.value = current.nucleus;
  if (elements.peopleNucleusFilter.querySelector(`[value="${cssEscape(current.peopleNucleus)}"]`)) {
    elements.peopleNucleusFilter.value = current.peopleNucleus;
  }
}

function selectAsset(assetId) {
  const changed = selectedAssetId !== assetId;
  selectedAssetId = assetId;
  if (changed) detailTab = "summary";
  mobileDetailOpen = true;
  elements.inventoryBody.querySelectorAll("tr").forEach((row) => {
    row.classList.toggle("is-selected", row.dataset.assetRow === assetId);
  });
  elements.mobileInventoryList.querySelectorAll("[data-asset-id]").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.assetId === assetId);
  });
  renderDetail();
}

function closeMobileDetail() {
  mobileDetailOpen = false;
  updateMobileDetailState();
}

function updateMobileDetailState() {
  elements.detail.classList.toggle("is-open", mobileDetailOpen);
  elements.detailScrim.hidden = !mobileDetailOpen;
}

function switchView(view) {
  if (!viewCopy[view]) return;
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
  elements.viewEyebrow.textContent = viewCopy[view].eyebrow;
  elements.viewTitle.textContent = viewCopy[view].title;
  elements.viewDescription.textContent = viewCopy[view].description;
  elements.newAsset.hidden = view !== "inventory";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openAssetDialog() {
  elements.assetForm.reset();
  elements.assetStatusInput.value = "available";
  elements.assetForm.elements.acquiredAt.value = new Date().toISOString().slice(0, 10);
  clearFormError(elements.assetFormError);
  elements.assetDialog.showModal();
}

function openTransferDialog(asset) {
  elements.transferForm.reset();
  elements.transferForm.elements.assetId.value = asset.id;
  elements.transferForm.elements.nucleusId.value = asset.nucleusId;
  elements.transferForm.elements.location.value = asset.location;
  elements.transferForm.elements.assignee.value = asset.assignee;
  clearFormError(elements.transferFormError);
  elements.transferDialog.showModal();
}

function openIdentifierDialog(asset) {
  if (!dashboard?.session.authenticated) return;
  elements.identifierForm.reset();
  elements.identifierForm.elements.assetId.value = asset.id;
  elements.identifierForm.elements.currentAssetId.value = asset.hasPatrimony
    ? `#${asset.id}`
    : `Sem patrimônio · ${asset.id}`;
  clearFormError(elements.identifierFormError);
  elements.identifierDialog.showModal();
  elements.identifierForm.elements.newAssetId.focus();
}

function openNucleusEditDialog(nucleusId) {
  const nucleus = dashboard.nuclei.find((item) => item.id === nucleusId);
  if (!nucleus || !dashboard.session.authenticated) return;
  elements.editNucleusForm.reset();
  elements.editNucleusForm.elements.id.value = nucleus.id;
  elements.editNucleusForm.elements.code.value = nucleus.code;
  elements.editNucleusForm.elements.name.value = nucleus.name;
  elements.editNucleusForm.elements.location.value = nucleus.location;
  elements.editNucleusForm.elements.manager.value = nucleus.manager;
  clearFormError(elements.editNucleusFormError);
  elements.editNucleusDialog.showModal();
}

function openNucleusInventoryDialog(nucleusId) {
  const nucleus = dashboard?.nuclei.find((item) => item.id === nucleusId);
  if (!nucleus) return;
  selectedNucleusId = nucleus.id;
  elements.nucleusInventorySearch.value = "";
  document.querySelector("#nucleus-inventory-code").textContent = nucleus.code;
  document.querySelector("#nucleus-inventory-title").textContent = nucleus.name;
  document.querySelector("#nucleus-inventory-meta").textContent = `${nucleus.location} • Gestor: ${nucleus.manager}`;
  showNucleusInventoryList();
  renderNucleusInventory();
  elements.nucleusInventoryDialog.showModal();
}

function showNucleusInventoryList() {
  elements.nucleusAssetForm.hidden = true;
  elements.nucleusInventoryListView.hidden = false;
  clearFormError(elements.nucleusAssetFormError);
  renderNucleusInventory();
  window.setTimeout(() => elements.nucleusInventorySearch.focus(), 0);
}

function openNucleusAssetEditor(assetId) {
  const asset = (dashboard?.nucleusInventory || []).find((item) => item.id === assetId);
  if (!asset || !dashboard.session.authenticated) return;
  elements.nucleusAssetForm.reset();
  elements.nucleusAssetForm.elements.assetId.value = asset.id;
  elements.nucleusAssetForm.elements.identifier.value = assetIdentifierLabel(asset);
  elements.nucleusAssetForm.elements.nucleus.value = `${asset.nucleus.code} — ${asset.nucleus.name}`;
  elements.nucleusAssetForm.elements.type.value = asset.type;
  elements.nucleusAssetForm.elements.serial.value = asset.serial;
  elements.nucleusAssetForm.elements.brandModel.value = asset.brandModel;
  elements.nucleusAssetForm.elements.assignee.value = asset.assignee;
  elements.nucleusAssetForm.elements.acquiredAt.value = asset.acquiredAt || "";
  elements.nucleusAssetForm.elements.location.value = asset.location;
  elements.nucleusAssetForm.elements.notes.value = asset.notes;
  document.querySelector("#nucleus-asset-editor-title").textContent = `Editar ${assetIdentifierLabel(asset)}`;
  clearFormError(elements.nucleusAssetFormError);
  elements.nucleusInventoryListView.hidden = true;
  elements.nucleusAssetForm.hidden = false;
  window.setTimeout(() => elements.nucleusAssetForm.elements.type.focus(), 0);
}

function openCollaboratorDialog(collaboratorId) {
  const collaborator = dashboard.collaborators.find((item) => item.id === collaboratorId);
  if (!collaborator) return;
  elements.collaboratorForm.reset();
  elements.collaboratorForm.elements.id.value = collaborator.id;
  elements.collaboratorForm.elements.name.value = collaborator.name;
  elements.collaboratorForm.elements.nucleusId.value = collaborator.nucleusId;
  document.querySelector("#collaborator-dialog-title").textContent = collaborator.name;
  document.querySelector("#collaborator-avatar").textContent = collaborator.name.trim().charAt(0).toUpperCase();
  document.querySelector("#collaborator-profile-summary").textContent =
    `${collaborator.nucleus.code} • ${collaborator.nucleus.name}`;
  document.querySelector("#collaborator-assets-count").textContent =
    `${collaborator.assetCount} ${collaborator.assetCount === 1 ? "item" : "itens"}`;
  elements.collaboratorAssetsList.innerHTML = collaborator.assets.length
    ? collaborator.assets.map((asset) => `
        <article class="profile-asset-item profile-asset-item-${escapeAttribute(asset.type)}">
          <span class="profile-asset-icon profile-asset-icon-${escapeAttribute(asset.type)}" aria-hidden="true">${assetTypeIcon(asset.type)}</span>
          <div class="profile-asset-copy">
            <div class="profile-asset-heading">
              <strong>${escapeHtml(assetIdentifierLabel(asset))}</strong>
              <span>${escapeHtml(dashboard.options.assetTypes[asset.type])}</span>
            </div>
            <span class="profile-asset-meta">${escapeHtml(asset.brandModel)} • ${escapeHtml(asset.location)}</span>
          </div>
          ${statusBadge(asset.status)}
        </article>
      `).join("")
    : `<div class="profile-assets-empty"><strong>Sem patrimônio vinculado</strong><span>O colaborador permanece cadastrado para conferência.</span></div>`;
  clearFormError(elements.collaboratorFormError);
  elements.collaboratorDialog.showModal();
}

function openImportDialog() {
  if (!dashboard?.session.authenticated) {
    window.location.href = dashboard?.session.signInUrl || elements.signInLink.href;
    return;
  }
  elements.importForm.reset();
  resetImportPreview();
  clearFormError(elements.importFormError);
  elements.importDialog.showModal();
}

function resetImportPreview() {
  importPreview = null;
  elements.importPreview.hidden = true;
  elements.importCommit.hidden = true;
  elements.importIssues.innerHTML = "";
  clearFormError(elements.importFormError);
}

async function handleImportPreview(event) {
  event.preventDefault();
  if (!elements.importForm.reportValidity()) return;
  await processImport("preview");
}

async function handleImportCommit() {
  if (!importPreview?.canCommit) return;
  await processImport("commit");
}

async function processImport(mode) {
  const file = elements.importFile.files[0];
  if (!file) return showFormError(elements.importFormError, "Selecione um arquivo XLSX.");

  clearFormError(elements.importFormError);
  setFormBusy(elements.importForm, true);
  const formData = new FormData();
  formData.set("file", file);
  formData.set("mode", mode);
  formData.set("revision", String(dashboard.revision));

  try {
    const response = await fetch("/api/import", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível processar a planilha.");

    if (mode === "preview") {
      importPreview = data;
      renderImportPreview(data);
      return;
    }

    elements.importDialog.close();
    showToast(data.message || "Importação concluída.");
    await loadDashboard({ quiet: true });
    switchView("imports");
  } catch (error) {
    showFormError(elements.importFormError, error.message);
  } finally {
    setFormBusy(elements.importForm, false);
    if (mode === "preview" && importPreview?.canCommit) elements.importCommit.hidden = false;
  }
}

function renderImportPreview(preview) {
  document.querySelector("#preview-accepted").textContent = preview.acceptedCount;
  document.querySelector("#preview-untagged").textContent = preview.untaggedCount;
  document.querySelector("#preview-rejected").textContent = preview.rejectedCount;
  document.querySelector("#preview-adjusted").textContent = preview.adjustedCount;
  document.querySelector("#preview-nuclei").textContent = preview.nucleusCount;
  document.querySelector("#preview-collaborators").textContent = preview.collaboratorCount;

  const issues = [...preview.errors, ...preview.warnings].slice(0, 12);
  elements.importIssues.innerHTML = issues.length
    ? `
      <strong>Validação da planilha</strong>
      <ul>${issues
        .map(
          (item) => `<li><span>Linha ${item.row}, coluna ${escapeHtml(item.column)}</span>${escapeHtml(item.message)}</li>`,
        )
        .join("")}</ul>
      ${preview.errors.length + preview.warnings.length > issues.length ? `<small>Mais ${preview.errors.length + preview.warnings.length - issues.length} ocorrências serão registradas no histórico.</small>` : ""}
    `
    : "<strong>Planilha validada sem inconsistências.</strong>";
  elements.importPreview.hidden = false;
  elements.importCommit.textContent = `Importar ${preview.acceptedCount} válidos`;
  elements.importCommit.hidden = !preview.canCommit;
}

async function handleExport() {
  setButtonBusy(elements.exportButton, true);
  try {
    const response = await fetch("/api/export", { headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Não foi possível exportar o inventário.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || "patrimonios.xlsx";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Inventário exportado em XLSX.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setButtonBusy(elements.exportButton, false);
  }
}

async function handleAssetSubmit(event) {
  event.preventDefault();
  if (!elements.assetForm.reportValidity()) return;
  const formData = new FormData(elements.assetForm);
  const id = String(formData.get("id") || "").trim();
  if (!/^\d{6}$/.test(id)) {
    return showFormError(elements.assetFormError, "O identificador deve conter exatamente 6 números.");
  }

  await submitForm(
    elements.assetForm,
    elements.assetFormError,
    {
      type: "create_asset",
      asset: {
        id,
        type: formData.get("type"),
        nucleusId: formData.get("nucleusId"),
        status: formData.get("status"),
        brandModel: formData.get("brandModel"),
        serial: formData.get("serial"),
        acquiredAt: formData.get("acquiredAt"),
        value: 0,
        assignee: formData.get("assignee"),
        location: formData.get("location"),
        notes: formData.get("notes"),
      },
    },
    elements.assetDialog,
    id,
  );
}

async function handleTransferSubmit(event) {
  event.preventDefault();
  if (!elements.transferForm.reportValidity()) return;
  const formData = new FormData(elements.transferForm);
  const assetId = formData.get("assetId");
  await submitForm(
    elements.transferForm,
    elements.transferFormError,
    {
      type: "transfer_asset",
      assetId,
      nucleusId: formData.get("nucleusId"),
      location: formData.get("location"),
      assignee: formData.get("assignee"),
      note: formData.get("note"),
    },
    elements.transferDialog,
    assetId,
  );
}

async function handleIdentifierSubmit(event) {
  event.preventDefault();
  if (!elements.identifierForm.reportValidity()) return;
  const formData = new FormData(elements.identifierForm);
  const newAssetId = String(formData.get("newAssetId") || "").trim();
  if (!/^\d{6}$/.test(newAssetId)) {
    return showFormError(elements.identifierFormError, "O novo patrimônio deve conter exatamente 6 números.");
  }

  await submitForm(
    elements.identifierForm,
    elements.identifierFormError,
    {
      type: "update_asset_identifier",
      assetId: formData.get("assetId"),
      newAssetId,
      note: formData.get("note"),
    },
    elements.identifierDialog,
    newAssetId,
  );
}

async function handleNucleusSubmit(event) {
  event.preventDefault();
  if (!elements.nucleusForm.reportValidity()) return;
  const formData = new FormData(elements.nucleusForm);
  await submitForm(
    elements.nucleusForm,
    elements.nucleusFormError,
    {
      type: "create_nucleus",
      nucleus: {
        id: formData.get("id"),
        code: formData.get("code"),
        name: formData.get("name"),
        location: formData.get("location"),
        manager: formData.get("manager"),
      },
    },
    elements.nucleusDialog,
  );
}

async function handleNucleusUpdate(event) {
  event.preventDefault();
  if (!elements.editNucleusForm.reportValidity()) return;
  const formData = new FormData(elements.editNucleusForm);
  await submitForm(
    elements.editNucleusForm,
    elements.editNucleusFormError,
    {
      type: "update_nucleus",
      nucleus: {
        id: formData.get("id"),
        code: formData.get("code"),
        name: formData.get("name"),
        location: formData.get("location"),
        manager: formData.get("manager"),
      },
    },
    elements.editNucleusDialog,
  );
}

async function handleNucleusAssetUpdate(event) {
  event.preventDefault();
  if (!elements.nucleusAssetForm.reportValidity()) return;
  const formData = new FormData(elements.nucleusAssetForm);
  const saved = await submitForm(
    elements.nucleusAssetForm,
    elements.nucleusAssetFormError,
    {
      type: "update_asset_details",
      assetId: formData.get("assetId"),
      asset: {
        type: formData.get("type"),
        brandModel: formData.get("brandModel"),
        serial: formData.get("serial"),
        assignee: formData.get("assignee"),
        location: formData.get("location"),
        acquiredAt: formData.get("acquiredAt"),
        notes: formData.get("notes"),
      },
      note: formData.get("note"),
    },
    null,
  );
  if (saved) showNucleusInventoryList();
}

async function handleCollaboratorUpdate(event) {
  event.preventDefault();
  if (!elements.collaboratorForm.reportValidity()) return;
  const formData = new FormData(elements.collaboratorForm);
  await submitForm(
    elements.collaboratorForm,
    elements.collaboratorFormError,
    {
      type: "update_collaborator",
      collaborator: {
        id: formData.get("id"),
        name: formData.get("name"),
        nucleusId: formData.get("nucleusId"),
      },
    },
    elements.collaboratorDialog,
  );
}

async function handleStatusSubmit(event, asset) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const formData = new FormData(form);
  await submitForm(
    form,
    null,
    {
      type: "update_status",
      assetId: asset.id,
      status: formData.get("status"),
      note: formData.get("note"),
    },
    null,
    asset.id,
  );
}

async function submitForm(form, errorElement, action, dialog, nextSelectedId = null) {
  clearFormError(errorElement);
  setFormBusy(form, true);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...action, expectedRevision: dashboard.revision }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 && data.signInUrl) elements.signInLink.href = data.signInUrl;
      throw new Error(data.error || "Não foi possível concluir a operação.");
    }

    if (nextSelectedId) selectedAssetId = String(nextSelectedId);
    dialog?.close();
    showToast(data.message || "Alteração registrada com sucesso.");
    await loadDashboard({ quiet: true });
    return true;
  } catch (error) {
    if (errorElement) showFormError(errorElement, error.message);
    else showToast(error.message, true);
    return false;
  } finally {
    setFormBusy(form, false);
  }
}

function setInventoryLoading() {
  elements.inventoryContainer.setAttribute("aria-busy", "true");
  elements.inventoryBody.innerHTML = "";
  elements.mobileInventoryList.innerHTML = "";
  elements.inventoryState.hidden = false;
  elements.inventoryState.innerHTML = `
    <span class="loading-line"></span>
    <span class="loading-line loading-line-short"></span>
    <span>Carregando inventário...</span>
  `;
}

function setInventoryError(message) {
  elements.inventoryContainer.setAttribute("aria-busy", "false");
  elements.inventoryBody.innerHTML = "";
  elements.mobileInventoryList.innerHTML = "";
  elements.inventoryState.hidden = false;
  elements.inventoryState.innerHTML = `<strong>Falha ao carregar</strong><span>${escapeHtml(message)}</span>`;
}

function setFormBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = busy;
  });
}

function setButtonBusy(button, busy) {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
}

function showFormError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
}

function clearFormError(element) {
  if (!element) return;
  element.textContent = "";
  element.hidden = true;
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function handleAuthResult() {
  const url = new URL(window.location.href);
  const error = url.searchParams.get("auth_error");
  if (!error) return;

  const message = error.endsWith("_not_configured")
    ? "O provedor de login ainda não foi configurado."
    : error.endsWith("_not_authorized")
      ? "Esta conta não está autorizada para acessar a base empresarial."
      : "Não foi possível concluir o login.";
  showToast(message, true);
  url.searchParams.delete("auth_error");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function providerLabel(provider) {
  return {
    github: "Conta GitHub",
    google: "Conta Google",
  }[provider] || "Conta autorizada";
}

function statusBadge(status) {
  return `<span class="status-badge status-${escapeAttribute(status)}">${escapeHtml(dashboard.options.statuses[status])}</span>`;
}

function renderMovement(movement) {
  return `
    <li class="movement-item">
      <strong>${escapeHtml(movementLabel(movement.type))}</strong>
      <span>De ${escapeHtml(movement.from)} para ${escapeHtml(movement.to)}</span>
      <span>${escapeHtml(movement.note || "Sem observação")}</span>
      <small>${formatDateTime(movement.at)} • ${escapeHtml(movement.actor)}</small>
    </li>
  `;
}

function readThemeCookie() {
  return document.cookie.match(/(?:^|;\s*)patrimonio_theme=(light|dark)(?:;|$)/)?.[1] ?? null;
}

function setTheme(theme, { persist = false } = {}) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  elements.themeToggle.setAttribute("aria-checked", String(isDark));
  elements.themeToggle.setAttribute("aria-label", isDark ? "Ativar tema claro" : "Ativar tema escuro");
  elements.themeToggle.title = isDark ? "Ativar tema claro" : "Ativar tema escuro";
  elements.themeToggle.querySelector(".theme-toggle-label").textContent = isDark ? "Tema claro" : "Tema escuro";

  if (persist) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `patrimonio_theme=${isDark ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    hasStoredTheme = true;
  }
}

function movementLabel(type) {
  return {
    registration: "Cadastro",
    transfer: "Transferência",
    status_change: "Alteração de status",
    identifier_change: "Alteração de patrimônio",
    details_update: "Atualização cadastral",
    import: "Importação",
  }[type] || "Movimentação";
}

function editIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 20h9" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function assetIdentifierLabel(asset) {
  return asset.hasPatrimony ? `#${asset.id}` : "Sem patrimônio";
}

function formatDate(value) {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function assetTypeIcon(type) {
  const common = 'viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const icons = {
    cpu: `<svg ${common} data-asset-icon="cpu"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 6h4" /><path d="M10 10h4" /><circle cx="12" cy="17" r="1" /></svg>`,
    monitor_1: `<svg ${common} data-asset-icon="monitor"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>`,
    monitor_2: `<svg ${common} data-asset-icon="monitor"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>`,
    chair: `<svg ${common} data-asset-icon="office-chair"><path d="M7 3h3a2 2 0 0 1 2 2v8H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z" /><path d="M11 13h7a2 2 0 0 1 2 2v1H10" /><path d="M14 10h4v3" /><path d="M15 16v4" /><path d="M10 21h10" /><path d="M10 21l-1 1" /><path d="M20 21l1 1" /></svg>`,
    notebook: `<svg ${common} data-asset-icon="notebook"><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M2 20h20" /><path d="M9 20h6" /></svg>`,
  };
  return icons[type] || `<svg ${common}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6v6H9z" /></svg>`;
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function cssEscape(value) {
  return CSS.escape(String(value ?? ""));
}
