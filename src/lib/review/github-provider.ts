import type {
  ReviewProvider,
  ReviewComment,
  PullRequest,
  SubmitReviewPayload,
} from "./types";

export class GitHubReviewProvider implements ReviewProvider {
  private token: string;
  private baseUrl: string;
  private userName?: string;

  constructor(token: string, baseUrl = "https://api.github.com", userName?: string) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.userName = userName;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async findPR(repo: string, headBranch: string): Promise<PullRequest | null> {
    const owner = repo.split('/')[0];
    const prs = await this.request<any[]>(
      `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${headBranch}`)}&per_page=5`
    );
    if (!prs.length) return null;
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
      this.request<any[]>(`/repos/${repo}/issues/${prNumber}/comments?per_page=100`),
      this.request<any[]>(`/repos/${repo}/pulls/${prNumber}/comments?per_page=100`),
    ]);

    const toComment = (c: any, inline = false): ReviewComment => ({
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body,
      createdAt: c.created_at,
      path: inline ? c.path : undefined,
      line: inline ? c.line ?? c.original_line : undefined,
      isOwn: this.userName ? c.user?.login === this.userName : false,
    });

    return [
      ...issueComments.map((c) => toComment(c, false)),
      ...reviewComments.map((c) => toComment(c, true)),
    ].sort(
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
    const c = await this.request<any>(
      `/repos/${repo}/issues/${prNumber}/comments`,
      { method: "POST", body: JSON.stringify({ body: displayBody }) }
    );
    return {
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body,
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

    // We need the latest commit SHA if not provided
    let sha = commitSha;
    if (!sha) {
      const pr = await this.request<any>(`/repos/${repo}/pulls/${prNumber}`);
      sha = pr.head.sha;
    }

    const c = await this.request<any>(
      `/repos/${repo}/pulls/${prNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          body: displayBody,
          commit_id: sha,
          path: filePath,
          line,
          side: "RIGHT",
        }),
      }
    );
    return {
      id: c.id,
      author: c.user?.login ?? "unknown",
      body: c.body,
      createdAt: c.created_at,
      path: c.path,
      line: c.line ?? c.original_line,
      isOwn: true,
    };
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

    await this.request(`/repos/${repo}/pulls/${prNumber}/reviews`, {
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
    const pr = await this.request<any>(`/repos/${repo}/pulls`, {
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
}
