import { getAuthenticatedUser, loginPagePath } from "@/app/auth";
import { buildDashboard } from "@/lib/domain";
import { createExportWorkbook } from "@/lib/workbook";
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
    const workspace = await loadWorkspaceContext(
      user,
      url.searchParams.get("department"),
    );
    const dashboard = buildDashboard(workspace.state, { sort: "asset_asc" });
    const workbook = await createExportWorkbook(dashboard, workspace.imports);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(workbook, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="patrimonios-${workspace.environment?.activeDepartment.slug ?? "departamento"}-${date}.xlsx"`,
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to export patrimonial workbook", error);
    return Response.json(
      { error: "Não foi possível exportar o inventário." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
