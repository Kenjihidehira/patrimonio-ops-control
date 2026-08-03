import assert from "node:assert/strict";
import test from "node:test";

import { buildAnalyticsSnapshot } from "../supabase/functions/patrimonio-gateway/analytics.js";

test("camada analítica calcula os indicadores P0 sem métricas fictícias", () => {
  const snapshot = buildAnalyticsSnapshot({
    now: new Date("2026-08-03T12:00:00.000Z"),
    assets: [
      { code: "123456", status: "allocated", assignee: "Ana", location: "Matriz", nucleus_id: "n1" },
      { code: "444444", status: "allocated", assignee: "Reserva", location: "Matriz", nucleus_id: "n1" },
      { code: "S00001", status: "discrepancy", assignee: null, location: "", nucleus_id: "n2" },
      { code: "10775.0", status: "maintenance", assignee: null, location: "Filial 6", nucleus_id: "n2" },
      { code: "999999", status: "available", source_system: "sabium", source_identifier: "999999.0", location: "Filial 6", nucleus_id: "n2" },
      { code: "333333", status: "retired", assignee: null, location: "Arquivo", nucleus_id: "n1" },
    ],
    nuclei: [
      { id: "n1", code: "A", name: "Atendimento" },
      { id: "n2", code: "LOG", name: "Logística" },
    ],
    movements: [
      { occurred_at: "2026-08-02T10:00:00.000Z" },
      { occurred_at: "2026-07-30T10:00:00.000Z" },
      { occurred_at: "2025-01-01T10:00:00.000Z" },
    ],
    operational: {
      inventoryCampaigns: [{
        id: "campaign-1",
        name: "Inventário 2026",
        status: "active",
        due_at: "2026-08-10",
        target_count: 5,
        checked_count: 3,
        issue_count: 1,
        created_at: "2026-08-01T09:00:00.000Z",
      }],
      inventoryCampaignAssets: [
        { campaign_id: "campaign-1", result: "confirmed" },
        { campaign_id: "campaign-1", result: "confirmed" },
        { campaign_id: "campaign-1", result: "missing" },
      ],
      custodyTerms: [
        { asset_code: "123456", status: "accepted" },
        { asset_code: "444444", status: "pending" },
      ],
      maintenanceOrders: [
        { status: "open", priority: "critical", kind: "corrective", due_at: "2026-07-01", created_at: "2026-05-01T10:00:00.000Z" },
        { status: "completed", priority: "normal", kind: "preventive", due_at: "2026-08-10", created_at: "2026-08-01T10:00:00.000Z" },
      ],
      trackingTags: [{ asset_code: "123456" }],
    },
  });

  assert.deepEqual(snapshot.assets, {
    total: 5,
    allocated: 2,
    available: 1,
    maintenance: 1,
    discrepancies: 1,
    retired: 1,
    allocationRate: 40,
    discrepancyRate: 20,
  });
  assert.equal(snapshot.inventory.campaign.completionRate, 60);
  assert.equal(snapshot.inventory.campaign.results.confirmed, 2);
  assert.equal(snapshot.inventory.campaign.results.missing, 1);
  assert.equal(snapshot.custody.coverageRate, 50);
  assert.equal(snapshot.custody.pendingTerms, 1);
  assert.equal(snapshot.maintenance.overdue, 1);
  assert.equal(snapshot.maintenance.critical, 1);
  assert.equal(snapshot.maintenance.ageBuckets.over60, 1);
  assert.equal(snapshot.dataQuality.identificationRate, 80);
  assert.equal(snapshot.dataQuality.responsibleRate, 50);
  assert.equal(snapshot.dataQuality.trackingRate, 20);
  assert.equal(snapshot.nuclei[0].name, "Logística");
  assert.deepEqual(snapshot.movementTrend.map(({ count }) => count), [0, 0, 0, 0, 1, 1]);
});

test("camada analítica distingue zero real de indicador sem base aplicável", () => {
  const snapshot = buildAnalyticsSnapshot({
    now: new Date("2026-08-03T12:00:00.000Z"),
  });

  assert.equal(snapshot.assets.allocationRate, 0);
  assert.equal(snapshot.inventory.campaign, null);
  assert.equal(snapshot.custody.coverageRate, null);
  assert.equal(snapshot.dataQuality.responsibleRate, null);
  assert.equal(snapshot.maintenance.open, 0);
  assert.equal(snapshot.movementTrend.length, 6);
});
