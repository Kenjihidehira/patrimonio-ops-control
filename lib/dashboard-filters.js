const MONTH_COUNT = 6;
const UNTAGGED_PATTERN = /^S[A-Z0-9]+$/i;

export const defaultDashboardFilters = Object.freeze({
  nucleus: "all",
  type: "all",
  status: "all",
  source: "all",
});

export function hasDashboardFilters(filters) {
  return Object.entries(defaultDashboardFilters)
    .some(([key, value]) => filters[key] !== value);
}

// Mirrors the server-side P0 formulas so the browser can slice the complete loaded dataset.
export function buildFilteredDashboardAnalytics({
  assets = [],
  nuclei = [],
  operations = {},
  filters = defaultDashboardFilters,
  now = new Date(),
}) {
  const selectedAssets = assets.filter((asset) => matchesFilters(asset, filters));
  const activeAssets = selectedAssets.filter((asset) => asset.status !== "retired");
  const selectedIds = new Set(selectedAssets.map((asset) => String(asset.id)));
  const allocatedAssets = activeAssets.filter((asset) => asset.status === "allocated");
  const statusCounts = countBy(activeAssets, (asset) => asset.status);
  const allocatedIds = new Set(allocatedAssets.map((asset) => String(asset.id)));
  const scopedCustodyTerms = (operations.custodyTerms ?? [])
    .filter((term) => selectedIds.has(String(term.assetId)));
  const acceptedCustodyIds = new Set(
    scopedCustodyTerms
      .filter((term) => term.status === "accepted")
      .map((term) => String(term.assetId)),
  );
  const formalizedCustody = [...acceptedCustodyIds]
    .filter((assetId) => allocatedIds.has(assetId)).length;
  const openMaintenance = (operations.maintenanceOrders ?? []).filter((order) =>
    selectedIds.has(String(order.assetId))
      && (order.status === "open" || order.status === "in_progress")
  );
  const overdueMaintenance = openMaintenance.filter((order) =>
    order.dueAt && endOfDay(order.dueAt).getTime() < now.getTime()
  );
  const campaigns = [...(operations.inventoryCampaigns ?? [])]
    .filter((campaign) =>
      filters.nucleus === "all"
        || !campaign.nucleusId
        || String(campaign.nucleusId) === String(filters.nucleus)
    )
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const campaignItems = operations.inventoryCampaignAssets ?? [];
  const applicableCampaigns = campaigns.filter((campaign) => campaignItems.some((item) =>
    String(item.campaignId) === String(campaign.id)
      && selectedIds.has(String(item.assetId))
  ));
  const featuredCampaign = applicableCampaigns.find((campaign) => campaign.status === "active")
    ?? applicableCampaigns[0]
    ?? null;
  const scopedCampaignAssets = featuredCampaign
    ? campaignItems.filter((item) =>
        String(item.campaignId) === String(featuredCampaign.id)
          && selectedIds.has(String(item.assetId))
      )
    : [];
  const campaignResults = countBy(scopedCampaignAssets, (item) => item.result);
  const checkedCampaignAssets = scopedCampaignAssets.filter((item) => item.result !== "pending");
  const issueCount = scopedCampaignAssets.filter((item) =>
    item.result === "missing"
      || item.result === "wrong_location"
      || item.result === "damaged"
  ).length;
  const trackingAssetIds = new Set(
    (operations.trackingTags ?? [])
      .filter((tag) => selectedIds.has(String(tag.assetId)))
      .map((tag) => String(tag.assetId)),
  );
  const identifiedAssets = activeAssets.filter(hasOfficialIdentifier);
  const allocatedWithResponsible = allocatedAssets.filter(hasResponsible);
  const locatedAssets = activeAssets.filter((asset) => String(asset.location ?? "").trim());
  const trackedAssets = activeAssets.filter((asset) => trackingAssetIds.has(String(asset.id)));

  return {
    selectedCount: selectedAssets.length,
    analytics: {
      generatedAt: now.toISOString(),
      assets: {
        total: activeAssets.length,
        allocated: statusCounts.allocated ?? 0,
        available: statusCounts.available ?? 0,
        maintenance: statusCounts.maintenance ?? 0,
        discrepancies: statusCounts.discrepancy ?? 0,
        retired: selectedAssets.length - activeAssets.length,
        allocationRate: percentage(statusCounts.allocated ?? 0, activeAssets.length),
        discrepancyRate: percentage(statusCounts.discrepancy ?? 0, activeAssets.length),
      },
      inventory: {
        activeCampaigns: applicableCampaigns.filter((campaign) => campaign.status === "active").length,
        campaign: featuredCampaign
          ? {
              id: String(featuredCampaign.id),
              name: String(featuredCampaign.name),
              status: String(featuredCampaign.status),
              dueAt: featuredCampaign.dueAt ? String(featuredCampaign.dueAt) : null,
              targetCount: scopedCampaignAssets.length,
              checkedCount: checkedCampaignAssets.length,
              issueCount,
              completionRate: percentage(checkedCampaignAssets.length, scopedCampaignAssets.length),
              overdue: featuredCampaign.status === "active"
                && Boolean(featuredCampaign.dueAt)
                && endOfDay(featuredCampaign.dueAt).getTime() < now.getTime(),
              results: {
                confirmed: campaignResults.confirmed ?? 0,
                missing: campaignResults.missing ?? 0,
                wrongLocation: campaignResults.wrong_location ?? 0,
                damaged: campaignResults.damaged ?? 0,
                pending: campaignResults.pending ?? 0,
              },
            }
          : null,
      },
      custody: {
        formalizedAssets: formalizedCustody,
        allocatedAssets: allocatedAssets.length,
        coverageRate: allocatedAssets.length
          ? percentage(formalizedCustody, allocatedAssets.length)
          : null,
        pendingTerms: scopedCustodyTerms.filter((term) => term.status === "pending").length,
      },
      maintenance: {
        open: openMaintenance.length,
        overdue: overdueMaintenance.length,
        critical: openMaintenance.filter((order) => order.priority === "critical").length,
        preventive: openMaintenance.filter((order) => order.kind === "preventive").length,
        corrective: openMaintenance.filter((order) => order.kind === "corrective").length,
        inspections: openMaintenance.filter((order) => order.kind === "inspection").length,
        ageBuckets: maintenanceAgeBuckets(openMaintenance, now),
      },
      dataQuality: {
        identified: identifiedAssets.length,
        identificationRate: percentage(identifiedAssets.length, activeAssets.length),
        allocatedWithResponsible: allocatedWithResponsible.length,
        responsibleRate: allocatedAssets.length
          ? percentage(allocatedWithResponsible.length, allocatedAssets.length)
          : null,
        located: locatedAssets.length,
        locationRate: percentage(locatedAssets.length, activeAssets.length),
        tracked: trackedAssets.length,
        trackingRate: percentage(trackedAssets.length, activeAssets.length),
      },
      nuclei: buildNucleusAnalytics(activeAssets, nuclei),
      movementTrend: buildMovementTrend(selectedAssets, now),
    },
  };
}

function matchesFilters(asset, filters) {
  if (filters.nucleus !== "all" && String(asset.nucleusId) !== String(filters.nucleus)) {
    return false;
  }
  if (filters.type !== "all" && asset.type !== filters.type) return false;
  if (filters.status !== "all" && asset.status !== filters.status) return false;
  if (filters.source === "sabium" && asset.sourceSystem !== "sabium") return false;
  if (filters.source === "local" && asset.sourceSystem === "sabium") return false;
  return true;
}

function buildNucleusAnalytics(activeAssets, nuclei) {
  return nuclei.map((nucleus) => {
    const nucleusAssets = activeAssets.filter(
      (asset) => String(asset.nucleusId) === String(nucleus.id),
    );
    const allocated = nucleusAssets.filter((asset) => asset.status === "allocated").length;
    const maintenance = nucleusAssets.filter((asset) => asset.status === "maintenance").length;
    const discrepancies = nucleusAssets.filter((asset) => asset.status === "discrepancy").length;
    const untagged = nucleusAssets.filter((asset) => !hasOfficialIdentifier(asset)).length;
    return {
      id: String(nucleus.id),
      code: String(nucleus.code ?? ""),
      name: String(nucleus.name ?? "Nucleo sem nome"),
      total: nucleusAssets.length,
      allocated,
      maintenance,
      discrepancies,
      untagged,
      alerts: maintenance + discrepancies,
      allocationRate: percentage(allocated, nucleusAssets.length),
    };
  }).sort((left, right) =>
    right.alerts - left.alerts
      || right.untagged - left.untagged
      || right.total - left.total
      || left.name.localeCompare(right.name, "pt-BR")
  );
}

function buildMovementTrend(assets, now) {
  const months = [];
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let offset = MONTH_COUNT - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(
      currentMonth.getUTCFullYear(),
      currentMonth.getUTCMonth() - offset,
      1,
    ));
    months.push({
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
        .format(date)
        .replace(".", ""),
      count: 0,
    });
  }
  const monthMap = new Map(months.map((month) => [month.key, month]));
  for (const asset of assets) {
    for (const movement of asset.movements ?? []) {
      const occurredAt = new Date(String(movement.at ?? ""));
      if (Number.isNaN(occurredAt.getTime())) continue;
      const key = `${occurredAt.getUTCFullYear()}-${String(occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
      const month = monthMap.get(key);
      if (month) month.count += 1;
    }
  }
  return months;
}

function maintenanceAgeBuckets(orders, now) {
  const buckets = { upTo7: 0, from8To30: 0, from31To60: 0, over60: 0 };
  for (const order of orders) {
    const createdAt = new Date(String(order.createdAt ?? ""));
    if (Number.isNaN(createdAt.getTime())) continue;
    const age = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));
    if (age <= 7) buckets.upTo7 += 1;
    else if (age <= 30) buckets.from8To30 += 1;
    else if (age <= 60) buckets.from31To60 += 1;
    else buckets.over60 += 1;
  }
  return buckets;
}

function hasOfficialIdentifier(asset) {
  if (typeof asset.hasPatrimony === "boolean") return asset.hasPatrimony;
  const code = String(asset.id ?? "").trim();
  if (asset.sourceSystem === "sabium") {
    return Boolean(String(asset.sourceIdentifier ?? "").trim());
  }
  return Boolean(code) && !UNTAGGED_PATTERN.test(code);
}

function hasResponsible(asset) {
  const assignee = String(asset.assignee ?? "").trim().toLocaleLowerCase("pt-BR");
  return Boolean(assignee) && assignee !== "reserva";
}

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = String(keyFor(item) ?? "");
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function percentage(value, total) {
  return total > 0 ? Math.round((value / total) * 1_000) / 10 : 0;
}

function endOfDay(value) {
  return new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`);
}
