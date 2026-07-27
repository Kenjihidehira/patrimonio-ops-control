import type {
  Dashboard,
  Department,
  ImportPreview,
  InventoryFilters,
  MutationAction,
} from "./types";

export class ApiError extends Error {
  status: number;
  signInUrl: string | null;

  constructor(message: string, status: number, signInUrl: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.signInUrl = signInUrl;
  }
}

type ApiMessage = {
  error?: string;
  message?: string;
  signInUrl?: string;
};

export async function fetchDashboard(
  filters: InventoryFilters,
  departmentSlug: string | null,
  signal?: AbortSignal,
): Promise<Dashboard> {
  const query = new URLSearchParams({
    search: filters.search,
    type: filters.type,
    status: filters.status,
    nucleus: filters.nucleus,
    sort: filters.sort,
  });
  if (departmentSlug) query.set("department", departmentSlug);
  const response = await fetch(`/api/state?${query}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal,
  });
  return readJson<Dashboard>(response, "Não foi possível carregar o controle patrimonial.");
}

export async function mutateDashboard(
  action: MutationAction,
  expectedRevision: number,
  departmentSlug: string,
): Promise<{ message: string }> {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...action, expectedRevision, departmentSlug }),
  });
  return readJson<{ message: string }>(
    response,
    "Não foi possível concluir a operação.",
  );
}

export async function previewSpreadsheet(
  file: File,
  departmentSlug: string,
): Promise<ImportPreview> {
  return sendSpreadsheet(file, "preview", null, departmentSlug);
}

export async function importSpreadsheet(
  file: File,
  expectedRevision: number,
  departmentSlug: string,
): Promise<{ message: string }> {
  return sendSpreadsheet(file, "commit", expectedRevision, departmentSlug);
}

export async function downloadExport(departmentSlug: string): Promise<string> {
  const query = new URLSearchParams({ department: departmentSlug });
  const response = await fetch(`/api/export?${query}`, {
    headers: {
      accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
  if (!response.ok) {
    const body = await safeJson<ApiMessage>(response);
    throw new ApiError(
      body?.error ?? "Não foi possível exportar o inventário.",
      response.status,
      body?.signInUrl ?? null,
    );
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "patrimonios.xlsx";
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
  return fileName;
}

export async function fetchDepartmentNuclei(departmentSlug: string): Promise<{
  department: Department;
  revision: number;
  nuclei: Array<{
    id: string;
    code: string;
    name: string;
    location: string;
    manager: string;
  }>;
}> {
  const query = new URLSearchParams({ department: departmentSlug });
  const response = await fetch(`/api/departments?${query}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  return readJson(response, "Não foi possível carregar os núcleos de destino.");
}

export async function saveDepartmentUser(user: {
  identifier: string;
  displayName: string;
  isAdmin: boolean;
  active: boolean;
  canWrite: boolean;
  canImport: boolean;
  canExport: boolean;
  departmentSlugs: string[];
}): Promise<{ message: string }> {
  const response = await fetch("/api/departments", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "save_user_access", user }),
  });
  return readJson(response, "Não foi possível atualizar o acesso do usuário.");
}

export async function transferDepartment(input: {
  sourceDepartmentSlug: string;
  targetDepartmentSlug: string;
  expectedSourceRevision: number;
  expectedTargetRevision: number;
  entityType: "asset" | "collaborator";
  entityId: string;
  targetNucleusId: string;
  targetLocation: string;
  targetAssignee: string;
  note: string;
}): Promise<{
  sourceRevision: number;
  targetRevision: number;
  transferredAssets: number;
  targetDepartmentSlug: string;
  message: string;
}> {
  const response = await fetch("/api/departments", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "transfer_department_entity", ...input }),
  });
  return readJson(response, "Não foi possível transferir entre departamentos.");
}

async function sendSpreadsheet<T>(
  file: File,
  mode: "preview" | "commit",
  expectedRevision: number | null,
  departmentSlug: string,
): Promise<T> {
  const body = new FormData();
  body.set("file", file);
  body.set("mode", mode);
  body.set("department", departmentSlug);
  if (expectedRevision !== null) body.set("revision", String(expectedRevision));

  const response = await fetch("/api/import", { method: "POST", body });
  return readJson<T>(response, "Não foi possível processar a planilha.");
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await safeJson<ApiMessage & T>(response);
  if (!response.ok) {
    throw new ApiError(
      body?.error ?? fallback,
      response.status,
      body?.signInUrl ?? null,
    );
  }
  if (!body) throw new ApiError(fallback, response.status);
  return body;
}

async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
