import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  fleetNumberFromPatrimonyId,
  isAssetIdentifierValidForType,
  isFleetPatrimonyId,
  toFleetPatrimonyId,
} from "../lib/asset-identifiers.js";
import {
  applyAction,
  buildDashboard,
  DomainError,
  normalizeState,
} from "../lib/domain.js";
import { parsePatrimonioRows } from "../lib/spreadsheet-import.js";

const seed = JSON.parse(
  await readFile(new URL("../data/seed.json", import.meta.url), "utf8"),
);
const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("mapeia o número da frota para um patrimônio oficial com sufixo .0", () => {
  assert.equal(toFleetPatrimonyId("10775"), "10775.0");
  assert.equal(fleetNumberFromPatrimonyId("10775.0"), "10775");
  assert.equal(isFleetPatrimonyId("10775.0"), true);
  assert.equal(isAssetIdentifierValidForType("10775.0", "fleet"), true);
  assert.equal(isAssetIdentifierValidForType("10775.0", "notebook"), false);

  const nextState = applyAction(
    seed,
    {
      type: "create_asset",
      at: "2026-07-31T12:00:00.000Z",
      movementId: "movement-fleet",
      asset: validAsset({
        id: "10775.0",
        type: "fleet",
        brandModel: "Caminhão de teste",
      }),
    },
    "logistica@empresa.com",
  );
  const fleet = buildDashboard(nextState, { type: "fleet" }).inventory[0];

  assert.equal(fleet.id, "10775.0");
  assert.equal(fleet.hasPatrimony, true);
  assert.throws(
    () => applyAction(seed, {
      type: "create_asset",
      asset: validAsset({ id: "10775", type: "fleet" }),
    }, "logistica@empresa.com"),
    /número-da-frota\.0/,
  );

  const fleetAsset = nextState.assets.find((asset) => asset.id === "10775.0");
  assert.throws(
    () => applyAction(nextState, {
      type: "update_asset_details",
      assetId: fleetAsset.id,
      asset: {
        type: "car",
        brandModel: fleetAsset.brandModel,
        serial: fleetAsset.serial,
        assignee: fleetAsset.assignee,
        location: fleetAsset.location,
        acquiredAt: fleetAsset.acquiredAt,
        notes: fleetAsset.notes,
      },
      note: "Tentativa de trocar o tipo sem trocar o identificador.",
    }, "logistica@empresa.com"),
    /não é compatível com o identificador atual/,
  );
});

test("importa frotas numéricas e normaliza o patrimônio sem arredondar", () => {
  const preview = parsePatrimonioRows([
    ["Patrimônio", "Tipo", "Núcleo", "Responsável", "Localização", "Status"],
    [10775, "Frota", "Operações", "Motorista A", "Filial 01", "Em uso"],
    ["10776.0", "Veículo", "Operações", "", "Pátio", "Disponível"],
  ]);

  assert.equal(preview.canCommit, true);
  assert.deepEqual(
    preview.assets.map(({ code, type }) => ({ code, type })),
    [
      { code: "10775.0", type: "fleet" },
      { code: "10776.0", type: "fleet" },
    ],
  );
});

test("reconhece no XLSX todos os tipos exportados pelo catálogo ampliado", () => {
  const expectedTypes = [
    ["Automóvel", "car"],
    ["Implemento rodoviário", "trailer"],
    ["Componente de frota", "vehicle_component"],
    ["Máquina ou equipamento", "equipment"],
    ["Móvel ou utensílio", "furniture"],
    ["Extintor", "extinguisher"],
    ["Software", "software"],
    ["Outros bens", "other"],
  ];
  const preview = parsePatrimonioRows([
    ["Patrimônio", "Tipo", "Núcleo", "Responsável", "Localização", "Status"],
    ...expectedTypes.map(([label], index) => [
      String(700000 + index),
      label,
      "Operações",
      "",
      "Matriz",
      "Disponível",
    ]),
  ]);

  assert.equal(preview.canCommit, true);
  assert.deepEqual(preview.assets.map((asset) => asset.type), expectedTypes.map(([, type]) => type));
});

test("normaliza registros Sabium, permite busca de origem e protege dados financeiros", () => {
  const state = structuredClone(seed);
  state.assets.push(sabiumAsset());

  const normalized = normalizeState(state);
  const operatorDashboard = buildDashboard(normalized, { search: "10775.0" });
  const operatorAsset = operatorDashboard.inventory[0];

  assert.equal(operatorDashboard.resultCount, 1);
  assert.equal(operatorAsset.id, "G0123456789ABCDEF0123");
  assert.equal(operatorAsset.sourceIdentifier, "10775.0");
  assert.equal(operatorAsset.hasPatrimony, true);
  assert.equal(operatorAsset.value, null);
  assert.equal(operatorAsset.operationValue, null);
  assert.equal(operatorAsset.invoiceNumber, "");
  assert.equal("sourceFingerprint" in operatorAsset, false);
  assert.equal("sourceRow" in operatorAsset, false);

  const adminAsset = buildDashboard(normalized, {}, { includeFinancials: true })
    .inventory.find((asset) => asset.id === "G0123456789ABCDEF0123");
  assert.equal(adminAsset.value, 280000);
  assert.equal(adminAsset.operationValue, 275500);
  assert.equal(adminAsset.invoiceNumber, "NF-98765");
  assert.equal("sourceFingerprint" in adminAsset, false);

  assert.throws(
    () => applyAction(normalized, {
      type: "update_asset_identifier",
      assetId: "G0123456789ABCDEF0123",
      newAssetId: "10776.0",
      note: "Tentativa de edição manual.",
    }, "admin@empresa.com"),
    (error) => error instanceof DomainError && /Sabium/.test(error.message),
  );

  for (const invalidSource of [
    { baseCode: "" },
    { incorporation: null },
    { sourceIdentifier: "IDENTIFICADOR-LIVRE" },
    { sourceDescription: "" },
    { sourceRow: 1 },
  ]) {
    const invalid = structuredClone(seed);
    invalid.assets.push({ ...sabiumAsset(), ...invalidSource });
    assert.throws(() => normalizeState(invalid), /dados válidos de origem do Sabium/);
  }
});

test("interface Gazin contém identificação Sabium, logo e geração de etiqueta QR", () => {
  const app = readSource("components/patrimonio/PatrimonioApp.tsx");
  const ui = readSource("components/patrimonio/ui.tsx");
  const qr = readSource("components/patrimonio/operations/QrLabelGenerator.tsx");
  const tracking = readSource("components/patrimonio/operations/TrackingOperations.tsx");
  const hooks = readSource("components/patrimonio/hooks.ts");

  assert.match(app, /activeDepartment\.slug === "gazin-log"/);
  assert.match(app, /\/brand\/gazin-logo\.png/);
  assert.match(app, /sourceIdentifier === identifier/);
  assert.match(ui, /asset\.sourceSystem === "sabium"/);
  assert.match(ui, /Inc\. \$\{asset\.incorporation\}/);
  assert.match(qr, /QRCode\.toDataURL/);
  assert.match(qr, /const qrPayload = asset\?\.id/);
  assert.match(qr, /QRCode\.toDataURL\(qrPayload/);
  assert.match(tracking, /QrLabelGenerator/);
  assert.match(hooks, /\\d\{1,10\}\(\?:\\\.\\d\{1,6\}\)\?/);
  assert.match(hooks, /G\[A-F0-9\]\{20\}/);
  assert.match(readSource("scripts/prepare-sabium-import.mjs"), /identificador Sabium inválido/);
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

function sabiumAsset() {
  return {
    ...validAsset({
      id: "G0123456789ABCDEF0123",
      type: "fleet",
      brandModel: "Caminhão Mercedes-Benz",
      value: 280000,
      location: "Filial 01",
    }),
    sourceSystem: "sabium",
    sourceFingerprint: "a".repeat(64),
    baseCode: "10775",
    incorporation: 0,
    sourceIdentifier: "10775.0",
    sourceDescription: "CAMINHÃO DE DISTRIBUIÇÃO",
    assetGroup: "VEÍCULOS",
    branchCode: "01",
    disposedAt: null,
    operationValue: 275500,
    invoiceNumber: "NF-98765",
    sourceRow: 42,
    createdAt: "2026-07-31T10:00:00.000Z",
    movements: [],
  };
}
