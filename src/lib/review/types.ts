export interface ReviewComment {
  id: string | number;
  author: string;
  body: string;
  createdAt: string;
  /** Line number in the file (if inline) */
  line?: number;
  /** File path (if inline) */
  path?: string;
  /** Whether this is the current user's comment */
  isOwn?: boolean;
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  head: string;
  base: string;
  url: string;
  reviewState?: "approved" | "changes_requested" | "pending";
}

export type ReviewAction = "approve" | "request_changes" | "comment";

export interface SubmitReviewPayload {
  action: ReviewAction;
  body?: string;
  comments?: Array<{
    path: string;
    line: number;
    body: string;
  }>;
}

/** Unified interface for PR review operations across platforms */
export interface ReviewProvider {
  /** Find the open PR for a given head branch */
  findPR(repo: string, headBranch: string): Promise<PullRequest | null>;
  /** List all review comments for a PR */
  listComments(repo: string, prNumber: number): Promise<ReviewComment[]>;
  /** Add a global comment to the PR */
  addComment(repo: string, prNumber: number, body: string): Promise<ReviewComment>;
  /** Add an inline comment on a specific line */
  addInlineComment(
    repo: string,
    prNumber: number,
    filePath: string,
    line: number,
    body: string,
    commitSha?: string
  ): Promise<ReviewComment>;
  /** Submit a formal review (approve / request changes / comment) */
  submitReview(
    repo: string,
    prNumber: number,
    payload: SubmitReviewPayload
  ): Promise<void>;
}
