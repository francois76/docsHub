import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";
import { getConfig, getRepoConfig } from "@/lib/config";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);

  try {
    const service = await getGitService(repoName);

    // Check if the repo is available (cloned / accessible) before listing branches
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
        hint = `Le chemin local "${repoConfig.path}" est introuvable ou n'est pas un dépôt Git.`;
      } else if (!hasToken) {
        errorCode = "no_token";
        hint = `Aucun token configuré pour ce dépôt ${repoConfig.type.toUpperCase()}. Ajoutez un champ \`token\` dans .docshub.yml puis cliquez sur Sync.`;
      } else {
        errorCode = "not_synced";
        hint = `Le dépôt n'a pas encore été cloné. Cliquez sur Sync pour le cloner.`;
      }

      return NextResponse.json({ branches: [], error: errorCode, hint });
    }

    const branches = await service.listBranches();
    return NextResponse.json({ branches });
  } catch (error) {
    return NextResponse.json(
      { branches: [], error: "unexpected", hint: String(error) },
      { status: 500 }
    );
  }
}
