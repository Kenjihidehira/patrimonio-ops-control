export const assetTypeLabels = Object.freeze({
  cpu: "CPU (Computador)",
  monitor_1: "Monitor 1",
  monitor_2: "Monitor 2",
  chair: "Cadeira",
  notebook: "Notebook",
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
  status_change: "Alteração de status",
  identifier_change: "Alteração de patrimônio",
  details_update: "Atualização cadastral",
  import: "Importação",
});

const assetTypes = new Set(Object.keys(assetTypeLabels));
const assetStatuses = new Set(Object.keys(statusLabels));
const movementTypes = new Set(Object.keys(movementTypeLabels));
const patrimonyIdPattern = /^\d{6}$/;
const untaggedAssetIdPattern = /^S[A-Z0-9]{5}$/;

export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = "DomainError";
  }
}

export function cloneState(state) {
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

  return {
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    nuclei,
    assets,
    collaborators,
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
    hasPatrimony: patrimonyIdPattern.test(asset.id),
    nucleus: nucleusMap.get(asset.nucleusId),
    lastMovement: asset.movements[0] ?? null,
  }));

  const inventory = enriched
    .filter((asset) => {
      const searchable = [
        asset.id,
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
    if (!key) continue;
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
    const officialAssets = assignedAssets.filter((asset) => patrimonyIdPattern.test(asset.id));

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
        hasPatrimony: patrimonyIdPattern.test(asset.id),
        type: asset.type,
        brandModel: asset.brandModel,
        location: asset.location,
        status: asset.status,
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
  if (!patrimonyIdPattern.test(id)) {
    throw new DomainError("O identificador deve conter exatamente 6 números.");
  }
  if (state.assets.some((asset) => asset.id === id)) {
    throw new DomainError(`O patrimônio ${id} já está cadastrado.`);
  }

  const type = validOption(input.type, assetTypes, "Tipo do item");
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
  if (!patrimonyIdPattern.test(nextId)) {
    throw new DomainError("O novo patrimônio deve conter exatamente 6 números.");
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
  if (!patrimonyIdPattern.test(id) && !untaggedAssetIdPattern.test(id)) {
    throw new DomainError(`O item ${id} não possui um identificador válido.`);
  }
  const nucleusId = requiredText(input.nucleusId, "Núcleo");
  if (!nucleusIds.has(nucleusId)) {
    throw new DomainError(`O patrimônio ${id} aponta para um núcleo inexistente.`);
  }
  const movements = Array.isArray(input.movements)
    ? input.movements.map(normalizeMovement).sort((a, b) => b.at.localeCompare(a.at))
    : [];

  return {
    id,
    type: validOption(input.type, assetTypes, "Tipo do item"),
    nucleusId,
    assignee: optionalText(input.assignee),
    location: requiredText(input.location, "Localização"),
    serial: optionalText(input.serial),
    brandModel: requiredText(input.brandModel, "Marca e modelo"),
    acquiredAt: optionalDateOnly(input.acquiredAt),
    value: validMoney(input.value),
    status: validOption(input.status, assetStatuses, "Status"),
    notes: optionalText(input.notes),
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
  if (sort === "asset_asc") return (a, b) => a.id.localeCompare(b.id);
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

function validMoney(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) {
    throw new DomainError("O valor de aquisição é inválido.");
  }
  return Math.round(amount * 100) / 100;
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
