import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedMicrosoftEmail, safeRelativeReturnPath } from "../lib/auth-utils.js";

test("aceita apenas e-mails dos domínios Microsoft permitidos", () => {
  assert.equal(isAllowedMicrosoftEmail("operador@Gazin.com.br", ["gazin.com.br"]), true);
  assert.equal(isAllowedMicrosoftEmail("operador@sub.gazin.com.br", ["gazin.com.br"]), false);
  assert.equal(isAllowedMicrosoftEmail("operador@externo.com", ["gazin.com.br"]), false);
  assert.equal(isAllowedMicrosoftEmail("email-invalido", ["gazin.com.br"]), false);
});

test("mantém somente retornos locais e bloqueia loops de autenticação", () => {
  assert.equal(safeRelativeReturnPath("/demo/index.html?view=audit#item"), "/demo/index.html?view=audit#item");
  assert.equal(safeRelativeReturnPath("https://example.com/roubo"), "/demo/index.html");
  assert.equal(safeRelativeReturnPath("//example.com/roubo"), "/demo/index.html");
  assert.equal(safeRelativeReturnPath("/api/auth/microsoft/callback"), "/demo/index.html");
});
