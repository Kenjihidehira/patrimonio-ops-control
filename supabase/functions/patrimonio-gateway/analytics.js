const MONTH_COUNT = 6;
const UNTAGGED_PATTERN = /^S[A-Z0-9]+$/i;

export function buildAnalyticsSnapshot({
  assets = [],
  nuclei = [],
  movements = [],
  operational = {},
  now = new Date(),
}) {
  const activeAssets = assets.filter((asset) => asset.status !== "retired");
  const allocatedAssets = activeAssets.filter((asset) => asset.status === "allocated");
  const statusCounts = countBy(activeAssets, (asset) => asset.status);
  const allocatedIds = new Set(allocatedAssets.map((asset) => String(asset.code)));
  const acceptedCustodyIds = new Set(
    (operational.custodyTerms ?? [])
      .filter((term) => term.status === "accepted")
      .map((term) => String(term.asset_code)),
  );
  const formalizedCustody = [...acceptedCustodyIds]
    .filter((assetId) => allocatedIds.has(assetId)).length;
  const openMaintenance = (operational.maintenanceOrders ?? []).filter((order) =>
    order.status === "open" || order.status === "in_progress"
  );
  const overdueMaintenance = openMaintenance.filter((order) =>
    order.due_at && endOfDay(order.due_at).getTime() < now.getTime()
  );
  const campaigns = [...(operational.inventoryCampaigns ?? [])]
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
  const featuredCampaign = campaigns.find((campaign) => campaign.status === "active")
    ?? campaigns[0]
    ?? null;
  const campaignAssets = featuredCampaign
    ? (operational.inventoryCampaignAssets ?? []).filter(
        (item) => String(item.campaign_id) === String(featuredCampaign.id),
      )
    : [];
  const campaignResults = countBy(campaignAssets, (item) => item.result);
  const trackingAssetIds = new Set(
    (operational.trackingTags ?? []).map((tag) => String(tag.asset_code)),
  );

  return {
    generatedAt: now.toISOString(),
    assets: {
      total: activeAssets.length,
      allocated: statusCounts.allocated ?? 0,
      available: statusCounts.available ?? 0,
      maintenance: statusCounts.maintenance ?? 0,
      discrepancies: statusCounts.discrepancy ?? 0,
      retired: assets.length - activeAssets.length,
      allocationRate: percentage(statusCounts.allocated ?? 0, activeAssets.length),
      discrepancyRate: percentage(statusCounts.discrepancy ?? 0, activeAssets.length),
    },
    inventory: {
      activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
      campaign: featuredCampaign
        ? {
            id: String(featuredCampaign.id),
            name: String(featuredCampaign.name),
            status: String(featuredCampaign.status),
            dueAt: featuredCampaign.due_at ? String(featuredCampaign.due_at) : null,
            targetCount: numberValue(featuredCampaign.target_count),
            checkedCount: numberValue(featuredCampaign.checked_count),
            issueCount: numberValue(featuredCampaign.issue_count),
            completionRate: percentage(
              numberValue(featuredCampaign.checked_count),
              numberValue(featuredCampaign.target_count),
            ),
            overdue: featuredCampaign.status === "active"
              && Boolean(featuredCampaign.due_at)
              && endOfDay(featuredCampaign.due_at).getTime() < now.getTime(),
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
      pendingTerms: (operational.custodyTerms ?? [])
        .filter((term) => term.status === "pending").length,
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
      identified: activeAssets.filter(hasOfficialIdentifier).length,
      identificationRate: percentage(
        activeAssets.filter(hasOfficialIdentifier).length,
        activeAssets.length,
      ),
      allocatedWithResponsible: allocatedAssets.filter(hasResponsible).length,
      responsibleRate: allocatedAssets.length
        ? percentage(allocatedAssets.filter(hasResponsible).length, allocatedAssets.length)
        : null,
      located: activeAssets.filter((asset) => String(asset.location ?? "").trim()).length,
      locationRate: percentage(
        activeAssets.filter((asset) => String(asset.location ?? "").trim()).length,
        activeAssets.length,
      ),
      tracked: activeAssets.filter((asset) => trackingAssetIds.has(String(asset.code))).length,
      trackingRate: percentage(
        activeAssets.filter((asset) => trackingAssetIds.has(String(asset.code))).length,
        activeAssets.length,
      ),
    },
    nuclei: buildNucleusAnalytics(activeAssets, nuclei),
    movementTrend: buildMovementTrend(movements, now),
  };
}

function buildNucleusAnalytics(activeAssets, nuclei) {
  const summaries = nuclei.map((nucleus) => {
    const nucleusAssets = activeAssets.filter(
      (asset) => String(asset.nucleus_id) === String(nucleus.id),
    );
    const allocated = nucleusAssets.filter((asset) => asset.status === "allocated").length;
    const maintenance = nucleusAssets.filter((asset) => asset.status === "maintenance").length;
    const discrepancies = nucleusAssets.filter((asset) => asset.status === "discrepancy").length;
    const untagged = nucleusAssets.filter((asset) => !hasOfficialIdentifier(asset)).length;
    return {
      id: String(nucleus.id),
      code: String(nucleus.code ?? ""),
      name: String(nucleus.name ?? "Núcleo sem nome"),
      total: nucleusAssets.length,
      allocated,
      maintenance,
      discrepancies,
      untagged,
      alerts: maintenance + discrepancies,
      allocationRate: percentage(allocated, nucleusAssets.length),
    };
  });
  return summaries.sort((left, right) =>
    right.alerts - left.alerts
      || right.untagged - left.untagged
      || right.total - left.total
      || left.name.localeCompare(right.name, "pt-BR")
  );
}

function buildMovementTrend(movements, now) {
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
  for (const movement of movements) {
    const occurredAt = new Date(String(movement.occurred_at ?? ""));
    if (Number.isNaN(occurredAt.getTime())) continue;
    const key = `${occurredAt.getUTCFullYear()}-${String(occurredAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const month = monthMap.get(key);
    if (month) month.count += 1;
  }
  return months;
}

function maintenanceAgeBuckets(orders, now) {
  const buckets = { upTo7: 0, from8To30: 0, from31To60: 0, over60: 0 };
  for (const order of orders) {
    const createdAt = new Date(String(order.created_at ?? ""));
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
  const code = String(asset.code ?? "").trim();
  if (asset.source_system === "sabium") {
    return Boolean(String(asset.source_identifier ?? "").trim());
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

function numberValue(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function endOfDay(value) {
  return new Date(`${String(value).slice(0, 10)}T23:59:59.999Z`);
}
