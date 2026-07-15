import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { isAllowedMicrosoftEmail, safeRelativeReturnPath } from "@/lib/auth-utils";

export type MicrosoftUser = {
  displayName: string;
  email: string;
  objectId: string;
  tenantId: string;
};

type MicrosoftConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  allowedDomains: string[];
  sessionSecret: Uint8Array;
};

type MicrosoftMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

const APP_PATH = "/demo/index.html";
const CALLBACK_PATH = "/api/auth/microsoft/callback";
const LOGIN_PATH = "/api/auth/microsoft/login";
const LOGOUT_PATH = "/api/auth/microsoft/logout";
const SESSION_COOKIE = "patrimonio_session";
const OAUTH_COOKIE = "patrimonio_oauth";
const SECURE_SESSION_COOKIE = `__Host-${SESSION_COOKIE}`;
const SECURE_OAUTH_COOKIE = `__Host-${OAUTH_COOKIE}`;
const SESSION_ISSUER = "patrimonio-ops-control";
const SESSION_AUDIENCE = "patrimonio-ops-control-web";
const OAUTH_AUDIENCE = "patrimonio-ops-control-oauth";
const SESSION_SECONDS = 8 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const metadataCache = new Map<string, Promise<MicrosoftMetadata>>();
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export class MicrosoftAuthError extends Error {
  code: "configuration" | "oauth";

  constructor(message: string, code: "configuration" | "oauth" = "oauth") {
    super(message);
    this.name = "MicrosoftAuthError";
    this.code = code;
  }
}

export async function getMicrosoftUser(): Promise<MicrosoftUser | null> {
  try {
    const config = getMicrosoftConfig();
    const cookieStore = await cookies();
    const token =
      cookieStore.get(SECURE_SESSION_COOKIE)?.value ??
      cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, config.sessionSecret, {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    if (
      payload.kind !== "session" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.oid !== "string" ||
      typeof payload.tid !== "string" ||
      payload.tid.toLowerCase() !== config.tenantId.toLowerCase() ||
      !isAllowedMicrosoftEmail(payload.email, config.allowedDomains)
    ) {
      return null;
    }

    return {
      displayName: payload.name,
      email: payload.email,
      objectId: payload.oid,
      tenantId: payload.tid,
    };
  } catch {
    return null;
  }
}

export function microsoftSignInPath(returnTo: string): string {
  return `${LOGIN_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function microsoftSignOutPath(returnTo = APP_PATH): string {
  return `${LOGOUT_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export async function startMicrosoftLogin(request: Request): Promise<Response> {
  try {
    const config = getMicrosoftConfig();
    const metadata = await getMicrosoftMetadata(config.tenantId);
    const requestUrl = new URL(request.url);
    const returnTo = safeRelativeReturnPath(requestUrl.searchParams.get("return_to") ?? APP_PATH);
    const state = randomBase64Url(32);
    const nonce = randomBase64Url(32);
    const verifier = randomBase64Url(64);
    const challenge = await sha256Base64Url(verifier);
    const transaction = await new SignJWT({
      kind: "oauth",
      state,
      nonce,
      verifier,
      returnTo,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(SESSION_ISSUER)
      .setAudience(OAUTH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${OAUTH_SECONDS}s`)
      .sign(config.sessionSecret);

    const authorizationUrl = new URL(metadata.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: callbackUrl(request),
      response_mode: "query",
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();

    const response = redirectResponse(authorizationUrl.toString());
    response.headers.append(
      "set-cookie",
      serializeCookie(cookieName(OAUTH_COOKIE, request), transaction, OAUTH_SECONDS, request),
    );
    return response;
  } catch (error) {
    console.error("Microsoft login could not start", safeAuthError(error));
    return redirectResponse(withAuthError(request, "microsoft_not_configured"));
  }
}

export async function completeMicrosoftLogin(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  let returnTo = APP_PATH;

  try {
    if (requestUrl.searchParams.has("error")) {
      throw new MicrosoftAuthError("Microsoft returned an OAuth error.");
    }

    const config = getMicrosoftConfig();
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (!code || !state) throw new MicrosoftAuthError("OAuth callback is incomplete.");

    const cookieStore = await cookies();
    const transactionToken =
      cookieStore.get(cookieName(OAUTH_COOKIE, request))?.value ??
      cookieStore.get(SECURE_OAUTH_COOKIE)?.value ??
      cookieStore.get(OAUTH_COOKIE)?.value;
    if (!transactionToken) throw new MicrosoftAuthError("OAuth transaction cookie is missing.");

    const { payload: transaction } = await jwtVerify(
      transactionToken,
      config.sessionSecret,
      {
        algorithms: ["HS256"],
        issuer: SESSION_ISSUER,
        audience: OAUTH_AUDIENCE,
      },
    );
    if (
      transaction.kind !== "oauth" ||
      transaction.state !== state ||
      typeof transaction.nonce !== "string" ||
      typeof transaction.verifier !== "string" ||
      typeof transaction.returnTo !== "string"
    ) {
      throw new MicrosoftAuthError("OAuth transaction validation failed.");
    }
    returnTo = safeRelativeReturnPath(transaction.returnTo);

    const metadata = await getMicrosoftMetadata(config.tenantId);
    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
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
    const tokenBody = (await tokenResponse.json().catch(() => null)) as {
      id_token?: unknown;
    } | null;
    if (!tokenResponse.ok || typeof tokenBody?.id_token !== "string") {
      throw new MicrosoftAuthError("Microsoft token exchange failed.");
    }

    const jwks = getMicrosoftJwks(metadata.jwks_uri);
    const { payload } = await jwtVerify(tokenBody.id_token, jwks, {
      algorithms: ["RS256"],
      issuer: metadata.issuer,
      audience: config.clientId,
    });
    const email = microsoftEmail(payload);
    const displayName = typeof payload.name === "string" ? payload.name.trim() : email;
    if (
      payload.nonce !== transaction.nonce ||
      typeof payload.oid !== "string" ||
      typeof payload.tid !== "string" ||
      payload.tid.toLowerCase() !== config.tenantId.toLowerCase() ||
      !isAllowedMicrosoftEmail(email, config.allowedDomains)
    ) {
      throw new MicrosoftAuthError("Microsoft identity is not authorized for this workspace.");
    }

    const session = await new SignJWT({
      kind: "session",
      name: displayName,
      email,
      oid: payload.oid,
      tid: payload.tid,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(SESSION_ISSUER)
      .setAudience(SESSION_AUDIENCE)
      .setSubject(`${payload.tid}:${payload.oid}`)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_SECONDS}s`)
      .sign(config.sessionSecret);

    const response = redirectResponse(new URL(returnTo, request.url).toString());
    response.headers.append(
      "set-cookie",
      serializeCookie(cookieName(SESSION_COOKIE, request), session, SESSION_SECONDS, request),
    );
    appendClearedOAuthCookies(response, request);
    return response;
  } catch (error) {
    console.error("Microsoft login callback failed", safeAuthError(error));
    const response = redirectResponse(
      new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}auth_error=microsoft_login_failed`, request.url).toString(),
    );
    appendClearedOAuthCookies(response, request);
    return response;
  }
}

export function logoutMicrosoft(request: Request): Response {
  const requestUrl = new URL(request.url);
  const returnTo = safeRelativeReturnPath(requestUrl.searchParams.get("return_to") ?? APP_PATH);
  const response = redirectResponse(new URL(returnTo, request.url).toString());
  for (const name of [SESSION_COOKIE, SECURE_SESSION_COOKIE, OAUTH_COOKIE, SECURE_OAUTH_COOKIE]) {
    response.headers.append("set-cookie", clearCookie(name, request));
  }
  return response;
}

function getMicrosoftConfig(): MicrosoftConfig {
  const tenantId = runtimeValue("MICROSOFT_TENANT_ID");
  const clientId = runtimeValue("MICROSOFT_CLIENT_ID");
  const clientSecret = runtimeValue("MICROSOFT_CLIENT_SECRET");
  const sessionSecret = runtimeValue("AUTH_SESSION_SECRET");
  const allowedDomains = runtimeValue("MICROSOFT_ALLOWED_DOMAINS")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  if (
    !UUID_PATTERN.test(tenantId) ||
    !UUID_PATTERN.test(clientId) ||
    !clientSecret ||
    sessionSecret.length < 64 ||
    allowedDomains.length === 0
  ) {
    throw new MicrosoftAuthError(
      "Microsoft Entra is not configured. Define tenant, client, secret, allowed domains and session secret.",
      "configuration",
    );
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    allowedDomains,
    sessionSecret: new TextEncoder().encode(sessionSecret),
  };
}

function runtimeValue(name: keyof Cloudflare.Env): string {
  return String(env[name] ?? process.env[name] ?? "").trim();
}

function microsoftEmail(payload: Record<string, unknown>): string {
  for (const claim of [payload.preferred_username, payload.email, payload.upn]) {
    if (typeof claim === "string" && claim.includes("@")) return claim.trim().toLowerCase();
  }
  throw new MicrosoftAuthError("Microsoft identity does not contain an email address.");
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
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
    { headers: { accept: "application/json" } },
  );
  const body = (await response.json().catch(() => null)) as Partial<MicrosoftMetadata> | null;
  if (
    !response.ok ||
    !isHttpsUrl(body?.authorization_endpoint) ||
    !isHttpsUrl(body?.token_endpoint) ||
    !isHttpsUrl(body?.jwks_uri) ||
    !isHttpsUrl(body?.issuer)
  ) {
    throw new MicrosoftAuthError("Microsoft OpenID configuration could not be loaded.");
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

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function cookieName(baseName: string, request: Request): string {
  return new URL(request.url).protocol === "https:" ? `__Host-${baseName}` : baseName;
}

function serializeCookie(name: string, value: string, maxAge: number, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

function clearCookie(name: string, request: Request): string {
  const secure = name.startsWith("__Host-") || new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

function appendClearedOAuthCookies(response: Response, request: Request): void {
  response.headers.append("set-cookie", clearCookie(OAUTH_COOKIE, request));
  response.headers.append("set-cookie", clearCookie(SECURE_OAUTH_COOKIE, request));
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      "cache-control": "no-store",
      location,
      "referrer-policy": "no-referrer",
    },
  });
}

function withAuthError(request: Request, error: string): string {
  const url = new URL(APP_PATH, request.url);
  url.searchParams.set("auth_error", error);
  return url.toString();
}

function safeAuthError(error: unknown): string {
  if (error instanceof MicrosoftAuthError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown authentication error";
}
