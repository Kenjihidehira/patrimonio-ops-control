import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../public/demo/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../public/demo/styles.css", import.meta.url), "utf8");
const js = await readFile(new URL("../public/demo/app.js", import.meta.url), "utf8");
const api = await readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8");
const importApi = await readFile(new URL("../app/api/import/route.ts", import.meta.url), "utf8");

test("interface contém os fluxos comerciais essenciais", () => {
  for (const marker of [
    "Controle de patrimônios",
    "inventory-body",
    "asset-dialog",
    "transfer-dialog",
    "nucleus-dialog",
    "audit-list",
    "import-dialog",
    "import-history",
    "export-button",
    "status-form",
  ]) {
    assert.match(`${html}\n${js}`, new RegExp(marker));
  }
  assert.match(html, /id="result-label"/);
  assert.match(js, /dashboard\.resultCount === 1 \? "patrimônio encontrado"/);
});

test("campos críticos possuem semântica e validação no cliente", () => {
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /pattern="\[0-9\]\{6\}"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(js, /\/\^\\d\{6\}\$\//);
});

test("layout contém breakpoints de tablet, celular e redução de movimento", () => {
  assert.match(css, /@media \(max-width: 940px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 430px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("persistência não depende de localStorage e escrita exige autenticação", () => {
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.match(api, /if \(!user\)/);
  assert.match(api, /status: 401/);
  assert.match(api, /applyPersistedAction/);
  assert.match(importApi, /MAX_FILE_BYTES/);
  assert.match(importApi, /status: 401/);
  assert.match(importApi, /mode === "preview"/);
});
