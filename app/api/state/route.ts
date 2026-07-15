import {
  getGitHubUser,
  githubSignInPath,
  githubSignOutPath,
} from "@/app/github-auth";
import { applyAction, buildDashboard, DomainError } from "@/lib/domain";
import { applyPersistedAction, SupabaseError } from "@/lib/supabase";
import { loadWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const APP_PATH = "/demo/index.html";
const responseHeaders = { "cache-control": "no-store" };

export async function GET(request: Request) {
  try {
    const user = await getGitHubUser();
    const url = new URL(request.url);
    const workspace = await loadWorkspaceContext(user);
    const dashboard = buildDashboard(workspace.state, {
      search: url.searchParams.get("search"),
      type: url.searchParams.get("type"),
      status: url.searchParams.get("status"),
      nucleus: url.searchParams.get("nucleus"),
      sort: url.searchParams.get("sort"),
    });

    return Response.json(
      {
        ...dashboard,
        imports: workspace.imports,
        session: {
          authenticated: Boolean(user),
          displayName: user?.displayName ?? "Visitante da demonstração",
          login: user?.login ?? null,
          source: workspace.source,
          signInUrl: githubSignInPath(APP_PATH),
          signOutUrl: githubSignOutPath(APP_PATH),
        },
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("Failed to load patrimonial state", error);
    return Response.json(
      { error: infrastructureMessage(error, "Não foi possível carregar o controle patrimonial.") },
      { status: 500, headers: responseHeaders },
    );
  }
}

export async function POST(request: Request) {
  const user = await getGitHubUser();
  if (!user) {
    return Response.json(
      {
        error: "Entre com sua conta GitHub autorizada para registrar alterações.",
        signInUrl: githubSignInPath(APP_PATH),
      },
      { status: 401, headers: responseHeaders },
    );
  }

  try {
    const action: unknown = await request.json();
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      return Response.json(
        { error: "A ação enviada é inválida." },
        { status: 400, headers: responseHeaders },
      );
    }
    const workspace = await loadWorkspaceContext(user);
    const expectedRevision = Number((action as Record<string, unknown>).expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== workspace.state.revision) {
      return revisionConflict();
    }

    applyAction(workspace.state, action, user.actor);
    if (!workspace.ownerKey) throw new Error("Authenticated workspace has no owner key.");
    await applyPersistedAction(workspace.ownerKey, user.actor, expectedRevision, action);
    const updated = await loadWorkspaceContext(user);

    return Response.json(
      {
        ...buildDashboard(updated.state),
        imports: updated.imports,
        message: "Alteração registrada com sucesso.",
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "O corpo da requisição não contém JSON válido." },
        { status: 400, headers: responseHeaders },
      );
    }
    if (error instanceof DomainError) {
      return Response.json(
        { error: error.message },
        { status: 422, headers: responseHeaders },
      );
    }
    if (error instanceof SupabaseError && error.code === "40001") {
      return revisionConflict();
    }

    console.error("Failed to mutate patrimonial state", error);
    return Response.json(
      { error: infrastructureMessage(error, "Não foi possível registrar a alteração.") },
      { status: 500, headers: responseHeaders },
    );
  }
}

function revisionConflict() {
  return Response.json(
    { error: "Os dados foram alterados em outra sessão. Recarregue e tente novamente." },
    { status: 409, headers: responseHeaders },
  );
}

function infrastructureMessage(error: unknown, fallback: string) {
  if (error instanceof SupabaseError && error.code === "missing_configuration") {
    return error.message;
  }
  return fallback;
}
