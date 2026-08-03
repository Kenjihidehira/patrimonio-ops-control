"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import {
  isFleetPatrimonyId,
  isOfficialPatrimonyId,
} from "@/lib/asset-identifiers";
import { downloadExport, mutateDashboard } from "./api";
import { CollaboratorsView } from "./CollaboratorsView";
import { Dialogs } from "./Dialogs";
import { EnvironmentsView } from "./EnvironmentsView";
import {
  normalizeScannedIdentifier,
  useBarcodeScanner,
  useDashboard,
  useDebouncedValue,
  useTheme,
} from "./hooks";
import { InventoryView } from "./InventoryView";
import { NucleiView } from "./NucleiView";
import { OperationsView } from "./OperationsView";
import { AuditView, ImportsView } from "./OperationalViews";
import type {
  Asset,
  InventoryFilters,
  ModalState,
  MutationAction,
  ViewId,
} from "./types";
import { defaultFilters } from "./types";
import {
  EmptyState,
  LoadingState,
  Toast,
  formValue,
} from "./ui";


const viewCopy: Record<ViewId, { title: string; description: string }> = {
  inventory: {
    title: "Controle de patrimônios",
    description: "Localize ativos, acompanhe responsáveis e trate divergências por núcleo.",
  },
  nuclei: {
    title: "Responsabilidade por núcleo",
    description: "Acompanhe concentração, alocação e alertas em cada área da empresa.",
  },
  audit: {
    title: "Histórico de movimentações",
    description: "Consulte alterações de posse, status e cadastro registradas pela operação.",
  },
  operations: {
    title: "Operações patrimoniais",
    description: "Execute inventários, formalize custódias, controle manutenção e registre evidências de localização.",
  },
  imports: {
    title: "Carga e conciliação de planilhas",
    description: "Pré-valide arquivos XLSX e acompanhe o resultado das importações.",
  },
  collaborators: {
    title: "Responsáveis pelos patrimônios",
    description: "Consulte e ajuste os perfis derivados dos responsáveis presentes na base.",
  },
  environments: {
    title: "Ambientes e acessos",
    description: "Controle departamentos, usuários autorizados e transferências entre ambientes.",
  },
};

export default function PatrimonioApp() {
  const [view, setView] = useState<ViewId>("inventory");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [departmentSlug, setDepartmentSlug] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("department");
  });

  useEffect(() => {
    const desktopNavigation = window.matchMedia("(min-width: 1181px)");
    const closeMobileNavigation = () => {
      if (desktopNavigation.matches) setMobileNavigationOpen(false);
    };

    closeMobileNavigation();
    desktopNavigation.addEventListener("change", closeMobileNavigation);
    return () => desktopNavigation.removeEventListener("change", closeMobileNavigation);
  }, []);

  const [filterDraft, setFilterDraft] = useState<InventoryFilters>(defaultFilters);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const scannerUpdateRef = useRef<(state: "ready" | "reading" | "success" | "error", label: string) => void>(() => undefined);
  const lastProcessedScanRef = useRef<string | null>(null);
  const scanSequenceRef = useRef(0);
  const debouncedSearch = useDebouncedValue(filterDraft.search, 280);
  const apiFilters = useMemo(
    () => ({ ...filterDraft, search: debouncedSearch }),
    [debouncedSearch, filterDraft],
  );
  const { dashboard, loading, error, lastSyncAt, refresh } = useDashboard(
    apiFilters,
    departmentSlug,
  );
  const { theme, setTheme } = useTheme();

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, error: isError });
  }, []);

  const switchDepartment = useCallback((slug: string) => {
    setDepartmentSlug(slug);
    setView("inventory");
    setFilterDraft(defaultFilters);
    setSelectedAssetId(null);
    setModal({ kind: "closed" });
    const url = new URL(window.location.href);
    url.searchParams.set("department", slug);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const openScannedAsset = useCallback((asset: Asset, identifier: string) => {
    lastProcessedScanRef.current = identifier;
    setSelectedAssetId(asset.id);
    scanSequenceRef.current += 1;
    setModal({ kind: "scanner", assetId: asset.id, scanToken: scanSequenceRef.current });
    scannerUpdateRef.current("success", "Item localizado");
    showToast(`${asset.hasPatrimony ? "Patrimônio" : "Referência interna"} ${identifier} localizado.`);
  }, [showToast]);

  const openMissingScannedAsset = useCallback((identifier: string) => {
    lastProcessedScanRef.current = identifier;
    scanSequenceRef.current += 1;
    setModal({
      kind: "scanner-missing",
      identifier,
      scanToken: scanSequenceRef.current,
    });
    scannerUpdateRef.current("error", "Item não cadastrado");
  }, []);

  const handleScan = useCallback(async (identifier: string) => {
    if (!dashboard?.session.authenticated) {
      scannerUpdateRef.current("error", "Entre para consultar");
      showToast("Entre com uma conta autorizada antes de usar o leitor.", true);
      return;
    }

    lastProcessedScanRef.current = identifier;
    const scanFilters: InventoryFilters = { ...defaultFilters, search: identifier };
    setView("inventory");
    scannerUpdateRef.current("reading", "Consultando código");
    const next = await refresh({ quiet: true, filters: scanFilters });
    if (!next) {
      if (lastProcessedScanRef.current === identifier) {
        lastProcessedScanRef.current = null;
      }
      return;
    }
    const matchingAssets = next.inventory.filter((item) =>
      item.id === identifier
      || item.sourceIdentifier === identifier
      || item.baseCode === identifier,
    );
    if (matchingAssets.length > 1) {
      setFilterDraft(scanFilters);
      scannerUpdateRef.current("success", `${matchingAssets.length} itens localizados`);
      showToast(
        `${matchingAssets.length} registros usam a referência ${identifier}. Selecione a incorporação correta.`,
      );
      return;
    }
    const asset = matchingAssets[0];
    if (!asset) {
      if (!isOfficialPatrimonyId(identifier)) {
        scannerUpdateRef.current("error", "Referência não encontrada");
        showToast(`A referência interna ${identifier} não está cadastrada.`, true);
        return;
      }
      if (
        isFleetPatrimonyId(identifier)
        && next.environment.activeDepartment.slug !== "gazin-log"
      ) {
        scannerUpdateRef.current("error", "Frota restrita ao Gazin LOG");
        showToast("Identificadores de frota só podem ser cadastrados no ambiente Gazin LOG.", true);
        return;
      }
      setFilterDraft(scanFilters);
      openMissingScannedAsset(identifier);
      return;
    }
    setFilterDraft(scanFilters);
    openScannedAsset(asset, identifier);
  }, [
    dashboard?.session.authenticated,
    openMissingScannedAsset,
    openScannedAsset,
    refresh,
    showToast,
  ]);
  const scanner = useBarcodeScanner(handleScan);
  useEffect(() => {
    scannerUpdateRef.current = scanner.updateState;
  }, [scanner.updateState]);

  useEffect(() => {
    const identifier = normalizeScannedIdentifier(debouncedSearch);
    if (!identifier) {
      lastProcessedScanRef.current = null;
      return;
    }
    if (
      !dashboard?.session.authenticated
      || modal.kind !== "closed"
      || lastProcessedScanRef.current === identifier
    ) return;

    const matchingAssets = dashboard.inventory.filter((item) =>
      item.id === identifier
      || item.sourceIdentifier === identifier
      || item.baseCode === identifier,
    );
    if (matchingAssets.length !== 1) return;
    const asset = matchingAssets[0];
    const timer = window.setTimeout(() => openScannedAsset(asset, identifier), 0);
    return () => window.clearTimeout(timer);
  }, [
    dashboard,
    debouncedSearch,
    modal.kind,
    openScannedAsset,
  ]);

  const handleMutation = useCallback(async (
    action: MutationAction,
    nextSelectedId?: string,
  ) => {
    if (!dashboard?.environment) throw new Error("A base ainda não foi carregada.");
    if (!dashboard.environment.permissions.canWrite) {
      throw new Error("Seu perfil possui acesso somente para consulta.");
    }
    const result = await mutateDashboard(
      action,
      dashboard.revision,
      dashboard.environment.activeDepartment.slug,
    );
    if (nextSelectedId) setSelectedAssetId(nextSelectedId);
    await refresh({ quiet: true });
    showToast(result.message || "Alteração registrada com sucesso.");
  }, [dashboard, refresh, showToast]);

  const handleStatusSubmit = async (
    event: FormEvent<HTMLFormElement>,
    asset: Asset,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    setMutationBusy(true);
    setMutationError(null);
    try {
      await handleMutation({
        type: "update_status",
        assetId: asset.id,
        status: formValue(form, "status"),
        note: formValue(form, "note"),
      }, asset.id);
      form.reset();
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "Não foi possível atualizar o status.");
    } finally {
      setMutationBusy(false);
    }
  };

  const handleExport = async () => {
    try {
      if (!dashboard?.environment) throw new Error("A base ainda não foi carregada.");
      await downloadExport(dashboard.environment.activeDepartment.slug);
      showToast("Inventário exportado em XLSX.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Não foi possível exportar o inventário.", true);
    }
  };

  const copy = viewCopy[view];
  const authenticated = Boolean(dashboard?.session.authenticated);
  const environment = dashboard?.environment ?? null;
  const permissions = environment?.permissions ?? {
    canWrite: false,
    canImport: false,
    canExport: false,
  };
  const visibleViews = (Object.keys(viewCopy) as ViewId[]).filter(
    (item) => item !== "environments" || environment?.isAdmin,
  );

  return (
    <div className="app-shell">
      <div className="theme-transition-overlay" aria-hidden="true" />
      <header className={`app-header ${mobileNavigationOpen ? "is-open" : ""}`}>
        <div className="app-header-inner">
          <button
            className="app-brand"
            type="button"
            aria-label="Gazin Patrimônio Ops, abrir inventário"
            onClick={() => {
              setView("inventory");
              setMobileNavigationOpen(false);
            }}
          >
            <Image
              className="app-brand-logo app-brand-logo--gazin"
              src="/brand/gazin-logo.png"
              alt=""
              width={800}
              height={200}
              priority
            />
            <span className="app-brand-copy"><strong>Patrimônio Ops</strong><small>Gestão empresarial</small></span>
          </button>
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={mobileNavigationOpen ? "Fechar navegação" : "Abrir navegação"}
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen((isOpen) => !isOpen)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              {mobileNavigationOpen ? (
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
          <nav className="primary-nav" aria-label="Navegação principal">
            {visibleViews.map((item) => (
              <button
                key={item}
                className={`nav-item ${view === item ? "is-active" : ""}`}
                type="button"
                aria-current={view === item ? "page" : undefined}
                onClick={() => {
                  setView(item);
                  setMobileNavigationOpen(false);
                }}
              >
                <span className="nav-item-icon"><NavigationIcon view={item} /></span>
                <span>{{
                  inventory: "Inventário",
                  nuclei: "Núcleos",
                  audit: "Auditoria",
                  operations: "Operações",
                  imports: "Importações",
                  collaborators: "Colaboradores",
                  environments: "Ambientes",
                }[item]}</span>
              </button>
            ))}
          </nav>
          <div className="header-actions">
            {environment?.departments.length ? (
              <label className="department-switcher">
                <span>Departamento</span>
                <select
                  aria-label="Departamento ativo"
                  value={environment.activeDepartment.slug}
                  onChange={(event) => switchDepartment(event.target.value)}
                >
                  {environment.departments.map((department) => (
                    <option key={department.slug} value={department.slug}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              className="theme-toggle"
              type="button"
              role="switch"
              suppressHydrationWarning
              aria-checked={theme === "dark"}
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <span className="theme-toggle-track" aria-hidden="true"><span /></span>
              <span className="theme-toggle-label" suppressHydrationWarning>
                {theme === "dark" ? "Tema claro" : "Tema escuro"}
              </span>
            </button>
            <div className="session-control" aria-live="polite">
              <span className="session-avatar" aria-hidden="true">
                {(dashboard?.session.displayName ?? "V").trim().charAt(0).toUpperCase()}
              </span>
              <span className="session-text">
                <small>{authenticated ? providerLabel(dashboard?.session.provider) : "Acesso restrito"}</small>
                <strong title={dashboard?.session.displayName}>{dashboard?.session.displayName ?? "Carregando"}</strong>
              </span>
              {authenticated ? (
                <form action={dashboard?.session.signOutUrl} method="post">
                  <button className="session-sign-out" type="submit">Sair</button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="main-content" id="main-content">
        <header className="topbar">
          <div className="topbar-main">
            <div className="page-heading">
              <h1>{copy.title}</h1>
              <p>{copy.description}</p>
            </div>
          </div>
          <div className="data-actions">
            <button className="button button-secondary" type="button" disabled={!permissions.canImport} onClick={() => setModal({ kind: "import" })}>
              <CommandIcon type="import" /> Importar
            </button>
            <button className="button button-secondary" type="button" disabled={!permissions.canExport} onClick={() => void handleExport()}>
              <CommandIcon type="export" /> Exportar
            </button>
            {view === "inventory" ? (
              <button className="button button-primary" type="button" disabled={!permissions.canWrite} onClick={() => setModal({ kind: "create-asset" })}>
                <CommandIcon type="create" /> Novo patrimônio
              </button>
            ) : null}
          </div>
        </header>

        {dashboard && !authenticated ? (
          <div className="demo-notice">
            <div><strong>Acesso protegido</strong><span>Entre com uma conta autorizada para acessar exclusivamente os dados da planilha empresarial.</span></div>
            <a className="button button-secondary button-small" href={dashboard.session.signInUrl}>Entrar</a>
          </div>
        ) : null}
        {dashboard && authenticated && !permissions.canWrite ? (
          <div className="demo-notice read-only-notice">
            <div>
              <strong>Acesso somente para consulta</strong>
              <span>Alterações, importações e exportações dependem de autorização específica do administrador.</span>
            </div>
          </div>
        ) : null}

        {view === "inventory" ? (
          <InventoryView
            dashboard={dashboard}
            filters={filterDraft}
            onFiltersChange={setFilterDraft}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            onTransfer={(assetId) => setModal({ kind: "transfer", assetId })}
            onIdentifier={(assetId) => setModal({ kind: "identifier", assetId })}
            onStatusSubmit={(event, asset) => void handleStatusSubmit(event, asset)}
            statusBusy={mutationBusy || !permissions.canWrite}
            statusError={mutationError}
            scannerState={scanner.state}
            scannerLabel={scanner.label}
            loading={loading}
            loadError={error}
          />
        ) : null}

        {dashboard && view === "nuclei" ? (
          <NucleiView
            dashboard={dashboard}
            onCreate={() => setModal({ kind: "create-nucleus" })}
            onEdit={(nucleusId) => setModal({ kind: "edit-nucleus", nucleusId })}
            onOpenInventory={(nucleusId) => setModal({ kind: "nucleus-inventory", nucleusId })}
          />
        ) : null}
        {dashboard && view === "collaborators" ? (
          <CollaboratorsView
            dashboard={dashboard}
            lastSyncAt={lastSyncAt}
            onOpenProfile={(collaboratorId) => setModal({ kind: "collaborator", collaboratorId })}
          />
        ) : null}
        {dashboard && view === "audit" ? <AuditView dashboard={dashboard} /> : null}
        {dashboard && view === "operations" ? (
          <OperationsView dashboard={dashboard} onMutate={handleMutation} />
        ) : null}
        {dashboard && view === "imports" ? (
          <ImportsView dashboard={dashboard} onImport={() => setModal({ kind: "import" })} />
        ) : null}
        {dashboard && environment?.isAdmin && view === "environments" ? (
          <EnvironmentsView
            dashboard={dashboard}
            onRefresh={() => refresh({ quiet: true }).then(() => undefined)}
            onSwitchDepartment={switchDepartment}
            onToast={showToast}
          />
        ) : null}
        {!dashboard && view !== "inventory" ? (
          loading
            ? <LoadingState label="Carregando módulo..." />
            : <EmptyState title="Módulo indisponível" description={error ?? "Não foi possível carregar os dados."} />
        ) : null}
        <footer className="app-footer">
          <span>Uso interno · Dados pessoais protegidos</span>
          <a href="/privacidade">Privacidade e direitos do titular</a>
        </footer>
      </main>

      {dashboard ? (
        <Dialogs
          key={modal.kind === "scanner" ? "scanner" : JSON.stringify(modal)}
          dashboard={dashboard}
          modal={modal}
          setModal={setModal}
          onMutate={handleMutation}
          onImported={() => refresh({ quiet: true }).then(() => undefined)}
          onToast={showToast}
        />
      ) : null}
      {toast ? (
        <Toast
          message={toast.message}
          error={toast.error}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

function NavigationIcon({ view }: { view: ViewId }) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    fill: "none",
  } as const;

  if (view === "nuclei") {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.7" />
        <rect x="14" y="4" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.7" />
        <rect x="9" y="14" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 10v2h10v-2M12 12v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (view === "audit") {
    return (
      <svg {...common}>
        <path d="M6 4h12v16H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (view === "operations") {
    return (
      <svg {...common}>
        <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 9h8M8 13h5M8 17h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="m15 16 1.4 1.4L19 14.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (view === "imports") {
    return (
      <svg {...common}>
        <path d="M12 3v12m0 0-4-4m4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 18v2h14v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (view === "collaborators") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.5 19c.7-3.3 2.5-5 5.5-5s4.8 1.7 5.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M15 7.5a2.5 2.5 0 0 1 0 5M16.5 15c2.2.5 3.5 1.8 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (view === "environments") {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="7" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
        <rect x="13.5" y="5" width="7" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 14v5M17 14v5M4.5 17h5M14.5 17h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="4" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function CommandIcon({ type }: { type: "import" | "export" | "create" }) {
  if (type === "create") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d={type === "import" ? "M12 16V5m0 0L8 9m4-4 4 4" : "M12 5v11m0 0-4-4m4 4 4-4"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function providerLabel(provider: "google" | null | undefined): string {
  return provider === "google" ? "Conta Google" : "Sessão";
}
