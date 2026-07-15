import { eq } from "drizzle-orm";
import seed from "@/data/seed.json";
import {
  chatGPTSignInPath,
  chatGPTSignOutPath,
  getChatGPTUser,
} from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { workspaces } from "@/db/schema";
import {
  applyAction,
  buildDashboard,
  cloneState,
  DomainError,
  normalizeState,
} from "@/lib/domain";

export const dynamic = "force-dynamic";

const WORKSPACE_KEY = "company-demo";
const APP_PATH = "/demo/index.html";
const responseHeaders = { "cache-control": "no-store" };

export async function GET(request: Request) {
  try {
    const user = await getChatGPTUser();
    const url = new URL(request.url);
    const state = user ? await loadPersistedState() : normalizeState(cloneState(seed));
    const dashboard = buildDashboard(state, {
      search: url.searchParams.get("search"),
      type: url.searchParams.get("type"),
      status: url.searchParams.get("status"),
      nucleus: url.searchParams.get("nucleus"),
      sort: url.searchParams.get("sort"),
    });

    return Response.json(
      {
        ...dashboard,
        session: {
          authenticated: Boolean(user),
          displayName: user?.displayName ?? "Visitante da demonstração",
          email: user?.email ?? null,
          source: user ? "d1" : "seed",
          signInUrl: chatGPTSignInPath(APP_PATH),
          signOutUrl: chatGPTSignOutPath(APP_PATH),
        },
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("Failed to load patrimonial state", error);
    return Response.json(
      { error: "Não foi possível carregar o controle patrimonial." },
      { status: 500, headers: responseHeaders },
    );
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json(
      {
        error: "Entre com o ChatGPT para registrar alterações.",
        signInUrl: chatGPTSignInPath(APP_PATH),
      },
      { status: 401, headers: responseHeaders },
    );
  }

  try {
    const action = await request.json();
    const currentState = await loadPersistedState();
    const nextState = applyAction(currentState, action, user.email);
    await persistState(nextState);

    return Response.json(
      {
        ...buildDashboard(nextState),
        message: "Alteração registrada com sucesso.",
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "O corpo da requisição não contém JSON válido." },
        { status: 400, headers: responseHeaders },
      );
    }
    if (error instanceof DomainError) {
      return Response.json(
        { error: error.message },
        { status: 422, headers: responseHeaders },
      );
    }

    console.error("Failed to mutate patrimonial state", error);
    return Response.json(
      { error: "Não foi possível registrar a alteração." },
      { status: 500, headers: responseHeaders },
    );
  }
}

async function loadPersistedState() {
  const db = await getDb();
  const row = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.workspaceKey, WORKSPACE_KEY))
    .get();

  if (!row) return normalizeState(cloneState(seed));
  return normalizeState(JSON.parse(row.stateJson));
}

async function persistState(state: unknown) {
  const db = await getDb();
  const now = new Date().toISOString();
  const stateJson = JSON.stringify(state);
  await db
    .insert(workspaces)
    .values({
      workspaceKey: WORKSPACE_KEY,
      stateJson,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: workspaces.workspaceKey,
      set: { stateJson, updatedAt: now },
    });
}
