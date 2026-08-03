import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");
const api = read("docs/api.md");
const lgpd = read("docs/lgpd.md");
const publication = read("docs/publicacao.md");
const projectContext = read("docs/contexto-projeto.md");
const changelog = read("CHANGELOG.md");

test("documentação usa nomes e links internos em PT-BR", () => {
  assert.match(readme, /docs\/arquitetura\.md/);
  assert.match(readme, /docs\/publicacao\.md/);
  assert.doesNotMatch(readme, /docs\/(architecture|deploy)\.md/);
});

test("documentação de autenticação acompanha as rotas implementadas", () => {
  for (const route of [
    "/api/auth/google/login",
    "/api/auth/google/callback",
    "/api/auth/logout",
  ]) {
    assert.match(api, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(api, /\/api\/auth\/github\//);
  assert.match(api, /\| `POST` \| `\/api\/auth\/logout`/);
  assert.match(api, /304 Not Modified/);
});

test("documentação separa controles técnicos de homologação LGPD", () => {
  assert.match(lgpd, /Situação de homologação/);
  assert.match(lgpd, /Informação pendente de validação/);
  assert.match(lgpd, /não deve ser declarado integralmente conforme à LGPD/);
});

test("contexto e runbook acompanham a release autenticada", () => {
  assert.match(readme, /docs\/contexto-projeto\.md/);
  assert.match(readme, /CHANGELOG\.md/);
  assert.match(projectContext, /Gazin LOG/);
  assert.match(projectContext, /Supabase Auth não é usado/);
  assert.match(changelog, /## \[0\.2\.0\] - 2026-08-03/);
  assert.match(publication, /HTTP `307`/);
  assert.match(publication, /HTTP `401`/);
  assert.doesNotMatch(publication, /sessão anônima e projeção vazia/);
});
