import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import { createHighlighter } from "shiki";

let markdownInstance: MarkdownIt | null = null;
let highlighterReady = false;

async function getMarkdown(_repoName: string, _branch: string): Promise<MarkdownIt> {
  if (markdownInstance && highlighterReady) return markdownInstance;

  const highlighter = await createHighlighter({
    themes: ["github-light", "github-dark"],
    langs: [
      "typescript",
      "javascript",
      "python",
      "bash",
      "json",
      "yaml",
      "markdown",
      "html",
      "css",
      "sql",
      "rust",
      "go",
      "java",
      "cpp",
      "c",
      "csharp",
      "php",
      "ruby",
      "swift",
      "kotlin",
      "scala",
      "r",
      "dockerfile",
      "nginx",
      "xml",
      "graphql",
      "toml",
      "ini",
    ],
  });

  const instance = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(code: string, lang: string): string {
      // Mermaid blocks — leave as special marker for client-side rendering
      if (lang === "mermaid") {
        return `<div class="mermaid-raw" data-diagram="${encodeURIComponent(code)}"></div>`;
      }

      if (lang && highlighter.getLoadedLanguages().includes(lang as never)) {
        try {
          return highlighter.codeToHtml(code, {
            lang,
            themes: { light: "github-light", dark: "github-dark" },
          });
        } catch {
          // fallback
        }
      }

      // Fallback: plain code block
      return `<pre class="shiki"><code>${instance.utils.escapeHtml(code)}</code></pre>`;
    },
  });

  // Override image rendering to use the assets API
  const defaultImageRenderer = instance.renderer.rules.image;
  instance.renderer.rules.image = (tokens: Token[], idx: number, options: MarkdownIt["options"], env: unknown, self: Renderer) => {
    const token = tokens[idx];
    const srcIndex = token.attrIndex("src");
    if (srcIndex >= 0 && token.attrs) {
      const src = token.attrs[srcIndex][1];
      // Rewrite relative paths to assets API
      if (!src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("/")) {
        const { repoName, branch, filePath } = env as {
          repoName: string;
          branch: string;
          filePath: string;
        };
        if (repoName && branch) {
          // Resolve relative to the current file's directory
          const fileDir = filePath ? filePath.split("/").slice(0, -1).join("/") : "";
          const resolvedPath = fileDir ? `${fileDir}/${src}` : src;
          token.attrs[srcIndex][1] = `/api/repos/${encodeURIComponent(repoName)}/${encodeURIComponent(branch)}/assets/${resolvedPath}`;
        }
      }
    }
    return defaultImageRenderer
      ? defaultImageRenderer(tokens, idx, options, env as Record<string, unknown>, self)
      : self.renderToken(tokens, idx, options);
  };

  markdownInstance = instance;
  highlighterReady = true;
  return instance;
}

export interface RenderOptions {
  repoName: string;
  branch: string;
  filePath: string;
}

export async function renderMarkdown(
  content: string,
  options: RenderOptions
): Promise<string> {
  const md = await getMarkdown(options.repoName, options.branch);
  return md.render(content, options);
}
