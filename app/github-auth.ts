import {
  authFailureResponse,
  createOAuthTransaction,
  createSessionResponse,
  redirectResponse,
  runtimeValue,
  setOAuthTransactionCookie,
  splitRuntimeList,
  readOAuthTransaction,
} from "@/app/auth";
import { isAllowedGitHubLogin } from "@/lib/auth-utils";

type GitHubConfig = {
  clientId: string;
  clientSecret: string;
  allowedLogins: string[];
};

type GitHubProfile = {
  id?: unknown;
  login?: unknown;
  name?: unknown;
};

const APP_PATH = "/demo";
const CALLBACK_PATH = "/api/auth/github/callback";
const GITHUB_LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;

export async function startGitHubLogin(request: Request): Promise<Response> {
  try {
    const config = getGitHubConfig();
    const transaction = await createOAuthTransaction("github", request, false);
    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: callbackUrl(request),
      state: transaction.state,
      code_challenge: transaction.challenge,
      code_challenge_method: "S256",
      allow_signup: "false",
      prompt: "select_account",
    }).toString();

    const response = redirectResponse(authorizationUrl.toString());
    setOAuthTransactionCookie(response, request, transaction.token);
    return response;
  } catch (error) {
    console.error("GitHub login could not start", safeAuthError(error));
    return authFailureResponse(request, "github", "not_configured");
  }
}

export async function completeGitHubLogin(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  let returnTo = APP_PATH;

  try {
    if (requestUrl.searchParams.has("error")) throw new Error("GitHub returned an OAuth error.");
    const config = getGitHubConfig();
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (!code || !state) throw new Error("OAuth callback is incomplete.");

    const transaction = await readOAuthTransaction("github", request, state);
    returnTo = transaction.returnTo;
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
      throw new Error("GitHub token exchange failed.");
    }

    const profile = await fetchGitHubProfile(tokenBody.access_token);
    const login = normalizeGitHubLogin(profile.login);
    if (!isAllowedGitHubLogin(login, config.allowedLogins)) {
      console.warn("GitHub login rejected by allowlist", { login });
      return authFailureResponse(request, "github", "not_authorized", returnTo);
    }
    const userId = normalizeGitHubUserId(profile.id);
    const displayName =
      typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : login;

    return createSessionResponse(
      request,
      {
        provider: "github",
        displayName,
        identifier: login,
        subject: userId,
        actor: `github:${login}`,
      },
      returnTo,
    );
  } catch (error) {
    console.error("GitHub login callback failed", safeAuthError(error));
    return authFailureResponse(request, "github", "login_failed", returnTo);
  }
}

function getGitHubConfig(): GitHubConfig {
  const clientId = runtimeValue("GITHUB_CLIENT_ID");
  const clientSecret = runtimeValue("GITHUB_CLIENT_SECRET");
  const allowedLogins = splitRuntimeList("GITHUB_ALLOWED_LOGINS");
  if (clientId.length < 10 || clientId.length > 100 || !clientSecret || allowedLogins.length === 0) {
    throw new Error("GitHub OAuth is not configured.");
  }
  return { clientId, clientSecret, allowedLogins };
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
  if (!response.ok || !body) throw new Error("GitHub profile could not be loaded.");
  return body;
}

function normalizeGitHubLogin(value: unknown): string {
  const login = typeof value === "string" ? value.trim() : "";
  if (!GITHUB_LOGIN_PATTERN.test(login)) throw new Error("GitHub profile login is invalid.");
  return login;
}

function normalizeGitHubUserId(value: unknown): string {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error("GitHub profile user ID is invalid.");
  }
  return String(value);
}

function callbackUrl(request: Request): string {
  return new URL(CALLBACK_PATH, request.url).toString();
}

function safeAuthError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown authentication error";
}
