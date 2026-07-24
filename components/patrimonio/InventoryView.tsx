"use client";

import {
  type FormEvent,
  useMemo,
  useState,
} from "react";
import type {
  Asset,
  Dashboard,
  InventoryFilters,
  QuickFilter,
} from "./types";
import type { ScannerState } from "./hooks";
import {
  AssetDetails,
  AssetIdentifier,
  BarcodeIcon,
  EmptyState,
  LoadingState,
  StatusBadge,
  formatDateTime,
} from "./ui";

const quickFilterLabels: Record<QuickFilter, string> = {
  all: "Todos",
  unassigned: "Sem responsável",
  untagged: "Sem patrimônio",
  maintenance: "Manutenção",
  discrepancy: "Divergências",
};

export function InventoryView({
  dashboard,
  filters,
  onFiltersChange,
  selectedAssetId,
  onSelectAsset,
  onTransfer,
  onIdentifier,
  onStatusSubmit,
  statusBusy,
  statusError,
  scannerState,
  scannerLabel,
  loading,
  loadError,
}: {
  dashboard: Dashboard | null;
  filters: InventoryFilters;
  onFiltersChange: (next: InventoryFilters) => void;
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
  onTransfer: (assetId: string) => void;
  onIdentifier: (assetId: string) => void;
  onStatusSubmit: (event: FormEvent<HTMLFormElement>, asset: Asset) => void;
  statusBusy: boolean;
  statusError: string | null;
  scannerState: ScannerState;
  scannerLabel: string;
  loading: boolean;
  loadError: string | null;
}) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [detailTab, setDetailTab] = useState<"summary" | "history">("summary");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const inventory = useMemo(() => dashboard?.inventory ?? [], [dashboard?.inventory]);
  const quickCounts = useMemo(() => ({
    all: inventory.length,
    unassigned: inventory.filter((asset) => isUnassigned(asset.assignee)).length,
    untagged: inventory.filter((asset) => !asset.hasPatrimony).length,
    maintenance: inventory.filter((asset) => asset.status === "maintenance").length,
    discrepancy: inventory.filter((asset) => asset.status === "discrepancy").length,
  }), [inventory]);
  const filtered = useMemo(() => inventory.filter((asset) => {
    if (quickFilter === "unassigned") return isUnassigned(asset.assignee);
    if (quickFilter === "untagged") return !asset.hasPatrimony;
    if (quickFilter === "maintenance") return asset.status === "maintenance";
    if (quickFilter === "discrepancy") return asset.status === "discrepancy";
    return true;
  }), [inventory, quickFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);
  const selectedAsset = pageItems.find((asset) => asset.id === selectedAssetId)
    ?? filtered.find((asset) => asset.id === selectedAssetId)
    ?? pageItems[0]
    ?? null;

  const updateFilter = <K extends keyof InventoryFilters>(
    key: K,
    value: InventoryFilters[K],
  ) => {
    setPage(1);
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    setQuickFilter("all");
    onFiltersChange({
      search: "",
      type: "all",
      status: "all",
      nucleus: "all",
      sort: "recent",
    });
  };

  return (
    <section className="view-section" id="inventory-view">
      <Summary dashboard={dashboard} />

      <section className="filter-band" aria-labelledby="filter-title">
        <div className="filter-heading">
          <div>
            <h2 id="filter-title">Inventário operacional</h2>
            <p>
              <span>{dashboard?.session.authenticated ? filtered.length : "--"}</span>{" "}
              {filtered.length === 1 ? "patrimônio encontrado" : "patrimônios encontrados"}
            </p>
          </div>
          <button className="button button-quiet button-small" type="button" onClick={clearFilters}>
            Limpar filtros
          </button>
          <button
            className="button button-secondary button-small advanced-filters-toggle"
            type="button"
            aria-expanded={advancedOpen}
            aria-controls="advanced-filters"
            onClick={() => setAdvancedOpen((current) => !current)}
          >
            Filtros
          </button>
        </div>

        <div className="filter-grid">
          <label className="field field-search">
            <span className="field-label-row">
              <span>Buscar patrimônio</span>
              <span
                className="scanner-status"
                data-state={scannerState}
                aria-live="polite"
                title="Leitor USB em modo teclado HID"
              >
                <BarcodeIcon />
                <span>{scannerLabel}</span>
              </span>
            </span>
            <input
              data-inventory-search
              type="search"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="ID, série, responsável ou local"
              autoComplete="off"
            />
          </label>

          <div className={`advanced-filters ${advancedOpen ? "is-open" : ""}`} id="advanced-filters" hidden={!advancedOpen}>
            <label className="field">
              <span>Tipo de item</span>
              <select
                value={filters.type}
                onChange={(event) => updateFilter("type", event.target.value as InventoryFilters["type"])}
              >
                <option value="all">Todos os itens</option>
                {dashboard ? Object.entries(dashboard.options.assetTypes).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                )) : null}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={filters.status}
                onChange={(event) => updateFilter("status", event.target.value as InventoryFilters["status"])}
              >
                <option value="all">Todos os status</option>
                {dashboard ? Object.entries(dashboard.options.statuses).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                )) : null}
              </select>
            </label>
            <label className="field">
              <span>Núcleo</span>
              <select value={filters.nucleus} onChange={(event) => updateFilter("nucleus", event.target.value)}>
                <option value="all">Todos os núcleos</option>
                {dashboard?.nuclei.map((nucleus) => (
                  <option key={nucleus.id} value={nucleus.id}>
                    {nucleus.code} - {nucleus.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ordenar por</span>
              <select
                value={filters.sort}
                onChange={(event) => updateFilter("sort", event.target.value as InventoryFilters["sort"])}
              >
                <option value="recent">Mais recentes</option>
                <option value="asset_asc">Patrimônio crescente</option>
                <option value="nucleus">Núcleo</option>
                <option value="status">Status</option>
              </select>
            </label>
          </div>
        </div>

        <div className="quick-filters" role="group" aria-label="Filtros rápidos">
          {(Object.keys(quickFilterLabels) as QuickFilter[]).map((value) => (
            <button
              key={value}
              className={[
                "quick-filter",
                value === "maintenance" ? "quick-filter-warning" : "",
                value === "discrepancy" ? "quick-filter-danger" : "",
                quickFilter === value ? "is-active" : "",
              ].filter(Boolean).join(" ")}
              type="button"
              aria-pressed={quickFilter === value}
              disabled={!dashboard?.session.authenticated}
              onClick={() => {
                setPage(1);
                setQuickFilter(value);
              }}
            >
              {quickFilterLabels[value]} <span>{quickCounts[value]}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="inventory-layout">
        <section
          className="table-panel"
          aria-labelledby="inventory-list-title"
          aria-busy={loading}
        >
          <div className="panel-heading">
            <div>
              <h2 id="inventory-list-title">Patrimônios</h2>
              <p>Clique no identificador para abrir o histórico completo.</p>
            </div>
            <span className="revision-badge">
              {dashboard?.session.authenticated ? `Revisão ${dashboard.revision}` : "Base protegida"}
            </span>
          </div>

          {loading && !dashboard ? <LoadingState /> : null}
          {loadError && !dashboard ? (
            <EmptyState title="Falha ao carregar" description={loadError} />
          ) : null}
          {!loading && dashboard && !filtered.length ? (
            <EmptyState
              title={dashboard.session.authenticated ? "Nenhum patrimônio encontrado" : "Dados protegidos"}
              description={dashboard.session.authenticated
                ? "Revise os filtros ou limpe a busca para ampliar os resultados."
                : "Entre com uma conta autorizada para carregar os dados da planilha."}
            />
          ) : null}

          {pageItems.length && dashboard ? (
            <>
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">Inventário de patrimônios</caption>
                  <thead>
                    <tr>
                      <th scope="col">Patrimônio</th>
                      <th scope="col">Item</th>
                      <th scope="col">Núcleo</th>
                      <th scope="col">Responsável</th>
                      <th scope="col">Status</th>
                      <th scope="col">Última movimentação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((asset) => (
                      <tr key={asset.id} className={asset.id === selectedAsset?.id ? "is-selected" : ""}>
                        <td>
                          <button
                            className="asset-id-button"
                            type="button"
                            onClick={() => onSelectAsset(asset.id)}
                          >
                            <AssetIdentifier asset={asset} />
                          </button>
                          <span className="cell-secondary">
                            {asset.hasPatrimony
                              ? asset.serial || "Sem número de série"
                              : `Referência interna ${asset.id}`}
                          </span>
                        </td>
                        <td>
                          <span className="cell-primary">{dashboard.options.assetTypes[asset.type]}</span>
                          <span className="cell-secondary">{asset.brandModel}</span>
                        </td>
                        <td>
                          <span className="cell-primary">{asset.nucleus.code}</span>
                          <span className="cell-secondary">{asset.nucleus.name}</span>
                        </td>
                        <td>
                          <span className="cell-primary">{asset.assignee || "Não alocado"}</span>
                          <span className="cell-secondary">{asset.location}</span>
                        </td>
                        <td><StatusBadge status={asset.status} labels={dashboard.options.statuses} /></td>
                        <td>
                          <span className="cell-primary">
                            {asset.lastMovement?.type
                              ? movementShortLabel(asset.lastMovement.type)
                              : "Sem movimentação"}
                          </span>
                          <span className="cell-secondary">
                            {formatDateTime(asset.lastMovement?.at ?? asset.createdAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-inventory-list">
                {pageItems.map((asset) => (
                  <button
                    key={asset.id}
                    className={`mobile-asset-card ${asset.id === selectedAsset?.id ? "is-selected" : ""}`}
                    type="button"
                    onClick={() => {
                      onSelectAsset(asset.id);
                      setMobileDetailOpen(true);
                    }}
                  >
                    <span className="mobile-asset-heading">
                      <span>
                        <strong><AssetIdentifier asset={asset} /> · {dashboard.options.assetTypes[asset.type]}</strong>
                        <small>{asset.hasPatrimony ? asset.brandModel : `Referência interna ${asset.id}`}</small>
                      </span>
                      <StatusBadge status={asset.status} labels={dashboard.options.statuses} />
                    </span>
                    <span className="mobile-asset-metadata">
                      <span><small>Núcleo</small><strong>{asset.nucleus.code} · {asset.nucleus.name}</strong></span>
                      <span><small>Responsável</small><strong>{asset.assignee || "Não alocado"}</strong></span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          <Pagination
            total={filtered.length}
            page={safePage}
            totalPages={totalPages}
            pageStart={pageStart}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </section>

        <aside className={`detail-panel ${mobileDetailOpen ? "is-open" : ""}`} aria-label="Detalhes do patrimônio">
          {selectedAsset && dashboard ? (
            <AssetDetails
              asset={selectedAsset}
              dashboard={dashboard}
              authenticated={dashboard.session.authenticated}
              activeTab={detailTab}
              onTabChange={setDetailTab}
              onTransfer={() => onTransfer(selectedAsset.id)}
              onIdentifier={() => onIdentifier(selectedAsset.id)}
              onClose={() => setMobileDetailOpen(false)}
              onStatusSubmit={(event) => onStatusSubmit(event, selectedAsset)}
              busy={statusBusy}
              error={statusError}
            />
          ) : (
            <EmptyState title="Nenhum item selecionado" description="Selecione um patrimônio para consultar os detalhes." />
          )}
          <button
            className="button button-secondary mobile-detail-close"
            type="button"
            onClick={() => setMobileDetailOpen(false)}
          >
            Fechar detalhes
          </button>
        </aside>
        {mobileDetailOpen ? (
          <button
            className="detail-scrim"
            type="button"
            aria-label="Fechar detalhes"
            onClick={() => setMobileDetailOpen(false)}
          />
        ) : null}
      </div>
    </section>
  );
}

function Summary({ dashboard }: { dashboard: Dashboard | null }) {
  const authenticated = dashboard?.session.authenticated;
  return (
    <div className="kpi-strip" aria-label="Resumo do inventário">
      <article className="kpi-item kpi-total">
        <span>Total ativo</span>
        <strong>{authenticated ? dashboard.summary.total : "--"}</strong>
        <small>{authenticated
          ? `${dashboard.summary.available} disponíveis · ${dashboard.summary.retired} baixados`
          : "dados protegidos"}</small>
      </article>
      <article className="kpi-item kpi-allocated">
        <span>Em uso</span>
        <strong>{authenticated ? dashboard.summary.allocated : "--"}</strong>
        <small>alocados a responsáveis</small>
      </article>
      <article className="kpi-item kpi-maintenance">
        <span>Manutenção</span>
        <strong>{authenticated ? dashboard.summary.maintenance : "--"}</strong>
        <small>aguardando tratamento</small>
      </article>
      <article className="kpi-item kpi-discrepancy">
        <span>Divergências</span>
        <strong>{authenticated ? dashboard.summary.discrepancies : "--"}</strong>
        <small>exigem conferência</small>
      </article>
    </div>
  );
}

function Pagination({
  total,
  page,
  totalPages,
  pageStart,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  totalPages: number;
  pageStart: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const end = Math.min(pageStart + pageSize, total);
  return (
    <div className="pagination" aria-label="Paginação do inventário">
      <span>{total ? `Mostrando ${pageStart + 1}–${end} de ${total} registros` : "Nenhum registro para mostrar"}</span>
      <div className="pagination-controls">
        <button className="icon-button pagination-button" type="button" aria-label="Primeira página" disabled={page <= 1} onClick={() => onPageChange(1)}>«</button>
        <button className="icon-button pagination-button" type="button" aria-label="Página anterior" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
        <span className="page-indicator"><strong>{page}</strong> de <strong>{totalPages}</strong></span>
        <button className="icon-button pagination-button" type="button" aria-label="Próxima página" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
        <button className="icon-button pagination-button" type="button" aria-label="Última página" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>»</button>
        <label className="page-size-field">
          <span className="sr-only">Itens por página</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            <option value="15">15 por página</option>
            <option value="25">25 por página</option>
            <option value="50">50 por página</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function isUnassigned(value: string): boolean {
  return !value || ["não alocado", "sem responsável", "disponível"].includes(value.trim().toLocaleLowerCase("pt-BR"));
}

function movementShortLabel(type: Asset["movements"][number]["type"]): string {
  return {
    registration: "Cadastro",
    transfer: "Transferência",
    status_change: "Status alterado",
    identifier_change: "Patrimônio alterado",
    details_update: "Cadastro atualizado",
    import: "Importação",
  }[type];
}
