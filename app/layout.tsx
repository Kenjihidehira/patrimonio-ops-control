import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Patrimonio Ops | Controle patrimonial",
  description:
    "Controle empresarial de ativos por núcleo, com transferências e auditoria.",
  icons: {
    icon: "/brand/cx-mark-header.png",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // O nonce é gerado por requisição em `proxy.ts`. Lê-lo aqui torna a renderização
  // dinâmica de propósito: HTML pré-renderizado carregaria um nonce vencido.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
      </head>
      <body>{children}</body>
    </html>
  );
}
