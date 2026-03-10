"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import type { PullRequest, ReviewComment } from "@/lib/review/types";

/* ────────────────────────────────────────────────────────────── */
/*  Typed API response                                            */
/* ────────────────────────────────────────────────────────────── */

interface ReviewApiResponse {
  pr?: PullRequest;
  comments?: ReviewComment[];
  canReview?: boolean;
  error?: string;
}

/* ────────────────────────────────────────────────────────────── */
/*  Context value                                                 */
/* ────────────────────────────────────────────────────────────── */

export interface ReviewContextValue {
  /* state */
  pr: PullRequest | null;
  comments: ReviewComment[];
  canReview: boolean;
  loading: boolean;
  authMode: string;
  repoType: string;
  defaultBranch: string;
  isDefaultBranch: boolean;

  /* actions */
  createPR: (title?: string) => Promise<void>;
  addComment: (body: string) => Promise<void>;
  addInlineComment: (
    filePath: string,
    line: number,
    body: string
  ) => Promise<void>;
  deleteComment: (commentId: string | number, commentType?: string) => Promise<void>;
  submitReview: (
    action: "approve" | "request_changes",
    body?: string
  ) => Promise<void>;
  refresh: () => Promise<void>;
  signInForReview: () => void;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

export function useReview(): ReviewContextValue | null {
  return useContext(ReviewContext);
}

/* ────────────────────────────────────────────────────────────── */
/*  Provider                                                      */
/* ────────────────────────────────────────────────────────────── */

interface ReviewProviderProps {
  readonly repo: string;
  readonly branch: string;
  readonly repoType: string;
  readonly authMode: string;
  readonly defaultBranch: string;
  readonly children: React.ReactNode;
}

export function ReviewProvider({
  repo,
  branch,
  repoType,
  authMode,
  defaultBranch,
  children,
}: ReviewProviderProps): React.JSX.Element {
  const [pr, setPr] = useState<PullRequest | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);

  const isDefaultBranch = branch === defaultBranch;

  /* ── fetch review data ─────────────────────────────────────── */
  const fetchReview = useCallback(async () => {
    if (isDefaultBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reviews/${encodeURIComponent(repo)}?branch=${encodeURIComponent(branch)}`
      );
      const data = await res.json() as ReviewApiResponse;
      setPr(data.pr ?? null);
      setComments(data.comments ?? []);
      setCanReview(data.canReview ?? false);
    } catch {
      // silently fail — ReviewBar will show appropriate state
    } finally {
      setLoading(false);
    }
  }, [repo, branch, isDefaultBranch]);

  useEffect(() => {
    void fetchReview();
  }, [fetchReview]);

  /* ── create PR ─────────────────────────────────────────────── */
  const createPR = useCallback(
    async (title?: string) => {
      try {
        const res = await fetch(
          `/api/reviews/${encodeURIComponent(repo)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create_pr",
              branch,
              baseBranch: defaultBranch,
              title,
            }),
          }
        );
        const data = await res.json() as ReviewApiResponse;
        if (data.error) throw new Error(data.error);
        setPr(data.pr);
        setCanReview(true);
        toast.success("Pull request créée !");
      } catch (error) {
        toast.error(`Erreur lors de la création de la PR : ${String(error)}`);
      }
    },
    [repo, branch, defaultBranch]
  );

  /* ── global comment ────────────────────────────────────────── */
  const addComment = useCallback(
    async (body: string) => {
      if (!pr) return;
      try {
        const res = await fetch(
          `/api/reviews/${encodeURIComponent(repo)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prNumber: pr.number,
              action: "comment",
              comment: body,
            }),
          }
        );
        const data = await res.json() as ReviewApiResponse;
        if (data.error) throw new Error(data.error);
        setComments((previous) => [...previous, data as ReviewComment]);
        toast.success("Commentaire ajouté");
      } catch (error) {
        toast.error(`Erreur : ${String(error)}`);
      }
    },
    [repo, pr]
  );

  /* ── inline comment ────────────────────────────────────────── */
  const addInlineComment = useCallback(
    async (filePath: string, line: number, body: string) => {
      if (!pr) return;
      try {
        const res = await fetch(
          `/api/reviews/${encodeURIComponent(repo)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prNumber: pr.number,
              action: "comment",
              comment: body,
              filePath,
              line,
            }),
          }
        );
        const data = await res.json() as ReviewApiResponse;
        if (data.error) throw new Error(data.error);
        setComments((previous) => [...previous, data as ReviewComment]);
        toast.success("Commentaire ajouté");
      } catch (error) {
        toast.error(`Erreur : ${String(error)}`);
      }
    },
    [repo, pr]
  );

  /* ── delete comment ─────────────────────────────────────────── */
  const deleteComment = useCallback(
    async (commentId: string | number, commentType?: string) => {
      try {
        const res = await fetch(
          `/api/reviews/${encodeURIComponent(repo)}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentId, commentType }),
          }
        );
        const data = await res.json() as ReviewApiResponse;
        if (data.error) throw new Error(data.error);
        setComments((previous) => previous.filter((c) => c.id !== commentId));
        toast.success("Commentaire supprimé");
      } catch (error) {
        toast.error(`Erreur lors de la suppression : ${String(error)}`);
      }
    },
    [repo]
  );

  /* ── submit formal review ──────────────────────────────────── */
  const submitReview = useCallback(
    async (action: "approve" | "request_changes", body?: string) => {
      if (!pr) return;
      try {
        const res = await fetch(
          `/api/reviews/${encodeURIComponent(repo)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prNumber: pr.number,
              action,
              comment: body,
            }),
          }
        );
        const data = await res.json() as ReviewApiResponse;
        if (data.error) throw new Error(data.error);
        toast.success(
          action === "approve" ? "PR approuvée !" : "Modifications demandées"
        );
      } catch (error) {
        toast.error(`Erreur : ${String(error)}`);
      }
    },
    [repo, pr]
  );

  /* ── sign in (only relevant for OAuth mode) ────────────────── */
  const signInForReview = useCallback(() => {
    let provider: string | null = null;
    if (repoType === "github") provider = "github";
    else if (repoType === "gitlab") provider = "gitlab";
    if (provider) {
      void signIn(provider, { callbackUrl: globalThis.location.href });
    }
  }, [repoType]);

  return (
    <ReviewContext.Provider
      value={{
        pr,
        comments,
        canReview,
        loading,
        authMode,
        repoType,
        defaultBranch,
        isDefaultBranch,
        createPR,
        addComment,
        addInlineComment,
        deleteComment,
        submitReview,
        refresh: fetchReview,
        signInForReview,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}
