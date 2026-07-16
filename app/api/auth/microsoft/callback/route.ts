import { completeMicrosoftLogin } from "@/app/microsoft-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return completeMicrosoftLogin(request);
}
