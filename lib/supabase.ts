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
  assetDocuments: Array<Record<string, unknown>>;
  assetContracts: Array<Record<string, unknown>>;
  assetAccounting: Array<Record<string, unknown>>;
  assetKits: Array<Record<string, unknown>>;
  assetKitItems: Array<Record<string, unknown>>;
  reservations: Array<Record<string, unknown>>;
  reservationAssets: Array<Record<string, unknown>>;
  offboardingCases: Array<Record<string, unknown>>;
  offboardingAssets: Array<Record<string, unknown>>;
  lifecycleRequests: Array<Record<string, unknown>>;
  customFields: Array<Record<string, unknown>>;
  assetCustomValues: Array<Record<string, unknown>>;
  integrations: Array<Record<string, unknown>>;
  integrationEvents: Array<Record<string, unknown>>;
  reconciliationIssues: Array<Record<string, unknown>>;
  assetInspections: Array<Record<string, unknown>>;
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
    operations: mapOperations(result),
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

export async function uploadAssetDocument(
  identifier: string,
  departmentSlug: string,
  expectedRevision: number,
  document: {
    id: string;
    assetId: string;
    category: string;
    fileName: string;
    mimeType: string;
    note: string;
    retentionUntil: string;
  },
  contentBase64: string,
) {
  return gatewayRequest<{ id: string; revision: number }>("upload_asset_document", {
    identifier,
    departmentSlug,
    expectedRevision,
    document,
    contentBase64,
  });
}

export async function getAssetDocumentUrl(
  identifier: string,
  departmentSlug: string,
  documentId: string,
) {
  return gatewayRequest<{ url: string; fileName: string }>("get_asset_document_url", {
    identifier,
    departmentSlug,
    documentId,
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

function mapOperations(result: GatewayWorkspaceContext) {
  return {
    inventoryCampaigns: result.inventoryCampaigns.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      nucleusId: row.nucleus_id ? String(row.nucleus_id) : null,
      status: String(row.status),
      dueAt: row.due_at ? String(row.due_at) : null,
      targetCount: Number(row.target_count),
      checkedCount: Number(row.checked_count),
      issueCount: Number(row.issue_count),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      completedAt: row.completed_at ? String(row.completed_at) : null,
      updatedAt: String(row.updated_at),
    })),
    inventoryCampaignAssets: result.inventoryCampaignAssets.map((row) => ({
      campaignId: String(row.campaign_id),
      assetId: String(row.asset_code),
      result: String(row.result),
      observedLocation: String(row.observed_location),
      note: String(row.note),
      checkedBy: row.checked_by ? String(row.checked_by) : null,
      checkedAt: row.checked_at ? String(row.checked_at) : null,
    })),
    custodyTerms: result.custodyTerms.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_code),
      assignee: String(row.assignee),
      assigneeIdentifier: String(row.assignee_identifier),
      status: String(row.status),
      note: String(row.note),
      issuedBy: String(row.issued_by),
      issuedAt: String(row.issued_at),
      respondedBy: row.responded_by ? String(row.responded_by) : null,
      respondedAt: row.responded_at ? String(row.responded_at) : null,
      responseNote: String(row.response_note),
    })),
    maintenanceOrders: result.maintenanceOrders.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_code),
      kind: String(row.kind),
      priority: String(row.priority),
      status: String(row.status),
      title: String(row.title),
      notes: String(row.notes),
      dueAt: row.due_at ? String(row.due_at) : null,
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      updatedBy: String(row.updated_by),
      updatedAt: String(row.updated_at),
      completedAt: row.completed_at ? String(row.completed_at) : null,
    })),
    trackingTags: result.trackingTags.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_code),
      technology: String(row.technology),
      tagId: String(row.tag_id),
      active: row.active === true,
      installedBy: String(row.installed_by),
      installedAt: String(row.installed_at),
      updatedAt: String(row.updated_at),
    })),
    trackingEvents: result.trackingEvents.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_code),
      technology: String(row.technology),
      tagId: String(row.tag_id),
      readerId: String(row.reader_id),
      location: String(row.location),
      latitude: optionalNumber(row.latitude),
      longitude: optionalNumber(row.longitude),
      accuracyMeters: optionalNumber(row.accuracy_meters),
      confidence: optionalNumber(row.confidence),
      batteryPercent: optionalNumber(row.battery_percent),
      note: String(row.note),
      observedBy: String(row.observed_by),
      observedAt: String(row.observed_at),
    })),
    assetDocuments: result.assetDocuments.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_code),
      category: String(row.category),
      fileName: String(row.file_name),
      mimeType: String(row.mime_type),
      byteSize: Number(row.byte_size),
      checksumSha256: row.checksum_sha256 ? String(row.checksum_sha256) : null,
      note: String(row.note),
      uploadedBy: String(row.uploaded_by),
      uploadedAt: String(row.uploaded_at),
      retentionUntil: row.retention_until ? String(row.retention_until) : null,
    })),
    assetContracts: result.assetContracts.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_code),
      kind: String(row.kind),
      name: String(row.name),
      provider: String(row.provider),
      contractNumber: String(row.contract_number),
      startsOn: row.starts_on ? String(row.starts_on) : null,
      endsOn: row.ends_on ? String(row.ends_on) : null,
      renewalNoticeDays: Number(row.renewal_notice_days),
      monthlyCost: optionalNumber(row.monthly_cost),
      currency: String(row.currency),
      status: String(row.status),
      documentId: row.document_id ? String(row.document_id) : null,
      notes: String(row.notes),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      updatedBy: String(row.updated_by),
      updatedAt: String(row.updated_at),
    })),
    assetAccounting: result.assetAccounting.map((row) => ({
      assetId: String(row.asset_code),
      acquisitionValue: Number(row.acquisition_value),
      residualValue: Number(row.residual_value),
      depreciationMethod: String(row.depreciation_method),
      usefulLifeMonths: optionalNumber(row.useful_life_months),
      depreciationStartsOn: row.depreciation_starts_on ? String(row.depreciation_starts_on) : null,
      costCenter: String(row.cost_center),
      ledgerAccount: String(row.ledger_account),
      supplier: String(row.supplier),
      purchaseOrder: String(row.purchase_order),
      invoiceNumber: String(row.invoice_number),
      updatedBy: String(row.updated_by),
      updatedAt: String(row.updated_at),
    })),
    assetKits: result.assetKits.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      itemCount: Number(row.item_count),
      status: String(row.status),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      dissolvedBy: row.dissolved_by ? String(row.dissolved_by) : null,
      dissolvedAt: row.dissolved_at ? String(row.dissolved_at) : null,
    })),
    assetKitItems: result.assetKitItems.map((row) => ({
      kitId: String(row.kit_id),
      assetId: String(row.asset_code),
      addedAt: String(row.added_at),
      releasedAt: row.released_at ? String(row.released_at) : null,
    })),
    reservations: result.reservations.map((row) => ({
      id: String(row.id),
      requesterName: String(row.requester_name),
      requesterIdentifier: String(row.requester_identifier),
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      purpose: String(row.purpose),
      status: String(row.status),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      approvedBy: row.approved_by ? String(row.approved_by) : null,
      approvedAt: row.approved_at ? String(row.approved_at) : null,
      checkedOutAt: row.checked_out_at ? String(row.checked_out_at) : null,
      returnedAt: row.returned_at ? String(row.returned_at) : null,
      updatedBy: String(row.updated_by),
      updatedAt: String(row.updated_at),
    })),
    reservationAssets: result.reservationAssets.map((row) => ({
      reservationId: String(row.reservation_id),
      assetId: String(row.asset_code),
    })),
    offboardingCases: result.offboardingCases.map((row) => ({
      id: String(row.id),
      collaboratorName: String(row.collaborator_name),
      collaboratorIdentifier: String(row.collaborator_identifier),
      dueAt: row.due_at ? String(row.due_at) : null,
      status: String(row.status),
      notes: String(row.notes),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      completedBy: row.completed_by ? String(row.completed_by) : null,
      completedAt: row.completed_at ? String(row.completed_at) : null,
      updatedAt: String(row.updated_at),
    })),
    offboardingAssets: result.offboardingAssets.map((row) => ({
      caseId: String(row.case_id),
      assetId: String(row.asset_code),
      result: String(row.result),
      destinationAssignee: String(row.destination_assignee),
      note: String(row.note),
      checkedBy: row.checked_by ? String(row.checked_by) : null,
      checkedAt: row.checked_at ? String(row.checked_at) : null,
    })),
    lifecycleRequests: result.lifecycleRequests.map((row) => ({
      id: String(row.id),
      requestType: String(row.request_type),
      assetId: row.asset_code ? String(row.asset_code) : null,
      title: String(row.title),
      reason: String(row.reason),
      quantity: Number(row.quantity),
      estimatedCost: optionalNumber(row.estimated_cost),
      status: String(row.status),
      requestedBy: String(row.requested_by),
      requestedAt: String(row.requested_at),
      decidedBy: row.decided_by ? String(row.decided_by) : null,
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      decisionNote: String(row.decision_note),
      completedAt: row.completed_at ? String(row.completed_at) : null,
      updatedAt: String(row.updated_at),
    })),
    customFields: result.customFields.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      fieldType: String(row.field_type),
      options: Array.isArray(row.options) ? row.options.map(String) : [],
      required: row.required === true,
      active: row.active === true,
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
    })),
    assetCustomValues: result.assetCustomValues.map((row) => ({
      assetId: String(row.asset_code),
      fieldId: String(row.field_id),
      value: row.value,
      updatedBy: String(row.updated_by),
      updatedAt: String(row.updated_at),
    })),
    integrations: result.integrations.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      provider: String(row.provider),
      direction: String(row.direction),
      status: String(row.status),
      lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
      lastSyncStatus: row.last_sync_status ? String(row.last_sync_status) : null,
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      updatedBy: String(row.updated_by),
      updatedAt: String(row.updated_at),
    })),
    integrationEvents: result.integrationEvents.map((row) => ({
      id: String(row.id),
      integrationId: String(row.integration_id),
      externalId: String(row.external_id),
      eventType: String(row.event_type),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      status: String(row.status),
      attempts: Number(row.attempts),
      errorMessage: String(row.error_message),
      receivedAt: String(row.received_at),
      processedAt: row.processed_at ? String(row.processed_at) : null,
    })),
    reconciliationIssues: result.reconciliationIssues.map((row) => ({
      id: String(row.id),
      integrationId: row.integration_id ? String(row.integration_id) : null,
      source: String(row.source),
      externalRef: String(row.external_ref),
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      issueType: String(row.issue_type),
      severity: String(row.severity),
      details: row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {},
      status: String(row.status),
      assignedTo: String(row.assigned_to),
      createdAt: String(row.created_at),
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      resolutionNote: String(row.resolution_note),
    })),
    assetInspections: result.assetInspections.map((row) => ({
      id: String(row.id),
      assetId: String(row.asset_code),
      documentId: row.document_id ? String(row.document_id) : null,
      inspectionType: String(row.inspection_type),
      status: String(row.status),
      provider: String(row.provider),
      detectedAssetCode: String(row.detected_asset_code),
      confidence: optionalNumber(row.confidence),
      findings: row.findings && typeof row.findings === "object" ? row.findings as Record<string, unknown> : {},
      modelVersion: String(row.model_version),
      requestedBy: String(row.requested_by),
      requestedAt: String(row.requested_at),
      processedAt: row.processed_at ? String(row.processed_at) : null,
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      reviewNote: String(row.review_note),
    })),
  };
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
