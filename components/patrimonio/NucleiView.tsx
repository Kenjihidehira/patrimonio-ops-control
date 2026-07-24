"use client";

import { useMemo, useState } from "react";
import type { Dashboard } from "./types";
import {
  AssetTypeIcon,
  EditIcon,
  EmptyState,
  OperationalMetric,
  SearchIcon,
  allocationStyle,
  normalizedText,
} from "./ui";

export function NucleiView({
  dashboard,
  onCreate,
  onEdit,
  onOpenInventory,
}: {
  dashboard: Dashboard;
  onCreate: () => void;
  onEdit: (nucleusId: string) => void;
  onOpenInventory: (nucleusId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => dashboard.nuclei.filter((nucleus) => (
    normalizedText(`${nucleus.code} ${nucleus.name} ${nucleus.location} ${nucleus.manager}`)
      .includes(normalizedText(query))
  )), [dashboard.nuclei, query]);
  const totalAssets = dashboard.nuclei.reduce((sum, nucleus) => sum + nucleus.total, 0);
  const allocated = dashboard.nuclei.reduce((sum, nucleus) => sum + nucleus.allocated, 0);
  const withAlerts = dashboard.nuclei.filter((nucleus) => nucleus.alerts > 0).length;

  return (
    <section className="view-section" id="nuclei-view">
      <div className="section-toolbar">
        <div>
          <h2>Núcleos da empresa</h2>
          <p>Responsabilidade operacional, localização e concentração de ativos.</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={onCreate}
          disabled={!dashboard.session.authenticated}
        >
          <span aria-hidden="true">+</span> Novo núcleo
        </button>
      </div>

      <div className="nuclei-overview" aria-label="Resumo dos núcleos">
        <OperationalMetric
          icon="building"
          label="Núcleos"
          value={dashboard.nuclei.length}
          description="áreas cadastradas"
        />
        <OperationalMetric
          icon="asset"
          label="Ativos"
          value={totalAssets}
          description="itens distribuídos"
          tone="blue"
        />
        <OperationalMetric
          icon="user"
          label="Em uso"
          value={allocated}
          description="alocados aos núcleos"
          tone="success"
        />
        <OperationalMetric
          icon="alert"
          label="Com alertas"
          value={withAlerts}
          description="exigem conferência"
          tone="danger"
        />
      </div>

      <div className="nuclei-list-toolbar">
        <div>
          <h2>Áreas cadastradas</h2>
          <p>{filtered.length} {filtered.length === 1 ? "núcleo encontrado" : "núcleos encontrados"}</p>
        </div>
        <label className="field nuclei-search">
          <span>Buscar núcleo</span>
          <span className="search-control">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, sigla, gestor ou local"
              autoComplete="off"
            />
          </span>
        </label>
      </div>

      {filtered.length ? (
        <div className="nuclei-grid">
          {filtered.map((nucleus) => {
            const allocation = nucleus.total
              ? Math.min(100, Math.round((nucleus.allocated / nucleus.total) * 100))
              : 0;
            return (
              <article key={nucleus.id} className={`nucleus-card ${nucleus.alerts ? "has-alerts" : ""}`}>
                <div className="nucleus-card-header">
                  <div className="nucleus-identity">
                    <span className="nucleus-code">{nucleus.code}</span>
                    <span className={`nucleus-health ${nucleus.alerts ? "has-alerts" : ""}`}>
                      {nucleus.alerts
                        ? `${nucleus.alerts} ${nucleus.alerts === 1 ? "alerta" : "alertas"}`
                        : "Sem alertas"}
                    </span>
                  </div>
                  <button
                    className="icon-button nucleus-edit"
                    type="button"
                    aria-label={`Editar núcleo ${nucleus.name}`}
                    title="Editar núcleo"
                    disabled={!dashboard.session.authenticated}
                    onClick={() => onEdit(nucleus.id)}
                  >
                    <EditIcon />
                  </button>
                </div>
                <h3>{nucleus.name}</h3>
                <div className="nucleus-meta">
                  <div><span>Localização</span><strong>{nucleus.location}</strong></div>
                  <div><span>Gestor responsável</span><strong>{nucleus.manager}</strong></div>
                </div>
                <div className="nucleus-allocation">
                  <div><span>Taxa de alocação</span><strong>{allocation}%</strong></div>
                  <div
                    className="nucleus-progress"
                    role="progressbar"
                    aria-label={`Taxa de alocação de ${nucleus.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={allocation}
                  >
                    <span style={allocationStyle(allocation)} />
                  </div>
                </div>
                <div className="nucleus-metrics">
                  <div><span>Ativos</span><strong>{nucleus.total}</strong></div>
                  <div><span>Em uso</span><strong>{nucleus.allocated}</strong></div>
                  <div><span>Alertas</span><strong>{nucleus.alerts}</strong></div>
                </div>
                <button
                  className="button button-secondary nucleus-inventory-button"
                  type="button"
                  onClick={() => onOpenInventory(nucleus.id)}
                >
                  <span className="nucleus-inventory-button-icon" aria-hidden="true">
                    <AssetTypeIcon type="cpu" />
                  </span>
                  Ver inventário
                  <span aria-hidden="true">→</span>
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Nenhum núcleo encontrado" description="Revise o termo informado na busca." />
      )}
    </section>
  );
}
