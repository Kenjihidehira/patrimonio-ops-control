"use client";

import { useMemo, useState } from "react";
import type { Dashboard } from "./types";
import {
  AssetIdentifier,
  EmptyState,
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
  const syncLabel = lastSyncAt
    ? `responsáveis distintos · atualizado às ${new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(lastSyncAt)}`
    : "responsáveis distintos nos itens";

  return (
    <section className="view-section" id="collaborators-view">
      <div className="people-summary">
        <article>
          <span>Colaboradores na base</span>
          <strong aria-live="polite">{dashboard.collaborators.length}</strong>
          <small>{syncLabel}</small>
        </article>
        <article>
          <span>Sem patrimônio oficial</span>
          <strong>{withoutPatrimony}</strong>
          <small>possuem apenas itens sem etiqueta</small>
        </article>
      </div>

      <section className="people-panel" aria-labelledby="people-title">
        <div className="section-toolbar people-toolbar">
          <div>
            <h2 id="people-title">Colaboradores por núcleo</h2>
            <p>Responsáveis contabilizados diretamente pelos itens ativos da planilha.</p>
          </div>
          <div className="people-filters">
            <label className="field">
              <span>Buscar colaborador</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome do colaborador"
                autoComplete="off"
              />
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
        </div>

        {filtered.length ? (
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
                      <button
                        className="collaborator-name-button"
                        type="button"
                        onClick={() => onOpenProfile(person.id)}
                      >
                        {person.name}
                      </button>
                    </td>
                    <td>
                      <span className="cell-primary">{person.nucleus.code}</span>
                      <span className="cell-secondary">{person.nucleus.name}</span>
                    </td>
                    <td>
                      <span className="asset-count">{person.assetCount}</span>
                      <span className="cell-secondary">
                        {person.assets.length
                          ? person.assets.map((asset) => (
                            <span key={asset.id}><AssetIdentifier asset={asset} />{" "}</span>
                          ))
                          : "Nenhum item vinculado"}
                      </span>
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
        ) : (
          <EmptyState title="Nenhum colaborador encontrado" description="Revise os filtros informados." />
        )}
      </section>
    </section>
  );
}
