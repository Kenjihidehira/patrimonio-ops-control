import { notFound } from "next/navigation";
import UiLabClient from "./UiLabClient";

// Laboratorio de interface. Existe para desenhar e medir as telas internas sem
// depender de sessao: hoje o login pelo Google nao estabelece uma, e medir num
// banco de ensaio escrito a mao ja produziu conclusao errada nesta base. Aqui a
// marcacao e a real — os proprios componentes — e so os dados sao de ensaio.
//
// Nao existe em producao: o `notFound` abaixo roda no servidor, entao a rota
// responde 404 mesmo que o arquivo seja publicado por engano.
export const dynamic = "force-dynamic";

export default function UiLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UiLabClient />;
}
