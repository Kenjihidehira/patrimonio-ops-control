import { Buffer } from "node:buffer";
import { getAuthenticatedUser, loginPagePath } from "@/app/auth";
import {
  getAssetDocumentUrl,
  SupabaseError,
  uploadAssetDocument,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

const APP_PATH = "/demo";
const MAX_FILE_BYTES = 2_500_000;
const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const responseHeaders = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    const body = await request.formData();
    const file = body.get("file");
    const departmentSlug = String(body.get("department") ?? "").trim();
    const assetId = String(body.get("assetId") ?? "").trim();
    const category = String(body.get("category") ?? "other").trim();
    const expectedRevision = Number(body.get("revision"));

    if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: "O arquivo deve possuir no máximo 2,5 MB." },
        { status: 422, headers: responseHeaders },
      );
    }
    if (!allowedMimeTypes.has(file.type)) {
      return Response.json(
        { error: "Formato não permitido. Use PDF, imagem, TXT, DOCX ou XLSX." },
        { status: 415, headers: responseHeaders },
      );
    }
    if (!departmentSlug || !assetId || !Number.isInteger(expectedRevision)) {
      return Response.json(
        { error: "Os dados do anexo estão incompletos." },
        { status: 400, headers: responseHeaders },
      );
    }

    const result = await uploadAssetDocument(
      user.identifier,
      departmentSlug,
      expectedRevision,
      {
        id: crypto.randomUUID(),
        assetId,
        category,
        fileName: safeFileName(file.name),
        mimeType: file.type,
        note: String(body.get("note") ?? "").trim(),
        retentionUntil: String(body.get("retentionUntil") ?? "").trim(),
      },
      Buffer.from(await file.arrayBuffer()).toString("base64"),
    );

    return Response.json(
      { ...result, message: "Documento armazenado com segurança." },
      { headers: responseHeaders },
    );
  } catch (error) {
    return documentError(error, "Não foi possível armazenar o documento.");
  }
}

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return unauthorized();

  try {
    const url = new URL(request.url);
    const departmentSlug = url.searchParams.get("department")?.trim() ?? "";
    const documentId = url.searchParams.get("id")?.trim() ?? "";
    if (!departmentSlug || !documentId) {
      return Response.json(
        { error: "Documento não informado." },
        { status: 400, headers: responseHeaders },
      );
    }
    const document = await getAssetDocumentUrl(
      user.identifier,
      departmentSlug,
      documentId,
    );
    return new Response(null, {
      status: 302,
      headers: {
        ...responseHeaders,
        location: document.url,
        "content-disposition": `inline; filename="${safeFileName(document.fileName)}"`,
      },
    });
  } catch (error) {
    return documentError(error, "Não foi possível abrir o documento.");
  }
}

function unauthorized() {
  return Response.json(
    { error: "Entre novamente para acessar documentos.", signInUrl: loginPagePath(APP_PATH) },
    { status: 401, headers: responseHeaders },
  );
}

function documentError(error: unknown, fallback: string) {
  if (error instanceof SupabaseError && error.code === "40001") {
    return Response.json(
      { error: "Os dados foram alterados em outra sessão. Atualize a tela e tente novamente." },
      { status: 409, headers: responseHeaders },
    );
  }
  if (error instanceof SupabaseError && error.status === 403) {
    return Response.json(
      { error: "Você não possui acesso a este documento." },
      { status: 403, headers: responseHeaders },
    );
  }
  if (error instanceof SupabaseError && error.status === 404) {
    return Response.json(
      { error: "Documento não localizado." },
      { status: 404, headers: responseHeaders },
    );
  }
  console.error("Asset document request failed", error);
  return Response.json({ error: fallback }, { status: 500, headers: responseHeaders });
}

function safeFileName(value: string): string {
  return value
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "_")
    .slice(0, 180)
    || "documento";
}
