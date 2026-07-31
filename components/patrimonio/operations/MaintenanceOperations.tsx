"use client";

import { type FormEvent, useState } from "react";
import { EmptyState, formValue, formatDateTime } from "../ui";
import {
  AssetSelect,
  FormActions,
  InlineError,
  StatusPill,
  assetById,
  assetLabel,
  formatDate,
  futureInputValue,
  type OperationProps,
} from "./shared";

const kindLabels = {
  preventive: "Preventiva",
  corrective: "Corretiva",
  inspection: "Inspeção",
} as const;
const priorityLabels = { low: "Baixa", normal: "Normal", high: "Alta", critical: "Crítica" } as const;
const statusLabels = { open: "Aberta", in_progress: "Em execução", completed: "Concluída", cancelled: "Cancelada" } as const;

export function MaintenanceOperations({ dashboard, onMutate }: OperationProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyKey("create");
    setError(null);
    try {
      await onMutate({
        type: "create_maintenance_order",
        order: {
          id: crypto.randomUUID(),
          assetId: formValue(form, "assetId"),
          kind: formValue(form, "kind"),
          priority: formValue(form, "priority"),
          title: formValue(form, "title"),
          notes: formValue(form, "notes"),
          dueAt: formValue(form, "dueAt"),
        },
      });
      form.reset();
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível abrir a ordem."));
    } finally {
      setBusyKey(null);
    }
  }

  async function updateOrder(orderId: string, status: "in_progress" | "completed" | "cancelled") {
    setBusyKey(orderId);
    setError(null);
    try {
      await onMutate({
        type: "update_maintenance_order",
        orderId,
        status,
        note: status === "completed" ? "Serviço concluído e ativo liberado." : "Andamento atualizado pela operação.",
      });
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível atualizar a ordem."));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="maintenance-create-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="maintenance-create-title">Abrir ordem de manutenção</h2>
            <p>Controle inspeções, preventivas e corretivas por ativo.</p>
          </div>
        </div>
        <form className="form-grid operation-form" onSubmit={createOrder}>
          <label className="field field-wide">
            <span>Patrimônio</span>
            <AssetSelect assets={dashboard.nucleusInventory} />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select name="kind" defaultValue="corrective" required>
              {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Prioridade</span>
            <select name="priority" defaultValue="normal" required>
              {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field field-wide">
            <span>Título</span>
            <input name="title" minLength={3} maxLength={180} required placeholder="Diagnóstico e substituição de componente" />
          </label>
          <label className="field">
            <span>Prazo</span>
            <input name="dueAt" type="date" min={futureInputValue(0)} defaultValue={futureInputValue(7)} />
          </label>
          <label className="field field-wide">
            <span>Observações</span>
            <textarea name="notes" maxLength={500} rows={3} placeholder="Falha relatada, fornecedor ou instruções" />
          </label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "create"} submitLabel="Abrir ordem" />
        </form>
      </section>

      <section className="operational-panel operation-record-panel" aria-labelledby="maintenance-history-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="maintenance-history-title">Ordens e histórico técnico</h2>
            <p>Abertura e conclusão alteram o status patrimonial automaticamente.</p>
          </div>
          <span className="record-count">{dashboard.operations.maintenanceOrders.length} ordens</span>
        </div>
        {dashboard.operations.maintenanceOrders.length ? (
          <div className="operation-record-list">
            {dashboard.operations.maintenanceOrders.map((order) => {
              const asset = assetById(dashboard, order.assetId);
              const active = order.status === "open" || order.status === "in_progress";
              return (
                <article className={`operation-record maintenance-record priority-${order.priority}`} key={order.id}>
                  <div className="operation-record-main">
                    <strong>{order.title}</strong>
                    <span>{asset ? assetLabel(asset) : order.assetId}</span>
                    <small>{kindLabels[order.kind]} · {priorityLabels[order.priority]} · prazo {formatDate(order.dueAt)}</small>
                    <small>Atualizada por {order.updatedBy} em {formatDateTime(order.updatedAt)}</small>
                  </div>
                  <StatusPill
                    label={statusLabels[order.status]}
                    tone={order.status === "completed" ? "success" : order.priority === "critical" ? "danger" : active ? "warning" : "neutral"}
                  />
                  {active ? (
                    <div className="operation-record-actions">
                      {order.status === "open" ? <button className="button button-secondary button-small" type="button" disabled={busyKey === order.id} onClick={() => void updateOrder(order.id, "in_progress")}>Iniciar</button> : null}
                      <button className="button button-primary button-small" type="button" disabled={busyKey === order.id} onClick={() => void updateOrder(order.id, "completed")}>Concluir</button>
                      <button className="button button-secondary button-small" type="button" disabled={busyKey === order.id} onClick={() => void updateOrder(order.id, "cancelled")}>Cancelar</button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nenhuma ordem registrada" description="Abra uma ordem para acompanhar o serviço e a indisponibilidade." />
        )}
      </section>
    </div>
  );
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
