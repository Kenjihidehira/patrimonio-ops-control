import { completeCredentialLogin } from "@/app/credential-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return completeCredentialLogin(request);
}
