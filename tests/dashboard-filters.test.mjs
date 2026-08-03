import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFilteredDashboardAnalytics,
  defaultDashboardFilters,
  hasDashboardFilters,
} from "../lib/dashboard-filters.js";

const now = new Date("2026-08-03T12:00:00.000Z");
const nuclei = [
  { id: "n1", code: "ADM", name: "Administrativo" },
  { id: "n2", code: "LOG", name: "Logistica" },
];
const assets = [
  {
    id: "A1",
    type: "notebook",
    nucleusId: "n1",
    status: "allocated",
    sourceSystem: "sabium",
    sourceIdentifier: "100.0",
    hasPatrimony: true,
    assignee: "Ana",
    location: "Matriz",
    movements: [{ at: "2026-08-02T10:00:00.000Z" }],
  },
  {
    id: "S00002",
    type: "monitor_1",
    nucleusId: "n1",
    status: "discrepancy",
    sourceSystem: null,
    sourceIdentifier: "",
    hasPatrimony: false,
    assignee: "",
    location: "",
    movements: [{ at: "2026-07-20T10:00:00.000Z" }],
  },
  {
    id: "A3",
    type: "notebook",
    nucleusId: "n2",
    status: "maintenance",
    sourceSystem: null,
    sourceIdentifier: "",
    hasPatrimony: true,
    assignee: "",
    location: "Filial 6",
    movements: [{ at: "2026-08-01T10:00:00.000Z" }],
  },
  {
    id: "A4",
    type: "notebook",
    nucleusId: "n1",
    status: "retired",
    sourceSystem: null,
    sourceIdentifier: "",
    hasPatrimony: true,
    assignee: "",
    location: "Arquivo",
    movements: [],
  },
];
const operations = {
  inventoryCampaigns: [{
    id: "campaign-1",
    name: "Inventario 2026",
    nucleusId: null,
    status: "active",
    dueAt: "2026-08-10",
    createdAt: "2026-08-01T09:00:00.000Z",
  }],
  inventoryCampaignAssets: [
    { campaignId: "campaign-1", assetId: "A1", result: "confirmed" },
    { campaignId: "campaign-1", assetId: "S00002", result: "missing" },
    { campaignId: "campaign-1", assetId: "A3", result: "pending" },
  ],
  custodyTerms: [
    { assetId: "A1", status: "accepted" },
    { assetId: "A3", status: "pending" },
  ],
  maintenanceOrders: [
    {
      assetId: "S00002",
      status: "open",
      priority: "critical",
      kind: "corrective",
      dueAt: "2026-07-01",
      createdAt: "2026-05-01T10:00:00.000Z",
    },
    {
      assetId: "A3",
      status: "in_progress",
      priority: "normal",
      kind: "preventive",
      dueAt: "2026-08-10",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
  ],
  trackingTags: [
    { assetId: "A1" },
    { assetId: "A3" },
  ],
};

test("filtros do dashboard reconhecem o estado padrao e os recortes ativos", () => {
  assert.equal(hasDashboardFilters({ ...defaultDashboardFilters }), false);
  assert.equal(hasDashboardFilters({ ...defaultDashboardFilters, nucleus: "n1" }), true);
  assert.equal(hasDashboardFilters({ ...defaultDashboardFilters, source: "sabium" }), true);
});

test("recorte por nucleo recalcula somente ativos e operacoes pertencentes ao escopo", () => {
  const result = buildFilteredDashboardAnalytics({
    assets,
    nuclei,
    operations,
    filters: { ...defaultDashboardFilters, nucleus: "n1" },
    now,
  });

  assert.equal(result.selectedCount, 3);
  assert.deepEqual(result.analytics.assets, {
    total: 2,
    allocated: 1,
    available: 0,
    maintenance: 0,
    discrepancies: 1,
    retired: 1,
    allocationRate: 50,
    discrepancyRate: 50,
  });
  assert.equal(result.analytics.inventory.campaign.targetCount, 2);
  assert.equal(result.analytics.inventory.campaign.checkedCount, 2);
  assert.equal(result.analytics.inventory.campaign.issueCount, 1);
  assert.equal(result.analytics.inventory.campaign.completionRate, 100);
  assert.equal(result.analytics.custody.coverageRate, 100);
  assert.equal(result.analytics.custody.pendingTerms, 0);
  assert.equal(result.analytics.maintenance.open, 1);
  assert.equal(result.analytics.maintenance.overdue, 1);
  assert.equal(result.analytics.maintenance.critical, 1);
  assert.equal(result.analytics.dataQuality.identificationRate, 50);
  assert.equal(result.analytics.dataQuality.locationRate, 50);
  assert.equal(result.analytics.dataQuality.trackingRate, 50);
  assert.deepEqual(result.analytics.movementTrend.map(({ count }) => count), [0, 0, 0, 0, 1, 1]);
  assert.equal(result.analytics.nuclei[0].id, "n1");
  assert.equal(result.analytics.nuclei[0].alerts, 1);
});

test("origem Sabium combina com tipo sem carregar pendencias locais", () => {
  const result = buildFilteredDashboardAnalytics({
    assets,
    nuclei,
    operations,
    filters: {
      ...defaultDashboardFilters,
      type: "notebook",
      source: "sabium",
    },
    now,
  });

  assert.equal(result.selectedCount, 1);
  assert.equal(result.analytics.assets.allocated, 1);
  assert.equal(result.analytics.inventory.campaign.targetCount, 1);
  assert.equal(result.analytics.inventory.campaign.results.confirmed, 1);
  assert.equal(result.analytics.maintenance.open, 0);
  assert.equal(result.analytics.custody.coverageRate, 100);
  assert.equal(result.analytics.dataQuality.trackingRate, 100);
});

test("recorte de baixados preserva a distincao entre registro selecionado e ativo vigente", () => {
  const result = buildFilteredDashboardAnalytics({
    assets,
    nuclei,
    operations,
    filters: { ...defaultDashboardFilters, status: "retired" },
    now,
  });

  assert.equal(result.selectedCount, 1);
  assert.equal(result.analytics.assets.total, 0);
  assert.equal(result.analytics.assets.retired, 1);
  assert.equal(result.analytics.inventory.campaign, null);
  assert.equal(result.analytics.custody.coverageRate, null);
  assert.equal(result.analytics.dataQuality.identificationRate, 0);
});
