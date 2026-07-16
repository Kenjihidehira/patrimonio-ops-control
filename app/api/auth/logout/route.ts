import { logout } from "@/app/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return logout(request);
}
