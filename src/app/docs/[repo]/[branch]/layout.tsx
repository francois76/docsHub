import { notFound } from "next/navigation";
import { getConfig, getRepoConfig } from "@/lib/config";
import { TopBar } from "@/components/layout/TopBar";
import { DocsSidebar } from "@/components/layout/DocsSidebar";
import { ReviewProvider } from "@/components/docs/ReviewContext";
import { ReviewBar } from "@/components/docs/ReviewBar";

interface Props {
  params: Promise<{ repo: string; branch: string }>;
  children: React.ReactNode;
}

export default async function BranchLayout({ params, children }: Props) {
  const { repo, branch } = await params;
  const repoName = decodeURIComponent(repo);
  const branchName = decodeURIComponent(branch);

  let repoType = "local";
  let authMode = "token";
  let defaultBranch = "main";

  try {
    const config = await getConfig();
    const repoConfig = getRepoConfig(repoName, config);
    repoType = repoConfig.type;
    authMode = repoConfig.authMode ?? "token";
    defaultBranch = repoConfig.defaultBranch ?? "main";
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar currentRepo={repoName} currentBranch={branchName} />
      <div className="flex flex-1 overflow-hidden">
        <DocsSidebar repo={repoName} branch={branchName} />
        <ReviewProvider
          repo={repoName}
          branch={branchName}
          repoType={repoType}
          authMode={authMode}
          defaultBranch={defaultBranch}
        >
          <div className="flex-1 flex flex-col overflow-hidden">
            <main className="flex-1 overflow-auto">{children}</main>
            <ReviewBar />
          </div>
        </ReviewProvider>
      </div>
    </div>
  );
}
