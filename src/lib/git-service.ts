import * as fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import simpleGit, { type SimpleGit } from "simple-git";
import type { RepoConfig } from "@/types/config";
import type { BranchInfo, FileTreeNode } from "@/types/git";

export class GitService {
  private repoPath: string;
  private _git: SimpleGit | null = null;
  private config: RepoConfig;

  constructor(repoPath: string, config: RepoConfig) {
    this.repoPath = repoPath;
    this.config = config;
  }

  /** Lazy simpleGit instance — only created once the directory is known to exist. */
  private get git(): SimpleGit {
      this._git ??= simpleGit(this.repoPath);
      return this._git;
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
      if (!branches.some((b) => b.name === cleanName)) {
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

  /**
   * Resolve a branch name to the git ref that actually exists.
   * A branch that has been fetched but never checked out only exists as
   * `origin/{branch}` (remote-tracking ref). `git ls-tree {branch}` would
   * fail silently in that case, so we fall back to the remote ref.
   */
  private async resolveRef(branch: string): Promise<string> {
    try {
      // Check if the local ref exists
      await this.git.raw(["rev-parse", "--verify", branch]);
      return branch;
    } catch {
      // Fall back to remote-tracking ref
      return `origin/${branch}`;
    }
  }

  private async getTreeAtPath(
    branch: string,
    treePath: string
  ): Promise<FileTreeNode[]> {
    try {
      const ref = await this.resolveRef(branch);
      const result = await this.git.raw([
        "ls-tree",
        "-r",
        "--name-only",
        ref,
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
      const ref = await this.resolveRef(branch);
      const content = await this.git.show([`${ref}:${filePath}`]);
      return content;
    } catch (error) {
      throw new Error(
        `File "${filePath}" not found on branch "${branch}": ${String(error)}`
      );
    }
  }

  /** Read a binary file as a Buffer at a specific branch */
  async readFileBuffer(branch: string, filePath: string): Promise<Buffer> {
    const ref = await this.resolveRef(branch);
    return new Promise((resolve, reject) => {
      /* eslint-disable sonarjs/no-os-command-from-path */
      execFile(
        "git",
        ["-C", this.repoPath, "show", `${ref}:${filePath}`],
        { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
        (err: Error | null, stdout: Buffer) => {
          if (err) { reject(err); return; }
          resolve(stdout);
        }
      );
      /* eslint-enable sonarjs/no-os-command-from-path */
    });
  }

  /** Check if the repo is accessible */
  async isAvailable(): Promise<boolean> {
    try {
      // Guard against simple-git throwing before it can even start
      if (!fs.existsSync(this.repoPath) || !fs.existsSync(path.join(this.repoPath, ".git"))) {
        return false;
      }
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
// eslint-disable-next-line sonarjs/cognitive-complexity
function buildTree(files: string[], basePath: string): FileTreeNode[] {
  const root: FileTreeNode[] = [];
  const map = new Map<string, FileTreeNode>();

  for (const filePath of files) {
    const relativePath = filePath.startsWith(`${basePath  }/`)
      ? filePath.slice(basePath.length + 1)
      : filePath;

    const parts = relativePath.split("/");
    let currentLevel = root;
    let currentPath = basePath;

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      currentPath = `${currentPath  }/${  part}`;
      const isLast = index === parts.length - 1;

      if (!map.has(currentPath)) {
        const node: FileTreeNode = {
          name: part,
          path: filePath.startsWith(`${basePath  }/`)
            ? `${basePath  }/${  parts.slice(0, index + 1).join("/")}`
            : parts.slice(0, index + 1).join("/"),
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

        const childLevel = map.get(currentPath)?.children;
      if (childLevel) currentLevel = childLevel;
    }
  }

  return sortTree(root);
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  // Rule js-tosorted-immutable: use toSorted() to avoid mutating the input array
  return nodes
    .toSorted((a, b) => {
      // Directories first
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortTree(node.children) : undefined,
    }));
}
