import assert from "node:assert/strict";
import test from "node:test";
import { parsePatrimonioRows } from "../lib/spreadsheet-import.js";

test("interpreta a matriz original, normaliza cinco dígitos e exclui duplicidades", () => {
  const preview = parsePatrimonioRows([
    ["Colaborador(a)", "Núcleo", "Máquina", "Tela 1", "Tela 2", "Cadeira", "Notebook"],
    ["Pessoa A", "Atendimento", 123456, 93376, "Pessoal", "x", 123456],
  ]);

  assert.equal(preview.totalCandidates, 3);
  assert.equal(preview.acceptedCount, 1);
  assert.equal(preview.rejectedCount, 2);
  assert.equal(preview.adjustedCount, 1);
  assert.equal(preview.assets[0].code, "093376");
  assert.equal(preview.assets[0].type, "monitor_1");
  assert.match(preview.errors[0].message, /aparece mais de uma vez/);
  assert.match(preview.warnings.at(-1).message, /Item pessoal/);
});

test("reimporta o formato tabular gerado pela exportação", () => {
  const preview = parsePatrimonioRows([
    [
      "Patrimônio",
      "Tipo",
      "Núcleo",
      "Responsável",
      "Localização",
      "Número de série",
      "Marca e modelo",
      "Aquisição",
      "Valor",
      "Status",
      "Observações",
    ],
    [
      "654321",
      "Notebook",
      "Customer Experience",
      "Pessoa B",
      "Mesa 10",
      "NB-001",
      "Lenovo ThinkPad",
      "2026-07-15",
      5500,
      "Em uso",
      "Importação de teste",
    ],
  ]);

  assert.equal(preview.canCommit, true);
  assert.equal(preview.acceptedCount, 1);
  assert.equal(preview.rejectedCount, 0);
  assert.equal(preview.assets[0].status, "allocated");
  assert.equal(preview.assets[0].value, 5500);
});

test("rejeita arquivo sem cabeçalho reconhecido", () => {
  const preview = parsePatrimonioRows([["coluna desconhecida"], ["valor"]]);
  assert.equal(preview.canCommit, false);
  assert.match(preview.errors[0].message, /Cabeçalhos não reconhecidos/);
});

test("decodifica nomes e gera siglas curtas pelas iniciais dos núcleos", () => {
  const names = [
    "Atacado",
    "Canais Especiais",
    "Consorcio",
    "Coordenadora Geral",
    "Customer Experience",
    "E-Commerce",
    "GazinBank",
    "Gerente do Atendimento ao Cliente",
    "Suporte &amp; Assistência",
    "Teleatendimento",
  ];
  const rows = [
    ["Colaborador(a)", "Núcleo", "Máquina", "Tela 1", "Tela 2", "Cadeira", "Notebook"],
    ...names.map((name, index) => [`Pessoa ${index}`, name, String(200000 + index), "x", "x", "x", "x"]),
  ];

  const preview = parsePatrimonioRows(rows);

  assert.equal(preview.acceptedCount, names.length);
  assert.deepEqual(
    preview.nuclei.map(({ code, name }) => ({ code, name })),
    [
      { code: "A", name: "Atacado" },
      { code: "CE", name: "Canais Especiais" },
      { code: "C", name: "Consorcio" },
      { code: "CG", name: "Coordenadora Geral" },
      { code: "CX", name: "Customer Experience" },
      { code: "EC", name: "E-Commerce" },
      { code: "GB", name: "GazinBank" },
      { code: "GAC", name: "Gerente do Atendimento ao Cliente" },
      { code: "SA", name: "Suporte & Assistência" },
      { code: "T", name: "Teleatendimento" },
    ],
  );
});
