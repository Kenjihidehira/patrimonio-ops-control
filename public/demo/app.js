const apiUrl = "/api/state";

const elements = {
  inventoryBody: document.querySelector("#inventory-body"),
  inventoryState: document.querySelector("#inventory-state"),
  inventoryContainer: document.querySelector("#inventory-table-container"),
  detail: document.querySelector("#asset-detail"),
  resultCount: document.querySelector("#result-count"),
  resultLabel: document.querySelector("#result-label"),
  revision: document.querySelector("#revision-badge"),
  session: document.querySelector("#session-control"),
  demoNotice: document.querySelector("#demo-notice"),
  signInLink: document.querySelector("#sign-in-link"),
  sidebarSource: document.querySelector("#sidebar-source"),
  nucleiGrid: document.querySelector("#nuclei-grid"),
  auditList: document.querySelector("#audit-list"),
  auditCount: document.querySelector("#audit-count"),
  toastRegion: document.querySelector("#toast-region"),
  search: document.querySelector("#search-input"),
  typeFilter: document.querySelector("#type-filter"),
  statusFilter: document.querySelector("#status-filter"),
  nucleusFilter: document.querySelector("#nucleus-filter"),
  sortFilter: document.querySelector("#sort-filter"),
  clearFilters: document.querySelector("#clear-filters"),
  newAsset: document.querySelector("#new-asset-button"),
  newNucleus: document.querySelector("#new-nucleus-button"),
  importButton: document.querySelector("#import-button"),
  exportButton: document.querySelector("#export-button"),
  importHistory: document.querySelector("#import-history"),
  importCount: document.querySelector("#import-count"),
  assetDialog: document.querySelector("#asset-dialog"),
  transferDialog: document.querySelector("#transfer-dialog"),
  nucleusDialog: document.querySelector("#nucleus-dialog"),
  importDialog: document.querySelector("#import-dialog"),
  assetForm: document.querySelector("#asset-form"),
  transferForm: document.querySelector("#transfer-form"),
  nucleusForm: document.querySelector("#nucleus-form"),
  importForm: document.querySelector("#import-form"),
  importFile: document.querySelector("#import-file"),
  importPreview: document.querySelector("#import-preview"),
  importIssues: document.querySelector("#preview-issues"),
  importCommit: document.querySelector("#commit-import-button"),
  assetFormError: document.querySelector("#asset-form-error"),
  transferFormError: document.querySelector("#transfer-form-error"),
  nucleusFormError: document.querySelector("#nucleus-form-error"),
  importFormError: document.querySelector("#import-form-error"),
  assetTypeInput: document.querySelector("#asset-type-input"),
  assetStatusInput: document.querySelector("#asset-status-input"),
  assetNucleusInput: document.querySelector("#asset-nucleus-input"),
  transferNucleusInput: document.querySelector("#transfer-nucleus-input"),
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
};

let dashboard = null;
let selectedAssetId = null;
let filterTimer = null;
let importPreview = null;

bindEvents();
handleAuthResult();
void loadDashboard();

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  elements.search.addEventListener("input", () => {
    window.clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => void loadDashboard({ quiet: true }), 240);
  });

  [elements.typeFilter, elements.statusFilter, elements.nucleusFilter, elements.sortFilter].forEach(
    (control) => control.addEventListener("change", () => void loadDashboard({ quiet: true })),
  );

  elements.clearFilters.addEventListener("click", () => {
    elements.search.value = "";
    elements.typeFilter.value = "all";
    elements.statusFilter.value = "all";
    elements.nucleusFilter.value = "all";
    elements.sortFilter.value = "recent";
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

  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
  });

  [elements.assetDialog, elements.transferDialog, elements.nucleusDialog, elements.importDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  elements.assetForm.addEventListener("submit", handleAssetSubmit);
  elements.transferForm.addEventListener("submit", handleTransferSubmit);
  elements.nucleusForm.addEventListener("submit", handleNucleusSubmit);
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
  if (!dashboard.inventory.length) {
    elements.inventoryBody.innerHTML = "";
    elements.inventoryState.hidden = false;
    elements.inventoryState.innerHTML = `
      <strong>${dashboard.session.authenticated ? "Nenhum patrimônio encontrado" : "Dados protegidos"}</strong>
      <span>${dashboard.session.authenticated ? "Revise os filtros ou limpe a busca para ampliar os resultados." : "Entre com uma conta autorizada para carregar exclusivamente os dados importados da planilha."}</span>
    `;
    return;
  }

  elements.inventoryState.hidden = true;
  elements.inventoryBody.innerHTML = dashboard.inventory
    .map(
      (asset) => `
        <tr class="${asset.id === selectedAssetId ? "is-selected" : ""}" data-asset-row="${escapeAttribute(asset.id)}">
          <td>
            <button class="asset-id-button" type="button" data-asset-id="${escapeAttribute(asset.id)}">
              ${escapeHtml(asset.id)}
            </button>
            <span class="cell-secondary">${escapeHtml(asset.serial || "Sem número de série")}</span>
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

  elements.inventoryBody.querySelectorAll("[data-asset-id]").forEach((button) => {
    button.addEventListener("click", () => selectAsset(button.dataset.assetId));
  });
}

function renderDetail() {
  const asset = dashboard?.inventory.find((item) => item.id === selectedAssetId);
  if (!asset) {
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
          <p class="eyebrow">Patrimônio selecionado</p>
          <h2 id="detail-title">#${escapeHtml(asset.id)}</h2>
          <p class="detail-type">${escapeHtml(dashboard.options.assetTypes[asset.type])}</p>
        </div>
        ${statusBadge(asset.status)}
      </div>
      <div class="detail-actions">
        <button class="button button-secondary button-small" id="transfer-asset-button" type="button" ${asset.status === "retired" || !dashboard.session.authenticated ? "disabled" : ""}>
          Transferir
        </button>
        <button class="button button-quiet button-small" id="copy-asset-id" type="button">Copiar ID</button>
      </div>
    </div>
    <div class="detail-body">
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
        <div>
          <dt>Valor</dt>
          <dd>${formatCurrency(asset.value)}</dd>
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

      <section class="movement-section" aria-labelledby="movement-title">
        <h3 id="movement-title">Histórico recente</h3>
        <ol class="movement-list">
          ${asset.movements.slice(0, 5).map(renderMovement).join("")}
        </ol>
      </section>
    </div>
  `;

  elements.detail.querySelector("#transfer-asset-button").addEventListener("click", () => openTransferDialog(asset));
  elements.detail.querySelector("#copy-asset-id").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(asset.id);
      showToast(`Patrimônio ${asset.id} copiado.`);
    } catch {
      showToast("Não foi possível copiar o identificador.", true);
    }
  });
  elements.detail.querySelector("#status-form").addEventListener("submit", (event) => handleStatusSubmit(event, asset));
}

function renderNuclei() {
  elements.nucleiGrid.innerHTML = dashboard.nuclei
    .map(
      (nucleus) => `
        <article class="nucleus-card ${nucleus.alerts ? "has-alerts" : ""}">
          <span class="nucleus-code">${escapeHtml(nucleus.code)}</span>
          <h3>${escapeHtml(nucleus.name)}</h3>
          <p class="nucleus-location">${escapeHtml(nucleus.location)}</p>
          <p class="nucleus-manager">Gestor: ${escapeHtml(nucleus.manager)}</p>
          <div class="nucleus-metrics">
            <div><span>Ativos</span><strong>${nucleus.total}</strong></div>
            <div><span>Em uso</span><strong>${nucleus.allocated}</strong></div>
            <div><span>Alertas</span><strong>${nucleus.alerts}</strong></div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderAudit() {
  const records = dashboard.audit.slice(0, 40);
  elements.auditCount.textContent = `${records.length} ${records.length === 1 ? "registro" : "registros"}`;
  elements.auditList.innerHTML = records
    .map(
      (record) => `
        <article class="audit-item">
          <div>
            <span class="audit-asset">#${escapeHtml(record.assetId)}</span>
            <small>${escapeHtml(record.assetType)}</small>
          </div>
          <div>
            <strong>${escapeHtml(record.typeLabel)}</strong>
            <span>${formatDateTime(record.at)}</span>
          </div>
          <div class="audit-flow">
            ${escapeHtml(record.from)}<br />→ ${escapeHtml(record.to)}
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
  elements.assetStatusInput.innerHTML = statusOptions;
  elements.assetNucleusInput.innerHTML = `<option value="">Selecione</option>${nucleusOptions}`;
  elements.transferNucleusInput.innerHTML = nucleusOptions;

  if (elements.typeFilter.querySelector(`[value="${cssEscape(current.type)}"]`)) elements.typeFilter.value = current.type;
  if (elements.statusFilter.querySelector(`[value="${cssEscape(current.status)}"]`)) elements.statusFilter.value = current.status;
  if (elements.nucleusFilter.querySelector(`[value="${cssEscape(current.nucleus)}"]`)) elements.nucleusFilter.value = current.nucleus;
}

function selectAsset(assetId) {
  selectedAssetId = assetId;
  elements.inventoryBody.querySelectorAll("tr").forEach((row) => {
    row.classList.toggle("is-selected", row.dataset.assetRow === assetId);
  });
  renderDetail();
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
  document.querySelector("#preview-rejected").textContent = preview.rejectedCount;
  document.querySelector("#preview-adjusted").textContent = preview.adjustedCount;
  document.querySelector("#preview-nuclei").textContent = preview.nucleusCount;

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
        value: Number(formData.get("value")),
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
  } catch (error) {
    if (errorElement) showFormError(errorElement, error.message);
    else showToast(error.message, true);
  } finally {
    setFormBusy(form, false);
  }
}

function setInventoryLoading() {
  elements.inventoryContainer.setAttribute("aria-busy", "true");
  elements.inventoryBody.innerHTML = "";
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
      <span>${escapeHtml(movement.from)} → ${escapeHtml(movement.to)}</span>
      <span>${escapeHtml(movement.note || "Sem observação")}</span>
      <small>${formatDateTime(movement.at)} • ${escapeHtml(movement.actor)}</small>
    </li>
  `;
}

function movementLabel(type) {
  return {
    registration: "Cadastro",
    transfer: "Transferência",
    status_change: "Alteração de status",
    import: "Importação",
  }[type] || "Movimentação";
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

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
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
