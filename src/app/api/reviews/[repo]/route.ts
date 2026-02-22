import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getConfig, getRepoConfig } from "@/lib/config";
import { createReviewProvider } from "@/lib/review";

/** Fields included in every GET response so the client knows the repo context */
function repoMeta(repoConfig: { type: string; authMode?: string; defaultBranch?: string }) {
  return {
    authMode: repoConfig.authMode ?? "token",
    repoType: repoConfig.type,
    defaultBranch: repoConfig.defaultBranch ?? "main",
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);
  const { searchParams } = new URL(req.url);
  const branch = searchParams.get("branch");

  if (!branch) {
    return NextResponse.json({ error: "Missing `branch` parameter" }, { status: 400 });
  }

  try {
    const [config, session] = await Promise.all([
      getConfig(),
      getServerSession(authOptions),
    ]);

    const repoConfig = getRepoConfig(repoName, config);
    const meta = repoMeta(repoConfig);
    const provider = createReviewProvider(
      repoConfig,
      (session as any)?.accessToken,
      (session as any)?.provider,
      session?.user?.name ?? undefined
    );

    if (!provider) {
      return NextResponse.json({ pr: null, comments: [], canReview: false, ...meta });
    }

    // Determine the full repo path for API calls (e.g. "owner/repo")
    const apiRepo = repoConfig.url
      ? extractRepoPath(repoConfig.url, repoConfig.type)
      : repoName;

    const pr = await provider.findPR(apiRepo, branch);
    if (!pr) {
      // Provider exists (token is valid) but no PR yet → canReview: true so user can create one
      return NextResponse.json({ pr: null, comments: [], canReview: true, ...meta });
    }

    const comments = await provider.listComments(apiRepo, pr.number);
    return NextResponse.json({ pr, comments, canReview: true, ...meta });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);
  const body = await req.json();
  const { prNumber, action, comment, filePath, line, commitSha } = body;

  try {
    const [config, session] = await Promise.all([
      getConfig(),
      getServerSession(authOptions),
    ]);

    const repoConfig = getRepoConfig(repoName, config);
    const provider = createReviewProvider(
      repoConfig,
      (session as any)?.accessToken,
      (session as any)?.provider,
      session?.user?.name ?? undefined
    );

    if (!provider) {
      return NextResponse.json({ error: "No review provider available" }, { status: 400 });
    }

    const apiRepo = repoConfig.url
      ? extractRepoPath(repoConfig.url, repoConfig.type)
      : repoName;

    // ── Create a new PR ──
    if (action === "create_pr") {
      const { branch: headBranch, baseBranch, title } = body;
      if (!headBranch || !baseBranch) {
        return NextResponse.json({ error: "Missing branch parameters" }, { status: 400 });
      }
      const pr = await provider.createPR(apiRepo, headBranch, baseBranch, title);
      return NextResponse.json({ pr });
    }

    // ── Comment (global or inline) ──
    if (action === "comment") {
      if (filePath && line) {
        const result = await provider.addInlineComment(
          apiRepo,
          prNumber,
          filePath,
          line,
          comment,
          commitSha
        );
        return NextResponse.json(result);
      } else {
        const result = await provider.addComment(apiRepo, prNumber, comment);
        return NextResponse.json(result);
      }
    }

    // ── Approve / Request changes ──
    if (["approve", "request_changes"].includes(action)) {
      await provider.submitReview(apiRepo, prNumber, {
        action,
        body: comment,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

function extractRepoPath(url: string, type: string): string {
  // Extract "owner/repo" from clone URL
  // https://github.com/owner/repo.git -> owner/repo
  // git@github.com:owner/repo.git -> owner/repo
  const cleaned = url.replace(/\.git$/, "");
  const match = cleaned.match(/[/:]([\w-]+\/[\w.-]+)$/);
  return match ? match[1] : url;
}
