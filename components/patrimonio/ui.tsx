"use client";

import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import type {
  Asset,
  AssetStatus,
  AssetType,
  Dashboard,
  Movement,
} from "./types";

export function Modal({
  open,
  labelledBy,
  className = "",
  onClose,
  children,
}: {
  open: boolean;
  labelledBy: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    const handleClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("click", handleClick);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`.trim()}
      aria-labelledby={labelledBy}
    >
      {children}
    </dialog>
  );
}

export function ModalHeader({
  eyebrow,
  title,
  titleId,
  description,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  titleId: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="modal-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
      <button
        className="icon-button"
        type="button"
        aria-label="Fechar"
        title="Fechar"
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function ModalFooter({
  onCancel,
  submitLabel,
  busy = false,
  children,
}: {
  onCancel: () => void;
  submitLabel?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="modal-footer">
      <button className="button button-secondary" type="button" onClick={onCancel}>
        Cancelar
      </button>
      {children}
      {submitLabel ? (
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Salvando..." : submitLabel}
        </button>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  status,
  labels,
}: {
  status: AssetStatus;
  labels: Dashboard["options"]["statuses"];
}) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}

export function AssetTypeIcon({
  type,
  className = "",
}: {
  type: AssetType;
  className?: string;
}) {
  const common = {
    "aria-hidden": true,
    viewBox: "0 0 24 24",
    width: 20,
    height: 20,
    fill: "none",
    className,
  } as const;

  if (type === "chair") {
    return (
      <svg {...common} data-asset-icon="office-chair">
        <path d="M8 5.5a3 3 0 0 1 6 0V12H8Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M6 11.5h10v3.25A2.25 2.25 0 0 1 13.75 17h-5.5A2.25 2.25 0 0 1 6 14.75Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M11 17v3m-4 0h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "notebook") {
    return (
      <svg {...common}>
        <rect x="5" y="4" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.5 18h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "monitor_1" || type === "monitor_2") {
    return (
      <svg {...common}>
        <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 16v3m-4 0h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="6" y="2.5" width="12" height="19" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 7h5M9.5 11h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

export function AssetIdentifier({ asset }: { asset: Pick<Asset, "id" | "hasPatrimony"> }) {
  return <>{asset.hasPatrimony ? `#${asset.id}` : "Sem patrimônio"}</>;
}

export function AssetDetails({
  asset,
  dashboard,
  authenticated,
  activeTab,
  onTabChange,
  onTransfer,
  onIdentifier,
  onStatusSubmit,
  busy,
  error,
  scannerContext = false,
}: {
  asset: Asset;
  dashboard: Dashboard;
  authenticated: boolean;
  activeTab: "summary" | "history";
  onTabChange: (tab: "summary" | "history") => void;
  onTransfer: () => void;
  onIdentifier: () => void;
  onStatusSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string | null;
  scannerContext?: boolean;
}) {
  const statusOptions = Object.entries(dashboard.options.statuses) as Array<
    [AssetStatus, string]
  >;

  return (
    <div className={scannerContext ? "scanner-asset-detail" : ""}>
      <div className="detail-header">
        <div className="detail-header-row">
          <div className="detail-identity">
            {scannerContext ? (
              <span className={`scanner-asset-type-icon scanner-asset-type-icon-${asset.type}`}>
                <AssetTypeIcon type={asset.type} />
              </span>
            ) : null}
            <div>
              <span className="detail-label">Identificador patrimonial</span>
              <h2><AssetIdentifier asset={asset} /></h2>
              <p className="detail-type">{dashboard.options.assetTypes[asset.type]}</p>
            </div>
          </div>
          <div className="detail-header-controls">
            <StatusBadge status={asset.status} labels={dashboard.options.statuses} />
          </div>
        </div>

        <div className="detail-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={onTransfer}
            disabled={!authenticated || asset.status === "retired"}
          >
            Transferir
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={onIdentifier}
            disabled={!authenticated}
          >
            Alterar patrimônio
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => void navigator.clipboard.writeText(asset.id)}
          >
            <CopyIcon /> Copiar ID
          </button>
        </div>
      </div>

      <div className="detail-tabs" role="tablist" aria-label="Detalhes do patrimônio">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "summary"}
          className={`detail-tab ${activeTab === "summary" ? "is-active" : ""}`}
          onClick={() => onTabChange("summary")}
        >
          Resumo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          className={`detail-tab ${activeTab === "history" ? "is-active" : ""}`}
          onClick={() => onTabChange("history")}
        >
          Histórico <span>{asset.movements.length}</span>
        </button>
      </div>

      <div className="detail-body">
        {activeTab === "summary" ? (
          <>
          <dl className="detail-grid">
            <div><dt>Núcleo</dt><dd>{asset.nucleus.name}</dd></div>
            <div><dt>Responsável</dt><dd>{asset.assignee || "Não alocado"}</dd></div>
            <div><dt>Localização</dt><dd>{asset.location}</dd></div>
            <div><dt>Número de série</dt><dd>{asset.serial || "Não informado"}</dd></div>
            <div><dt>Aquisição</dt><dd>{formatDate(asset.acquiredAt)}</dd></div>
            <div><dt>Marca e modelo</dt><dd>{asset.brandModel}</dd></div>
            <div className="detail-wide"><dt>Observações</dt><dd>{asset.notes || "Sem observações"}</dd></div>
          </dl>
          <form className="status-form" key={asset.status} onSubmit={onStatusSubmit}>
            <label className="field field-wide">
              <span>Atualizar status</span>
              <select name="status" defaultValue={asset.status} disabled={!authenticated || busy}>
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="field field-wide">
              <span>Motivo da alteração</span>
              <textarea
                name="note"
                rows={2}
                maxLength={500}
                required
                disabled={!authenticated || busy}
                placeholder="Informe o motivo para auditoria"
              />
            </label>
            {error ? <FormError message={error} /> : null}
            <button className="button button-primary" type="submit" disabled={!authenticated || busy}>
              {busy ? "Salvando..." : "Salvar status"}
            </button>
          </form>
          </>
        ) : (
          <div className="movement-list">
            {asset.movements.length ? asset.movements.map((movement) => (
              <MovementItem key={movement.id} movement={movement} />
            )) : <EmptyState title="Sem histórico" description="Nenhuma movimentação registrada." />}
          </div>
        )}
      </div>
    </div>
  );
}

export function MovementItem({ movement }: { movement: Movement }) {
  return (
    <article className="movement-item">
      <div>
        <strong>{movementLabel(movement.type)}</strong>
        <span>{formatDateTime(movement.at)}</span>
      </div>
      <p>De <strong>{movement.from}</strong> para <strong>{movement.to}</strong></p>
      {movement.note ? <p>{movement.note}</p> : null}
      <small>{movement.actor}</small>
    </article>
  );
}

export function FormError({ message }: { message: string }) {
  return <div className="form-error" role="alert">{message}</div>;
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="state-message">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function LoadingState({ label = "Carregando inventário..." }: { label?: string }) {
  return (
    <div className="state-message" aria-live="polite">
      <span className="loading-line" />
      <span className="loading-line loading-line-short" />
      <span>{label}</span>
    </div>
  );
}

export function Toast({
  message,
  error,
  onClose,
}: {
  message: string;
  error: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4_200);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  return (
    <div className={`toast ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>
      <span>{message}</span>
      <button type="button" aria-label="Fechar aviso" onClick={onClose}><CloseIcon /></button>
    </div>
  );
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none">
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function BarcodeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none">
      <path d="M4 5v14M7 5v14M11 5v14M14 5v14M16.5 5v14M20 5v14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function allocationStyle(value: number): CSSProperties {
  return { "--allocation": `${value}%` } as CSSProperties;
}

export function formValue(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? "").trim();
}

export function formatDate(value: string | null): string {
  if (!value) return "Não informado";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
}

export function movementLabel(type: Movement["type"]): string {
  return {
    registration: "Cadastro",
    transfer: "Transferência",
    status_change: "Alteração de status",
    identifier_change: "Alteração de patrimônio",
    details_update: "Atualização cadastral",
    import: "Importação",
  }[type];
}

export function normalizedText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
