import { getAuthenticatedUser, loginPagePath } from "@/app/auth";
import { parsePatrimonioRows } from "@/lib/spreadsheet-import";
import {
  authorizeDepartmentOperation,
  importAssets,
  SupabaseError,
} from "@/lib/supabase";
import { readWorkbookRows } from "@/lib/workbook";
import { loadWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const APP_PATH = "/demo";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const responseHeaders = { "cache-control": "no-store" };

type PreviewIssue = { row: number; column: string; message: string };
type SpreadsheetPreview = {
  totalCandidates: number;
  acceptedCount: number;
  untaggedCount: number;
  rejectedCount: number;
  adjustedCount: number;
  canCommit: boolean;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  collaborators: Array<Record<string, unknown>>;
  errors: PreviewIssue[];
  warnings: PreviewIssue[];
};
type ImportImpact = {
  newAssetCount: number;
  updateAssetCount: number;
  unchangedAssetCount: number;
  protectedFieldChangeCount: number;
  requiresOperationalConfirmation: boolean;
  warnings: PreviewIssue[];
};

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      {
        error: "Entre com uma conta autorizada para importar dados.",
        signInUrl: loginPagePath(APP_PATH),
      },
      { status: 401, headers: responseHeaders },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") ?? "preview");
    const departmentSlug = String(formData.get("department") ?? "").trim();
    if (!departmentSlug) {
      return Response.json(
        { error: "Informe o departamento que receberá a importação." },
        { status: 400, headers: responseHeaders },
      );
    }
    await authorizeDepartmentOperation(user.identifier, departmentSlug, "import");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "Selecione um arquivo XLSX." },
        { status: 400, headers: responseHeaders },
      );
    }
    if (!file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx")) {
      return Response.json(
        { error: "Formato não suportado. Envie um arquivo .xlsx." },
        { status: 415, headers: responseHeaders },
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: "O arquivo deve ter até 2 MB e não pode estar vazio." },
        { status: 413, headers: responseHeaders },
      );
    }
    if (!(await hasXlsxSignature(file))) {
      return Response.json(
        { error: "O conteúdo enviado não corresponde a um arquivo XLSX válido." },
        { status: 415, headers: responseHeaders },
      );
    }

    const rows = await readWorkbookRows(file);
    if (!workbookWithinLimits(rows)) {
      return Response.json(
        { error: "A planilha excede o limite de 10.000 linhas, 64 colunas ou 250.000 células." },
        { status: 413, headers: responseHeaders },
      );
    }
    const preview = parsePatrimonioRows(rows) as SpreadsheetPreview;
    if (
      departmentSlug !== "gazin-log"
      && preview.assets.some((asset) => asset.type === "fleet")
    ) {
      return Response.json(
        { error: "Itens do tipo Frota só podem ser importados no ambiente Gazin LOG." },
        { status: 422, headers: responseHeaders },
      );
    }
    const workspace = await loadWorkspaceContext(user, departmentSlug || null);
    const impact = analyzeImportImpact(preview, workspace.state);
    if (mode === "preview") {
      return Response.json(publicPreview(preview, impact), { headers: responseHeaders });
    }
    if (mode !== "commit") {
      return Response.json(
        { error: "Modo de importação inválido." },
        { status: 400, headers: responseHeaders },
      );
    }
    if (!preview.canCommit) {
      return Response.json(
        { error: "A planilha não contém linhas válidas para importação.", preview: publicPreview(preview, impact) },
        { status: 422, headers: responseHeaders },
      );
    }
    if (
      impact.requiresOperationalConfirmation
      && formData.get("confirmOperationalOverwrite") !== "true"
    ) {
      return Response.json(
        {
          error: "A planilha altera campos operacionais existentes. Revise a prévia e confirme explicitamente a atualização.",
          preview: publicPreview(preview, impact),
        },
        { status: 409, headers: responseHeaders },
      );
    }

    const expectedRevision = Number(formData.get("revision"));
    if (!Number.isInteger(expectedRevision) || expectedRevision !== workspace.state.revision) {
      return revisionConflict();
    }
    if (!workspace.environment) throw new Error("Authenticated workspace has no department.");
    const result = await importAssets(
      user.identifier,
      workspace.environment.activeDepartment.slug,
      expectedRevision,
      {
      fileName: safeFileName(file.name),
      nuclei: preview.nuclei,
      assets: preview.assets,
      collaborators: preview.collaborators,
      rejectedCount: preview.rejectedCount,
      warnings: [...preview.warnings, ...preview.errors],
      },
    );

    return Response.json(
      {
        ...result,
        message: `${result.inserted} itens inseridos, ${result.updated} atualizados e ${result.collaborators} colaboradores sincronizados.`,
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof SupabaseError && error.code === "40001") return revisionConflict();
    if (error instanceof SupabaseError && error.status === 403) {
      return Response.json(
        {
          error: error.message === "financial_data_permission_required"
            ? "A planilha contém valores financeiros. Solicite essa permissão ou remova as colunas protegidas."
            : "Seu perfil não possui permissão para importar neste departamento.",
        },
        { status: 403, headers: responseHeaders },
      );
    }
    if (error instanceof SupabaseError && error.status === 429) {
      return Response.json(
        { error: "Limite de importações atingido. Aguarde e tente novamente." },
        { status: 429, headers: responseHeaders },
      );
    }
    console.error("Failed to import patrimonial spreadsheet", error);
    return Response.json(
      { error: "Não foi possível processar a planilha. Verifique se o arquivo XLSX está íntegro." },
      { status: 500, headers: responseHeaders },
    );
  }
}

function publicPreview(preview: SpreadsheetPreview, impact: ImportImpact) {
  return {
    totalCandidates: preview.totalCandidates,
    acceptedCount: preview.acceptedCount,
    newAssetCount: impact.newAssetCount,
    updateAssetCount: impact.updateAssetCount,
    unchangedAssetCount: impact.unchangedAssetCount,
    protectedFieldChangeCount: impact.protectedFieldChangeCount,
    requiresOperationalConfirmation: impact.requiresOperationalConfirmation,
    untaggedCount: preview.untaggedCount,
    rejectedCount: preview.rejectedCount,
    adjustedCount: preview.adjustedCount,
    nucleusCount: preview.nuclei.length,
    collaboratorCount: preview.collaborators.length,
    canCommit: preview.canCommit,
    errors: preview.errors,
    warnings: [...preview.warnings, ...impact.warnings],
  };
}

function analyzeImportImpact(
  preview: SpreadsheetPreview,
  currentState: {
    nuclei: Array<Record<string, unknown>>;
    assets: Array<Record<string, unknown>>;
    assetAliases: Array<Record<string, unknown>>;
  },
): ImportImpact {
  const existingByCode = new Map(
    currentState.assets.map((asset) => [String(asset.id), asset]),
  );
  const incomingNucleusCodeById = new Map(
    preview.nuclei.map((nucleus) => [String(nucleus.id), String(nucleus.code).toUpperCase()]),
  );
  const existingNucleusIdByCode = new Map(
    currentState.nuclei.map((nucleus) => [String(nucleus.code).toUpperCase(), String(nucleus.id)]),
  );
  const canonicalCodeByAlias = new Map(
    currentState.assetAliases.map((alias) => [String(alias.sourceCode), String(alias.assetId)]),
  );
  const fieldDefinitions = [
    ["type", "Tipo"],
    ["nucleusId", "Núcleo"],
    ["assignee", "Responsável"],
    ["location", "Localização"],
    ["serial", "Número de série"],
    ["brandModel", "Marca e modelo"],
    ["status", "Status"],
    ["notes", "Observações"],
  ] as const;
  let newAssetCount = 0;
  let updateAssetCount = 0;
  let unchangedAssetCount = 0;
  let protectedFieldChangeCount = 0;
  const warnings: PreviewIssue[] = [];

  for (const incoming of preview.assets) {
    const sourceCode = String(incoming.code);
    const code = canonicalCodeByAlias.get(sourceCode) ?? sourceCode;
    const existing = existingByCode.get(code);
    if (!existing) {
      newAssetCount += 1;
      continue;
    }

    const nucleusCode = incomingNucleusCodeById.get(String(incoming.nucleusId));
    const resolvedIncoming: Record<string, unknown> = {
      ...incoming,
      code,
      status: canonicalCodeByAlias.has(sourceCode) ? existing.status : incoming.status,
      nucleusId: nucleusCode
        ? existingNucleusIdByCode.get(nucleusCode) ?? incoming.nucleusId
        : incoming.nucleusId,
      location: incoming.location === "Não informada na planilha"
        ? existing.location
        : incoming.location,
      serial: incoming.serial === "" ? existing.serial : incoming.serial,
      brandModel: incoming.brandModel === "Não informado na planilha"
        ? existing.brandModel
        : incoming.brandModel,
      notes: incoming.notes === "Importado da planilha de patrimônios."
        ? existing.notes
        : incoming.notes,
    };
    const changedFields = fieldDefinitions.filter(([field]) => (
      comparableValue(resolvedIncoming[field]) !== comparableValue(existing[field])
    ));

    if (!changedFields.length) {
      unchangedAssetCount += 1;
      continue;
    }

    updateAssetCount += 1;
    protectedFieldChangeCount += changedFields.length;
    if (warnings.length < 12) {
      warnings.push({
        row: 0,
        column: `Patrimônio ${code}`,
        message: `Campos operacionais que serão atualizados: ${changedFields.map(([, label]) => label).join(", ")}.`,
      });
    }
  }

  return {
    newAssetCount,
    updateAssetCount,
    unchangedAssetCount,
    protectedFieldChangeCount,
    requiresOperationalConfirmation: protectedFieldChangeCount > 0,
    warnings,
  };
}

function comparableValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(2) : "";
  return String(value).trim();
}

function revisionConflict() {
  return Response.json(
    { error: "Os dados foram alterados em outra sessão. Recarregue antes de importar." },
    { status: 409, headers: responseHeaders },
  );
}

function safeFileName(value: string) {
  return value.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 255);
}

async function hasXlsxSignature(file: File): Promise<boolean> {
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return signature.length === 4
    && signature[0] === 0x50
    && signature[1] === 0x4b
    && signature[2] === 0x03
    && signature[3] === 0x04;
}

function workbookWithinLimits(rows: unknown[][]): boolean {
  if (rows.length > 10_000) return false;
  let cells = 0;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length > 64) return false;
    cells += row.length;
    if (cells > 250_000) return false;
    for (const cell of row) {
      if (typeof cell === "string" && cell.length > 2_000) return false;
    }
  }
  return true;
}
