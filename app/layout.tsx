import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { headers } from "next/headers";
import Script from "next/script";
import "./globals.css";

// Servidas pelo próprio domínio: a CSP restringe `font-src` a 'self', então
// carregar de um CDN de fontes seria bloqueado pela nossa própria política.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

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
    <html
      lang="pt-BR"
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" nonce={nonce} />
      </head>
      <body>{children}</body>
    </html>
  );
}
