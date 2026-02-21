"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  html: string;
  /** Called when user clicks on a line number for inline commenting */
  onLineClick?: (line: number) => void;
}

const MAXIMIZE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;

function FullscreenModal({
  svgHtml,
  onClose,
}: {
  svgHtml: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw] w-full overflow-auto rounded-xl bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
        <div
          className="flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      </div>
    </div>,
    document.body
  );
}

export function MarkdownViewer({ html, onLineClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreenSvg, setFullscreenSvg] = useState<string | null>(null);
  // Use a ref so the DOM click handler always has the latest setter (no stale closure)
  const setFullscreenRef = useRef(setFullscreenSvg);
  setFullscreenRef.current = setFullscreenSvg;

  const closeFullscreen = useCallback(() => setFullscreenSvg(null), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rawDivs =
      container.querySelectorAll<HTMLDivElement>(".mermaid-raw");
    if (rawDivs.length === 0) return;

    let cancelled = false;

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
          // Use a unique id that won't collide with existing DOM ids
          const id = `mermaid-svg-${i}-${Math.random().toString(36).slice(2)}`;
          const { svg } = await mermaid.render(id, diagram);
          if (!cancelled) {
            div.innerHTML = svg;
            div.classList.add("mermaid-container");
            div.classList.remove("mermaid-raw");

            // Wrap the rendered diagram in a relative container and add a
            // fullscreen button that extracts the already-rendered SVG.
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
              if (svgEl) setFullscreenRef.current(svgEl.outerHTML);
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
    };
  // Re-run whenever the HTML changes (new doc loaded)
  }, [html]);

  return (
    <>
      <div
        ref={containerRef}
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {fullscreenSvg && (
        <FullscreenModal svgHtml={fullscreenSvg} onClose={closeFullscreen} />
      )}
    </>
  );
}

