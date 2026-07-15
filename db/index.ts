import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

let schemaReady: Promise<unknown> | null = null;

export async function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  schemaReady ??= env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_key TEXT PRIMARY KEY NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  await schemaReady;

  return drizzle(env.DB, { schema });
}
