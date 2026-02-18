"use client";

import { useEffect, useRef, useState } from "react";
import { MermaidDiagram } from "./MermaidDiagram";
import { createPortal } from "react-dom";

interface Props {
  html: string;
  /** Called when user clicks on a line number for inline commenting */
  onLineClick?: (line: number) => void;
}

interface MermaidBlock {
  id: string;
  diagram: string;
  placeholder: string;
}

export function MarkdownViewer({ html, onLineClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mermaidBlocks, setMermaidBlocks] = useState<MermaidBlock[]>([]);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Find all mermaid-raw divs and extract diagrams
    const rawDivs =
      containerRef.current.querySelectorAll<HTMLDivElement>(".mermaid-raw");
    const blocks: MermaidBlock[] = [];

    rawDivs.forEach((div, i) => {
      const encoded = div.getAttribute("data-diagram") ?? "";
      const diagram = decodeURIComponent(encoded);
      const id = `mermaid-block-${i}-${Date.now()}`;
      div.id = id;
      div.setAttribute("data-mermaid-id", id);
      blocks.push({ id, diagram, placeholder: id });
    });

    setMermaidBlocks(blocks);
    forceRender((n) => n + 1);
  }, [html]);

  return (
    <div>
      <div
        ref={containerRef}
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {/* Render Mermaid diagrams into their placeholder divs via portals */}
      {mermaidBlocks.map((block) => {
        const el =
          containerRef.current?.querySelector(`[data-mermaid-id="${block.id}"]`) as HTMLElement | null;
        if (!el) return null;
        return createPortal(
          <MermaidDiagram
            key={block.id}
            id={block.id}
            diagram={block.diagram}
          />,
          el
        );
      })}
    </div>
  );
}
