import type { AuthenticatedUser } from "@/app/auth";
import { normalizeState } from "@/lib/domain";
import { loadDepartmentWorkspace } from "@/lib/supabase";

export async function loadWorkspaceContext(
  user: AuthenticatedUser | null,
  departmentSlug: string | null = null,
) {
  if (!user) {
    return {
      state: normalizeState({ revision: 0, nuclei: [], assets: [], collaborators: [] }),
      imports: [],
      environment: null,
      source: "locked" as const,
    };
  }

  const workspace = await loadDepartmentWorkspace(user.identifier, departmentSlug);
  return {
    state: normalizeState(workspace.state),
    imports: workspace.imports,
    environment: workspace.environment,
    source: "supabase" as const,
  };
}
