import { verifyGatewayRequest } from "./auth.js";
import { buildAnalyticsSnapshot } from "./analytics.js";

const gatewayKey = Deno.env.get("PATRIMONIO_GATEWAY_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
const supabaseSecretKey = secretKeys.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_REQUEST_BYTES = 5 * 1024 * 1024;
const DATA_PAGE_SIZE = 1_000;
const MAX_DATA_PAGES = 100;
const DOCUMENT_BUCKET = "patrimonio-documents";
const DOCUMENT_MAX_BYTES = 2_500_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationalActionTypes = new Set([
  "create_inventory_campaign",
  "record_inventory_check",
  "complete_inventory_campaign",
  "create_custody_term",
  "respond_custody_term",
  "create_maintenance_order",
  "update_maintenance_order",
  "assign_tracking_tag",
  "record_tracking_event",
]);
const advancedActionTypes = new Set([
  "create_asset_document",
  "delete_asset_document",
  "create_asset_contract",
  "update_asset_contract_status",
  "upsert_asset_accounting",
  "create_asset_kit",
  "dissolve_asset_kit",
  "create_reservation",
  "update_reservation_status",
  "create_offboarding_case",
  "update_offboarding_asset",
  "complete_offboarding_case",
  "create_lifecycle_request",
  "decide_lifecycle_request",
  "create_custom_field",
  "set_asset_custom_value",
  "create_integration",
  "record_integration_event",
  "create_reconciliation_issue",
  "resolve_reconciliation_issue",
  "create_asset_inspection",
  "record_asset_inspection_result",
  "review_asset_inspection",
  "record_inventory_checks_batch",
]);

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
        let workspace = await loadWorkspaceRevision(ownerKey);
        if (!workspace.length) {
          await ensureWorkspace(ownerKey);
          workspace = await loadWorkspaceRevision(ownerKey);
        }
        const revision = Number(workspace[0]?.revision ?? 0);
        const knownRevision = normalizeRevision(body.knownRevision);
        if (knownRevision !== null && knownRevision === revision) {
          return json({
            data: {
              notModified: true,
              revision,
            },
          });
        }
        const canViewFinancialData = access.permissions.canViewFinancialData === true;
        if (canViewFinancialData) {
          await authorizeOperation(identifier, access.active.slug, "financial");
        }

        const [
          nuclei,
          assets,
          assetAliases,
          collaborators,
          movements,
          imports,
          transfers,
          users,
          securityEvents,
          operational,
          advanced,
        ] =
          await Promise.all([
            loadNuclei(ownerKey),
            loadAssets(ownerKey, canViewFinancialData),
            loadAssetAliases(ownerKey),
            loadCollaborators(ownerKey),
            loadMovements(ownerKey),
            loadImports(ownerKey),
            loadDepartmentTransfers(access.active.slug),
            access.isAdmin ? loadUserDirectory() : Promise.resolve([]),
            access.isAdmin ? loadSecurityEvents() : Promise.resolve([]),
            loadOperationalData(ownerKey),
            loadAdvancedData(ownerKey, identifier, access.isAdmin, canViewFinancialData),
          ]);
        const analytics = buildAnalyticsSnapshot({
          assets,
          nuclei,
          movements,
          operational,
        });

        return json({
          data: {
            workspace,
            notModified: false,
            nuclei,
            assets,
            assetAliases,
            collaborators,
            movements,
            imports,
            transfers,
            securityEvents,
            analytics,
            ...operational,
            ...advanced,
            access: {
              activeDepartment: publicDepartment(access.active),
              departments: access.departments.map(publicDepartment),
              isAdmin: access.isAdmin,
              isAuditor: access.isAuditor,
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
        const data = await dataRequest("rpc/patrimonio_save_user_access_v5", {
          method: "POST",
          body: JSON.stringify({
            p_admin_identifier: identifier,
            p_identifier: targetIdentifier,
            p_display_name: String(body.user?.displayName ?? ""),
            p_is_admin: body.user?.isAdmin === true,
            p_is_auditor: body.user?.isAuditor === true,
            p_active: body.user?.active !== false,
            p_can_write: body.user?.canWrite !== false,
            p_can_import: body.user?.canImport !== false,
            p_can_export: body.user?.canExport !== false,
            p_can_view_financial_data: body.user?.canViewFinancialData === true,
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
        const data = await dataRequest("rpc/patrimonio_transfer_department_entity_v2", {
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
        const actionType = String(body.action?.type ?? "");
        await enforceFinancialActionPermission(
          ownerKey,
          body.action,
          access.isAdmin,
        );
        const identityAwareAction = operationalActionTypes.has(actionType)
          || advancedActionTypes.has(actionType);
        const rpcName = advancedActionTypes.has(actionType)
          ? "rpc/patrimonio_apply_advanced_action"
          : operationalActionTypes.has(actionType)
            ? "rpc/patrimonio_apply_operational_action"
            : "rpc/patrimonio_apply_action";
        const rpcBody = identityAwareAction
          ? {
              p_owner_key: ownerKey,
              p_actor: actor,
              p_actor_identifier: identifier,
              p_is_admin: access.isAdmin,
              p_expected_revision: body.expectedRevision,
              p_action: body.action,
            }
          : {
              p_owner_key: ownerKey,
              p_actor: actor,
              p_expected_revision: body.expectedRevision,
              p_action: body.action,
            };
        const data = await dataRequest(rpcName, {
          method: "POST",
          body: JSON.stringify(rpcBody),
        });
        return json({ data });
      }

      case "upload_asset_document": {
        const access = await resolveDepartmentAccess(identifier, body.departmentSlug);
        await authorizeOperation(identifier, access.active.slug, "write");
        const ownerKey = access.active.owner_key;
        const actor = actorLabel(access.user);
        const document = body.document ?? {};
        const documentId = String(document.id ?? "").trim();
        const assetCode = String(document.assetId ?? "").trim();
        const mimeType = String(document.mimeType ?? "").trim().toLowerCase();
        const category = String(document.category ?? "").trim().toLowerCase();
        const containsFinancialData = document.containsFinancialData === true
          || ["invoice", "contract", "disposal"].includes(category);
        if (containsFinancialData && !access.isAdmin) {
          throw httpError("financial_data_permission_required", 403, "42501");
        }
        const fileBytes = decodeBase64File(String(body.contentBase64 ?? ""));
        const extension = documentExtension(mimeType);
        if (!uuidPattern.test(documentId) || !assetCode || !extension || !fileBytes.length) {
          return json({ error: "invalid_asset_document" }, 400);
        }
        const storagePath = `${ownerKey}/${assetCode}/${documentId}.${extension}`;
        const checksumSha256 = await sha256Hex(fileBytes);
        await storageRequest(
          `object/${DOCUMENT_BUCKET}/${encodeStoragePath(storagePath)}`,
          {
            method: "POST",
            headers: {
              "content-type": mimeType,
              "x-upsert": "false",
              "cache-control": "private, max-age=0, no-store",
            },
            body: fileBytes,
          },
        );
        try {
          const revision = await dataRequest("rpc/patrimonio_apply_advanced_action", {
            method: "POST",
            body: JSON.stringify({
              p_owner_key: ownerKey,
              p_actor: actor,
              p_actor_identifier: identifier,
              p_is_admin: access.isAdmin,
              p_expected_revision: body.expectedRevision,
              p_action: {
                type: "create_asset_document",
                document: {
                  ...document,
                  id: documentId,
                  assetId: assetCode,
                  mimeType,
                  byteSize: fileBytes.length,
                  storagePath,
                  checksumSha256,
                  containsFinancialData,
                },
              },
            }),
          });
          return json({ data: { id: documentId, revision } });
        } catch (error) {
          await storageRequest(
            `object/${DOCUMENT_BUCKET}/${encodeStoragePath(storagePath)}`,
            { method: "DELETE" },
          ).catch(() => undefined);
          throw error;
        }
      }

      case "get_asset_document_url": {
        const access = await resolveDepartmentAccess(identifier, body.departmentSlug);
        await authorizeOperation(identifier, access.active.slug, "read");
        const ownerFilter = encodeURIComponent(`eq.${access.active.owner_key}`);
        const idFilter = encodeURIComponent(`eq.${String(body.documentId ?? "").trim()}`);
        const documents = await dataRequest(
          `patrimonio_asset_documents?owner_key=${ownerFilter}&id=${idFilter}&deleted_at=is.null&select=storage_path,file_name,contains_financial_data&limit=1`,
        );
        const document = documents[0];
        if (!document) throw httpError("asset_document_not_found", 404, "P0002");
        if (document.contains_financial_data === true && !access.permissions.canViewFinancialData) {
          await recordFinancialDocumentEvent(
            "financial_document_access_denied",
            "denied",
            identifier,
            access.active.slug,
            String(body.documentId ?? ""),
          );
          throw httpError("financial_data_permission_required", 403, "42501");
        }
        if (document.contains_financial_data === true) {
          await recordFinancialDocumentEvent(
            "financial_document_opened",
            "success",
            identifier,
            access.active.slug,
            String(body.documentId ?? ""),
          );
        }
        const signed = await storageRequest(
          `object/sign/${DOCUMENT_BUCKET}/${encodeStoragePath(String(document.storage_path))}`,
          { method: "POST", body: JSON.stringify({ expiresIn: 60 }) },
        );
        const signedPath = String(signed?.signedURL ?? signed?.signedUrl ?? "");
        if (!signedPath) throw httpError("document_signing_failed", 502, "storage_error");
        return json({
          data: {
            url: new URL(signedPath, supabaseUrl).toString(),
            fileName: String(document.file_name),
          },
        });
      }

      case "import_assets": {
        const access = await resolveDepartmentAccess(identifier, body.departmentSlug);
        await authorizeOperation(identifier, access.active.slug, "import");
        const ownerKey = access.active.owner_key;
        const actor = actorLabel(access.user);
        const payload = body.payload ?? {};
        if (
          !access.isAdmin
          && Array.isArray(payload.assets)
          && payload.assets.some(hasFinancialAssetPayload)
        ) {
          throw httpError("financial_data_permission_required", 403, "42501");
        }
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
  const departments = user.is_admin || user.is_auditor
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
    isAuditor: user.is_auditor === true,
    user,
    permissions: {
      canWrite: user.is_admin === true || (user.is_auditor !== true && user.can_write === true),
      canImport: user.is_admin === true || (user.is_auditor !== true && user.can_import === true),
      canExport: user.is_admin === true || user.can_export === true,
      canViewFinancialData: user.is_admin === true || user.can_view_financial_data === true,
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
    `patrimonio_users?identifier=${filter}&select=identifier,display_name,is_admin,is_auditor,active,can_write,can_import,can_export,can_view_financial_data,session_version&limit=1`,
  );
  return users[0] ?? null;
}

async function loadUserDirectory() {
  const [users, memberships] = await Promise.all([
    dataRequest(
      "patrimonio_users?select=identifier,display_name,is_admin,is_auditor,active,can_write,can_import,can_export,can_view_financial_data,last_login_at&order=display_name.asc,identifier.asc",
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
    isAuditor: user.is_auditor,
    active: user.active,
    canWrite: user.is_admin || (!user.is_auditor && user.can_write),
    canImport: user.is_admin || (!user.is_auditor && user.can_import),
    canExport: user.is_admin || user.can_export,
    canViewFinancialData: user.is_admin === true || user.can_view_financial_data === true,
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

function loadAssets(ownerKey, canViewFinancialData) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  const financialFields = canViewFinancialData
    ? ",acquisition_value,operation_value,invoice_number"
    : "";
  return dataRequestAll(
    `patrimonio_assets?owner_key=${ownerFilter}&select=code,type,nucleus_id,assignee,location,serial,brand_model,acquired_at,status,notes,source_system,source_fingerprint,base_code,incorporation,source_identifier,source_description,asset_group,branch_code,disposed_at,source_row,created_at${financialFields}&order=updated_at.desc,code.asc`,
  );
}

function loadAssetAliases(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_asset_aliases?owner_key=${ownerFilter}&select=source_code,asset_code`,
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
  return dataRequestAll(
    `patrimonio_movements?owner_key=${ownerFilter}&select=id,asset_code,type,actor,from_label,to_label,note,occurred_at&order=occurred_at.desc`,
  );
}

function loadImports(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  return dataRequest(
    `patrimonio_import_runs?owner_key=${ownerFilter}&select=id,file_name,row_count,inserted_count,updated_count,rejected_count,warnings,imported_by,created_at&order=created_at.desc&limit=30`,
  );
}

async function loadOperationalData(ownerKey) {
  const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
  const inventoryCampaigns = await dataRequestAll(
    `patrimonio_inventory_campaigns?owner_key=${ownerFilter}&select=id,name,nucleus_id,status,due_at,target_count,checked_count,issue_count,created_by,created_at,completed_at,updated_at&order=created_at.desc`,
  );
  const activeCampaignIds = inventoryCampaigns
    .filter((campaign) => campaign.status === "active")
    .map((campaign) => String(campaign.id));
  const campaignFilter = activeCampaignIds.length
    ? encodeURIComponent(`in.(${activeCampaignIds.join(",")})`)
    : null;

  const [inventoryCampaignAssets, custodyTerms, maintenanceOrders, trackingTags, trackingEvents] =
    await Promise.all([
      campaignFilter
        ? dataRequestAll(
            `patrimonio_inventory_campaign_assets?owner_key=${ownerFilter}&campaign_id=${campaignFilter}&select=campaign_id,asset_code,result,observed_location,note,checked_by,checked_at&order=asset_code.asc`,
          )
        : Promise.resolve([]),
      dataRequestAll(
        `patrimonio_custody_terms?owner_key=${ownerFilter}&select=id,asset_code,assignee,assignee_identifier,status,note,issued_by,issued_at,responded_by,responded_at,response_note&order=issued_at.desc`,
      ),
      dataRequestAll(
        `patrimonio_maintenance_orders?owner_key=${ownerFilter}&select=id,asset_code,kind,priority,status,title,notes,due_at,created_by,created_at,updated_by,updated_at,completed_at&order=updated_at.desc`,
      ),
      dataRequestAll(
        `patrimonio_tracking_tags?owner_key=${ownerFilter}&active=eq.true&select=id,asset_code,technology,tag_id,active,installed_by,installed_at,updated_at&order=updated_at.desc`,
      ),
      dataRequest(
        `patrimonio_tracking_events?owner_key=${ownerFilter}&select=id,asset_code,technology,tag_id,reader_id,location,latitude,longitude,accuracy_meters,confidence,battery_percent,note,observed_by,observed_at&order=observed_at.desc&limit=100`,
      ),
    ]);

  return {
    inventoryCampaigns,
    inventoryCampaignAssets,
    custodyTerms,
    maintenanceOrders,
    trackingTags,
    trackingEvents,
  };
}

async function loadAdvancedData(ownerKey, actorIdentifier, isAdmin, canViewFinancialData) {
  const [data, dataSourcePolicies] = await Promise.all([
    dataRequest("rpc/patrimonio_load_advanced_context", {
      method: "POST",
      body: JSON.stringify({
        p_owner_key: ownerKey,
        p_actor_identifier: actorIdentifier,
        p_is_admin: isAdmin === true,
        p_can_view_financial_data: canViewFinancialData === true,
      }),
    }),
    isAdmin === true
      ? dataRequest(
          "patrimonio_data_source_policies?select=domain_key,domain_label,master_system,write_policy,activation_status,owned_fields,scope_note&order=sort_order.asc",
        )
      : Promise.resolve([]),
  ]);
  return {
    ...(data && typeof data === "object" ? data : {}),
    dataSourcePolicies,
  };
}

async function enforceFinancialActionPermission(ownerKey, action, canManageFinancialData) {
  if (canManageFinancialData === true || !action || typeof action !== "object") return;
  const actionType = String(action.type ?? "");
  if (actionType === "upsert_asset_accounting") {
    throw httpError("financial_data_permission_required", 403, "42501");
  }
  if (
    actionType === "create_asset"
    && hasProtectedFinancialValue(action.asset?.value)
  ) {
    throw httpError("financial_data_permission_required", 403, "42501");
  }
  if (
    actionType === "create_asset_contract"
    && hasProtectedFinancialValue(action.contract?.monthlyCost)
  ) {
    throw httpError("financial_data_permission_required", 403, "42501");
  }
  if (
    actionType === "create_lifecycle_request"
    && hasProtectedFinancialValue(action.request?.estimatedCost)
  ) {
    throw httpError("financial_data_permission_required", 403, "42501");
  }
  if (
    actionType === "create_asset_document"
    && (
      action.document?.containsFinancialData === true
      || ["invoice", "contract", "disposal"].includes(
        String(action.document?.category ?? "").trim().toLowerCase(),
      )
    )
  ) {
    throw httpError("financial_data_permission_required", 403, "42501");
  }
  if (actionType === "delete_asset_document") {
    const documentId = String(action.documentId ?? "").trim();
    if (!uuidPattern.test(documentId)) return;
    const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
    const idFilter = encodeURIComponent(`eq.${documentId}`);
    const documents = await dataRequest(
      `patrimonio_asset_documents?owner_key=${ownerFilter}&id=${idFilter}&deleted_at=is.null&select=contains_financial_data&limit=1`,
    );
    if (documents[0]?.contains_financial_data === true) {
      throw httpError("financial_data_permission_required", 403, "42501");
    }
  }
  if (actionType === "set_asset_custom_value") {
    const fieldId = String(action.fieldId ?? "").trim();
    if (!uuidPattern.test(fieldId)) return;
    const ownerFilter = encodeURIComponent(`eq.${ownerKey}`);
    const idFilter = encodeURIComponent(`eq.${fieldId}`);
    const fields = await dataRequest(
      `patrimonio_custom_fields?owner_key=${ownerFilter}&id=${idFilter}&active=eq.true&select=contains_financial_data&limit=1`,
    );
    if (fields[0]?.contains_financial_data === true) {
      throw httpError("financial_data_permission_required", 403, "42501");
    }
  }
}

function hasFinancialAssetPayload(asset) {
  return asset && typeof asset === "object" && (
    hasProtectedFinancialValue(asset.value)
    || hasProtectedFinancialValue(asset.acquisitionValue)
    || hasProtectedFinancialValue(asset.operationValue)
    || String(asset.invoiceNumber ?? "").trim().length > 0
  );
}

function hasProtectedFinancialValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") return false;
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed !== 0;
}

function loadDepartmentTransfers(departmentSlug) {
  const filter = encodeURIComponent(
    `(source_department_slug.eq.${departmentSlug},target_department_slug.eq.${departmentSlug})`,
  );
  return dataRequest(
    `patrimonio_department_transfers?or=${filter}&select=id,source_department_slug,target_department_slug,entity_type,entity_id,entity_label,asset_codes,actor,note,occurred_at&order=occurred_at.desc&limit=50`,
  );
}

function recordFinancialDocumentEvent(eventType, outcome, identifier, departmentSlug, documentId) {
  return dataRequest("rpc/patrimonio_record_security_event", {
    method: "POST",
    body: JSON.stringify({
      p_event_type: eventType,
      p_outcome: outcome,
      p_actor_identifier: identifier,
      p_target_identifier: null,
      p_department_slug: departmentSlug,
      p_metadata: { documentId },
      p_retention_days: 1825,
    }),
  });
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

function normalizeRevision(value) {
  if (value === null || value === undefined || value === "") return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function httpError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

async function authorizeOperation(identifier, departmentSlug, operation) {
  if (!identifier) throw httpError("invalid_user_identifier", 400, "22023");
  const normalizedDepartment = String(departmentSlug ?? "").trim().toLowerCase();
  const normalizedOperation = String(operation ?? "").trim().toLowerCase();
  try {
    return await dataRequest("rpc/patrimonio_authorize_operation", {
      method: "POST",
      body: JSON.stringify({
        p_identifier: identifier,
        p_department_slug: normalizedDepartment,
        p_operation: normalizedOperation,
      }),
    });
  } catch (error) {
    if (error?.message === "operation_not_allowed") {
      await dataRequest("rpc/patrimonio_record_security_event", {
        method: "POST",
        body: JSON.stringify({
          p_event_type: "operation_denied",
          p_outcome: "denied",
          p_actor_identifier: identifier,
          p_target_identifier: null,
          p_department_slug: normalizedDepartment || null,
          p_metadata: { operation: normalizedOperation },
          p_retention_days: 730,
        }),
      }).catch(() => undefined);
    }
    throw error;
  }
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
    authorize_export_financial: [5, 300],
    authorize_import: [10, 300],
    authorize_read: [240, 60],
    authorize_write: [60, 60],
    authorize_admin: [30, 60],
    authorize_financial: [60, 60],
    save_user_access: [30, 60],
    transfer_department_entity: [20, 60],
    record_auth_event: [30, 60],
    upload_asset_document: [20, 300],
    get_asset_document_url: [120, 60],
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

async function storageRequest(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/storage/v1/${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      apikey: supabaseSecretKey,
      authorization: `Bearer ${supabaseSecretKey}`,
      ...((typeof init.body === "string") ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw Object.assign(new Error(body?.message ?? body?.error ?? "storage_error"), {
      status: response.status,
      code: body?.code ?? "storage_error",
    });
  }
  return body;
}

function decodeBase64File(value) {
  if (!value || value.length > Math.ceil(DOCUMENT_MAX_BYTES * 4 / 3) + 8) {
    throw httpError("asset_document_too_large", 413, "22023");
  }
  try {
    const binary = atob(value);
    if (binary.length < 1 || binary.length > DOCUMENT_MAX_BYTES) {
      throw httpError("asset_document_too_large", 413, "22023");
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch (error) {
    if (error?.status) throw error;
    throw httpError("invalid_asset_document_content", 400, "22023");
  }
}

function documentExtension(mimeType) {
  return {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "text/plain": "txt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  }[mimeType] ?? null;
}

function encodeStoragePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

async function sha256Hex(value) {
  const hash = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function dataRequestAll(path, pageSize = DATA_PAGE_SIZE) {
  const rows = [];
  for (let page = 0; page < MAX_DATA_PAGES; page += 1) {
    const from = page * pageSize;
    const batch = await dataRequest(path, {
      headers: {
        "Range-Unit": "items",
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!Array.isArray(batch)) {
      throw httpError("invalid_paginated_response", 500, "PGRST102");
    }
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw httpError("data_page_limit_exceeded", 500, "54000");
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
