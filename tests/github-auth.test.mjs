import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedGitHubLogin, safeRelativeReturnPath } from "../lib/auth-utils.js";

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
});
