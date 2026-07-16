import { completeGoogleLogin } from "@/app/google-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return completeGoogleLogin(request);
}
