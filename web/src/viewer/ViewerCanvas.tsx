import { useEffect, useRef } from "react";
import type { SiteViewer } from "./Viewer";

/** Mounts a SiteViewer into a div and hands it to the parent once. */
export default function ViewerCanvas({
  onReady,
  onError,
  visible = true,
}: {
  onReady: (v: SiteViewer | null) => void;
  onError?: (e: unknown) => void;
  visible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const failed = useRef(onError);
  useEffect(() => {
    ready.current = onReady;
    failed.current = onError;
  }, [onReady, onError]);
  useEffect(() => {
    const handleReady = ready.current;
    let v: SiteViewer | null = null;
    let alive = true;
    import("./Viewer")
      .then(({ SiteViewer }) => {
        if (!alive || !ref.current) return;
        v = new SiteViewer(ref.current);
        handleReady(v);
      })
      .catch((e) => {
        if (!alive) return;
        console.error("WebGL viewer failed to start", e);
        failed.current?.(e);
        handleReady(null);
      });
    return () => {
      alive = false;
      handleReady(null);
      v?.dispose();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="viewer-canvas"
      data-testid="viewer"
      style={visible ? undefined : { visibility: "hidden" }}
    />
  );
}
