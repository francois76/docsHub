"use client";

import { useEffect, useRef } from "react";

interface Props {
  html: string;
  /** Called when user clicks on a line number for inline commenting */
  onLineClick?: (line: number) => void;
}

export function MarkdownViewer({ html, onLineClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

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
          }
        } catch (err) {
          if (!cancelled) {
            div.innerHTML = `<pre class="text-xs text-red-500 p-2 bg-red-50 rounded">Mermaid error: ${String(err)}</pre>`;
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
    <div
      ref={containerRef}
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

