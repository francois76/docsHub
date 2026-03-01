import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import { createHighlighter } from "shiki";
import type { HeadingInfo } from "@/types/git";

let markdownInstance: MarkdownIt | null = null;
let highlighterReady = false;

/** Call this when renderer rules change (e.g. hot reload in dev). */
export function resetMarkdownInstance() {
  markdownInstance = null;
  highlighterReady = false;
}

 
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

  // ── Add `id` attributes to headings for anchor navigation ────
  // This core rule runs once per document so the slug-dedup map is fresh
  // for every render call. The slugs are kept in sync with extractHeadings().
  instance.core.ruler.push("heading_ids", (state) => {
    const slugCount = new Map<string, number>();

    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index];
      if (token.type !== "heading_open") continue;

      const inlineToken = state.tokens[index + 1] as Token | undefined;
      if (inlineToken?.type !== "inline") continue;

      // Collect plain text from inline children (text + code_inline)
      const plainText = (inlineToken.children ?? [])
        .filter((t) => t.type === "text" || t.type === "code_inline")
        .map((t) => t.content)
        .join("");

      const slug = slugifyHeading(plainText);
      const count = slugCount.get(slug) ?? 0;
      const finalSlug = count === 0 ? slug : `${slug}-${String(count)}`;
      slugCount.set(slug, count + 1);

      token.attrSet("id", finalSlug);
    }
   
  }, "source_lines", (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state: any
  ) => {
    /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
    for (const token of state.tokens) {
      if (token.map && // nesting === 1 → opening tag  (p, h1, ul, ol, blockquote, table…)
        // nesting === 0 → self-closing  (hr, code_block)
        token.nesting >= 0) {
          token.attrSet(
            "data-source-line-start",
            String(token.map[0] + 1)
          ); // 1-based
          token.attrSet("data-source-line-end", String(token.map[1]));
        }
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-plus-operands */
  });

  // ── Wrap fence output with source-line div ──
  // Fence tokens use a custom renderer, so the core ruler attributes don't end
  // up in the output (the fence rule builds its own HTML). We wrap the result.
  const originalFence = instance.renderer.rules.fence ?? ((t: Token[], index: number, o: MarkdownIt["options"], _error: unknown, s: Renderer) => s.renderToken(t, index, o));
  instance.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const html = originalFence(tokens, index, options, env, self);
    if (token.map) {
      return `<div data-source-line-start="${String(token.map[0] + 1)}" data-source-line-end="${String(token.map[1])}">${html}</div>\n`;
    }
    return html;
  };

  // ── Wrap table output with source-line div ──
  // The source_lines plugin adds data-source-line-* to the <table> token, but
  // prepending a <button> inside <table> is invalid HTML (browsers eject it).
  // We move those attrs onto a wrapper <div> instead, just like fences above.
  instance.renderer.rules.table_open = (tokens, index, _options, _env, self) => {
    const token = tokens[index];
    const lineStart = token.attrGet("data-source-line-start");
    const lineEnd = token.attrGet("data-source-line-end");
    // Remove source-line attrs from <table>.
    token.attrs = (token.attrs ?? []).filter(
      ([k]) => k !== "data-source-line-start" && k !== "data-source-line-end"
    );
    const wrapAttributes = lineStart
      ? ` data-source-line-start="${lineStart}" data-source-line-end="${lineEnd ?? ""}"`
      : "";
    return `<div class="table-wrapper"${wrapAttributes}>\n<table${self.renderAttrs(token)}>\n`;
  };
  instance.renderer.rules.table_close = () => `</table>\n</div>\n`;

  // Override image rendering to use the assets API
  const defaultImageRenderer = instance.renderer.rules.image;
  // eslint-disable-next-line sonarjs/cognitive-complexity
  instance.renderer.rules.image = (tokens: Token[], index: number, options: MarkdownIt["options"], env: unknown, self: Renderer) => {
    const token = tokens[index];
    const sourceIndex = token.attrIndex("src");
    if (sourceIndex >= 0 && token.attrs) {
      const source = token.attrs[sourceIndex][1];
      // Rewrite relative paths to assets API
      if (!source.startsWith("http://") && !source.startsWith("https://") && !source.startsWith("/")) {
        const { repoName, branch, filePath } = env as {
          repoName: string;
          branch: string;
          filePath: string;
        };
        if (repoName && branch) {
          // Resolve relative to the current file's directory
          const fileDir = filePath ? filePath.split("/").slice(0, -1).join("/") : "";
          const resolvedPath = fileDir ? `${fileDir}/${source}` : source;
          token.attrs[sourceIndex][1] = `/api/repos/${encodeURIComponent(repoName)}/${encodeURIComponent(branch)}/assets/${resolvedPath}`;
        }
      }
    }
    return defaultImageRenderer
      ? defaultImageRenderer(tokens, index, options, env as Record<string, unknown>, self)
      : self.renderToken(tokens, index, options);
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

/* ────────────────────────────────────────────────────────────── */
/*  Heading extraction                                            */
/* ────────────────────────────────────────────────────────────── */

/**
 * Produces a GitHub-compatible anchor slug from a heading text.
 * Lowercases, removes non-word chars (except spaces/hyphens), trims,
 * and replaces spaces with hyphens.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
}

/**
 * Extracts headings of level 1–3 from markdown source, with 1-based
 * line numbers so callers can map inline review comments to sections.
 */
export function extractHeadings(markdown: string): HeadingInfo[] {
  const lines = markdown.split("\n");
  const result: HeadingInfo[] = [];
  const slugCount = new Map<string, number>();

  for (const [index, line] of lines.entries()) {
    // eslint-disable-next-line sonarjs/slow-regex
    const match = /^(#{1,3})\s+(.+)$/.exec(line);
    if (!match) continue;

    const level = match[1].length;
    // Strip inline markdown (bold, italic, code, links) from heading text
    /* eslint-disable sonarjs/slow-regex */
    const raw = match[2]
      .replaceAll(/`[^`]*`/g, (m) => m.slice(1, -1))
      .replaceAll(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
      .replaceAll(/_{1,2}([^_]+)_{1,2}/g, "$1")
      .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .trim();
    /* eslint-enable sonarjs/slow-regex */

    let slug = slugifyHeading(raw);
    // Deduplicate slugs the same way GitHub does (append -1, -2, …)
    const count = slugCount.get(slug) ?? 0;
    slug = count === 0 ? slug : `${slug}-${String(count)}`;
    slugCount.set(slug, count + 1);

    result.push({ level, text: raw, slug, line: index + 1 });
  }

  return result;
}
