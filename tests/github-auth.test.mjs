import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedGitHubLogin,
  isAllowedGoogleEmail,
  safeRelativeReturnPath,
} from "../lib/auth-utils.js";

test("aceita apenas logins GitHub explicitamente autorizados", () => {
  assert.equal(isAllowedGitHubLogin("Kenjihidehira", ["kenjihidehira"]), true);
  assert.equal(isAllowedGitHubLogin("outro-usuario", ["kenjihidehira"]), false);
  assert.equal(isAllowedGitHubLogin("", ["kenjihidehira"]), false);
});

test("mantém somente retornos locais e bloqueia loops de autenticação", () => {
  assert.equal(safeRelativeReturnPath("/demo/index.html?view=audit#item"), "/demo/index.html?view=audit#item");
  assert.equal(safeRelativeReturnPath("https://example.com/roubo"), "/demo/index.html");
  assert.equal(safeRelativeReturnPath("//example.com/roubo"), "/demo/index.html");
  assert.equal(safeRelativeReturnPath("/api/auth/github/callback"), "/demo/index.html");
  assert.equal(safeRelativeReturnPath("/api/auth/google/callback"), "/demo/index.html");
  assert.equal(safeRelativeReturnPath("/login/index.html"), "/demo/index.html");
});

test("restringe Google por e-mail exato", () => {
  assert.equal(isAllowedGoogleEmail("Pessoa@Gazin.com.br", ["pessoa@gazin.com.br"]), true);
  assert.equal(isAllowedGoogleEmail("outra@gazin.com.br", ["pessoa@gazin.com.br"]), false);
  assert.equal(isAllowedGoogleEmail("invalido", ["invalido"]), false);
});
