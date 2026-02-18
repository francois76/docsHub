import { notFound } from "next/navigation";
import { getGitService } from "@/lib/git-registry";
import { renderMarkdown } from "@/lib/markdown";
import { MarkdownViewer } from "@/components/docs/MarkdownViewer";
import { FileText } from "lucide-react";

interface Props {
  params: Promise<{ repo: string; branch: string; path: string[] }>;
}

export async function generateMetadata({ params }: Props) {
  const { path } = await params;
  const fileName = decodeURIComponent(path[path.length - 1] ?? "");
  return { title: `${fileName} — docsHub` };
}

export default async function DocFilePage({ params }: Props) {
  const { repo, branch, path: pathSegments } = await params;
  const repoName = decodeURIComponent(repo);
  const branchName = decodeURIComponent(branch);
  const filePath = pathSegments.map(decodeURIComponent).join("/");
  const fileName = pathSegments[pathSegments.length - 1] ?? "";

  let content: string;
  try {
    const service = await getGitService(repoName);
    content = await service.readFile(branchName, filePath);
  } catch {
    notFound();
  }

  const isMarkdown = /\.(md|mdx|markdown)$/i.test(fileName);

  if (!isMarkdown) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4 text-muted-foreground text-sm">
          <FileText className="h-4 w-4" />
          <span>{filePath}</span>
        </div>
        <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto whitespace-pre-wrap">
          {content}
        </pre>
      </div>
    );
  }

  const html = await renderMarkdown(content, {
    repoName,
    branch: branchName,
    filePath,
  });

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <MarkdownViewer html={html} />
    </div>
  );
}
