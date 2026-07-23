import type { Metadata } from "next";
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var m=document.cookie.match(/(?:^|; )patrimonio_theme=(dark|light)/);var t=m?m[1]:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;}());`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
