import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get("branch") ?? "main";

  try {
    const service = await getGitService(repoName);
    const tree = await service.getDocsTree(branch);
    return NextResponse.json({ tree });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
