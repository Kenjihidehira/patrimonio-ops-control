"use client";

import Image from "next/image";
import QRCode from "qrcode";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Asset,
  Dashboard,
  InventoryCampaign,
  MutationAction,
  TrackingTechnology,
} from "./types";
import { EmptyState, formatDateTime, formValue } from "./ui";

type OperationsTab = "inventory" | "custody" | "maintenance" | "tracking";
type Mutate = (action: MutationAction) => Promise<void>;

const inventoryResultLabels = {
  pending: "Pendente",
  confirmed: "Confirmado",
  missing: "Não localizado",
  wrong_location: "Local incorreto",
  damaged: "Avariado",
} as const;

const custodyStatusLabels = {
  pending: "Pendente",
  accepted: "Aceito",
  rejected: "Recusado",
  cancelled: "Cancelado",
} as const;

const maintenanceStatusLabels = {
  open: "Aberta",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
} as const;

const maintenanceKindLabels = {
  preventive: "Preventiva",
  corrective: "Corretiva",
  inspection: "Inspeção",
} as const;

const priorityLabels = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica",
} as const;

const trackingLabels: Record<TrackingTechnology | "manual", string> = {
  qr: "QR Code",
  barcode: "Código de barras",
  rfid_uhf: "RFID UHF",
  ble: "Bluetooth LE",
  uwb: "UWB",
  gps: "GPS / telemetria",
  mdm: "MDM",
  manual: "Registro manual",
};

export function OperationsView({ dashboard, onMutate }: { dashboard: Dashboard; onMutate: Mutate }) {
  const [tab, setTab] = useState<OperationsTab>("inventory");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = dashboard.environment.permissions.canWrite;

  const execute = useCallback(async (key: string, action: MutationAction, form?: HTMLFormElement) => {
    setBusyAction(key);
    setError(null);
    try {
      await onMutate(action);
      form?.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a operação.");
    } finally {
      setBusyAction(null);
    }
  }, [onMutate]);

  const counts = useMemo(() => ({
    campaigns: dashboard.inventoryCampaigns.filter((item) => item.status === "active").length,
    custody: dashboard.custodyTerms.filter((item) => item.status === "pending").length,
    maintenance: dashboard.maintenanceOrders.filter((item) => ["open", "in_progress"].includes(item.status)).length,
    tracked: new Set(dashboard.trackingTags.filter((item) => item.active).map((item) => item.assetId)).size,
  }), [dashboard]);

  return (
    <section className="view-section operations-view" id="operations-view">
      <div className="operations-summary" aria-label="Pendências operacionais">
        <OperationMetric label="Inventários ativos" value={counts.campaigns} />
        <OperationMetric label="Termos pendentes" value={counts.custody} warning={counts.custody > 0} />
        <OperationMetric label="Ordens abertas" value={counts.maintenance} warning={counts.maintenance > 0} />
        <OperationMetric label="Ativos rastreáveis" value={counts.tracked} />
      </div>

      <nav className="operations-tabs" aria-label="Módulos de controle operacional">
        {([
          ["inventory", "Inventários"],
          ["custody", "Responsabilidade"],
          ["maintenance", "Manutenção"],
          ["tracking", "Rastreamento"],
        ] as Array<[OperationsTab, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={tab === value ? "is-active" : ""}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => {
              setTab(value);
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? <div className="operations-error" role="alert">{error}</div> : null}
      {!canWrite ? (
        <div className="operations-readonly" role="status">
          Seu perfil pode consultar estes controles, mas não registrar operações.
        </div>
      ) : null}

      {tab === "inventory" ? (
        <InventoryOperations dashboard={dashboard} execute={execute} busyAction={busyAction} canWrite={canWrite} />
      ) : null}
      {tab === "custody" ? (
        <CustodyOperations dashboard={dashboard} execute={execute} busyAction={busyAction} canWrite={canWrite} />
      ) : null}
      {tab === "maintenance" ? (
        <MaintenanceOperations dashboard={dashboard} execute={execute} busyAction={busyAction} canWrite={canWrite} />
      ) : null}
      {tab === "tracking" ? (
        <TrackingOperations dashboard={dashboard} execute={execute} busyAction={busyAction} canWrite={canWrite} />
      ) : null}
    </section>
  );
}

function OperationMetric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className={warning ? "operation-metric has-warning" : "operation-metric"}>
      <span>{label}</span>
      <strong>{value.toLocaleString("pt-BR")}</strong>
    </div>
  );
}

function InventoryOperations({
  dashboard,
  execute,
  busyAction,
  canWrite,
}: OperationSectionProps) {
  const activeCampaigns = dashboard.inventoryCampaigns.filter((item) => item.status === "active");
  const [selectedCampaignId, setSelectedCampaignId] = useState(activeCampaigns[0]?.id ?? "");
  const selectedCampaign = activeCampaigns.find((item) => item.id === selectedCampaignId) ?? activeCampaigns[0] ?? null;
  const targets = selectedCampaign
    ? dashboard.inventoryCampaignAssets.filter((item) => item.campaignId === selectedCampaign.id)
    : [];

  const createCampaign = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void execute("create-campaign", {
      type: "create_inventory_campaign",
      campaign: {
        id: crypto.randomUUID(),
        name: formValue(form, "name"),
        nucleusId: formValue(form, "nucleusId"),
        dueAt: formValue(form, "dueAt"),
      },
    }, form);
  };

  const recordCheck = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCampaign) return;
    const form = event.currentTarget;
    void execute("inventory-check", {
      type: "record_inventory_check",
      campaignId: selectedCampaign.id,
      assetId: formValue(form, "assetId"),
      result: formValue(form, "result"),
      observedLocation: formValue(form, "observedLocation"),
      note: formValue(form, "note"),
    });
  };

  return (
    <div className="operations-workspace">
      <section className="operations-form-panel" aria-labelledby="new-campaign-title">
        <header>
          <h2 id="new-campaign-title">Nova campanha</h2>
          <p>Congele o escopo atual de um núcleo ou de todo o departamento.</p>
        </header>
        <form className="operations-form" onSubmit={createCampaign}>
          <label className="field field-wide">
            <span>Nome da campanha</span>
            <input name="name" required minLength={3} maxLength={180} placeholder="Inventário mensal — Filial 6" />
          </label>
          <label className="field">
            <span>Escopo</span>
            <select name="nucleusId" defaultValue="">
              <option value="">Departamento inteiro</option>
              {dashboard.nuclei.map((nucleus) => <option key={nucleus.id} value={nucleus.id}>{nucleus.code} — {nucleus.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Prazo</span>
            <input name="dueAt" type="date" />
          </label>
          <button className="button button-primary field-wide" type="submit" disabled={!canWrite || busyAction !== null}>
            {busyAction === "create-campaign" ? "Criando campanha…" : "Criar campanha"}
          </button>
        </form>
      </section>

      <section className="operations-list-panel" aria-labelledby="active-campaigns-title">
        <header className="operations-panel-heading">
          <div><h2 id="active-campaigns-title">Campanhas ativas</h2><p>Conferência física e reconciliação de divergências.</p></div>
          {activeCampaigns.length > 1 ? (
            <label className="field compact-field"><span>Campanha</span><select value={selectedCampaign?.id ?? ""} onChange={(event) => setSelectedCampaignId(event.target.value)}>{activeCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label>
          ) : null}
        </header>

        {selectedCampaign ? (
          <>
            <CampaignProgress campaign={selectedCampaign} />
            <form className="operations-inline-form" onSubmit={recordCheck}>
              <label className="field field-wide"><span>Patrimônio</span><select name="assetId" required defaultValue=""><option value="" disabled>Selecione um patrimônio</option>{targets.map((target) => {
                const asset = assetById(dashboard, target.assetId);
                return <option key={target.assetId} value={target.assetId}>{assetLabel(asset)} — {inventoryResultLabels[target.result]}</option>;
              })}</select></label>
              <label className="field"><span>Resultado</span><select name="result" defaultValue="confirmed"><option value="confirmed">Confirmado</option><option value="missing">Não localizado</option><option value="wrong_location">Local incorreto</option><option value="damaged">Avariado</option></select></label>
              <label className="field"><span>Local observado</span><input name="observedLocation" maxLength={180} placeholder="Sala, filial ou veículo" /></label>
              <label className="field field-wide"><span>Observação</span><input name="note" maxLength={500} placeholder="Opcional" /></label>
              <button className="button button-primary" type="submit" disabled={!canWrite || busyAction !== null}>{busyAction === "inventory-check" ? "Registrando…" : "Registrar conferência"}</button>
              <button className="button button-secondary" type="button" disabled={!canWrite || busyAction !== null || selectedCampaign.checkedCount !== selectedCampaign.targetCount} onClick={() => void execute("complete-campaign", { type: "complete_inventory_campaign", campaignId: selectedCampaign.id })}>{busyAction === "complete-campaign" ? "Concluindo…" : "Concluir campanha"}</button>
            </form>
            <div className="operations-record-list compact-record-list">
              {targets.slice(0, 30).map((target) => <OperationRow key={target.assetId} title={assetLabel(assetById(dashboard, target.assetId))} meta={target.checkedAt ? `${inventoryResultLabels[target.result]} · ${formatDateTime(target.checkedAt)}` : "Aguardando conferência"} status={inventoryResultLabels[target.result]} tone={target.result === "pending" ? "neutral" : target.result === "confirmed" ? "success" : "danger"} />)}
            </div>
          </>
        ) : <EmptyState title="Nenhuma campanha ativa" description="Crie uma campanha para iniciar uma conferência controlada." />}
      </section>
    </div>
  );
}

function CampaignProgress({ campaign }: { campaign: InventoryCampaign }) {
  const percentage = campaign.targetCount ? Math.round((campaign.checkedCount / campaign.targetCount) * 100) : 0;
  return (
    <div className="campaign-progress">
      <div><strong>{campaign.name}</strong><span>{campaign.checkedCount} de {campaign.targetCount} conferidos · {campaign.issueCount} divergências</span></div>
      <span>{percentage}%</span>
      <div className="campaign-progress-track" aria-label={`${percentage}% concluído`}><span style={{ width: `${percentage}%` }} /></div>
    </div>
  );
}

function CustodyOperations({ dashboard, execute, busyAction, canWrite }: OperationSectionProps) {
  const eligibleAssets = dashboard.nucleusInventory.filter((asset) => asset.assignee && asset.assignee.trim().toLocaleLowerCase("pt-BR") !== "reserva");
  const createTerm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void execute("create-term", { type: "create_custody_term", term: { id: crypto.randomUUID(), assetId: formValue(form, "assetId"), assigneeIdentifier: formValue(form, "assigneeIdentifier"), note: formValue(form, "note") } }, form);
  };
  return (
    <div className="operations-workspace">
      <section className="operations-form-panel" aria-labelledby="new-term-title">
        <header><h2 id="new-term-title">Emitir termo</h2><p>O aceite só pode ser feito pela conta Google informada.</p></header>
        <form className="operations-form" onSubmit={createTerm}>
          <label className="field field-wide"><span>Patrimônio com responsável</span><select name="assetId" required defaultValue=""><option value="" disabled>Selecione</option>{eligibleAssets.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)} — {asset.assignee}</option>)}</select></label>
          <label className="field field-wide"><span>E-mail Google do responsável</span><input name="assigneeIdentifier" type="email" required maxLength={254} autoComplete="email" /></label>
          <label className="field field-wide"><span>Condições ou observações</span><textarea name="note" maxLength={500} rows={3} /></label>
          <button className="button button-primary field-wide" type="submit" disabled={!canWrite || busyAction !== null}>{busyAction === "create-term" ? "Emitindo…" : "Emitir termo"}</button>
        </form>
      </section>
      <section className="operations-list-panel" aria-labelledby="terms-title">
        <header className="operations-panel-heading"><div><h2 id="terms-title">Termos de responsabilidade</h2><p>Identidade, aceite e data preservados para auditoria.</p></div></header>
        {dashboard.custodyTerms.length ? <div className="operations-record-list">{dashboard.custodyTerms.map((term) => {
          const isRecipient = term.assigneeIdentifier === dashboard.session.identifier?.toLocaleLowerCase("pt-BR");
          return <OperationRow key={term.id} title={`${assetLabel(assetById(dashboard, term.assetId))} · ${term.assignee}`} meta={`${term.assigneeIdentifier} · Emitido em ${formatDateTime(term.issuedAt)}`} status={custodyStatusLabels[term.status]} tone={term.status === "accepted" ? "success" : term.status === "pending" ? "warning" : term.status === "rejected" ? "danger" : "neutral"} actions={term.status === "pending" ? <>{isRecipient ? <><button className="button button-primary button-small" type="button" disabled={busyAction !== null} onClick={() => void execute(`accept-${term.id}`, { type: "respond_custody_term", termId: term.id, response: "accepted", note: "Aceite eletrônico pela conta autenticada." })}>Aceitar</button><button className="button button-secondary button-small" type="button" disabled={busyAction !== null} onClick={() => void execute(`reject-${term.id}`, { type: "respond_custody_term", termId: term.id, response: "rejected", note: "Recusa eletrônica pela conta autenticada." })}>Recusar</button></> : null}{dashboard.environment.isAdmin ? <button className="button button-secondary button-small" type="button" disabled={busyAction !== null} onClick={() => void execute(`cancel-${term.id}`, { type: "respond_custody_term", termId: term.id, response: "cancelled", note: "Cancelado pela administração." })}>Cancelar</button> : null}</> : null} />;
        })}</div> : <EmptyState title="Nenhum termo emitido" description="Emita o primeiro termo para formalizar a custódia de um patrimônio." />}
      </section>
    </div>
  );
}

function MaintenanceOperations({ dashboard, execute, busyAction, canWrite }: OperationSectionProps) {
  const createOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void execute("create-order", { type: "create_maintenance_order", order: { id: crypto.randomUUID(), assetId: formValue(form, "assetId"), kind: formValue(form, "kind"), priority: formValue(form, "priority"), title: formValue(form, "title"), dueAt: formValue(form, "dueAt"), notes: formValue(form, "notes") } }, form);
  };
  return (
    <div className="operations-workspace">
      <section className="operations-form-panel" aria-labelledby="new-order-title">
        <header><h2 id="new-order-title">Abrir ordem de manutenção</h2><p>O patrimônio entra em manutenção até o encerramento da última ordem aberta.</p></header>
        <form className="operations-form" onSubmit={createOrder}>
          <label className="field field-wide"><span>Patrimônio</span><select name="assetId" required defaultValue=""><option value="" disabled>Selecione</option>{dashboard.nucleusInventory.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select></label>
          <label className="field"><span>Tipo</span><select name="kind" defaultValue="corrective">{Object.entries(maintenanceKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Prioridade</span><select name="priority" defaultValue="normal">{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field field-wide"><span>Título</span><input name="title" required minLength={3} maxLength={180} placeholder="Substituir bateria do notebook" /></label>
          <label className="field"><span>Prazo</span><input name="dueAt" type="date" /></label>
          <label className="field"><span>Observações</span><input name="notes" maxLength={500} /></label>
          <button className="button button-primary field-wide" type="submit" disabled={!canWrite || busyAction !== null}>{busyAction === "create-order" ? "Abrindo…" : "Abrir ordem"}</button>
        </form>
      </section>
      <section className="operations-list-panel" aria-labelledby="orders-title">
        <header className="operations-panel-heading"><div><h2 id="orders-title">Ordens de manutenção</h2><p>Preventivas, corretivas e inspeções vinculadas ao histórico do ativo.</p></div></header>
        {dashboard.maintenanceOrders.length ? <div className="operations-record-list">{dashboard.maintenanceOrders.map((order) => <OperationRow key={order.id} title={`${order.title} · ${assetLabel(assetById(dashboard, order.assetId))}`} meta={`${maintenanceKindLabels[order.kind]} · Prioridade ${priorityLabels[order.priority].toLocaleLowerCase("pt-BR")} · Atualizada em ${formatDateTime(order.updatedAt)}`} status={maintenanceStatusLabels[order.status]} tone={order.status === "completed" ? "success" : order.priority === "critical" ? "danger" : ["open", "in_progress"].includes(order.status) ? "warning" : "neutral"} actions={["open", "in_progress"].includes(order.status) ? <>{order.status === "open" ? <button className="button button-secondary button-small" type="button" disabled={!canWrite || busyAction !== null} onClick={() => void execute(`start-${order.id}`, { type: "update_maintenance_order", orderId: order.id, status: "in_progress", note: "Atendimento iniciado." })}>Iniciar</button> : null}<button className="button button-primary button-small" type="button" disabled={!canWrite || busyAction !== null} onClick={() => void execute(`complete-${order.id}`, { type: "update_maintenance_order", orderId: order.id, status: "completed", note: "Atendimento concluído." })}>Concluir</button><button className="button button-secondary button-small" type="button" disabled={!canWrite || busyAction !== null} onClick={() => void execute(`cancel-order-${order.id}`, { type: "update_maintenance_order", orderId: order.id, status: "cancelled", note: "Ordem cancelada." })}>Cancelar</button></> : null} />)}</div> : <EmptyState title="Nenhuma ordem registrada" description="Abra uma ordem para controlar manutenção e indisponibilidade." />}
      </section>
    </div>
  );
}

function TrackingOperations({ dashboard, execute, busyAction, canWrite }: OperationSectionProps) {
  const [assetId, setAssetId] = useState(dashboard.nucleusInventory[0]?.id ?? "");
  const [technology, setTechnology] = useState<TrackingTechnology | "manual">("manual");
  const [tagId, setTagId] = useState("");
  const [location, setLocation] = useState(assetById(dashboard, assetId)?.location ?? "");
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const configuredTags = dashboard.trackingTags.filter((tag) => tag.assetId === assetId && tag.active);

  const assignTag = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void execute("assign-tag", { type: "assign_tracking_tag", tag: { id: crypto.randomUUID(), assetId: formValue(form, "assetId"), technology: formValue(form, "technology"), tagId: formValue(form, "tagId") } });
  };
  const recordEvent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void execute("tracking-event", { type: "record_tracking_event", event: { id: crypto.randomUUID(), assetId, technology, tagId, readerId: formValue(form, "readerId"), location, latitude: formValue(form, "latitude"), longitude: formValue(form, "longitude"), accuracyMeters: formValue(form, "accuracyMeters"), batteryPercent: formValue(form, "batteryPercent"), note: formValue(form, "note") } });
  };
  const handleDetected = (value: string) => {
    const normalized = value.trim();
    const asset = dashboard.nucleusInventory.find((item) => item.id === normalized || item.sourceIdentifier === normalized || item.baseCode === normalized);
    if (!asset) {
      setScanMessage(`Código ${normalized} não encontrado neste departamento.`);
      return;
    }
    setAssetId(asset.id);
    setTechnology("qr");
    setTagId(normalized);
    setLocation(asset.location);
    setScanMessage(`${assetLabel(asset)} preparado para registro.`);
  };

  return (
    <div className="operations-workspace operations-tracking-workspace">
      <section className="operations-form-panel" aria-labelledby="tracking-config-title">
        <header><h2 id="tracking-config-title">Configurar identificação</h2><p>Cadastre a etiqueta ou dispositivo antes de registrar leituras automáticas por RFID, BLE, UWB, GPS ou MDM.</p></header>
        <form className="operations-form" onSubmit={assignTag}>
          <label className="field field-wide"><span>Patrimônio</span><select name="assetId" required defaultValue=""><option value="" disabled>Selecione</option>{dashboard.nucleusInventory.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select></label>
          <label className="field"><span>Tecnologia</span><select name="technology" defaultValue="qr">{Object.entries(trackingLabels).filter(([value]) => value !== "manual").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>ID da etiqueta ou dispositivo</span><input name="tagId" required maxLength={180} /></label>
          <button className="button button-primary field-wide" type="submit" disabled={!canWrite || busyAction !== null}>{busyAction === "assign-tag" ? "Vinculando…" : "Vincular identificação"}</button>
        </form>
        <QrLabel dashboard={dashboard} />
      </section>

      <section className="operations-list-panel" aria-labelledby="tracking-events-title">
        <header className="operations-panel-heading"><div><h2 id="tracking-events-title">Registrar leitura</h2><p>Cada evento preserva origem, horário, local e tecnologia.</p></div><CameraScanner onDetected={handleDetected} /></header>
        {scanMessage ? <div className="scanner-inline-message" role="status">{scanMessage}</div> : null}
        <form className="operations-inline-form tracking-event-form" onSubmit={recordEvent}>
          <label className="field field-wide"><span>Patrimônio</span><select value={assetId} required onChange={(event) => { const next = event.target.value; setAssetId(next); setLocation(assetById(dashboard, next)?.location ?? ""); setTagId(""); }}><option value="" disabled>Selecione</option>{dashboard.nucleusInventory.map((asset) => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select></label>
          <label className="field"><span>Tecnologia</span><select value={technology} onChange={(event) => { const next = event.target.value as TrackingTechnology | "manual"; setTechnology(next); setTagId(dashboard.trackingTags.find((tag) => tag.assetId === assetId && tag.technology === next)?.tagId ?? ""); }}>{Object.entries(trackingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Etiqueta</span>{configuredTags.some((tag) => tag.technology === technology) ? <select value={tagId} onChange={(event) => setTagId(event.target.value)}><option value="">Selecione</option>{configuredTags.filter((tag) => tag.technology === technology).map((tag) => <option key={tag.id} value={tag.tagId}>{tag.tagId}</option>)}</select> : <input value={tagId} onChange={(event) => setTagId(event.target.value)} maxLength={180} placeholder={technology === "manual" ? "Opcional" : "Código lido"} />}</label>
          <label className="field field-wide"><span>Local observado</span><input value={location} onChange={(event) => setLocation(event.target.value)} required maxLength={180} /></label>
          <label className="field"><span>Leitor ou origem</span><input name="readerId" maxLength={180} placeholder="camera-web, portal-01…" /></label>
          <label className="field"><span>Bateria da etiqueta (%)</span><input name="batteryPercent" type="number" min={0} max={100} /></label>
          <details className="tracking-advanced field-wide"><summary>Coordenadas e precisão</summary><div><label className="field"><span>Latitude</span><input name="latitude" type="number" step="0.000001" min={-90} max={90} /></label><label className="field"><span>Longitude</span><input name="longitude" type="number" step="0.000001" min={-180} max={180} /></label><label className="field"><span>Precisão em metros</span><input name="accuracyMeters" type="number" step="0.01" min={0} /></label></div></details>
          <label className="field field-wide"><span>Observação</span><input name="note" maxLength={500} /></label>
          <button className="button button-primary field-wide" type="submit" disabled={!canWrite || busyAction !== null}>{busyAction === "tracking-event" ? "Registrando…" : "Registrar leitura"}</button>
        </form>
        {dashboard.trackingEvents.length ? <div className="operations-record-list compact-record-list">{dashboard.trackingEvents.slice(0, 30).map((event) => <OperationRow key={event.id} title={`${assetLabel(assetById(dashboard, event.assetId))} · ${event.location}`} meta={`${trackingLabels[event.technology]} · ${formatDateTime(event.observedAt)} · ${event.readerId || event.observedBy}`} status={trackingLabels[event.technology]} tone="neutral" />)}</div> : <EmptyState title="Nenhuma leitura registrada" description="Use a câmera, um leitor ou uma integração para criar a primeira evidência de localização." />}
      </section>
    </div>
  );
}

function QrLabel({ dashboard }: { dashboard: Dashboard }) {
  const [assetId, setAssetId] = useState(dashboard.nucleusInventory[0]?.id ?? "");
  const [dataUrl, setDataUrl] = useState("");
  const asset = assetById(dashboard, assetId);
  useEffect(() => {
    let cancelled = false;
    if (!assetId) return;
    void QRCode.toDataURL(assetId, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#10263a", light: "#ffffff" } }).then((value) => {
      if (!cancelled) setDataUrl(value);
    });
    return () => { cancelled = true; };
  }, [assetId]);
  return (
    <div className="qr-label-generator">
      <div><strong>Etiqueta QR</strong><span>Gere uma etiqueta compatível com a câmera do sistema.</span></div>
      <label className="field"><span>Patrimônio</span><select value={assetId} onChange={(event) => setAssetId(event.target.value)}>{dashboard.nucleusInventory.map((item) => <option key={item.id} value={item.id}>{assetLabel(item)}</option>)}</select></label>
      {dataUrl && asset ? <div className="qr-label-preview"><Image src={dataUrl} alt={`QR Code do patrimônio ${assetIdentifier(asset)}`} width={128} height={128} unoptimized /><div><strong>{assetIdentifier(asset)}</strong><span>{asset.brandModel}</span><a className="button button-secondary button-small" href={dataUrl} download={`patrimonio-${assetIdentifier(asset)}.png`}>Baixar PNG</a></div></div> : null}
    </div>
  );
}

type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function CameraScanner({ onDetected }: { onDetected: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    frameRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    setError(null);
    const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector) {
      setError("Este navegador não oferece leitura por câmera. Use Chrome/Edge atualizado ou um leitor HID.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      const detector = new Detector({ formats: ["qr_code", "code_128", "code_39"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const value = results[0]?.rawValue?.trim();
          if (value) {
            onDetected(value);
            stop();
            return;
          }
        } catch {
          // O próximo quadro tenta novamente; falhas transitórias são comuns durante o foco.
        }
        frameRef.current = requestAnimationFrame(() => void scan());
      };
      frameRef.current = requestAnimationFrame(() => void scan());
    } catch {
      stop();
      setError("Não foi possível acessar a câmera. Verifique a permissão do navegador.");
    }
  };

  return (
    <div className="camera-scanner">
      <button className="button button-secondary button-small" type="button" onClick={() => active ? stop() : void start()}>{active ? "Fechar câmera" : "Ler QR pela câmera"}</button>
      <video ref={videoRef} className={active ? "is-active" : ""} muted playsInline aria-label="Pré-visualização da câmera para leitura de etiqueta" />
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}

function OperationRow({ title, meta, status, tone, actions }: { title: string; meta: string; status: string; tone: "neutral" | "success" | "warning" | "danger"; actions?: React.ReactNode }) {
  return <article className="operation-row"><div><strong>{title}</strong><span>{meta}</span></div><span className={`operation-status is-${tone}`}>{status}</span>{actions ? <div className="operation-row-actions">{actions}</div> : null}</article>;
}

type OperationSectionProps = {
  dashboard: Dashboard;
  execute: (key: string, action: MutationAction, form?: HTMLFormElement) => Promise<void>;
  busyAction: string | null;
  canWrite: boolean;
};

function assetById(dashboard: Dashboard, assetId: string): Asset | undefined {
  return dashboard.nucleusInventory.find((asset) => asset.id === assetId);
}

function assetIdentifier(asset: Asset): string {
  return asset.sourceIdentifier || asset.id;
}

function assetLabel(asset: Asset | undefined): string {
  if (!asset) return "Patrimônio não localizado";
  return `${assetIdentifier(asset)} — ${asset.brandModel}`;
}
