const APP_PATH = "/demo/index.html";
const RESERVED_AUTH_PATHS = new Set([
  "/api/auth/microsoft/login",
  "/api/auth/microsoft/logout",
  "/api/auth/microsoft/callback",
]);

export function isAllowedMicrosoftEmail(email, allowedDomains) {
  const normalized = String(email ?? "").trim().toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return false;
  const domain = normalized.slice(separator + 1);
  return allowedDomains.some((allowed) => domain === String(allowed).trim().toLowerCase());
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
