import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { isAllowedGitHubLogin, safeRelativeReturnPath } from "@/lib/auth-utils";

export type GitHubUser = {
  displayName: string;
  login: string;
  userId: string;
  actor: string;
};

type GitHubConfig = {
  clientId: string;
  clientSecret: string;
  allowedLogins: string[];
  sessionSecret: Uint8Array;
};

type GitHubProfile = {
  id?: unknown;
  login?: unknown;
  name?: unknown;
};

const APP_PATH = "/demo/index.html";
const CALLBACK_PATH = "/api/auth/github/callback";
const LOGIN_PATH = "/api/auth/github/login";
const LOGOUT_PATH = "/api/auth/github/logout";
const SESSION_COOKIE = "patrimonio_session";
const OAUTH_COOKIE = "patrimonio_oauth";
const SECURE_SESSION_COOKIE = `__Host-${SESSION_COOKIE}`;
const SECURE_OAUTH_COOKIE = `__Host-${OAUTH_COOKIE}`;
const SESSION_ISSUER = "patrimonio-ops-control";
const SESSION_AUDIENCE = "patrimonio-ops-control-web";
const OAUTH_AUDIENCE = "patrimonio-ops-control-oauth";
const SESSION_SECONDS = 8 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export class GitHubAuthError extends Error {
  code: "configuration" | "oauth";

  constructor(message: string, code: "configuration" | "oauth" = "oauth") {
    super(message);
    this.name = "GitHubAuthError";
    this.code = code;
  }
}

export async function getGitHubUser(): Promise<GitHubUser | null> {
  try {
    const config = getGitHubConfig();
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
      typeof payload.name !== "string" ||
      typeof payload.login !== "string" ||
      typeof payload.uid !== "string" ||
      !isAllowedGitHubLogin(payload.login, config.allowedLogins)
    ) {
      return null;
    }

    return {
      displayName: payload.name,
      login: payload.login,
      userId: payload.uid,
      actor: `github:${payload.login}`,
    };
  } catch {
    return null;
  }
}

export function githubSignInPath(returnTo: string): string {
  return `${LOGIN_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function githubSignOutPath(returnTo = APP_PATH): string {
  return `${LOGOUT_PATH}?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export async function startGitHubLogin(request: Request): Promise<Response> {
  try {
    const config = getGitHubConfig();
    const requestUrl = new URL(request.url);
    const returnTo = safeRelativeReturnPath(requestUrl.searchParams.get("return_to") ?? APP_PATH);
    const state = randomBase64Url(32);
    const verifier = randomBase64Url(64);
    const challenge = await sha256Base64Url(verifier);
    const transaction = await new SignJWT({
      kind: "oauth",
      state,
      verifier,
      returnTo,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(SESSION_ISSUER)
      .setAudience(OAUTH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${OAUTH_SECONDS}s`)
      .sign(config.sessionSecret);

    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: callbackUrl(request),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      allow_signup: "false",
      prompt: "select_account",
    }).toString();

    const response = redirectResponse(authorizationUrl.toString());
    response.headers.append(
      "set-cookie",
      serializeCookie(cookieName(OAUTH_COOKIE, request), transaction, OAUTH_SECONDS, request),
    );
    return response;
  } catch (error) {
    console.error("GitHub login could not start", safeAuthError(error));
    return redirectResponse(withAuthError(request, "github_not_configured"));
  }
}

export async function completeGitHubLogin(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  let returnTo = APP_PATH;

  try {
    if (requestUrl.searchParams.has("error")) {
      throw new GitHubAuthError("GitHub returned an OAuth error.");
    }

    const config = getGitHubConfig();
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (!code || !state) throw new GitHubAuthError("OAuth callback is incomplete.");

    const cookieStore = await cookies();
    const transactionToken =
      cookieStore.get(cookieName(OAUTH_COOKIE, request))?.value ??
      cookieStore.get(SECURE_OAUTH_COOKIE)?.value ??
      cookieStore.get(OAUTH_COOKIE)?.value;
    if (!transactionToken) throw new GitHubAuthError("OAuth transaction cookie is missing.");

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
      typeof transaction.verifier !== "string" ||
      typeof transaction.returnTo !== "string"
    ) {
      throw new GitHubAuthError("OAuth transaction validation failed.");
    }
    returnTo = safeRelativeReturnPath(transaction.returnTo);

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: callbackUrl(request),
        code_verifier: transaction.verifier,
      }),
    });
    const tokenBody = (await tokenResponse.json().catch(() => null)) as {
      access_token?: unknown;
      token_type?: unknown;
    } | null;
    if (
      !tokenResponse.ok ||
      typeof tokenBody?.access_token !== "string" ||
      String(tokenBody.token_type ?? "").toLowerCase() !== "bearer"
    ) {
      throw new GitHubAuthError("GitHub token exchange failed.");
    }

    const profile = await fetchGitHubProfile(tokenBody.access_token);
    const login = normalizeGitHubLogin(profile.login);
    const userId = normalizeGitHubUserId(profile.id);
    if (!isAllowedGitHubLogin(login, config.allowedLogins)) {
      throw new GitHubAuthError("GitHub identity is not authorized for this workspace.");
    }
    const displayName =
      typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : login;

    const session = await new SignJWT({
      kind: "session",
      name: displayName,
      login,
      uid: userId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(SESSION_ISSUER)
      .setAudience(SESSION_AUDIENCE)
      .setSubject(`github:${userId}`)
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
    console.error("GitHub login callback failed", safeAuthError(error));
    const response = redirectResponse(
      new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}auth_error=github_login_failed`, request.url).toString(),
    );
    appendClearedOAuthCookies(response, request);
    return response;
  }
}

export function logoutGitHub(request: Request): Response {
  const requestUrl = new URL(request.url);
  const returnTo = safeRelativeReturnPath(requestUrl.searchParams.get("return_to") ?? APP_PATH);
  const response = redirectResponse(new URL(returnTo, request.url).toString());
  for (const name of [SESSION_COOKIE, SECURE_SESSION_COOKIE, OAUTH_COOKIE, SECURE_OAUTH_COOKIE]) {
    response.headers.append("set-cookie", clearCookie(name, request));
  }
  return response;
}

function getGitHubConfig(): GitHubConfig {
  const clientId = runtimeValue("GITHUB_CLIENT_ID");
  const clientSecret = runtimeValue("GITHUB_CLIENT_SECRET");
  const sessionSecret = runtimeValue("AUTH_SESSION_SECRET");
  const allowedLogins = runtimeValue("GITHUB_ALLOWED_LOGINS")
    .split(",")
    .map((login) => login.trim().toLowerCase())
    .filter(Boolean);

  if (
    clientId.length < 10 ||
    clientId.length > 100 ||
    !clientSecret ||
    sessionSecret.length < 64 ||
    allowedLogins.length === 0
  ) {
    throw new GitHubAuthError(
      "GitHub OAuth is not configured. Define client, secret, allowed logins and session secret.",
      "configuration",
    );
  }

  return {
    clientId,
    clientSecret,
    allowedLogins,
    sessionSecret: new TextEncoder().encode(sessionSecret),
  };
}

function runtimeValue(name: keyof Cloudflare.Env): string {
  return String(env[name] ?? process.env[name] ?? "").trim();
}

async function fetchGitHubProfile(accessToken: string): Promise<GitHubProfile> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "patrimonio-ops-control",
      "x-github-api-version": "2022-11-28",
    },
  });
  const body = (await response.json().catch(() => null)) as GitHubProfile | null;
  if (!response.ok || !body) throw new GitHubAuthError("GitHub profile could not be loaded.");
  return body;
}

function normalizeGitHubLogin(value: unknown): string {
  const login = typeof value === "string" ? value.trim() : "";
  if (!GITHUB_LOGIN_PATTERN.test(login)) {
    throw new GitHubAuthError("GitHub profile does not contain a valid login.");
  }
  return login;
}

function normalizeGitHubUserId(value: unknown): string {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new GitHubAuthError("GitHub profile does not contain a valid user ID.");
  }
  return String(value);
}

function callbackUrl(request: Request): string {
  return new URL(CALLBACK_PATH, request.url).toString();
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
  if (error instanceof GitHubAuthError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown authentication error";
}
