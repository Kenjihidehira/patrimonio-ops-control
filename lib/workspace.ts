import type { AuthenticatedUser } from "@/app/auth";
import { normalizeState } from "@/lib/domain";
import { loadDepartmentWorkspace } from "@/lib/supabase";

type LoadedWorkspace = Awaited<ReturnType<typeof loadDepartmentWorkspace>>;
type ActiveWorkspace = Extract<LoadedWorkspace, { notModified: false }>;
type WorkspaceContext = {
  state: ReturnType<typeof normalizeState>;
  imports: ActiveWorkspace["imports"];
  operations: ActiveWorkspace["operations"];
  analytics: ActiveWorkspace["analytics"];
  environment: ActiveWorkspace["environment"] | null;
  source: "locked" | "supabase";
  notModified: false;
};
type UnchangedWorkspaceContext = {
  notModified: true;
  revision: number;
};

export function loadWorkspaceContext(
  user: AuthenticatedUser | null,
  departmentSlug?: string | null,
): Promise<WorkspaceContext>;
export function loadWorkspaceContext(
  user: AuthenticatedUser | null,
  departmentSlug: string | null,
  knownRevision: number | null,
): Promise<WorkspaceContext | UnchangedWorkspaceContext>;
export async function loadWorkspaceContext(
  user: AuthenticatedUser | null,
  departmentSlug: string | null = null,
  knownRevision: number | null = null,
): Promise<WorkspaceContext | UnchangedWorkspaceContext> {
  if (!user) {
    return {
      state: normalizeState({ revision: 0, nuclei: [], assets: [], collaborators: [] }),
      imports: [],
      operations: {
        inventoryCampaigns: [],
        inventoryCampaignAssets: [],
        custodyTerms: [],
        maintenanceOrders: [],
        trackingTags: [],
        trackingEvents: [],
        assetDocuments: [],
        assetContracts: [],
        assetAccounting: [],
        assetKits: [],
        assetKitItems: [],
        reservations: [],
        reservationAssets: [],
        offboardingCases: [],
        offboardingAssets: [],
        lifecycleRequests: [],
        customFields: [],
        assetCustomValues: [],
        integrations: [],
        integrationEvents: [],
        dataSourcePolicies: [],
        reconciliationIssues: [],
        assetInspections: [],
      },
      analytics: null,
      environment: null,
      source: "locked" as const,
      notModified: false as const,
    };
  }

  const workspace = await loadDepartmentWorkspace(
    user.identifier,
    departmentSlug,
    knownRevision,
  );
  if (workspace.notModified) {
    return {
      notModified: true as const,
      revision: workspace.revision,
    };
  }

  return {
    state: normalizeState(workspace.state),
    imports: workspace.imports,
    operations: workspace.operations,
    analytics: workspace.analytics,
    environment: workspace.environment,
    source: "supabase" as const,
    notModified: false as const,
  };
}
