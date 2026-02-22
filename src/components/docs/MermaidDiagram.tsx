"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";

interface Props {
  diagram: string;
  id: string;
}

function useMermaidRender(diagram: string, id: string, containerId: string) {
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

        const { svg } = await mermaid.render(containerId, diagram);
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
  }, [diagram, containerId]);

  return ref;
}

function FullscreenModal({
  diagram,
  id,
  onClose,
}: {
  diagram: string;
  id: string;
  onClose: () => void;
}) {
  const ref = useMermaidRender(diagram, id, `mermaid-fs-${id}`);

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
        className="relative max-h-[90vh] max-w-[90vw] w-full overflow-auto rounded-xl bg-white p-6 shadow-2xl"
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
          ref={ref}
          className="mermaid-container flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto"
          aria-label="Mermaid diagram fullscreen"
        />
      </div>
    </div>,
    document.body
  );
}

export function MermaidDiagram({ diagram, id }: Props) {
  const ref = useMermaidRender(diagram, id, `mermaid-${id}`);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const openFullscreen = useCallback(() => setIsFullscreen(true), []);
  const closeFullscreen = useCallback(() => setIsFullscreen(false), []);

  return (
    <div className="group relative">
      <div
        ref={ref}
        className="mermaid-container"
        aria-label="Mermaid diagram"
      />
      <button
        onClick={openFullscreen}
        className="absolute right-2 top-2 rounded-md p-1.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Afficher en plein écran"
        title="Plein écran"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      {isFullscreen && (
        <FullscreenModal diagram={diagram} id={id} onClose={closeFullscreen} />
      )}
    </div>
  );
}
