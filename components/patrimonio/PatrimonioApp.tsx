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
import { downloadExport, mutateDashboard } from "./api";
import { CollaboratorsView } from "./CollaboratorsView";
import { Dialogs } from "./Dialogs";
import {
  normalizeScannedIdentifier,
  useBarcodeScanner,
  useDashboard,
  useDebouncedValue,
  useTheme,
} from "./hooks";
import { InventoryView } from "./InventoryView";
import { NucleiView } from "./NucleiView";
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

const viewCopy: Record<ViewId, { eyebrow: string; title: string; description: string }> = {
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
    description: "Consulte alterações de posse, status e cadastro registradas pela operação.",
  },
  imports: {
    eyebrow: "Dados / Importações",
    title: "Carga e conciliação de planilhas",
    description: "Pré-valide arquivos XLSX e acompanhe o resultado das importações.",
  },
  collaborators: {
    eyebrow: "Pessoas / Colaboradores",
    title: "Responsáveis pelos patrimônios",
    description: "Consulte e ajuste os perfis derivados dos responsáveis presentes na base.",
  },
};

export default function PatrimonioApp() {
  const [view, setView] = useState<ViewId>("inventory");
  const [filterDraft, setFilterDraft] = useState<InventoryFilters>(defaultFilters);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const scannerUpdateRef = useRef<(state: "ready" | "reading" | "success" | "error", label: string) => void>(() => undefined);
  const lastProcessedScanRef = useRef<string | null>(null);
  const debouncedSearch = useDebouncedValue(filterDraft.search, 280);
  const apiFilters = useMemo(
    () => ({ ...filterDraft, search: debouncedSearch }),
    [debouncedSearch, filterDraft],
  );
  const { dashboard, loading, error, lastSyncAt, refresh } = useDashboard(apiFilters);
  const { theme, setTheme } = useTheme();

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, error: isError });
  }, []);

  const openScannedAsset = useCallback((asset: Asset, identifier: string) => {
    lastProcessedScanRef.current = identifier;
    setSelectedAssetId(asset.id);
    setModal({ kind: "scanner", assetId: asset.id });
    scannerUpdateRef.current("success", "Item localizado");
    showToast(`${asset.hasPatrimony ? "Patrimônio" : "Referência interna"} ${identifier} localizado.`);
  }, [showToast]);

  const handleScan = useCallback(async (identifier: string) => {
    if (!dashboard?.session.authenticated) {
      scannerUpdateRef.current("error", "Entre para consultar");
      showToast("Entre com uma conta autorizada antes de usar o leitor.", true);
      return;
    }

    lastProcessedScanRef.current = identifier;
    const scanFilters: InventoryFilters = { ...defaultFilters, search: identifier };
    setView("inventory");
    setFilterDraft(scanFilters);
    scannerUpdateRef.current("reading", "Consultando código");
    const next = await refresh({ quiet: true, filters: scanFilters });
    if (!next) {
      lastProcessedScanRef.current = null;
      return;
    }
    const asset = next.inventory.find((item) => item.id === identifier);
    if (!asset) {
      scannerUpdateRef.current("error", "Código não encontrado");
      showToast(`O código ${identifier} não está cadastrado.`, true);
      return;
    }
    openScannedAsset(asset, identifier);
  }, [dashboard?.session.authenticated, openScannedAsset, refresh, showToast]);
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

    const asset = dashboard.inventory.find((item) => item.id === identifier);
    if (!asset) return;
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
    if (!dashboard) throw new Error("A base ainda não foi carregada.");
    const result = await mutateDashboard(action, dashboard.revision);
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
      await downloadExport();
      showToast("Inventário exportado em XLSX.");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Não foi possível exportar o inventário.", true);
    }
  };

  const copy = viewCopy[view];
  const authenticated = Boolean(dashboard?.session.authenticated);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <button className="brand" type="button" aria-label="Dados CX, abrir inventário" onClick={() => setView("inventory")}>
            <Image className="brand-logo" src="/brand/cx-mark-header.png" alt="" width={440} height={230} priority />
            <span className="brand-copy"><strong>Patrimônio Ops</strong><small>Dados CX</small></span>
          </button>
          <nav className="primary-nav" aria-label="Navegação principal">
            {(Object.keys(viewCopy) as ViewId[]).map((item) => (
              <button
                key={item}
                className={`nav-item ${view === item ? "is-active" : ""}`}
                type="button"
                aria-current={view === item ? "page" : undefined}
                onClick={() => setView(item)}
              >
                {{
                  inventory: "Inventário",
                  nuclei: "Núcleos",
                  audit: "Auditoria",
                  imports: "Importações",
                  collaborators: "Colaboradores",
                }[item]}
              </button>
            ))}
          </nav>
          <div className="header-status" aria-label="Status da base de dados">
            <span className="status-dot" aria-hidden="true" />
            <div><strong>Base operacional</strong><span>{authenticated ? "Base empresarial Supabase" : "Dados protegidos"}</span></div>
          </div>
        </div>
      </header>

      <main className="main-content" id="main-content">
        <header className="topbar">
          <div className="page-heading">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          <div className="header-actions">
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
              <span className="theme-toggle-label">{theme === "dark" ? "Tema claro" : "Tema escuro"}</span>
            </button>
            <div className="session-control" aria-live="polite">
              <span className="session-avatar" aria-hidden="true">
                {(dashboard?.session.displayName ?? "V").trim().charAt(0).toUpperCase()}
              </span>
              <span className="session-text">
                <small>{authenticated ? providerLabel(dashboard?.session.provider) : "Acesso restrito"}</small>
                <strong title={dashboard?.session.displayName}>{dashboard?.session.displayName ?? "Carregando"}</strong>
              </span>
              {authenticated ? <a className="session-sign-out" href={dashboard?.session.signOutUrl}>Sair</a> : null}
            </div>
            <div className="data-actions">
              <button className="button button-secondary" type="button" disabled={!authenticated} onClick={() => setModal({ kind: "import" })}>
                <span aria-hidden="true">↑</span> Importar
              </button>
              <button className="button button-secondary" type="button" disabled={!authenticated} onClick={() => void handleExport()}>
                <span aria-hidden="true">↓</span> Exportar
              </button>
              {view === "inventory" ? (
                <button className="button button-primary" type="button" disabled={!authenticated} onClick={() => setModal({ kind: "create-asset" })}>
                  <span aria-hidden="true">+</span> Novo patrimônio
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {dashboard && !authenticated ? (
          <div className="demo-notice">
            <div><strong>Acesso protegido</strong><span>Entre com uma conta autorizada para acessar exclusivamente os dados da planilha empresarial.</span></div>
            <a className="button button-secondary button-small" href={dashboard.session.signInUrl}>Entrar</a>
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
            statusBusy={mutationBusy}
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
        {dashboard && view === "imports" ? (
          <ImportsView dashboard={dashboard} onImport={() => setModal({ kind: "import" })} />
        ) : null}
        {!dashboard && view !== "inventory" ? (
          loading
            ? <LoadingState label="Carregando módulo..." />
            : <EmptyState title="Módulo indisponível" description={error ?? "Não foi possível carregar os dados."} />
        ) : null}
      </main>

      {dashboard ? (
        <Dialogs
          key={JSON.stringify(modal)}
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

function providerLabel(provider: "github" | "google" | null | undefined): string {
  return provider === "github" ? "Conta GitHub" : provider === "google" ? "Conta Google" : "Sessão";
}
