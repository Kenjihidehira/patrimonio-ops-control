import seed from "@/data/seed.json";
import type { GitHubUser } from "@/app/github-auth";
import { cloneState, normalizeState } from "@/lib/domain";
import { companyWorkspaceKey, loadImportRuns, loadOrCreateWorkspace } from "@/lib/supabase";

export async function loadWorkspaceContext(user: GitHubUser | null) {
  if (!user) {
    return {
      state: normalizeState(cloneState(seed)),
      imports: [],
      ownerKey: null,
      source: "seed" as const,
    };
  }

  const ownerKey = companyWorkspaceKey();
  const state = normalizeState(await loadOrCreateWorkspace(ownerKey));
  const imports = await loadImportRuns(ownerKey);
  return { state, imports, ownerKey, source: "supabase" as const };
}
