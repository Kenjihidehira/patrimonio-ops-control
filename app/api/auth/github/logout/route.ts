import { logoutGitHub } from "@/app/github-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return logoutGitHub(request);
}
