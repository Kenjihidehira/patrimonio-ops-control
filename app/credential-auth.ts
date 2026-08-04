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
  const requestUrl = new URL(request.url);
  let returnTo = APP_PATH;

  try {
    if (!isSameOriginPost(request, requestUrl)) {
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
      const reason = error.status === 429
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

function isSameOriginPost(request: Request, requestUrl: URL): boolean {
  if (request.method !== "POST") return false;
  return request.headers.get("origin") === requestUrl.origin;
}

function clientAddress(request: Request): string {
  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return cloudflareAddress;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function safeCredentialError(error: unknown): string {
  return error instanceof Error ? error.name : "Unknown credential error";
}
