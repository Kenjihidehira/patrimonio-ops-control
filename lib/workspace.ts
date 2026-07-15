import seed from "@/data/seed.json";
import type { MicrosoftUser } from "@/app/microsoft-auth";
import { cloneState, normalizeState } from "@/lib/domain";
import { companyWorkspaceKey, loadImportRuns, loadOrCreateWorkspace } from "@/lib/supabase";

export async function loadWorkspaceContext(user: MicrosoftUser | null) {
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
