import { getAuthenticatedUser, loginPagePath } from "@/app/auth";
import {
  loadDepartmentNuclei,
  saveUserAccess,
  SupabaseError,
  transferDepartmentEntity,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

const APP_PATH = "/demo";
const responseHeaders = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    const departmentSlug = new URL(request.url).searchParams.get("department") ?? "";
    if (!departmentSlug) {
      return Response.json(
        { error: "Informe o departamento solicitado." },
        { status: 400, headers: responseHeaders },
      );
    }
    return Response.json(
      await loadDepartmentNuclei(user.identifier, departmentSlug),
      { headers: responseHeaders },
    );
  } catch (error) {
    return departmentError(error, "Não foi possível carregar os núcleos do departamento.");
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.type === "save_user_access") {
      const requestedUser = body.user as Record<string, unknown> | undefined;
      if (!requestedUser) {
        return Response.json(
          { error: "Informe o usuário e seus departamentos." },
          { status: 400, headers: responseHeaders },
        );
      }
      await saveUserAccess(user.identifier, {
        identifier: String(requestedUser.identifier ?? ""),
        displayName: String(requestedUser.displayName ?? ""),
        isAdmin: requestedUser.isAdmin === true,
        departmentSlugs: Array.isArray(requestedUser.departmentSlugs)
          ? requestedUser.departmentSlugs.map(String)
          : [],
      });
      return Response.json(
        { message: "Acesso do usuário atualizado." },
        { headers: responseHeaders },
      );
    }

    if (body.type === "transfer_department_entity") {
      const result = await transferDepartmentEntity(user.identifier, {
        sourceDepartmentSlug: String(body.sourceDepartmentSlug ?? ""),
        targetDepartmentSlug: String(body.targetDepartmentSlug ?? ""),
        expectedSourceRevision: Number(body.expectedSourceRevision),
        expectedTargetRevision: Number(body.expectedTargetRevision),
        entityType: body.entityType === "collaborator" ? "collaborator" : "asset",
        entityId: String(body.entityId ?? ""),
        targetNucleusId: String(body.targetNucleusId ?? ""),
        targetLocation: String(body.targetLocation ?? ""),
        targetAssignee: String(body.targetAssignee ?? ""),
        note: String(body.note ?? ""),
      });
      return Response.json(
        {
          ...result,
          message: result.transferredAssets === 1
            ? "Transferência concluída com 1 patrimônio movimentado."
            : `Transferência concluída com ${result.transferredAssets} patrimônios movimentados.`,
        },
        { headers: responseHeaders },
      );
    }

    return Response.json(
      { error: "Operação de departamento não suportada." },
      { status: 400, headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "O corpo da requisição não contém JSON válido." },
        { status: 400, headers: responseHeaders },
      );
    }
    return departmentError(error, "Não foi possível concluir a operação entre departamentos.");
  }
}

function unauthorized() {
  return Response.json(
    {
      error: "Entre com uma conta autorizada.",
      signInUrl: loginPagePath(APP_PATH),
    },
    { status: 401, headers: responseHeaders },
  );
}

function departmentError(error: unknown, fallback: string) {
  if (error instanceof SupabaseError) {
    if (error.code === "40001") {
      return Response.json(
        { error: "Os dados mudaram em outra sessão. Recarregue e tente novamente." },
        { status: 409, headers: responseHeaders },
      );
    }
    const messages: Record<string, string> = {
      admin_required: "Somente administradores podem executar esta operação.",
      department_not_authorized: "Você não possui acesso ao departamento solicitado.",
      target_nucleus_not_found: "O núcleo de destino não existe.",
      target_asset_code_exists: "O departamento de destino já possui um patrimônio com esse código.",
      target_collaborator_exists: "O colaborador já existe no departamento de destino.",
      same_department: "Selecione um departamento de destino diferente.",
      invalid_user_identifier: "Informe um e-mail válido.",
      invalid_transfer_note: "Informe o motivo da transferência.",
      cannot_remove_own_admin: "Você não pode remover seu próprio acesso administrativo.",
    };
    const message = messages[error.message] ?? fallback;
    const status = error.status === 403 ? 403 : error.status === 400 ? 400 : 422;
    return Response.json({ error: message }, { status, headers: responseHeaders });
  }
  console.error("Department operation failed", error);
  return Response.json(
    { error: fallback },
    { status: 500, headers: responseHeaders },
  );
}
