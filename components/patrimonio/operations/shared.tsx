"use client";

import { useCallback, useState } from "react";
import type { Asset, Dashboard, MutationAction } from "../types";

export type OperationsMutation = (
  action: MutationAction,
  nextSelectedId?: string,
) => Promise<void>;

export type OperationProps = {
  dashboard: Dashboard;
  onMutate: OperationsMutation;
  onToast: (message: string, isError?: boolean) => void;
  onRefresh: () => Promise<void>;
};

export function AssetSelect({
  assets,
  name = "assetId",
  required = true,
  defaultValue,
}: {
  assets: Asset[];
  name?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <select name={name} required={required} defaultValue={defaultValue ?? ""}>
      <option value="">Selecione um patrimônio</option>
      {assets.map((asset) => (
        <option key={asset.id} value={asset.id}>
          {assetLabel(asset)}
        </option>
      ))}
    </select>
  );
}

export function assetLabel(asset: Asset): string {
  const sourceContext = asset.sourceSystem === "sabium" && asset.incorporation !== null
    ? ` · Inc. ${asset.incorporation}`
    : "";
  const identifier = `${asset.sourceIdentifier || asset.id}${sourceContext}`;
  const details = [asset.brandModel, asset.assignee, asset.location]
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
  return details ? `${identifier} · ${details}` : identifier;
}

export function assetById(dashboard: Dashboard, assetId: string): Asset | undefined {
  return dashboard.nucleusInventory.find((asset) => asset.id === assetId);
}

export function formatDate(value: string | null): string {
  if (!value) return "Sem prazo";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "Sem prazo"
    : new Intl.DateTimeFormat("pt-BR").format(date);
}

export function todayInputValue(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function futureInputValue(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return <span className={`operation-status operation-status-${tone}`}>{label}</span>;
}

export function InlineError({ message }: { message: string | null }) {
  return message ? <p className="operation-inline-error" role="alert">{message}</p> : null;
}

export function FormActions({
  busy,
  submitLabel,
  busyLabel = "Registrando...",
}: {
  busy: boolean;
  submitLabel: string;
  busyLabel?: string;
}) {
  return (
    <div className="operation-form-actions field-wide">
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  );
}

export function useOperationMutation(onMutate: OperationsMutation) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (
    key: string,
    action: MutationAction,
    onSuccess?: () => void,
  ) => {
    setBusyKey(key);
    setError(null);
    try {
      await onMutate(action);
      onSuccess?.();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação.");
      return false;
    } finally {
      setBusyKey(null);
    }
  }, [onMutate]);
  return { busyKey, error, setError, run };
}
