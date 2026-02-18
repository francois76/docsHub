import type {
  ReviewProvider,
  ReviewComment,
  PullRequest,
  SubmitReviewPayload,
} from "./types";

export class BitbucketReviewProvider implements ReviewProvider {
  private token: string;
  private baseUrl: string;
  private userName?: string;

  constructor(
    token: string,
    baseUrl = "https://api.bitbucket.org/2.0",
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
      throw new Error(`Bitbucket API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async findPR(repo: string, headBranch: string): Promise<PullRequest | null> {
    const data = await this.request<any>(
      `/repositories/${repo}/pullrequests?q=source.branch.name="${headBranch}" AND state="OPEN"&pagelen=5`
    );
    const prs = data.values ?? [];
    if (!prs.length) return null;
    const pr = prs[0];
    return {
      id: pr.id,
      number: pr.id,
      title: pr.title,
      state: pr.state === "OPEN" ? "open" : pr.state.toLowerCase(),
      head: pr.source.branch.name,
      base: pr.destination.branch.name,
      url: pr.links.html.href,
    };
  }

  async listComments(repo: string, prNumber: number): Promise<ReviewComment[]> {
    const data = await this.request<any>(
      `/repositories/${repo}/pullrequests/${prNumber}/comments?pagelen=100`
    );
    const comments = data.values ?? [];

    return comments
      .map((c: any) => ({
        id: c.id,
        author: c.user?.nickname ?? c.user?.display_name ?? "unknown",
        body: c.content?.raw ?? c.content?.markup ?? "",
        createdAt: c.created_on,
        path: c.inline?.path,
        line: c.inline?.to,
        isOwn: this.userName
          ? (c.user?.nickname ?? c.user?.display_name) === this.userName
          : false,
      }))
      .sort(
        (a: ReviewComment, b: ReviewComment) =>
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
      `/repositories/${repo}/pullrequests/${prNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ content: { raw: displayBody } }),
      }
    );
    return {
      id: c.id,
      author: c.user?.nickname ?? "unknown",
      body: c.content?.raw ?? "",
      createdAt: c.created_on,
      isOwn: true,
    };
  }

  async addInlineComment(
    repo: string,
    prNumber: number,
    filePath: string,
    line: number,
    body: string
  ): Promise<ReviewComment> {
    const displayBody = this.userName ? `**[${this.userName}]:** ${body}` : body;
    const c = await this.request<any>(
      `/repositories/${repo}/pullrequests/${prNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          content: { raw: displayBody },
          inline: { path: filePath, to: line },
        }),
      }
    );
    return {
      id: c.id,
      author: c.user?.nickname ?? "unknown",
      body: c.content?.raw ?? "",
      createdAt: c.created_on,
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
        `/repositories/${repo}/pullrequests/${prNumber}/approve`,
        { method: "POST" }
      );
    } else if (payload.action === "request_changes") {
      await this.request(
        `/repositories/${repo}/pullrequests/${prNumber}/request-changes`,
        { method: "POST", body: JSON.stringify({ content: { raw: payload.body ?? "" } }) }
      );
    } else if (payload.action === "comment" && payload.body) {
      await this.addComment(repo, prNumber, payload.body);
    }
  }
}
