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
import { isAllowedGoogleEmail } from "@/lib/auth-utils";

type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  allowedEmails: string[];
};

type GoogleMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
};

const APP_PATH = "/demo";
const CALLBACK_PATH = "/api/auth/google/callback";
const DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration";
let metadataPromise: Promise<GoogleMetadata> | null = null;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function startGoogleLogin(request: Request): Promise<Response> {
  try {
    const config = getGoogleConfig();
    const metadata = await getGoogleMetadata();
    const transaction = await createOAuthTransaction("google", request, true);
    const authorizationUrl = new URL(metadata.authorization_endpoint);
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: callbackUrl(request),
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
    console.error("Google login could not start", safeAuthError(error));
    return authFailureResponse(request, "google", "not_configured");
  }
}

export async function completeGoogleLogin(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  let returnTo = APP_PATH;

  try {
    if (requestUrl.searchParams.has("error")) throw new Error("Google returned an OAuth error.");
    const config = getGoogleConfig();
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (!code || !state) throw new Error("OAuth callback is incomplete.");
    const transaction = await readOAuthTransaction("google", request, state);
    returnTo = transaction.returnTo;
    if (!transaction.nonce) throw new Error("OAuth nonce is missing.");

    const metadata = await getGoogleMetadata();
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
      }),
    });
    const tokenBody = (await tokenResponse.json().catch(() => null)) as { id_token?: unknown } | null;
    if (!tokenResponse.ok || typeof tokenBody?.id_token !== "string") {
      throw new Error("Google token exchange failed.");
    }

    const { payload } = await jwtVerify(tokenBody.id_token, getGoogleJwks(metadata.jwks_uri), {
      algorithms: ["RS256"],
      issuer: [metadata.issuer, "accounts.google.com"],
      audience: config.clientId,
    });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (
      payload.nonce !== transaction.nonce ||
      typeof payload.sub !== "string" ||
      payload.email_verified !== true ||
      !isAllowedGoogleEmail(email, config.allowedEmails)
    ) {
      console.warn("Google login rejected by email allowlist");
      return authFailureResponse(request, "google", "not_authorized", returnTo);
    }

    return createSessionResponse(
      request,
      {
        provider: "google",
        displayName: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email,
        identifier: email,
        subject: payload.sub,
        actor: `google:${email}`,
      },
      returnTo,
    );
  } catch (error) {
    console.error("Google login callback failed", safeAuthError(error));
    return authFailureResponse(request, "google", "login_failed", returnTo);
  }
}

function getGoogleConfig(): GoogleConfig {
  const clientId = runtimeValue("GOOGLE_CLIENT_ID");
  const clientSecret = runtimeValue("GOOGLE_CLIENT_SECRET");
  const allowedEmails = splitRuntimeList("GOOGLE_ALLOWED_EMAILS");
  if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret || allowedEmails.length === 0) {
    throw new Error("Google OpenID Connect is not configured.");
  }
  return { clientId, clientSecret, allowedEmails };
}

async function getGoogleMetadata(): Promise<GoogleMetadata> {
  metadataPromise ??= fetchGoogleMetadata();
  try {
    return await metadataPromise;
  } catch (error) {
    metadataPromise = null;
    throw error;
  }
}

async function fetchGoogleMetadata(): Promise<GoogleMetadata> {
  const response = await fetch(DISCOVERY_URL, { headers: { accept: "application/json" } });
  const body = (await response.json().catch(() => null)) as Partial<GoogleMetadata> | null;
  if (
    !response.ok ||
    !isHttpsUrl(body?.authorization_endpoint) ||
    !isHttpsUrl(body?.token_endpoint) ||
    !isHttpsUrl(body?.jwks_uri) ||
    !isHttpsUrl(body?.issuer)
  ) {
    throw new Error("Google OpenID configuration could not be loaded.");
  }
  return body as GoogleMetadata;
}

function getGoogleJwks(jwksUri: string) {
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
