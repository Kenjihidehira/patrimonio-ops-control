import { env } from "cloudflare:workers";
import {
  createGatewayNonce,
  createGatewaySignature,
} from "@/lib/gateway-signature";

type WorkspaceState = {
  revision: number;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  collaborators: Array<Record<string, unknown>>;
  inventoryCampaigns: Array<Record<string, unknown>>;
  inventoryCampaignAssets: Array<Record<string, unknown>>;
  custodyTerms: Array<Record<string, unknown>>;
  maintenanceOrders: Array<Record<string, unknown>>;
  trackingTags: Array<Record<string, unknown>>;
  trackingEvents: Array<Record<string, unknown>>;
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
  canWrite: boolean;
  canImport: boolean;
  canExport: boolean;
  lastLoginAt: string | null;
  departmentSlugs: string[];
};

type GatewayWorkspaceContext = {
  notModified?: false;
  workspace: Array<{ revision: number }>;
  nuclei: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  collaborators: Array<Record<string, unknown>>;
  movements: Array<Record<string, unknown>>;
  imports: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
  securityEvents: Array<Record<string, unknown>>;
  inventoryCampaigns: Array<Record<string, unknown>>;
  inventoryCampaignAssets: Array<Record<string, unknown>>;
  custodyTerms: Array<Record<string, unknown>>;
  maintenanceOrders: Array<Record<string, unknown>>;
  trackingTags: Array<Record<string, unknown>>;
  trackingEvents: Array<Record<string, unknown>>;
  access: {
    activeDepartment: Department;
    departments: Department[];
    isAdmin: boolean;
    permissions: {
      canWrite: boolean;
      canImport: boolean;
      canExport: boolean;
    };
    users: DepartmentUser[];
  };
};

type GatewayWorkspaceNotModified = {
  notModified: true;
  revision: number;
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

export async function getSystemAccess(identifier: string): Promise<{
  authorized: boolean;
  sessionVersion: number;
}> {
  const result = await gatewayRequest<{
    authorized: boolean;
    sessionVersion: number;
  }>("check_user_access", {
    identifier,
  });
  return {
    authorized: result.authorized === true,
    sessionVersion: Number(result.sessionVersion ?? 0),
  };
}

export async function hasSystemAccess(identifier: string): Promise<boolean> {
  return (await getSystemAccess(identifier)).authorized;
}

export async function loadDepartmentWorkspace(
  identifier: string,
  departmentSlug: string | null,
  knownRevision: number | null = null,
) {
  const result = await gatewayRequest<
    GatewayWorkspaceContext | GatewayWorkspaceNotModified
  >("load_workspace_context", {
    identifier,
    departmentSlug,
    knownRevision,
  });
  if (result.notModified) return result;

  const departmentNames = new Map(
    result.access.departments.map((department) => [department.slug, department.name]),
  );

  return {
    notModified: false as const,
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
      securityEvents: result.securityEvents.map((row) => ({
        id: String(row.id),
        eventType: String(row.event_type),
        outcome: String(row.outcome) as "success" | "denied" | "failure",
        actorIdentifier: row.actor_identifier ? String(row.actor_identifier) : null,
        targetIdentifier: row.target_identifier ? String(row.target_identifier) : null,
        departmentSlug: row.department_slug ? String(row.department_slug) : null,
        metadata: row.metadata && typeof row.metadata === "object"
          ? row.metadata as Record<string, unknown>
          : {},
        at: String(row.occurred_at),
        expiresAt: String(row.expires_at),
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
    active: boolean;
    canWrite: boolean;
    canImport: boolean;
    canExport: boolean;
    departmentSlugs: string[];
  },
) {
  return gatewayRequest("save_user_access", {
    identifier: adminIdentifier,
    user,
  });
}

export async function authorizeDepartmentOperation(
  identifier: string,
  departmentSlug: string,
  requestedOperation: "read" | "write" | "import" | "export" | "admin",
) {
  return gatewayRequest<{
    departmentSlug: string;
    canWrite: boolean;
    canImport: boolean;
    canExport: boolean;
    isAdmin: boolean;
    sessionVersion: number;
  }>("authorize_operation", {
    identifier,
    departmentSlug,
    requestedOperation,
  });
}

export async function recordAuthEvent(
  identifier: string,
  eventType: "login_succeeded" | "login_denied" | "logout",
  outcome: "success" | "denied" | "failure",
): Promise<void> {
  await gatewayRequest("record_auth_event", {
    identifier,
    eventType,
    outcome,
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
      sourceSystem: row.source_system === "sabium" ? "sabium" : null,
      sourceFingerprint: row.source_fingerprint ?? "",
      baseCode: row.base_code ?? "",
      incorporation: row.incorporation === null || row.incorporation === undefined
        ? null
        : Number(row.incorporation),
      sourceIdentifier: row.source_identifier ?? "",
      sourceDescription: row.source_description ?? "",
      assetGroup: row.asset_group ?? "",
      branchCode: row.branch_code ?? "",
      disposedAt: row.disposed_at ?? null,
      operationValue: row.operation_value === null || row.operation_value === undefined
        ? null
        : Number(row.operation_value),
      invoiceNumber: row.invoice_number ?? "",
      sourceRow: row.source_row === null || row.source_row === undefined
        ? null
        : Number(row.source_row),
      createdAt: row.created_at,
      movements: movementsByAsset.get(String(row.code)) ?? [],
    })),
    collaborators: result.collaborators.map((row) => ({
      id: row.id,
      name: row.name,
      nucleusId: row.nucleus_id,
    })),
    inventoryCampaigns: result.inventoryCampaigns.map((row) => ({
      id: row.id,
      name: row.name,
      nucleusId: row.nucleus_id ?? null,
      status: row.status,
      dueAt: row.due_at ?? null,
      targetCount: Number(row.target_count ?? 0),
      checkedCount: Number(row.checked_count ?? 0),
      issueCount: Number(row.issue_count ?? 0),
      createdBy: row.created_by,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? null,
      updatedAt: row.updated_at,
    })),
    inventoryCampaignAssets: result.inventoryCampaignAssets.map((row) => ({
      campaignId: row.campaign_id,
      assetId: row.asset_code,
      result: row.result,
      observedLocation: row.observed_location,
      note: row.note,
      checkedBy: row.checked_by ?? null,
      checkedAt: row.checked_at ?? null,
    })),
    custodyTerms: result.custodyTerms.map((row) => ({
      id: row.id,
      assetId: row.asset_code,
      assignee: row.assignee,
      assigneeIdentifier: row.assignee_identifier,
      status: row.status,
      note: row.note,
      issuedBy: row.issued_by,
      issuedAt: row.issued_at,
      respondedBy: row.responded_by ?? null,
      respondedAt: row.responded_at ?? null,
      responseNote: row.response_note,
    })),
    maintenanceOrders: result.maintenanceOrders.map((row) => ({
      id: row.id,
      assetId: row.asset_code,
      kind: row.kind,
      priority: row.priority,
      status: row.status,
      title: row.title,
      notes: row.notes,
      dueAt: row.due_at ?? null,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
      completedAt: row.completed_at ?? null,
    })),
    trackingTags: result.trackingTags.map((row) => ({
      id: row.id,
      assetId: row.asset_code,
      technology: row.technology,
      tagId: row.tag_id,
      active: row.active === true,
      installedBy: row.installed_by,
      installedAt: row.installed_at,
      updatedAt: row.updated_at,
    })),
    trackingEvents: result.trackingEvents.map((row) => ({
      id: row.id,
      assetId: row.asset_code,
      technology: row.technology,
      tagId: row.tag_id,
      readerId: row.reader_id,
      location: row.location,
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
      accuracyMeters: row.accuracy_meters === null || row.accuracy_meters === undefined
        ? null
        : Number(row.accuracy_meters),
      confidence: row.confidence === null || row.confidence === undefined
        ? null
        : Number(row.confidence),
      batteryPercent: row.battery_percent === null || row.battery_percent === undefined
        ? null
        : Number(row.battery_percent),
      note: row.note,
      observedBy: row.observed_by,
      observedAt: row.observed_at,
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
  const requestBody = JSON.stringify({ operation, ...payload });
  const timestamp = String(Date.now());
  const nonce = createGatewayNonce();
  const signature = await createGatewaySignature(
    config.key,
    timestamp,
    nonce,
    requestBody,
  );
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-patrimonio-timestamp": timestamp,
      "x-patrimonio-nonce": nonce,
      "x-patrimonio-signature": signature,
    },
    body: requestBody,
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
