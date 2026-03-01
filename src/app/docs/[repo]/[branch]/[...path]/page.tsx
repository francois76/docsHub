import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGitService } from "@/lib/git-registry";
import { renderMarkdown } from "@/lib/markdown";
import { MarkdownViewer } from "@/components/docs/MarkdownViewer";
import { FileText } from "lucide-react";

// Rule js-hoist-regexp: hoist static RegExp outside the function to avoid recreating it on every call
const MARKDOWN_FILE_RE = /\.(md|mdx|markdown)$/i;

interface Props {
  readonly params: Promise<{ readonly repo: string; readonly branch: string; readonly path: string[] }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const fileName = decodeURIComponent(path.at(-1) ?? "");
  return { title: `${fileName} — docsHub` };
}

export default async function DocFilePage({ params }: Props): Promise<React.JSX.Element> {
  const { repo, branch, path: pathSegments } = await params;
  const repoName = decodeURIComponent(repo);
  const branchName = decodeURIComponent(branch);
  const filePath = pathSegments.map((s) => decodeURIComponent(s)).join("/");
  const fileName = pathSegments.at(-1) ?? "";

  let content: string;
  try {
    const service = await getGitService(repoName);
    content = await service.readFile(branchName, filePath);
  } catch {
    notFound();
  }

  const isMarkdown = MARKDOWN_FILE_RE.test(fileName);

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
      <MarkdownViewer html={html} filePath={filePath} />
    </div>
  );
}
