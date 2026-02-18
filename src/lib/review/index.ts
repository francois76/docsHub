import type { ReviewProvider } from "./types";
import { GitHubReviewProvider } from "./github-provider";
import { GitLabReviewProvider } from "./gitlab-provider";
import { BitbucketReviewProvider } from "./bitbucket-provider";
import type { RepoConfig } from "@/types/config";

export function createReviewProvider(
  repoConfig: RepoConfig,
  oauthToken?: string,
  oauthProvider?: string,
  oauthUserName?: string
): ReviewProvider | null {
  const { type, authMode, token } = repoConfig;

  // Determine which token to use
  const useOAuth = authMode === "oauth" && oauthToken && oauthProvider;
  const activeToken = useOAuth ? oauthToken : token;
  const userName = useOAuth ? oauthUserName : undefined;

  if (!activeToken) return null;

  switch (type) {
    case "github":
      return new GitHubReviewProvider(activeToken, undefined, userName);
    case "gitlab":
      return new GitLabReviewProvider(activeToken, undefined, userName);
    case "bitbucket":
      return new BitbucketReviewProvider(
        activeToken,
        repoConfig.url ? new URL(repoConfig.url).origin : undefined,
        userName,
        repoConfig.bitbucketVariant ?? "cloud"
      );
    default:
      return null;
  }
}

export * from "./types";
