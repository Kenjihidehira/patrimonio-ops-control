import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Substitui o antigo `withSecurityHeaders` do Worker. O nonce vai no cabeçalho da
// requisição: o Next.js o aplica aos próprios scripts que injeta, dispensando a
// reescrita de HTML que a Cloudflare fazia com HTMLRewriter.
export function proxy(request: NextRequest) {
  const nonce = randomNonce();
  // O React exige `eval` apenas no modo de desenvolvimento, para reconstruir
  // pilhas de chamada. A produção nunca recebe essa permissão.
  const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${developmentEval}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  applySecurityHeaders(response.headers);
  return response;
}

function applySecurityHeaders(headers: Headers): void {
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "no-referrer");
  headers.set(
    "permissions-policy",
    "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), browsing-topics=()",
  );
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.delete("x-powered-by");
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export const config = {
  matcher: [
    // Cobre todas as rotas, inclusive as de API. Os arquivos estáticos gerados
    // pelo build e a otimização de imagem ficam de fora por não renderizarem HTML.
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
