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
  import: "Importação",
});

const assetTypes = new Set(Object.keys(assetTypeLabels));
const assetStatuses = new Set(Object.keys(statusLabels));
const movementTypes = new Set(Object.keys(movementTypeLabels));

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

  return {
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    nuclei,
    assets,
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
  const summary = {
    total: activeAssets.length,
    allocated: activeAssets.filter((asset) => asset.status === "allocated").length,
    maintenance: activeAssets.filter((asset) => asset.status === "maintenance").length,
    discrepancies: activeAssets.filter((asset) => asset.status === "discrepancy").length,
    available: activeAssets.filter((asset) => asset.status === "available").length,
    retired: state.assets.filter((asset) => asset.status === "retired").length,
    acquisitionValue: activeAssets.reduce((total, asset) => total + asset.value, 0),
  };

  const nucleusSummaries = state.nuclei.map((item) => {
    const assets = activeAssets.filter((asset) => asset.nucleusId === item.id);
    return {
      ...item,
      total: assets.length,
      allocated: assets.filter((asset) => asset.status === "allocated").length,
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
    nuclei: nucleusSummaries,
    audit,
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
    case "create_nucleus":
      createNucleus(state, action.nucleus);
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
  if (!/^\d{6}$/.test(id)) {
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
    value: validMoney(input.value),
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

function createNucleus(state, input) {
  const nucleus = normalizeNucleus(input);
  if (state.nuclei.some((item) => item.id === nucleus.id || item.code === nucleus.code)) {
    throw new DomainError("Já existe um núcleo com esse identificador ou código.");
  }
  state.nuclei.push(nucleus);
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
  if (!/^\d{6}$/.test(id)) {
    throw new DomainError(`O patrimônio ${id} não possui 6 números.`);
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

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `movement-${Date.now()}-${Math.random()}`;
}
