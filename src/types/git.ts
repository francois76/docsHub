export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export interface HeadingInfo {
  /** Heading level: 1, 2, or 3 */
  level: number;
  /** Raw heading text */
  text: string;
  /** URL-safe anchor slug (GitHub-compatible) */
  slug: string;
  /** 1-based source line number */
  line: number;
}

export interface BranchInfo {
  name: string;
  isRemote: boolean;
  isCurrent?: boolean;
}
