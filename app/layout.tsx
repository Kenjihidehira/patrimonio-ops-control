import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Patrimonio Ops | Controle patrimonial",
  description:
    "Controle empresarial de ativos por núcleo, com transferências e auditoria.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
