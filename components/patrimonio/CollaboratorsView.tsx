"use client";

import { useMemo, useState } from "react";
import type { Collaborator, Dashboard } from "./types";
import {
  AssetIdentifier,
  EmptyState,
  OperationalMetric,
  SearchIcon,
  normalizedText,
} from "./ui";

export function CollaboratorsView({
  dashboard,
  lastSyncAt,
  onOpenProfile,
}: {
  dashboard: Dashboard;
  lastSyncAt: Date | null;
  onOpenProfile: (collaboratorId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "with-assets" | "without-assets">("all");
  const [nucleus, setNucleus] = useState("all");

  const filtered = useMemo(() => dashboard.collaborators.filter((person) => {
    if (
      query &&
      !normalizedText(`${person.name} ${person.nucleus.name} ${person.nucleus.code}`)
        .includes(normalizedText(query))
    ) return false;
    if (status === "with-assets" && !person.hasPatrimony) return false;
    if (status === "without-assets" && person.hasPatrimony) return false;
    return nucleus === "all" || person.nucleusId === nucleus;
  }), [dashboard.collaborators, nucleus, query, status]);

  const withoutPatrimony = dashboard.collaborators.filter((person) => !person.hasPatrimony).length;
  const linkedAssets = dashboard.collaborators.reduce((total, person) => total + person.assetCount, 0);
  const syncLabel = lastSyncAt
    ? `atualizado às ${new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(lastSyncAt)}`
    : "responsáveis distintos nos itens";

  return (
    <section className="view-section" id="collaborators-view">
      <div className="operational-summary operational-summary-three" aria-label="Resumo dos colaboradores">
        <OperationalMetric
          icon="people"
          label="Colaboradores na base"
          value={dashboard.collaborators.length}
          description={syncLabel}
        />
        <OperationalMetric
          icon="asset"
          label="Itens vinculados"
          value={linkedAssets}
          description="sob responsabilidade"
          tone="blue"
        />
        <OperationalMetric
          icon="tag"
          label="Sem patrimônio oficial"
          value={withoutPatrimony}
          description="possuem apenas itens sem etiqueta"
          tone={withoutPatrimony ? "warning" : "success"}
        />
      </div>

      <section className="operational-panel people-panel" aria-labelledby="people-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="people-title">Colaboradores por núcleo</h2>
            <p>Responsáveis contabilizados diretamente pelos itens ativos da planilha.</p>
          </div>
          <span className="record-count" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "colaborador" : "colaboradores"}
          </span>
        </div>

        <div className="operational-filters people-filters">
          <label className="field">
            <span>Buscar colaborador</span>
            <span className="search-control">
              <SearchIcon />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome, núcleo ou sigla"
                autoComplete="off"
              />
            </span>
          </label>
          <label className="field">
            <span>Situação patrimonial</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">Todos</option>
              <option value="with-assets">Com patrimônio oficial</option>
              <option value="without-assets">Sem patrimônio oficial</option>
            </select>
          </label>
          <label className="field">
            <span>Núcleo</span>
            <select value={nucleus} onChange={(event) => setNucleus(event.target.value)}>
              <option value="all">Todos os núcleos</option>
              {dashboard.nuclei.map((item) => (
                <option key={item.id} value={item.id}>{item.code} - {item.name}</option>
              ))}
            </select>
          </label>
        </div>

        {filtered.length ? (
          <>
            <div className="table-scroll people-table-wrap">
              <table className="people-table">
                <caption className="sr-only">Colaboradores e patrimônios vinculados</caption>
                <thead>
                  <tr>
                    <th scope="col">Colaborador</th>
                    <th scope="col">Núcleo</th>
                    <th scope="col">Itens vinculados</th>
                    <th scope="col">Situação</th>
                    <th scope="col"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="collaborator-cell">
                          <span className="collaborator-avatar" aria-hidden="true">{initials(person.name)}</span>
                          <button
                            className="collaborator-name-button"
                            type="button"
                            onClick={() => onOpenProfile(person.id)}
                          >
                            {person.name}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span className="nucleus-cell">
                          <strong>{person.nucleus.code}</strong>
                          <span>{person.nucleus.name}</span>
                        </span>
                      </td>
                      <td>
                        <div className="people-assets-cell">
                          <span className="asset-count">{person.assetCount}</span>
                          <span className="asset-identifiers">
                            {person.assets.length
                              ? person.assets.slice(0, 3).map((asset) => (
                                <span key={asset.id}><AssetIdentifier asset={asset} /></span>
                              ))
                              : "Nenhum item vinculado"}
                            {person.assets.length > 3 ? <span>+{person.assets.length - 3}</span> : null}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`people-status ${person.hasPatrimony ? "has-assets" : "without-assets"}`}>
                          {person.hasPatrimony ? "Com patrimônio oficial" : "Sem patrimônio oficial"}
                        </span>
                      </td>
                      <td className="people-action-cell">
                        <button
                          className="button button-secondary button-small"
                          type="button"
                          onClick={() => onOpenProfile(person.id)}
                        >
                          Ver perfil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="people-mobile-list">
              {filtered.map((person) => (
                <CollaboratorCard key={person.id} person={person} onOpen={() => onOpenProfile(person.id)} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="Nenhum colaborador encontrado" description="Revise os filtros informados." />
        )}
      </section>
    </section>
  );
}

function CollaboratorCard({
  person,
  onOpen,
}: {
  person: Collaborator;
  onOpen: () => void;
}) {
  return (
    <article className="people-mobile-card">
      <header>
        <span className="collaborator-avatar" aria-hidden="true">{initials(person.name)}</span>
        <div>
          <strong>{person.name}</strong>
          <span>{person.nucleus.code} · {person.nucleus.name}</span>
        </div>
        <span className="asset-count">{person.assetCount}</span>
      </header>
      <div className="people-mobile-assets">
        <span>Itens vinculados</span>
        <strong>
          {person.assets.length
            ? person.assets.map((asset) => <span key={asset.id}><AssetIdentifier asset={asset} /></span>)
            : "Nenhum item vinculado"}
        </strong>
      </div>
      <footer>
        <span className={`people-status ${person.hasPatrimony ? "has-assets" : "without-assets"}`}>
          {person.hasPatrimony ? "Com patrimônio oficial" : "Sem patrimônio oficial"}
        </span>
        <button className="button button-secondary button-small" type="button" onClick={onOpen}>
          Ver perfil
        </button>
      </footer>
    </article>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("pt-BR"))
    .join("");
}
