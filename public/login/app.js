const APP_PATH = "/demo/index.html";
const RESERVED_PATHS = new Set([
  "/login",
  "/login/",
  "/login/index.html",
  "/api/auth/logout",
]);

const params = new URLSearchParams(window.location.search);
const returnTo = safeReturnPath(params.get("return_to"));

document.querySelectorAll("[data-provider]").forEach((link) => {
  const provider = link.dataset.provider;
  link.href = `/api/auth/${provider}/login?return_to=${encodeURIComponent(returnTo)}`;
});

const errorCode = params.get("auth_error");
const errorElement = document.querySelector("#auth-error");
if (errorCode && errorElement) {
  errorElement.textContent = authErrorMessage(errorCode);
  errorElement.hidden = false;
  errorElement.focus?.();
}

function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return APP_PATH;
  }
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || RESERVED_PATHS.has(url.pathname) || url.pathname.startsWith("/api/auth/")) {
      return APP_PATH;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return APP_PATH;
  }
}

function authErrorMessage(code) {
  const provider = code.startsWith("google_") ? "Google" : "GitHub";

  if (code.endsWith("_not_configured")) {
    return `O acesso com ${provider} ainda não foi configurado pelo administrador.`;
  }
  if (code.endsWith("_not_authorized")) {
    return `Esta conta ${provider} não está autorizada para acessar a base empresarial.`;
  }
  return `Não foi possível concluir o acesso com ${provider}. Tente novamente.`;
}
