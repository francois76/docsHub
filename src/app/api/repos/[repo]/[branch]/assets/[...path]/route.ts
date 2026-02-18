import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ repo: string; branch: string; path: string[] }> }
) {
  const { repo, branch, path: pathSegments } = await params;
  const repoName = decodeURIComponent(repo);
  const branchName = decodeURIComponent(branch);
  const filePath = pathSegments.map(decodeURIComponent).join("/");

  try {
    const service = await getGitService(repoName);
    const buffer = await service.readFileBuffer(branchName, filePath);

    // Determine content type from extension
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const contentTypeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
      pdf: "application/pdf",
      ico: "image/x-icon",
    };
    const contentType = contentTypeMap[ext] ?? "application/octet-stream";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 404 });
  }
}
