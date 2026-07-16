import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  applyAction,
  buildDashboard,
  DomainError,
  normalizeState,
} from "../lib/domain.js";

const seed = JSON.parse(
  await readFile(new URL("../data/seed.json", import.meta.url), "utf8"),
);

test("normaliza o seed e calcula o resumo operacional", () => {
  const state = normalizeState(seed);
  const dashboard = buildDashboard(state);

  assert.equal(state.assets.length, 15);
  assert.equal(dashboard.summary.total, 14);
  assert.equal(dashboard.summary.allocated, 8);
  assert.equal(dashboard.summary.maintenance, 2);
  assert.equal(dashboard.summary.discrepancies, 1);
  assert.equal(dashboard.summary.retired, 1);
  assert.equal(dashboard.nuclei.length, 5);
  assert.equal(dashboard.collaborators.length, 0);
});

test("rejeita identificador que não contenha exatamente seis números", () => {
  assert.throws(
    () =>
      applyAction(
        seed,
        {
          type: "create_asset",
          at: "2026-07-15T12:00:00.000Z",
          asset: validAsset({ id: "12345" }),
        },
        "auditor@empresa.com",
      ),
    (error) => error instanceof DomainError && /6 números/.test(error.message),
  );
});

test("impede cadastro de identificador duplicado", () => {
  assert.throws(
    () =>
      applyAction(
        seed,
        {
          type: "create_asset",
          at: "2026-07-15T12:00:00.000Z",
          asset: validAsset({ id: "104281" }),
        },
        "auditor@empresa.com",
      ),
    /já está cadastrado/,
  );
});

test("cadastra patrimônio válido e registra o ator na auditoria", () => {
  const nextState = applyAction(
    seed,
    {
      type: "create_asset",
      at: "2026-07-15T12:00:00.000Z",
      movementId: "movement-test",
      asset: validAsset(),
    },
    "auditor@empresa.com",
  );

  const asset = nextState.assets.find((item) => item.id === "654321");
  assert.equal(nextState.revision, 1);
  assert.equal(asset.movements[0].actor, "auditor@empresa.com");
  assert.equal(asset.movements[0].type, "registration");
  assert.equal(seed.assets.length, 15, "a ação não deve mutar o estado original");
});

test("transfere ativo de forma auditável e aloca item disponível", () => {
  const nextState = applyAction(
    seed,
    {
      type: "transfer_asset",
      assetId: "104293",
      nucleusId: "nuc-rh",
      location: "Mesa RH-05",
      assignee: "Renata Melo",
      note: "Equipamento destinado ao onboarding.",
      at: "2026-07-15T13:00:00.000Z",
      movementId: "movement-transfer",
    },
    "ti@empresa.com",
  );

  const asset = nextState.assets.find((item) => item.id === "104293");
  assert.equal(asset.nucleusId, "nuc-rh");
  assert.equal(asset.status, "allocated");
  assert.equal(asset.movements[0].type, "transfer");
  assert.match(asset.movements[0].to, /Recursos Humanos/);
});

test("exige motivo e mudança efetiva ao atualizar status", () => {
  assert.throws(
    () =>
      applyAction(
        seed,
        {
          type: "update_status",
          assetId: "104281",
          status: "maintenance",
          note: "",
        },
        "ti@empresa.com",
      ),
    /Motivo da alteração é obrigatório/,
  );

  assert.throws(
    () =>
      applyAction(
        seed,
        {
          type: "update_status",
          assetId: "104281",
          status: "allocated",
          note: "Teste",
        },
        "ti@empresa.com",
      ),
    /status diferente/,
  );
});

test("bloqueia transferência de patrimônio baixado", () => {
  assert.throws(
    () =>
      applyAction(
        seed,
        {
          type: "transfer_asset",
          assetId: "104292",
          nucleusId: "nuc-ti",
          location: "Cofre",
          assignee: "",
        },
        "auditor@empresa.com",
      ),
    /baixados não podem ser transferidos/,
  );
});

test("combina busca, filtro de tipo e ordenação sem expor itens fora do resultado", () => {
  const dashboard = buildDashboard(seed, {
    search: "Beatriz",
    type: "notebook",
    nucleus: "nuc-fin",
    sort: "asset_asc",
  });

  assert.deepEqual(dashboard.inventory.map((asset) => asset.id), ["104284"]);
  assert.equal(dashboard.resultCount, 1);
});

test("aceita data de aquisição desconhecida em item importado", () => {
  const imported = structuredClone(seed);
  imported.assets[0].acquiredAt = null;
  const state = normalizeState(imported);
  assert.equal(state.assets[0].acquiredAt, null);
});

test("lista colaboradores com e sem patrimônio", () => {
  const state = structuredClone(seed);
  state.collaborators = [
    { id: "col-joao", name: "João Martins", nucleusId: "nuc-ti" },
    { id: "col-rauan", name: "Rauan (aprendiz)", nucleusId: "nuc-ti" },
  ];

  const dashboard = buildDashboard(state);

  assert.equal(dashboard.summary.collaborators, 2);
  assert.equal(dashboard.summary.collaboratorsWithoutAssets, 1);
  assert.equal(dashboard.collaborators.find((item) => item.id === "col-joao").hasAssets, true);
  assert.equal(dashboard.collaborators.find((item) => item.id === "col-rauan").hasAssets, false);
});

test("edita informações do núcleo sem permitir sigla duplicada", () => {
  const nextState = applyAction(
    seed,
    {
      type: "update_nucleus",
      nucleus: {
        id: "nuc-ti",
        code: "TEC",
        name: "Tecnologia",
        location: "Matriz",
        manager: "Kenji Hidehira",
      },
    },
    "admin@empresa.com",
  );

  assert.deepEqual(nextState.nuclei.find((item) => item.id === "nuc-ti"), {
    id: "nuc-ti",
    code: "TEC",
    name: "Tecnologia",
    location: "Matriz",
    manager: "Kenji Hidehira",
  });
  assert.throws(
    () =>
      applyAction(
        seed,
        {
          type: "update_nucleus",
          nucleus: { ...seed.nuclei[0], code: "FIN" },
        },
        "admin@empresa.com",
      ),
    /sigla/,
  );
});

function validAsset(overrides = {}) {
  return {
    id: "654321",
    type: "notebook",
    nucleusId: "nuc-ti",
    status: "available",
    brandModel: "Lenovo ThinkPad E14",
    serial: "TEST-001",
    acquiredAt: "2026-07-15",
    value: 5000,
    assignee: "",
    location: "Cofre de equipamentos",
    notes: "Equipamento de teste.",
    ...overrides,
  };
}
