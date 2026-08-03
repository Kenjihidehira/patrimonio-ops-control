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
  | "inventory"
  | "nuclei"
  | "audit"
  | "operations"
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
  value: number;
  status: AssetStatus;
  notes: string;
  sourceSystem: "sabium" | null;
  sourceFingerprint: string;
  baseCode: string;
  incorporation: number | null;
  sourceIdentifier: string;
  sourceDescription: string;
  assetGroup: string;
  branchCode: string;
  disposedAt: string | null;
  operationValue: number | null;
  invoiceNumber: string;
  sourceRow: number | null;
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
  untaggedCount: number;
  rejectedCount: number;
  adjustedCount: number;
  nucleusCount: number;
  collaboratorCount: number;
  canCommit: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
};

export type InventoryCampaign = {
  id: string;
  name: string;
  nucleusId: string | null;
  status: "active" | "completed" | "cancelled";
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
  result: "pending" | "confirmed" | "missing" | "wrong_location" | "damaged";
  observedLocation: string;
  note: string;
  checkedBy: string | null;
  checkedAt: string | null;
};

export type CustodyTerm = {
  id: string;
  assetId: string;
  assignee: string;
  assigneeIdentifier: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  note: string;
  issuedBy: string;
  issuedAt: string;
  respondedBy: string | null;
  respondedAt: string | null;
  responseNote: string;
};

export type MaintenanceOrder = {
  id: string;
  assetId: string;
  kind: "preventive" | "corrective" | "inspection";
  priority: "low" | "normal" | "high" | "critical";
  status: "open" | "in_progress" | "completed" | "cancelled";
  title: string;
  notes: string;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TrackingTechnology = "qr" | "barcode" | "rfid_uhf" | "ble" | "uwb" | "gps" | "mdm";

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
  technology: TrackingTechnology | "manual";
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
  provider: "google" | null;
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
  displayName: string;
  isAdmin: boolean;
  active: boolean;
  canWrite: boolean;
  canImport: boolean;
  canExport: boolean;
  lastLoginAt: string | null;
  departmentSlugs: string[];
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
  permissions: {
    canWrite: boolean;
    canImport: boolean;
    canExport: boolean;
  };
  users: DepartmentUser[];
  transfers: DepartmentTransfer[];
  securityEvents: SecurityEvent[];
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
  inventoryCampaigns: InventoryCampaign[];
  inventoryCampaignAssets: InventoryCampaignAsset[];
  custodyTerms: CustodyTerm[];
  maintenanceOrders: MaintenanceOrder[];
  trackingTags: TrackingTag[];
  trackingEvents: TrackingEvent[];
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
