import { getGitHubUser, githubSignInPath } from "@/app/github-auth";
import { buildDashboard } from "@/lib/domain";
import { createExportWorkbook } from "@/lib/workbook";
import { loadWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getGitHubUser();
    if (!user) {
      return Response.json(
        {
          error: "Entre com sua conta GitHub autorizada para exportar os dados da planilha.",
          signInUrl: githubSignInPath("/demo/index.html"),
        },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const workspace = await loadWorkspaceContext(user);
    const dashboard = buildDashboard(workspace.state, { sort: "asset_asc" });
    const workbook = await createExportWorkbook(dashboard, workspace.imports);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(workbook, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="patrimonios-${date}.xlsx"`,
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
