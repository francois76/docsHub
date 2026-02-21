import type {
  ReviewProvider,
  ReviewComment,
  PullRequest,
  SubmitReviewPayload,
} from "./types";

export class GitLabReviewProvider implements ReviewProvider {
  private token: string;
  private baseUrl: string;
  private userName?: string;

  constructor(
    token: string,
    baseUrl = "https://gitlab.com/api/v4",
    userName?: string
  ) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.userName = userName;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitLab API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private encodeRepo(repo: string) {
    return encodeURIComponent(repo);
  }

  async findPR(repo: string, headBranch: string): Promise<PullRequest | null> {
    const mrs = await this.request<any[]>(
      `/projects/${this.encodeRepo(repo)}/merge_requests?state=opened&source_branch=${headBranch}&per_page=5`
    );
    if (!mrs.length) return null;
    const mr = mrs[0];
    return {
      id: mr.id,
      number: mr.iid,
      title: mr.title,
      state: mr.state === "opened" ? "open" : mr.state,
      head: mr.source_branch,
      base: mr.target_branch,
      url: mr.web_url,
    };
  }

  async listComments(repo: string, prNumber: number): Promise<ReviewComment[]> {
    const notes = await this.request<any[]>(
      `/projects/${this.encodeRepo(repo)}/merge_requests/${prNumber}/notes?per_page=100`
    );

    return notes
      .filter((n) => !n.system)
      .map((n) => ({
        id: n.id,
        author: n.author?.username ?? "unknown",
        body: n.body,
        createdAt: n.created_at,
        path: n.position?.new_path,
        line: n.position?.new_line,
        isOwn: this.userName ? n.author?.username === this.userName : false,
      }))
      .sort(
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
    const n = await this.request<any>(
      `/projects/${this.encodeRepo(repo)}/merge_requests/${prNumber}/notes`,
      { method: "POST", body: JSON.stringify({ body: displayBody }) }
    );
    return {
      id: n.id,
      author: n.author?.username ?? "unknown",
      body: n.body,
      createdAt: n.created_at,
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

    // Get base and head commit for inline diff comment
    const mr = await this.request<any>(
      `/projects/${this.encodeRepo(repo)}/merge_requests/${prNumber}`
    );
    const headSha = commitSha ?? mr.sha;
    const baseSha = mr.diff_refs?.base_sha;

    const n = await this.request<any>(
      `/projects/${this.encodeRepo(repo)}/merge_requests/${prNumber}/discussions`,
      {
        method: "POST",
        body: JSON.stringify({
          body: displayBody,
          position: {
            position_type: "text",
            base_sha: baseSha,
            head_sha: headSha,
            start_sha: baseSha,
            new_path: filePath,
            new_line: line,
          },
        }),
      }
    );
    const note = n.notes?.[0] ?? n;
    return {
      id: note.id,
      author: note.author?.username ?? "unknown",
      body: note.body,
      createdAt: note.created_at,
      path: filePath,
      line,
      isOwn: true,
    };
  }

  async submitReview(
    repo: string,
    prNumber: number,
    payload: SubmitReviewPayload
  ): Promise<void> {
    if (payload.action === "approve") {
      await this.request(
        `/projects/${this.encodeRepo(repo)}/merge_requests/${prNumber}/approve`,
        { method: "POST" }
      );
    } else if (payload.action === "request_changes") {
      // GitLab doesn't have a direct "request changes" – add a comment
      const body = payload.body
        ? `🔄 **Request Changes:** ${payload.body}`
        : "🔄 Changes requested.";
      await this.addComment(repo, prNumber, body);
    } else if (payload.action === "comment" && payload.body) {
      await this.addComment(repo, prNumber, payload.body);
    }
  }

  async createPR(
    repo: string,
    headBranch: string,
    baseBranch: string,
    title?: string
  ): Promise<PullRequest> {
    const mr = await this.request<any>(
      `/projects/${this.encodeRepo(repo)}/merge_requests`,
      {
        method: "POST",
        body: JSON.stringify({
          title: title ?? `Documentation review: ${headBranch}`,
          source_branch: headBranch,
          target_branch: baseBranch,
        }),
      }
    );
    return {
      id: mr.id,
      number: mr.iid,
      title: mr.title,
      state: mr.state === "opened" ? "open" : mr.state,
      head: mr.source_branch,
      base: mr.target_branch,
      url: mr.web_url,
    };
  }
}
