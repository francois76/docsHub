"use client";

import { useEffect, useRef } from "react";

interface Props {
  html: string;
  /** Called when user clicks on a line number for inline commenting */
  onLineClick?: (line: number) => void;
}

const MAXIMIZE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;

const CLOSE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

export function MarkdownViewer({ html, onLineClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

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
  // Re-run whenever the HTML changes (new doc loaded)
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}


