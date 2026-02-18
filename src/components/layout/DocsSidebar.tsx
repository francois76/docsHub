"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FileTreeNode } from "@/types/git";

interface Props {
  repo: string;
  branch: string;
  /** Active file path */
  activePath?: string;
}

export function DocsSidebar({ repo, branch, activePath }: Props) {
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/repos/${encodeURIComponent(repo)}/tree?branch=${encodeURIComponent(branch)}`
    )
      .then((r) => r.json())
      .then((d) => setTree(d.tree ?? []))
      .finally(() => setLoading(false));
  }, [repo, branch]);

  return (
    <aside className="w-64 border-r bg-background flex flex-col shrink-0">
      <div className="px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Files
        </span>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No docs found on this branch.
          </div>
        ) : (
          <div className="p-2">
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                repo={repo}
                branch={branch}
                activePath={activePath}
                depth={0}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}

function TreeNode({
  node,
  repo,
  branch,
  activePath,
  depth,
}: {
  node: FileTreeNode;
  repo: string;
  branch: string;
  activePath?: string;
  depth: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(
    // Auto-expand if a child is active
    activePath ? isAncestorOf(node, activePath) : depth === 0
  );

  const isActive = node.path === activePath;

  if (node.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-1.5 w-full text-left rounded px-2 py-1 text-sm hover:bg-accent transition-colors",
            "font-medium"
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
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
          <span className="truncate">{node.name}</span>
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
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  const pathSegments = node.path.split("/");
  const href = `/docs/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${pathSegments.map(encodeURIComponent).join("/")}`;

  return (
    <button
      onClick={() => router.push(href)}
      className={cn(
        "flex items-center gap-1.5 w-full text-left rounded px-2 py-1 text-sm transition-colors",
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-accent text-foreground"
      )}
      style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}
    >
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function isAncestorOf(node: FileTreeNode, activePath: string): boolean {
  if (!activePath.startsWith(node.path)) return false;
  if (node.children) {
    return node.children.some(
      (child) => child.path === activePath || isAncestorOf(child, activePath)
    );
  }
  return false;
}
