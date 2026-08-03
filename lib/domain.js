import {
  isAssetIdentifierValidForType,
  isOfficialPatrimonyId,
} from "./asset-identifiers.js";

export const assetTypeLabels = Object.freeze({
  cpu: "CPU (Computador)",
  monitor_1: "Monitor 1",
  monitor_2: "Monitor 2",
  chair: "Cadeira",
  notebook: "Notebook",
  fleet: "Frota",
  car: "Automóvel",
  trailer: "Implemento rodoviário",
  vehicle_component: "Componente de frota",
  equipment: "Máquina ou equipamento",
  furniture: "Móvel ou utensílio",
  extinguisher: "Extintor",
  software: "Software",
  other: "Outros bens",
});

export const statusLabels = Object.freeze({
  available: "Disponível",
  allocated: "Em uso",
  maintenance: "Manutenção",
  discrepancy: "Divergência",
  retired: "Baixado",
});

const movementTypeLabels = Object.freeze({
  registration: "Cadastro",
  transfer: "Transferência",
  department_transfer: "Transferência entre departamentos",
  status_change: "Alteração de status",
  identifier_change: "Alteração de patrimônio",
  details_update: "Atualização cadastral",
  import: "Importação",
});

const assetTypes = new Set(Object.keys(assetTypeLabels));
const assetStatuses = new Set(Object.keys(statusLabels));
const movementTypes = new Set(Object.keys(movementTypeLabels));
const inventoryCampaignStatuses = new Set(["active", "completed", "cancelled"]);
const inventoryResults = new Set(["pending", "confirmed", "missing", "wrong_location", "damaged"]);
const custodyStatuses = new Set(["pending", "accepted", "rejected", "cancelled"]);
const maintenanceKinds = new Set(["preventive", "corrective", "inspection"]);
const maintenancePriorities = new Set(["low", "normal", "high", "critical"]);
const maintenanceStatuses = new Set(["open", "in_progress", "completed", "cancelled"]);
const trackingTechnologies = new Set(["qr", "barcode", "rfid_uhf", "ble", "uwb", "gps", "mdm"]);
const trackingEventTechnologies = new Set([...trackingTechnologies, "manual"]);
const untaggedAssetIdPattern = /^S[A-Z0-9]{5}$/;
const sabiumInternalIdPattern = /^G[A-F0-9]{20}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

export function normalizeState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("O estado patrimonial é inválido.");
  }

  const nuclei = Array.isArray(input.nuclei)
    ? input.nuclei.map(normalizeNucleus)
    : [];
  const nucleusIds = new Set(nuclei.map((nucleus) => nucleus.id));
  if (nucleusIds.size !== nuclei.length) {
    throw new DomainError("Existem núcleos com identificadores duplicados.");
  }

  const assets = Array.isArray(input.assets)
    ? input.assets.map((asset) => normalizeAsset(asset, nucleusIds))
    : [];
  const assetIds = new Set(assets.map((asset) => asset.id));
  if (assetIds.size !== assets.length) {
    throw new DomainError("Existem patrimônios com identificadores duplicados.");
  }

  const collaborators = Array.isArray(input.collaborators)
    ? input.collaborators.map((collaborator) => normalizeCollaborator(collaborator, nucleusIds))
    : [];
  const collaboratorIds = new Set(collaborators.map((collaborator) => collaborator.id));
  if (collaboratorIds.size !== collaborators.length) {
    throw new DomainError("Existem colaboradores com identificadores duplicados.");
  }

  const inventoryCampaigns = Array.isArray(input.inventoryCampaigns)
    ? input.inventoryCampaigns.map((campaign) => normalizeInventoryCampaign(campaign, nucleusIds))
    : [];
  const campaignIds = new Set(inventoryCampaigns.map((campaign) => campaign.id));
  const inventoryCampaignAssets = Array.isArray(input.inventoryCampaignAssets)
    ? input.inventoryCampaignAssets.map((target) =>
        normalizeInventoryCampaignAsset(target, campaignIds, assetIds))
    : [];
  const custodyTerms = Array.isArray(input.custodyTerms)
    ? input.custodyTerms.map((term) => normalizeCustodyTerm(term, assetIds))
    : [];
  const maintenanceOrders = Array.isArray(input.maintenanceOrders)
    ? input.maintenanceOrders.map((order) => normalizeMaintenanceOrder(order, assetIds))
    : [];
  const trackingTags = Array.isArray(input.trackingTags)
    ? input.trackingTags.map((tag) => normalizeTrackingTag(tag, assetIds))
    : [];
  const trackingEvents = Array.isArray(input.trackingEvents)
    ? input.trackingEvents.map((event) => normalizeTrackingEvent(event, assetIds))
    : [];

  return {
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    nuclei,
    assets,
    collaborators,
    inventoryCampaigns,
    inventoryCampaignAssets,
    custodyTerms,
    maintenanceOrders,
    trackingTags,
    trackingEvents,
  };
}

export function buildDashboard(input, filters = {}) {
  const state = normalizeState(input);
  const search = String(filters.search ?? "").trim().toLocaleLowerCase("pt-BR");
  const type = assetTypes.has(filters.type) ? filters.type : "all";
  const status = assetStatuses.has(filters.status) ? filters.status : "all";
  const nucleus = state.nuclei.some((item) => item.id === filters.nucleus)
    ? filters.nucleus
    : "all";
  const sort = ["recent", "asset_asc", "nucleus", "status"].includes(filters.sort)
    ? filters.sort
    : "recent";

  const nucleusMap = new Map(state.nuclei.map((item) => [item.id, item]));
  const enriched = state.assets.map((asset) => ({
    ...asset,
    hasPatrimony: asset.sourceSystem === "sabium"
      ? Boolean(asset.sourceIdentifier)
      : isOfficialPatrimonyId(asset.id),
    nucleus: nucleusMap.get(asset.nucleusId),
    lastMovement: asset.movements[0] ?? null,
  }));

  const inventory = enriched
    .filter((asset) => {
      const searchable = [
        asset.id,
        asset.sourceIdentifier,
        asset.baseCode,
        asset.sourceDescription,
        asset.assetGroup,
        asset.branchCode,
        asset.invoiceNumber,
        asset.serial,
        asset.brandModel,
        asset.assignee,
        asset.location,
        asset.nucleus?.name,
        asset.hasPatrimony ? "" : "sem patrimônio sem identificação",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return (
        (!search || searchable.includes(search)) &&
        (type === "all" || asset.type === type) &&
        (status === "all" || asset.status === status) &&
        (nucleus === "all" || asset.nucleusId === nucleus)
      );
    })
    .sort(sortAssets(sort));

  const activeAssets = state.assets.filter((asset) => asset.status !== "retired");
  const assetsByAssignee = new Map();
  for (const asset of activeAssets) {
    const key = normalizedText(asset.assignee);
    if (!key || key === "reserva") continue;
    const assigned = assetsByAssignee.get(key) ?? [];
    assigned.push(asset);
    assetsByAssignee.set(key, assigned);
  }
  const collaboratorProfiles = new Map();
  for (const collaborator of state.collaborators) {
    const key = normalizedText(collaborator.name);
    const profiles = collaboratorProfiles.get(key) ?? [];
    profiles.push(collaborator);
    collaboratorProfiles.set(key, profiles);
  }
  const collaborators = [...assetsByAssignee.entries()].map(([responsibleKey, assignedAssets]) => {
    const profiles = collaboratorProfiles.get(responsibleKey) ?? [];
    const profile = profiles.find((item) =>
      assignedAssets.some((asset) => asset.nucleusId === item.nucleusId),
    ) ?? profiles[0];
    const representativeAsset = assignedAssets.find((asset) =>
      asset.nucleusId === profile?.nucleusId,
    ) ?? assignedAssets[0];
    const officialAssets = assignedAssets.filter((asset) =>
      asset.sourceSystem === "sabium"
        ? Boolean(asset.sourceIdentifier)
        : isOfficialPatrimonyId(asset.id),
    );

    return {
      id: profile?.id ?? responsibleProjectionId(responsibleKey),
      name: profile?.name ?? representativeAsset.assignee,
      nucleusId: profile?.nucleusId ?? representativeAsset.nucleusId,
      profileRegistered: Boolean(profile),
      nucleus: nucleusMap.get(profile?.nucleusId ?? representativeAsset.nucleusId),
      assetCount: assignedAssets.length,
      assetIds: assignedAssets.map((asset) => asset.id),
      assets: assignedAssets.map((asset) => ({
        id: asset.id,
        hasPatrimony: asset.sourceSystem === "sabium"
          ? Boolean(asset.sourceIdentifier)
          : isOfficialPatrimonyId(asset.id),
        type: asset.type,
        brandModel: asset.brandModel,
        location: asset.location,
        status: asset.status,
        sourceSystem: asset.sourceSystem,
        sourceIdentifier: asset.sourceIdentifier,
        baseCode: asset.baseCode,
        incorporation: asset.incorporation,
      })),
      hasAssets: assignedAssets.length > 0,
      patrimonyCount: officialAssets.length,
      hasPatrimony: officialAssets.length > 0,
    };
  }).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const summary = {
    total: activeAssets.length,
    allocated: activeAssets.filter((asset) => asset.status === "allocated").length,
    maintenance: activeAssets.filter((asset) => asset.status === "maintenance").length,
    discrepancies: activeAssets.filter((asset) => asset.status === "discrepancy").length,
    available: activeAssets.filter((asset) => asset.status === "available").length,
    retired: state.assets.filter((asset) => asset.status === "retired").length,
    untagged: activeAssets.filter((asset) => untaggedAssetIdPattern.test(asset.id)).length,
    collaborators: collaborators.length,
    collaboratorsWithoutPatrimony: collaborators.filter((collaborator) => !collaborator.hasPatrimony).length,
  };

  const nucleusSummaries = state.nuclei.map((item) => {
    const assets = activeAssets.filter((asset) => asset.nucleusId === item.id);
    return {
      ...item,
      total: assets.length,
      allocated: assets.filter((asset) => asset.status === "allocated").length,
      untagged: assets.filter((asset) => untaggedAssetIdPattern.test(asset.id)).length,
      alerts: assets.filter((asset) =>
        ["maintenance", "discrepancy"].includes(asset.status),
      ).length,
    };
  });

  const audit = enriched
    .flatMap((asset) =>
      asset.movements.map((movement) => ({
        ...movement,
        assetId: asset.id,
        hasPatrimony: asset.hasPatrimony,
        sourceSystem: asset.sourceSystem,
        sourceIdentifier: asset.sourceIdentifier,
        baseCode: asset.baseCode,
        incorporation: asset.incorporation,
        assetType: assetTypeLabels[asset.type],
        nucleusName: asset.nucleus?.name ?? "Núcleo removido",
        typeLabel: movementTypeLabels[movement.type],
      })),
    )
    .sort((left, right) => right.at.localeCompare(left.at));

  return {
    revision: state.revision,
    summary,
    inventory,
    nucleusInventory: enriched.filter((asset) => asset.status !== "retired"),
    nuclei: nucleusSummaries,
    audit,
    collaborators,
    inventoryCampaigns: state.inventoryCampaigns,
    inventoryCampaignAssets: state.inventoryCampaignAssets,
    custodyTerms: state.custodyTerms,
    maintenanceOrders: state.maintenanceOrders,
    trackingTags: state.trackingTags,
    trackingEvents: state.trackingEvents,
    resultCount: inventory.length,
    options: {
      assetTypes: assetTypeLabels,
      statuses: statusLabels,
    },
  };
}

export function applyAction(input, action, actor) {
  const state = normalizeState(cloneState(input));
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new DomainError("A ação enviada é inválida.");
  }

  const safeActor = requiredText(actor, "Usuário responsável");
  const at = validIsoDate(action.at);

  switch (action.type) {
    case "create_asset":
      createAsset(state, action.asset, safeActor, at, action.movementId);
      break;
    case "transfer_asset":
      transferAsset(state, action, safeActor, at, action.movementId);
      break;
    case "update_status":
      updateStatus(state, action, safeActor, at, action.movementId);
      break;
    case "update_asset_identifier":
      updateAssetIdentifier(state, action, safeActor, at, action.movementId);
      break;
    case "update_asset_details":
      updateAssetDetails(state, action, safeActor, at, action.movementId);
      break;
    case "create_nucleus":
      createNucleus(state, action.nucleus);
      break;
    case "update_nucleus":
      updateNucleus(state, action.nucleus);
      break;
    case "update_collaborator":
      updateCollaborator(state, action.collaborator);
      break;
    case "register_responsible":
      registerResponsible(state, action.responsible);
      break;
    case "create_inventory_campaign":
      createInventoryCampaign(state, action.campaign, safeActor, at);
      break;
    case "record_inventory_check":
      recordInventoryCheck(state, action, safeActor, at);
      break;
    case "complete_inventory_campaign":
      completeInventoryCampaign(state, action.campaignId, at);
      break;
    case "create_custody_term":
      createCustodyTerm(state, action.term, safeActor, at);
      break;
    case "respond_custody_term":
      respondCustodyTerm(state, action, safeActor, at);
      break;
    case "create_maintenance_order":
      createMaintenanceOrder(state, action.order, safeActor, at);
      break;
    case "update_maintenance_order":
      updateMaintenanceOrder(state, action, safeActor, at);
      break;
    case "assign_tracking_tag":
      assignTrackingTag(state, action.tag, safeActor, at);
      break;
    case "record_tracking_event":
      recordTrackingEvent(state, action.event, safeActor, at);
      break;
    default:
      throw new DomainError("Ação patrimonial não reconhecida.");
  }

  state.revision += 1;
  return normalizeState(state);
}

function createAsset(state, input, actor, at, movementId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados do patrimônio.");
  }

  const id = requiredText(input.id, "Identificador");
  const type = validOption(input.type, assetTypes, "Tipo do item");
  if (!isAssetIdentifierValidForType(id, type)) {
    throw new DomainError(
      type === "fleet"
        ? "O patrimônio da frota deve usar o formato número-da-frota.0."
        : "O identificador deve conter exatamente 6 números.",
    );
  }
  if (state.assets.some((asset) => asset.id === id)) {
    throw new DomainError(`O patrimônio ${id} já está cadastrado.`);
  }

  const nucleus = findNucleus(state, input.nucleusId);
  const location = requiredText(input.location, "Localização");
  const status = validOption(input.status ?? "available", assetStatuses, "Status");
  const assignee = optionalText(input.assignee);

  state.assets.push({
    id,
    type,
    nucleusId: nucleus.id,
    assignee,
    location,
    serial: optionalText(input.serial),
    brandModel: requiredText(input.brandModel, "Marca e modelo"),
    acquiredAt: validDateOnly(input.acquiredAt),
    value: validMoney(input.value ?? 0),
    status,
    notes: optionalText(input.notes),
    createdAt: at,
    movements: [
      {
        id: movementId || createId(),
        type: "registration",
        actor,
        from: "Não cadastrado",
        to: describeAssignment(nucleus.name, location, assignee),
        note: `Patrimônio cadastrado como ${statusLabels[status]}.`,
        at,
      },
    ],
  });
}

function transferAsset(state, action, actor, at, movementId) {
  const asset = findAsset(state, action.assetId);
  if (asset.status === "retired") {
    throw new DomainError("Patrimônios baixados não podem ser transferidos.");
  }

  const previousNucleus = findNucleus(state, asset.nucleusId);
  const nextNucleus = findNucleus(state, action.nucleusId);
  const location = requiredText(action.location, "Nova localização");
  const assignee = optionalText(action.assignee);
  const from = describeAssignment(previousNucleus.name, asset.location, asset.assignee);
  const to = describeAssignment(nextNucleus.name, location, assignee);
  if (from === to) {
    throw new DomainError("A transferência precisa alterar núcleo, local ou responsável.");
  }

  asset.nucleusId = nextNucleus.id;
  asset.location = location;
  asset.assignee = assignee;
  if (asset.status === "available" && assignee) asset.status = "allocated";
  asset.movements.unshift({
    id: movementId || createId(),
    type: "transfer",
    actor,
    from,
    to,
    note: optionalText(action.note) || "Transferência patrimonial registrada.",
    at,
  });
}

function updateStatus(state, action, actor, at, movementId) {
  const asset = findAsset(state, action.assetId);
  const nextStatus = validOption(action.status, assetStatuses, "Novo status");
  if (asset.status === nextStatus) {
    throw new DomainError("Selecione um status diferente do atual.");
  }

  const previousStatus = asset.status;
  asset.status = nextStatus;
  asset.movements.unshift({
    id: movementId || createId(),
    type: "status_change",
    actor,
    from: statusLabels[previousStatus],
    to: statusLabels[nextStatus],
    note: requiredText(action.note, "Motivo da alteração"),
    at,
  });
}

function updateAssetIdentifier(state, action, actor, at, movementId) {
  const asset = findAsset(state, action.assetId);
  const nextId = requiredText(action.newAssetId, "Novo patrimônio");
  if (!isAssetIdentifierValidForType(nextId, asset.type)) {
    throw new DomainError(
      asset.type === "fleet"
        ? "O patrimônio da frota deve usar o formato número-da-frota.0."
        : "O novo patrimônio deve conter exatamente 6 números.",
    );
  }
  if (asset.id === nextId) {
    throw new DomainError("Informe um patrimônio diferente do atual.");
  }
  if (state.assets.some((item) => item.id === nextId)) {
    throw new DomainError(`O patrimônio ${nextId} já está cadastrado.`);
  }

  const previousId = asset.id;
  const wasUntagged = untaggedAssetIdPattern.test(previousId);
  asset.id = nextId;
  if (wasUntagged && asset.status === "discrepancy") {
    asset.status = asset.assignee ? "allocated" : "available";
  }
  asset.movements.unshift({
    id: movementId || createId(),
    type: "identifier_change",
    actor,
    from: describeAssetIdentifier(previousId),
    to: wasUntagged ? `#${nextId} · ${statusLabels[asset.status]}` : `#${nextId}`,
    note: requiredLongText(action.note, "Motivo da alteração"),
    at,
  });
}

function updateAssetDetails(state, action, actor, at, movementId) {
  const asset = findAsset(state, action.assetId);
  const next = {
    type: validOption(action.asset?.type, assetTypes, "Tipo do item"),
    brandModel: requiredText(action.asset?.brandModel, "Marca e modelo"),
    serial: optionalText(action.asset?.serial),
    assignee: optionalText(action.asset?.assignee),
    location: requiredText(action.asset?.location, "Localização"),
    acquiredAt: optionalDateOnly(action.asset?.acquiredAt),
    notes: optionalText(action.asset?.notes),
  };
  const fieldLabels = {
    type: "tipo",
    brandModel: "marca e modelo",
    serial: "número de série",
    assignee: "responsável",
    location: "localização",
    acquiredAt: "data de aquisição",
    notes: "observações",
  };
  const changedFields = Object.keys(next).filter((field) => asset[field] !== next[field]);
  if (!changedFields.length) {
    throw new DomainError("Altere pelo menos uma informação do item.");
  }
  const note = requiredLongText(action.note, "Motivo da alteração");

  Object.assign(asset, next);
  asset.movements.unshift({
    id: movementId || createId(),
    type: "details_update",
    actor,
    from: "Cadastro anterior",
    to: `Campos atualizados: ${changedFields.map((field) => fieldLabels[field]).join(", ")}`,
    note,
    at,
  });
}

function createNucleus(state, input) {
  const nucleus = normalizeNucleus(input);
  if (state.nuclei.some((item) => item.id === nucleus.id || item.code === nucleus.code)) {
    throw new DomainError("Já existe um núcleo com esse identificador ou código.");
  }
  state.nuclei.push(nucleus);
}

function updateNucleus(state, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados do núcleo.");
  }
  const id = requiredText(input.id, "Identificador do núcleo");
  const current = state.nuclei.find((item) => item.id === id);
  if (!current) throw new DomainError("O núcleo informado não existe.");

  const updated = normalizeNucleus({ ...input, id });
  if (state.nuclei.some((item) => item.id !== id && item.code === updated.code)) {
    throw new DomainError("Já existe um núcleo com essa sigla.");
  }
  Object.assign(current, updated);
}

function updateCollaborator(state, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados do colaborador.");
  }
  const id = requiredText(input.id, "Identificador do colaborador");
  const current = state.collaborators.find((item) => item.id === id);
  if (!current) throw new DomainError("O colaborador informado não existe.");

  const name = requiredText(input.name, "Nome do colaborador");
  const nucleus = findNucleus(state, input.nucleusId);
  if (
    state.collaborators.some(
      (item) =>
        item.id !== id &&
        normalizedText(item.name) === normalizedText(name) &&
        item.nucleusId === nucleus.id,
    )
  ) {
    throw new DomainError("Já existe um colaborador com esse nome no núcleo selecionado.");
  }

  const previousName = current.name;
  current.name = name;
  current.nucleusId = nucleus.id;
  if (normalizedText(previousName) !== normalizedText(name)) {
    state.assets.forEach((asset) => {
      if (normalizedText(asset.assignee) === normalizedText(previousName)) asset.assignee = name;
    });
  }
}

function registerResponsible(state, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados do responsável.");
  }

  const id = requiredText(input.id, "Identificador do colaborador");
  if (!/^[a-z0-9-]{1,80}$/.test(id)) {
    throw new DomainError("O identificador do colaborador é inválido.");
  }
  if (state.collaborators.some((item) => item.id === id)) {
    throw new DomainError("O perfil deste responsável já está cadastrado.");
  }

  const previousName = requiredText(input.previousName, "Responsável atual");
  const name = requiredText(input.name, "Nome do colaborador");
  const nucleus = findNucleus(state, input.nucleusId);
  if (state.collaborators.some((item) => normalizedText(item.name) === normalizedText(name))) {
    throw new DomainError("Já existe um perfil para este responsável.");
  }

  const assignedAssets = state.assets.filter(
    (asset) =>
      asset.status !== "retired"
      && normalizedText(asset.assignee) === normalizedText(previousName),
  );
  if (assignedAssets.length === 0) {
    throw new DomainError("O responsável não possui itens ativos vinculados.");
  }

  state.collaborators.push({ id, name, nucleusId: nucleus.id });
  state.assets.forEach((asset) => {
    if (normalizedText(asset.assignee) === normalizedText(previousName)) asset.assignee = name;
  });
}

function createInventoryCampaign(state, input, actor, at) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados da campanha de inventário.");
  }
  const id = validUuid(input.id, "Identificador da campanha");
  if (state.inventoryCampaigns.some((campaign) => campaign.id === id)) {
    throw new DomainError("A campanha de inventário já está cadastrada.");
  }
  const nucleusId = optionalText(input.nucleusId) || null;
  if (nucleusId) findNucleus(state, nucleusId);
  const targets = state.assets.filter((asset) =>
    asset.status !== "retired" && (!nucleusId || asset.nucleusId === nucleusId),
  );
  if (!targets.length) {
    throw new DomainError("O escopo selecionado não possui patrimônios ativos.");
  }
  state.inventoryCampaigns.unshift({
    id,
    name: requiredText(input.name, "Nome da campanha"),
    nucleusId,
    status: "active",
    dueAt: optionalDateOnly(input.dueAt),
    targetCount: targets.length,
    checkedCount: 0,
    issueCount: 0,
    createdBy: actor,
    createdAt: at,
    completedAt: null,
    updatedAt: at,
  });
  state.inventoryCampaignAssets.push(...targets.map((asset) => ({
    campaignId: id,
    assetId: asset.id,
    result: "pending",
    observedLocation: "",
    note: "",
    checkedBy: null,
    checkedAt: null,
  })));
}

function recordInventoryCheck(state, action, actor, at) {
  const campaignId = validUuid(action.campaignId, "Campanha");
  const campaign = state.inventoryCampaigns.find((item) => item.id === campaignId);
  if (!campaign || campaign.status !== "active") {
    throw new DomainError("A campanha selecionada não está ativa.");
  }
  const asset = findAsset(state, action.assetId);
  const target = state.inventoryCampaignAssets.find((item) =>
    item.campaignId === campaignId && item.assetId === asset.id,
  );
  if (!target) throw new DomainError("O patrimônio não pertence ao escopo desta campanha.");
  const result = validOption(action.result, inventoryResults, "Resultado da conferência");
  if (result === "pending") throw new DomainError("Informe o resultado da conferência.");
  const observedLocation = result === "missing"
    ? optionalText(action.observedLocation)
    : requiredText(action.observedLocation, "Localização observada");

  target.result = result;
  target.observedLocation = observedLocation;
  target.note = optionalText(action.note);
  target.checkedBy = actor;
  target.checkedAt = at;
  const targets = state.inventoryCampaignAssets.filter((item) => item.campaignId === campaignId);
  campaign.checkedCount = targets.filter((item) => item.result !== "pending").length;
  campaign.issueCount = targets.filter((item) =>
    ["missing", "wrong_location", "damaged"].includes(item.result),
  ).length;
  campaign.updatedAt = at;

  if (["missing", "wrong_location", "damaged"].includes(result)
    && !["discrepancy", "retired"].includes(asset.status)) {
    const previousStatus = asset.status;
    asset.status = "discrepancy";
    asset.movements.unshift({
      id: createId(),
      type: "status_change",
      actor,
      from: statusLabels[previousStatus],
      to: statusLabels.discrepancy,
      note: "Divergência registrada durante campanha de inventário.",
      at,
    });
  }
}

function completeInventoryCampaign(state, campaignId, at) {
  const id = validUuid(campaignId, "Campanha");
  const campaign = state.inventoryCampaigns.find((item) => item.id === id);
  if (!campaign || campaign.status !== "active") {
    throw new DomainError("A campanha selecionada não está ativa.");
  }
  if (campaign.checkedCount !== campaign.targetCount) {
    throw new DomainError("Confira todos os patrimônios antes de concluir a campanha.");
  }
  campaign.status = "completed";
  campaign.completedAt = at;
  campaign.updatedAt = at;
}

function createCustodyTerm(state, input, actor, at) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados do termo de responsabilidade.");
  }
  const asset = findAsset(state, input.assetId);
  if (asset.status === "retired") throw new DomainError("Patrimônios baixados não recebem termos.");
  if (!asset.assignee || normalizedText(asset.assignee) === "reserva") {
    throw new DomainError("O patrimônio precisa ter um responsável elegível.");
  }
  if (state.custodyTerms.some((term) => term.assetId === asset.id && term.status === "pending")) {
    throw new DomainError("Já existe um termo pendente para este patrimônio.");
  }
  state.custodyTerms.unshift({
    id: validUuid(input.id, "Identificador do termo"),
    assetId: asset.id,
    assignee: asset.assignee,
    assigneeIdentifier: validEmail(input.assigneeIdentifier, "E-mail do responsável"),
    status: "pending",
    note: optionalText(input.note),
    issuedBy: actor,
    issuedAt: at,
    respondedBy: null,
    respondedAt: null,
    responseNote: "",
  });
}

function respondCustodyTerm(state, action, actor, at) {
  const termId = validUuid(action.termId, "Termo");
  const term = state.custodyTerms.find((item) => item.id === termId);
  if (!term || term.status !== "pending") throw new DomainError("O termo não está pendente.");
  const response = validOption(action.response, custodyStatuses, "Resposta do termo");
  if (response === "pending") throw new DomainError("Informe a resposta do termo.");
  const actorIdentifier = actor.includes(":") ? actor.slice(actor.indexOf(":") + 1) : actor;
  if (["accepted", "rejected"].includes(response)
    && normalizedText(actorIdentifier) !== normalizedText(term.assigneeIdentifier)) {
    throw new DomainError("Somente o responsável identificado no termo pode aceitar ou recusar.");
  }
  term.status = response;
  term.respondedBy = actorIdentifier;
  term.respondedAt = at;
  term.responseNote = optionalText(action.note);
}

function createMaintenanceOrder(state, input, actor, at) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados da ordem de manutenção.");
  }
  const asset = findAsset(state, input.assetId);
  if (asset.status === "retired") throw new DomainError("Patrimônios baixados não recebem ordens.");
  const previousStatus = asset.status;
  const title = requiredText(input.title, "Título da ordem");
  state.maintenanceOrders.unshift({
    id: validUuid(input.id, "Identificador da ordem"),
    assetId: asset.id,
    kind: validOption(input.kind, maintenanceKinds, "Tipo de manutenção"),
    priority: validOption(input.priority, maintenancePriorities, "Prioridade"),
    status: "open",
    title,
    notes: optionalText(input.notes),
    dueAt: optionalDateOnly(input.dueAt),
    createdBy: actor,
    createdAt: at,
    updatedBy: actor,
    updatedAt: at,
    completedAt: null,
  });
  if (previousStatus !== "maintenance") {
    asset.status = "maintenance";
    asset.movements.unshift({
      id: createId(),
      type: "status_change",
      actor,
      from: statusLabels[previousStatus],
      to: statusLabels.maintenance,
      note: `Ordem de manutenção aberta: ${title}`,
      at,
    });
  }
}

function updateMaintenanceOrder(state, action, actor, at) {
  const orderId = validUuid(action.orderId, "Ordem de manutenção");
  const order = state.maintenanceOrders.find((item) => item.id === orderId);
  if (!order || !["open", "in_progress"].includes(order.status)) {
    throw new DomainError("A ordem de manutenção não pode mais ser alterada.");
  }
  const nextStatus = validOption(action.status, maintenanceStatuses, "Status da ordem");
  if (nextStatus === "open" || nextStatus === order.status) {
    throw new DomainError("Selecione um novo status para a ordem.");
  }
  order.status = nextStatus;
  order.updatedBy = actor;
  order.updatedAt = at;
  order.notes = optionalText(action.note) || order.notes;
  order.completedAt = ["completed", "cancelled"].includes(nextStatus) ? at : null;

  if (["completed", "cancelled"].includes(nextStatus)) {
    const asset = findAsset(state, order.assetId);
    const hasAnotherOrder = state.maintenanceOrders.some((item) =>
      item.id !== order.id
      && item.assetId === asset.id
      && ["open", "in_progress"].includes(item.status),
    );
    if (!hasAnotherOrder && asset.status === "maintenance") {
      const assetNextStatus = asset.assignee ? "allocated" : "available";
      asset.status = assetNextStatus;
      asset.movements.unshift({
        id: createId(),
        type: "status_change",
        actor,
        from: statusLabels.maintenance,
        to: statusLabels[assetNextStatus],
        note: nextStatus === "cancelled"
          ? "Ordem de manutenção cancelada."
          : "Ordem de manutenção concluída.",
        at,
      });
    }
  }
}

function assignTrackingTag(state, input, actor, at) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados da etiqueta de rastreamento.");
  }
  const asset = findAsset(state, input.assetId);
  if (asset.status === "retired") throw new DomainError("Patrimônios baixados não recebem etiquetas.");
  const technology = validOption(input.technology, trackingTechnologies, "Tecnologia de rastreamento");
  const tagId = requiredText(input.tagId, "Identificador da etiqueta");
  if (state.trackingTags.some((tag) =>
    tag.active && tag.technology === technology && tag.tagId === tagId && tag.assetId !== asset.id,
  )) {
    throw new DomainError("Esta etiqueta já está vinculada a outro patrimônio.");
  }
  const existing = state.trackingTags.find((tag) =>
    tag.assetId === asset.id && tag.technology === technology,
  );
  if (existing) {
    existing.tagId = tagId;
    existing.active = true;
    existing.installedBy = actor;
    existing.installedAt = at;
    existing.updatedAt = at;
    return;
  }
  state.trackingTags.unshift({
    id: validUuid(input.id, "Identificador do vínculo"),
    assetId: asset.id,
    technology,
    tagId,
    active: true,
    installedBy: actor,
    installedAt: at,
    updatedAt: at,
  });
}

function recordTrackingEvent(state, input, actor, at) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Informe os dados da leitura de rastreamento.");
  }
  const asset = findAsset(state, input.assetId);
  const technology = validOption(input.technology, trackingEventTechnologies, "Tecnologia da leitura");
  const tagId = optionalText(input.tagId);
  if (["rfid_uhf", "ble", "uwb", "gps", "mdm"].includes(technology)
    && !state.trackingTags.some((tag) =>
      tag.active && tag.assetId === asset.id && tag.technology === technology && tag.tagId === tagId,
    )) {
    throw new DomainError("Cadastre a etiqueta ou integração antes de registrar esta leitura.");
  }
  state.trackingEvents.unshift({
    id: validUuid(input.id, "Identificador da leitura"),
    assetId: asset.id,
    technology,
    tagId,
    readerId: optionalText(input.readerId),
    location: requiredText(input.location, "Localização observada"),
    latitude: optionalNumber(input.latitude, -90, 90, "Latitude"),
    longitude: optionalNumber(input.longitude, -180, 180, "Longitude"),
    accuracyMeters: optionalNumber(input.accuracyMeters, 0, 100000, "Precisão"),
    confidence: optionalNumber(input.confidence, 0, 1, "Confiança"),
    batteryPercent: optionalIntegerInRange(input.batteryPercent, 0, 100, "Bateria"),
    note: optionalText(input.note),
    observedBy: actor,
    observedAt: at,
  });
}

function normalizeInventoryCampaign(input, nucleusIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há uma campanha de inventário inválida.");
  }
  const nucleusId = optionalText(input.nucleusId) || null;
  if (nucleusId && !nucleusIds.has(nucleusId)) {
    throw new DomainError("Há uma campanha vinculada a um núcleo inexistente.");
  }
  const targetCount = optionalIntegerInRange(input.targetCount, 0, 1000000, "Total da campanha") ?? 0;
  const checkedCount = optionalIntegerInRange(input.checkedCount, 0, targetCount, "Conferidos da campanha") ?? 0;
  const issueCount = optionalIntegerInRange(input.issueCount, 0, checkedCount, "Divergências da campanha") ?? 0;
  return {
    id: validUuid(input.id, "Identificador da campanha"),
    name: requiredText(input.name, "Nome da campanha"),
    nucleusId,
    status: validOption(input.status, inventoryCampaignStatuses, "Status da campanha"),
    dueAt: optionalDateOnly(input.dueAt),
    targetCount,
    checkedCount,
    issueCount,
    createdBy: requiredText(input.createdBy, "Criador da campanha"),
    createdAt: validIsoDate(input.createdAt),
    completedAt: optionalIsoDate(input.completedAt),
    updatedAt: validIsoDate(input.updatedAt),
  };
}

function normalizeInventoryCampaignAsset(input, campaignIds, assetIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há um item de campanha inválido.");
  }
  const campaignId = validUuid(input.campaignId, "Campanha da conferência");
  const assetId = requiredText(input.assetId, "Patrimônio da conferência");
  if (!campaignIds.has(campaignId) || !assetIds.has(assetId)) {
    throw new DomainError("Há uma conferência vinculada a dados inexistentes.");
  }
  const result = validOption(input.result, inventoryResults, "Resultado da conferência");
  return {
    campaignId,
    assetId,
    result,
    observedLocation: optionalText(input.observedLocation),
    note: optionalText(input.note),
    checkedBy: input.checkedBy ? requiredText(input.checkedBy, "Responsável pela conferência") : null,
    checkedAt: optionalIsoDate(input.checkedAt),
  };
}

function normalizeCustodyTerm(input, assetIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há um termo de responsabilidade inválido.");
  }
  const assetId = requiredText(input.assetId, "Patrimônio do termo");
  if (!assetIds.has(assetId)) throw new DomainError("Há um termo para patrimônio inexistente.");
  return {
    id: validUuid(input.id, "Identificador do termo"),
    assetId,
    assignee: requiredText(input.assignee, "Responsável do termo"),
    assigneeIdentifier: validEmail(input.assigneeIdentifier, "E-mail do responsável"),
    status: validOption(input.status, custodyStatuses, "Status do termo"),
    note: optionalText(input.note),
    issuedBy: requiredText(input.issuedBy, "Emissor do termo"),
    issuedAt: validIsoDate(input.issuedAt),
    respondedBy: input.respondedBy ? validEmail(input.respondedBy, "E-mail da resposta") : null,
    respondedAt: optionalIsoDate(input.respondedAt),
    responseNote: optionalText(input.responseNote),
  };
}

function normalizeMaintenanceOrder(input, assetIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há uma ordem de manutenção inválida.");
  }
  const assetId = requiredText(input.assetId, "Patrimônio da ordem");
  if (!assetIds.has(assetId)) throw new DomainError("Há uma ordem para patrimônio inexistente.");
  return {
    id: validUuid(input.id, "Identificador da ordem"),
    assetId,
    kind: validOption(input.kind, maintenanceKinds, "Tipo de manutenção"),
    priority: validOption(input.priority, maintenancePriorities, "Prioridade da manutenção"),
    status: validOption(input.status, maintenanceStatuses, "Status da manutenção"),
    title: requiredText(input.title, "Título da ordem"),
    notes: optionalText(input.notes),
    dueAt: optionalDateOnly(input.dueAt),
    createdBy: requiredText(input.createdBy, "Criador da ordem"),
    createdAt: validIsoDate(input.createdAt),
    updatedBy: requiredText(input.updatedBy, "Atualizador da ordem"),
    updatedAt: validIsoDate(input.updatedAt),
    completedAt: optionalIsoDate(input.completedAt),
  };
}

function normalizeTrackingTag(input, assetIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há uma etiqueta de rastreamento inválida.");
  }
  const assetId = requiredText(input.assetId, "Patrimônio da etiqueta");
  if (!assetIds.has(assetId)) throw new DomainError("Há uma etiqueta para patrimônio inexistente.");
  return {
    id: validUuid(input.id, "Identificador do vínculo"),
    assetId,
    technology: validOption(input.technology, trackingTechnologies, "Tecnologia da etiqueta"),
    tagId: requiredText(input.tagId, "Identificador da etiqueta"),
    active: input.active === true,
    installedBy: requiredText(input.installedBy, "Responsável pela instalação"),
    installedAt: validIsoDate(input.installedAt),
    updatedAt: validIsoDate(input.updatedAt),
  };
}

function normalizeTrackingEvent(input, assetIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há um evento de rastreamento inválido.");
  }
  const assetId = requiredText(input.assetId, "Patrimônio do evento");
  if (!assetIds.has(assetId)) throw new DomainError("Há uma leitura para patrimônio inexistente.");
  return {
    id: validUuid(input.id, "Identificador da leitura"),
    assetId,
    technology: validOption(input.technology, trackingEventTechnologies, "Tecnologia da leitura"),
    tagId: optionalText(input.tagId),
    readerId: optionalText(input.readerId),
    location: requiredText(input.location, "Localização da leitura"),
    latitude: optionalNumber(input.latitude, -90, 90, "Latitude"),
    longitude: optionalNumber(input.longitude, -180, 180, "Longitude"),
    accuracyMeters: optionalNumber(input.accuracyMeters, 0, 100000, "Precisão"),
    confidence: optionalNumber(input.confidence, 0, 1, "Confiança"),
    batteryPercent: optionalIntegerInRange(input.batteryPercent, 0, 100, "Bateria"),
    note: optionalText(input.note),
    observedBy: requiredText(input.observedBy, "Responsável pela leitura"),
    observedAt: validIsoDate(input.observedAt),
  };
}

function normalizeNucleus(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Os dados do núcleo são inválidos.");
  }
  return {
    id: requiredText(input.id, "Identificador do núcleo"),
    name: requiredText(input.name, "Nome do núcleo"),
    code: requiredText(input.code, "Código do núcleo").toUpperCase(),
    location: requiredText(input.location, "Localização do núcleo"),
    manager: requiredText(input.manager, "Gestor do núcleo"),
  };
}

function normalizeAsset(input, nucleusIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há um patrimônio inválido no estado.");
  }
  const id = requiredText(input.id, "Identificador");
  const type = validOption(input.type, assetTypes, "Tipo do item");
  if (
    !isAssetIdentifierValidForType(id, type)
    && !(type !== "fleet" && untaggedAssetIdPattern.test(id))
    && !(input.sourceSystem === "sabium" && sabiumInternalIdPattern.test(id))
  ) {
    throw new DomainError(`O item ${id} não possui um identificador válido.`);
  }
  const nucleusId = requiredText(input.nucleusId, "Núcleo");
  if (!nucleusIds.has(nucleusId)) {
    throw new DomainError(`O patrimônio ${id} aponta para um núcleo inexistente.`);
  }
  const movements = Array.isArray(input.movements)
    ? input.movements.map(normalizeMovement).sort((a, b) => b.at.localeCompare(a.at))
    : [];

  const sourceSystem = input.sourceSystem === "sabium" ? "sabium" : null;
  const sourceIdentifier = optionalText(input.sourceIdentifier);
  const sourceFingerprint = optionalText(input.sourceFingerprint);
  const sourceRow = optionalInteger(input.sourceRow);
  if (
    sourceSystem === "sabium"
    && (
      !sabiumInternalIdPattern.test(id)
      || !/^[a-f0-9]{64}$/.test(sourceFingerprint)
      || !sourceIdentifier
      || sourceRow === null
    )
  ) {
    throw new DomainError(`O item ${id} não possui dados válidos de origem do Sabium.`);
  }

  return {
    id,
    type,
    nucleusId,
    assignee: optionalText(input.assignee),
    location: requiredText(input.location, "Localização"),
    serial: optionalText(input.serial),
    brandModel: requiredText(input.brandModel, "Marca e modelo"),
    acquiredAt: optionalDateOnly(input.acquiredAt),
    value: validMoney(input.value),
    status: validOption(input.status, assetStatuses, "Status"),
    notes: optionalText(input.notes),
    sourceSystem,
    sourceFingerprint,
    baseCode: optionalText(input.baseCode),
    incorporation: optionalInteger(input.incorporation),
    sourceIdentifier,
    sourceDescription: optionalText(input.sourceDescription),
    assetGroup: optionalText(input.assetGroup),
    branchCode: optionalText(input.branchCode),
    disposedAt: optionalDateOnly(input.disposedAt),
    operationValue: optionalMoney(input.operationValue),
    invoiceNumber: optionalText(input.invoiceNumber),
    sourceRow,
    createdAt: validIsoDate(input.createdAt),
    movements,
  };
}

function normalizeCollaborator(input, nucleusIds) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há um colaborador inválido no estado.");
  }
  const nucleusId = requiredText(input.nucleusId, "Núcleo do colaborador");
  if (!nucleusIds.has(nucleusId)) {
    throw new DomainError("Há um colaborador associado a um núcleo inexistente.");
  }
  return {
    id: requiredText(input.id, "Identificador do colaborador"),
    name: requiredText(input.name, "Nome do colaborador"),
    nucleusId,
  };
}

function normalizeMovement(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Há uma movimentação inválida no histórico.");
  }
  return {
    id: requiredText(input.id, "Identificador da movimentação"),
    type: validOption(input.type, movementTypes, "Tipo da movimentação"),
    actor: requiredText(input.actor, "Responsável pela movimentação"),
    from: requiredText(input.from, "Origem da movimentação"),
    to: requiredText(input.to, "Destino da movimentação"),
    note: optionalText(input.note),
    at: validIsoDate(input.at),
  };
}

function sortAssets(sort) {
  if (sort === "asset_asc") {
    return (a, b) =>
      (a.sourceIdentifier || a.id).localeCompare(
        b.sourceIdentifier || b.id,
        "pt-BR",
        { numeric: true },
      );
  }
  if (sort === "nucleus") {
    return (a, b) =>
      (a.nucleus?.name ?? "").localeCompare(b.nucleus?.name ?? "", "pt-BR") ||
      a.id.localeCompare(b.id);
  }
  if (sort === "status") {
    return (a, b) =>
      statusLabels[a.status].localeCompare(statusLabels[b.status], "pt-BR") ||
      a.id.localeCompare(b.id);
  }
  return (a, b) =>
    (b.lastMovement?.at ?? b.createdAt).localeCompare(a.lastMovement?.at ?? a.createdAt);
}

function findAsset(state, id) {
  const safeId = requiredText(id, "Patrimônio");
  const asset = state.assets.find((item) => item.id === safeId);
  if (!asset) throw new DomainError(`O patrimônio ${safeId} não foi encontrado.`);
  return asset;
}

function describeAssetIdentifier(id) {
  return untaggedAssetIdPattern.test(id)
    ? `Sem patrimônio · Referência interna ${id}`
    : `#${id}`;
}

function findNucleus(state, id) {
  const safeId = requiredText(id, "Núcleo");
  const nucleus = state.nuclei.find((item) => item.id === safeId);
  if (!nucleus) throw new DomainError("O núcleo informado não existe.");
  return nucleus;
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new DomainError(`${label} é obrigatório.`);
  if (text.length > 180) throw new DomainError(`${label} excede o limite de caracteres.`);
  return text;
}

function requiredLongText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new DomainError(`${label} é obrigatório.`);
  if (text.length > 500) throw new DomainError(`${label} excede o limite de caracteres.`);
  return text;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  if (text.length > 500) throw new DomainError("Um campo de texto excede o limite permitido.");
  return text;
}

function validOption(value, options, label) {
  if (!options.has(value)) throw new DomainError(`${label} é inválido.`);
  return value;
}

function validDateOnly(value) {
  const text = requiredText(value, "Data de aquisição");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new DomainError("A data de aquisição é inválida.");
  }
  return text;
}

function optionalDateOnly(value) {
  if (value === null || value === undefined || value === "") return null;
  return validDateOnly(value);
}

function validIsoDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new DomainError("A data da movimentação é inválida.");
  return date.toISOString();
}

function optionalIsoDate(value) {
  if (value === null || value === undefined || value === "") return null;
  return validIsoDate(value);
}

function validUuid(value, label) {
  const id = String(value ?? "").trim();
  if (!uuidPattern.test(id)) throw new DomainError(`${label} é inválido.`);
  return id.toLowerCase();
}

function validEmail(value, label) {
  const email = String(value ?? "").trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 254) {
    throw new DomainError(`${label} é inválido.`);
  }
  return email;
}

function optionalNumber(value, minimum, maximum, label) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new DomainError(`${label} é inválida.`);
  }
  return number;
}

function optionalIntegerInRange(value, minimum, maximum, label) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new DomainError(`${label} é inválido.`);
  }
  return number;
}

function validMoney(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) {
    throw new DomainError("O valor de aquisição é inválido.");
  }
  return Math.round(amount * 100) / 100;
}

function optionalMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  return validMoney(value);
}

function optionalInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new DomainError("Um campo numérico de origem é inválido.");
  }
  return number;
}

function describeAssignment(nucleus, location, assignee) {
  return [nucleus, location, assignee || "Sem responsável"].join(" • ");
}

function normalizedText(value) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function responsibleProjectionId(value) {
  const normalized = normalizedText(value);
  const slug = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "responsavel";
  let hash = 2166136261;
  for (const character of normalized) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `responsible-${slug}-${(hash >>> 0).toString(36)}`.slice(0, 80);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `movement-${Date.now()}-${Math.random()}`;
}
