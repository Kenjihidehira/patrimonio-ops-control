import {
  authFailureResponse,
  createSessionResponse,
} from "@/app/auth";
import { safeRelativeReturnPath } from "@/lib/auth-utils";
import {
  authenticateCredentials,
  SupabaseError,
} from "@/lib/supabase";

const APP_PATH = "/demo";
const MAX_FORM_BYTES = 8 * 1024;

export async function completeCredentialLogin(request: Request): Promise<Response> {
  let returnTo = APP_PATH;

  try {
    if (!isSameOriginPost(request)) {
      return Response.json(
        { error: "Origem da solicitação inválida." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FORM_BYTES) {
      return Response.json(
        { error: "Solicitação muito grande." },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }
    const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
    if (contentType !== "application/x-www-form-urlencoded") {
      return Response.json(
        { error: "Formato de autenticação inválido." },
        { status: 415, headers: { "cache-control": "no-store" } },
      );
    }

    const body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_FORM_BYTES) {
      return Response.json(
        { error: "Solicitação muito grande." },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }
    const form = new URLSearchParams(body);
    const login = String(form.get("login") ?? "").trim().toLowerCase().slice(0, 254);
    const password = String(form.get("password") ?? "");
    returnTo = safeRelativeReturnPath(String(form.get("return_to") ?? APP_PATH));
    if (!login || !password) {
      return authFailureResponse(request, "credentials", "invalid_credentials", returnTo);
    }

    const identity = await authenticateCredentials(
      login,
      password,
      clientAddress(request),
    );
    return createSessionResponse(
      request,
      {
        provider: "credentials",
        displayName: identity.displayName,
        identifier: identity.identifier,
        subject: identity.subject,
        actor: `credentials:${identity.identifier}`,
        sessionVersion: identity.sessionVersion,
      },
      returnTo,
    );
  } catch (error) {
    if (error instanceof SupabaseError) {
      const reason = error.message === "access_request_pending"
        ? "pending_approval"
        : error.status === 429
          ? "rate_limited"
          : error.status >= 500 || error.code === "missing_configuration"
            ? "login_failed"
            : "invalid_credentials";
      return authFailureResponse(request, "credentials", reason, returnTo);
    }
    console.error("Credential login failed", safeCredentialError(error));
    return authFailureResponse(request, "credentials", "login_failed", returnTo);
  }
}

// A origem é conferida contra o host efetivamente servido, e não contra
// `request.url`: atrás de um proxy, a URL interna não corresponde ao domínio
// público e toda requisição legítima seria recusada.
function isSameOriginPost(request: Request): boolean {
  if (request.method !== "POST") return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function clientAddress(request: Request): string {
  const realAddress = request.headers.get("x-real-ip")?.trim();
  if (realAddress) return realAddress;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function safeCredentialError(error: unknown): string {
  return error instanceof Error ? error.name : "Unknown credential error";
}
