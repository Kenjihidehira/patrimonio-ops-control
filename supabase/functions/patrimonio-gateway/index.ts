import { gatewayKeyMatches } from "./auth.js";

const gatewayKey = Deno.env.get("PATRIMONIO_GATEWAY_KEY") ?? "";
const rotatedGatewayKeyHash =
  "937108f7408c285b8666b3598a03b3cfe0b2e57cd36a4a29627fc9fb88a26d7b";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const supabaseSecretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!supabaseUrl || !supabaseSecretKey) {
    return json({ error: "gateway_not_configured" }, 500);
  }
  if (
    !(await gatewayKeyMatches(
      request.headers.get("x-patrimonio-key") ?? "",
      gatewayKey,
      rotatedGatewayKeyHash,
    ))
  ) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await request.json();
    const ownerKey = String(body.ownerKey ?? "");
    if (!/^[a-f0-9]{64}$/.test(ownerKey)) return json({ error: "invalid_owner_key" }, 400);

    switch (body.operation) {
      case "ensure_workspace":
        await dataRequest("patrimonio_workspaces", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ owner_key: ownerKey }),
        });
        return json({ data: null });

      case "load_workspace": {
        const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
        const [workspaces, nuclei, assets, movements] = await Promise.all([
          dataRequest(`patrimonio_workspaces?owner_key=${ownerFilter}&select=revision&limit=1`),
          dataRequest(`patrimonio_nuclei?owner_key=${ownerFilter}&select=id,code,name,location,manager&order=name.asc`),
          dataRequest(`patrimonio_assets?owner_key=${ownerFilter}&select=code,type,nucleus_id,assignee,location,serial,brand_model,acquired_at,acquisition_value,status,notes,created_at&order=updated_at.desc`),
          dataRequest(`patrimonio_movements?owner_key=${ownerFilter}&select=id,asset_code,type,actor,from_label,to_label,note,occurred_at&order=occurred_at.desc`),
        ]);
        return json({ data: { workspaces, nuclei, assets, movements } });
      }

      case "load_imports": {
        const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
        const imports = await dataRequest(
          `patrimonio_import_runs?owner_key=${ownerFilter}&select=id,file_name,row_count,inserted_count,updated_count,rejected_count,warnings,imported_by,created_at&order=created_at.desc&limit=30`,
        );
        return json({ data: imports });
      }

      case "apply_action": {
        const data = await dataRequest("rpc/patrimonio_apply_action", {
          method: "POST",
          body: JSON.stringify({
            p_owner_key: ownerKey,
            p_actor: body.actor,
            p_expected_revision: body.expectedRevision,
            p_action: body.action,
          }),
        });
        return json({ data });
      }

      case "import_assets": {
        const payload = body.payload ?? {};
        const data = await dataRequest("rpc/patrimonio_import_assets", {
          method: "POST",
          body: JSON.stringify({
            p_owner_key: ownerKey,
            p_actor: body.actor,
            p_expected_revision: body.expectedRevision,
            p_file_name: payload.fileName,
            p_nuclei: payload.nuclei,
            p_assets: payload.assets,
            p_rejected_count: payload.rejectedCount,
            p_warnings: payload.warnings,
          }),
        });
        return json({ data });
      }

      default:
        return json({ error: "unsupported_operation" }, 400);
    }
  } catch (error) {
    const status = Number(error?.status ?? 500);
    return json(
      {
        error: "supabase_request_failed",
        message: status >= 500 ? "Falha interna ao acessar o banco." : error?.message,
        code: error?.code ?? null,
      },
      status,
    );
  }
});

async function dataRequest(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      apikey: supabaseSecretKey,
      authorization: `Bearer ${supabaseSecretKey}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(
      JSON.stringify({
        event: "patrimonio_gateway_data_request_failed",
        path: path.split("?")[0],
        status: response.status,
        code: body?.code ?? null,
        message: body?.message ?? "database_error",
      }),
    );
    throw Object.assign(new Error(body?.message ?? "database_error"), {
      status: response.status,
      code: body?.code ?? null,
    });
  }
  return body;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
