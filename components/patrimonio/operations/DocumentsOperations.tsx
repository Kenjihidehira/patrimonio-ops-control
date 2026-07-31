"use client";

import { type FormEvent, useState } from "react";
import { assetDocumentUrl, uploadAssetDocument } from "../api";
import type { AssetContract, AssetDocument, AssetInspection, CustomField } from "../types";
import { EmptyState, formValue, formatDateTime } from "../ui";
import {
  AssetSelect,
  FormActions,
  InlineError,
  StatusPill,
  assetById,
  assetLabel,
  formatDate,
  type OperationProps,
  useOperationMutation,
} from "./shared";

type DocumentsPane = "documents" | "contracts" | "accounting" | "inspections" | "custom";
const accountingReferenceTime = Date.now();

const categoryLabels = {
  invoice: "Nota fiscal",
  warranty: "Garantia",
  inspection: "Laudo",
  photo: "Foto",
  contract: "Contrato",
  manual: "Manual",
  disposal: "Baixa",
  other: "Outro",
} as const;
const contractKindLabels = {
  purchase: "Compra",
  lease: "Locação",
  insurance: "Seguro",
  warranty: "Garantia",
  license: "Licença",
  service: "Serviço",
} as const;
const inspectionTypeLabels = { condition: "Estado físico", identification: "Identificação", count: "Contagem" } as const;
const inspectionStatusLabels = { pending: "Aguardando análise", processing: "Processando", needs_review: "Revisão necessária", approved: "Aprovada", rejected: "Rejeitada", failed: "Falhou" } as const;

export function DocumentsOperations(props: OperationProps) {
  const [pane, setPane] = useState<DocumentsPane>("documents");
  const operations = props.dashboard.operations;
  const panes: Array<{ id: DocumentsPane; label: string; count: number; admin?: boolean }> = [
    { id: "documents", label: "Documentos", count: operations.assetDocuments.length },
    { id: "contracts", label: "Contratos", count: operations.assetContracts.filter((item) => item.status === "active").length },
    { id: "accounting", label: "Contábil", count: operations.assetAccounting.length, admin: true },
    { id: "inspections", label: "Inspeções", count: operations.assetInspections.filter((item) => ["pending", "processing", "needs_review"].includes(item.status)).length },
    { id: "custom", label: "Campos", count: operations.customFields.length },
  ].filter((item) => !item.admin || props.dashboard.environment.isAdmin) as Array<{ id: DocumentsPane; label: string; count: number; admin?: boolean }>;

  return (
    <div className="operation-stack">
      <nav className="operation-subtabs" aria-label="Documentos e dados patrimoniais">
        {panes.map((item) => <button key={item.id} type="button" className={pane === item.id ? "is-active" : ""} onClick={() => setPane(item.id)}><span>{item.label}</span><strong>{item.count}</strong></button>)}
      </nav>
      {pane === "documents" ? <AssetDocuments {...props} /> : null}
      {pane === "contracts" ? <AssetContracts {...props} /> : null}
      {pane === "accounting" && props.dashboard.environment.isAdmin ? <AssetAccounting {...props} /> : null}
      {pane === "inspections" ? <AssetInspections {...props} /> : null}
      {pane === "custom" ? <CustomFields {...props} /> : null}
    </div>
  );
}

function AssetDocuments({ dashboard, onMutate, onRefresh, onToast }: OperationProps) {
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const mutation = useOperationMutation(onMutate);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setUploadError("Selecione um arquivo para enviar.");
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    try {
      const result = await uploadAssetDocument(file, {
        departmentSlug: dashboard.environment.activeDepartment.slug,
        expectedRevision: dashboard.revision,
        assetId: formValue(form, "assetId"),
        category: formValue(form, "category"),
        note: formValue(form, "note"),
        retentionUntil: formValue(form, "retentionUntil"),
      });
      await onRefresh();
      form.reset();
      onToast(result.message);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "Não foi possível enviar o documento.");
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="operation-module-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="document-upload-title">
        <div className="operational-panel-toolbar"><div><h2 id="document-upload-title">Anexar documento</h2><p>Arquivos privados com checksum, retenção e acesso temporário.</p></div></div>
        <form className="form-grid operation-form" onSubmit={submit}>
          <label className="field field-wide"><span>Patrimônio</span><AssetSelect assets={dashboard.nucleusInventory} /></label>
          <label className="field"><span>Categoria</span><select name="category" defaultValue="invoice">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Retenção até</span><input name="retentionUntil" type="date" /></label>
          <label className="field field-wide"><span>Arquivo</span><input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.docx,.xlsx" /></label>
          <label className="field field-wide"><span>Observação</span><textarea name="note" maxLength={500} rows={2} /></label>
          <InlineError message={uploadError ?? mutation.error} />
          <FormActions busy={uploadBusy} submitLabel="Armazenar documento" busyLabel="Protegendo arquivo..." />
        </form>
      </section>
      <section className="operational-panel operation-record-panel" aria-labelledby="document-list-title">
        <div className="operational-panel-toolbar"><div><h2 id="document-list-title">Arquivo patrimonial</h2><p>Notas, laudos, imagens, contratos e comprovantes.</p></div><span className="record-count">{dashboard.operations.assetDocuments.length} arquivos</span></div>
        {dashboard.operations.assetDocuments.length ? <div className="document-grid">{dashboard.operations.assetDocuments.map((document) => <DocumentCard key={document.id} document={document} departmentSlug={dashboard.environment.activeDepartment.slug} busy={mutation.busyKey === document.id} onDelete={() => void mutation.run(document.id, { type: "delete_asset_document", documentId: document.id })} />)}</div> : <EmptyState title="Nenhum documento anexado" description="Envie notas fiscais, garantias, fotos ou laudos para o arquivo privado." />}
      </section>
    </div>
  );
}

function DocumentCard({ document, departmentSlug, busy, onDelete }: { document: AssetDocument; departmentSlug: string; busy: boolean; onDelete: () => void }) {
  return <article className="document-card"><div className="document-card-icon" aria-hidden="true">{document.mimeType.startsWith("image/") ? "IMG" : document.mimeType === "application/pdf" ? "PDF" : "DOC"}</div><div className="document-card-main"><strong>{document.fileName}</strong><span>{document.assetId} · {categoryLabels[document.category]}</span><small>{formatBytes(document.byteSize)} · {formatDateTime(document.uploadedAt)}</small></div><div className="document-card-actions"><a className="button button-secondary button-small" href={assetDocumentUrl(document.id, departmentSlug)} target="_blank" rel="noreferrer">Abrir</a><button className="button button-secondary button-small" type="button" disabled={busy} onClick={onDelete}>Remover</button></div></article>;
}

function AssetContracts({ dashboard, onMutate }: OperationProps) {
  const { busyKey, error, run } = useOperationMutation(onMutate);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    void run("create-contract", { type: "create_asset_contract", contract: { id: crypto.randomUUID(), assetId: formValue(form, "assetId"), kind: formValue(form, "kind"), name: formValue(form, "name"), provider: formValue(form, "provider"), contractNumber: formValue(form, "contractNumber"), startsOn: formValue(form, "startsOn"), endsOn: formValue(form, "endsOn"), renewalNoticeDays: formValue(form, "renewalNoticeDays"), monthlyCost: formValue(form, "monthlyCost"), currency: "BRL", documentId: formValue(form, "documentId"), notes: formValue(form, "notes") } }, () => form.reset());
  }
  function update(contract: AssetContract, status: "active" | "expired" | "cancelled") { void run(contract.id, { type: "update_asset_contract_status", contractId: contract.id, status }); }
  return <div className="operation-module-layout"><section className="operational-panel operation-form-panel" aria-labelledby="contract-create-title"><div className="operational-panel-toolbar"><div><h2 id="contract-create-title">Cadastrar contrato</h2><p>Garantias, locações, seguros, licenças e serviços por ativo.</p></div></div><form className="form-grid operation-form" onSubmit={submit}>
    <label className="field field-wide"><span>Patrimônio</span><AssetSelect assets={dashboard.nucleusInventory} /></label><label className="field"><span>Tipo</span><select name="kind" defaultValue="warranty">{Object.entries(contractKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Número</span><input name="contractNumber" maxLength={120} /></label><label className="field field-wide"><span>Nome</span><input name="name" minLength={3} maxLength={180} required /></label><label className="field field-wide"><span>Fornecedor</span><input name="provider" maxLength={180} /></label><label className="field"><span>Início</span><input name="startsOn" type="date" /></label><label className="field"><span>Vencimento</span><input name="endsOn" type="date" /></label><label className="field"><span>Aviso prévio (dias)</span><input name="renewalNoticeDays" type="number" min="0" max="3650" defaultValue="30" /></label>{dashboard.environment.isAdmin ? <label className="field"><span>Custo mensal (R$)</span><input name="monthlyCost" type="number" min="0" step="0.01" defaultValue="0" /></label> : <input name="monthlyCost" type="hidden" value="0" />}<label className="field field-wide"><span>Documento vinculado</span><select name="documentId" defaultValue=""><option value="">Sem documento</option>{dashboard.operations.assetDocuments.map((document) => <option key={document.id} value={document.id}>{document.fileName} · {document.assetId}</option>)}</select></label><label className="field field-wide"><span>Observações</span><textarea name="notes" maxLength={500} rows={2} /></label><InlineError message={error} /><FormActions busy={busyKey === "create-contract"} submitLabel="Cadastrar contrato" />
  </form></section><section className="operational-panel operation-record-panel" aria-labelledby="contract-list-title"><div className="operational-panel-toolbar"><div><h2 id="contract-list-title">Vigências e garantias</h2><p>Alertas de renovação e vencimento por patrimônio.</p></div><span className="record-count">{dashboard.operations.assetContracts.length} contratos</span></div>{dashboard.operations.assetContracts.length ? <div className="operation-record-list">{dashboard.operations.assetContracts.map((contract) => { const expiring = contract.endsOn ? daysUntil(contract.endsOn) <= contract.renewalNoticeDays && daysUntil(contract.endsOn) >= 0 : false; return <article className="operation-record" key={contract.id}><div className="operation-record-main"><strong>{contract.name}</strong><span>{contractKindLabels[contract.kind]} · {contract.assetId} · {contract.provider || "Fornecedor não informado"}</span><small>{contract.endsOn ? `Vence em ${formatDate(contract.endsOn)}` : "Sem vencimento"}{contract.monthlyCost !== null ? ` · ${formatCurrency(contract.monthlyCost)}/mês` : ""}</small></div><StatusPill label={expiring ? "Renovação próxima" : contract.status === "active" ? "Vigente" : contract.status === "expired" ? "Expirado" : "Cancelado"} tone={expiring ? "warning" : contract.status === "active" ? "success" : "neutral"} />{contract.status === "active" ? <div className="operation-record-actions"><button className="button button-secondary button-small" type="button" disabled={busyKey === contract.id} onClick={() => update(contract, "expired")}>Marcar expirado</button><button className="button button-secondary button-small" type="button" disabled={busyKey === contract.id} onClick={() => update(contract, "cancelled")}>Cancelar</button></div> : null}</article>; })}</div> : <EmptyState title="Nenhum contrato" description="Cadastre garantias e contratos para receber alertas de vigência." />}</section></div>;
}

function AssetAccounting({ dashboard, onMutate }: OperationProps) {
  const { busyKey, error, run } = useOperationMutation(onMutate);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; void run("save-accounting", { type: "upsert_asset_accounting", accounting: { assetId: formValue(form, "assetId"), acquisitionValue: formValue(form, "acquisitionValue"), residualValue: formValue(form, "residualValue"), depreciationMethod: formValue(form, "depreciationMethod"), usefulLifeMonths: formValue(form, "usefulLifeMonths"), depreciationStartsOn: formValue(form, "depreciationStartsOn"), costCenter: formValue(form, "costCenter"), ledgerAccount: formValue(form, "ledgerAccount"), supplier: formValue(form, "supplier"), purchaseOrder: formValue(form, "purchaseOrder"), invoiceNumber: formValue(form, "invoiceNumber") } }, () => form.reset()); }
  const totalBookValue = dashboard.operations.assetAccounting.reduce((sum, item) => sum + accountingBookValue(item), 0);
  return <div className="operation-module-layout"><section className="operational-panel operation-form-panel" aria-labelledby="accounting-create-title"><div className="operational-panel-toolbar"><div><h2 id="accounting-create-title">Dados contábeis</h2><p>Valor, depreciação, centro de custo e documentos de compra.</p></div></div><form className="form-grid operation-form" onSubmit={submit}><label className="field field-wide"><span>Patrimônio</span><AssetSelect assets={dashboard.nucleusInventory} /></label><label className="field"><span>Valor de aquisição</span><input name="acquisitionValue" type="number" min="0" step="0.01" required /></label><label className="field"><span>Valor residual</span><input name="residualValue" type="number" min="0" step="0.01" defaultValue="0" /></label><label className="field"><span>Depreciação</span><select name="depreciationMethod" defaultValue="straight_line"><option value="straight_line">Linear</option><option value="none">Não depreciar</option></select></label><label className="field"><span>Vida útil (meses)</span><input name="usefulLifeMonths" type="number" min="1" max="1200" /></label><label className="field"><span>Início da depreciação</span><input name="depreciationStartsOn" type="date" /></label><label className="field"><span>Centro de custo</span><input name="costCenter" maxLength={80} /></label><label className="field"><span>Conta contábil</span><input name="ledgerAccount" maxLength={80} /></label><label className="field"><span>Fornecedor</span><input name="supplier" maxLength={180} /></label><label className="field"><span>Pedido de compra</span><input name="purchaseOrder" maxLength={120} /></label><label className="field"><span>Nota fiscal</span><input name="invoiceNumber" maxLength={120} /></label><InlineError message={error} /><FormActions busy={busyKey === "save-accounting"} submitLabel="Salvar dados contábeis" /></form></section><section className="operational-panel operation-record-panel" aria-labelledby="accounting-list-title"><div className="operational-panel-toolbar"><div><h2 id="accounting-list-title">Valor líquido estimado</h2><p>Depreciação linear calculada a partir dos parâmetros cadastrados.</p></div><strong className="accounting-total">{formatCurrency(totalBookValue)}</strong></div>{dashboard.operations.assetAccounting.length ? <div className="operation-record-list">{dashboard.operations.assetAccounting.map((item) => { const asset = assetById(dashboard, item.assetId); return <article className="operation-record" key={item.assetId}><div className="operation-record-main"><strong>{asset ? assetLabel(asset) : item.assetId}</strong><span>{item.costCenter || "Centro de custo não informado"} · {item.supplier || "Fornecedor não informado"}</span><small>Aquisição {formatCurrency(item.acquisitionValue)} · residual {formatCurrency(item.residualValue)}</small></div><div className="accounting-value"><small>Valor líquido</small><strong>{formatCurrency(accountingBookValue(item))}</strong></div></article>; })}</div> : <EmptyState title="Nenhum dado contábil" description="Cadastre valor e vida útil para acompanhar a depreciação." />}</section></div>;
}

function AssetInspections({ dashboard, onMutate }: OperationProps) {
  const { busyKey, error, run } = useOperationMutation(onMutate);
  const photos = dashboard.operations.assetDocuments.filter((document) => document.mimeType.startsWith("image/"));
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; void run("create-inspection", { type: "create_asset_inspection", inspection: { id: crypto.randomUUID(), assetId: formValue(form, "assetId"), documentId: formValue(form, "documentId"), inspectionType: formValue(form, "inspectionType") } }, () => form.reset()); }
  function analyze(item: AssetInspection) { void run(item.id, { type: "record_asset_inspection_result", inspectionId: item.id, status: "needs_review", provider: "manual-assisted", detectedAssetCode: item.assetId, confidence: "1", findings: { condition: "review_required", source: "operator" }, modelVersion: "human-review-v1" }); }
  function review(item: AssetInspection, status: "approved" | "rejected") { void run(item.id, { type: "review_asset_inspection", inspectionId: item.id, status, note: status === "approved" ? "Inspeção validada pelo operador." : "Inspeção recusada para nova captura." }); }
  return <div className="operation-module-layout"><section className="operational-panel operation-form-panel" aria-labelledby="inspection-create-title"><div className="operational-panel-toolbar"><div><h2 id="inspection-create-title">Solicitar inspeção</h2><p>Vincule uma foto para identificação ou análise do estado físico.</p></div></div><form className="form-grid operation-form" onSubmit={submit}><label className="field field-wide"><span>Patrimônio</span><AssetSelect assets={dashboard.nucleusInventory} /></label><label className="field"><span>Tipo</span><select name="inspectionType" defaultValue="condition">{Object.entries(inspectionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field field-wide"><span>Foto</span><select name="documentId" defaultValue=""><option value="">Sem foto vinculada</option>{photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.fileName} · {photo.assetId}</option>)}</select></label><InlineError message={error} /><FormActions busy={busyKey === "create-inspection"} submitLabel="Criar inspeção" /></form></section><section className="operational-panel operation-record-panel" aria-labelledby="inspection-list-title"><div className="operational-panel-toolbar"><div><h2 id="inspection-list-title">Fila de inspeções</h2><p>Resultado assistido e decisão humana obrigatória.</p></div><span className="record-count">{dashboard.operations.assetInspections.length} inspeções</span></div>{dashboard.operations.assetInspections.length ? <div className="operation-record-list">{dashboard.operations.assetInspections.map((item) => <article className="operation-record" key={item.id}><div className="operation-record-main"><strong>{inspectionTypeLabels[item.inspectionType]} · {item.assetId}</strong><span>{item.provider}{item.confidence !== null ? ` · ${Math.round(item.confidence * 100)}% de confiança` : ""}</span><small>{item.requestedBy} · {formatDateTime(item.requestedAt)}</small></div><StatusPill label={inspectionStatusLabels[item.status]} tone={item.status === "approved" ? "success" : item.status === "rejected" || item.status === "failed" ? "danger" : item.status === "needs_review" ? "warning" : "info"} />{dashboard.environment.isAdmin && item.status === "pending" ? <div className="operation-record-actions"><button className="button button-secondary button-small" type="button" disabled={busyKey === item.id} onClick={() => analyze(item)}>Encaminhar à revisão</button></div> : null}{item.status === "needs_review" ? <div className="operation-record-actions"><button className="button button-primary button-small" type="button" disabled={busyKey === item.id} onClick={() => review(item, "approved")}>Aprovar</button><button className="button button-secondary button-small" type="button" disabled={busyKey === item.id} onClick={() => review(item, "rejected")}>Recusar</button></div> : null}</article>)}</div> : <EmptyState title="Nenhuma inspeção" description="Crie uma inspeção de condição, identificação ou contagem." />}</section></div>;
}

function CustomFields({ dashboard, onMutate }: OperationProps) {
  const { busyKey, error, setError, run } = useOperationMutation(onMutate);
  const [selectedFieldId, setSelectedFieldId] = useState("");
  const selectedField = dashboard.operations.customFields.find((field) => field.id === selectedFieldId);
  function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const options = formValue(form, "options").split(",").map((item) => item.trim()).filter(Boolean); void run("create-field", { type: "create_custom_field", field: { id: crypto.randomUUID(), name: formValue(form, "name"), fieldType: formValue(form, "fieldType"), options, required: (form.elements.namedItem("required") as HTMLInputElement | null)?.checked === true } }, () => form.reset()); }
  function setValue(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; if (!selectedField) { setError("Selecione um campo personalizado."); return; } const raw = formValue(form, "value"); const value = customValue(selectedField, raw); void run("set-field-value", { type: "set_asset_custom_value", assetId: formValue(form, "assetId"), fieldId: selectedField.id, value }, () => form.reset()); }
  return <div className="tracking-layout"><section className="operational-panel operation-form-panel" aria-labelledby="custom-create-title"><div className="operational-panel-toolbar"><div><h2 id="custom-create-title">Definir campo</h2><p>Amplie o cadastro sem alterar o modelo principal.</p></div></div>{dashboard.environment.isAdmin ? <form className="form-grid operation-form" onSubmit={create}><label className="field field-wide"><span>Nome</span><input name="name" minLength={2} maxLength={80} required /></label><label className="field"><span>Tipo</span><select name="fieldType" defaultValue="text"><option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option><option value="boolean">Sim/Não</option><option value="select">Lista</option></select></label><label className="field field-wide"><span>Opções da lista</span><input name="options" placeholder="Opção A, Opção B" /></label><label className="operation-checkbox field-wide"><input name="required" type="checkbox" /><span>Preenchimento obrigatório</span></label><InlineError message={error} /><FormActions busy={busyKey === "create-field"} submitLabel="Criar campo" /></form> : <div className="operations-clear-state compact"><strong>Configuração administrativa</strong><span>Somente administradores podem criar novos campos.</span></div>}</section><section className="operational-panel operation-form-panel" aria-labelledby="custom-value-title"><div className="operational-panel-toolbar"><div><h2 id="custom-value-title">Preencher valor</h2><p>Atribua o campo a qualquer patrimônio.</p></div></div><form className="form-grid operation-form" onSubmit={setValue}><label className="field field-wide"><span>Patrimônio</span><AssetSelect assets={dashboard.nucleusInventory} /></label><label className="field field-wide"><span>Campo</span><select value={selectedFieldId} onChange={(event) => setSelectedFieldId(event.target.value)} required><option value="">Selecione</option>{dashboard.operations.customFields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><CustomValueInput field={selectedField} /><InlineError message={error} /><FormActions busy={busyKey === "set-field-value"} submitLabel="Salvar valor" /></form></section><section className="operational-panel tracking-history-panel" aria-labelledby="custom-list-title"><div className="operational-panel-toolbar"><div><h2 id="custom-list-title">Campos ativos</h2><p>Definições e cobertura atual no inventário.</p></div><span className="record-count">{dashboard.operations.customFields.length} campos</span></div>{dashboard.operations.customFields.length ? <div className="tracking-tag-grid">{dashboard.operations.customFields.map((field) => { const count = dashboard.operations.assetCustomValues.filter((value) => value.fieldId === field.id).length; return <article className="tracking-tag-card" key={field.id}><StatusPill label={field.fieldType} tone="info" /><strong>{field.name}</strong><span>{count} patrimônios preenchidos</span><small>{field.required ? "Obrigatório" : "Opcional"}</small></article>; })}</div> : <EmptyState title="Nenhum campo personalizado" description="Crie campos para requisitos específicos do departamento." />}</section></div>;
}

function CustomValueInput({ field }: { field: CustomField | undefined }) {
  if (field?.fieldType === "boolean") return <label className="field field-wide"><span>Valor</span><select name="value" defaultValue="true"><option value="true">Sim</option><option value="false">Não</option></select></label>;
  if (field?.fieldType === "select") return <label className="field field-wide"><span>Valor</span><select name="value" defaultValue="" required><option value="">Selecione</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
  return <label className="field field-wide"><span>Valor</span><input name="value" type={field?.fieldType === "number" ? "number" : field?.fieldType === "date" ? "date" : "text"} required /></label>;
}

function customValue(field: CustomField, raw: string): unknown { if (field.fieldType === "boolean") return raw === "true"; if (field.fieldType === "number") return Number(raw); return raw; }
function formatBytes(value: number): string { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} MB` : `${Math.ceil(value / 1_000)} KB`; }
function formatCurrency(value: number): string { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value); }
function daysUntil(value: string): number { return Math.ceil((new Date(`${value}T23:59:59`).getTime() - accountingReferenceTime) / 86_400_000); }
function accountingBookValue(item: { acquisitionValue: number; residualValue: number; depreciationMethod: "straight_line" | "none"; usefulLifeMonths: number | null; depreciationStartsOn: string | null }): number { if (item.depreciationMethod === "none" || !item.usefulLifeMonths || !item.depreciationStartsOn) return item.acquisitionValue; const start = new Date(`${item.depreciationStartsOn}T00:00:00`); const now = new Date(accountingReferenceTime); const months = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth()); const depreciable = item.acquisitionValue - item.residualValue; return Math.max(item.residualValue, item.acquisitionValue - (depreciable / item.usefulLifeMonths) * months); }
