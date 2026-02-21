import type {
  ReviewProvider,
  ReviewComment,
  PullRequest,
  SubmitReviewPayload,
} from "./types";

export type BitbucketVariant = "cloud" | "server";

/**
 * Supports both Bitbucket Cloud (api.bitbucket.org/2.0) and
 * Bitbucket Server / Data Center (on-premise, REST API 1.0).
 *
 * Repo format:
 *   - Cloud:  "workspace/repo-slug"
 *   - Server: "PROJECT_KEY/repo-slug"
 */
export class BitbucketReviewProvider implements ReviewProvider {
  private token: string;
  private baseUrl: string;
  private userName?: string;
  private variant: BitbucketVariant;

  constructor(
    token: string,
    /** Base origin for the instance (e.g. "https://bitbucket.mycompany.com").
     *  Defaults to "https://api.bitbucket.org" for cloud. */
    baseOrigin?: string,
    userName?: string,
    variant: BitbucketVariant = "cloud"
  ) {
    this.token = token;
    this.variant = variant;
    this.userName = userName;

    if (variant === "server") {
      // On-premise: caller must supply the origin; API path is /rest/api/1.0
      if (!baseOrigin) {
        throw new Error(
          "BitbucketReviewProvider: baseOrigin is required for the \"server\" variant"
        );
      }
      this.baseUrl = `${baseOrigin.replace(/\/$/, "")}/rest/api/1.0`;
    } else {
      this.baseUrl = `${(baseOrigin ?? "https://api.bitbucket.org").replace(/\/$/, "")}/2.0`;
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /**
   * Build the per-repo prefix for a given path.
   *   Cloud:  /repositories/{workspace}/{repo}
   *   Server: /projects/{PROJECT}/repos/{slug}
   */
  private repoPrefix(repo: string): string {
    const [first, second] = repo.split("/");
    if (this.variant === "server") {
      return `/projects/${first}/repos/${second}`;
    }
    return `/repositories/${repo}`;
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

  /** Convert a Bitbucket Server timestamp (ms epoch) to an ISO string. */
  private static serverTs(ms: number): string {
    return new Date(ms).toISOString();
  }

  // ── ReviewProvider interface ────────────────────────────────────────────────

  async findPR(repo: string, headBranch: string): Promise<PullRequest | null> {
    const prefix = this.repoPrefix(repo);

    if (this.variant === "server") {
      // Server: filter by source branch via `at` + `state` query params
      const data = await this.request<any>(
        `${prefix}/pull-requests?at=${encodeURIComponent(`refs/heads/${headBranch}`)}&state=OPEN&limit=5`
      );
      const prs: any[] = data.values ?? [];
      if (!prs.length) return null;
      const pr = prs[0];
      return {
        id: pr.id,
        number: pr.id,
        title: pr.title,
        state: pr.state === "OPEN" ? "open" : (pr.state as string).toLowerCase() as PullRequest["state"],
        head: pr.fromRef?.displayId ?? headBranch,
        base: pr.toRef?.displayId ?? "",
        url: pr.links?.self?.[0]?.href ?? "",
      };
    }

    // Cloud
    const data = await this.request<any>(
      `${prefix}s?q=source.branch.name="${headBranch}" AND state="OPEN"&pagelen=5`
    );
    const prs: any[] = data.values ?? [];
    if (!prs.length) return null;
    const pr = prs[0];
    return {
      id: pr.id,
      number: pr.id,
      title: pr.title,
      state: pr.state === "OPEN" ? "open" : (pr.state as string).toLowerCase() as PullRequest["state"],
      head: pr.source.branch.name,
      base: pr.destination.branch.name,
      url: pr.links.html.href,
    };
  }

  async listComments(repo: string, prNumber: number): Promise<ReviewComment[]> {
    const prefix = this.repoPrefix(repo);

    if (this.variant === "server") {
      const data = await this.request<any>(
        `${prefix}/pull-requests/${prNumber}/comments?limit=100`
      );
      const comments: any[] = data.values ?? [];
      return comments
        .map((c: any) => ({
          id: c.id,
          author: c.author?.slug ?? c.author?.name ?? "unknown",
          body: c.text ?? "",
          createdAt: BitbucketReviewProvider.serverTs(c.createdDate),
          path: c.anchor?.path,
          line: c.anchor?.line,
          isOwn: this.userName
            ? (c.author?.slug ?? c.author?.name) === this.userName
            : false,
        }))
        .sort(
          (a: ReviewComment, b: ReviewComment) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
    }

    // Cloud
    const data = await this.request<any>(
      `${prefix}/pullrequests/${prNumber}/comments?pagelen=100`
    );
    const comments: any[] = data.values ?? [];
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
    const prefix = this.repoPrefix(repo);
    const displayBody = this.userName ? `**[${this.userName}]:** ${body}` : body;

    if (this.variant === "server") {
      const c = await this.request<any>(
        `${prefix}/pull-requests/${prNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ text: displayBody }),
        }
      );
      return {
        id: c.id,
        author: c.author?.slug ?? c.author?.name ?? "unknown",
        body: c.text ?? "",
        createdAt: BitbucketReviewProvider.serverTs(c.createdDate),
        isOwn: true,
      };
    }

    // Cloud
    const c = await this.request<any>(
      `${prefix}/pullrequests/${prNumber}/comments`,
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
    const prefix = this.repoPrefix(repo);
    const displayBody = this.userName ? `**[${this.userName}]:** ${body}` : body;

    if (this.variant === "server") {
      const c = await this.request<any>(
        `${prefix}/pull-requests/${prNumber}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            text: displayBody,
            anchor: {
              line,
              lineType: "ADDED",
              fileType: "TO",
              path: filePath,
            },
          }),
        }
      );
      return {
        id: c.id,
        author: c.author?.slug ?? c.author?.name ?? "unknown",
        body: c.text ?? "",
        createdAt: BitbucketReviewProvider.serverTs(c.createdDate),
        path: filePath,
        line,
        isOwn: true,
      };
    }

    // Cloud
    const c = await this.request<any>(
      `${prefix}/pullrequests/${prNumber}/comments`,
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
    const prefix = this.repoPrefix(repo);

    if (this.variant === "server") {
      if (payload.action === "approve") {
        await this.request(
          `${prefix}/pull-requests/${prNumber}/approve`,
          { method: "POST" }
        );
      } else if (payload.action === "request_changes") {
        // Server: update the current user's participant status to NEEDS_WORK.
        // userName must be the user's Bitbucket Server slug.
        if (!this.userName) {
          throw new Error(
            "BitbucketReviewProvider: userName is required to request changes on a Bitbucket Server instance"
          );
        }
        await this.request(
          `${prefix}/pull-requests/${prNumber}/participants/${encodeURIComponent(this.userName)}`,
          {
            method: "PUT",
            body: JSON.stringify({
              user: { name: this.userName },
              status: "NEEDS_WORK",
            }),
          }
        );
        if (payload.body) {
          await this.addComment(repo, prNumber, payload.body);
        }
      } else if (payload.action === "comment" && payload.body) {
        await this.addComment(repo, prNumber, payload.body);
      }
      return;
    }

    // Cloud
    if (payload.action === "approve") {
      await this.request(
        `${prefix}/pullrequests/${prNumber}/approve`,
        { method: "POST" }
      );
    } else if (payload.action === "request_changes") {
      await this.request(
        `${prefix}/pullrequests/${prNumber}/request-changes`,
        { method: "POST", body: JSON.stringify({ content: { raw: payload.body ?? "" } }) }
      );
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
    const prefix = this.repoPrefix(repo);
    const prTitle = title ?? `Documentation review: ${headBranch}`;

    if (this.variant === "server") {
      const pr = await this.request<any>(`${prefix}/pull-requests`, {
        method: "POST",
        body: JSON.stringify({
          title: prTitle,
          fromRef: { id: `refs/heads/${headBranch}` },
          toRef: { id: `refs/heads/${baseBranch}` },
        }),
      });
      return {
        id: pr.id,
        number: pr.id,
        title: pr.title,
        state: "open",
        head: headBranch,
        base: baseBranch,
        url: pr.links?.self?.[0]?.href ?? "",
      };
    }

    // Cloud
    const pr = await this.request<any>(`${prefix}/pullrequests`, {
      method: "POST",
      body: JSON.stringify({
        title: prTitle,
        source: { branch: { name: headBranch } },
        destination: { branch: { name: baseBranch } },
      }),
    });
    return {
      id: pr.id,
      number: pr.id,
      title: pr.title,
      state: "open",
      head: headBranch,
      base: baseBranch,
      url: pr.links?.html?.href ?? "",
    };
  }
}
