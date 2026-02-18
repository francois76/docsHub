import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);

  try {
    const service = await getGitService(repoName);
    const branches = await service.listBranches();
    return NextResponse.json({ branches });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
