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
  const filePath = searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Missing `path` parameter" }, { status: 400 });
  }

  try {
    const service = await getGitService(repoName);
    const content = await service.readFile(branch, filePath);
    return NextResponse.json({ content, path: filePath, branch });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 404 });
  }
}
