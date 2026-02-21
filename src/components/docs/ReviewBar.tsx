"use client";

import { useState } from "react";
import {
  MessageSquare,
  Plus,
  CheckCircle,
  XCircle,
  Send,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useReview } from "./ReviewContext";
import type { ReviewComment } from "@/lib/review/types";

export function ReviewBar() {
  const review = useReview();
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!review || review.isDefaultBranch) return null;

  if (review.loading) {
    return (
      <div className="border-t bg-muted/30 px-4 py-2 flex items-center gap-2 text-sm text-muted-foreground shrink-0">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de la revue…
      </div>
    );
  }

  /* ── OAuth mode without valid session ───────────────────────── */
  if (review.authMode === "oauth" && !review.canReview) {
    const providerLabel =
      review.repoType === "github"
        ? "GitHub"
        : review.repoType === "gitlab"
          ? "GitLab"
          : review.repoType;
    return (
      <div className="border-t bg-muted/30 px-4 py-3 flex items-center gap-3 shrink-0">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Connectez-vous pour activer les revues
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={review.signInForReview}
          className="gap-1"
        >
          Se connecter avec {providerLabel}
        </Button>
      </div>
    );
  }

  /* ── Token mode but no token configured ────────────────────── */
  if (!review.canReview) {
    return (
      <div className="border-t bg-muted/30 px-4 py-3 flex items-center gap-3 shrink-0">
        <MessageSquare className="h-4 w-4 text-amber-500" />
        <span className="text-sm text-muted-foreground">
          Aucun token configuré pour les revues. Ajoutez{" "}
          <code className="text-xs bg-muted px-1 rounded">token</code> dans{" "}
          <code className="text-xs bg-muted px-1 rounded">.docshub.yml</code>.
        </span>
      </div>
    );
  }

  /* ── No PR exists → offer to create one ────────────────────── */
  if (!review.pr) {
    return (
      <div className="border-t bg-muted/30 px-4 py-3 flex items-center gap-3 shrink-0">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Aucune pull request pour cette branche
        </span>
        <Button
          size="sm"
          onClick={() => review.createPR()}
          className="gap-1"
        >
          <Plus className="h-3 w-3" />
          Nouvelle revue
        </Button>
      </div>
    );
  }

  /* ── PR exists ─────────────────────────────────────────────── */
  const globalComments = review.comments.filter((c) => !c.path);
  const inlineCount = review.comments.filter((c) => !!c.path).length;

  const handleSubmitComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    await review.addComment(comment.trim());
    setComment("");
    setSubmitting(false);
  };

  const handleReview = async (action: "approve" | "request_changes") => {
    setSubmitting(true);
    await review.submitReview(action, comment.trim() || undefined);
    setComment("");
    setSubmitting(false);
    setExpanded(false);
  };

  return (
    <div className="border-t bg-muted/30 shrink-0">
      {/* Collapsed bar */}
      <div className="px-4 py-2 flex items-center gap-3">
        <MessageSquare className="h-4 w-4 text-primary shrink-0" />
        <a
          href={review.pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline truncate flex items-center gap-1"
        >
          PR #{review.pr.number}: {review.pr.title}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {inlineCount > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {inlineCount} inline
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {review.comments.length} commentaire
            {review.comments.length !== 1 ? "s" : ""}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Expanded area */}
      {expanded && (
        <div className="border-t">
          {/* Global comments */}
          {globalComments.length > 0 && (
            <ScrollArea className="max-h-48">
              <div className="px-4 py-2 space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Commentaires globaux
                </span>
                {globalComments.map((c) => (
                  <GlobalCommentCard key={c.id} comment={c} />
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Review actions */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <Textarea
              placeholder="Commentaire global (optionnel)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs gap-1"
                onClick={handleSubmitComment}
                disabled={submitting || !comment.trim()}
              >
                <Send className="h-3 w-3" />
                Commenter
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50"
                onClick={() => handleReview("approve")}
                disabled={submitting}
              >
                <CheckCircle className="h-3 w-3" />
                Approuver
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-xs gap-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => handleReview("request_changes")}
                disabled={submitting}
              >
                <XCircle className="h-3 w-3" />
                Modifications
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GlobalCommentCard({ comment }: { comment: ReviewComment }) {
  return (
    <div
      className={cn(
        "rounded-md border p-2 text-xs",
        comment.isOwn ? "bg-primary/5 border-primary/20" : "bg-card"
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <User className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{comment.author}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {comment.body}
      </p>
    </div>
  );
}
