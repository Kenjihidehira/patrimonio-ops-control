import type { Metadata } from "next";
import PatrimonioApp from "@/components/patrimonio/PatrimonioApp";

export const metadata: Metadata = {
  title: "Patrimônio Ops | Controle patrimonial",
  description:
    "Sistema empresarial de controle patrimonial por núcleo, com movimentações e auditoria.",
};

export default function DemoPage() {
  return <PatrimonioApp />;
}
