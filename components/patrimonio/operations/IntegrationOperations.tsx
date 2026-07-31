"use client";

import { type FormEvent, useState } from "react";
import { EmptyState, formValue, formatDateTime } from "../ui";
import {
  FormActions,
  InlineError,
  StatusPill,
  type OperationProps,
  useOperationMutation,
} from "./shared";

type IntegrationPane = "connectors" | "reconciliation";

const providerLabels = {
  hr: "Recursos Humanos",
  erp: "ERP",
  mdm: "MDM",
  service_desk: "Service Desk",
  iot: "IoT e leitores",
  directory: "Diretório corporativo",
  custom: "Personalizada",
} as const;
const directionLabels = { inbound: "Entrada", outbound: "Saída", bidirectional: "Bidirecional" } as const;
const severityLabels = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" } as const;

export function IntegrationOperations(props: OperationProps) {
  const [pane, setPane] = useState<IntegrationPane>("connectors");
  const openIssues = props.dashboard.operations.reconciliationIssues.filter((issue) => issue.status === "open").length;
  return (
    <div className="operation-stack">
      <nav className="operation-subtabs" aria-label="Integrações e conciliação">
        <button type="button" className={pane === "connectors" ? "is-active" : ""} onClick={() => setPane("connectors")}><span>Conectores</span><strong>{props.dashboard.operations.integrations.length}</strong></button>
        <button type="button" className={pane === "reconciliation" ? "is-active" : ""} onClick={() => setPane("reconciliation")}><span>Conciliação</span><strong>{openIssues}</strong></button>
      </nav>
      {pane === "connectors" ? <Connectors {...props} /> : <Reconciliation {...props} />}
    </div>
  );
}

function Connectors({ dashboard, onMutate }: OperationProps) {
  const { busyKey, error, setError, run } = useOperationMutation(onMutate);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    void run("create-integration", {
      type: "create_integration",
      integration: {
        id: crypto.randomUUID(),
        name: formValue(form, "name"),
        provider: formValue(form, "provider"),
        direction: formValue(form, "direction"),
        configuration: {
          endpointLabel: formValue(form, "endpointLabel"),
          schedule: formValue(form, "schedule"),
        },
      },
    }, () => form.reset());
  }

  function recordEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    let payload: Record<string, unknown> = {};
    try {
      const raw = formValue(form, "payload");
      payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error();
    } catch {
      setError("O payload precisa ser um objeto JSON válido.");
      return;
    }
    void run("record-event", {
      type: "record_integration_event",
      event: {
        id: crypto.randomUUID(),
        integrationId: formValue(form, "integrationId"),
        externalId: formValue(form, "externalId"),
        eventType: formValue(form, "eventType"),
        entityType: formValue(form, "entityType"),
        entityId: formValue(form, "entityId"),
        payload,
      },
    }, () => form.reset());
  }

  if (!dashboard.environment.isAdmin) {
    return <section className="operational-panel"><div className="operations-clear-state"><strong>Acesso administrativo</strong><span>Conectores e eventos técnicos são visíveis somente para administradores.</span></div></section>;
  }

  return (
    <div className="tracking-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="integration-create-title">
        <div className="operational-panel-toolbar"><div><h2 id="integration-create-title">Cadastrar conector</h2><p>Metadados operacionais sem senhas, tokens ou chaves no banco.</p></div></div>
        <form className="form-grid operation-form" onSubmit={create}>
          <label className="field field-wide"><span>Nome</span><input name="name" minLength={2} maxLength={120} required placeholder="Sincronização de colaboradores" /></label>
          <label className="field"><span>Provedor</span><select name="provider" defaultValue="hr">{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Direção</span><select name="direction" defaultValue="inbound">{Object.entries(directionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field field-wide"><span>Identificação do endpoint</span><input name="endpointLabel" maxLength={180} placeholder="Webhook RH · produção" /></label>
          <label className="field field-wide"><span>Agendamento</span><input name="schedule" maxLength={120} placeholder="Diário às 02:00" /></label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "create-integration"} submitLabel="Cadastrar conector" />
        </form>
      </section>

      <section className="operational-panel operation-form-panel" aria-labelledby="event-create-title">
        <div className="operational-panel-toolbar"><div><h2 id="event-create-title">Registrar evento</h2><p>Teste o contrato de ingestão idempotente do gateway.</p></div></div>
        <form className="form-grid operation-form" onSubmit={recordEvent}>
          <label className="field field-wide"><span>Conector</span><select name="integrationId" defaultValue="" required><option value="">Selecione</option>{dashboard.operations.integrations.map((integration) => <option key={integration.id} value={integration.id}>{integration.name}</option>)}</select></label>
          <label className="field"><span>ID externo</span><input name="externalId" required maxLength={180} /></label>
          <label className="field"><span>Tipo de evento</span><input name="eventType" required maxLength={120} placeholder="employee.terminated" /></label>
          <label className="field"><span>Entidade</span><input name="entityType" maxLength={60} placeholder="employee" /></label>
          <label className="field"><span>ID da entidade</span><input name="entityId" maxLength={180} /></label>
          <label className="field field-wide"><span>Payload JSON</span><textarea name="payload" rows={3} defaultValue="{}" /></label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "record-event"} submitLabel="Registrar evento" />
        </form>
      </section>

      <section className="operational-panel tracking-history-panel" aria-labelledby="connector-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="connector-list-title">Conectores ativos</h2><p>Estado e última sincronização, sem material secreto.</p></div><span className="record-count">{dashboard.operations.integrations.length} conectores</span></div>
        {dashboard.operations.integrations.length ? <div className="tracking-tag-grid">{dashboard.operations.integrations.map((integration) => <article className="tracking-tag-card" key={integration.id}><StatusPill label={integration.status === "active" ? "Ativo" : integration.status === "paused" ? "Pausado" : "Erro"} tone={integration.status === "active" ? "success" : integration.status === "error" ? "danger" : "neutral"} /><strong>{integration.name}</strong><span>{providerLabels[integration.provider]} · {directionLabels[integration.direction]}</span><small>{integration.lastSyncAt ? `Última sincronização ${formatDateTime(integration.lastSyncAt)}` : "Ainda não sincronizado"}</small></article>)}</div> : <EmptyState title="Nenhum conector" description="Cadastre uma integração de RH, ERP, MDM, chamados ou IoT." />}
      </section>

      <section className="operational-panel tracking-history-panel" aria-labelledby="event-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="event-list-title">Eventos de integração</h2><p>Histórico idempotente das mensagens processadas.</p></div><span className="record-count">{dashboard.operations.integrationEvents.length} eventos</span></div>
        {dashboard.operations.integrationEvents.length ? <div className="operation-record-list">{dashboard.operations.integrationEvents.map((item) => <article className="operation-record" key={item.id}><div className="operation-record-main"><strong>{item.eventType}</strong><span>{item.entityType || "Evento"} · {item.entityId || item.externalId}</span><small>{formatDateTime(item.receivedAt)} · tentativa {item.attempts}</small></div><StatusPill label={item.status === "processed" ? "Processado" : item.status === "failed" ? "Falhou" : item.status === "ignored" ? "Ignorado" : "Pendente"} tone={item.status === "processed" ? "success" : item.status === "failed" ? "danger" : "neutral"} /></article>)}</div> : <EmptyState title="Nenhum evento recebido" description="Os eventos processados aparecerão aqui." />}
      </section>
    </div>
  );
}

function Reconciliation({ dashboard, onMutate }: OperationProps) {
  const { busyKey, error, setError, run } = useOperationMutation(onMutate);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    let details: Record<string, unknown> = {};
    try {
      const raw = formValue(form, "details");
      details = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      if (!details || Array.isArray(details) || typeof details !== "object") throw new Error();
    } catch {
      setError("Os detalhes precisam formar um objeto JSON válido.");
      return;
    }
    void run("create-issue", {
      type: "create_reconciliation_issue",
      issue: {
        id: crypto.randomUUID(), integrationId: formValue(form, "integrationId"),
        source: formValue(form, "source"), externalRef: formValue(form, "externalRef"),
        entityType: formValue(form, "entityType"), entityId: formValue(form, "entityId"),
        issueType: formValue(form, "issueType"), severity: formValue(form, "severity"),
        assignedTo: formValue(form, "assignedTo"), details,
      },
    }, () => form.reset());
  }

  function resolve(issueId: string, status: "resolved" | "ignored") {
    void run(issueId, { type: "resolve_reconciliation_issue", issueId, status, note: status === "resolved" ? "Divergência conciliada pela operação." : "Divergência avaliada e ignorada." });
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="reconciliation-create-title">
        <div className="operational-panel-toolbar"><div><h2 id="reconciliation-create-title">Registrar divergência</h2><p>Centralize diferenças encontradas entre patrimônio e sistemas externos.</p></div></div>
        <form className="form-grid operation-form" onSubmit={create}>
          <label className="field field-wide"><span>Integração</span><select name="integrationId" defaultValue=""><option value="">Sem conector</option>{dashboard.operations.integrations.map((integration) => <option key={integration.id} value={integration.id}>{integration.name}</option>)}</select></label>
          <label className="field"><span>Fonte</span><input name="source" required maxLength={120} placeholder="ERP" /></label>
          <label className="field"><span>Referência externa</span><input name="externalRef" maxLength={180} /></label>
          <label className="field"><span>Entidade</span><input name="entityType" required maxLength={60} placeholder="asset" /></label>
          <label className="field"><span>ID da entidade</span><input name="entityId" maxLength={180} /></label>
          <label className="field field-wide"><span>Tipo de divergência</span><input name="issueType" required maxLength={120} placeholder="responsible_mismatch" /></label>
          <label className="field"><span>Severidade</span><select name="severity" defaultValue="medium">{Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Responsável pelo tratamento</span><input name="assignedTo" maxLength={180} /></label>
          <label className="field field-wide"><span>Detalhes JSON</span><textarea name="details" rows={3} defaultValue="{}" /></label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "create-issue"} submitLabel="Registrar divergência" />
        </form>
      </section>
      <section className="operational-panel operation-record-panel" aria-labelledby="reconciliation-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="reconciliation-list-title">Fila de conciliação</h2><p>Pendências com severidade, origem e resolução auditável.</p></div><span className="record-count">{dashboard.operations.reconciliationIssues.length} ocorrências</span></div>
        {dashboard.operations.reconciliationIssues.length ? <div className="operation-record-list">{dashboard.operations.reconciliationIssues.map((issue) => <article className={`operation-record maintenance-record priority-${issue.severity}`} key={issue.id}><div className="operation-record-main"><strong>{issue.issueType}</strong><span>{issue.source} · {issue.entityType} {issue.entityId}</span><small>{issue.assignedTo ? `Responsável: ${issue.assignedTo} · ` : ""}{formatDateTime(issue.createdAt)}</small></div><StatusPill label={issue.status === "open" ? severityLabels[issue.severity] : issue.status === "resolved" ? "Resolvida" : "Ignorada"} tone={issue.status === "resolved" ? "success" : issue.status === "open" && ["high", "critical"].includes(issue.severity) ? "danger" : issue.status === "open" ? "warning" : "neutral"} />{issue.status === "open" ? <div className="operation-record-actions"><button className="button button-primary button-small" type="button" disabled={busyKey === issue.id} onClick={() => resolve(issue.id, "resolved")}>Resolver</button><button className="button button-secondary button-small" type="button" disabled={busyKey === issue.id} onClick={() => resolve(issue.id, "ignored")}>Ignorar</button></div> : null}</article>)}</div> : <EmptyState title="Nenhuma divergência" description="As diferenças entre sistemas aparecerão nesta fila." />}
      </section>
    </div>
  );
}
