import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";
import { extractHeadings } from "@/lib/markdown";
import type { HeadingInfo } from "@/types/git";

// Only parse markdown-like files
const MARKDOWN_FILE_RE = /\.(md|mdx|markdown)$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ repo: string }> }
): Promise<Response> {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get("branch") ?? "main";
  const pathsRaw = searchParams.get("paths") ?? "";

  const paths = pathsRaw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && MARKDOWN_FILE_RE.test(p));

  if (paths.length === 0) {
    return NextResponse.json({ headings: {} });
  }

  try {
    const service = await getGitService(repoName);

    // Fetch all files in parallel, ignore errors for individual files
    const entries = await Promise.all(
      paths.map(async (filePath): Promise<[string, HeadingInfo[]]> => {
        try {
          const content = await service.readFile(branch, filePath);
          return [filePath, extractHeadings(content)];
        } catch {
          return [filePath, []];
        }
      })
    );

    const headings: Record<string, HeadingInfo[]> = Object.fromEntries(entries);
    return NextResponse.json({ headings });
  } catch (error) {
    return NextResponse.json(
      { headings: {}, error: String(error) },
      { status: 500 }
    );
  }
}
