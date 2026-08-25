import assert from "node:assert/strict";
import test from "node:test";
import { motivoDaRecusaGoogle } from "../lib/google-login-decision.js";

// Um login que deve passar. Cada teste parte daqui e estraga uma coisa só, para
// que a asserção fale de uma causa e não de uma combinação.
const aprovado = {
  nonceDoToken: "nonce-desta-transacao",
  nonceEsperado: "nonce-desta-transacao",
  sub: "1029384756",
  emailVerificado: true,
  dominioDoToken: undefined,
  dominioExigido: "",
  autorizado: true,
};

test("deixa passar quando todas as checagens conferem", () => {
  assert.equal(motivoDaRecusaGoogle(aprovado), null);
});

test("nonce divergente é recusado antes de qualquer outra coisa", () => {
  // O `nonce` amarra o token a esta transação. Divergência indica repetição de
  // um token antigo, e por isso vem antes até de `sub` ausente: é a única
  // recusa que sugere ataque em vez de configuração.
  const repetido = {
    ...aprovado,
    nonceDoToken: "nonce-de-outra-transacao",
    sub: null,
    autorizado: false,
  };
  assert.equal(motivoDaRecusaGoogle(repetido), "nonce_divergente");
});

test("nonce ausente no token não vira aprovação por acidente", () => {
  assert.equal(
    motivoDaRecusaGoogle({ ...aprovado, nonceDoToken: undefined }),
    "nonce_divergente",
  );
});

test("token sem sub é recusado", () => {
  assert.equal(motivoDaRecusaGoogle({ ...aprovado, sub: null }), "sub_ausente");
});

test("e-mail não verificado é recusado, inclusive quando vem como texto", () => {
  assert.equal(
    motivoDaRecusaGoogle({ ...aprovado, emailVerificado: false }),
    "email_nao_verificado",
  );
  // A comparação é estrita: aceitar a string "true" deixaria passar um
  // provedor que devolvesse o campo como texto.
  assert.equal(
    motivoDaRecusaGoogle({ ...aprovado, emailVerificado: "true" }),
    "email_nao_verificado",
  );
  assert.equal(
    motivoDaRecusaGoogle({ ...aprovado, emailVerificado: undefined }),
    "email_nao_verificado",
  );
});

test("domínio fora do workspace é recusado quando há domínio exigido", () => {
  assert.equal(
    motivoDaRecusaGoogle({
      ...aprovado,
      dominioExigido: "gazin.com.br",
      dominioDoToken: "gmail.com",
    }),
    "dominio_fora_do_workspace",
  );
  // Conta pessoal não traz `hd` nenhum: ausência também é fora do workspace.
  assert.equal(
    motivoDaRecusaGoogle({
      ...aprovado,
      dominioExigido: "gazin.com.br",
      dominioDoToken: undefined,
    }),
    "dominio_fora_do_workspace",
  );
});

test("sem domínio exigido, a checagem de domínio não se aplica", () => {
  // GOOGLE_WORKSPACE_DOMAIN não está definido em produção hoje. Isso precisa
  // significar "não checo o domínio", e não "aprovo qualquer domínio por
  // omissão" — a diferença aparece se alguém definir a variável depois.
  assert.equal(
    motivoDaRecusaGoogle({ ...aprovado, dominioExigido: "", dominioDoToken: "gmail.com" }),
    null,
  );
});

test("e-mail sem permissão na base é recusado por último", () => {
  // É o desfecho cotidiano — alguém que existe no Google e não foi liberado
  // aqui. Vem por último justamente para que os outros quatro, que indicam
  // defeito ou ataque, não sejam mascarados por ele.
  assert.equal(
    motivoDaRecusaGoogle({ ...aprovado, autorizado: false }),
    "sem_permissao_na_base",
  );
});

test("a ordem das recusas é do mais específico para o mais comum", () => {
  // Todas as checagens falhando ao mesmo tempo: o motivo relatado tem que ser
  // o primeiro da ordem, não o último a ser avaliado.
  const tudoErrado = {
    nonceDoToken: "outro",
    nonceEsperado: "esperado",
    sub: null,
    emailVerificado: false,
    dominioDoToken: "gmail.com",
    dominioExigido: "gazin.com.br",
    autorizado: false,
  };
  assert.equal(motivoDaRecusaGoogle(tudoErrado), "nonce_divergente");

  const semNonceErrado = { ...tudoErrado, nonceDoToken: "esperado" };
  assert.equal(motivoDaRecusaGoogle(semNonceErrado), "sub_ausente");

  const comSub = { ...semNonceErrado, sub: "1029384756" };
  assert.equal(motivoDaRecusaGoogle(comSub), "email_nao_verificado");

  const comEmail = { ...comSub, emailVerificado: true };
  assert.equal(motivoDaRecusaGoogle(comEmail), "dominio_fora_do_workspace");

  const comDominio = { ...comEmail, dominioDoToken: "gazin.com.br" };
  assert.equal(motivoDaRecusaGoogle(comDominio), "sem_permissao_na_base");

  const liberado = { ...comDominio, autorizado: true };
  assert.equal(motivoDaRecusaGoogle(liberado), null);
});
