import {
  authFailureResponse,
  registrationSuccessResponse,
} from "@/app/auth";
import { safeRelativeReturnPath } from "@/lib/auth-utils";
import {
  registerAccessRequest,
  SupabaseError,
} from "@/lib/supabase";

const APP_PATH = "/demo";
const MAX_FORM_BYTES = 8 * 1024;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

export async function completeAccessRegistration(request: Request): Promise<Response> {
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
        { error: "Formato de cadastro inválido." },
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
    returnTo = safeRelativeReturnPath(String(form.get("return_to") ?? APP_PATH));
    const identifier = String(form.get("identifier") ?? "").trim().toLowerCase().slice(0, 254);
    const displayName = String(form.get("display_name") ?? "").trim().slice(0, 180);
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("password_confirmation") ?? "");

    if (
      !identifier
      || !displayName
      || password !== passwordConfirmation
      || password.length < MIN_PASSWORD_LENGTH
      || new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES
    ) {
      return authFailureResponse(request, "registration", "invalid_data", returnTo);
    }

    // O nome de usuário é derivado do e-mail pelo gateway: quem se cadastra não
    // precisa inventar um identificador, e o login por e-mail continua valendo.
    await registerAccessRequest(
      { identifier, displayName, password },
      clientAddress(request),
    );
    return registrationSuccessResponse(request, returnTo);
  } catch (error) {
    if (error instanceof SupabaseError) {
      return authFailureResponse(request, "registration", registrationReason(error), returnTo);
    }
    console.error("Access registration failed", safeRegistrationError(error));
    return authFailureResponse(request, "registration", "failed", returnTo);
  }
}

function registrationReason(
  error: SupabaseError,
): "rate_limited" | "duplicate" | "invalid_data" | "failed" {
  if (error.status === 429) return "rate_limited";
  if (error.message === "access_request_duplicate") return "duplicate";
  if (error.message === "credential_identity_unmanaged") return "duplicate";
  if (error.status >= 500 || error.code === "missing_configuration") return "failed";
  return "invalid_data";
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

function safeRegistrationError(error: unknown): string {
  return error instanceof Error ? error.name : "Unknown registration error";
}
