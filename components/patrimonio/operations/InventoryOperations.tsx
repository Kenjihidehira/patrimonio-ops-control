"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { InventoryCheckResult } from "../types";
import { EmptyState, SearchIcon, formValue, normalizedText } from "../ui";
import {
  FormActions,
  InlineError,
  StatusPill,
  assetById,
  assetLabel,
  formatDate,
  futureInputValue,
  type OperationProps,
} from "./shared";
import { QrCameraScanner } from "./QrCameraScanner";
import {
  loadInventoryQueue,
  queueInventoryCheck,
  removeInventoryChecks,
  type OfflineInventoryCheck,
} from "./offlineInventory";

const resultLabels: Record<InventoryCheckResult, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  missing: "Não localizado",
  wrong_location: "Local divergente",
  damaged: "Avariado",
};

export function InventoryOperations({ dashboard, onMutate, onToast }: OperationProps) {
  const campaigns = dashboard.operations.inventoryCampaigns;
  const firstActiveId = campaigns.find((campaign) => campaign.status === "active")?.id
    ?? campaigns[0]?.id
    ?? "";
  const [selectedCampaignId, setSelectedCampaignId] = useState(firstActiveId);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<InventoryCheckResult | "all">("all");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineInventoryCheck[]>([]);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const departmentSlug = dashboard.environment.activeDepartment.slug;
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId)
    ?? campaigns.find((campaign) => campaign.status === "active")
    ?? campaigns[0];
  const campaignAssets = useMemo(() => {
    if (!selectedCampaign) return [];
    const queuedByAsset = new Map(
      offlineQueue
        .filter((item) => item.campaignId === selectedCampaign.id)
        .map((item) => [item.assetId, item]),
    );
    return dashboard.operations.inventoryCampaignAssets
      .filter((item) => item.campaignId === selectedCampaign.id)
      .map((item) => {
        const queued = queuedByAsset.get(item.assetId);
        return queued ? { ...item, result: queued.result, queuedOffline: true } : { ...item, queuedOffline: false };
      })
      .filter((item) => resultFilter === "all" || item.result === resultFilter)
      .filter((item) => {
        if (!query) return true;
        const asset = assetById(dashboard, item.assetId);
        return normalizedText(
          `${item.assetId} ${asset?.brandModel ?? ""} ${asset?.assignee ?? ""} ${asset?.location ?? ""}`,
        ).includes(normalizedText(query));
      });
  }, [dashboard, offlineQueue, query, resultFilter, selectedCampaign]);

  const refreshOfflineQueue = useCallback(async () => {
    try {
      setOfflineQueue(await loadInventoryQueue(departmentSlug));
    } catch {
      setError("A fila offline não está disponível neste navegador.");
    }
  }, [departmentSlug]);

  useEffect(() => {
    let active = true;
    void loadInventoryQueue(departmentSlug).then((records) => {
      if (active) setOfflineQueue(records);
    }).catch(() => {
      if (active) setError("A fila offline não está disponível neste navegador.");
    });
    return () => {
      active = false;
    };
  }, [departmentSlug]);

  const syncOfflineQueue = useCallback(async () => {
    if (!selectedCampaign || !navigator.onLine) return;
    const records = offlineQueue.filter((item) => item.campaignId === selectedCampaign.id).slice(0, 250);
    if (!records.length) return;
    setBusyKey("sync-offline");
    setError(null);
    try {
      await onMutate({
        type: "record_inventory_checks_batch",
        campaignId: selectedCampaign.id,
        checks: records.map(({ assetId, result, observedLocation, note }) => ({ assetId, result, observedLocation, note })),
      });
      await removeInventoryChecks(records.map((item) => item.id));
      await refreshOfflineQueue();
      onToast(`${records.length} conferência(s) offline sincronizada(s).`);
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível sincronizar a fila offline."));
    } finally {
      setBusyKey(null);
    }
  }, [offlineQueue, onMutate, onToast, refreshOfflineQueue, selectedCampaign]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncOfflineQueue();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncOfflineQueue]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyKey("create");
    setError(null);
    try {
      const campaignId = crypto.randomUUID();
      await onMutate({
        type: "create_inventory_campaign",
        campaign: {
          id: campaignId,
          name: formValue(form, "name"),
          nucleusId: formValue(form, "nucleusId"),
          dueAt: formValue(form, "dueAt"),
        },
      });
      setSelectedCampaignId(campaignId);
      form.reset();
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível criar a campanha."));
    } finally {
      setBusyKey(null);
    }
  }

  const recordCheck = useCallback(async (
    assetId: string,
    result: Exclude<InventoryCheckResult, "pending">,
  ) => {
    if (!selectedCampaign) return;
    setBusyKey(assetId);
    setError(null);
    try {
      const asset = assetById(dashboard, assetId);
      if (!navigator.onLine) {
        await queueInventoryCheck({
          departmentSlug,
          campaignId: selectedCampaign.id,
          assetId,
          result,
          observedLocation: asset?.location ?? "",
          note: result === "confirmed" ? "Conferência offline" : resultLabels[result],
        });
        await refreshOfflineQueue();
        onToast(`${assetId} salvo na fila offline.`);
        return;
      }
      await onMutate({
        type: "record_inventory_check",
        campaignId: selectedCampaign.id,
        assetId,
        result,
        observedLocation: asset?.location ?? "",
        note: result === "confirmed" ? "Conferência operacional" : resultLabels[result],
      }, assetId);
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível registrar a conferência."));
    } finally {
      setBusyKey(null);
    }
  }, [dashboard, departmentSlug, onMutate, onToast, refreshOfflineQueue, selectedCampaign]);

  const handleCameraResult = useCallback((assetId: string) => {
    if (!selectedCampaign) return;
    const item = dashboard.operations.inventoryCampaignAssets.find((candidate) => candidate.campaignId === selectedCampaign.id && candidate.assetId === assetId);
    if (!item) {
      setError(`O patrimônio ${assetId} não pertence à campanha selecionada.`);
      return;
    }
    void recordCheck(assetId, "confirmed");
  }, [dashboard.operations.inventoryCampaignAssets, recordCheck, selectedCampaign]);

  async function completeCampaign() {
    if (!selectedCampaign) return;
    setBusyKey("complete");
    setError(null);
    try {
      await onMutate({
        type: "complete_inventory_campaign",
        campaignId: selectedCampaign.id,
      });
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível concluir a campanha."));
    } finally {
      setBusyKey(null);
    }
  }

  const progress = selectedCampaign?.targetCount
    ? Math.round((selectedCampaign.checkedCount / selectedCampaign.targetCount) * 100)
    : 0;

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="inventory-create-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="inventory-create-title">Nova campanha</h2>
            <p>Defina o escopo da contagem física e o prazo.</p>
          </div>
        </div>
        <form className="form-grid operation-form" onSubmit={createCampaign}>
          <label className="field field-wide">
            <span>Nome da campanha</span>
            <input name="name" minLength={3} maxLength={180} required placeholder="Inventário cíclico · Agosto" />
          </label>
          <label className="field">
            <span>Núcleo</span>
            <select name="nucleusId" defaultValue="">
              <option value="">Todos os núcleos</option>
              {dashboard.nuclei.map((nucleus) => (
                <option key={nucleus.id} value={nucleus.id}>{nucleus.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Prazo</span>
            <input name="dueAt" type="date" min={futureInputValue(0)} defaultValue={futureInputValue(14)} />
          </label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "create"} submitLabel="Criar campanha" />
        </form>
      </section>

      <section className="operational-panel operation-record-panel" aria-labelledby="inventory-campaign-title">
        <div className="operational-panel-toolbar operation-toolbar-wrap">
          <div>
            <h2 id="inventory-campaign-title">Execução do inventário</h2>
            <p>Conferência por item com tratamento automático das divergências.</p>
          </div>
          {campaigns.length ? (
            <div className="inventory-field-tools">
              <label className="operation-toolbar-select">
                <span>Campanha</span>
                <select value={selectedCampaign?.id ?? ""} onChange={(event) => setSelectedCampaignId(event.target.value)}>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                  ))}
                </select>
              </label>
              <div className="inventory-capture-actions">
                <QrCameraScanner disabled={selectedCampaign?.status !== "active"} onDetected={handleCameraResult} />
                {offlineQueue.length ? <button className="button button-secondary button-small" type="button" disabled={!online || busyKey === "sync-offline"} onClick={() => void syncOfflineQueue()}>{busyKey === "sync-offline" ? "Sincronizando..." : `Sincronizar fila (${offlineQueue.length})`}</button> : null}
                <StatusPill label={online ? "Online" : "Offline"} tone={online ? "success" : "warning"} />
              </div>
            </div>
          ) : null}
        </div>

        {selectedCampaign ? (
          <>
            <div className="campaign-progress-block">
              <div className="campaign-progress-heading">
                <div>
                  <strong>{selectedCampaign.name}</strong>
                  <span>Prazo {formatDate(selectedCampaign.dueAt)}</span>
                </div>
                <StatusPill
                  label={selectedCampaign.status === "active" ? "Em andamento" : "Concluída"}
                  tone={selectedCampaign.status === "active" ? "info" : "success"}
                />
              </div>
              <div className="campaign-progress-copy">
                <span>{selectedCampaign.checkedCount} de {selectedCampaign.targetCount} conferidos</span>
                <strong>{progress}%</strong>
              </div>
              <progress value={selectedCampaign.checkedCount} max={Math.max(1, selectedCampaign.targetCount)}>{progress}%</progress>
              <div className="campaign-mini-metrics">
                <span><strong>{selectedCampaign.targetCount - selectedCampaign.checkedCount}</strong> pendentes</span>
                <span className={selectedCampaign.issueCount ? "has-alert" : ""}><strong>{selectedCampaign.issueCount}</strong> divergências</span>
                {selectedCampaign.status === "active" && selectedCampaign.checkedCount === selectedCampaign.targetCount ? (
                  <button className="button button-primary button-small" type="button" disabled={busyKey === "complete"} onClick={() => void completeCampaign()}>
                    {busyKey === "complete" ? "Concluindo..." : "Concluir campanha"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="operation-list-filters">
              <label className="field operation-search">
                <span>Buscar item</span>
                <span className="search-control">
                  <SearchIcon />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patrimônio, modelo, pessoa ou local" />
                </span>
              </label>
              <label className="field">
                <span>Resultado</span>
                <select value={resultFilter} onChange={(event) => setResultFilter(event.target.value as InventoryCheckResult | "all")}>
                  <option value="all">Todos</option>
                  {Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            {campaignAssets.length ? (
              <div className="operation-record-list inventory-check-list">
                {campaignAssets.map((item) => {
                  const asset = assetById(dashboard, item.assetId);
                  const pending = item.result === "pending" && selectedCampaign.status === "active";
                  return (
                    <article className="operation-record inventory-check-record" key={`${item.campaignId}-${item.assetId}`}>
                      <div className="operation-record-main">
                        <strong>{asset ? assetLabel(asset) : item.assetId}</strong>
                        <span>{asset?.nucleus.name ?? "Núcleo não localizado"}</span>
                      </div>
                      <StatusPill
                        label={item.queuedOffline ? `${resultLabels[item.result]} · offline` : resultLabels[item.result]}
                        tone={item.result === "confirmed" ? "success" : item.result === "pending" ? "neutral" : "danger"}
                      />
                      {pending ? (
                        <div className="inventory-check-actions">
                          <button className="icon-command is-success" type="button" title="Confirmar presença" disabled={busyKey === item.assetId} onClick={() => void recordCheck(item.assetId, "confirmed")}>
                            <span aria-hidden="true">✓</span><span>Confirmar</span>
                          </button>
                          <button className="icon-command" type="button" title="Registrar local divergente" disabled={busyKey === item.assetId} onClick={() => void recordCheck(item.assetId, "wrong_location")}>
                            <span aria-hidden="true">↔</span><span>Local</span>
                          </button>
                          <button className="icon-command" type="button" title="Registrar avaria" disabled={busyKey === item.assetId} onClick={() => void recordCheck(item.assetId, "damaged")}>
                            <span aria-hidden="true">!</span><span>Avaria</span>
                          </button>
                          <button className="icon-command is-danger" type="button" title="Registrar item não localizado" disabled={busyKey === item.assetId} onClick={() => void recordCheck(item.assetId, "missing")}>
                            <span aria-hidden="true">×</span><span>Ausente</span>
                          </button>
                        </div>
                      ) : (
                        <small className="operation-record-meta">{item.queuedOffline ? "Aguardando sincronização" : item.checkedBy ? `Por ${item.checkedBy}` : "Aguardando conferência"}</small>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="Nenhum item neste filtro" description="Altere a busca ou o resultado selecionado." />
            )}
          </>
        ) : (
          <EmptyState title="Nenhuma campanha criada" description="Crie uma campanha para iniciar a contagem física." />
        )}
      </section>
    </div>
  );
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
