import { getSystemAccess } from "@/lib/supabase";

// Sonda de saude que existe por um motivo so: manter o banco do Supabase
// acordado. O plano Free pausa o projeto apos 7 dias sem atividade, e uma
// leitura periodica reinicia esse contador. O agendador vive em
// `.github/workflows/keep-alive.yml`.
//
// `force-dynamic` e obrigatorio: uma resposta cacheada nao tocaria o banco e o
// ping seria inutil.
export const dynamic = "force-dynamic";

// O identificador ficticio e proposital. `check_user_access` faz curto-circuito
// e NAO consulta o banco quando o identificador e vazio (ver o gateway); com um
// valor qualquer, ele roda o `SELECT` que conta como atividade. A conta nao
// existe, entao a resposta e sempre "nao autorizado" — nenhum dado vaza,
// nenhuma escrita acontece, nenhum evento de auditoria e gravado.
const SONDA = "keep-alive@health.local";

export async function GET(): Promise<Response> {
  const inicio = Date.now();
  try {
    // O retorno e ignorado de proposito: o que importa e a ida ao banco ter
    // completado sem erro. Nao expomos o resultado para nao virar um oraculo
    // de existencia de conta.
    await getSystemAccess(SONDA);
    return Response.json(
      { status: "ok", db: "acordado", ms: Date.now() - inicio },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // Gateway ou banco fora: 503 faz o cron do GitHub falhar e te avisar, em
    // vez de mascarar o problema com um 200. A mensagem nao carrega o erro
    // interno — quem depura olha o log do servidor, nao a resposta publica.
    return Response.json(
      { status: "erro", db: "inacessivel", ms: Date.now() - inicio },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
