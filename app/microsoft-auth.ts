import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  authFailureResponse,
  createOAuthTransaction,
  createSessionResponse,
  readOAuthTransaction,
  redirectResponse,
  runtimeValue,
  setOAuthTransactionCookie,
  splitRuntimeList,
} from "@/app/auth";
import { isAllowedMicrosoftEmail } from "@/lib/auth-utils";

type MicrosoftConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  allowedDomains: string[];
};

type MicrosoftMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

const APP_PATH = "/demo/index.html";
const CALLBACK_PATH = "/api/auth/microsoft/callback";
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const metadataCache = new Map<string, Promise<MicrosoftMetadata>>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function startMicrosoftLogin(request: Request): Promise<Response> {
  try {
    const config = getMicrosoftConfig();
    const metadata = await getMicrosoftMetadata(config.tenantId);
    const transaction = await createOAuthTransaction("microsoft", request, true);
    const authorizationUrl = new URL(metadata.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: callbackUrl(request),
      response_mode: "query",
      scope: "openid profile email",
      state: transaction.state,
      nonce: transaction.nonce ?? "",
      code_challenge: transaction.challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();

    const response = redirectResponse(authorizationUrl.toString());
    setOAuthTransactionCookie(response, request, transaction.token);
    return response;
  } catch (error) {
    console.error("Microsoft login could not start", safeAuthError(error));
    return authFailureResponse(request, "microsoft", "not_configured");
  }
}

export async function completeMicrosoftLogin(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  let returnTo = APP_PATH;

  try {
    if (requestUrl.searchParams.has("error")) throw new Error("Microsoft returned an OAuth error.");
    const config = getMicrosoftConfig();
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (!code || !state) throw new Error("OAuth callback is incomplete.");
    const transaction = await readOAuthTransaction("microsoft", request, state);
    returnTo = transaction.returnTo;
    if (!transaction.nonce) throw new Error("OAuth nonce is missing.");

    const metadata = await getMicrosoftMetadata(config.tenantId);
    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUrl(request),
        code_verifier: transaction.verifier,
        scope: "openid profile email",
      }),
    });
    const tokenBody = (await tokenResponse.json().catch(() => null)) as { id_token?: unknown } | null;
    if (!tokenResponse.ok || typeof tokenBody?.id_token !== "string") {
      throw new Error("Microsoft token exchange failed.");
    }

    const { payload } = await jwtVerify(tokenBody.id_token, getMicrosoftJwks(metadata.jwks_uri), {
      algorithms: ["RS256"],
      issuer: metadata.issuer,
      audience: config.clientId,
    });
    const email = microsoftEmail(payload);
    if (
      payload.nonce !== transaction.nonce ||
      typeof payload.oid !== "string" ||
      typeof payload.tid !== "string" ||
      payload.tid.toLowerCase() !== config.tenantId.toLowerCase() ||
      !isAllowedMicrosoftEmail(email, config.allowedDomains)
    ) {
      console.warn("Microsoft login rejected by tenant or domain");
      return authFailureResponse(request, "microsoft", "not_authorized", returnTo);
    }

    return createSessionResponse(
      request,
      {
        provider: "microsoft",
        displayName: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email,
        identifier: email,
        subject: payload.oid,
        tenantId: payload.tid,
        actor: `microsoft:${email}`,
      },
      returnTo,
    );
  } catch (error) {
    console.error("Microsoft login callback failed", safeAuthError(error));
    return authFailureResponse(request, "microsoft", "login_failed", returnTo);
  }
}

function getMicrosoftConfig(): MicrosoftConfig {
  const tenantId = runtimeValue("MICROSOFT_TENANT_ID");
  const clientId = runtimeValue("MICROSOFT_CLIENT_ID");
  const clientSecret = runtimeValue("MICROSOFT_CLIENT_SECRET");
  const allowedDomains = splitRuntimeList("MICROSOFT_ALLOWED_DOMAINS");
  if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(clientId) || !clientSecret || allowedDomains.length === 0) {
    throw new Error("Microsoft Entra OAuth is not configured.");
  }
  return { tenantId, clientId, clientSecret, allowedDomains };
}

function microsoftEmail(payload: Record<string, unknown>): string {
  for (const claim of [payload.preferred_username, payload.email, payload.upn]) {
    if (typeof claim === "string" && claim.includes("@")) return claim.trim().toLowerCase();
  }
  throw new Error("Microsoft identity does not contain an email address.");
}

async function getMicrosoftMetadata(tenantId: string): Promise<MicrosoftMetadata> {
  let pending = metadataCache.get(tenantId);
  if (!pending) {
    pending = fetchMicrosoftMetadata(tenantId);
    metadataCache.set(tenantId, pending);
  }
  try {
    return await pending;
  } catch (error) {
    metadataCache.delete(tenantId);
    throw error;
  }
}

async function fetchMicrosoftMetadata(tenantId: string): Promise<MicrosoftMetadata> {
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`, {
    headers: { accept: "application/json" },
  });
  const body = (await response.json().catch(() => null)) as Partial<MicrosoftMetadata> | null;
  if (
    !response.ok ||
    !isHttpsUrl(body?.authorization_endpoint) ||
    !isHttpsUrl(body?.token_endpoint) ||
    !isHttpsUrl(body?.jwks_uri) ||
    !isHttpsUrl(body?.issuer)
  ) {
    throw new Error("Microsoft OpenID configuration could not be loaded.");
  }
  return body as MicrosoftMetadata;
}

function getMicrosoftJwks(jwksUri: string) {
  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri));
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}

function callbackUrl(request: Request): string {
  return new URL(CALLBACK_PATH, request.url).toString();
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function safeAuthError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown authentication error";
}
