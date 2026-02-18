import { notFound } from "next/navigation";
import { getConfig, getRepoConfig } from "@/lib/config";
import { getGitService } from "@/lib/git-registry";
import { TopBar } from "@/components/layout/TopBar";
import { DocsSidebar } from "@/components/layout/DocsSidebar";
import { ReviewPanel } from "@/components/docs/ReviewPanel";

interface Props {
  params: Promise<{ repo: string; branch: string }>;
  children: React.ReactNode;
}

export default async function BranchLayout({ params, children }: Props) {
  const { repo, branch } = await params;
  const repoName = decodeURIComponent(repo);
  const branchName = decodeURIComponent(branch);

  try {
    const config = await getConfig();
    getRepoConfig(repoName, config); // Validate repo exists
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar currentRepo={repoName} currentBranch={branchName} />
      <div className="flex flex-1 overflow-hidden">
        <DocsSidebar repo={repoName} branch={branchName} />
        <main className="flex-1 overflow-auto">{children}</main>
        <ReviewPanel repo={repoName} branch={branchName} />
      </div>
    </div>
  );
}
