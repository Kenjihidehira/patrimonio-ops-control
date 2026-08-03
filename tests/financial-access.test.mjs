import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDashboard } from "../lib/domain.js";
import { createExportWorkbook, readWorkbookRows } from "../lib/workbook.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  migration,
  gateway,
  stateRoute,
  exportRoute,
  workbookSource,
  environments,
  documents,
  lifecycle,
] = await Promise.all([
  read("supabase/migrations/20260803150312_protect_financial_data.sql"),
  read("supabase/functions/patrimonio-gateway/index.ts"),
  read("app/api/state/route.ts"),
  read("app/api/export/route.ts"),
  read("lib/workbook.ts"),
  read("components/patrimonio/EnvironmentsView.tsx"),
  read("components/patrimonio/operations/DocumentsOperations.tsx"),
  read("components/patrimonio/operations/LifecycleOperations.tsx"),
]);

test("banco cria permissão financeira explícita com rollout retrocompatível", () => {
  assert.match(migration, /add column can_view_financial_data boolean not null default false/);
  assert.match(migration, /set can_view_financial_data = true[\s\S]*where is_admin/);
  assert.match(migration, /check \(not is_admin or can_view_financial_data\)/);
  assert.match(migration, /patrimonio_save_user_access_v5/);
  assert.match(migration, /target_can_view_financial_data boolean := target_active[\s\S]*target_is_admin or coalesce\(p_can_view_financial_data, false\)/);
  assert.match(migration, /can_view_financial_data = excluded.can_view_financial_data[\s\S]*session_version = public\.patrimonio_users\.session_version \+ 1/);
  assert.match(migration, /patrimonio_save_user_access_v4[\s\S]*patrimonio_save_user_access_v5/);
  assert.doesNotMatch(
    migration,
    /revoke all on function public\.patrimonio_load_advanced_context\(text, text, boolean\)[\s\S]{0,80}from service_role/,
  );
});

test("projeção financeira ocorre no banco e no gateway antes do Worker", () => {
  assert.match(migration, /p_can_view_financial_data boolean/);
  assert.match(migration, /case when coalesce\(p_can_view_financial_data, false\) then monthly_cost else null end/);
  assert.match(migration, /'assetAccounting', case when coalesce\(p_can_view_financial_data, false\)/);
  assert.match(migration, /case when coalesce\(p_can_view_financial_data, false\) then estimated_cost else null end/);
  assert.match(gateway, /loadAssets\(ownerKey, canViewFinancialData\)/);
  assert.match(gateway, /const financialFields = canViewFinancialData[\s\S]*acquisition_value,operation_value,invoice_number/);
  assert.match(gateway, /loadAdvancedData\(ownerKey, identifier, access\.isAdmin, canViewFinancialData\)/);
  assert.match(gateway, /p_can_view_financial_data: canViewFinancialData === true/);
  assert.match(gateway, /canViewFinancialData: user\.is_admin === true \|\| user\.can_view_financial_data === true/);
  assert.match(stateRoute, /includeFinancials: workspace\.environment\?\.permissions\.canViewFinancialData === true/);
  assert.match(stateRoute, /includeFinancials: updated\.environment\?\.permissions\.canViewFinancialData === true/);
});

test("canViewFinancialData permanece somente leitura", () => {
  assert.match(gateway, /enforceFinancialActionPermission\([\s\S]*access\.isAdmin/);
  assert.match(gateway, /!access\.isAdmin[\s\S]*payload\.assets\.some\(hasFinancialAssetPayload\)/);
  assert.match(migration, /create_lifecycle_request[\s\S]*not coalesce\(p_is_admin, false\)[\s\S]*estimatedCost/);
  assert.match(migration, /set_asset_custom_value[\s\S]*not coalesce\(p_is_admin, false\)/);
  assert.match(documents, /dashboard\.environment\.isAdmin \? <label className="field"><span>Custo mensal/);
  assert.match(documents, /dashboard\.environment\.isAdmin \? \([\s\S]*<form className="form-grid operation-form" onSubmit=\{submit\}>/);
  assert.match(lifecycle, /dashboard\.environment\.isAdmin \? <label className="field"><span>Valor estimado/);
});

test("documentos e campos genéricos carregam classificação financeira persistida", () => {
  assert.match(migration, /patrimonio_asset_documents[\s\S]*add column contains_financial_data boolean not null default false/);
  assert.match(migration, /category in \('invoice', 'contract', 'disposal'\)/);
  assert.match(migration, /patrimonio_custom_fields[\s\S]*add column contains_financial_data boolean not null default false/);
  assert.match(migration, /from public\.patrimonio_custom_fields[\s\S]*not contains_financial_data[\s\S]*p_can_view_financial_data/);
  assert.match(migration, /not field\.contains_financial_data[\s\S]*p_can_view_financial_data/);
  assert.match(migration, /case when coalesce\(p_can_view_financial_data, false\)[\s\S]*then details else '\{\}'::jsonb end as details/);
  assert.match(gateway, /select=storage_path,file_name,contains_financial_data/);
  assert.match(gateway, /financial_document_access_denied/);
  assert.match(gateway, /financial_document_opened/);
  assert.match(documents, /containsFinancialData/);
  assert.match(documents, /Documento contém dados financeiros/);
  assert.match(documents, /Campo financeiro/);
});

test("exportação financeira é explícita, cumulativa e auditável", () => {
  assert.match(exportRoute, /scope === "financial" \? "export_financial" : "export"/);
  assert.match(exportRoute, /scope === "financial"[\s\S]*authorization\.canViewFinancialData === true/);
  assert.match(migration, /normalized_operation = 'export_financial'[\s\S]*app_user\.can_export[\s\S]*app_user\.can_view_financial_data/);
  assert.match(migration, /'includesFinancialData', normalized_operation = 'export_financial'/);
  assert.match(workbookSource, /includeFinancials/);
  assert.match(workbookSource, /sheet\("Contábil"/);
  assert.match(workbookSource, /sheet\("Custos contratuais"/);
  assert.match(workbookSource, /sheet\("Solicitações financeiras"/);
});

test("XLSX usa compactação compatível com o runtime Cloudflare", () => {
  assert.match(workbookSource, /from "write-excel-file\/node"/);
  assert.match(workbookSource, /\.toBuffer\(\)/);
  assert.doesNotMatch(workbookSource, /\.toBlob\(\)/);
});

test("interface administra a permissão sem transformá-la em escrita ou exportação", () => {
  assert.match(environments, /Visualizar valores e dados contábeis/);
  assert.match(environments, /Libera somente consulta/);
  assert.match(environments, /checked=\{accessForm\.isAdmin \|\| accessForm\.canViewFinancialData\}/);
  assert.match(environments, /disabled=\{accessForm\.isAdmin \|\| !accessForm\.active\}/);
  assert.match(environments, /Dados financeiros/);
});

test("domínio mascara valores por padrão e os projeta somente quando autorizado", () => {
  const state = {
    revision: 1,
    nuclei: [{ id: "n1", code: "N1", name: "Núcleo", location: "Matriz", manager: "Gestor" }],
    collaborators: [],
    assets: [{
      id: "123456",
      type: "cpu",
      nucleusId: "n1",
      assignee: "",
      location: "Matriz",
      serial: "SERIE",
      brandModel: "Computador",
      acquiredAt: "2026-01-10",
      value: 2500,
      status: "available",
      notes: "",
      sourceSystem: null,
      sourceFingerprint: "",
      baseCode: "",
      incorporation: null,
      sourceIdentifier: "",
      sourceDescription: "",
      assetGroup: "",
      branchCode: "",
      disposedAt: null,
      operationValue: 2300,
      invoiceNumber: "NF-99",
      sourceRow: null,
      createdAt: "2026-01-10T12:00:00.000Z",
      movements: [],
    }],
  };
  const hidden = buildDashboard(state);
  assert.equal(hidden.inventory[0].value, null);
  assert.equal(hidden.inventory[0].operationValue, null);
  assert.equal(hidden.inventory[0].invoiceNumber, "");
  const visible = buildDashboard(state, {}, { includeFinancials: true });
  assert.equal(visible.inventory[0].value, 2500);
  assert.equal(visible.inventory[0].operationValue, 2300);
  assert.equal(visible.inventory[0].invoiceNumber, "NF-99");
});

test("XLSX operacional omite valores e XLSX financeiro inclui as colunas", async () => {
  const dashboard = {
    inventory: [{
      id: "123456",
      hasPatrimony: true,
      type: "cpu",
      nucleus: { name: "Núcleo" },
      assignee: "",
      location: "Matriz",
      serial: "SERIE",
      brandModel: "Computador",
      acquiredAt: "2026-01-10",
      value: 2500,
      status: "available",
      notes: "",
      sourceSystem: null,
      baseCode: "",
      incorporation: null,
      sourceIdentifier: "123456",
      sourceDescription: "",
      assetGroup: "",
      branchCode: "",
      disposedAt: null,
      operationValue: 2300,
      invoiceNumber: "NF-99",
    }],
    nuclei: [],
    audit: [],
    options: { assetTypes: { cpu: "Computador" }, statuses: { available: "Disponível" } },
    operations: { assetAccounting: [], assetContracts: [], lifecycleRequests: [] },
  };
  const operationalDashboard = { ...dashboard, operations: undefined };
  const operational = await createExportWorkbook(operationalDashboard, []);
  const operationalRows = await readWorkbookRows(operational);
  assert.equal(operationalRows[0].includes("Valor de aquisição"), false);
  assert.equal(operationalRows[1].includes(2500), false);

  const financial = await createExportWorkbook(dashboard, [], { includeFinancials: true });
  const financialRows = await readWorkbookRows(financial);
  assert.equal(financialRows[0].includes("Valor de aquisição"), true);
  assert.equal(financialRows[1].includes(2500), true);

  const productionVolume = {
    ...operationalDashboard,
    inventory: Array.from({ length: 374 }, (_, index) => ({
      ...dashboard.inventory[0],
      id: String(200000 + index),
      sourceIdentifier: String(200000 + index),
    })),
  };
  const productionWorkbook = await createExportWorkbook(productionVolume, []);
  const signature = new Uint8Array(await productionWorkbook.slice(0, 4).arrayBuffer());
  assert.deepEqual(Array.from(signature), [0x50, 0x4b, 0x03, 0x04]);
  const productionRows = await readWorkbookRows(productionWorkbook);
  assert.equal(productionRows.length, 375);
});
