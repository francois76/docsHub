import { getGitService } from "@/lib/git-registry";
import { getConfig, getRepoConfig } from "@/lib/config";
import { BookOpen } from "lucide-react";

interface Props {
  readonly params: Promise<{ readonly repo: string; readonly branch: string }>;
}

export default async function BranchIndexPage({ params }: Props): Promise<React.JSX.Element> {
  const { repo, branch } = await params;
  const repoName = decodeURIComponent(repo);
  const branchName = decodeURIComponent(branch);

  let readmeContent: string | null = null;

  try {
    const config = await getConfig();
    const repoConfig = getRepoConfig(repoName, config);
    const service = await getGitService(repoName);
    const docsDir = repoConfig.docsDir ?? "docs";

    // Try README.md first, then index.md
    for (const candidate of [`${docsDir}/README.md`, `${docsDir}/index.md`]) {
      try {
        readmeContent = await service.readFile(branchName, candidate);
        break;
      } catch {
        // try next
      }
    }
  } catch {
    // ignore
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {readmeContent ? (
        <div className="text-sm text-muted-foreground mb-4">
          Showing <code>README.md</code> — select a file in the sidebar to view it.
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">
            {repoName} / {branchName}
          </h2>
          <p className="text-muted-foreground">
            Select a document from the sidebar to start reading.
          </p>
        </div>
      )}
    </div>
  );
}
