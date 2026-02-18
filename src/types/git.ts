export interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export interface BranchInfo {
  name: string;
  isRemote: boolean;
  isCurrent?: boolean;
}
