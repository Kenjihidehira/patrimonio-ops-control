import seed from "@/data/seed.json";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { cloneState, normalizeState } from "@/lib/domain";
import { loadImportRuns, loadOrCreateWorkspace, ownerKeyFor } from "@/lib/supabase";

export async function loadWorkspaceContext(user: ChatGPTUser | null) {
  if (!user) {
    return {
      state: normalizeState(cloneState(seed)),
      imports: [],
      ownerKey: null,
      source: "seed" as const,
    };
  }

  const ownerKey = await ownerKeyFor(user.email);
  const state = normalizeState(await loadOrCreateWorkspace(ownerKey));
  const imports = await loadImportRuns(ownerKey);
  return { state, imports, ownerKey, source: "supabase" as const };
}
