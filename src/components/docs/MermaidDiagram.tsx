"use client";

import { useEffect, useRef } from "react";

interface Props {
  diagram: string;
  id: string;
}

export function MermaidDiagram({ diagram, id }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!ref.current) return;
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
        });

        const { svg } = await mermaid.render(`mermaid-${id}`, diagram);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = `<pre class="text-xs text-destructive p-2">${String(err)}</pre>`;
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [diagram, id]);

  return (
    <div
      ref={ref}
      className="mermaid-container"
      aria-label="Mermaid diagram"
    />
  );
}
