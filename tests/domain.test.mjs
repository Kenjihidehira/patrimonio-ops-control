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
  assert.equal(dashboard.collaborators.length, 6);
  assert.equal(dashboard.summary.collaborators, 6);
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

test("normaliza item sem patrimônio como divergência rastreável", () => {
  const imported = structuredClone(seed);
  imported.assets.push({
    ...validAsset({ id: "S1A2B3", status: "discrepancy", value: 0 }),
    createdAt: "2026-07-17T12:00:00.000Z",
    movements: [],
  });

  const dashboard = buildDashboard(imported);
  const item = dashboard.inventory.find((asset) => asset.id === "S1A2B3");

  assert.equal(item.hasPatrimony, false);
  assert.equal(dashboard.summary.untagged, 1);
});

test("atribui patrimônio oficial a item não etiquetado sem perder vínculos", () => {
  const state = structuredClone(seed);
  state.assets.push({
    ...validAsset({
      id: "S1A2B3",
      status: "discrepancy",
      assignee: "João Martins",
      nucleusId: "nuc-ti",
      value: 0,
    }),
    createdAt: "2026-07-17T12:00:00.000Z",
    movements: [],
  });

  const nextState = applyAction(
    state,
    {
      type: "update_asset_identifier",
      assetId: "S1A2B3",
      newAssetId: "654320",
      note: "Etiqueta aplicada após conferência física.",
      at: "2026-07-17T15:00:00.000Z",
      movementId: "movement-identifier",
    },
    "auditor@empresa.com",
  );

  const asset = nextState.assets.find((item) => item.id === "654320");
  assert.equal(nextState.assets.some((item) => item.id === "S1A2B3"), false);
  assert.equal(asset.assignee, "João Martins");
  assert.equal(asset.nucleusId, "nuc-ti");
  assert.equal(asset.status, "allocated");
  assert.equal(asset.movements[0].type, "identifier_change");
  assert.equal(asset.movements[0].from, "Sem patrimônio · Referência interna S1A2B3");
  assert.match(asset.movements[0].to, /#654320 · Em uso/);
});

test("corrige patrimônio oficial e bloqueia número inválido, repetido ou sem motivo", () => {
  const action = {
    type: "update_asset_identifier",
    assetId: "104281",
    newAssetId: "654320",
    note: "Correção confirmada no inventário.",
  };
  const nextState = applyAction(seed, action, "auditor@empresa.com");
  const corrected = nextState.assets.find((item) => item.id === "654320");
  assert.equal(corrected.status, seed.assets.find((item) => item.id === "104281").status);

  assert.throws(
    () => applyAction(seed, { ...action, newAssetId: "12345" }, "auditor@empresa.com"),
    /6 números/,
  );
  assert.throws(
    () => applyAction(seed, { ...action, newAssetId: "104282" }, "auditor@empresa.com"),
    /já está cadastrado/,
  );
  assert.throws(
    () => applyAction(seed, { ...action, newAssetId: "104281" }, "auditor@empresa.com"),
    /diferente do atual/,
  );
  assert.throws(
    () => applyAction(seed, { ...action, note: "" }, "auditor@empresa.com"),
    /Motivo da alteração é obrigatório/,
  );
});

test("lista o inventário completo por núcleo sem herdar filtros globais", () => {
  const dashboard = buildDashboard(seed, { search: "termo inexistente", nucleus: "nuc-fin" });

  assert.equal(dashboard.inventory.length, 0);
  assert.equal(dashboard.nucleusInventory.length, seed.assets.filter((asset) => asset.status !== "retired").length);
  assert.equal(
    dashboard.nucleusInventory.filter((asset) => asset.nucleusId === "nuc-ti").length,
    seed.assets.filter((asset) => asset.nucleusId === "nuc-ti" && asset.status !== "retired").length,
  );
});

test("edita dados cadastrais do item sem alterar patrimônio, núcleo ou status", () => {
  const original = seed.assets.find((asset) => asset.id === "104281");
  const nextState = applyAction(
    seed,
    {
      type: "update_asset_details",
      assetId: original.id,
      asset: {
        type: "notebook",
        brandModel: "Dell Latitude 5550",
        serial: "SERIE-ATUALIZADA",
        assignee: "João Martins",
        location: "Matriz - estação 42",
        acquiredAt: "2026-07-20",
        notes: "Conferido fisicamente.",
      },
      note: "Cadastro corrigido durante inventário do núcleo.",
      at: "2026-07-20T14:30:00.000Z",
      movementId: "movement-details",
    },
    "auditor@empresa.com",
  );

  const asset = nextState.assets.find((item) => item.id === original.id);
  assert.equal(asset.id, original.id);
  assert.equal(asset.nucleusId, original.nucleusId);
  assert.equal(asset.status, original.status);
  assert.equal(asset.brandModel, "Dell Latitude 5550");
  assert.equal(asset.movements[0].type, "details_update");
  assert.match(asset.movements[0].to, /marca e modelo/);
  assert.equal(asset.movements[0].note, "Cadastro corrigido durante inventário do núcleo.");
});

test("bloqueia edição cadastral sem mudança, motivo ou campos válidos", () => {
  const original = seed.assets.find((asset) => asset.id === "104281");
  const asset = {
    type: original.type,
    brandModel: original.brandModel,
    serial: original.serial,
    assignee: original.assignee,
    location: original.location,
    acquiredAt: original.acquiredAt,
    notes: original.notes,
  };

  assert.throws(
    () => applyAction(seed, { type: "update_asset_details", assetId: original.id, asset, note: "Conferência." }, "auditor"),
    /pelo menos uma informação/,
  );
  assert.throws(
    () => applyAction(seed, { type: "update_asset_details", assetId: original.id, asset: { ...asset, serial: "NOVO" }, note: "" }, "auditor"),
    /Motivo da alteração é obrigatório/,
  );
  assert.throws(
    () => applyAction(seed, { type: "update_asset_details", assetId: original.id, asset: { ...asset, type: "tablet" }, note: "Correção." }, "auditor"),
    /Tipo do item é inválido/,
  );
});

test("contabiliza colaboradores pelos responsáveis distintos dos itens ativos", () => {
  const state = structuredClone(seed);
  state.collaborators = [
    { id: "col-joao", name: "João Martins", nucleusId: "nuc-ti" },
    { id: "col-sem-item", name: "Pessoa sem item", nucleusId: "nuc-ti" },
  ];
  state.assets.push(validAsset({
    id: "SRAU01",
    assignee: "Rauan (aprendiz)",
    status: "discrepancy",
  }));
  state.assets.push(validAsset({
    id: "SRAU02",
    assignee: "  RAUAN (APRENDIZ)  ",
    nucleusId: "nuc-fin",
    status: "discrepancy",
  }));

  const dashboard = buildDashboard(state);

  assert.equal(dashboard.summary.collaborators, 7);
  assert.equal(dashboard.summary.collaboratorsWithoutPatrimony, 1);
  assert.equal(dashboard.collaborators.find((item) => item.id === "col-joao").hasAssets, true);
  assert.equal(dashboard.collaborators.some((item) => item.id === "col-sem-item"), false);
  assert.equal(dashboard.collaborators.find((item) => item.name === "Rauan (aprendiz)").hasPatrimony, false);
  assert.equal(dashboard.collaborators.find((item) => item.name === "Rauan (aprendiz)").profileRegistered, false);
  assert.equal(dashboard.collaborators.find((item) => item.name === "Rauan (aprendiz)").assetCount, 2);
});

test("cadastra perfil para responsável projetado e preserva seus vínculos", () => {
  const state = structuredClone(seed);
  const dashboard = buildDashboard(state);
  const responsible = dashboard.collaborators.find((item) => item.name === "João Martins");

  const nextState = applyAction(
    state,
    {
      type: "register_responsible",
      responsible: {
        id: responsible.id,
        previousName: responsible.name,
        name: "João da Silva Martins",
        nucleusId: responsible.nucleusId,
      },
    },
    "admin@empresa.com",
  );

  assert.deepEqual(nextState.collaborators, [{
    id: responsible.id,
    name: "João da Silva Martins",
    nucleusId: "nuc-ti",
  }]);
  assert.equal(
    nextState.assets.filter((asset) => asset.assignee === "João da Silva Martins").length,
    state.assets.filter((asset) => asset.assignee === "João Martins").length,
  );
});

test("bloqueia cadastro de perfil sem responsabilidade ativa ou com identificador inválido", () => {
  assert.throws(
    () => applyAction(
      seed,
      {
        type: "register_responsible",
        responsible: {
          id: "responsible-inexistente",
          previousName: "Pessoa inexistente",
          name: "Pessoa inexistente",
          nucleusId: "nuc-ti",
        },
      },
      "admin@empresa.com",
    ),
    /não possui itens ativos/,
  );
  assert.throws(
    () => applyAction(
      seed,
      {
        type: "register_responsible",
        responsible: {
          id: "ID INVÁLIDO",
          previousName: "João Martins",
          name: "João Martins",
          nucleusId: "nuc-ti",
        },
      },
      "admin@empresa.com",
    ),
    /identificador do colaborador é inválido/,
  );
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

test("edita o perfil do colaborador e preserva seus patrimônios", () => {
  const state = structuredClone(seed);
  state.collaborators = [{ id: "col-joao", name: "João Martins", nucleusId: "nuc-ti" }];

  const nextState = applyAction(
    state,
    {
      type: "update_collaborator",
      collaborator: {
        id: "col-joao",
        name: "João da Silva Martins",
        nucleusId: "nuc-fin",
      },
    },
    "admin@empresa.com",
  );

  assert.deepEqual(nextState.collaborators[0], {
    id: "col-joao",
    name: "João da Silva Martins",
    nucleusId: "nuc-fin",
  });
  assert.equal(
    nextState.assets.filter((asset) => asset.assignee === "João da Silva Martins").length,
    state.assets.filter((asset) => asset.assignee === "João Martins").length,
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
