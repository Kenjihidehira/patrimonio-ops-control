export type AssetType =
  | "cpu"
  | "monitor_1"
  | "monitor_2"
  | "chair"
  | "notebook"
  | "fleet"
  | "car"
  | "trailer"
  | "vehicle_component"
  | "equipment"
  | "furniture"
  | "extinguisher"
  | "software"
  | "other";
export type AssetStatus =
  | "available"
  | "allocated"
  | "maintenance"
  | "discrepancy"
  | "retired";
export type ViewId =
  | "dashboard"
  | "inventory"
  | "operations"
  | "nuclei"
  | "audit"
  | "imports"
  | "collaborators"
  | "environments";
export type QuickFilter = "all" | "unassigned" | "untagged" | "maintenance" | "discrepancy";

export type Movement = {
  id: string;
  type:
    | "registration"
    | "transfer"
    | "department_transfer"
    | "status_change"
    | "identifier_change"
    | "details_update"
    | "import";
  actor: string;
  from: string;
  to: string;
  note: string;
  at: string;
};

export type Nucleus = {
  id: string;
  code: string;
  name: string;
  location: string;
  manager: string;
};

type NucleusSummary = Nucleus & {
  total: number;
  allocated: number;
  untagged: number;
  alerts: number;
};

export type Asset = {
  id: string;
  type: AssetType;
  nucleusId: string;
  assignee: string;
  location: string;
  serial: string;
  brandModel: string;
  acquiredAt: string | null;
  value: number | null;
  status: AssetStatus;
  notes: string;
  sourceSystem: "sabium" | null;
  baseCode: string;
  incorporation: number | null;
  sourceIdentifier: string;
  sourceDescription: string;
  assetGroup: string;
  branchCode: string;
  disposedAt: string | null;
  operationValue: number | null;
  invoiceNumber: string;
  createdAt: string;
  movements: Movement[];
  hasPatrimony: boolean;
  nucleus: Nucleus;
  lastMovement: Movement | null;
};

type AuditRecord = Movement & {
  assetId: string;
  hasPatrimony: boolean;
  sourceSystem: "sabium" | null;
  sourceIdentifier: string;
  baseCode: string;
  incorporation: number | null;
  assetType: string;
  nucleusName: string;
  typeLabel: string;
};

type CollaboratorAsset = {
  id: string;
  hasPatrimony: boolean;
  type: AssetType;
  brandModel: string;
  location: string;
  status: AssetStatus;
  sourceSystem: "sabium" | null;
  sourceIdentifier: string;
  baseCode: string;
  incorporation: number | null;
};

export type Collaborator = {
  id: string;
  name: string;
  nucleusId: string;
  profileRegistered: boolean;
  nucleus: Nucleus;
  assetCount: number;
  assetIds: string[];
  assets: CollaboratorAsset[];
  hasAssets: boolean;
  patrimonyCount: number;
  hasPatrimony: boolean;
};

export type ImportIssue = {
  row: number;
  column: string;
  message: string;
};

export type ImportPreview = {
  totalCandidates: number;
  acceptedCount: number;
  newAssetCount: number;
  updateAssetCount: number;
  unchangedAssetCount: number;
  protectedFieldChangeCount: number;
  requiresOperationalConfirmation: boolean;
  untaggedCount: number;
  rejectedCount: number;
  adjustedCount: number;
  nucleusCount: number;
  collaboratorCount: number;
  canCommit: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

type ImportRun = {
  id: string;
  fileName: string;
  rowCount: number;
  inserted: number;
  updated: number;
  rejected: number;
  warnings: ImportIssue[];
  importedBy: string;
  createdAt: string;
};

type Session = {
  authenticated: boolean;
  displayName: string;
  identifier: string | null;
  provider: "google" | "credentials" | null;
  source: "locked" | "supabase";
  signInUrl: string;
  signOutUrl: string;
};

export type Department = {
  slug: string;
  name: string;
};

export type DepartmentUser = {
  identifier: string;
  username: string;
  hasCredentials: boolean;
  displayName: string;
  isAdmin: boolean;
  isAuditor: boolean;
  active: boolean;
  canWrite: boolean;
  canImport: boolean;
  canExport: boolean;
  canViewFinancialData: boolean;
  lastLoginAt: string | null;
  departmentSlugs: string[];
};

export type AccessRequest = {
  id: string;
  identifier: string;
  username: string;
  displayName: string;
  justification: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export type DepartmentTransfer = {
  id: string;
  sourceDepartmentSlug: string;
  sourceDepartmentName: string;
  targetDepartmentSlug: string;
  targetDepartmentName: string;
  entityType: "asset" | "collaborator";
  entityId: string;
  entityLabel: string;
  assetCodes: string[];
  actor: string;
  note: string;
  at: string;
};

export type SecurityEvent = {
  id: string;
  eventType: string;
  outcome: "success" | "denied" | "failure";
  actorIdentifier: string | null;
  targetIdentifier: string | null;
  departmentSlug: string | null;
  metadata: Record<string, unknown>;
  at: string;
  expiresAt: string;
};

export type DepartmentEnvironment = {
  activeDepartment: Department;
  departments: Department[];
  isAdmin: boolean;
  isAuditor: boolean;
  permissions: {
    canWrite: boolean;
    canImport: boolean;
    canExport: boolean;
    canViewFinancialData: boolean;
  };
  users: DepartmentUser[];
  accessRequests: AccessRequest[];
  transfers: DepartmentTransfer[];
  securityEvents: SecurityEvent[];
};

export type InventoryCampaignStatus = "active" | "completed" | "cancelled";
export type InventoryCheckResult =
  | "pending"
  | "confirmed"
  | "missing"
  | "wrong_location"
  | "damaged";

export type InventoryCampaign = {
  id: string;
  name: string;
  nucleusId: string | null;
  status: InventoryCampaignStatus;
  dueAt: string | null;
  targetCount: number;
  checkedCount: number;
  issueCount: number;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type InventoryCampaignAsset = {
  campaignId: string;
  assetId: string;
  result: InventoryCheckResult;
  observedLocation: string;
  note: string;
  checkedBy: string | null;
  checkedAt: string | null;
};

export type CustodyTermStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type CustodyTerm = {
  id: string;
  assetId: string;
  assignee: string;
  assigneeIdentifier: string;
  status: CustodyTermStatus;
  note: string;
  issuedBy: string;
  issuedAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  responseNote: string;
};

export type MaintenanceKind = "preventive" | "corrective" | "inspection";
export type MaintenancePriority = "low" | "normal" | "high" | "critical";
export type MaintenanceStatus = "open" | "in_progress" | "completed" | "cancelled";

export type MaintenanceOrder = {
  id: string;
  assetId: string;
  kind: MaintenanceKind;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  title: string;
  notes: string;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TrackingTechnology =
  | "qr"
  | "barcode"
  | "rfid_uhf"
  | "ble"
  | "uwb"
  | "gps"
  | "mdm";

export type TrackingEventTechnology = TrackingTechnology | "manual";

export type TrackingTag = {
  id: string;
  assetId: string;
  technology: TrackingTechnology;
  tagId: string;
  active: boolean;
  installedBy: string;
  installedAt: string;
  updatedAt: string;
};

export type TrackingEvent = {
  id: string;
  assetId: string;
  technology: TrackingEventTechnology;
  tagId: string;
  readerId: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  confidence: number | null;
  batteryPercent: number | null;
  note: string;
  observedBy: string;
  observedAt: string;
};

export type AssetDocument = {
  id: string;
  assetId: string;
  category: "invoice" | "warranty" | "inspection" | "photo" | "contract" | "manual" | "disposal" | "other";
  fileName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string | null;
  note: string;
  uploadedBy: string;
  uploadedAt: string;
  retentionUntil: string | null;
  containsFinancialData: boolean;
};

export type AssetContract = {
  id: string;
  assetId: string;
  kind: "purchase" | "lease" | "insurance" | "warranty" | "license" | "service";
  name: string;
  provider: string;
  contractNumber: string;
  startsOn: string | null;
  endsOn: string | null;
  renewalNoticeDays: number;
  monthlyCost: number | null;
  currency: string;
  status: "active" | "expired" | "cancelled";
  documentId: string | null;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type AssetAccounting = {
  assetId: string;
  acquisitionValue: number;
  residualValue: number;
  depreciationMethod: "straight_line" | "none";
  usefulLifeMonths: number | null;
  depreciationStartsOn: string | null;
  costCenter: string;
  ledgerAccount: string;
  supplier: string;
  purchaseOrder: string;
  invoiceNumber: string;
  updatedBy: string;
  updatedAt: string;
};

export type AssetKit = {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  status: "active" | "dissolved";
  createdBy: string;
  createdAt: string;
  dissolvedBy: string | null;
  dissolvedAt: string | null;
};

export type AssetKitItem = {
  kitId: string;
  assetId: string;
  addedAt: string;
  releasedAt: string | null;
};

export type AssetReservation = {
  id: string;
  requesterName: string;
  requesterIdentifier: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  status: "requested" | "approved" | "checked_out" | "returned" | "rejected" | "cancelled";
  createdBy: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  checkedOutAt: string | null;
  returnedAt: string | null;
  updatedBy: string;
  updatedAt: string;
};

export type ReservationAsset = {
  reservationId: string;
  assetId: string;
};

export type OffboardingCase = {
  id: string;
  collaboratorName: string;
  collaboratorIdentifier: string;
  dueAt: string | null;
  status: "open" | "completed" | "cancelled";
  notes: string;
  createdBy: string;
  createdAt: string;
  completedBy: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type OffboardingAsset = {
  caseId: string;
  assetId: string;
  result: "pending" | "returned" | "missing" | "reassigned";
  destinationAssignee: string;
  note: string;
  checkedBy: string | null;
  checkedAt: string | null;
};

export type LifecycleRequest = {
  id: string;
  requestType: "purchase" | "transfer" | "disposal" | "repair" | "replacement";
  assetId: string | null;
  title: string;
  reason: string;
  quantity: number;
  estimatedCost: number | null;
  status: "pending_approval" | "approved" | "rejected" | "completed" | "cancelled";
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  completedAt: string | null;
  updatedAt: string;
};

export type CustomField = {
  id: string;
  name: string;
  fieldType: "text" | "number" | "date" | "boolean" | "select";
  options: string[];
  required: boolean;
  containsFinancialData: boolean;
  active: boolean;
  createdBy: string;
  createdAt: string;
};

export type AssetCustomValue = {
  assetId: string;
  fieldId: string;
  value: unknown;
  updatedBy: string;
  updatedAt: string;
};

export type AssetIntegration = {
  id: string;
  name: string;
  provider: "hr" | "erp" | "mdm" | "service_desk" | "iot" | "directory" | "custom";
  direction: "inbound" | "outbound" | "bidirectional";
  status: "active" | "paused" | "error";
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
};

export type IntegrationEvent = {
  id: string;
  integrationId: string;
  externalId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  status: "pending" | "processed" | "failed" | "ignored";
  attempts: number;
  errorMessage: string;
  receivedAt: string;
  processedAt: string | null;
};

export type ReconciliationIssue = {
  id: string;
  integrationId: string | null;
  source: string;
  externalRef: string;
  entityType: string;
  entityId: string;
  issueType: string;
  severity: "low" | "medium" | "high" | "critical";
  details: Record<string, unknown>;
  status: "open" | "resolved" | "ignored";
  assignedTo: string;
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string;
};

export type DataSourcePolicy = {
  domainKey: string;
  domainLabel: string;
  masterSystem: string;
  writePolicy: "authoritative" | "operational_protected" | "append_only";
  activationStatus: "active" | "planned";
  ownedFields: string[];
  scopeNote: string;
};

export type AssetInspection = {
  id: string;
  assetId: string;
  documentId: string | null;
  inspectionType: "condition" | "identification" | "count";
  status: "pending" | "processing" | "needs_review" | "approved" | "rejected" | "failed";
  provider: string;
  detectedAssetCode: string;
  confidence: number | null;
  findings: Record<string, unknown>;
  modelVersion: string;
  requestedBy: string;
  requestedAt: string;
  processedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string;
};

export type OperationsData = {
  inventoryCampaigns: InventoryCampaign[];
  inventoryCampaignAssets: InventoryCampaignAsset[];
  custodyTerms: CustodyTerm[];
  maintenanceOrders: MaintenanceOrder[];
  trackingTags: TrackingTag[];
  trackingEvents: TrackingEvent[];
  assetDocuments: AssetDocument[];
  assetContracts: AssetContract[];
  assetAccounting: AssetAccounting[];
  assetKits: AssetKit[];
  assetKitItems: AssetKitItem[];
  reservations: AssetReservation[];
  reservationAssets: ReservationAsset[];
  offboardingCases: OffboardingCase[];
  offboardingAssets: OffboardingAsset[];
  lifecycleRequests: LifecycleRequest[];
  customFields: CustomField[];
  assetCustomValues: AssetCustomValue[];
  integrations: AssetIntegration[];
  integrationEvents: IntegrationEvent[];
  dataSourcePolicies: DataSourcePolicy[];
  reconciliationIssues: ReconciliationIssue[];
  assetInspections: AssetInspection[];
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  assets: {
    total: number;
    allocated: number;
    available: number;
    maintenance: number;
    discrepancies: number;
    retired: number;
    allocationRate: number;
    discrepancyRate: number;
  };
  inventory: {
    activeCampaigns: number;
    campaign: {
      id: string;
      name: string;
      status: string;
      dueAt: string | null;
      targetCount: number;
      checkedCount: number;
      issueCount: number;
      completionRate: number;
      overdue: boolean;
      results: {
        confirmed: number;
        missing: number;
        wrongLocation: number;
        damaged: number;
        pending: number;
      };
    } | null;
  };
  custody: {
    formalizedAssets: number;
    allocatedAssets: number;
    coverageRate: number | null;
    pendingTerms: number;
  };
  maintenance: {
    open: number;
    overdue: number;
    critical: number;
    preventive: number;
    corrective: number;
    inspections: number;
    ageBuckets: {
      upTo7: number;
      from8To30: number;
      from31To60: number;
      over60: number;
    };
  };
  dataQuality: {
    identified: number;
    identificationRate: number;
    allocatedWithResponsible: number;
    responsibleRate: number | null;
    located: number;
    locationRate: number;
    tracked: number;
    trackingRate: number;
  };
  nuclei: Array<{
    id: string;
    code: string;
    name: string;
    total: number;
    allocated: number;
    maintenance: number;
    discrepancies: number;
    untagged: number;
    alerts: number;
    allocationRate: number;
  }>;
  movementTrend: Array<{
    key: string;
    label: string;
    count: number;
  }>;
};

export type Dashboard = {
  revision: number;
  summary: {
    total: number;
    allocated: number;
    maintenance: number;
    discrepancies: number;
    available: number;
    retired: number;
    untagged: number;
    collaborators: number;
    collaboratorsWithoutPatrimony: number;
  };
  inventory: Asset[];
  nucleusInventory: Asset[];
  nuclei: NucleusSummary[];
  audit: AuditRecord[];
  collaborators: Collaborator[];
  imports: ImportRun[];
  operations: OperationsData;
  analytics: AnalyticsSnapshot | null;
  environment: DepartmentEnvironment;
  resultCount: number;
  options: {
    assetTypes: Record<AssetType, string>;
    statuses: Record<AssetStatus, string>;
  };
  session: Session;
};

export type InventoryFilters = {
  search: string;
  type: AssetType | "all";
  status: AssetStatus | "all";
  nucleus: string;
  sort: "recent" | "asset_asc" | "nucleus" | "status";
};

export type MutationAction = Record<string, unknown> & { type: string };

export type ModalState =
  | { kind: "closed" }
  | { kind: "create-asset"; initialId?: string; scanToken?: number }
  | { kind: "create-nucleus" }
  | { kind: "transfer"; assetId: string }
  | { kind: "identifier"; assetId: string }
  | { kind: "edit-nucleus"; nucleusId: string }
  | { kind: "nucleus-inventory"; nucleusId: string; assetId?: string }
  | { kind: "collaborator"; collaboratorId: string }
  | { kind: "import" }
  | { kind: "scanner-missing"; identifier: string; scanToken: number }
  | { kind: "scanner"; assetId: string; scanToken: number };

export const defaultFilters: InventoryFilters = {
  search: "",
  type: "all",
  status: "all",
  nucleus: "all",
  sort: "recent",
};
