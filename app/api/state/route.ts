import { getAuthenticatedUser, loginPagePath, signOutPath } from "@/app/auth";
import { applyAction, buildDashboard, DomainError } from "@/lib/domain";
import { applyPersistedAction, SupabaseError } from "@/lib/supabase";
import { loadWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const APP_PATH = "/demo";
const responseHeaders = { "cache-control": "no-store" };

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json(
        {
          error: "Sua sessão expirou. Entre novamente para continuar.",
          signInUrl: loginPagePath(APP_PATH),
        },
        { status: 401, headers: responseHeaders },
      );
    }

    const url = new URL(request.url);
    const knownRevision = parseKnownRevision(url.searchParams.get("revision"));
    const workspace = await loadWorkspaceContext(
      user,
      url.searchParams.get("department"),
      knownRevision,
    );
    if (workspace.notModified) {
      return new Response(null, {
        status: 304,
        headers: {
          ...responseHeaders,
          etag: `"revision-${workspace.revision}"`,
        },
      });
    }
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
        environment: workspace.environment,
        session: {
          authenticated: true,
          displayName: user.displayName,
          identifier: user.identifier,
          provider: user.provider,
          source: workspace.source,
          signInUrl: loginPagePath(APP_PATH),
          signOutUrl: signOutPath(),
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

function parseKnownRevision(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) ? revision : null;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return Response.json(
      {
        error: "Entre com uma conta autorizada para registrar alterações.",
        signInUrl: loginPagePath(APP_PATH),
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
    const departmentSlug = String(
      (action as Record<string, unknown>).departmentSlug ?? "",
    ).trim();
    const workspace = await loadWorkspaceContext(user, departmentSlug || null);
    const expectedRevision = Number((action as Record<string, unknown>).expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== workspace.state.revision) {
      return revisionConflict();
    }

    applyAction(workspace.state, action, user.actor);
    if (!workspace.environment) throw new Error("Authenticated workspace has no department.");
    await applyPersistedAction(
      user.identifier,
      workspace.environment.activeDepartment.slug,
      expectedRevision,
      action,
    );
    const updated = await loadWorkspaceContext(
      user,
      workspace.environment.activeDepartment.slug,
    );

    return Response.json(
      {
        ...buildDashboard(updated.state),
        imports: updated.imports,
        environment: updated.environment,
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
    if (error instanceof SupabaseError && error.code === "23505") {
      return Response.json(
        {
          error: error.message === "asset_code_exists"
            ? "Já existe um item com esse patrimônio."
            : "Já existe um registro com esses dados.",
        },
        { status: 422, headers: responseHeaders },
      );
    }
    if (error instanceof SupabaseError && error.status === 403) {
      return Response.json(
        { error: operationalErrorMessage(error.message, "Você não possui acesso ao departamento solicitado.") },
        { status: 403, headers: responseHeaders },
      );
    }
    if (error instanceof SupabaseError && error.status >= 400 && error.status < 500) {
      return Response.json(
        { error: operationalErrorMessage(error.message, "A alteração operacional foi rejeitada.") },
        { status: 422, headers: responseHeaders },
      );
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

function operationalErrorMessage(message: string, fallback: string): string {
  const messages: Record<string, string> = {
    invalid_campaign_name: "Informe um nome válido para a campanha.",
    campaign_without_assets: "O escopo selecionado não possui patrimônios ativos.",
    inactive_inventory_campaign: "A campanha selecionada não está ativa.",
    campaign_asset_not_found: "O patrimônio não pertence ao escopo desta campanha.",
    campaign_has_pending_assets: "Confira todos os patrimônios antes de concluir a campanha.",
    invalid_assignee_identifier: "Informe um e-mail válido para o responsável.",
    asset_without_eligible_assignee: "O patrimônio precisa ter um responsável diferente de Reserva.",
    pending_custody_term_not_found: "O termo não está pendente.",
    custody_term_identity_mismatch: "Somente o responsável identificado no termo pode aceitar ou recusar.",
    custody_term_cancel_denied: "Você não possui permissão para cancelar este termo.",
    invalid_maintenance_order: "Revise o tipo, a prioridade e o título da ordem.",
    maintenance_order_not_changeable: "A ordem de manutenção não pode mais ser alterada.",
    invalid_tracking_tag: "Revise o patrimônio, a tecnologia e o identificador da etiqueta.",
    invalid_tracking_event: "Revise os dados da leitura de rastreamento.",
    tracking_tag_not_configured: "Cadastre a etiqueta ou integração antes de registrar esta leitura.",
  };
  return messages[message] ?? fallback;
}
