"use client";

import { type FormEvent, useMemo, useState } from "react";
import { EmptyState, formValue, formatDateTime } from "../ui";
import {
  AssetSelect,
  FormActions,
  InlineError,
  StatusPill,
  assetById,
  assetLabel,
  type OperationProps,
} from "./shared";

const statusLabels = {
  pending: "Aguardando aceite",
  accepted: "Aceito",
  rejected: "Recusado",
  cancelled: "Cancelado",
} as const;

export function CustodyOperations({ dashboard, onMutate }: OperationProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eligibleAssets = useMemo(() => {
    const pendingAssetIds = new Set(
      dashboard.operations.custodyTerms
        .filter((term) => term.status === "pending")
        .map((term) => term.assetId),
    );
    return dashboard.nucleusInventory.filter((asset) => (
      asset.assignee.trim().length >= 2
        && asset.assignee.trim().toLocaleLowerCase("pt-BR") !== "reserva"
        && !pendingAssetIds.has(asset.id)
    ));
  }, [dashboard.nucleusInventory, dashboard.operations.custodyTerms]);
  const currentIdentifier = dashboard.session.identifier?.toLocaleLowerCase("pt-BR") ?? "";

  async function createTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyKey("create");
    setError(null);
    try {
      await onMutate({
        type: "create_custody_term",
        term: {
          id: crypto.randomUUID(),
          assetId: formValue(form, "assetId"),
          assigneeIdentifier: formValue(form, "assigneeIdentifier").toLocaleLowerCase("pt-BR"),
          note: formValue(form, "note"),
        },
      });
      form.reset();
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível emitir o termo."));
    } finally {
      setBusyKey(null);
    }
  }

  async function respond(termId: string, response: "accepted" | "rejected" | "cancelled") {
    setBusyKey(termId);
    setError(null);
    try {
      await onMutate({
        type: "respond_custody_term",
        termId,
        response,
        note: response === "accepted" ? "Aceite eletrônico registrado no sistema." : "Resposta registrada no sistema.",
      });
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível responder ao termo."));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="custody-create-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="custody-create-title">Emitir termo de custódia</h2>
            <p>Formalize a responsabilidade individual pelo ativo.</p>
          </div>
        </div>
        <form className="form-grid operation-form" onSubmit={createTerm}>
          <label className="field field-wide">
            <span>Patrimônio alocado</span>
            <AssetSelect assets={eligibleAssets} />
          </label>
          <label className="field field-wide">
            <span>E-mail corporativo do responsável</span>
            <input name="assigneeIdentifier" type="email" required autoComplete="email" placeholder="colaborador@empresa.com.br" />
          </label>
          <label className="field field-wide">
            <span>Condições e observações</span>
            <textarea name="note" maxLength={500} rows={3} placeholder="Estado de conservação, acessórios e responsabilidade de devolução" />
          </label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "create"} submitLabel="Emitir termo" />
        </form>
      </section>

      <section className="operational-panel operation-record-panel" aria-labelledby="custody-history-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="custody-history-title">Termos e aceite eletrônico</h2>
            <p>Histórico imutável de emissão, aceite, recusa ou cancelamento.</p>
          </div>
          <span className="record-count">{dashboard.operations.custodyTerms.length} termos</span>
        </div>
        {dashboard.operations.custodyTerms.length ? (
          <div className="operation-record-list">
            {dashboard.operations.custodyTerms.map((term) => {
              const asset = assetById(dashboard, term.assetId);
              const canRespond = term.status === "pending" && currentIdentifier === term.assigneeIdentifier.toLocaleLowerCase("pt-BR");
              const canCancel = term.status === "pending" && (
                dashboard.environment.isAdmin || dashboard.session.displayName === term.issuedBy
              );
              return (
                <article className="operation-record" key={term.id}>
                  <div className="operation-record-main">
                    <strong>{asset ? assetLabel(asset) : term.assetId}</strong>
                    <span>{term.assignee} · {term.assigneeIdentifier}</span>
                    <small>Emitido por {term.issuedBy} em {formatDateTime(term.issuedAt)}</small>
                  </div>
                  <StatusPill
                    label={statusLabels[term.status]}
                    tone={term.status === "accepted" ? "success" : term.status === "pending" ? "warning" : term.status === "rejected" ? "danger" : "neutral"}
                  />
                  {canRespond || canCancel ? (
                    <div className="operation-record-actions">
                      {canRespond ? <button className="button button-primary button-small" type="button" disabled={busyKey === term.id} onClick={() => void respond(term.id, "accepted")}>Aceitar</button> : null}
                      {canRespond ? <button className="button button-secondary button-small" type="button" disabled={busyKey === term.id} onClick={() => void respond(term.id, "rejected")}>Recusar</button> : null}
                      {canCancel ? <button className="button button-secondary button-small" type="button" disabled={busyKey === term.id} onClick={() => void respond(term.id, "cancelled")}>Cancelar</button> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nenhum termo emitido" description="Os termos de responsabilidade aparecerão aqui." />
        )}
      </section>
    </div>
  );
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
