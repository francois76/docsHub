import { redirect } from "next/navigation";
import { getConfig, getRepoConfig } from "@/lib/config";

interface Props {
  params: Promise<{ repo: string }>;
}

export default async function RepoIndexPage({ params }: Props) {
  const { repo } = await params;
  const repoName = decodeURIComponent(repo);

  const config = await getConfig();
  const repoConfig = getRepoConfig(repoName, config);
  const defaultBranch = repoConfig.defaultBranch ?? "main";

  redirect(`/docs/${encodeURIComponent(repoName)}/${encodeURIComponent(defaultBranch)}`);
}
