import type { Dashboard } from "./types";
import {
  AssetIdentifier,
  EmptyState,
  formatDateTime,
} from "./ui";

export function AuditView({ dashboard }: { dashboard: Dashboard }) {
  const records = dashboard.audit.slice(0, 40);
  return (
    <section className="view-section" id="audit-view">
      <div className="section-toolbar">
        <div>
          <h2 id="audit-title">Trilha de auditoria</h2>
          <p>Alterações registradas com data, ator, origem, destino e justificativa.</p>
        </div>
        <span className="audit-count">{records.length} {records.length === 1 ? "registro" : "registros"}</span>
      </div>
        {records.length ? (
          <div className="audit-list">
            {records.map((record) => (
              <article className="audit-item" key={record.id}>
                <div>
                  <span className="audit-asset"><AssetIdentifier asset={record} /></span>
                  <small>{record.assetType}</small>
                </div>
                <div>
                  <strong>{record.typeLabel}</strong>
                  <span>{formatDateTime(record.at)}</span>
                </div>
                <div className="audit-flow">
                  <span className="audit-flow-label">De</span>
                  <strong>{record.from}</strong>
                  <span className="audit-flow-label">para</span>
                  <strong>{record.to}</strong>
                </div>
                <div>
                  <span>{record.note || "Sem observação"}</span>
                  <small>{record.actor}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhum evento registrado" description="As movimentações aparecerão aqui." />
        )}
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
  return (
    <section className="view-section" id="imports-view">
      <div className="section-toolbar">
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
            {dashboard.imports.map((run) => (
              <article className="import-run" key={run.id}>
                <div>
                  <strong>{run.fileName}</strong>
                  <span>{formatDateTime(run.createdAt)}</span>
                </div>
                <dl>
                  <div><dt>Linhas</dt><dd>{run.rowCount}</dd></div>
                  <div><dt>Inseridos</dt><dd>{run.inserted}</dd></div>
                  <div><dt>Atualizados</dt><dd>{run.updated}</dd></div>
                  <div><dt>Excluídos</dt><dd>{run.rejected}</dd></div>
                </dl>
                <small>Importado por {run.importedBy}</small>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma importação registrada"
            description="Envie a planilha corporativa para iniciar o inventário."
          />
        )}
    </section>
  );
}
