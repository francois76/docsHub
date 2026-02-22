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
      throw new Error(`GitHub API error ${res.status}: ${text}`);
    }
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

    const toComment = (c: any, inline = false): ReviewComment => {
      const rawBody: string = c.body ?? "";
      // Parse hidden markers embedded in fallback issue comments.
      const lineMatch = rawBody.match(/\n?<!-- docshub:line=(\d+) -->/);
      const pathMatch = rawBody.match(/\n?<!-- docshub:path=([^\s>]+) -->/);
      const docshubLine = lineMatch ? parseInt(lineMatch[1]) : undefined;
      const docshubPath = pathMatch ? pathMatch[1] : undefined;
      // Strip markers so they never appear as visible text in docsHub.
      const body = rawBody
        .replace(/\n?<!-- docshub:line=\d+ -->/, "")
        .replace(/\n?<!-- docshub:path=[^\s>]+ -->/, "")
        .trimEnd();
      // Issue comment with embedded markers acts as an inline comment.
      const isEmbedded = !inline && !!docshubLine && !!docshubPath;
      return {
        id: c.id,
        author: c.user?.login ?? "unknown",
        body,
        createdAt: c.created_at,
        path: inline ? c.path : (isEmbedded ? docshubPath : undefined),
        line: inline
          ? (c.line ?? c.original_line ?? docshubLine)
          : (isEmbedded ? docshubLine : undefined),
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

    // Fetch the PR node_id needed by the GraphQL API
    const prData = await this.request<any>(`/repos/${repo}/pulls/${prNumber}`);

    const graphqlUrl = this.baseUrl.replace(/\/api\/v3\/?$/, "/api/graphql")
      .replace(/^(https:\/\/api\.github\.com)\/?$/, "$1/graphql");

    // Try line-level comment first (works if the line is in a diff hunk).
    const node = await this.graphqlCreateThread(graphqlUrl, prData.node_id, {
      body: displayBody,
      path: filePath,
      line,
      side: "RIGHT",
      subjectType: "LINE",
    });

    if (node) {
      return {
        id: node.databaseId,
        author: node.author?.login ?? "unknown",
        body: node.body,
        createdAt: node.createdAt,
        path: node.path ?? filePath,
        line: node.line ?? line,
        isOwn: true,
      };
    }

    // Fallback: post as a regular issue comment with embedded markers.
    // GraphQL FILE-level threads are pending until a review is submitted,
    // so they are not reliably returned by the REST comments endpoint on refresh.
    // An issue comment is always immediately visible.
    const fallbackBody =
      `${displayBody}\n\n` +
      `> 📄 \`${filePath}\` — ligne ${line}\n` +
      `<!-- docshub:path=${filePath} -->\n` +
      `<!-- docshub:line=${line} -->`;
    const ic = await this.request<any>(
      `/repos/${repo}/issues/${prNumber}/comments`,
      { method: "POST", body: JSON.stringify({ body: fallbackBody }) }
    );
    return {
      id: ic.id,
      author: ic.user?.login ?? "unknown",
      // Return clean body (without markers) to the caller.
      body: displayBody,
      createdAt: ic.created_at,
      path: filePath,
      line,
      isOwn: true,
    };
  }

  /**
   * Create a review thread via the GitHub GraphQL API.
   * Returns the first comment node, or null if `thread` came back null
   * (which means GitHub couldn't resolve the target).
   */
  private async graphqlCreateThread(
    graphqlUrl: string,
    pullRequestNodeId: string,
    input: Record<string, unknown>
  ): Promise<any | null> {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          mutation($input: AddPullRequestReviewThreadInput!) {
            addPullRequestReviewThread(input: $input) {
              thread {
                comments(first: 1) {
                  nodes {
                    databaseId
                    author { login }
                    body
                    createdAt
                    path
                    line
                  }
                }
              }
            }
          }`,
        variables: {
          input: {
            pullRequestId: pullRequestNodeId,
            ...input,
          },
        },
      }),
    });

    const json = await res.json();

    if (json.errors?.length) {
      throw new Error(json.errors.map((e: any) => e.message).join("; "));
    }

    return json.data?.addPullRequestReviewThread?.thread?.comments?.nodes?.[0] ?? null;
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

  async deleteComment(
    repo: string,
    commentId: string | number,
    commentType?: string
  ): Promise<void> {
    if (commentType === "issue_comment") {
      await this.requestDelete(`/repos/${repo}/issues/comments/${commentId}`);
      return;
    }
    // Try review comment first; fall back to issue comment if 404/error.
    try {
      await this.requestDelete(`/repos/${repo}/pulls/comments/${commentId}`);
    } catch {
      await this.requestDelete(`/repos/${repo}/issues/comments/${commentId}`);
    }
  }
}
