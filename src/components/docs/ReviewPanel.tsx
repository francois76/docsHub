"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Send,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PullRequest, ReviewComment } from "@/lib/review/types";
import { toast } from "sonner";

interface Props {
  repo: string;
  branch: string;
  filePath?: string;
}

export function ReviewPanel({ repo, branch, filePath }: Props) {
  const { data: session } = useSession();
  const [pr, setPr] = useState<PullRequest | null>(null);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/reviews/${encodeURIComponent(repo)}?branch=${encodeURIComponent(branch)}`
    )
      .then((r) => r.json())
      .then((d) => {
        setPr(d.pr ?? null);
        setComments(d.comments ?? []);
        setCanReview(d.canReview ?? false);
      })
      .finally(() => setLoading(false));
  }, [repo, branch]);

  const submitComment = async () => {
    if (!pr || !comment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(repo)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prNumber: pr.number,
          action: "comment",
          comment: comment.trim(),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setComments((prev) => [...prev, data as ReviewComment]);
      setComment("");
      toast.success("Comment added");
    } catch (err) {
      toast.error(`Failed to add comment: ${err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async (action: "approve" | "request_changes") => {
    if (!pr) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${encodeURIComponent(repo)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prNumber: pr.number,
          action,
          comment: comment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setComment("");
      toast.success(
        action === "approve" ? "PR approved!" : "Changes requested"
      );
    } catch (err) {
      toast.error(`Failed: ${err}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Only show the review panel on non-default branches
  if (loading) {
    return (
      <div className="w-80 border-l flex items-center justify-center p-4 text-sm text-muted-foreground">
        Loading reviews…
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="w-80 border-l p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>No open PR for this branch</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("border-l flex flex-col bg-background transition-all", collapsed ? "w-12" : "w-80")}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">Review</span>
            <Badge variant="secondary" className="text-xs shrink-0">
              PR #{pr.number}
            </Badge>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </div>

      {!collapsed && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* PR info */}
          <div className="p-3 border-b bg-muted/30">
            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary hover:underline line-clamp-2"
            >
              {pr.title}
            </a>
            <div className="text-xs text-muted-foreground mt-1">
              {pr.head} → {pr.base}
            </div>
          </div>

          <Tabs defaultValue="comments" className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="mx-3 mt-2 w-auto">
              <TabsTrigger value="comments" className="text-xs flex-1">
                Comments ({comments.length})
              </TabsTrigger>
              <TabsTrigger value="review" className="text-xs flex-1">
                Review
              </TabsTrigger>
            </TabsList>

            {/* Comments tab */}
            <TabsContent value="comments" className="flex-1 overflow-hidden mt-0">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-3">
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No comments yet
                    </p>
                  ) : (
                    comments.map((c) => (
                      <CommentCard key={c.id} comment={c} />
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Review tab */}
            <TabsContent value="review" className="mt-0 p-3 flex flex-col gap-2">
              {!session ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    Sign in to review
                  </p>
                  <Button size="sm" onClick={() => signIn()}>
                    Sign In
                  </Button>
                </div>
              ) : (
                <>
                  <Textarea
                    placeholder="Leave a comment or review…"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={4}
                    className="text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs gap-1"
                      onClick={submitComment}
                      disabled={submitting || !comment.trim()}
                    >
                      <Send className="h-3 w-3" />
                      Comment
                    </Button>
                  </div>
                  <div className="flex gap-2 pt-1 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => submitReview("approve")}
                      disabled={submitting}
                    >
                      <CheckCircle className="h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => submitReview("request_changes")}
                      disabled={submitting}
                    >
                      <XCircle className="h-3 w-3" />
                      Changes
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function CommentCard({ comment }: { comment: ReviewComment }) {
  return (
    <div
      className={cn(
        "rounded-md border p-2.5 text-xs",
        comment.isOwn ? "bg-primary/5 border-primary/20" : "bg-card"
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <User className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{comment.author}</span>
        {comment.path && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 ml-auto">
            {comment.path.split("/").pop()}:{comment.line}
          </Badge>
        )}
      </div>
      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {comment.body}
      </p>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        {new Date(comment.createdAt).toLocaleString()}
      </div>
    </div>
  );
}
