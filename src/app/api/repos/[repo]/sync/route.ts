import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);

  try {
    const service = await getGitService(repoName);
    await service.sync();
    return NextResponse.json({ success: true, message: "Repository synced" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
