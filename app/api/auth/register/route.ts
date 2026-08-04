import { completeAccessRegistration } from "@/app/register-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return completeAccessRegistration(request);
}
