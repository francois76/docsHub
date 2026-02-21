import { NextResponse } from "next/server";
import { getGitService } from "@/lib/git-registry";
import { getConfig, getRepoConfig } from "@/lib/config";

function friendlySyncError(raw: string, hasToken: boolean, repoType: string): string {
  const s = raw.toLowerCase();
  if (s.includes("authentication failed") || s.includes("could not read username") || s.includes("invalid credentials") || s.includes("401")) {
    if (!hasToken) {
      return `Authentification échouée — aucun token ${repoType.toUpperCase()} n'est configuré. Ajoutez \`token: <votre_token>\` dans .docshub.yml.`;
    }
    return `Authentification échouée — le token ${repoType.toUpperCase()} configuré est invalide ou expiré.`;
  }
  if (s.includes("repository not found") || s.includes("not found") || s.includes("404")) {
    return `Dépôt introuvable — vérifiez l'URL configurée dans .docshub.yml.`;
  }
  if (s.includes("permission denied") || s.includes("403") || s.includes("access denied")) {
    return `Accès refusé — le token n'a pas les droits suffisants sur ce dépôt.`;
  }
  if (s.includes("could not resolve host") || s.includes("network") || s.includes("enotfound")) {
    return `Impossible de joindre le serveur — vérifiez votre connexion réseau.`;
  }
  return raw;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ repo: string }> }
) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);

  try {
    const config = await getConfig();
    const repoConfig = getRepoConfig(repoName, config);
    const service = await getGitService(repoName);
    await service.sync();
    return NextResponse.json({ success: true, message: "Repository synced" });
  } catch (error) {
    const rawMessage = String(error);
    let repoType = "git";
    let hasToken = false;
    try {
      const config = await getConfig();
      const repoConfig = getRepoConfig(repoName, config);
      repoType = repoConfig.type;
      hasToken = !!repoConfig.token;
    } catch { /* ignore */ }
    const friendly = friendlySyncError(rawMessage, hasToken, repoType);
    return NextResponse.json(
      { error: friendly, rawError: rawMessage },
      { status: 500 }
    );
  }
}
