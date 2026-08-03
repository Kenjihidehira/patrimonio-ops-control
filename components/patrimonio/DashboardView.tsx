"use client";

import { useMemo } from "react";
import type { AnalyticsSnapshot, Dashboard, ViewId } from "./types";
import { EmptyState, OperationalIcon } from "./ui";

type DashboardViewProps = {
  dashboard: Dashboard;
  lastSyncAt: Date | null;
  onNavigate: (view: ViewId) => void;
  onRefresh: () => void;
};

type AttentionItem = {
  id: string;
  label: string;
  detail: string;
  value: number;
  tone: "warning" | "danger" | "info";
  view: ViewId;
};

const numberFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function DashboardView({
  dashboard,
  lastSyncAt,
  onNavigate,
  onRefresh,
}: DashboardViewProps) {
  const analytics = dashboard.analytics;
  const attentionItems = useMemo(
    () => analytics ? buildAttentionItems(analytics) : [],
    [analytics],
  );

  if (!analytics) {
    return (
      <section className="view-section dashboard-view" id="dashboard-view">
        <EmptyState
          title="Indicadores em processamento"
          description="Atualize a página quando a camada analítica estiver disponível. O inventário permanece acessível pelos demais módulos."
        />
      </section>
    );
  }

  const campaign = analytics.inventory.campaign;
  const untagged = Math.max(0, analytics.assets.total - analytics.dataQuality.identified);

  return (
    <section className="view-section dashboard-view" id="dashboard-view">
      <div className="dashboard-context" aria-label="Contexto dos indicadores">
        <div>
          <span className="dashboard-context-label">Ambiente acompanhado</span>
          <strong>{dashboard.environment.activeDepartment.name}</strong>
          <small>
            Base atualizada {formatSyncTime(lastSyncAt, analytics.generatedAt)} · indicadores calculados sobre registros completos
          </small>
        </div>
        <button className="button button-secondary button-small" type="button" onClick={onRefresh}>
          <OperationalIcon name="sync" /> Atualizar dados
        </button>
      </div>

      <section className="dashboard-kpis" aria-label="Indicadores executivos">
        <KpiButton
          label="Ativos ativos"
          value={numberFormatter.format(analytics.assets.total)}
          detail={`${numberFormatter.format(analytics.assets.available)} disponíveis · ${numberFormatter.format(analytics.assets.retired)} baixados`}
          onClick={() => onNavigate("inventory")}
        />
        <KpiButton
          label="Taxa de alocação"
          value={formatPercent(analytics.assets.allocationRate)}
          detail={`${numberFormatter.format(analytics.assets.allocated)} ativos em uso`}
          onClick={() => onNavigate("inventory")}
        />
        <KpiButton
          label="Divergências"
          value={formatPercent(analytics.assets.discrepancyRate)}
          detail={`${numberFormatter.format(analytics.assets.discrepancies)} exigem conferência`}
          tone={analytics.assets.discrepancies ? "danger" : "success"}
          onClick={() => onNavigate("inventory")}
        />
        <KpiButton
          label="Inventário vigente"
          value={campaign ? formatPercent(campaign.completionRate) : "—"}
          detail={campaign ? `${numberFormatter.format(campaign.checkedCount)} de ${numberFormatter.format(campaign.targetCount)} conferidos` : "Nenhuma campanha cadastrada"}
          tone={campaign?.overdue ? "danger" : campaign ? "neutral" : "warning"}
          onClick={() => onNavigate("operations")}
        />
        <KpiButton
          label="Custódia formalizada"
          value={analytics.custody.coverageRate === null ? "—" : formatPercent(analytics.custody.coverageRate)}
          detail={`${numberFormatter.format(analytics.custody.formalizedAssets)} de ${numberFormatter.format(analytics.custody.allocatedAssets)} alocados`}
          tone={analytics.custody.pendingTerms ? "warning" : "neutral"}
          onClick={() => onNavigate("operations")}
        />
        <KpiButton
          label="Manutenções vencidas"
          value={numberFormatter.format(analytics.maintenance.overdue)}
          detail={`${numberFormatter.format(analytics.maintenance.open)} ordens abertas`}
          tone={analytics.maintenance.overdue ? "danger" : "success"}
          onClick={() => onNavigate("operations")}
        />
      </section>

      <div className="dashboard-grid dashboard-grid-primary">
        <section className="dashboard-panel dashboard-status-panel" aria-labelledby="asset-status-title">
          <PanelHeading
            id="asset-status-title"
            title="Distribuição operacional"
            description="Situação atual dos ativos, sem incluir baixados."
          />
          {analytics.assets.total ? (
            <div className="dashboard-status-bars" role="img" aria-label={statusDistributionLabel(analytics)}>
              <StatusBar label="Em uso" value={analytics.assets.allocated} total={analytics.assets.total} tone="allocated" />
              <StatusBar label="Disponíveis" value={analytics.assets.available} total={analytics.assets.total} tone="available" />
              <StatusBar label="Manutenção" value={analytics.assets.maintenance} total={analytics.assets.total} tone="maintenance" />
              <StatusBar label="Divergências" value={analytics.assets.discrepancies} total={analytics.assets.total} tone="discrepancy" />
            </div>
          ) : (
            <PanelEmpty message="O ambiente ainda não possui ativos cadastrados." />
          )}
        </section>

        <section className="dashboard-panel dashboard-trend-panel" aria-labelledby="movement-trend-title">
          <PanelHeading
            id="movement-trend-title"
            title="Movimentações registradas"
            description="Atividade auditável nos últimos seis meses."
          />
          <MovementTrend data={analytics.movementTrend} />
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="dashboard-panel dashboard-attention-panel" aria-labelledby="attention-title">
          <PanelHeading
            id="attention-title"
            title="Atenção da gestão"
            description="Pendências objetivas, sem nota de risco artificial."
            meta={`${attentionItems.length} frentes`}
          />
          {attentionItems.length ? (
            <div className="dashboard-attention-list">
              {attentionItems.map((item) => (
                <button type="button" key={item.id} onClick={() => onNavigate(item.view)}>
                  <span className={`dashboard-attention-indicator is-${item.tone}`} aria-hidden="true" />
                  <span className="dashboard-attention-copy">
                    <strong>{item.label}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="dashboard-attention-value">{numberFormatter.format(item.value)}</span>
                  <span className="dashboard-attention-arrow" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="dashboard-clear-state">
              <OperationalIcon name="sync" />
              <div><strong>Sem pendências críticas</strong><span>Os controles acompanhados não possuem exceções abertas.</span></div>
            </div>
          )}
        </section>

        <section className="dashboard-panel dashboard-nuclei-panel" aria-labelledby="nuclei-alerts-title">
          <PanelHeading
            id="nuclei-alerts-title"
            title="Pendências por núcleo"
            description="Concentração de alertas e itens sem identificação."
            actionLabel="Ver núcleos"
            onAction={() => onNavigate("nuclei")}
          />
          <NucleiBars nuclei={analytics.nuclei} />
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-tertiary">
        <section className="dashboard-panel dashboard-campaign-panel" aria-labelledby="campaign-title">
          <PanelHeading
            id="campaign-title"
            title="Inventário físico"
            description={campaign ? campaign.name : "Campanhas de conferência patrimonial."}
            actionLabel="Abrir inventário"
            onAction={() => onNavigate("operations")}
          />
          {campaign ? <CampaignSummary campaign={campaign} /> : <PanelEmpty message="Nenhuma campanha de inventário foi cadastrada." />}
        </section>

        <section className="dashboard-panel dashboard-maintenance-panel" aria-labelledby="maintenance-aging-title">
          <PanelHeading
            id="maintenance-aging-title"
            title="Idade do backlog"
            description="Ordens abertas agrupadas pelo tempo desde o registro."
            actionLabel="Ver manutenção"
            onAction={() => onNavigate("operations")}
          />
          <MaintenanceAging maintenance={analytics.maintenance} />
        </section>

        <section className="dashboard-panel dashboard-coverage-panel" aria-labelledby="control-coverage-title">
          <PanelHeading
            id="control-coverage-title"
            title="Cobertura dos controles"
            description="Qualidade mínima para confiar nas decisões."
          />
          <div className="dashboard-coverage-list">
            <CoverageRow label="Identificação oficial" value={analytics.dataQuality.identificationRate} detail={`${analytics.dataQuality.identified} de ${analytics.assets.total}`} />
            <CoverageRow label="Responsável nos ativos alocados" value={analytics.dataQuality.responsibleRate} detail={`${analytics.dataQuality.allocatedWithResponsible} de ${analytics.assets.allocated}`} />
            <CoverageRow label="Localização informada" value={analytics.dataQuality.locationRate} detail={`${analytics.dataQuality.located} de ${analytics.assets.total}`} />
            <CoverageRow label="Rastreamento por tag" value={analytics.dataQuality.trackingRate} detail={`${analytics.dataQuality.tracked} de ${analytics.assets.total}`} />
          </div>
          {untagged ? <p className="dashboard-coverage-note"><strong>{numberFormatter.format(untagged)}</strong> ativos aguardam identificação oficial.</p> : null}
        </section>
      </div>
    </section>
  );
}

function KpiButton({
  label,
  value,
  detail,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  onClick: () => void;
}) {
  return (
    <button className={`dashboard-kpi is-${tone}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}

function PanelHeading({
  id,
  title,
  description,
  meta,
  actionLabel,
  onAction,
}: {
  id: string;
  title: string;
  description: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <header className="dashboard-panel-heading">
      <div><h2 id={id}>{title}</h2><p>{description}</p></div>
      {onAction && actionLabel ? <button type="button" onClick={onAction}>{actionLabel}</button> : meta ? <span>{meta}</span> : null}
    </header>
  );
}

function StatusBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  return (
    <div className={`dashboard-status-row is-${tone}`}>
      <span>{label}</span>
      <progress value={value} max={Math.max(1, total)}>{value} de {total}</progress>
      <strong>{numberFormatter.format(value)}</strong>
    </div>
  );
}

function MovementTrend({ data }: { data: AnalyticsSnapshot["movementTrend"] }) {
  const maximum = Math.max(1, ...data.map((item) => item.count));
  const total = data.reduce((sum, item) => sum + item.count, 0);
  if (!total) return <PanelEmpty message="Nenhuma movimentação foi registrada nos últimos seis meses." />;
  return (
    <div className="dashboard-movement-bars" role="img" aria-label={`Movimentações por mês: ${data.map((item) => `${item.label} ${item.count}`).join(", ")}`}>
      {data.map((item) => (
        <div key={item.key}>
          <span>{item.label}</span>
          <progress value={item.count} max={maximum}>{item.count}</progress>
          <strong>{numberFormatter.format(item.count)}</strong>
        </div>
      ))}
    </div>
  );
}

function NucleiBars({ nuclei }: { nuclei: AnalyticsSnapshot["nuclei"] }) {
  const relevant = nuclei.filter((item) => item.alerts || item.untagged).slice(0, 6);
  const maximum = Math.max(1, ...relevant.map((item) => item.alerts + item.untagged));
  if (!relevant.length) return <PanelEmpty message="Nenhum núcleo concentra alertas ou itens sem identificação." />;
  return (
    <div className="dashboard-horizontal-bars">
      {relevant.map((item) => (
        <div className="dashboard-horizontal-row" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.alerts} alertas · {item.untagged} sem identificação</small></div>
          <progress aria-label={`${item.name}: ${item.alerts} alertas e ${item.untagged} sem identificação`} value={item.alerts + item.untagged} max={maximum}>{item.alerts + item.untagged}</progress>
          <strong>{numberFormatter.format(item.alerts + item.untagged)}</strong>
        </div>
      ))}
    </div>
  );
}

function CampaignSummary({ campaign }: { campaign: NonNullable<AnalyticsSnapshot["inventory"]["campaign"]> }) {
  const resultEntries = [
    ["Confirmados", campaign.results.confirmed, "confirmed"],
    ["Não localizados", campaign.results.missing, "missing"],
    ["Local incorreto", campaign.results.wrongLocation, "location"],
    ["Avariados", campaign.results.damaged, "damaged"],
  ] as const;
  const resultTotal = Object.values(campaign.results).reduce((sum, value) => sum + value, 0);
  return (
    <div className="dashboard-campaign-summary">
      <div className="dashboard-progress-heading">
        <div><strong>{formatPercent(campaign.completionRate)}</strong><span>{campaign.checkedCount} de {campaign.targetCount} conferidos</span></div>
        <span className={campaign.overdue ? "is-overdue" : ""}>{campaign.overdue ? "Prazo vencido" : campaign.dueAt ? `Prazo ${formatDate(campaign.dueAt)}` : "Sem prazo definido"}</span>
      </div>
      <progress value={campaign.checkedCount} max={Math.max(1, campaign.targetCount)}>{formatPercent(campaign.completionRate)}</progress>
      {resultTotal ? (
        <dl className="dashboard-campaign-results">
          {resultEntries.map(([label, value, tone]) => (
            <div key={label}><dt><i className={`is-${tone}`} />{label}</dt><dd>{numberFormatter.format(value)}</dd></div>
          ))}
        </dl>
      ) : (
        <p className="dashboard-inline-empty">O detalhamento das conferências ainda não está disponível para esta campanha.</p>
      )}
    </div>
  );
}

function MaintenanceAging({ maintenance }: { maintenance: AnalyticsSnapshot["maintenance"] }) {
  const buckets = [
    ["Até 7 dias", maintenance.ageBuckets.upTo7],
    ["8–30 dias", maintenance.ageBuckets.from8To30],
    ["31–60 dias", maintenance.ageBuckets.from31To60],
    ["Mais de 60 dias", maintenance.ageBuckets.over60],
  ] as const;
  const maximum = Math.max(1, ...buckets.map(([, value]) => value));
  if (!maintenance.open) return <PanelEmpty message="Nenhuma ordem de manutenção está aberta." />;
  return (
    <div className="dashboard-aging-chart">
      {buckets.map(([label, value], index) => (
        <div key={label}>
          <span>{label}</span>
          <progress className={index >= 2 ? "is-critical" : ""} value={value} max={maximum}>{value}</progress>
          <strong>{numberFormatter.format(value)}</strong>
        </div>
      ))}
      <p>{maintenance.corrective} corretivas · {maintenance.preventive} preventivas · {maintenance.inspections} inspeções</p>
    </div>
  );
}

function CoverageRow({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  const normalized = value === null ? 0 : clampPercentage(value);
  return (
    <div className="dashboard-coverage-row">
      <div><strong>{label}</strong><span>{value === null ? "Sem base aplicável" : `${formatPercent(value)} · ${detail}`}</span></div>
      <progress aria-label={label} value={normalized} max={100}>{normalized}%</progress>
    </div>
  );
}

function PanelEmpty({ message }: { message: string }) {
  return <p className="dashboard-inline-empty">{message}</p>;
}

function buildAttentionItems(analytics: AnalyticsSnapshot): AttentionItem[] {
  const campaign = analytics.inventory.campaign;
  const untagged = Math.max(0, analytics.assets.total - analytics.dataQuality.identified);
  const items: AttentionItem[] = [];
  if (analytics.assets.discrepancies) items.push({ id: "discrepancies", label: "Divergências patrimoniais", detail: "Ativos aguardando conferência operacional", value: analytics.assets.discrepancies, tone: "danger", view: "inventory" });
  if (analytics.maintenance.overdue) items.push({ id: "maintenance-overdue", label: "Manutenções fora do prazo", detail: "Ordens abertas após o vencimento", value: analytics.maintenance.overdue, tone: "danger", view: "operations" });
  if (analytics.maintenance.critical) items.push({ id: "maintenance-critical", label: "Manutenções críticas", detail: "Prioridade crítica ainda em aberto", value: analytics.maintenance.critical, tone: "danger", view: "operations" });
  if (campaign?.overdue) items.push({ id: "campaign-overdue", label: "Campanha de inventário vencida", detail: campaign.name, value: Math.max(0, campaign.targetCount - campaign.checkedCount), tone: "warning", view: "operations" });
  if (analytics.custody.pendingTerms) items.push({ id: "custody-pending", label: "Termos de custódia pendentes", detail: "Aceite do responsável ainda não registrado", value: analytics.custody.pendingTerms, tone: "warning", view: "operations" });
  if (untagged) items.push({ id: "untagged", label: "Ativos sem identificação oficial", detail: "Itens físicos aguardando regularização", value: untagged, tone: "warning", view: "inventory" });
  return items.slice(0, 6);
}

function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatSyncTime(lastSyncAt: Date | null, generatedAt: string): string {
  const date = lastSyncAt ?? new Date(generatedAt);
  return Number.isNaN(date.getTime()) ? "agora" : dateTimeFormatter.format(date);
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function statusDistributionLabel(analytics: AnalyticsSnapshot): string {
  return [
    `${analytics.assets.allocated} em uso`,
    `${analytics.assets.available} disponíveis`,
    `${analytics.assets.maintenance} em manutenção`,
    `${analytics.assets.discrepancies} com divergência`,
  ].join(", ");
}
