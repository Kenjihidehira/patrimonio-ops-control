import { startGoogleLogin } from "@/app/google-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return startGoogleLogin(request);
}
