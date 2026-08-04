const APP_PATH = "/demo";
const RESERVED_AUTH_PATHS = new Set([
  "/api/auth/google/login",
  "/api/auth/google/callback",
  "/api/auth/credentials/login",
  "/api/auth/logout",
  "/login",
  "/login/",
  "/login/index.html",
]);

export function safeRelativeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return APP_PATH;
  }

  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || RESERVED_AUTH_PATHS.has(url.pathname)) {
      return APP_PATH;
    }
    if (url.pathname === "/demo/" || url.pathname === "/demo/index.html") {
      return `${APP_PATH}${url.search}${url.hash}`;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return APP_PATH;
  }
}
