import { getAuthenticatedUser, loginPagePath } from "@/app/auth";
import { parsePatrimonioRows } from "@/lib/spreadsheet-import";
import { importAssets, SupabaseError } from "@/lib/supabase";
import { readWorkbookRows } from "@/lib/workbook";
import { loadWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const APP_PATH = "/demo/index.html";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const responseHeaders = { "cache-control": "no-store" };

type PreviewIssue = { row: number; column: string; message: string };
type SpreadsheetPreview = {
  totalCandidates: number;
  acceptedCount: number;
  rejectedCount: number;
  adjustedCount: number;
  canCommit: boolean;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  errors: PreviewIssue[];
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

    const rows = await readWorkbookRows(file);
    const preview = parsePatrimonioRows(rows) as SpreadsheetPreview;
    if (mode === "preview") {
      return Response.json(publicPreview(preview), { headers: responseHeaders });
    }
    if (mode !== "commit") {
      return Response.json(
        { error: "Modo de importação inválido." },
        { status: 400, headers: responseHeaders },
      );
    }
    if (!preview.canCommit) {
      return Response.json(
        { error: "A planilha não contém linhas válidas para importação.", preview: publicPreview(preview) },
        { status: 422, headers: responseHeaders },
      );
    }

    const workspace = await loadWorkspaceContext(user);
    const expectedRevision = Number(formData.get("revision"));
    if (!Number.isInteger(expectedRevision) || expectedRevision !== workspace.state.revision) {
      return revisionConflict();
    }
    if (!workspace.ownerKey) throw new Error("Authenticated workspace has no owner key.");
    const result = await importAssets(workspace.ownerKey, user.actor, expectedRevision, {
      fileName: safeFileName(file.name),
      nuclei: preview.nuclei,
      assets: preview.assets,
      rejectedCount: preview.rejectedCount,
      warnings: [...preview.warnings, ...preview.errors],
    });

    return Response.json(
      {
        ...result,
        message: `${result.inserted} patrimônios inseridos e ${result.updated} atualizados.`,
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof SupabaseError && error.code === "40001") return revisionConflict();
    console.error("Failed to import patrimonial spreadsheet", error);
    return Response.json(
      { error: "Não foi possível processar a planilha. Verifique se o arquivo XLSX está íntegro." },
      { status: 500, headers: responseHeaders },
    );
  }
}

function publicPreview(preview: SpreadsheetPreview) {
  return {
    totalCandidates: preview.totalCandidates,
    acceptedCount: preview.acceptedCount,
    rejectedCount: preview.rejectedCount,
    adjustedCount: preview.adjustedCount,
    nucleusCount: preview.nuclei.length,
    canCommit: preview.canCommit,
    errors: preview.errors,
    warnings: preview.warnings,
  };
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
