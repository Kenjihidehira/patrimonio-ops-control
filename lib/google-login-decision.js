/**
 * A decisão de recusar um login com Google, isolada do transporte.
 *
 * Ela morava dentro de um `if` de cinco condições em `app/google-auth.ts`, o
 * que a tornava impossível de testar sem simular o Google inteiro — rede,
 * troca de token e verificação de assinatura. Por isso a checagem de acesso
 * mais sensível do sistema não tinha um único teste que a executasse: só havia
 * teste lendo o texto do arquivo.
 *
 * Aqui é função pura. A ordem das checagens importa e é do mais específico
 * para o mais comum: um `nonce` divergente indica ataque de repetição e
 * merece nome próprio, enquanto "sem permissão na base" é o desfecho
 * cotidiano de quem simplesmente não foi liberado.
 *
 * @typedef {"nonce_divergente"
 *   | "sub_ausente"
 *   | "email_nao_verificado"
 *   | "dominio_fora_do_workspace"
 *   | "sem_permissao_na_base"} MotivoDeRecusa
 *
 * @param {{
 *   nonceDoToken: unknown,
 *   nonceEsperado: string,
 *   sub: string | null,
 *   emailVerificado: unknown,
 *   dominioDoToken: unknown,
 *   dominioExigido: string,
 *   autorizado: boolean,
 * }} entrada
 * @returns {MotivoDeRecusa | null} o motivo, ou `null` quando o login pode seguir
 */
export function motivoDaRecusaGoogle(entrada) {
  if (entrada.nonceDoToken !== entrada.nonceEsperado) return "nonce_divergente";
  if (!entrada.sub) return "sub_ausente";
  // `email_verified` precisa ser exatamente `true`: o Google entrega booleano,
  // e aceitar a string "true" abriria a porta para um provedor que devolvesse
  // o campo como texto.
  if (entrada.emailVerificado !== true) return "email_nao_verificado";
  // Sem domínio exigido, a checagem não se aplica — não é o mesmo que passar.
  if (entrada.dominioExigido && entrada.dominioDoToken !== entrada.dominioExigido) {
    return "dominio_fora_do_workspace";
  }
  if (!entrada.autorizado) return "sem_permissao_na_base";
  return null;
}
