const APP_PATH = "/demo/index.html";
const RESERVED_AUTH_PATHS = new Set([
  "/api/auth/github/login",
  "/api/auth/github/logout",
  "/api/auth/github/callback",
]);

export function isAllowedGitHubLogin(login, allowedLogins) {
  const normalized = String(login ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return allowedLogins.some(
    (allowed) => normalized === String(allowed).trim().toLowerCase(),
  );
}

export function safeRelativeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return APP_PATH;
  }

  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || RESERVED_AUTH_PATHS.has(url.pathname)) {
      return APP_PATH;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return APP_PATH;
  }
}
