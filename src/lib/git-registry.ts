import * as path from "path";
import { GitService } from "./git-service";
import { getConfig, getRepoConfig } from "./config";

const instances = new Map<string, GitService>();

export async function getGitService(repoName: string): Promise<GitService> {
  if (instances.has(repoName)) return instances.get(repoName)!;

  const config = await getConfig();
  const repoConfig = getRepoConfig(repoName, config);

  let repoPath: string;
  if (repoConfig.type === "local") {
    // Resolve path relative to cwd
    repoPath = path.resolve(process.cwd(), repoConfig.path ?? repoName);
  } else {
    const cacheDir = path.resolve(process.cwd(), config.cacheDir ?? ".docshub-cache");
    repoPath = path.join(cacheDir, repoName);
  }

  const service = new GitService(repoPath, repoConfig);
  instances.set(repoName, service);
  return service;
}

export function clearGitServiceCache() {
  instances.clear();
}
