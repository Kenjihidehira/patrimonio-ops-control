import { env } from "cloudflare:workers";

type WorkspaceState = {
  revision: number;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  collaborators: Array<Record<string, unknown>>;
};

type ImportPayload = {
  fileName: string;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  collaborators: Array<Record<string, unknown>>;
  rejectedCount: number;
  warnings: Array<Record<string, unknown>>;
};

type Department = {
  slug: string;
  name: string;
};

type DepartmentUser = {
  identifier: string;
  displayName: string;
  isAdmin: boolean;
  active: boolean;
  departmentSlugs: string[];
};

type GatewayWorkspaceContext = {
  workspace: Array<{ revision: number }>;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  collaborators: Array<Record<string, unknown>>;
  movements: Array<Record<string, unknown>>;
  imports: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
  access: {
    activeDepartment: Department;
    departments: Department[];
    isAdmin: boolean;
    users: DepartmentUser[];
  };
};

type GatewayConfig = {
  url: string;
  key: string;
};

export class SupabaseError extends Error {
  code: string | null;
  details: string | null;
  status: number;

  constructor(
    message: string,
    code: string | null = null,
    details: string | null = null,
    status = 500,
  ) {
    super(message);
    this.name = "SupabaseError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export async function hasSystemAccess(identifier: string): Promise<boolean> {
  const result = await gatewayRequest<{ authorized: boolean }>("check_user_access", {
    identifier,
  });
  return result.authorized === true;
}

export async function loadDepartmentWorkspace(
  identifier: string,
  departmentSlug: string | null,
) {
  const result = await gatewayRequest<GatewayWorkspaceContext>("load_workspace_context", {
    identifier,
    departmentSlug,
  });
  const departmentNames = new Map(
    result.access.departments.map((department) => [department.slug, department.name]),
  );

  return {
    state: mapWorkspaceState(result),
    imports: mapImportRuns(result.imports),
    environment: {
      ...result.access,
      transfers: result.transfers.map((row) => ({
        id: String(row.id),
        sourceDepartmentSlug: String(row.source_department_slug),
        sourceDepartmentName: departmentNames.get(String(row.source_department_slug))
          ?? humanizeSlug(String(row.source_department_slug)),
        targetDepartmentSlug: String(row.target_department_slug),
        targetDepartmentName: departmentNames.get(String(row.target_department_slug))
          ?? humanizeSlug(String(row.target_department_slug)),
        entityType: String(row.entity_type) as "asset" | "collaborator",
        entityId: String(row.entity_id),
        entityLabel: String(row.entity_label),
        assetCodes: Array.isArray(row.asset_codes)
          ? row.asset_codes.map(String)
          : [],
        actor: String(row.actor),
        note: String(row.note),
        at: String(row.occurred_at),
      })),
    },
  };
}

export async function applyPersistedAction(
  identifier: string,
  departmentSlug: string,
  expectedRevision: number,
  action: unknown,
) {
  return gatewayRequest<number>("apply_action", {
    identifier,
    departmentSlug,
    expectedRevision,
    action,
  });
}

export async function importAssets(
  identifier: string,
  departmentSlug: string,
  expectedRevision: number,
  payload: ImportPayload,
) {
  return gatewayRequest<{
    revision: number;
    inserted: number;
    updated: number;
    rejected: number;
    collaborators: number;
  }>("import_assets", {
    identifier,
    departmentSlug,
    expectedRevision,
    payload,
  });
}

export async function loadDepartmentNuclei(
  identifier: string,
  departmentSlug: string,
) {
  const result = await gatewayRequest<{
    department: Department;
    revision: number;
    nuclei: Array<Record<string, unknown>>;
  }>("load_department_nuclei", { identifier, departmentSlug });
  return {
    department: result.department,
    revision: Number(result.revision),
    nuclei: result.nuclei.map((row) => ({
      id: String(row.id),
      code: String(row.code),
      name: String(row.name),
      location: String(row.location),
      manager: String(row.manager),
    })),
  };
}

export async function saveUserAccess(
  adminIdentifier: string,
  user: {
    identifier: string;
    displayName: string;
    isAdmin: boolean;
    departmentSlugs: string[];
  },
) {
  return gatewayRequest("save_user_access", {
    identifier: adminIdentifier,
    user,
  });
}

export async function transferDepartmentEntity(
  adminIdentifier: string,
  input: {
    sourceDepartmentSlug: string;
    targetDepartmentSlug: string;
    expectedSourceRevision: number;
    expectedTargetRevision: number;
    entityType: "asset" | "collaborator";
    entityId: string;
    targetNucleusId: string;
    targetLocation: string;
    targetAssignee: string;
    note: string;
  },
) {
  return gatewayRequest<{
    sourceRevision: number;
    targetRevision: number;
    transferredAssets: number;
    targetDepartmentSlug: string;
  }>("transfer_department_entity", {
    identifier: adminIdentifier,
    ...input,
  });
}

function mapWorkspaceState(result: GatewayWorkspaceContext): WorkspaceState {
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
    revision: Number(result.workspace[0]?.revision ?? 0),
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
    collaborators: result.collaborators.map((row) => ({
      id: row.id,
      name: row.name,
      nucleusId: row.nucleus_id,
    })),
  };
}

function mapImportRuns(rows: Array<Record<string, unknown>>) {
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

function humanizeSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1))
    .join(" ");
}

async function gatewayRequest<T = unknown>(
  operation: string,
  payload: Record<string, unknown>,
): Promise<T> {
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
      response.status,
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
