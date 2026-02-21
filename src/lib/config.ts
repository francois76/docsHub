import * as fs from "fs";
import * as path from "path";
import { parse } from "yaml";
import type { DocsHubConfig, RepoConfig } from "@/types/config";

const CONFIG_FILE = ".docshub.yml";
const DEFAULT_CACHE_DIR = ".docshub-cache";

let cachedConfig: DocsHubConfig | null = null;

export async function getConfig(): Promise<DocsHubConfig> {
  if (cachedConfig) return cachedConfig;

  const configPath = path.join(process.cwd(), CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    cachedConfig = { repos: [], cacheDir: DEFAULT_CACHE_DIR };
    return cachedConfig;
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = parse(raw) as Partial<DocsHubConfig>;

  cachedConfig = {
    repos: (parsed.repos ?? []).map(normalizeRepo),
    cacheDir: parsed.cacheDir ?? DEFAULT_CACHE_DIR,
  };

  return cachedConfig;
}

/** Bust the config cache (e.g. after hot reload in dev) */
export function resetConfigCache() {
  cachedConfig = null;
}

function normalizeRepo(repo: Partial<RepoConfig>): RepoConfig {
  if (!repo.name) throw new Error("Each repo must have a `name` field");
  if (!repo.type) throw new Error(`Repo "${repo.name}" must have a \`type\` field`);

  return {
    name: repo.name,
    type: repo.type,
    url: repo.url,
    path: repo.path,
    docsDir: repo.docsDir ?? "docs",
    defaultBranch: repo.defaultBranch ?? "main",
    token: resolveToken(repo.token),
    authMode: repo.authMode ?? "token",
  };
}

/**
 * Resolve a token value that may reference an environment variable.
 * Supports two syntaxes:
 *   token: $MY_ENV_VAR          → reads process.env.MY_ENV_VAR
 *   token: ${MY_ENV_VAR}        → same, with braces
 * Any other value is returned as-is.
 */
function resolveToken(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const bracedMatch = raw.match(/^\$\{([^}]+)\}$/);
  if (bracedMatch) return process.env[bracedMatch[1]] || undefined;
  const bareMatch = raw.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
  if (bareMatch) return process.env[bareMatch[1]] || undefined;
  return raw;
}

export function getRepoConfig(name: string, config: DocsHubConfig): RepoConfig {
  const repo = config.repos.find((r) => r.name === name);
  if (!repo) throw new Error(`Repo "${name}" not found in configuration`);
  return repo;
}
