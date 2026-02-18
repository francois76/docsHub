import * as fs from "fs";
import * as path from "path";
import simpleGit, { SimpleGit } from "simple-git";
import type { RepoConfig } from "@/types/config";
import type { BranchInfo, FileTreeNode } from "@/types/git";

export class GitService {
  private repoPath: string;
  private git: SimpleGit;
  private config: RepoConfig;

  constructor(repoPath: string, config: RepoConfig) {
    this.repoPath = repoPath;
    this.config = config;
    this.git = simpleGit(repoPath);
  }

  /** Clone or pull the repo to keep it in sync */
  async sync(): Promise<void> {
    if (this.config.type === "local") {
      // For local repos, nothing to clone; just point to the path
      return;
    }

    if (!this.config.url) {
      throw new Error(`Repo "${this.config.name}" has no URL configured`);
    }

    const parentDir = path.dirname(this.repoPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (fs.existsSync(path.join(this.repoPath, ".git"))) {
      // Pull latest
      await this.git.fetch(["--all", "--prune"]);
    } else {
      // Clone
      if (!fs.existsSync(this.repoPath)) {
        fs.mkdirSync(this.repoPath, { recursive: true });
      }
      const parentGit = simpleGit(parentDir);
      await parentGit.clone(this.config.url, this.repoPath);
    }
  }

  /** List all branches (local + remote) */
  async listBranches(): Promise<BranchInfo[]> {
    const result = await this.git.branch(["-a"]);
    const branches: BranchInfo[] = [];

    for (const [name, detail] of Object.entries(result.branches)) {
      // Skip HEAD references
      if (name.includes("HEAD")) continue;

      const isRemote = name.startsWith("remotes/");
      const cleanName = isRemote
        ? name.replace(/^remotes\/[^/]+\//, "")
        : name;

      // Deduplicate
      if (!branches.find((b) => b.name === cleanName)) {
        branches.push({
          name: cleanName,
          isRemote,
          isCurrent: detail.current,
        });
      }
    }

    return branches;
  }

  /** Read the file tree of the docs directory at a given branch */
  async getDocsTree(branch: string): Promise<FileTreeNode[]> {
    const docsDir = this.config.docsDir ?? "docs";
    return this.getTreeAtPath(branch, docsDir);
  }

  private async getTreeAtPath(
    branch: string,
    treePath: string
  ): Promise<FileTreeNode[]> {
    try {
      const result = await this.git.raw([
        "ls-tree",
        "-r",
        "--name-only",
        branch,
        `${treePath}/`,
      ]);

      if (!result.trim()) return [];

      const files = result.trim().split("\n");
      return buildTree(files, treePath);
    } catch {
      return [];
    }
  }

  /** Read a file's content at a specific branch */
  async readFile(branch: string, filePath: string): Promise<string> {
    try {
      const content = await this.git.show([`${branch}:${filePath}`]);
      return content;
    } catch (err) {
      throw new Error(
        `File "${filePath}" not found on branch "${branch}": ${err}`
      );
    }
  }

  /** Read a binary file as a Buffer at a specific branch */
  async readFileBuffer(branch: string, filePath: string): Promise<Buffer> {
    const repoGit = simpleGit(this.repoPath);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      // Use raw git show piped through process
      const { execFile } = require("child_process");
      execFile(
        "git",
        ["-C", this.repoPath, "show", `${branch}:${filePath}`],
        { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
        (err: Error | null, stdout: Buffer) => {
          if (err) return reject(err);
          resolve(stdout);
        }
      );
    });
  }

  /** Check if the repo is accessible */
  async isAvailable(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  getRepoPath(): string {
    return this.repoPath;
  }
}

/** Build a hierarchical tree from a flat list of file paths */
function buildTree(files: string[], basePath: string): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const map = new Map<string, FileTreeNode>();

  for (const filePath of files) {
    const relativePath = filePath.startsWith(basePath + "/")
      ? filePath.slice(basePath.length + 1)
      : filePath;

    const parts = relativePath.split("/");
    let currentLevel = root;
    let currentPath = basePath;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath + "/" + part;
      const isLast = i === parts.length - 1;

      if (!map.has(currentPath)) {
        const node: FileTreeNode = {
          name: part,
          path: filePath.startsWith(basePath + "/")
            ? basePath + "/" + parts.slice(0, i + 1).join("/")
            : parts.slice(0, i + 1).join("/"),
          type: isLast ? "file" : "directory",
          children: isLast ? undefined : [],
        };
        // Fix path for actual files
        if (isLast) {
          node.path = filePath;
        }
        map.set(currentPath, node);
        currentLevel.push(node);
      }

      if (!isLast) {
        currentLevel = map.get(currentPath)!.children!;
      }
    }
  }

  return sortTree(root);
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .sort((a, b) => {
      // Directories first
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortTree(node.children) : undefined,
    }));
}
