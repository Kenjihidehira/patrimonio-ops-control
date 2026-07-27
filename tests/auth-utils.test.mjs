import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedGoogleEmail,
  safeRelativeReturnPath,
} from "../lib/auth-utils.js";

test("mantém somente retornos locais e bloqueia loops de autenticação", () => {
  assert.equal(safeRelativeReturnPath("/demo/index.html?view=audit#item"), "/demo?view=audit#item");
  assert.equal(safeRelativeReturnPath("/demo/"), "/demo");
  assert.equal(safeRelativeReturnPath("https://example.com/roubo"), "/demo");
  assert.equal(safeRelativeReturnPath("//example.com/roubo"), "/demo");
  assert.equal(safeRelativeReturnPath("/api/auth/google/callback"), "/demo");
  assert.equal(safeRelativeReturnPath("/login/index.html"), "/demo");
});

test("restringe Google por e-mail exato", () => {
  assert.equal(isAllowedGoogleEmail("Pessoa@Gazin.com.br", ["pessoa@gazin.com.br"]), true);
  assert.equal(isAllowedGoogleEmail("outra@gazin.com.br", ["pessoa@gazin.com.br"]), false);
  assert.equal(isAllowedGoogleEmail("invalido", ["invalido"]), false);
});
