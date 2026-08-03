import type { Metadata } from "next";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" suppressHydrationWarning />
      </head>
      <body>{children}</body>
    </html>
  );
}
