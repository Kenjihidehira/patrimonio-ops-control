"use client";

import { useState } from "react";
import PatrimonioApp from "@/components/patrimonio/PatrimonioApp";
import { dashboardDeEnsaio } from "./fixture";

// O app busca o estado em `/api/state`, que exige sessao. Em vez de afrouxar a
// rota — mudanca que poderia escapar para producao —, o desvio fica contido
// aqui: `fetch` responde localmente a essa chamada, e so a ela. Qualquer outra
// requisicao segue o caminho normal.
function instalarDesvio() {
  const original = window.fetch;
  if ((window as { __uiLab?: boolean }).__uiLab) return;
  (window as { __uiLab?: boolean }).__uiLab = true;

  window.fetch = async (entrada, iniciais) => {
    const url = typeof entrada === "string"
      ? entrada
      : entrada instanceof URL
        ? entrada.href
        : entrada.url;
    if (url.startsWith("/api/state")) {
      return new Response(JSON.stringify(dashboardDeEnsaio()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return original(entrada, iniciais);
  };
}

export default function UiLabClient() {
  // Instalado antes da primeira renderizacao do app, senao a busca inicial
  // escapa para a rota real e volta 401.
  const [pronto] = useState(() => {
    if (typeof window !== "undefined") instalarDesvio();
    return true;
  });
  if (!pronto) return null;
  return <PatrimonioApp />;
}
