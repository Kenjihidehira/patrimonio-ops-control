import { verifyGatewayRequest } from "./auth.js";

const gatewayKey = Deno.env.get("PATRIMONIO_GATEWAY_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const supabaseSecretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!supabaseUrl || !supabaseSecretKey || !gatewayKey) {
    return json({ error: "gateway_not_configured" }, 500);
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    return json({ error: "unsupported_media_type" }, 415);
  }

  const requestBody = await readRequestBody(request);
  if (requestBody === null) return json({ error: "request_too_large" }, 413);
  const timestamp = request.headers.get("x-patrimonio-timestamp") ?? "";
  const nonce = request.headers.get("x-patrimonio-nonce") ?? "";
  const signature = request.headers.get("x-patrimonio-signature") ?? "";
  const verified = await verifyGatewayRequest({
    secret: gatewayKey,
    timestamp,
    nonce,
    signature,
    body: requestBody,
  });
  if (!verified) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const nonceAccepted = await dataRequest("rpc/patrimonio_consume_gateway_nonce", {
      method: "POST",
      body: JSON.stringify({
        p_nonce: nonce,
        p_expires_at: new Date(Number(timestamp) + 5 * 60 * 1000).toISOString(),
      }),
    });
    if (nonceAccepted !== true) return json({ error: "replayed_request" }, 409);

    const body = JSON.parse(requestBody);
    const operation = String(body.operation ?? "");
    const identifier = normalizeIdentifier(body.identifier);
    if (identifier) await enforceRateLimit(identifier, operation);

    switch (operation) {
      case "check_user_access": {
        if (!identifier) return json({ data: { authorized: false } });
        const user = await loadUser(identifier);
        return json({
          data: {
            authorized: Boolean(user?.active),
            sessionVersion: Number(user?.session_version ?? 0),
          },
        });
      }

      case "load_workspace_context": {
        const access = await resolveDepartmentAccess(identifier, body.departmentSlug);
        const ownerKey = access.active.owner_key;
        await ensureWorkspace(ownerKey);
        const [
          workspace,
          nuclei,
          assets,
          collaborators,
          movements,
          imports,
          transfers,
          users,
          securityEvents,
        ] =
          await Promise.all([
            loadWorkspaceRevision(ownerKey),
            loadNuclei(ownerKey),
            loadAssets(ownerKey),
            loadCollaborators(ownerKey),
            loadMovements(ownerKey),
            loadImports(ownerKey),
            loadDepartmentTransfers(access.active.slug),
            access.isAdmin ? loadUserDirectory() : Promise.resolve([]),
            access.isAdmin ? loadSecurityEvents() : Promise.resolve([]),
          ]);

        return json({
          data: {
            workspace,
            nuclei,
            assets,
            collaborators,
            movements,
            imports,
            transfers,
            securityEvents,
            access: {
              activeDepartment: publicDepartment(access.active),
              departments: access.departments.map(publicDepartment),
              isAdmin: access.isAdmin,
              permissions: access.permissions,
              users,
            },
          },
        });
      }

      case "load_department_nuclei": {
        const access = await resolveDepartmentAccess(identifier, body.departmentSlug);
        const [workspace, nuclei] = await Promise.all([
          loadWorkspaceRevision(access.active.owner_key),
          loadNuclei(access.active.owner_key),
        ]);
        return json({
          data: {
            department: publicDepartment(access.active),
            revision: Number(workspace[0]?.revision ?? 0),
            nuclei,
          },
        });
      }

      case "save_user_access": {
        await requireGlobalAdmin(identifier);
        const targetIdentifier = normalizeIdentifier(body.user?.identifier);
        const departmentSlugs = Array.isArray(body.user?.departmentSlugs)
          ? body.user.departmentSlugs.map(String)
          : [];
        const data = await dataRequest("rpc/patrimonio_save_user_access_v2", {
          method: "POST",
          body: JSON.stringify({
            p_admin_identifier: identifier,
            p_identifier: targetIdentifier,
            p_display_name: String(body.user?.displayName ?? ""),
            p_is_admin: body.user?.isAdmin === true,
            p_active: body.user?.active !== false,
            p_can_write: body.user?.canWrite !== false,
            p_can_import: body.user?.canImport !== false,
            p_can_export: body.user?.canExport !== false,
            p_department_slugs: departmentSlugs,
          }),
        });
        return json({ data });
      }

      case "authorize_operation": {
        const requestedOperation = String(body.requestedOperation ?? "");
        await enforceRateLimit(identifier, `authorize_${requestedOperation}`);
        const data = await authorizeOperation(
          identifier,
          String(body.departmentSlug ?? ""),
          requestedOperation,
        );
        return json({ data });
      }

      case "record_auth_event": {
        const eventType = String(body.eventType ?? "");
        const outcome = String(body.outcome ?? "");
        if (!["login_succeeded", "login_denied", "logout"].includes(eventType)) {
          return json({ error: "unsupported_auth_event" }, 400);
        }
        const data = await dataRequest("rpc/patrimonio_record_security_event", {
          method: "POST",
          body: JSON.stringify({
            p_event_type: eventType,
            p_outcome: outcome,
            p_actor_identifier: identifier || null,
            p_target_identifier: null,
            p_department_slug: null,
            p_metadata: {},
            p_retention_days: 180,
          }),
        });
        return json({ data });
      }

      case "transfer_department_entity": {
        await requireGlobalAdmin(identifier);
        const data = await dataRequest("rpc/patrimonio_transfer_department_entity", {
          method: "POST",
          body: JSON.stringify({
            p_admin_identifier: identifier,
            p_source_department_slug: String(body.sourceDepartmentSlug ?? ""),
            p_target_department_slug: String(body.targetDepartmentSlug ?? ""),
            p_expected_source_revision: body.expectedSourceRevision,
            p_expected_target_revision: body.expectedTargetRevision,
            p_entity_type: String(body.entityType ?? ""),
            p_entity_id: String(body.entityId ?? ""),
            p_target_nucleus_id: String(body.targetNucleusId ?? ""),
            p_target_location: String(body.targetLocation ?? ""),
            p_target_assignee: String(body.targetAssignee ?? ""),
            p_note: String(body.note ?? ""),
          }),
        });
        return json({ data });
      }

      case "apply_action": {
        const access = await resolveDepartmentAccess(identifier, body.departmentSlug);
        await authorizeOperation(identifier, access.active.slug, "write");
        const ownerKey = access.active.owner_key;
        const actor = actorLabel(access.user);
        const data = await dataRequest("rpc/patrimonio_apply_action", {
          method: "POST",
          body: JSON.stringify({
            p_owner_key: ownerKey,
            p_actor: actor,
            p_expected_revision: body.expectedRevision,
            p_action: body.action,
          }),
        });
        return json({ data });
      }

      case "import_assets": {
        const access = await resolveDepartmentAccess(identifier, body.departmentSlug);
        await authorizeOperation(identifier, access.active.slug, "import");
        const ownerKey = access.active.owner_key;
        const actor = actorLabel(access.user);
        const payload = body.payload ?? {};
        const data = await dataRequest("rpc/patrimonio_import_workspace", {
          method: "POST",
          body: JSON.stringify({
            p_owner_key: ownerKey,
            p_actor: actor,
            p_expected_revision: body.expectedRevision,
            p_file_name: payload.fileName,
            p_nuclei: payload.nuclei,
            p_assets: payload.assets,
            p_rejected_count: payload.rejectedCount,
            p_warnings: payload.warnings,
            p_collaborators: payload.collaborators,
          }),
        });
        return json({ data });
      }

      default:
        return json({ error: "unsupported_operation" }, 400);
    }
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "invalid_json" }, 400);
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

async function resolveDepartmentAccess(identifier, requestedSlug) {
  const user = await requireUser(identifier);
  const allDepartments = await dataRequest(
    "patrimonio_departments?active=eq.true&select=slug,name,owner_key&order=name.asc",
  );
  const departments = user.is_admin
    ? allDepartments
    : await allowedDepartments(identifier, allDepartments);

  if (!departments.length) throw httpError("no_department_access", 403, "42501");
  const normalizedRequestedSlug = String(requestedSlug ?? "").trim().toLowerCase();
  if (normalizedRequestedSlug && !slugPattern.test(normalizedRequestedSlug)) {
    throw httpError("invalid_department", 400, "22023");
  }
  const active = normalizedRequestedSlug
    ? departments.find((department) => department.slug === normalizedRequestedSlug)
    : departments[0];
  if (!active) throw httpError("department_not_authorized", 403, "42501");

  return {
    active,
    departments,
    isAdmin: user.is_admin === true,
    user,
    permissions: {
      canWrite: user.is_admin === true || user.can_write === true,
      canImport: user.is_admin === true || user.can_import === true,
      canExport: user.is_admin === true || user.can_export === true,
    },
  };
}

async function allowedDepartments(identifier, allDepartments) {
  const identifierFilter = encodeURIComponent(`eq.${identifier}`);
  const memberships = await dataRequest(
    `patrimonio_department_memberships?user_identifier=${identifierFilter}&select=department_slug`,
  );
  const allowed = new Set(memberships.map((membership) => membership.department_slug));
  return allDepartments.filter((department) => allowed.has(department.slug));
}

async function requireGlobalAdmin(identifier) {
  const user = await requireUser(identifier);
  if (user.is_admin !== true) throw httpError("admin_required", 403, "42501");
  return user;
}

async function requireUser(identifier) {
  if (!identifier) throw httpError("invalid_user_identifier", 400, "22023");
  const user = await loadUser(identifier);
  if (!user?.active) throw httpError("user_not_authorized", 403, "42501");
  return user;
}

async function loadUser(identifier) {
  if (!identifier) return null;
  const filter = encodeURIComponent(`eq.${identifier}`);
  const users = await dataRequest(
    `patrimonio_users?identifier=${filter}&select=identifier,display_name,is_admin,active,can_write,can_import,can_export,session_version&limit=1`,
  );
  return users[0] ?? null;
}

async function loadUserDirectory() {
  const [users, memberships] = await Promise.all([
    dataRequest(
      "patrimonio_users?select=identifier,display_name,is_admin,active,can_write,can_import,can_export,last_login_at&order=display_name.asc,identifier.asc",
    ),
    dataRequest(
      "patrimonio_department_memberships?select=user_identifier,department_slug&order=department_slug.asc",
    ),
  ]);
  const departmentsByUser = new Map();
  for (const membership of memberships) {
    const slugs = departmentsByUser.get(membership.user_identifier) ?? [];
    slugs.push(membership.department_slug);
    departmentsByUser.set(membership.user_identifier, slugs);
  }
  return users.map((user) => ({
    identifier: user.identifier,
    displayName: user.display_name,
    isAdmin: user.is_admin,
    active: user.active,
    canWrite: user.is_admin || user.can_write,
    canImport: user.is_admin || user.can_import,
    canExport: user.is_admin || user.can_export,
    lastLoginAt: user.last_login_at,
    departmentSlugs: departmentsByUser.get(user.identifier) ?? [],
  }));
}

async function ensureWorkspace(ownerKey) {
  await dataRequest("patrimonio_workspaces", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ owner_key: ownerKey }),
  });
}

function loadWorkspaceRevision(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_workspaces?owner_key=${ownerFilter}&select=revision&limit=1`,
  );
}

function loadNuclei(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_nuclei?owner_key=${ownerFilter}&select=id,code,name,location,manager&order=name.asc`,
  );
}

function loadAssets(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_assets?owner_key=${ownerFilter}&select=code,type,nucleus_id,assignee,location,serial,brand_model,acquired_at,acquisition_value,status,notes,created_at&order=updated_at.desc`,
  );
}

function loadCollaborators(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_collaborators?owner_key=${ownerFilter}&select=id,name,nucleus_id&order=name.asc`,
  );
}

function loadMovements(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_movements?owner_key=${ownerFilter}&select=id,asset_code,type,actor,from_label,to_label,note,occurred_at&order=occurred_at.desc`,
  );
}

function loadImports(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_import_runs?owner_key=${ownerFilter}&select=id,file_name,row_count,inserted_count,updated_count,rejected_count,warnings,imported_by,created_at&order=created_at.desc&limit=30`,
  );
}

function loadDepartmentTransfers(departmentSlug) {
  const filter = encodeURIComponent(
    `(source_department_slug.eq.${departmentSlug},target_department_slug.eq.${departmentSlug})`,
  );
  return dataRequest(
    `patrimonio_department_transfers?or=${filter}&select=id,source_department_slug,target_department_slug,entity_type,entity_id,entity_label,asset_codes,actor,note,occurred_at&order=occurred_at.desc&limit=50`,
  );
}

function loadSecurityEvents() {
  return dataRequest(
    "patrimonio_security_events?select=id,event_type,outcome,actor_identifier,target_identifier,department_slug,metadata,occurred_at,expires_at&order=occurred_at.desc&limit=100",
  );
}

function publicDepartment(department) {
  return { slug: department.slug, name: department.name };
}

function normalizeIdentifier(value) {
  const identifier = String(value ?? "").trim().toLowerCase();
  return emailPattern.test(identifier) ? identifier : "";
}

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

async function authorizeOperation(identifier, departmentSlug, operation) {
  if (!identifier) throw httpError("invalid_user_identifier", 400, "22023");
  return dataRequest("rpc/patrimonio_authorize_operation", {
    method: "POST",
    body: JSON.stringify({
      p_identifier: identifier,
      p_department_slug: String(departmentSlug ?? "").trim().toLowerCase(),
      p_operation: String(operation ?? "").trim().toLowerCase(),
    }),
  });
}

async function enforceRateLimit(identifier, operation) {
  const limits = {
    check_user_access: [300, 60],
    load_workspace_context: [240, 60],
    load_department_nuclei: [120, 60],
    apply_action: [60, 60],
    import_assets: [10, 300],
    authorize_operation: [60, 60],
    authorize_export: [10, 300],
    authorize_import: [10, 300],
    authorize_read: [240, 60],
    authorize_write: [60, 60],
    authorize_admin: [30, 60],
    save_user_access: [30, 60],
    transfer_department_entity: [20, 60],
    record_auth_event: [30, 60],
  };
  const [limit, windowSeconds] = limits[operation] ?? [30, 60];
  const allowed = await dataRequest("rpc/patrimonio_consume_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_identifier: identifier,
      p_operation: operation || "unknown",
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }),
  });
  if (allowed !== true) throw httpError("rate_limit_exceeded", 429, "42900");
}

function actorLabel(user) {
  const displayName = String(user?.display_name ?? "").trim();
  return displayName || "Usuário autorizado";
}

async function readRequestBody(request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

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
