import { readSheet } from "read-excel-file/universal";
import writeExcelFile from "write-excel-file/universal";
import type { Cell, Sheet, SheetData } from "write-excel-file/universal";

type ExportAsset = {
  id: string;
  hasPatrimony: boolean;
  type: string;
  nucleus: { name: string };
  assignee: string;
  location: string;
  serial: string;
  brandModel: string;
  acquiredAt: string | null;
  value: number | null;
  status: string;
  notes: string;
  sourceSystem: "sabium" | null;
  baseCode: string;
  incorporation: number | null;
  sourceIdentifier: string;
  sourceDescription: string;
  assetGroup: string;
  branchCode: string;
  disposedAt: string | null;
  operationValue: number | null;
  invoiceNumber: string;
};

type ExportNucleus = {
  code: string;
  name: string;
  location: string;
  manager: string;
  total: number;
  allocated: number;
  alerts: number;
};

type ExportMovement = {
  at: string;
  assetId: string;
  hasPatrimony: boolean;
  assetType: string;
  typeLabel: string;
  from: string;
  to: string;
  actor: string;
  note: string;
};

type ExportDashboard = {
  inventory: ExportAsset[];
  nuclei: ExportNucleus[];
  audit: ExportMovement[];
  options: {
    assetTypes: Record<string, string>;
    statuses: Record<string, string>;
  };
  operations: {
    assetAccounting: Array<{
      assetId: string;
      acquisitionValue: number;
      residualValue: number;
      depreciationMethod: string;
      usefulLifeMonths: number | null;
      depreciationStartsOn: string | null;
      costCenter: string;
      ledgerAccount: string;
      supplier: string;
      purchaseOrder: string;
      invoiceNumber: string;
      updatedAt: string;
    }>;
    assetContracts: Array<{
      assetId: string;
      kind: string;
      name: string;
      provider: string;
      contractNumber: string;
      startsOn: string | null;
      endsOn: string | null;
      monthlyCost: number | null;
      currency: string;
      status: string;
    }>;
    lifecycleRequests: Array<{
      requestType: string;
      assetId: string | null;
      title: string;
      quantity: number;
      estimatedCost: number | null;
      status: string;
      requestedBy: string;
      requestedAt: string;
    }>;
  };
};

type ExportImportRun = {
  createdAt: string;
  fileName: string;
  rowCount: number;
  inserted: number;
  updated: number;
  rejected: number;
  importedBy: string;
};

const headerStyle = {
  fontWeight: "bold" as const,
  backgroundColor: "#173f35",
  textColor: "#ffffff",
  align: "left" as const,
};

export async function readWorkbookRows(file: Blob) {
  return readSheet(file);
}

export async function createExportWorkbook(
  dashboard: ExportDashboard,
  imports: ExportImportRun[],
  options: { includeFinancials?: boolean } = {},
) {
  const includeFinancials = options.includeFinancials === true;
  const inventory = [
    headerRow([
      "Patrimônio",
      "Tipo",
      "Núcleo",
      "Responsável",
      "Localização",
      "Número de série",
      "Marca e modelo",
      "Aquisição",
      ...(includeFinancials ? ["Valor de aquisição", "Valor da operação", "Número da nota"] : []),
      "Status",
      "Observações",
      "Sistema de origem",
      "Patrimônio-base",
      "Incorporação",
      "Identificador de origem",
      "Descrição original",
      "Grupo",
      "Filial",
      "Data de baixa",
    ]),
    ...dashboard.inventory.map((asset) => [
      textCell(asset.hasPatrimony ? asset.sourceIdentifier || asset.id : "Sem patrimônio"),
      textCell(dashboard.options.assetTypes[asset.type]),
      textCell(asset.nucleus.name),
      textCell(asset.assignee),
      textCell(asset.location),
      textCell(asset.serial),
      textCell(asset.brandModel),
      dateCell(asset.acquiredAt),
      ...(includeFinancials
        ? [moneyCell(asset.value), moneyCell(asset.operationValue), textCell(asset.invoiceNumber)]
        : []),
      textCell(dashboard.options.statuses[asset.status]),
      textCell(asset.notes),
      textCell(asset.sourceSystem === "sabium" ? "Sabium" : ""),
      textCell(asset.baseCode),
      asset.incorporation === null ? textCell("") : numberCell(asset.incorporation),
      textCell(asset.sourceIdentifier),
      textCell(asset.sourceDescription),
      textCell(asset.assetGroup),
      textCell(asset.branchCode),
      dateCell(asset.disposedAt),
    ]),
  ];

  const nuclei = [
    headerRow(["Código", "Núcleo", "Localização", "Gestor", "Ativos", "Em uso", "Alertas"]),
    ...dashboard.nuclei.map((nucleus) => [
      textCell(nucleus.code),
      textCell(nucleus.name),
      textCell(nucleus.location),
      textCell(nucleus.manager),
      numberCell(nucleus.total),
      numberCell(nucleus.allocated),
      numberCell(nucleus.alerts),
    ]),
  ];

  const audit = [
    headerRow(["Data", "Patrimônio", "Item", "Movimentação", "Origem", "Destino", "Responsável", "Observação"]),
    ...dashboard.audit.map((movement) => [
      dateTimeCell(movement.at),
      textCell(movement.hasPatrimony ? movement.assetId : "Sem patrimônio"),
      textCell(movement.assetType),
      textCell(movement.typeLabel),
      textCell(movement.from),
      textCell(movement.to),
      textCell(movement.actor),
      textCell(movement.note),
    ]),
  ];

  const importHistory = [
    headerRow(["Data", "Arquivo", "Linhas válidas", "Inseridos", "Atualizados", "Excluídos", "Importado por"]),
    ...imports.map((run) => [
      dateTimeCell(run.createdAt),
      textCell(run.fileName),
      numberCell(run.rowCount),
      numberCell(run.inserted),
      numberCell(run.updated),
      numberCell(run.rejected),
      textCell(run.importedBy),
    ]),
  ];

  const accounting = [
    headerRow(["Patrimônio", "Valor de aquisição", "Valor residual", "Método", "Vida útil (meses)", "Início da depreciação", "Centro de custo", "Conta contábil", "Fornecedor", "Pedido de compra", "Nota fiscal", "Atualizado em"]),
    ...dashboard.operations.assetAccounting.map((item) => [
      textCell(item.assetId),
      moneyCell(item.acquisitionValue),
      moneyCell(item.residualValue),
      textCell(item.depreciationMethod === "straight_line" ? "Linear" : "Sem depreciação"),
      item.usefulLifeMonths === null ? textCell("") : numberCell(item.usefulLifeMonths),
      dateCell(item.depreciationStartsOn),
      textCell(item.costCenter),
      textCell(item.ledgerAccount),
      textCell(item.supplier),
      textCell(item.purchaseOrder),
      textCell(item.invoiceNumber),
      dateTimeCell(item.updatedAt),
    ]),
  ];

  const contractCosts = [
    headerRow(["Patrimônio", "Tipo", "Contrato", "Fornecedor", "Número", "Início", "Vencimento", "Custo mensal", "Moeda", "Status"]),
    ...dashboard.operations.assetContracts.map((item) => [
      textCell(item.assetId),
      textCell(item.kind),
      textCell(item.name),
      textCell(item.provider),
      textCell(item.contractNumber),
      dateCell(item.startsOn),
      dateCell(item.endsOn),
      moneyCell(item.monthlyCost),
      textCell(item.currency),
      textCell(item.status),
    ]),
  ];

  const lifecycleCosts = [
    headerRow(["Tipo", "Patrimônio", "Solicitação", "Quantidade", "Valor estimado", "Status", "Solicitante", "Data"]),
    ...dashboard.operations.lifecycleRequests.map((item) => [
      textCell(item.requestType),
      textCell(item.assetId),
      textCell(item.title),
      numberCell(item.quantity),
      moneyCell(item.estimatedCost),
      textCell(item.status),
      textCell(item.requestedBy),
      dateTimeCell(item.requestedAt),
    ]),
  ];

  const sheets: Sheet<Blob>[] = [
    sheet("Inventário", inventory, [
      14, 20, 28, 28, 28, 22, 30, 14,
      ...(includeFinancials ? [18, 18, 20] : []),
      16, 38,
      18, 18, 14, 22, 42, 26, 14, 14,
    ]),
    sheet("Núcleos", nuclei, [14, 30, 28, 28, 12, 12, 12]),
    sheet("Auditoria", audit, [20, 14, 20, 22, 34, 34, 28, 42]),
    sheet("Importações", importHistory, [20, 34, 16, 14, 14, 14, 28]),
  ];
  if (includeFinancials) {
    sheets.push(
      sheet("Contábil", accounting, [16, 18, 18, 20, 18, 20, 22, 22, 28, 22, 20, 20]),
      sheet("Custos contratuais", contractCosts, [16, 18, 28, 28, 20, 14, 14, 18, 10, 16]),
      sheet("Solicitações financeiras", lifecycleCosts, [18, 16, 34, 14, 18, 16, 28, 20]),
    );
  }

  return writeExcelFile(
    sheets,
    { fontFamily: "Arial", fontSize: 10 },
  ).toBlob();
}

function sheet(name: string, data: SheetData, widths: number[]): Sheet<Blob> {
  return {
    data,
    sheet: name,
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
    showGridLines: false,
  };
}

function headerRow(values: string[]): Cell[] {
  return values.map((value) => ({ value, type: String, ...headerStyle }));
}

function textCell(value: unknown): Cell {
  return { value: String(value ?? ""), type: String, wrap: true };
}

function numberCell(value: unknown): Cell {
  return { value: Number(value ?? 0), type: Number, format: "#,##0" };
}

function moneyCell(value: unknown): Cell {
  if (value === null || value === undefined || value === "") return textCell("");
  return { value: Number(value), type: Number, format: 'R$ #,##0.00' };
}

function dateCell(value: unknown): Cell {
  if (!value) return textCell("Não informado");
  return { value: new Date(`${String(value)}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" };
}

function dateTimeCell(value: unknown): Cell {
  return { value: new Date(String(value)), type: Date, format: "dd/mm/yyyy hh:mm" };
}
