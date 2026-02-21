"use client";

import { memo, useEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Send, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReview } from "./ReviewContext";
import type { ReviewComment } from "@/lib/review/types";

/* ────────────────────────────────────────────────────────────── */
/*  SVG icons reused from the old file (Mermaid fullscreen)       */
/* ────────────────────────────────────────────────────────────── */

const MAXIMIZE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

/* ────────────────────────────────────────────────────────────── */
/*  Helpers                                                       */
/* ────────────────────────────────────────────────────────────── */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ────────────────────────────────────────────────────────────── */
/*  Memoized HTML container – prevents React from resetting       */
/*  innerHTML on parent state changes (addingAtLine, etc.)        */
/* ────────────────────────────────────────────────────────────── */

const MarkdownContent = memo(function MarkdownContent({
  html,
  innerRef,
}: {
  html: string;
  innerRef: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

/* ────────────────────────────────────────────────────────────── */
/*  MarkdownViewer                                                */
/* ────────────────────────────────────────────────────────────── */

interface Props {
  html: string;
  /** File path relative to repo root (e.g. "docs/README.md") */
  filePath?: string;
}

export function MarkdownViewer({ html, filePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const review = useReview();
  const isReviewMode = !!(review?.pr && filePath);

  /* state for inline comment form */
  const [addingAtLine, setAddingAtLine] = useState<number | null>(null);
  const [formContainer, setFormContainer] = useState<HTMLDivElement | null>(
    null
  );

  /* reset form when file changes */
  useEffect(() => {
    setAddingAtLine(null);
  }, [filePath]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Mermaid rendering (unchanged logic from original)           */
  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rawDivs =
      container.querySelectorAll<HTMLDivElement>(".mermaid-raw");
    if (rawDivs.length === 0) return;

    let cancelled = false;
    let overlay: HTMLDivElement | null = null;

    function openFullscreen(svgHtml: string) {
      overlay = document.createElement("div");
      overlay.className = "mermaid-fullscreen-overlay";
      overlay.innerHTML = `
        <div class="mermaid-fullscreen-modal">
          <button class="mermaid-fullscreen-close" aria-label="Fermer">${CLOSE_ICON}</button>
          <div class="mermaid-fullscreen-content">${svgHtml}</div>
        </div>`;
      document.body.appendChild(overlay);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeFullscreen();
      });
      overlay
        .querySelector(".mermaid-fullscreen-close")
        ?.addEventListener("click", closeFullscreen);
    }

    function closeFullscreen() {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
        overlay = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && overlay) closeFullscreen();
    }
    window.addEventListener("keydown", handleKeyDown);

    async function renderMermaid() {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
      });

      for (let i = 0; i < rawDivs.length; i++) {
        if (cancelled) return;
        const div = rawDivs[i];
        const encoded = div.getAttribute("data-diagram") ?? "";
        const diagram = decodeURIComponent(encoded);

        try {
          const id = `mermaid-svg-${i}-${Math.random().toString(36).slice(2)}`;
          const { svg } = await mermaid.render(id, diagram);
          if (!cancelled) {
            div.innerHTML = svg;
            div.classList.add("mermaid-container");
            div.classList.remove("mermaid-raw");

            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-wrapper";
            div.parentNode?.insertBefore(wrapper, div);
            wrapper.appendChild(div);

            const btn = document.createElement("button");
            btn.className = "mermaid-fullscreen-btn";
            btn.setAttribute("aria-label", "Afficher en plein écran");
            btn.title = "Plein écran";
            btn.innerHTML = MAXIMIZE_ICON;
            btn.addEventListener("click", () => {
              const svgEl = div.querySelector("svg");
              if (svgEl) openFullscreen(svgEl.outerHTML);
            });
            wrapper.appendChild(btn);
          }
        } catch (err) {
          if (!cancelled) {
            div.innerHTML = `<div class="text-xs text-red-500 font-mono whitespace-pre-wrap break-all">Mermaid error: ${String(err)}</div>`;
            div.classList.add("mermaid-container");
            div.classList.remove("mermaid-raw");
          }
        }
      }
    }

    renderMermaid();
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKeyDown);
      closeFullscreen();
    };
  }, [html]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Review inline annotations                                   */
  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isReviewMode || !review) return;

    const fileComments = review.comments.filter((c) => c.path === filePath);
    const cleanups: (() => void)[] = [];

    /* Only annotate direct children of the markdown body */
    const allBlocks = container.querySelectorAll<HTMLElement>(
      "[data-source-line-start]"
    );
    const directBlocks = Array.from(allBlocks).filter(
      (el) => el.parentElement === container
    );

    directBlocks.forEach((block) => {
      const lineStart = parseInt(
        block.getAttribute("data-source-line-start")!
      );
      const lineEnd = parseInt(block.getAttribute("data-source-line-end")!);

      block.classList.add("review-annotated-block");

      /* "+" button in left gutter */
      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "review-line-plus";
      plusBtn.dataset.line = String(lineStart);
      plusBtn.textContent = "+";
      plusBtn.title = `Commenter ligne ${lineStart}`;
      plusBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setAddingAtLine((prev) => (prev === lineStart ? null : lineStart));
      });
      block.prepend(plusBtn);
      cleanups.push(() => plusBtn.remove());

      /* Inline comments attached to this block's line range */
      const blockComments = fileComments.filter(
        (c) =>
          c.line !== undefined && c.line >= lineStart && c.line <= lineEnd
      );

      if (blockComments.length > 0) {
        const commentsDiv = document.createElement("div");
        commentsDiv.className = "inline-comments-group";
        blockComments.forEach((c) => {
          const card = document.createElement("div");
          card.className = `inline-comment-card${c.isOwn ? " own" : ""}`;
          card.innerHTML = `
            <div class="inline-comment-header">
              <span class="inline-comment-author">${escapeHtml(c.author)}</span>
              ${c.line ? `<span class="inline-comment-line">L${c.line}</span>` : ""}
              <span class="inline-comment-time">${new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <div class="inline-comment-body">${escapeHtml(c.body)}</div>
          `;
          commentsDiv.appendChild(card);
        });
        block.after(commentsDiv);
        cleanups.push(() => commentsDiv.remove());
      }
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [html, isReviewMode, review?.pr, review?.comments, filePath]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Comment form container (portal target)                      */
  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || addingAtLine === null) return;

    const allBlocks = container.querySelectorAll<HTMLElement>(
      "[data-source-line-start]"
    );
    const directBlocks = Array.from(allBlocks).filter(
      (el) => el.parentElement === container
    );

    for (const block of directBlocks) {
      const lineStart = parseInt(
        block.getAttribute("data-source-line-start")!
      );
      if (lineStart === addingAtLine) {
        const formDiv = document.createElement("div");
        formDiv.className = "inline-add-comment-container";

        /* Insert after the block (and after any existing comment group) */
        let insertAfter: Element = block;
        while (
          insertAfter.nextElementSibling?.classList.contains(
            "inline-comments-group"
          )
        ) {
          insertAfter = insertAfter.nextElementSibling;
        }
        insertAfter.after(formDiv);
        setFormContainer(formDiv);

        return () => {
          formDiv.remove();
          setFormContainer(null);
        };
      }
    }
  }, [addingAtLine, html]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Active-line highlight & "+" visibility when form is open   */
  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /* Remove any previous active marker */
    container
      .querySelectorAll<HTMLElement>(".review-line-plus--active")
      .forEach((el) => el.classList.remove("review-line-plus--active"));

    if (addingAtLine === null) {
      container.classList.remove("review-has-active-comment");
      return;
    }

    /* Make all "+" buttons faintly visible while form is open */
    container.classList.add("review-has-active-comment");

    /* Highlight the specific button for the active line */
    const activeBtn = container.querySelector<HTMLElement>(
      `.review-line-plus[data-line="${addingAtLine}"]`
    );
    activeBtn?.classList.add("review-line-plus--active");
  }, [addingAtLine]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Render                                                      */
  /* ──────────────────────────────────────────────────────────── */
  return (
    <div className={isReviewMode ? "review-mode" : undefined}>
      <MarkdownContent html={html} innerRef={containerRef} />
      {formContainer &&
        addingAtLine !== null &&
        filePath &&
        createPortal(
          <AddCommentForm
            line={addingAtLine}
            filePath={filePath}
            onClose={() => setAddingAtLine(null)}
          />,
          formContainer
        )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Inline comment form (rendered via portal)                     */
/* ────────────────────────────────────────────────────────────── */

function AddCommentForm({
  line,
  filePath,
  onClose,
}: {
  line: number;
  filePath: string;
  onClose: () => void;
}) {
  const review = useReview();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* Close on Escape key */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // onClose is stable (setAddingAtLine is a stable React setter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!body.trim() || !review) return;
    setSubmitting(true);
    await review.addInlineComment(filePath, line, body.trim());
    setBody("");
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="inline-add-comment-form">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          Commentaire ligne {line}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
        }}
        placeholder="Votre commentaire… (Échap pour fermer, Ctrl+Entrée pour envoyer)"
        rows={3}
        className="text-sm resize-none mb-2"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="text-xs"
        >
          Annuler
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !body.trim()}
          className="text-xs gap-1"
        >
          <Send className="h-3 w-3" />
          Envoyer
        </Button>
      </div>
    </div>
  );
}