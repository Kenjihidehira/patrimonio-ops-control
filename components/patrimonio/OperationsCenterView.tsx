"use client";

import { useMemo, useState } from "react";
import type { Dashboard } from "./types";
import { OperationalIcon, OperationalMetric, formatDateTime, type OperationalIconName } from "./ui";
import { CustodyOperations } from "./operations/CustodyOperations";
import { InventoryOperations } from "./operations/InventoryOperations";
import { MaintenanceOperations } from "./operations/MaintenanceOperations";
import { TrackingOperations } from "./operations/TrackingOperations";
import { LifecycleOperations } from "./operations/LifecycleOperations";
import { DocumentsOperations } from "./operations/DocumentsOperations";
import { IntegrationOperations } from "./operations/IntegrationOperations";
import type { OperationsMutation } from "./operations/shared";

type OperationsTab = "overview" | "inventory" | "custody" | "maintenance" | "tracking" | "lifecycle" | "documents" | "integrations";
const operationsReferenceTime = Date.now();

const tabs: Array<{ id: OperationsTab; label: string; icon: OperationalIconName }> = [
  { id: "overview", label: "Visão geral", icon: "activity" },
  { id: "inventory", label: "Inventário cíclico", icon: "rows" },
  { id: "custody", label: "Custódia", icon: "user" },
  { id: "maintenance", label: "Manutenção", icon: "history" },
  { id: "tracking", label: "Rastreamento", icon: "tag" },
  { id: "lifecycle", label: "Ciclo de vida", icon: "transfer" },
  { id: "documents", label: "Documentos", icon: "file" },
  { id: "integrations", label: "Integrações", icon: "sync" },
];

export function OperationsCenterView({
  dashboard,
  onMutate,
  onToast,
  onRefresh,
}: {
  dashboard: Dashboard;
  onMutate: OperationsMutation;
  onToast: (message: string, isError?: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<OperationsTab>("overview");
  const operations = dashboard.operations;
  const activeCampaigns = operations.inventoryCampaigns.filter((campaign) => campaign.status === "active");
  const pendingTerms = operations.custodyTerms.filter((term) => term.status === "pending");
  const openOrders = operations.maintenanceOrders.filter((order) => order.status === "open" || order.status === "in_progress");
  const criticalOrders = openOrders.filter((order) => order.priority === "critical");
  const latestTrackingByAsset = useMemo(() => {
    const result = new Map<string, string>();
    for (const event of operations.trackingEvents) {
      if (!result.has(event.assetId)) result.set(event.assetId, event.observedAt);
    }
    return result;
  }, [operations.trackingEvents]);
  const trackedAssets = new Set(operations.trackingTags.map((tag) => tag.assetId)).size;
  const staleTrackedAssets = [...new Set(operations.trackingTags.map((tag) => tag.assetId))].filter((assetId) => {
    const lastSeen = latestTrackingByAsset.get(assetId);
    return !lastSeen || operationsReferenceTime - new Date(lastSeen).getTime() > 30 * 24 * 60 * 60 * 1000;
  }).length;

  const operationProps = { dashboard, onMutate, onToast, onRefresh };

  return (
    <section
      className={`view-section operations-view ${dashboard.environment.isAuditor ? "is-auditor-read-only" : ""}`.trim()}
      id="operations-view"
    >
      {dashboard.environment.isAuditor ? (
        <div className="operations-auditor-notice" role="status">
          <strong>Acompanhamento de auditoria</strong>
          <span>Dados operacionais disponíveis para consulta. Controles de alteração foram removidos deste perfil.</span>
        </div>
      ) : null}
      <div className="operational-summary operations-summary" aria-label="Resumo operacional">
        <OperationalMetric icon="rows" label="Campanhas ativas" value={activeCampaigns.length} description="contagens em andamento" tone="blue" />
        <OperationalMetric icon="user" label="Aceites pendentes" value={pendingTerms.length} description="termos de responsabilidade" tone={pendingTerms.length ? "warning" : "success"} />
        <OperationalMetric icon="history" label="Manutenções abertas" value={openOrders.length} description={criticalOrders.length ? `${criticalOrders.length} com prioridade crítica` : "nenhuma prioridade crítica"} tone={criticalOrders.length ? "danger" : "success"} />
        <OperationalMetric icon="tag" label="Ativos rastreados" value={trackedAssets} description={staleTrackedAssets ? `${staleTrackedAssets} sem leitura recente` : "leituras atualizadas"} tone={staleTrackedAssets ? "warning" : "brand"} />
      </div>

      <nav className="operations-tabs" aria-label="Módulos operacionais">
        {tabs.map((item) => (
          <button key={item.id} className={tab === item.id ? "is-active" : ""} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>
            <OperationalIcon name={item.icon} /><span>{item.label}</span>
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <OperationsOverview dashboard={dashboard} onOpen={setTab} />
      ) : null}
      {tab === "inventory" ? <InventoryOperations {...operationProps} /> : null}
      {tab === "custody" ? <CustodyOperations {...operationProps} /> : null}
      {tab === "maintenance" ? <MaintenanceOperations {...operationProps} /> : null}
      {tab === "tracking" ? <TrackingOperations {...operationProps} /> : null}
      {tab === "lifecycle" ? <LifecycleOperations {...operationProps} /> : null}
      {tab === "documents" ? <DocumentsOperations {...operationProps} /> : null}
      {tab === "integrations" ? <IntegrationOperations {...operationProps} /> : null}
    </section>
  );
}

function OperationsOverview({
  dashboard,
  onOpen,
}: {
  dashboard: Dashboard;
  onOpen: (tab: OperationsTab) => void;
}) {
  const { operations } = dashboard;
  const alerts = [
    ...operations.inventoryCampaigns.filter((campaign) => campaign.status === "active" && campaign.issueCount > 0).map((campaign) => ({
      id: `campaign-${campaign.id}`,
      title: `${campaign.issueCount} divergência(s) em ${campaign.name}`,
      detail: `${campaign.checkedCount} de ${campaign.targetCount} ativos conferidos`,
      tab: "inventory" as const,
      tone: "danger" as const,
    })),
    ...operations.maintenanceOrders.filter((order) => (order.status === "open" || order.status === "in_progress") && order.priority === "critical").map((order) => ({
      id: `maintenance-${order.id}`,
      title: `Manutenção crítica · ${order.assetId}`,
      detail: order.title,
      tab: "maintenance" as const,
      tone: "danger" as const,
    })),
    ...operations.custodyTerms.filter((term) => term.status === "pending").slice(0, 6).map((term) => ({
      id: `term-${term.id}`,
      title: `Aceite pendente · ${term.assetId}`,
      detail: `${term.assignee} · emitido ${formatDateTime(term.issuedAt)}`,
      tab: "custody" as const,
      tone: "warning" as const,
    })),
    ...operations.assetContracts.filter((contract) => contract.status === "active" && contract.endsOn && daysUntil(contract.endsOn) <= contract.renewalNoticeDays && daysUntil(contract.endsOn) >= 0).slice(0, 4).map((contract) => ({
      id: `contract-${contract.id}`,
      title: `Contrato próximo do vencimento · ${contract.assetId}`,
      detail: `${contract.name} · vence em ${contract.endsOn}`,
      tab: "documents" as const,
      tone: "warning" as const,
    })),
    ...operations.reconciliationIssues.filter((issue) => issue.status === "open" && ["high", "critical"].includes(issue.severity)).slice(0, 4).map((issue) => ({
      id: `reconciliation-${issue.id}`,
      title: `Conciliação ${issue.severity} · ${issue.source}`,
      detail: `${issue.issueType} · ${issue.entityId}`,
      tab: "integrations" as const,
      tone: "danger" as const,
    })),
  ].slice(0, 12);

  const recentEvents = operations.trackingEvents.slice(0, 8);
  const activeReservationIds = new Set(
    operations.reservations
      .filter((reservation) => ["approved", "checked_out"].includes(reservation.status))
      .map((reservation) => reservation.id),
  );
  const reservedAssetIds = new Set(
    operations.reservationAssets
      .filter((item) => activeReservationIds.has(item.reservationId))
      .map((item) => item.assetId),
  );
  const usedAssetIds = new Set([
    ...dashboard.nucleusInventory.filter((asset) => asset.status === "allocated").map((asset) => asset.id),
    ...reservedAssetIds,
  ]);
  const utilization = dashboard.summary.total
    ? Math.round((usedAssetIds.size / dashboard.summary.total) * 100)
    : 0;
  const expiringContracts = operations.assetContracts.filter((contract) => (
    contract.status === "active"
    && contract.endsOn
    && daysUntil(contract.endsOn) <= contract.renewalNoticeDays
    && daysUntil(contract.endsOn) >= 0
  )).length;
  const highReconciliations = operations.reconciliationIssues.filter((issue) => (
    issue.status === "open" && ["high", "critical"].includes(issue.severity)
  )).length;
  const riskPoints = dashboard.summary.discrepancies * 4
    + operations.maintenanceOrders.filter((order) => order.status !== "completed" && order.status !== "cancelled" && order.priority === "critical").length * 4
    + highReconciliations * 3
    + expiringContracts * 2;
  const documentCoverage = dashboard.summary.total
    ? Math.round((new Set(operations.assetDocuments.map((document) => document.assetId)).size / dashboard.summary.total) * 100)
    : 0;

  return (
    <div className="operation-stack">
      <section className="decision-indicators" aria-label="Indicadores de decisão">
        <button type="button" onClick={() => onOpen("lifecycle")}><span>Utilização</span><strong>{utilization}%</strong><small>{usedAssetIds.size} ativos em uso ou reservados</small></button>
        <button type="button" onClick={() => onOpen("inventory")}><span>Capacidade ociosa</span><strong>{dashboard.summary.available}</strong><small>ativos disponíveis para realocação</small></button>
        <button type="button" className={riskPoints ? "has-risk" : ""} onClick={() => onOpen(highReconciliations ? "integrations" : "maintenance")}><span>Índice de risco</span><strong>{riskPoints}</strong><small>pontos por exceções críticas</small></button>
        <button type="button" onClick={() => onOpen("documents")}><span>Cobertura documental</span><strong>{documentCoverage}%</strong><small>{expiringContracts} renovações próximas</small></button>
      </section>
      <div className="operations-overview-grid">
      <section className="operational-panel operations-attention" aria-labelledby="operations-attention-title">
        <div className="operational-panel-toolbar">
          <div><h2 id="operations-attention-title">Atenção da operação</h2><p>Pendências priorizadas a partir dos registros atuais.</p></div>
          <span className="record-count">{alerts.length} alertas</span>
        </div>
        {alerts.length ? (
          <div className="operations-alert-list">
            {alerts.map((alert) => (
              <button type="button" key={alert.id} onClick={() => onOpen(alert.tab)}>
                <span className={`operations-alert-indicator is-${alert.tone}`} aria-hidden="true" />
                <span><strong>{alert.title}</strong><small>{alert.detail}</small></span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="operations-clear-state"><OperationalIcon name="sync" /><strong>Operação em dia</strong><span>Não há pendências críticas nos módulos ativos.</span></div>
        )}
      </section>

      <section className="operational-panel operations-coverage" aria-labelledby="operations-coverage-title">
        <div className="operational-panel-toolbar">
          <div><h2 id="operations-coverage-title">Cobertura de controle</h2><p>Adoção dos mecanismos avançados no inventário.</p></div>
        </div>
        <CoverageRow label="Identificação oficial" value={dashboard.summary.total - dashboard.summary.untagged} total={dashboard.summary.total} />
        <CoverageRow label="Rastreamento por tag" value={new Set(operations.trackingTags.map((tag) => tag.assetId)).size} total={dashboard.summary.total} />
        <CoverageRow label="Custódia formalizada" value={new Set(operations.custodyTerms.filter((term) => term.status === "accepted").map((term) => term.assetId)).size} total={dashboard.summary.allocated} />
        <CoverageRow label="Inventariado" value={operations.inventoryCampaigns[0]?.checkedCount ?? 0} total={operations.inventoryCampaigns[0]?.targetCount ?? dashboard.summary.total} />
        <CoverageRow label="Com documento" value={new Set(operations.assetDocuments.map((document) => document.assetId)).size} total={dashboard.summary.total} />
      </section>

      <section className="operational-panel operations-recent" aria-labelledby="operations-recent-title">
        <div className="operational-panel-toolbar">
          <div><h2 id="operations-recent-title">Telemetria recente</h2><p>Últimas leituras recebidas de campo.</p></div>
          <button className="button button-secondary button-small" type="button" onClick={() => onOpen("tracking")}>Abrir rastreamento</button>
        </div>
        {recentEvents.length ? (
          <div className="operations-timeline">
            {recentEvents.map((event) => (
              <div key={event.id}><span aria-hidden="true" /><div><strong>{event.assetId} · {event.location}</strong><small>{formatDateTime(event.observedAt)} · {event.technology.toLocaleUpperCase("pt-BR")}</small></div></div>
            ))}
          </div>
        ) : (
          <div className="operations-clear-state compact"><OperationalIcon name="tag" /><strong>Sem telemetria</strong><span>As leituras dos dispositivos aparecerão aqui.</span></div>
        )}
      </section>
      </div>
    </div>
  );
}

function daysUntil(value: string): number {
  return Math.ceil((new Date(`${value}T23:59:59`).getTime() - operationsReferenceTime) / 86_400_000);
}

function CoverageRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="coverage-row">
      <div><span>{label}</span><strong>{percentage}%</strong></div>
      <progress value={value} max={Math.max(1, total)}>{percentage}%</progress>
      <small>{value} de {total}</small>
    </div>
  );
}
