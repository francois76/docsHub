// Types for .docshub.yml configuration
export type RepoPlatform = "github" | "gitlab" | "bitbucket" | "local";
export type AuthMode = "oauth" | "token";

export interface RepoConfig {
  /** Unique identifier / display name for the repo */
  name: string;
  /** Platform type */
  type: RepoPlatform;
  /** For remote repos: https clone URL */
  url?: string;
  /** For local repos: absolute or relative path */
  path?: string;
  /** Subdirectory containing docs (default: "docs") */
  docsDir?: string;
  /** Branch to use as default (default: "main") */
  defaultBranch?: string;
  /** Service token for API calls (review) */
  token?: string;
  /** Auth mode for reviews */
  authMode?: AuthMode;
}

export interface DocsHubConfig {
  repos: RepoConfig[];
  /** Directory where repos are cloned (default: ".docshub-cache") */
  cacheDir?: string;
}

export type DocsHubConfigResolved = Required<DocsHubConfig> & {
  repos: Required<RepoConfig>[];
};
