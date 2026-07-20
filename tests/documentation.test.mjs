import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");
const api = read("docs/api.md");

test("documentação usa nomes e links internos em PT-BR", () => {
  assert.match(readme, /docs\/arquitetura\.md/);
  assert.match(readme, /docs\/publicacao\.md/);
  assert.doesNotMatch(readme, /docs\/(architecture|deploy)\.md/);
});

test("documentação de autenticação acompanha as rotas implementadas", () => {
  for (const route of [
    "/api/auth/github/login",
    "/api/auth/github/callback",
    "/api/auth/google/login",
    "/api/auth/google/callback",
    "/api/auth/logout",
  ]) {
    assert.match(api, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(api, /\/api\/auth\/github\/logout/);
});
