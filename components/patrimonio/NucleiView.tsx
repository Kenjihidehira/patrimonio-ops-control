"use client";

import { useMemo, useState } from "react";
import type { Dashboard } from "./types";
import {
  EditIcon,
  EmptyState,
  NucleusIcon,
  OperationalMetric,
  SearchIcon,
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
  const [healthFilter, setHealthFilter] = useState<"all" | "alerts">("all");
  const filtered = useMemo(() => {
    const normalizedQuery = normalizedText(query);
    return dashboard.nuclei.filter((nucleus) => {
      const matchesQuery = normalizedText(
        `${nucleus.code} ${nucleus.name} ${nucleus.location} ${nucleus.manager}`,
      ).includes(normalizedQuery);
      const matchesHealth = healthFilter === "all" || nucleus.alerts > 0;
      return matchesQuery && matchesHealth;
    });
  }, [dashboard.nuclei, healthFilter, query]);
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
          disabled={!dashboard.environment.permissions.canWrite}
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

      <section className="nuclei-directory operational-panel" aria-labelledby="nuclei-directory-title">
        <div className="nuclei-list-toolbar">
          <div>
            <h2 id="nuclei-directory-title">Áreas cadastradas</h2>
            <p aria-live="polite">
              {filtered.length} {filtered.length === 1 ? "núcleo encontrado" : "núcleos encontrados"}
            </p>
          </div>
          <div className="nuclei-directory-controls">
            <label className="field nuclei-search">
              <span className="sr-only">Buscar núcleo</span>
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
            <div className="nuclei-health-filter" role="group" aria-label="Filtrar núcleos por situação">
              <button
                type="button"
                className={healthFilter === "all" ? "is-active" : ""}
                aria-pressed={healthFilter === "all"}
                onClick={() => setHealthFilter("all")}
              >
                Todos
              </button>
              <button
                type="button"
                className={healthFilter === "alerts" ? "is-active" : ""}
                aria-pressed={healthFilter === "alerts"}
                onClick={() => setHealthFilter("alerts")}
              >
                Com alertas
              </button>
            </div>
          </div>
        </div>

        {filtered.length ? (
          <>
            <div className="nuclei-table-shell">
              <table className="nuclei-table">
                <caption className="sr-only">Núcleos cadastrados e situação do inventário</caption>
                <thead>
                  <tr>
                    <th scope="col">Núcleo</th>
                    <th scope="col">Localização</th>
                    <th scope="col">Gestor responsável</th>
                    <th scope="col" className="numeric-cell">Ativos</th>
                    <th scope="col" className="numeric-cell">Em uso</th>
                    <th scope="col">Alocação</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="actions-cell">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((nucleus) => {
                    const allocation = allocationOf(nucleus.allocated, nucleus.total);
                    return (
                      <tr key={nucleus.id}>
                        <th scope="row">
                          <span className="nucleus-table-identity">
                            <span className="nucleus-code" title={nucleus.code}><NucleusIcon name={nucleus.name} /></span>
                            <strong>{nucleus.name}</strong>
                          </span>
                        </th>
                        <td className="nucleus-location">{nucleus.location}</td>
                        <td>{nucleus.manager}</td>
                        <td className="numeric-cell">{nucleus.total}</td>
                        <td className="numeric-cell">{nucleus.allocated}</td>
                        <td>
                          <div className="nucleus-table-allocation">
                            <strong>{allocation}%</strong>
                            <progress
                              className="nucleus-progress"
                              aria-label={`Taxa de alocação de ${nucleus.name}`}
                              max={100}
                              value={allocation}
                            />
                          </div>
                        </td>
                        <td><NucleusHealth alerts={nucleus.alerts} /></td>
                        <td className="actions-cell">
                          <div className="nucleus-row-actions">
                            <button
                              className="nucleus-inventory-link"
                              type="button"
                              onClick={() => onOpenInventory(nucleus.id)}
                            >
                              Ver inventário
                            </button>
                            <button
                              className="icon-button nucleus-edit"
                              type="button"
                              aria-label={`Editar núcleo ${nucleus.name}`}
                              title="Editar núcleo"
                              disabled={!dashboard.environment.permissions.canWrite}
                              onClick={() => onEdit(nucleus.id)}
                            >
                              <EditIcon />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="nuclei-mobile-list">
              {filtered.map((nucleus) => {
                const allocation = allocationOf(nucleus.allocated, nucleus.total);
                return (
                  <article key={nucleus.id} className="nucleus-mobile-card">
                    <div className="nucleus-mobile-heading">
                      <span className="nucleus-code" title={nucleus.code}><NucleusIcon name={nucleus.name} /></span>
                      <h3>{nucleus.name}</h3>
                      <NucleusHealth alerts={nucleus.alerts} />
                      <button
                        className="icon-button nucleus-edit"
                        type="button"
                        aria-label={`Editar núcleo ${nucleus.name}`}
                        title="Editar núcleo"
                        disabled={!dashboard.environment.permissions.canWrite}
                        onClick={() => onEdit(nucleus.id)}
                      >
                        <EditIcon />
                      </button>
                    </div>
                    <p className="nucleus-mobile-context">
                      <span>{nucleus.location}</span>
                      <span>{nucleus.manager}</span>
                    </p>
                    <div className="nucleus-mobile-metrics">
                      <div><strong>{nucleus.total}</strong><span>Ativos</span></div>
                      <div><strong>{nucleus.allocated}</strong><span>Em uso</span></div>
                      <div><strong>{allocation}%</strong><span>Alocação</span></div>
                    </div>
                    <progress
                      className="nucleus-progress"
                      aria-label={`Taxa de alocação de ${nucleus.name}`}
                      max={100}
                      value={allocation}
                    />
                    <button
                      className="nucleus-inventory-link nucleus-mobile-inventory"
                      type="button"
                      onClick={() => onOpenInventory(nucleus.id)}
                    >
                      Ver inventário <span aria-hidden="true">→</span>
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <EmptyState
            title="Nenhum núcleo encontrado"
            description={healthFilter === "alerts"
              ? "Não há núcleos com alertas para os critérios informados."
              : "Revise o termo informado na busca."}
          />
        )}
      </section>
    </section>
  );
}

function allocationOf(allocated: number, total: number): number {
  return total ? Math.min(100, Math.round((allocated / total) * 100)) : 0;
}

function NucleusHealth({ alerts }: { alerts: number }) {
  return (
    <span className={`nucleus-health ${alerts ? "has-alerts" : ""}`}>
      {alerts ? `${alerts} ${alerts === 1 ? "alerta" : "alertas"}` : "Sem alertas"}
    </span>
  );
}
