"use client";

import { memo, useEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { Send, X, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReview } from "./ReviewContext";

/* ────────────────────────────────────────────────────────────── */
/*  SVG icons reused from the old file (Mermaid fullscreen)       */
/* ────────────────────────────────────────────────────────────── */

const MAXIMIZE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

/* ────────────────────────────────────────────────────────────── */
/*  Helpers                                                       */
/* ────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────── */
/*  Memoized HTML container – prevents React from resetting       */
/*  innerHTML on parent state changes (addingAtLine, etc.)        */
/* ────────────────────────────────────────────────────────────── */

const MarkdownContent = memo(function MarkdownContent({
  html,
  innerRef,
}: {
  readonly html: string;
  readonly innerRef: Ref<HTMLDivElement>;
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
  readonly html: string;
  /** File path relative to repo root (e.g. "docs/README.md") */
  readonly filePath?: string;
}

/** Describes an open inline annotation widget */
interface ActiveLine {
  line: number;
  blockEl: HTMLElement;
  rowEl: HTMLElement | null;
}

export function MarkdownViewer({ html, filePath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const review = useReview();
  const isReviewMode = Boolean(review?.pr && filePath);

  const [activeLine, setActiveLine] = useState<ActiveLine | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  /* reset widget when file changes */
  useEffect(() => {
    setActiveLine(null);
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
      document.body.append(overlay);

      overlay.addEventListener("click", (mouseEvent) => {
        if (mouseEvent.target === overlay) closeFullscreen();
      });
      overlay
        .querySelector(".mermaid-fullscreen-close")
        ?.addEventListener("click", closeFullscreen);
    }

    function closeFullscreen() {
      if (overlay?.parentNode) {
        overlay.remove();
        overlay = null;
      }
    }

    function handleKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape" && overlay) closeFullscreen();
    }
    globalThis.addEventListener("keydown", handleKeyDown);

    async function renderMermaid() {
      const mermaidModule = await import("mermaid");
      const mermaid = mermaidModule.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "loose",
      });

      for (const [index, div] of rawDivs.entries()) {
        if (cancelled) return;
        const encoded = div.dataset.diagram ?? "";
        const diagram = decodeURIComponent(encoded);

        try {
          // eslint-disable-next-line sonarjs/pseudo-random
          const id = `mermaid-svg-${String(index)}-${Math.random().toString(36).slice(2)}`;
          const { svg } = await mermaid.render(id, diagram);
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!cancelled) {
            div.innerHTML = svg;
            div.classList.add("mermaid-container");
            div.classList.remove("mermaid-raw");

            const wrapper = document.createElement("div");
            wrapper.className = "mermaid-wrapper";
            div.parentNode?.insertBefore(wrapper, div);
            wrapper.append(div);

            const button = document.createElement("button");
            button.className = "mermaid-fullscreen-btn";
            button.setAttribute("aria-label", "Afficher en plein écran");
            button.title = "Plein écran";
            button.innerHTML = MAXIMIZE_ICON;
            button.addEventListener("click", () => {
              const svgElement = div.querySelector("svg");
              if (svgElement) openFullscreen(svgElement.outerHTML);
            });
            wrapper.append(button);
          }
        } catch (error) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (!cancelled) {
            div.innerHTML = `<div class="text-xs text-red-500 font-mono whitespace-pre-wrap break-all">Mermaid error: ${String(error)}</div>`;
            div.classList.add("mermaid-container");
            div.classList.remove("mermaid-raw");
          }
        }
      }
    }

    void renderMermaid();
    return () => {
      cancelled = true;
      globalThis.removeEventListener("keydown", handleKeyDown);
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
    const directBlocks = [...allBlocks].filter(
      (element) => element.parentElement === container
    );

    for (const block of directBlocks) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lineStart = Number.parseInt(block.dataset.sourceLineStart!);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const lineEnd   = Number.parseInt(block.dataset.sourceLineEnd!);

      block.classList.add("review-annotated-block");
      cleanups.push(() => { block.classList.remove("review-annotated-block"); });

      /* ── Detect fine-grained sub-items ────────────────────── */
      const tableRows = [...block.querySelectorAll<HTMLElement>("tr")];
      const codeLineSpans = [...block.querySelectorAll<HTMLElement>("span.line")].filter((s) => s.childNodes.length > 0);
      const subElements: HTMLElement[] = tableRows.length > 0 ? tableRows : codeLineSpans;
      const hasFineGrained = subElements.length > 0;

      /* ── Build one gutter button (+ or count badge) ────────── */
      const makeButton = (
        targetLine: number,
        rowElementForLine: HTMLElement | null
      ): HTMLButtonElement => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "review-line-plus";
        button.dataset.line = String(targetLine);
        const count = fileComments.filter((c) => c.line === targetLine).length;
        if (count > 0) {
          button.classList.add("review-line-plus--has-comments");
          button.innerHTML = `<span class="review-line-count">${String(count)}</span>`;
          button.title = `${String(count)} commentaire(s)`;
        } else {
          button.textContent = "+";
          button.title = `Commenter ligne ${String(targetLine)}`;
        }
        button.addEventListener("click", (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const line = Number.parseInt(button.dataset.line!);
          // eslint-disable-next-line sonarjs/no-nested-functions
          setActiveLine((previous) =>
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            previous?.line === line && previous?.blockEl === block
              ? null
              : { line, blockEl: block, rowEl: rowElementForLine }
          );
        });
        return button;
      };

      if (hasFineGrained) {
        /* ── Fine-grained: one button per sub-element ─────────── */
        block.dataset.fineGrained = "true";
        cleanups.push(() => delete block.dataset.fineGrained);

        const buttonMap = new Map<HTMLElement, HTMLButtonElement>();

        for (const [index, element] of subElements.entries()) {
          const lineForElement = Math.min(lineStart + index, lineEnd - 1);
          const button = makeButton(lineForElement, element);
          button.style.visibility = "hidden";
          block.append(button);
          buttonMap.set(element, button);
          cleanups.push(() => { button.remove(); });
        }

        const rafId = requestAnimationFrame(() => {
          for (const [element, button] of buttonMap) {
            const midY = element.offsetTop + element.offsetHeight / 2;
            button.style.top = `${String(midY - 11)}px`;
            button.style.visibility = "";
          }
        });
        cleanups.push(() => { cancelAnimationFrame(rafId); });

        for (const [element, button] of buttonMap) {
          const onEnter = () => { button.classList.add("review-line-plus--row-hover"); };
          const onLeave = () => { button.classList.remove("review-line-plus--row-hover"); };
          element.addEventListener("mouseenter", onEnter);
          element.addEventListener("mouseleave", onLeave);
          cleanups.push(() => {
            element.removeEventListener("mouseenter", onEnter);
            element.removeEventListener("mouseleave", onLeave);
          });
        }
      } else {
        /* ── Plain block: single button, CSS hover on block ──── */
        const button = makeButton(lineStart, null);
        block.prepend(button);
        cleanups.push(() => { button.remove(); });
      }
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, isReviewMode, review?.pr, review?.comments, filePath]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Widget portal container – positioned below the active row   */
  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!activeLine) {
      setPortalContainer(null);
      return;
    }
    const { blockEl, rowEl } = activeLine;
    const div = document.createElement("div");
    div.className = "inline-comment-widget";
    blockEl.append(div);

    const rafId = requestAnimationFrame(() => {
      const top = rowEl
        ? rowEl.offsetTop + rowEl.offsetHeight
        : blockEl.offsetHeight;
      div.style.top = `${String(top)}px`;
    });

    setPortalContainer(div);
    return () => {
      cancelAnimationFrame(rafId);
      div.remove();
      setPortalContainer(null);
    };
  }, [activeLine]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Active-button highlight                                      */
  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    for (const element of container
      .querySelectorAll<HTMLElement>(".review-line-plus--active")) element.classList.remove("review-line-plus--active");
    if (activeLine === null) return;
    const activeButton = container.querySelector<HTMLElement>(
      `.review-line-plus[data-line="${String(activeLine.line)}"]`
    );
    activeButton?.classList.add("review-line-plus--active");
  }, [activeLine]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Render                                                      */
  /* ──────────────────────────────────────────────────────────── */
  return (
    <div className={isReviewMode ? "review-mode" : undefined}>
      <MarkdownContent html={html} innerRef={containerRef} />
      {/* Rule rendering-conditional-render: use explicit ternary to avoid
          rendering falsy strings when filePath is "" or portalContainer is null */}
      {portalContainer !== null && activeLine !== null && filePath !== undefined
        ? createPortal(
            <InlineCommentWidget
              line={activeLine.line}
              filePath={filePath}
              onClose={() => { setActiveLine(null); }}
            />,
            portalContainer
          )
        : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Unified inline comment widget (comments + form in one block)  */
/* ────────────────────────────────────────────────────────────── */

function InlineCommentWidget({
  line,
  filePath,
  onClose,
}: {
  readonly line: number;
  readonly filePath: string;
  readonly onClose: () => void;
}) {
  const review = useReview();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<
    string | number | null
  >(null);

  const lineComments =
    review?.comments.filter((c) => c.path === filePath && c.line === line) ??
    [];

  // Rule advanced-event-handler-refs: store the callback in a ref so the
  // effect never needs to re-subscribe when onClose identity changes.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    const handle = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        keyboardEvent.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); };
  }, []); // stable subscription — no dep on onClose

  const handleSubmit = async () => {
    if (!body.trim() || !review) return;
    setSubmitting(true);
    await review.addInlineComment(filePath, line, body.trim());
    setBody("");
    setSubmitting(false);
  };

  const handleDelete = async (id: string | number, cType?: string) => {
    if (!review) return;
    await review.deleteComment(id, cType);
    setConfirmDeleteId(null);
  };

  return (
    <div className="inline-comment-widget-inner">
      {/* Header */}
      <div className="inline-comment-widget-header">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <MessageSquare className="h-3 w-3" />
          Ligne {line}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Existing comments */}
      {lineComments.length > 0 && (
        <div className="inline-comment-list">
          {lineComments.map((c) => (
            <div
              key={c.id}
              className={`inline-comment-card${c.isOwn ? " own" : ""}`}
            >
              <div className="inline-comment-header">
                <span className="inline-comment-author">{c.author}</span>
                <span className="inline-comment-time">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
                {/* Token mode: anyone can delete. OAuth mode: only own comments. */}
                {review?.canReview &&
                  (review.authMode === "token" || c.isOwn) && (
                  <button
                    type="button"
                    title="Supprimer ce commentaire"
                    onClick={() => { setConfirmDeleteId(c.id); }}
                    className="inline-comment-delete-btn"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="inline-comment-body">{c.body}</div>
            </div>
          ))}
          <div className="inline-comment-divider" />
        </div>
      )}

      {/* New comment form */}
      <Textarea
        value={body}
        onChange={(changeEvent) => { setBody(changeEvent.target.value); }}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key === "Enter" && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) void handleSubmit();
        }}
        placeholder="Votre commentaire… (Ctrl+Entrée pour envoyer)"
        rows={3}
        className="text-sm resize-none mb-2"
        autoFocus={lineComments.length === 0}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} className="text-xs">
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

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (() => {
        const c = lineComments.find((x) => x.id === confirmDeleteId);
        return (
          <ConfirmModal
            message="Supprimer ce commentaire définitivement ?"
            onConfirm={() => handleDelete(confirmDeleteId, c?.commentType)}
            onCancel={() => { setConfirmDeleteId(null); }}
          />
        );
      })()}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Confirmation modal (portal into document.body)               */
/* ────────────────────────────────────────────────────────────── */

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Rule advanced-event-handler-refs: store the callback in a ref so the
  // effect never needs to re-subscribe when onCancel identity changes.
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

  useEffect(() => {
    const handle = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        keyboardEvent.stopPropagation();
        onCancelRef.current();
      }
    };
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); };
  }, []); // stable subscription — no dep on onCancel

  return createPortal(
    <div
      className="confirm-modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="confirm-modal"
        onClick={(clickEvent) => { clickEvent.stopPropagation(); }}
      >
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Supprimer
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

