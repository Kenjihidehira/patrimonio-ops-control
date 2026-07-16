import { readSheet } from "read-excel-file/universal";
import writeExcelFile from "write-excel-file/universal";
import type { Cell, Sheet, SheetData } from "write-excel-file/universal";

type ExportAsset = {
  id: string;
  type: string;
  nucleus: { name: string };
  assignee: string;
  location: string;
  serial: string;
  brandModel: string;
  acquiredAt: string | null;
  status: string;
  notes: string;
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
) {
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
      "Status",
      "Observações",
    ]),
    ...dashboard.inventory.map((asset) => [
      textCell(asset.id),
      textCell(dashboard.options.assetTypes[asset.type]),
      textCell(asset.nucleus.name),
      textCell(asset.assignee),
      textCell(asset.location),
      textCell(asset.serial),
      textCell(asset.brandModel),
      dateCell(asset.acquiredAt),
      textCell(dashboard.options.statuses[asset.status]),
      textCell(asset.notes),
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
      textCell(movement.assetId),
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

  return writeExcelFile(
    [
      sheet("Inventário", inventory, [14, 20, 28, 28, 28, 22, 30, 14, 16, 38]),
      sheet("Núcleos", nuclei, [14, 30, 28, 28, 12, 12, 12]),
      sheet("Auditoria", audit, [20, 14, 20, 22, 34, 34, 28, 42]),
      sheet("Importações", importHistory, [20, 34, 16, 14, 14, 14, 28]),
    ],
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

function dateCell(value: unknown): Cell {
  if (!value) return textCell("Não informado");
  return { value: new Date(`${String(value)}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" };
}

function dateTimeCell(value: unknown): Cell {
  return { value: new Date(String(value)), type: Date, format: "dd/mm/yyyy hh:mm" };
}
