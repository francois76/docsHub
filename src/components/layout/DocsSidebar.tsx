"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useReview } from "@/components/docs/ReviewContext";
import type { FileTreeNode, HeadingInfo } from "@/types/git";
import type { ReviewComment } from "@/lib/review/types";

/* ────────────────────────────────────────────────────────────── */
/*  Module-level headings cache (shared across renders)           */
/* ────────────────────────────────────────────────────────────── */

/** Key: `${repo}@@${branch}@@${path}` */
const headingsCache = new Map<string, HeadingInfo[]>();

/* ────────────────────────────────────────────────────────────── */
/*  Comment-count helpers                                          */
/* ────────────────────────────────────────────────────────────── */

/** Total comment count for a file path (regardless of heading). */
function fileCommentCount(comments: ReviewComment[], filePath: string): number {
  return comments.filter((c) => c.path === filePath).length;
}

/**
 * Range-based direct attribution: each comment is assigned to its innermost
 * H2/H3 section (the last H2/H3 whose line ≤ comment line).
 * Comments before any H2/H3 go to `fileDirect`.
 *
 * Returns a per-slug direct count map (used for both H2 and H3 badges) and
 * `fileDirect` for the file-row expanded badge.
 */
function buildDirectCounts(
  comments: ReviewComment[],
  subHeadings: HeadingInfo[], // H2+H3 only, in document order
  filePath: string
): { direct: Map<string, number>; fileDirect: number } {
  const direct = new Map<string, number>();
  let fileDirect = 0;
  const fileComments = comments.filter(
    (c): c is ReviewComment & { line: number } =>
      c.path === filePath && c.line !== undefined
  );

  for (const comment of fileComments) {
    const { line } = comment;
    // Find the last heading (H2 or H3) whose line is ≤ comment line
    let innermost: HeadingInfo | null = null;
    for (let index = subHeadings.length - 1; index >= 0; index--) {
      if (subHeadings[index].line <= line) {
        innermost = subHeadings[index];
        break;
      }
    }
    if (innermost) {
      direct.set(innermost.slug, (direct.get(innermost.slug) ?? 0) + 1);
    } else {
      fileDirect++;
    }
  }

  return { direct, fileDirect };
}

/* ────────────────────────────────────────────────────────────── */
/*  Small comment badge                                            */
/* ────────────────────────────────────────────────────────────── */

function CommentBadge({ count }: { readonly count: number }): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-0.5 shrink-0 pr-1.5 text-[10px] font-medium text-primary/80">
      <MessageSquare className="h-2.5 w-2.5" />
      {count}
    </span>
  );
}

const TREE_ERROR_LABELS: Record<string, string> = {
  no_token: "Token manquant",
  not_synced: "Dépôt non synchronisé",
  local_path_missing: "Chemin introuvable",
};

interface TreeFetchResponse {
  tree?: FileTreeNode[];
  error?: string;
  hint?: string;
}

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 600;
const SIDEBAR_DEFAULT = 420;

/* ────────────────────────────────────────────────────────────── */
/*  Sidebar root                                                   */
/* ────────────────────────────────────────────────────────────── */

interface Props {
  readonly repo: string;
  readonly branch: string;
}

 
export function DocsSidebar({ repo, branch }: Props): React.JSX.Element {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [treeError, setTreeError] = useState<{
    code: string;
    hint: string;
  } | null>(null);
  const [headingsMap, setHeadingsMap] = useState<Map<string, HeadingInfo[]>>(
    new Map()
  );
  // Rule: never read localStorage in the useState initializer — SSR renders
  // SIDEBAR_DEFAULT and the client must match for the first paint. We sync
  // from localStorage after hydration via useEffect.
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  useEffect(() => {
    const stored = Number.parseInt(localStorage.getItem("sidebar-width") ?? "", 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX) setSidebarWidth(stored);
  }, []);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleDragStart = (dragEvent: React.MouseEvent): void => {
    isDragging.current = true;
    dragStartX.current = dragEvent.clientX;
    dragStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: MouseEvent): void => {
      if (!isDragging.current) return;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN,
        dragStartWidth.current + moveEvent.clientX - dragStartX.current
      ));
      setSidebarWidth(next);
    };
    const onUp = (): void => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSidebarWidth((w) => {
        localStorage.setItem("sidebar-width", String(w));
        return w;
      });
      globalThis.removeEventListener("mousemove", onMove);
      globalThis.removeEventListener("mouseup", onUp);
    };
    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
  };

  const pathname = usePathname();
  const activePath = deriveActivePath(pathname, repo, branch);

  /* ── tree fetch ─────────────────────────────────────────────── */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
     
    setTreeError(null);
    void fetch(
      `/api/repos/${encodeURIComponent(repo)}/tree?branch=${encodeURIComponent(branch)}`
    )
      .then((r) => r.json() as Promise<TreeFetchResponse>)
      .then((d) => {
        const treeData: FileTreeNode[] = d.tree ?? [];
        setTree(treeData);
        if (d.error) {
          setTreeError({
            code: d.error,
            hint: d.hint ?? "Impossible de charger les fichiers.",
          });
        }
        return treeData;
      })
      .then((treeData) => {
        const allPaths = collectMarkdownPaths(treeData);
        if (allPaths.length === 0) return;

        const uncachedPaths = allPaths.filter(
          (p) => !headingsCache.has(`${repo}@@${branch}@@${p}`)
        );

        const fetchPromise =
          uncachedPaths.length > 0
            ? fetch(
                `/api/repos/${encodeURIComponent(repo)}/headings?branch=${encodeURIComponent(branch)}&paths=${encodeURIComponent(uncachedPaths.join(","))}`
              )
                .then((r) => r.json())
                .then((data: { headings?: Record<string, HeadingInfo[]> }) => {
                  for (const [p, hs] of Object.entries(data.headings ?? {})) {
                    headingsCache.set(`${repo}@@${branch}@@${p}`, hs);
                  }
                })
                .catch(() => {/* silently skip */})
            : Promise.resolve();

        void fetchPromise.then(() => {
          const map = new Map<string, HeadingInfo[]>();
          for (const p of allPaths) {
            const cached = headingsCache.get(`${repo}@@${branch}@@${p}`);
            if (cached) map.set(p, cached);
          }
          setHeadingsMap(map);
        });
      })
      .finally(() => { setLoading(false); });
  }, [repo, branch]);

  let sidebarContent;
  if (loading) {
    sidebarContent = <div className="p-4 text-sm text-muted-foreground">Chargement…</div>;
  } else if (treeError) {
    sidebarContent = (
      <div className="p-4 flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-amber-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            {TREE_ERROR_LABELS[treeError.code] ?? "Erreur"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {treeError.hint}
        </p>
      </div>
    );
  } else if (tree.length === 0) {
    sidebarContent = (
      <div className="p-4 text-sm text-muted-foreground">
        Aucun document trouvé sur cette branche.
      </div>
    );
  } else {
    sidebarContent = (
      <div className="p-2">
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            repo={repo}
            branch={branch}
            activePath={activePath}
            headingsMap={headingsMap}
            depth={0}
          />
        ))}
      </div>
    );
  }

  return (
    <aside
      className="border-r bg-background flex flex-col shrink-0 relative"
      style={{ width: sidebarWidth }}
    >
      <div className="px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Files
        </span>
      </div>
      <ScrollArea className="flex-1">
        {sidebarContent}
      </ScrollArea>
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-10"
        aria-hidden
      />
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Tree node dispatcher                                           */
/* ────────────────────────────────────────────────────────────── */

function TreeNode({
  node,
  repo,
  branch,
  activePath,
  headingsMap,
  depth,
}: {
  readonly node: FileTreeNode;
  readonly repo: string;
  readonly branch: string;
  readonly activePath: string | null;
  readonly headingsMap: Map<string, HeadingInfo[]>;
  readonly depth: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(
    () => (activePath ? isAncestorOf(node, activePath) : depth === 0)
  );

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => { setOpen((o) => !o); }}
          className={cn(
            "flex items-center gap-1.5 w-full text-left rounded px-2 py-1 text-sm hover:bg-accent transition-colors",
            "font-semibold"
          )}
          style={{ paddingLeft: `${String(6 + depth * 16)}px` }}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {open ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          )}
          <span className="break-words leading-snug">{node.name}</span>
        </button>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                repo={repo}
                branch={branch}
                activePath={activePath}
                headingsMap={headingsMap}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <FileNode
      node={node}
      repo={repo}
      branch={branch}
      activePath={activePath}
      headingsMap={headingsMap}
      depth={depth}
    />
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  File node with expandable heading sub-tree                    */
/* ────────────────────────────────────────────────────────────── */

const MARKDOWN_FILE_RE = /\.(md|mdx|markdown)$/i;

function FileNode({
  node,
  repo,
  branch,
  activePath,
  headingsMap,
  depth,
}: {
  readonly node: FileTreeNode;
  readonly repo: string;
  readonly branch: string;
  readonly activePath: string | null;
  readonly headingsMap: Map<string, HeadingInfo[]>;
  readonly depth: number;
}): React.JSX.Element {
  const router = useRouter();
  const review = useReview();
  const comments = review?.comments ?? [];

  const isActive = node.path === activePath;
  const headings = MARKDOWN_FILE_RE.test(node.name)
    ? (headingsMap.get(node.path) ?? [])
    : [];

  const h1 = headings.find((h) => h.level === 1);
  const label = h1?.text ?? node.name;

  const subHeadings = headings.filter((h) => h.level >= 2);
  const hasSubHeadings = subHeadings.length > 0;

  const [headingsOpen, setHeadingsOpen] = useState(() => isActive);
  const previousActiveRef = useRef(isActive);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isActive && !previousActiveRef.current) setHeadingsOpen(true);
    previousActiveRef.current = isActive;
  }, [isActive]);

  const pathSegments = node.path.split("/");
  const href = `/docs/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${pathSegments.map((s) => encodeURIComponent(s)).join("/")}`;

  const totalCount = fileCommentCount(comments, node.path);
  const { direct: directCounts, fileDirect } =
    totalCount > 0 && hasSubHeadings
      ? buildDirectCounts(comments, subHeadings, node.path)
      : { direct: new Map<string, number>(), fileDirect: 0 };

  // Badge on the file row:
  //   expanded → only comments not inside any visible H2/H3 section
  //   collapsed → total for the whole file
  const fileBadgeCount =
    headingsOpen && hasSubHeadings ? fileDirect : totalCount;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 w-full rounded transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "hover:bg-accent text-foreground"
        )}
        style={{ paddingLeft: `${String(6 + depth * 16)}px` }}
      >
        {hasSubHeadings ? (
          <button
            onClick={() => { setHeadingsOpen((o) => !o); }}
            className="shrink-0 p-1 rounded hover:bg-accent/60 transition-colors"
            aria-label={
              headingsOpen ? "Masquer les sections" : "Afficher les sections"
            }
          >
            {headingsOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <button
          onClick={() => { router.push(href); }}
          className={cn(
            "flex items-center gap-1.5 flex-1 min-w-0 text-left py-1 text-sm",
            isActive ? "font-semibold" : "font-medium"
          )}
        >
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="break-words leading-snug">{label}</span>
        </button>
        <CommentBadge count={fileBadgeCount} />
      </div>

      {headingsOpen && hasSubHeadings && (
        <HeadingSubTree
          filePath={node.path}
          fileHref={href}
          headings={subHeadings}
          directCounts={directCounts}
          isActiveFile={isActive}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Heading sub-tree (H2 + H3 nodes)                              */
/* ────────────────────────────────────────────────────────────── */

function HeadingSubTree({
  filePath: _filePath,
  fileHref,
  headings,
  directCounts,
  isActiveFile,
  depth,
}: {
  readonly filePath: string;
  readonly fileHref: string;
  readonly headings: HeadingInfo[];
  readonly directCounts: Map<string, number>;
  readonly isActiveFile: boolean;
  readonly depth: number;
}): React.JSX.Element {
  const router = useRouter();
  const groups = buildHeadingGroups(headings);

  return (
    <div>
      {groups.map((group) => (
        <H2Group
          key={group.heading.slug}
          group={group}
          fileHref={fileHref}
          directCounts={directCounts}
          isActiveFile={isActiveFile}
          depth={depth}
          router={router}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  H2 group (H2 row + collapsible H3 children)                   */
/* ────────────────────────────────────────────────────────────── */

function H2Group({
  group,
  fileHref,
  directCounts,
  isActiveFile,
  depth,
  router,
}: {
  readonly group: HeadingGroup;
  readonly fileHref: string;
  readonly directCounts: Map<string, number>;
  readonly isActiveFile: boolean;
  readonly depth: number;
  readonly router: ReturnType<typeof useRouter>;
}): React.JSX.Element {
  const h2 = group.heading;
  const {children} = group;
  const hasChildren = children.length > 0;
  const [open, setOpen] = useState(() => isActiveFile);

  // Direct comments in the H2 itself (not inside any H3 child)
  const h2Direct = directCounts.get(h2.slug) ?? 0;
  // Sum of all H3 children direct counts
  const h3Total = children.reduce(
    (sum, h3) => sum + (directCounts.get(h3.slug) ?? 0),
    0
  );
  // Total for this H2 section = H2-direct + all H3 directs
  const h2Total = h2Direct + h3Total;

  // collapsed → total (all descendants visible in one badge)
  // expanded  → direct only (H3 badges show their own counts)
  const count = open && hasChildren ? h2Direct : h2Total;

  function navigateToHeading(slug: string): void {
    if (isActiveFile) {
      document.querySelector(`#${slug}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } else {
      router.push(`${fileHref}#${slug}`);
    }
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 w-full hover:bg-accent rounded transition-colors"
        style={{ paddingLeft: `${String(6 + depth * 16)}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => { setOpen((o) => !o); }}
            className="shrink-0 p-1 rounded hover:bg-accent/60"
            aria-label={open ? "Masquer" : "Afficher"}
          >
            {open ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <button
          onClick={() => { navigateToHeading(h2.slug); }}
          className="flex items-center flex-1 min-w-0 text-left py-1 text-sm font-medium text-foreground/80 hover:text-foreground"
        >
          <span className="break-words leading-snug">{h2.text}</span>
        </button>
        <CommentBadge count={count} />
      </div>

      {open && hasChildren && (
        <div>
          {children.map((h3) => {
            const h3Count = directCounts.get(h3.slug) ?? 0;
            return (
              <div
                key={h3.slug}
                className="flex items-center w-full rounded hover:bg-accent transition-colors"
                style={{ paddingLeft: `${String(6 + (depth + 1) * 16)}px` }}
              >
                <span className="w-4 shrink-0 border-l border-border/50 self-stretch ml-2 mr-1" />
                <button
                  onClick={() => { navigateToHeading(h3.slug); }}
                  className="flex items-center flex-1 min-w-0 text-left py-0.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <span className="break-words leading-snug">{h3.text}</span>
                </button>
                <CommentBadge count={h3Count} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Heading grouping helper                                        */
/* ────────────────────────────────────────────────────────────── */

interface HeadingGroup {
  heading: HeadingInfo;
  children: HeadingInfo[];
}

function buildHeadingGroups(headings: HeadingInfo[]): HeadingGroup[] {
  const groups: HeadingGroup[] = [];
  let currentGroup: HeadingGroup | null = null;

  for (const h of headings) {
    if (h.level === 2) {
      currentGroup = { heading: h, children: [] };
      groups.push(currentGroup);
    } else if (h.level === 3 && currentGroup) {
      currentGroup.children.push(h);
    }
  }

  return groups;
}

/* ────────────────────────────────────────────────────────────── */
/*  Utility: parse active file path from URL                      */
/* ────────────────────────────────────────────────────────────── */

function deriveActivePath(
  pathname: string,
  repo: string,
  branch: string
): string | null {
  const prefix = `/docs/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/`;
  if (!pathname.startsWith(prefix)) return null;
  return pathname
    .slice(prefix.length)
    .split("/")
    .map((s) => decodeURIComponent(s))
    .join("/");
}

/* ────────────────────────────────────────────────────────────── */
/*  Utility: collect all markdown file paths from tree            */
/* ────────────────────────────────────────────────────────────── */

function collectMarkdownPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  function walk(node: FileTreeNode): void {
    if (node.type === "file" && MARKDOWN_FILE_RE.test(node.name)) {
      paths.push(node.path);
    }
    for (const child of node.children ?? []) { walk(child); }
  }
  for (const walkNode of nodes) { walk(walkNode); }
  return paths;
}

/* ────────────────────────────────────────────────────────────── */
/*  Utility: is an ancestor directory of the active path?         */
/* ────────────────────────────────────────────────────────────── */

function isAncestorOf(node: FileTreeNode, activePath: string): boolean {
  if (!activePath.startsWith(node.path)) return false;
  if (node.children) {
    return node.children.some(
      (child) => child.path === activePath || isAncestorOf(child, activePath)
    );
  }
  return false;
}
