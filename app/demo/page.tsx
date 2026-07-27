import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, loginPagePath } from "@/app/auth";
import PatrimonioApp from "@/components/patrimonio/PatrimonioApp";

export const metadata: Metadata = {
  title: "Patrimônio Ops | Controle patrimonial",
  description:
    "Sistema empresarial de controle patrimonial por núcleo, com movimentações e auditoria.",
};

export default async function DemoPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect(loginPagePath("/demo"));

  return <PatrimonioApp />;
}
