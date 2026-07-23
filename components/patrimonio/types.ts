export type AssetType = "cpu" | "monitor_1" | "monitor_2" | "chair" | "notebook";
export type AssetStatus =
  | "available"
  | "allocated"
  | "maintenance"
  | "discrepancy"
  | "retired";
export type ViewId = "inventory" | "nuclei" | "audit" | "imports" | "collaborators";
export type QuickFilter = "all" | "unassigned" | "untagged" | "maintenance" | "discrepancy";

export type Movement = {
  id: string;
  type:
    | "registration"
    | "transfer"
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

export type NucleusSummary = Nucleus & {
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
  status: AssetStatus;
  notes: string;
  createdAt: string;
  movements: Movement[];
  hasPatrimony: boolean;
  nucleus: Nucleus;
  lastMovement: Movement | null;
};

export type AuditRecord = Movement & {
  assetId: string;
  hasPatrimony: boolean;
  assetType: string;
  nucleusName: string;
  typeLabel: string;
};

export type CollaboratorAsset = {
  id: string;
  hasPatrimony: boolean;
  type: AssetType;
  brandModel: string;
  location: string;
  status: AssetStatus;
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

export type ImportRun = {
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

export type Session = {
  authenticated: boolean;
  displayName: string;
  identifier: string | null;
  provider: "github" | "google" | null;
  source: "locked" | "supabase";
  signInUrl: string;
  signOutUrl: string;
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
  | { kind: "create-asset" }
  | { kind: "create-nucleus" }
  | { kind: "transfer"; assetId: string }
  | { kind: "identifier"; assetId: string }
  | { kind: "edit-nucleus"; nucleusId: string }
  | { kind: "nucleus-inventory"; nucleusId: string; assetId?: string }
  | { kind: "collaborator"; collaboratorId: string }
  | { kind: "import" }
  | { kind: "scanner"; assetId: string };

export const defaultFilters: InventoryFilters = {
  search: "",
  type: "all",
  status: "all",
  nucleus: "all",
  sort: "recent",
};
