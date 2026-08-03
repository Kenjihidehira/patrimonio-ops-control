"use client";

import { type FormEvent, useMemo, useState } from "react";
import type { Asset, LifecycleRequest } from "../types";
import { EmptyState, formValue, formatDateTime } from "../ui";
import {
  AssetSelect,
  FormActions,
  InlineError,
  StatusPill,
  assetById,
  assetLabel,
  formatDate,
  futureInputValue,
  type OperationProps,
  useOperationMutation,
} from "./shared";

type LifecyclePane = "requests" | "kits" | "reservations" | "offboarding";

const requestTypeLabels = {
  purchase: "Compra",
  transfer: "Transferência",
  disposal: "Baixa",
  repair: "Reparo",
  replacement: "Substituição",
} as const;
const requestStatusLabels = {
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  completed: "Concluída",
  cancelled: "Cancelada",
} as const;
const reservationStatusLabels = {
  requested: "Solicitada",
  approved: "Aprovada",
  checked_out: "Retirada",
  returned: "Devolvida",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
} as const;

export function LifecycleOperations(props: OperationProps) {
  const [pane, setPane] = useState<LifecyclePane>("requests");
  const panes: Array<{ id: LifecyclePane; label: string; count: number }> = [
    { id: "requests", label: "Solicitações", count: props.dashboard.operations.lifecycleRequests.length },
    { id: "kits", label: "Kits", count: props.dashboard.operations.assetKits.filter((kit) => kit.status === "active").length },
    { id: "reservations", label: "Reservas", count: props.dashboard.operations.reservations.filter((item) => ["requested", "approved", "checked_out"].includes(item.status)).length },
    { id: "offboarding", label: "Desligamentos", count: props.dashboard.operations.offboardingCases.filter((item) => item.status === "open").length },
  ];

  return (
    <div className="operation-stack">
      <nav className="operation-subtabs" aria-label="Ciclo de vida patrimonial">
        {panes.map((item) => (
          <button key={item.id} type="button" className={pane === item.id ? "is-active" : ""} onClick={() => setPane(item.id)}>
            <span>{item.label}</span><strong>{item.count}</strong>
          </button>
        ))}
      </nav>
      {pane === "requests" ? <LifecycleRequests {...props} /> : null}
      {pane === "kits" ? <AssetKits {...props} /> : null}
      {pane === "reservations" ? <AssetReservations {...props} /> : null}
      {pane === "offboarding" ? <OffboardingOperations {...props} /> : null}
    </div>
  );
}

function LifecycleRequests({ dashboard, onMutate }: OperationProps) {
  const { busyKey, error, run } = useOperationMutation(onMutate);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void run("create-request", {
      type: "create_lifecycle_request",
      request: {
        id: crypto.randomUUID(),
        requestType: formValue(form, "requestType"),
        assetId: formValue(form, "assetId"),
        title: formValue(form, "title"),
        reason: formValue(form, "reason"),
        quantity: formValue(form, "quantity"),
        estimatedCost: formValue(form, "estimatedCost"),
      },
    }, () => form.reset());
  }

  function decide(request: LifecycleRequest, status: "approved" | "rejected" | "completed" | "cancelled") {
    void run(request.id, {
      type: "decide_lifecycle_request",
      requestId: request.id,
      status,
      note: status === "approved" ? "Solicitação aprovada para execução." : "Decisão registrada no fluxo patrimonial.",
    });
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="request-create-title">
        <div className="operational-panel-toolbar"><div><h2 id="request-create-title">Nova solicitação</h2><p>Compras, transferências, reparos, substituições e baixas com aprovação.</p></div></div>
        <form className="form-grid operation-form" onSubmit={submit}>
          <label className="field"><span>Tipo</span><select name="requestType" defaultValue="purchase">{Object.entries(requestTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Quantidade</span><input name="quantity" type="number" min="1" max="10000" defaultValue="1" required /></label>
          <label className="field field-wide"><span>Patrimônio relacionado</span><AssetSelect assets={dashboard.nucleusInventory} required={false} /></label>
          <label className="field field-wide"><span>Título</span><input name="title" minLength={3} maxLength={180} required placeholder="Aquisição de notebooks para expansão" /></label>
          {dashboard.environment.isAdmin ? <label className="field"><span>Valor estimado (R$)</span><input name="estimatedCost" type="number" min="0" step="0.01" defaultValue="0" /></label> : <input name="estimatedCost" type="hidden" value="0" />}
          <label className="field field-wide"><span>Justificativa</span><textarea name="reason" minLength={3} maxLength={500} rows={3} required /></label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "create-request"} submitLabel="Enviar para aprovação" />
        </form>
      </section>
      <section className="operational-panel operation-record-panel" aria-labelledby="request-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="request-list-title">Fila de decisões</h2><p>Governança do ciclo de vida com ator e data da decisão.</p></div><span className="record-count">{dashboard.operations.lifecycleRequests.length} solicitações</span></div>
        {dashboard.operations.lifecycleRequests.length ? <div className="operation-record-list">
          {dashboard.operations.lifecycleRequests.map((request) => (
            <article className="operation-record" key={request.id}>
              <div className="operation-record-main"><strong>{request.title}</strong><span>{requestTypeLabels[request.requestType]} · {request.assetId || `${request.quantity} item(ns)`}</span><small>{request.requestedBy} · {formatDateTime(request.requestedAt)}{request.estimatedCost !== null ? ` · ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(request.estimatedCost)}` : ""}</small></div>
              <StatusPill label={requestStatusLabels[request.status]} tone={request.status === "approved" || request.status === "completed" ? "success" : request.status === "rejected" ? "danger" : request.status === "pending_approval" ? "warning" : "neutral"} />
              {dashboard.environment.isAdmin && request.status === "pending_approval" ? <div className="operation-record-actions"><button className="button button-primary button-small" type="button" disabled={busyKey === request.id} onClick={() => decide(request, "approved")}>Aprovar</button><button className="button button-secondary button-small" type="button" disabled={busyKey === request.id} onClick={() => decide(request, "rejected")}>Rejeitar</button></div> : null}
              {dashboard.environment.isAdmin && request.status === "approved" ? <div className="operation-record-actions"><button className="button button-primary button-small" type="button" disabled={busyKey === request.id} onClick={() => decide(request, "completed")}>Concluir</button><button className="button button-secondary button-small" type="button" disabled={busyKey === request.id} onClick={() => decide(request, "cancelled")}>Cancelar</button></div> : null}
            </article>
          ))}
        </div> : <EmptyState title="Nenhuma solicitação" description="As solicitações de ciclo de vida aparecerão aqui." />}
      </section>
    </div>
  );
}

function AssetKits({ dashboard, onMutate }: OperationProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const { busyKey, error, setError, run } = useOperationMutation(onMutate);
  const availableAssets = useMemo(() => {
    const assigned = new Set(dashboard.operations.assetKitItems.filter((item) => item.releasedAt === null).map((item) => item.assetId));
    return dashboard.nucleusInventory.filter((asset) => !assigned.has(asset.id));
  }, [dashboard.nucleusInventory, dashboard.operations.assetKitItems]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.length < 2) {
      setError("Selecione pelo menos dois ativos para formar o kit.");
      return;
    }
    const form = event.currentTarget;
    void run("create-kit", {
      type: "create_asset_kit",
      kit: { id: crypto.randomUUID(), name: formValue(form, "name"), description: formValue(form, "description"), assetIds: selected },
    }, () => { form.reset(); setSelected([]); });
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="kit-create-title">
        <div className="operational-panel-toolbar"><div><h2 id="kit-create-title">Montar kit</h2><p>Agrupe equipamentos que devem circular e ser conferidos juntos.</p></div></div>
        <form className="form-grid operation-form" onSubmit={submit}>
          <label className="field field-wide"><span>Nome do kit</span><input name="name" minLength={3} maxLength={180} required placeholder="Kit home office · Comercial" /></label>
          <label className="field field-wide"><span>Descrição</span><textarea name="description" maxLength={500} rows={2} /></label>
          <AssetChecklist assets={availableAssets} selected={selected} onChange={setSelected} />
          <InlineError message={error} />
          <FormActions busy={busyKey === "create-kit"} submitLabel={`Criar kit com ${selected.length} itens`} />
        </form>
      </section>
      <section className="operational-panel operation-record-panel" aria-labelledby="kit-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="kit-list-title">Kits patrimoniais</h2><p>Vínculos atuais e histórico de dissolução.</p></div><span className="record-count">{dashboard.operations.assetKits.length} kits</span></div>
        {dashboard.operations.assetKits.length ? <div className="operation-record-list">{dashboard.operations.assetKits.map((kit) => {
          const items = dashboard.operations.assetKitItems.filter((item) => item.kitId === kit.id && item.releasedAt === null);
          return <article className="operation-record operation-record-expanded" key={kit.id}><div className="operation-record-main"><strong>{kit.name}</strong><span>{kit.description || `${kit.itemCount} itens vinculados`}</span><small>Criado por {kit.createdBy} · {formatDateTime(kit.createdAt)}</small><div className="operation-chip-list">{items.map((item) => <span key={item.assetId}>{item.assetId}</span>)}</div></div><StatusPill label={kit.status === "active" ? "Ativo" : "Dissolvido"} tone={kit.status === "active" ? "success" : "neutral"} />{kit.status === "active" ? <div className="operation-record-actions"><button className="button button-secondary button-small" type="button" disabled={busyKey === kit.id} onClick={() => void run(kit.id, { type: "dissolve_asset_kit", kitId: kit.id })}>Dissolver kit</button></div> : null}</article>;
        })}</div> : <EmptyState title="Nenhum kit cadastrado" description="Crie conjuntos para notebooks, monitores e acessórios que circulam juntos." />}
      </section>
    </div>
  );
}

function AssetReservations({ dashboard, onMutate }: OperationProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const { busyKey, error, setError, run } = useOperationMutation(onMutate);
  const reservableAssets = dashboard.nucleusInventory.filter((asset) => ["available", "allocated"].includes(asset.status));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) {
      setError("Selecione ao menos um ativo para a reserva.");
      return;
    }
    const form = event.currentTarget;
    void run("create-reservation", {
      type: "create_reservation",
      reservation: { id: crypto.randomUUID(), startsAt: formValue(form, "startsAt"), endsAt: formValue(form, "endsAt"), purpose: formValue(form, "purpose"), assetIds: selected },
    }, () => { form.reset(); setSelected([]); });
  }

  function update(reservationId: string, status: "approved" | "rejected" | "checked_out" | "returned" | "cancelled") {
    void run(reservationId, { type: "update_reservation_status", reservationId, status });
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="reservation-create-title">
        <div className="operational-panel-toolbar"><div><h2 id="reservation-create-title">Reservar ativos</h2><p>Bloqueie equipamentos por período sem permitir sobreposição.</p></div></div>
        <form className="form-grid operation-form" onSubmit={submit}>
          <label className="field"><span>Retirada</span><input name="startsAt" type="datetime-local" required /></label>
          <label className="field"><span>Devolução</span><input name="endsAt" type="datetime-local" required /></label>
          <label className="field field-wide"><span>Finalidade</span><textarea name="purpose" minLength={3} maxLength={500} rows={2} required /></label>
          <AssetChecklist assets={reservableAssets} selected={selected} onChange={setSelected} />
          <InlineError message={error} />
          <FormActions busy={busyKey === "create-reservation"} submitLabel="Solicitar reserva" />
        </form>
      </section>
      <section className="operational-panel operation-record-panel" aria-labelledby="reservation-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="reservation-list-title">Agenda de reservas</h2><p>Aprovação, retirada e devolução com rastreabilidade.</p></div><span className="record-count">{dashboard.operations.reservations.length} reservas</span></div>
        {dashboard.operations.reservations.length ? <div className="operation-record-list">{dashboard.operations.reservations.map((reservation) => {
          const itemIds = dashboard.operations.reservationAssets.filter((item) => item.reservationId === reservation.id).map((item) => item.assetId);
          const isOwner = Boolean(reservation.requesterIdentifier && reservation.requesterIdentifier === dashboard.session.identifier);
          return <article className="operation-record operation-record-expanded" key={reservation.id}><div className="operation-record-main"><strong>{reservation.purpose}</strong><span>{formatDateTime(reservation.startsAt)} até {formatDateTime(reservation.endsAt)}</span><small>{reservation.requesterName}</small><div className="operation-chip-list">{itemIds.map((id) => <span key={id}>{id}</span>)}</div></div><StatusPill label={reservationStatusLabels[reservation.status]} tone={reservation.status === "returned" ? "success" : reservation.status === "requested" ? "warning" : reservation.status === "approved" || reservation.status === "checked_out" ? "info" : "neutral"} />{reservation.status === "requested" && dashboard.environment.isAdmin ? <div className="operation-record-actions"><button className="button button-primary button-small" type="button" disabled={busyKey === reservation.id} onClick={() => update(reservation.id, "approved")}>Aprovar</button><button className="button button-secondary button-small" type="button" disabled={busyKey === reservation.id} onClick={() => update(reservation.id, "rejected")}>Rejeitar</button></div> : null}{reservation.status === "approved" && dashboard.environment.isAdmin ? <div className="operation-record-actions"><button className="button button-primary button-small" type="button" disabled={busyKey === reservation.id} onClick={() => update(reservation.id, "checked_out")}>Registrar retirada</button></div> : null}{reservation.status === "checked_out" && dashboard.environment.isAdmin ? <div className="operation-record-actions"><button className="button button-primary button-small" type="button" disabled={busyKey === reservation.id} onClick={() => update(reservation.id, "returned")}>Registrar devolução</button></div> : null}{["requested", "approved"].includes(reservation.status) && (dashboard.environment.isAdmin || isOwner) ? <div className="operation-record-actions"><button className="button button-secondary button-small" type="button" disabled={busyKey === reservation.id} onClick={() => update(reservation.id, "cancelled")}>Cancelar</button></div> : null}</article>;
        })}</div> : <EmptyState title="Nenhuma reserva" description="As reservas de equipamentos aparecerão aqui." />}
      </section>
    </div>
  );
}

function OffboardingOperations({ dashboard, onMutate }: OperationProps) {
  const [destinationByAsset, setDestinationByAsset] = useState<Record<string, string>>({});
  const { busyKey, error, run } = useOperationMutation(onMutate);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void run("create-offboarding", {
      type: "create_offboarding_case",
      case: { id: crypto.randomUUID(), collaboratorName: formValue(form, "collaboratorName"), collaboratorIdentifier: formValue(form, "collaboratorIdentifier"), dueAt: formValue(form, "dueAt"), notes: formValue(form, "notes") },
    }, () => form.reset());
  }

  function update(caseId: string, assetId: string, result: "returned" | "missing" | "reassigned") {
    void run(`${caseId}-${assetId}`, { type: "update_offboarding_asset", caseId, assetId, result, destinationAssignee: destinationByAsset[assetId] ?? "", note: "Tratamento registrado no processo de desligamento." });
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="offboarding-create-title">
        <div className="operational-panel-toolbar"><div><h2 id="offboarding-create-title">Abrir desligamento</h2><p>Localize automaticamente todos os ativos sob responsabilidade do colaborador.</p></div></div>
        <form className="form-grid operation-form" onSubmit={submit}>
          <label className="field field-wide"><span>Colaborador</span><select name="collaboratorName" defaultValue="" required><option value="">Selecione o responsável</option>{dashboard.collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.name}>{collaborator.name} · {collaborator.assetCount} ativos</option>)}</select></label>
          <label className="field field-wide"><span>E-mail corporativo</span><input name="collaboratorIdentifier" type="email" required /></label>
          <label className="field"><span>Prazo de devolução</span><input name="dueAt" type="date" min={futureInputValue(0)} defaultValue={futureInputValue(7)} /></label>
          <label className="field field-wide"><span>Observações</span><textarea name="notes" maxLength={500} rows={2} /></label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "create-offboarding"} submitLabel="Abrir recolhimento" />
        </form>
      </section>
      <section className="operational-panel operation-record-panel" aria-labelledby="offboarding-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="offboarding-list-title">Recolhimentos</h2><p>Devolução, ausência ou reatribuição item a item.</p></div><span className="record-count">{dashboard.operations.offboardingCases.length} processos</span></div>
        {dashboard.operations.offboardingCases.length ? <div className="offboarding-list">{dashboard.operations.offboardingCases.map((item) => {
          const assets = dashboard.operations.offboardingAssets.filter((asset) => asset.caseId === item.id);
          const pending = assets.filter((asset) => asset.result === "pending");
          return <article className="offboarding-case" key={item.id}><header><div><strong>{item.collaboratorName}</strong><span>Prazo {formatDate(item.dueAt)} · {assets.length} ativos</span></div><StatusPill label={item.status === "open" ? "Em recolhimento" : "Concluído"} tone={item.status === "open" ? "warning" : "success"} /></header><div className="offboarding-assets">{assets.map((caseAsset) => {
            const asset = assetById(dashboard, caseAsset.assetId);
            return <div key={caseAsset.assetId}><div><strong>{asset ? assetLabel(asset) : caseAsset.assetId}</strong><small>{caseAsset.result === "pending" ? "Aguardando tratamento" : caseAsset.result === "returned" ? "Devolvido à reserva" : caseAsset.result === "missing" ? "Não localizado" : `Reatribuído a ${caseAsset.destinationAssignee}`}</small></div>{caseAsset.result === "pending" ? <div className="offboarding-asset-actions"><input aria-label={`Novo responsável para ${caseAsset.assetId}`} value={destinationByAsset[caseAsset.assetId] ?? ""} onChange={(event) => setDestinationByAsset((current) => ({ ...current, [caseAsset.assetId]: event.target.value }))} placeholder="Novo responsável" /><button type="button" title="Registrar devolução" disabled={busyKey === `${item.id}-${caseAsset.assetId}`} onClick={() => update(item.id, caseAsset.assetId, "returned")}>✓</button><button type="button" title="Reatribuir patrimônio" disabled={!destinationByAsset[caseAsset.assetId] || busyKey === `${item.id}-${caseAsset.assetId}`} onClick={() => update(item.id, caseAsset.assetId, "reassigned")}>↪</button><button type="button" title="Registrar não localizado" disabled={busyKey === `${item.id}-${caseAsset.assetId}`} onClick={() => update(item.id, caseAsset.assetId, "missing")}>×</button></div> : <StatusPill label={caseAsset.result === "returned" ? "Devolvido" : caseAsset.result === "missing" ? "Ausente" : "Reatribuído"} tone={caseAsset.result === "missing" ? "danger" : "success"} />}</div>;
          })}</div>{item.status === "open" && pending.length === 0 ? <footer><button className="button button-primary button-small" type="button" disabled={busyKey === item.id} onClick={() => void run(item.id, { type: "complete_offboarding_case", caseId: item.id })}>Concluir desligamento</button></footer> : null}</article>;
        })}</div> : <EmptyState title="Nenhum desligamento aberto" description="Abra um processo para recolher todos os ativos de um colaborador." />}
      </section>
    </div>
  );
}

function AssetChecklist({ assets, selected, onChange }: { assets: Asset[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const selectedSet = new Set(selected);
  return (
    <fieldset className="asset-checklist field-wide">
      <legend>Ativos selecionados <span>{selected.length}</span></legend>
      <div>{assets.map((asset) => <label key={asset.id}><input type="checkbox" checked={selectedSet.has(asset.id)} onChange={(event) => onChange(event.target.checked ? [...selected, asset.id] : selected.filter((id) => id !== asset.id))} /><span><strong>{asset.id}</strong><small>{asset.brandModel || asset.location}</small></span></label>)}</div>
    </fieldset>
  );
}
