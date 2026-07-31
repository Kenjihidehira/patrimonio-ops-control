import { getAuthenticatedUser, loginPagePath, signOutPath } from "@/app/auth";
import { applyAction, buildDashboard, DomainError } from "@/lib/domain";
import { applyPersistedAction, SupabaseError } from "@/lib/supabase";
import { loadWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const APP_PATH = "/demo";
const responseHeaders = { "cache-control": "no-store" };
const operationalActionTypes = new Set([
  "create_inventory_campaign",
  "record_inventory_check",
  "complete_inventory_campaign",
  "create_custody_term",
  "respond_custody_term",
  "create_maintenance_order",
  "update_maintenance_order",
  "assign_tracking_tag",
  "record_tracking_event",
  "delete_asset_document",
  "create_asset_contract",
  "update_asset_contract_status",
  "upsert_asset_accounting",
  "create_asset_kit",
  "dissolve_asset_kit",
  "create_reservation",
  "update_reservation_status",
  "create_offboarding_case",
  "update_offboarding_asset",
  "complete_offboarding_case",
  "create_lifecycle_request",
  "decide_lifecycle_request",
  "create_custom_field",
  "set_asset_custom_value",
  "create_integration",
  "record_integration_event",
  "create_reconciliation_issue",
  "resolve_reconciliation_issue",
  "create_asset_inspection",
  "record_asset_inspection_result",
  "review_asset_inspection",
  "record_inventory_checks_batch",
]);

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
        operations: workspace.operations,
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

    const actionType = String((action as Record<string, unknown>).type ?? "");
    if (!operationalActionTypes.has(actionType)) {
      applyAction(workspace.state, action, user.actor);
    }
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
        operations: updated.operations,
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
    if (error instanceof SupabaseError && error.code === "42501") {
      return Response.json(
        { error: advancedErrorMessage(error.message) },
        { status: 403, headers: responseHeaders },
      );
    }
    if (error instanceof SupabaseError && error.status === 403) {
      return Response.json(
        { error: "Você não possui acesso ao departamento solicitado." },
        { status: 403, headers: responseHeaders },
      );
    }
    if (error instanceof SupabaseError && ["22023", "23503", "P0002"].includes(error.code ?? "")) {
      return Response.json(
        { error: advancedErrorMessage(error.message) },
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

function advancedErrorMessage(message: string): string {
  const messages: Record<string, string> = {
    active_kit_not_found: "O kit ativo não foi localizado.",
    admin_required: "Esta ação exige perfil de administrador.",
    asset_document_not_found: "O documento não foi localizado.",
    asset_not_found: "O patrimônio informado não foi localizado.",
    asset_unavailable_for_reservation: "Um dos ativos já está reservado nesse período ou não está disponível.",
    campaign_asset_not_found: "O patrimônio não pertence a esta campanha.",
    contract_not_changeable: "O contrato já possui esse status ou não foi localizado.",
    invalid_asset_contract: "Revise os dados do contrato ou garantia.",
    invalid_asset_document: "Revise o arquivo e os metadados do documento.",
    invalid_asset_inspection: "Revise os dados da inspeção.",
    invalid_asset_kit: "O kit precisa de um nome e ao menos dois ativos.",
    invalid_custom_field: "Revise o nome e o tipo do campo personalizado.",
    invalid_custom_value: "O campo ou patrimônio informado não é válido.",
    invalid_integration: "Revise o nome, provedor e direção da integração.",
    invalid_inventory_batch: "A fila de inventário offline é inválida ou a campanha foi encerrada.",
    invalid_lifecycle_request: "Revise o tipo, título e justificativa da solicitação.",
    invalid_offboarding_case: "Revise o colaborador e o e-mail informado.",
    invalid_offboarding_result: "Informe um resultado válido para o patrimônio.",
    invalid_reconciliation_status: "O status de conciliação informado é inválido.",
    invalid_request_status: "A transição solicitada não é permitida.",
    invalid_reservation: "Revise o período, finalidade e ativos da reserva.",
    kit_asset_not_found: "Um dos ativos do kit não está disponível.",
    offboarding_asset_not_found: "O ativo já foi tratado ou não pertence ao desligamento.",
    offboarding_has_pending_assets: "Conclua a devolução de todos os ativos antes de encerrar.",
    offboarding_without_assets: "O colaborador não possui ativos para recolhimento.",
    open_offboarding_not_found: "O processo de desligamento não está mais aberto.",
    open_reconciliation_issue_not_found: "A divergência já foi tratada.",
    request_not_changeable: "A solicitação não aceita mais essa alteração.",
    reservation_not_found: "A reserva não foi localizada.",
    reservation_transition_denied: "Seu perfil não pode executar essa transição de reserva.",
  };
  return messages[message] ?? "A operação foi rejeitada pelas regras patrimoniais.";
}
