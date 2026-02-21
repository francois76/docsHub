import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";
import { getConfig, getRepoConfig } from "@/lib/config";

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

    const available = await service.isAvailable();
    if (!available) {
      const config = await getConfig();
      const repoConfig = getRepoConfig(repoName, config);
      const hasToken = !!repoConfig.token;
      const isLocal = repoConfig.type === "local";

      let hint: string;
      let errorCode: string;
      if (isLocal) {
        errorCode = "local_path_missing";
        hint = `Chemin local introuvable\u00a0: ${repoConfig.path}`;
      } else if (!hasToken) {
        errorCode = "no_token";
        hint = `Aucun token ${repoConfig.type.toUpperCase()} configuré. Ajoutez \`token\` dans .docshub.yml puis cliquez sur Sync.`;
      } else {
        errorCode = "not_synced";
        hint = "Dépôt non cloné. Cliquez sur Sync.";
      }

      return NextResponse.json({ tree: [], error: errorCode, hint });
    }

    const tree = await service.getDocsTree(branch);
    return NextResponse.json({ tree });
  } catch (error) {
    return NextResponse.json(
      { tree: [], error: "unexpected", hint: String(error) },
      { status: 500 }
    );
  }
}
