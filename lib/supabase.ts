import { env } from "cloudflare:workers";

type WorkspaceState = {
  revision: number;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
};

type ImportPayload = {
  fileName: string;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  rejectedCount: number;
  warnings: Array<Record<string, unknown>>;
};

type GatewayWorkspace = {
  workspaces: Array<{ revision: number }>;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  movements: Array<Record<string, unknown>>;
};

type GatewayConfig = {
  url: string;
  key: string;
};

export class SupabaseError extends Error {
  code: string | null;
  details: string | null;

  constructor(message: string, code: string | null = null, details: string | null = null) {
    super(message);
    this.name = "SupabaseError";
    this.code = code;
    this.details = details;
  }
}

export function companyWorkspaceKey(): string {
  const key = String(
    env.PATRIMONIO_WORKSPACE_KEY ?? process.env.PATRIMONIO_WORKSPACE_KEY ?? "",
  ).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new SupabaseError(
      "Workspace empresarial não configurado. Defina PATRIMONIO_WORKSPACE_KEY no ambiente do servidor.",
      "missing_configuration",
    );
  }
  return key;
}

export async function loadOrCreateWorkspace(ownerKey: string): Promise<WorkspaceState> {
  await gatewayRequest("ensure_workspace", { ownerKey });
  return loadWorkspace(ownerKey);
}

export async function loadWorkspace(ownerKey: string): Promise<WorkspaceState> {
  const result = await gatewayRequest<GatewayWorkspace>("load_workspace", { ownerKey });
  const movementsByAsset = new Map<string, Array<Record<string, unknown>>>();
  for (const row of result.movements) {
    const assetCode = String(row.asset_code);
    const movements = movementsByAsset.get(assetCode) ?? [];
    movements.push({
      id: row.id,
      type: row.type,
      actor: row.actor,
      from: row.from_label,
      to: row.to_label,
      note: row.note,
      at: row.occurred_at,
    });
    movementsByAsset.set(assetCode, movements);
  }

  return {
    revision: Number(result.workspaces[0]?.revision ?? 0),
    nuclei: result.nuclei.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      location: row.location,
      manager: row.manager,
    })),
    assets: result.assets.map((row) => ({
      id: row.code,
      type: row.type,
      nucleusId: row.nucleus_id,
      assignee: row.assignee,
      location: row.location,
      serial: row.serial,
      brandModel: row.brand_model,
      acquiredAt: row.acquired_at,
      value: Number(row.acquisition_value ?? 0),
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      movements: movementsByAsset.get(String(row.code)) ?? [],
    })),
  };
}

export async function loadImportRuns(ownerKey: string) {
  const rows = await gatewayRequest<Array<Record<string, unknown>>>("load_imports", { ownerKey });
  return rows.map((row) => ({
    id: String(row.id),
    fileName: String(row.file_name),
    rowCount: Number(row.row_count),
    inserted: Number(row.inserted_count),
    updated: Number(row.updated_count),
    rejected: Number(row.rejected_count),
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    importedBy: String(row.imported_by),
    createdAt: String(row.created_at),
  }));
}

export async function applyPersistedAction(
  ownerKey: string,
  actor: string,
  expectedRevision: number,
  action: unknown,
) {
  return gatewayRequest<number>("apply_action", {
    ownerKey,
    actor,
    expectedRevision,
    action,
  });
}

export async function importAssets(
  ownerKey: string,
  actor: string,
  expectedRevision: number,
  payload: ImportPayload,
) {
  return gatewayRequest<{
    revision: number;
    inserted: number;
    updated: number;
    rejected: number;
  }>("import_assets", { ownerKey, actor, expectedRevision, payload });
}

async function gatewayRequest<T = unknown>(operation: string, payload: Record<string, unknown>): Promise<T> {
  const config = getGatewayConfig();
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-patrimonio-key": config.key,
    },
    body: JSON.stringify({ operation, ...payload }),
  });
  const responseText = await response.text();
  const body = safeJson(responseText);

  if (!response.ok) {
    throw new SupabaseError(
      String(body?.message ?? body?.error ?? "Falha na persistência Supabase."),
      typeof body?.code === "string" ? body.code : null,
      typeof body?.details === "string" ? body.details : null,
    );
  }

  return (body?.data ?? body) as T;
}

function getGatewayConfig(): GatewayConfig {
  const url = String(
    env.SUPABASE_GATEWAY_URL ?? process.env.SUPABASE_GATEWAY_URL ?? "",
  ).replace(/\/$/, "");
  const key = String(
    env.SUPABASE_GATEWAY_KEY ?? process.env.SUPABASE_GATEWAY_KEY ?? "",
  );
  if (!url || !key) {
    throw new SupabaseError(
      "Supabase não configurado. Defina SUPABASE_GATEWAY_URL e SUPABASE_GATEWAY_KEY no ambiente do servidor.",
      "missing_configuration",
    );
  }
  return { url, key };
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
