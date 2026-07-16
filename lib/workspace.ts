import type { GitHubUser } from "@/app/github-auth";
import { normalizeState } from "@/lib/domain";
import { companyWorkspaceKey, loadImportRuns, loadOrCreateWorkspace } from "@/lib/supabase";

export async function loadWorkspaceContext(user: GitHubUser | null) {
  if (!user) {
    return {
      state: normalizeState({ revision: 0, nuclei: [], assets: [] }),
      imports: [],
      ownerKey: null,
      source: "locked" as const,
    };
  }

  const ownerKey = companyWorkspaceKey();
  const state = normalizeState(await loadOrCreateWorkspace(ownerKey));
  const imports = await loadImportRuns(ownerKey);
  return { state, imports, ownerKey, source: "supabase" as const };
}
