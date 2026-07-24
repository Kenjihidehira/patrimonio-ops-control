"use client";

import { useMemo, useState } from "react";
import type { Dashboard } from "./types";
import {
  AssetIdentifier,
  EmptyState,
  OperationalIcon,
  OperationalMetric,
  SearchIcon,
  formatDateTime,
  normalizedText,
  type OperationalIconName,
} from "./ui";

export function AuditView({ dashboard }: { dashboard: Dashboard }) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const records = useMemo(() => dashboard.audit.slice(0, 40), [dashboard.audit]);
  const eventTypes = useMemo(
    () => [...new Set(records.map((record) => record.typeLabel))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [records],
  );
  const filtered = useMemo(() => records.filter((record) => {
    if (eventType !== "all" && record.typeLabel !== eventType) return false;
    if (!query) return true;
    return normalizedText(
      `${record.assetId} ${record.assetType} ${record.typeLabel} ${record.from} ${record.to} ${record.note} ${record.actor}`,
    ).includes(normalizedText(query));
  }), [eventType, query, records]);
  const distinctAssets = new Set(records.map((record) => record.assetId)).size;
  const latestEvent = records[0]?.at;

  return (
    <section className="view-section" id="audit-view">
      <div className="operational-summary operational-summary-three" aria-label="Resumo da auditoria">
        <OperationalMetric
          icon="history"
          label="Eventos registrados"
          value={records.length}
          description="últimas movimentações"
        />
        <OperationalMetric
          icon="asset"
          label="Ativos auditados"
          value={distinctAssets}
          description="patrimônios com histórico"
          tone="blue"
        />
        <OperationalMetric
          icon="activity"
          label="Último evento"
          value={latestEvent ? formatDateTime(latestEvent) : "Sem eventos"}
          description="registro mais recente"
          tone="success"
          compactValue
        />
      </div>

      <section className="operational-panel audit-panel" aria-labelledby="audit-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="audit-title">Trilha de auditoria</h2>
            <p>Alterações registradas com data, ator, origem, destino e justificativa.</p>
          </div>
          <span className="record-count" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "registro" : "registros"}
          </span>
        </div>

        <div className="operational-filters audit-filters">
          <label className="field">
            <span>Buscar no histórico</span>
            <span className="search-control">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Patrimônio, responsável, local ou observação"
                autoComplete="off"
              />
            </span>
          </label>
          <label className="field">
            <span>Tipo de evento</span>
            <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
              <option value="all">Todos os eventos</option>
              {eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
        </div>

        {filtered.length ? (
          <div className="audit-list">
            {filtered.map((record) => (
              <article className="audit-item" key={record.id}>
                <div className="audit-item-icon">
                  <OperationalIcon name={auditEventIcon(record.type)} />
                </div>
                <div className="audit-item-asset">
                  <span className="audit-event-label">{record.typeLabel}</span>
                  <strong className="audit-asset"><AssetIdentifier asset={record} /></strong>
                  <small>{record.assetType}</small>
                </div>
                <div className="audit-item-time">
                  <span>Data e hora</span>
                  <strong>{formatDateTime(record.at)}</strong>
                </div>
                <div className="audit-flow">
                  <span className="audit-flow-point">
                    <small>Origem</small>
                    <strong>{record.from}</strong>
                  </span>
                  <span className="audit-flow-arrow" aria-hidden="true">→</span>
                  <span className="audit-flow-point">
                    <small>Destino</small>
                    <strong>{record.to}</strong>
                  </span>
                </div>
                <div className="audit-note">
                  <span>{record.note || "Sem observação"}</span>
                  <small>Registrado por <strong>{record.actor}</strong></small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title={records.length ? "Nenhum evento encontrado" : "Nenhum evento registrado"}
            description={records.length ? "Revise os filtros informados." : "As movimentações aparecerão aqui."}
          />
        )}
      </section>
    </section>
  );
}

export function ImportsView({
  dashboard,
  onImport,
}: {
  dashboard: Dashboard;
  onImport: () => void;
}) {
  const totals = dashboard.imports.reduce((result, run) => ({
    rows: result.rows + run.rowCount,
    reconciled: result.reconciled + run.inserted + run.updated,
    rejected: result.rejected + run.rejected,
  }), { rows: 0, reconciled: 0, rejected: 0 });

  return (
    <section className="view-section" id="imports-view">
      <div className="operational-summary" aria-label="Resumo das importações">
        <OperationalMetric
          icon="file"
          label="Importações"
          value={dashboard.imports.length}
          description="cargas registradas"
        />
        <OperationalMetric
          icon="rows"
          label="Linhas processadas"
          value={totals.rows}
          description="somadas no histórico"
          tone="blue"
        />
        <OperationalMetric
          icon="sync"
          label="Conciliados"
          value={totals.reconciled}
          description="inseridos ou atualizados"
          tone="success"
        />
        <OperationalMetric
          icon="alert"
          label="Rejeitados"
          value={totals.rejected}
          description="exigem correção na origem"
          tone={totals.rejected ? "danger" : "success"}
        />
      </div>

      <section className="operational-panel imports-panel" aria-labelledby="imports-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="imports-title">Histórico de importações</h2>
            <p>Cargas XLSX processadas com resultado e rastreabilidade.</p>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={!dashboard.session.authenticated}
            onClick={onImport}
          >
            <span aria-hidden="true">↑</span> Importar planilha
          </button>
        </div>

        {dashboard.imports.length ? (
          <div className="import-history">
            {dashboard.imports.map((run) => {
              const warnings = run.warnings.length + run.rejected;
              return (
                <article className="import-run" key={run.id}>
                  <div className="import-run-main">
                    <div className="import-file-icon"><OperationalIcon name="file" /></div>
                    <div>
                      <strong>{run.fileName}</strong>
                      <span>{formatDateTime(run.createdAt)}</span>
                    </div>
                    <span className={`import-result ${warnings ? "has-warning" : "is-success"}`}>
                      {warnings ? `${warnings} ${warnings === 1 ? "alerta" : "alertas"}` : "Concluída"}
                    </span>
                  </div>
                  <dl className="import-run-metrics">
                    <div><dt>Linhas</dt><dd>{run.rowCount}</dd></div>
                    <div><dt>Inseridos</dt><dd>{run.inserted}</dd></div>
                    <div><dt>Atualizados</dt><dd>{run.updated}</dd></div>
                    <div className={run.rejected ? "metric-rejected" : ""}><dt>Rejeitados</dt><dd>{run.rejected}</dd></div>
                  </dl>
                  <footer className="import-run-footer">
                    <span className="import-user-avatar" aria-hidden="true">
                      {initials(run.importedBy)}
                    </span>
                    <span>Importado por <strong>{run.importedBy}</strong></span>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma importação registrada"
            description="Envie a planilha corporativa para iniciar o inventário."
          />
        )}
      </section>
    </section>
  );
}

function auditEventIcon(type: Dashboard["audit"][number]["type"]): OperationalIconName {
  if (type === "transfer") return "transfer";
  if (type === "registration" || type === "import") return "file";
  if (type === "status_change") return "activity";
  if (type === "identifier_change") return "tag";
  return "history";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("");
}
