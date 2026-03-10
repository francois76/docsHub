import type {
  ReviewProvider,
  ReviewComment,
  PullRequest,
  SubmitReviewPayload,
} from "./types";

// ── GitHub REST API shapes ───────────────────────────────────────────────────
interface GitHubUser { login?: string }
interface GitHubPRRef { ref: string; sha: string }
interface GitHubPullRequest {
  id: number; number: number; title: string;
  state: "open" | "closed" | "merged";
  head: GitHubPRRef; base: GitHubPRRef; html_url: string;
  user?: GitHubUser;
}
interface GitHubIssueComment {
  id: number; body?: string; created_at: string; user?: GitHubUser;
}
interface GitHubReviewComment {
  id: number; body?: string; created_at: string; user?: GitHubUser;
  path?: string; line?: number; original_line?: number;
}
interface GitHubReview { id: number; submitted_at: string; user?: GitHubUser }

interface ApiOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

export class GitHubReviewProvider implements ReviewProvider {
  private token: string;
  private baseUrl: string;
  private userName?: string;

  constructor(token: string, baseUrl = "https://api.github.com", userName?: string) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.userName = userName;
  }

  private async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      body: options.body,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${String(res.status)}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private async requestDelete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`GitHub API error ${String(res.status)}: ${text}`);
    }
  }

  async findPR(repo: string, headBranch: string): Promise<PullRequest | null> {
    const owner = repo.split('/')[0];
    const headRef = `${owner}:${headBranch}`;
    const prs = await this.request<GitHubPullRequest[]>(
      `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(headRef)}&per_page=5`
    );
    if (prs.length === 0) return null;
    const pr = prs[0];
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      head: pr.head.ref,
      base: pr.base.ref,
      url: pr.html_url,
    };
  }

  async listComments(repo: string, prNumber: number): Promise<ReviewComment[]> {
    const [issueComments, reviewComments] = await Promise.all([
      this.request<GitHubIssueComment[]>(`/repos/${repo}/issues/${String(prNumber)}/comments?per_page=100`),
      this.request<GitHubReviewComment[]>(`/repos/${repo}/pulls/${String(prNumber)}/comments?per_page=100`),
    ]);

    const toComment = (c: GitHubIssueComment | GitHubReviewComment, inline = false): ReviewComment => {
      const rawBody: string = c.body ?? "";
      // Parse hidden markers embedded in fallback issue comments.
      const lineMatch = /\n?<!-- docshub:line=(\d+) -->/.exec(rawBody);
      const pathMatch = /\n?<!-- docshub:path=([^\s>]+) -->/.exec(rawBody);
      const docshubLine = lineMatch ? Number.parseInt(lineMatch[1]) : undefined;
      const docshubPath = pathMatch ? pathMatch[1] : undefined;
      // Strip markers so they never appear as visible text in docsHub.
      const body = rawBody
        .replace(/\n?<!-- docshub:line=\d+ -->/, "")
        .replace(/\n?<!-- docshub:path=[^\s>]+ -->/, "")
        .trimEnd();
      // Issue comment with embedded markers acts as an inline comment.
      const isEmbedded = !inline && Boolean(docshubLine) && Boolean(docshubPath);
      let commentPath: string | undefined;
      let commentLine: number | undefined;
      if (inline) {
        commentPath = (c as GitHubReviewComment).path;
        commentLine = (c as GitHubReviewComment).line ?? (c as GitHubReviewComment).original_line ?? docshubLine;
      } else if (isEmbedded) {
        commentPath = docshubPath;
        commentLine = docshubLine;
      }
      return {
        id: c.id,
        author: c.user?.login ?? "unknown",
        body,
        createdAt: c.created_at,
        path: commentPath,
        line: commentLine,
        isOwn: this.userName ? c.user?.login === this.userName : false,
        commentType: inline ? "review_comment" : "issue_comment",
      };
    };

    return [
      ...issueComments.map((c) => toComment(c, false)),
      ...reviewComments.map((c) => toComment(c, true)),
    // Rule js-tosorted-immutable: use toSorted() to avoid mutating the array
    ].toSorted(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async addComment(
    repo: string,
    prNumber: number,
    body: string
  ): Promise<ReviewComment> {
    const displayBody = this.userName ? `**[${this.userName}]:** ${body}` : body;
    const c = await this.request<GitHubIssueComment>(
      `/repos/${repo}/issues/${String(prNumber)}/comments`,
      { method: "POST", body: JSON.stringify({ body: displayBody }) }
    );
    return {
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body ?? "",
      createdAt: c.created_at,
      isOwn: true,
    };
  }

  async addInlineComment(
    repo: string,
    prNumber: number,
    filePath: string,
    line: number,
    body: string,
    commitSha?: string
  ): Promise<ReviewComment> {
    const displayBody = this.userName ? `**[${this.userName}]:** ${body}` : body;

    // Fetch the PR to get the head commit SHA (required for review creation).
    const prData = await this.request<GitHubPullRequest>(`/repos/${repo}/pulls/${String(prNumber)}`);
    const sha = commitSha ?? prData.head.sha;

    try {
      // Create an inline comment as part of an immediately-submitted COMMENT review.
      // Unlike addPullRequestReviewThread (GraphQL), this does NOT create a pending
      // review — the comment is immediately visible via the REST API on refresh.
      const review = await this.request<GitHubReview>(
        `/repos/${repo}/pulls/${String(prNumber)}/reviews`,
        {
          method: "POST",
          body: JSON.stringify({
            commit_id: sha,
            body: "",
            event: "COMMENT",
            comments: [{ path: filePath, line, body: displayBody, side: "RIGHT" }],
          }),
        }
      );

      // Retrieve the individual comment to get its id and metadata.
      const reviewComments = await this.request<GitHubReviewComment[]>(
        `/repos/${repo}/pulls/${String(prNumber)}/reviews/${String(review.id)}/comments`
      );
      const c = reviewComments.at(0);
      return {
        id: c?.id ?? review.id,
        author: c?.user?.login ?? review.user?.login ?? "unknown",
        body: displayBody,
        createdAt: c?.created_at ?? review.submitted_at,
        path: filePath,
        line,
        isOwn: true,
        commentType: "review_comment",
      };
    } catch {
      // Fallback: line is not in the diff hunk → post as a regular issue comment
      // with embedded markers so docsHub can display it inline.
      const backtick = "`";
      const fallbackBody = `${displayBody}\n\n> 📄 ${backtick}${filePath}${backtick} — ligne ${String(line)}\n<!-- docshub:path=${filePath} -->\n<!-- docshub:line=${String(line)} -->`;
      const ic = await this.request<GitHubIssueComment>(
        `/repos/${repo}/issues/${String(prNumber)}/comments`,
        { method: "POST", body: JSON.stringify({ body: fallbackBody }) }
      );
      return {
        id: ic.id,
        author: ic.user?.login ?? "unknown",
        body: displayBody,
        createdAt: ic.created_at,
        path: filePath,
        line,
        isOwn: true,
        commentType: "issue_comment",
      };
    }
  }

  async submitReview(
    repo: string,
    prNumber: number,
    payload: SubmitReviewPayload
  ): Promise<void> {
    const eventMap: Record<string, string> = {
      approve: "APPROVE",
      request_changes: "REQUEST_CHANGES",
      comment: "COMMENT",
    };

    await this.request(`/repos/${repo}/pulls/${String(prNumber)}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        body: payload.body ?? "",
        event: eventMap[payload.action],
        comments: payload.comments?.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
          side: "RIGHT",
        })),
      }),
    });
  }

  async createPR(
    repo: string,
    headBranch: string,
    baseBranch: string,
    title?: string
  ): Promise<PullRequest> {
    const pr = await this.request<GitHubPullRequest>(`/repos/${repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title: title ?? `Documentation review: ${headBranch}`,
        head: headBranch,
        base: baseBranch,
      }),
    });
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      head: pr.head.ref,
      base: pr.base.ref,
      url: pr.html_url,
    };
  }

  async deleteComment(
    repo: string,
    commentId: string | number,
    commentType?: string
  ): Promise<void> {
    if (commentType === "issue_comment") {
      await this.requestDelete(`/repos/${repo}/issues/comments/${String(commentId)}`);
      return;
    }
    // Try review comment first; fall back to issue comment if 404/error.
    try {
      await this.requestDelete(`/repos/${repo}/pulls/comments/${String(commentId)}`);
    } catch {
      await this.requestDelete(`/repos/${repo}/issues/comments/${String(commentId)}`);
    }
  }
}
