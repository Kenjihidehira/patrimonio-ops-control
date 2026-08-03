import { getAuthenticatedUser, loginPagePath } from "@/app/auth";
import { buildDashboard } from "@/lib/domain";
import { createExportWorkbook } from "@/lib/workbook";
import {
  authorizeDepartmentOperation,
  SupabaseError,
} from "@/lib/supabase";
import { loadWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        {
          error: "Entre com uma conta autorizada para exportar os dados da planilha.",
          signInUrl: loginPagePath("/demo"),
        },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const url = new URL(request.url);
    const departmentSlug = url.searchParams.get("department") ?? "";
    const scope = url.searchParams.get("scope") === "financial"
      ? "financial"
      : "operational";
    if (!departmentSlug) {
      return Response.json(
        { error: "Informe o departamento que será exportado." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    const authorization = await authorizeDepartmentOperation(
      user.identifier,
      departmentSlug,
      scope === "financial" ? "export_financial" : "export",
    );
    const workspace = await loadWorkspaceContext(
      user,
      departmentSlug,
    );
    const includeFinancials = scope === "financial"
      && authorization.canViewFinancialData === true
      && workspace.environment?.permissions.canViewFinancialData === true;
    const dashboard = buildDashboard(
      workspace.state,
      { sort: "asset_asc" },
      { includeFinancials },
    );
    const workbook = await createExportWorkbook(
      { ...dashboard, operations: workspace.operations },
      workspace.imports,
      { includeFinancials },
    );
    const date = new Date().toISOString().slice(0, 10);
    return new Response(workbook, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="patrimonios-${scope === "financial" ? "financeiro-" : ""}${workspace.environment?.activeDepartment.slug ?? "departamento"}-${date}.xlsx"`,
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SupabaseError && error.status === 403) {
      return Response.json(
        { error: "Seu perfil não possui permissão para exportar este departamento." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    if (error instanceof SupabaseError && error.status === 429) {
      return Response.json(
        { error: "Limite de exportações atingido. Aguarde e tente novamente." },
        { status: 429, headers: { "cache-control": "no-store" } },
      );
    }
    console.error("Failed to export patrimonial workbook", error);
    return Response.json(
      { error: "Não foi possível exportar o inventário." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
