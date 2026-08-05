import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import {
  safeRelativeReturnPath,
} from "@/lib/auth-utils";
import { getSystemAccess, recordAuthEvent } from "@/lib/supabase";

export type OAuthProvider = "google";
export type AuthProvider = OAuthProvider | "credentials" | "registration";

export type AuthenticatedUser = {
  provider: AuthProvider;
  displayName: string;
  identifier: string;
  subject: string;
  actor: string;
  sessionVersion: number;
};

export type OAuthTransaction = {
  provider: OAuthProvider;
  state: string;
  nonce: string | null;
  verifier: string;
  returnTo: string;
};

type SessionIdentity = AuthenticatedUser;

const APP_PATH = "/demo";
const LOGIN_PATH = "/login";
const LOGOUT_PATH = "/api/auth/logout";
const SESSION_COOKIE = "patrimonio_session";
const OAUTH_COOKIE = "patrimonio_oauth";
const SECURE_SESSION_COOKIE = `__Host-${SESSION_COOKIE}`;
const SECURE_OAUTH_COOKIE = `__Host-${OAUTH_COOKIE}`;
const SESSION_ISSUER = "patrimonio-ops-control";
const SESSION_AUDIENCE = "patrimonio-ops-control-web";
const OAUTH_AUDIENCE = "patrimonio-ops-control-oauth";
const SESSION_SECONDS = 8 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(SECURE_SESSION_COOKIE)?.value ??
      cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    if (
      payload.kind !== "session" ||
      !isAuthProvider(payload.provider) ||
      typeof payload.name !== "string" ||
      typeof payload.identifier !== "string" ||
      typeof payload.uid !== "string" ||
      typeof payload.sv !== "number"
    ) {
      return null;
    }

    const identity: SessionIdentity = {
      provider: payload.provider,
      displayName: payload.name,
      identifier: payload.identifier,
      subject: payload.uid,
      actor: `${payload.provider}:${payload.identifier}`,
      sessionVersion: payload.sv,
    };
    return await isIdentityStillAuthorized(identity) ? identity : null;
  } catch {
    return null;
  }
}

export function loginPagePath(returnTo = APP_PATH): string {
  return `${LOGIN_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function signOutPath(returnTo = LOGIN_PATH): string {
  const destination = returnTo === LOGIN_PATH ? LOGIN_PATH : safeRelativeReturnPath(returnTo);
  return `${LOGOUT_PATH}?return_to=${encodeURIComponent(destination)}`;
}

export async function createOAuthTransaction(
  provider: OAuthProvider,
  request: Request,
  includeNonce: boolean,
): Promise<OAuthTransaction & { challenge: string; token: string }> {
  const requestUrl = new URL(request.url);
  const returnTo = safeRelativeReturnPath(requestUrl.searchParams.get("return_to") ?? APP_PATH);
  const state = randomBase64Url(32);
  const nonce = includeNonce ? randomBase64Url(32) : null;
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const token = await new SignJWT({
    kind: "oauth",
    provider,
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
    .sign(sessionSecret());

  return { provider, state, nonce, verifier, returnTo, challenge, token };
}

export async function readOAuthTransaction(
  provider: OAuthProvider,
  request: Request,
  state: string,
): Promise<OAuthTransaction> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(cookieName(OAUTH_COOKIE, request))?.value ??
    cookieStore.get(SECURE_OAUTH_COOKIE)?.value ??
    cookieStore.get(OAUTH_COOKIE)?.value;
  if (!token) throw new Error("OAuth transaction cookie is missing.");

  const { payload } = await jwtVerify(token, sessionSecret(), {
    algorithms: ["HS256"],
    issuer: SESSION_ISSUER,
    audience: OAUTH_AUDIENCE,
  });
  if (
    payload.kind !== "oauth" ||
    payload.provider !== provider ||
    payload.state !== state ||
    typeof payload.verifier !== "string" ||
    typeof payload.returnTo !== "string" ||
    !(typeof payload.nonce === "string" || payload.nonce === null)
  ) {
    throw new Error("OAuth transaction validation failed.");
  }

  return {
    provider,
    state,
    nonce: payload.nonce,
    verifier: payload.verifier,
    returnTo: safeRelativeReturnPath(payload.returnTo),
  };
}

export async function createSessionResponse(
  request: Request,
  identity: SessionIdentity,
  returnTo: string,
): Promise<Response> {
  const session = await new SignJWT({
    kind: "session",
    provider: identity.provider,
    name: identity.displayName,
    identifier: identity.identifier,
    uid: identity.subject,
    sv: identity.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(`${identity.provider}:${identity.subject}`)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(sessionSecret());

  const response = redirectResponse(
    new URL(safeRelativeReturnPath(returnTo), request.url).toString(),
    identity.provider === "credentials" ? 303 : 302,
  );
  response.headers.append(
    "set-cookie",
    serializeCookie(cookieName(SESSION_COOKIE, request), session, SESSION_SECONDS, request),
  );
  appendClearedOAuthCookies(response, request);
  return response;
}

export function setOAuthTransactionCookie(
  response: Response,
  request: Request,
  token: string,
): void {
  response.headers.append(
    "set-cookie",
    serializeCookie(cookieName(OAUTH_COOKIE, request), token, OAUTH_SECONDS, request),
  );
}

export async function logout(request: Request): Promise<Response> {
  const user = await getAuthenticatedUser();
  if (user) {
    await recordAuthEvent(user.identifier, "logout", "success").catch(
      (error) => console.error("Logout audit failed", safeAuditError(error)),
    );
  }
  const requestUrl = new URL(request.url);
  const requestedReturn = requestUrl.searchParams.get("return_to") ?? LOGIN_PATH;
  const returnTo = requestedReturn === LOGIN_PATH ? LOGIN_PATH : safeRelativeReturnPath(requestedReturn);
  const response = redirectResponse(new URL(returnTo, request.url).toString());
  for (const name of [SESSION_COOKIE, SECURE_SESSION_COOKIE, OAUTH_COOKIE, SECURE_OAUTH_COOKIE]) {
    response.headers.append("set-cookie", clearCookie(name, request));
  }
  return response;
}

export function authFailureResponse(
  request: Request,
  provider: AuthProvider,
  reason:
    | "not_configured"
    | "login_failed"
    | "not_authorized"
    | "invalid_credentials"
    | "rate_limited"
    | "pending_approval"
    | "invalid_data"
    | "duplicate"
    | "failed",
  returnTo = APP_PATH,
): Response {
  const url = new URL(LOGIN_PATH, request.url);
  url.searchParams.set("auth_error", `${provider}_${reason}`);
  url.searchParams.set("return_to", safeRelativeReturnPath(returnTo));
  const response = redirectResponse(url.toString(), provider === "google" ? 302 : 303);
  appendClearedOAuthCookies(response, request);
  return response;
}

export function registrationSuccessResponse(
  request: Request,
  returnTo = APP_PATH,
): Response {
  const url = new URL(LOGIN_PATH, request.url);
  url.searchParams.set("registered", "1");
  url.searchParams.set("return_to", safeRelativeReturnPath(returnTo));
  return redirectResponse(url.toString(), 303);
}

export function redirectResponse(location: string, status: 302 | 303 = 302): Response {
  return new Response(null, {
    status,
    headers: {
      "cache-control": "no-store",
      location,
      "referrer-policy": "no-referrer",
    },
  });
}

export function runtimeValue(name: keyof NodeJS.ProcessEnv): string {
  return String(process.env[name] ?? "").trim();
}

async function isIdentityStillAuthorized(identity: SessionIdentity): Promise<boolean> {
  const access = await getSystemAccess(identity.identifier);
  return access.authorized && access.sessionVersion === identity.sessionVersion;
}

function sessionSecret(): Uint8Array {
  const value = runtimeValue("AUTH_SESSION_SECRET");
  if (value.length < 64) throw new Error("AUTH_SESSION_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

function isAuthProvider(value: unknown): value is AuthProvider {
  return value === "google" || value === "credentials";
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

function safeAuditError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown audit error";
}
