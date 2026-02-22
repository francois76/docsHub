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
  const [formContainer, setFormContainer] = useState<HTMLDivElement | null>(null);
  /* ref to the currently-open comment panel so Cancel can close it */
  const activePanelRef = useRef<HTMLDivElement | null>(null);

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
      const lineStart = parseInt(block.getAttribute("data-source-line-start")!);
      const lineEnd = parseInt(block.getAttribute("data-source-line-end")!);

      block.classList.add("review-annotated-block");

      /* ── Detect fine-grained sub-items ────────────────────── */
      const tableRows = Array.from(block.querySelectorAll<HTMLElement>("tr"));
      const codeLineSpans = Array.from(
        block.querySelectorAll<HTMLElement>("span.line")
      ).filter((s) => s.childNodes.length > 0);
      const subElements: HTMLElement[] = tableRows.length > 0 ? tableRows : codeLineSpans;
      const hasFineGrained = subElements.length > 0;

      /* ── Existing comments for this block ─────────────────── */
      const blockComments = fileComments.filter(
        (c) => c.line !== undefined && c.line >= lineStart && c.line <= lineEnd
      );

      /* ── Comment panel (inside block, absolutely positioned) ─ */
      // For PLAIN blocks: one shared panel anchored to block top (bottom:100% CSS).
      // For FINE-GRAINED blocks: one panel per sub-element, top set via rAF.
      let sharedPanel: HTMLDivElement | null = null;
      if (blockComments.length > 0 && !hasFineGrained) {
        sharedPanel = document.createElement("div");
        sharedPanel.className =
          "inline-comments-group inline-comments-group--collapsed";
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
          sharedPanel!.appendChild(card);
        });
        // Footer to allow adding a comment on a line that already has some.
        {
          const footer = document.createElement("div");
          footer.className = "inline-comment-footer";
          const addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.className = "inline-comment-add-btn";
          addBtn.textContent = "+ Commenter";
          addBtn.addEventListener("click", () => {
            sharedPanel!.classList.add("inline-comments-group--collapsed");
            activePanelRef.current = null;
            setAddingAtLine(lineStart);
          });
          footer.appendChild(addBtn);
          sharedPanel!.appendChild(footer);
        }
        block.appendChild(sharedPanel); // inside, positioned absolutely
        cleanups.push(() => sharedPanel?.remove());
      }

      /* ── Build one gutter button (+ or count badge) ────────── */
      // ownPanel: the comment panel this specific button controls.
      const makeBtn = (
        targetLine: number,
        ownPanel: HTMLDivElement | null
      ): HTMLButtonElement => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "review-line-plus";
        btn.dataset.line = String(targetLine);
        const count = fileComments.filter((c) => c.line === targetLine).length;
        if (count > 0) {
          btn.classList.add("review-line-plus--has-comments");
          btn.innerHTML = `<span class="review-line-count">${count}</span>`;
          btn.title = `${count} commentaire(s) — cliquer pour afficher/masquer`;
        } else {
          btn.textContent = "+";
          btn.title = `Commenter ligne ${targetLine}`;
        }
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const line = parseInt(btn.dataset.line!);
          if (ownPanel) {
            // Badge button: close any open form first, then toggle panel.
            setAddingAtLine(null);
            ownPanel.classList.toggle("inline-comments-group--collapsed");
            activePanelRef.current = ownPanel.classList.contains(
              "inline-comments-group--collapsed"
            )
              ? null
              : ownPanel;
          } else {
            // Plain "+" (no comments): close any open panel, then open form.
            if (activePanelRef.current) {
              activePanelRef.current.classList.add(
                "inline-comments-group--collapsed"
              );
              activePanelRef.current = null;
            }
            setAddingAtLine((prev) => (prev === line ? null : line));
          }
        });
        return btn;
      };

      if (!hasFineGrained) {
        /* ── Plain block: single button, CSS hover on block ──── */
        const btn = makeBtn(lineStart, sharedPanel);
        block.prepend(btn);
        cleanups.push(() => btn.remove());
      } else {
        /* ── Fine-grained: one button + one panel per sub-element */
        block.dataset.fineGrained = "true";
        cleanups.push(() => delete block.dataset.fineGrained);

        const btnMap = new Map<HTMLElement, HTMLButtonElement>();
        const panelMap = new Map<HTMLElement, HTMLDivElement>();

        subElements.forEach((el, i) => {
          const lineForEl = Math.min(lineStart + i, lineEnd - 1);

          // Build per-line comment panel (inside block, absolutely positioned).
          const lineComments = fileComments.filter((c) => c.line === lineForEl);
          let linePanel: HTMLDivElement | null = null;
          if (lineComments.length > 0) {
            linePanel = document.createElement("div");
            linePanel.className =
              "inline-comments-group inline-comments-group--collapsed inline-comments-group--fg";
            lineComments.forEach((c) => {
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
              linePanel!.appendChild(card);
            });
            // Footer to allow adding another comment on this specific line.
            {
              const thisLine = lineForEl;
              const thisPanel = linePanel!;
              const footer = document.createElement("div");
              footer.className = "inline-comment-footer";
              const addBtn = document.createElement("button");
              addBtn.type = "button";
              addBtn.className = "inline-comment-add-btn";
              addBtn.textContent = "+ Commenter";
              addBtn.addEventListener("click", () => {
                thisPanel.classList.add("inline-comments-group--collapsed");
                activePanelRef.current = null;
                setAddingAtLine(thisLine);
              });
              footer.appendChild(addBtn);
              linePanel!.appendChild(footer);
            }
            block.appendChild(linePanel); // inside block, top set in rAF
            cleanups.push(() => linePanel?.remove());
          }

          const btn = makeBtn(lineForEl, linePanel);
          btn.style.visibility = "hidden";
          block.appendChild(btn);
          btnMap.set(el, btn);
          if (linePanel) panelMap.set(el, linePanel);
          cleanups.push(() => btn.remove());
        });

        const rafId = requestAnimationFrame(() => {
          for (const [el, btn] of btnMap) {
            const midY = el.offsetTop + el.offsetHeight / 2;
            btn.style.top = `${midY - 11}px`;
            btn.style.visibility = "";
          }
          // Position each per-line panel just above its row.
          for (const [el, panel] of panelMap) {
            panel.style.top = `${el.offsetTop}px`;
          }
        });
        cleanups.push(() => cancelAnimationFrame(rafId));

        for (const [el, btn] of btnMap) {
          const onEnter = () => btn.classList.add("review-line-plus--row-hover");
          const onLeave = () => btn.classList.remove("review-line-plus--row-hover");
          el.addEventListener("mouseenter", onEnter);
          el.addEventListener("mouseleave", onLeave);
          cleanups.push(() => {
            el.removeEventListener("mouseenter", onEnter);
            el.removeEventListener("mouseleave", onLeave);
          });
        }
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
      const lineStart = parseInt(block.getAttribute("data-source-line-start")!);
      const lineEnd   = parseInt(block.getAttribute("data-source-line-end")!);

      if (!(lineStart <= addingAtLine && addingAtLine <= lineEnd)) continue;

      const formDiv = document.createElement("div");
      // Always append inside the block so it never affects document flow.
      formDiv.className = "inline-add-comment-container";
      block.appendChild(formDiv);

      if (block.dataset.fineGrained) {
        // Position the form above the specific sub-row that was clicked.
        const tableRows = Array.from(block.querySelectorAll<HTMLElement>("tr"));
        const codeLines = Array.from(
          block.querySelectorAll<HTMLElement>("span.line")
        ).filter((s) => s.childNodes.length > 0);
        const subEls = tableRows.length > 0 ? tableRows : codeLines;
        const idx = addingAtLine - lineStart;
        const el = subEls[Math.max(0, Math.min(idx, subEls.length - 1))];
        if (el) {
          formDiv.style.top = `${el.offsetTop}px`;
          formDiv.style.transform = "translateY(-100%)";
        }
      }
      // Plain blocks use CSS: bottom:100% (set via .inline-add-comment-container).

      setFormContainer(formDiv);
      return () => {
        formDiv.remove();
        setFormContainer(null);
      };
    }
  }, [addingAtLine, html]);

  /* ──────────────────────────────────────────────────────────── */
  /*  Active-line highlight when form is open                     */
  /* ──────────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container
      .querySelectorAll<HTMLElement>(".review-line-plus--active")
      .forEach((el) => el.classList.remove("review-line-plus--active"));

    if (addingAtLine === null) return;

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
            onClose={() => {
              activePanelRef.current?.classList.add(
                "inline-comments-group--collapsed"
              );
              activePanelRef.current = null;
              setAddingAtLine(null);
            }}
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