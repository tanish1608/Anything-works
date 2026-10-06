import { useCallback, useEffect, useRef, useState } from "react";
import ViewerCanvas from "./ViewerCanvas";
import type { LayerData, Marker, SiteViewer } from "./Viewer";
import type { ModelDataset } from "./modelData";
import { fetchModelLayer } from "./modelData";
import { levelOffsets } from "./explosion";
import type { ViewDirection } from "./spatialMath";

export interface SceneFocus {
  element: string | null;
  elements?: string[];
  point?: [number, number, number];
  token?: number;
}
/** Shared GLB renderer/controller. Workspace panels supply data and presentation only. */
export default function ProjectScene({
  data,
  visible,
  colors,
  markers,
  focus,
  expanded = false,
  explosionGap = 3,
  direction = "iso",
  onSelect,
  onMarker,
  onReady,
  onError,
  onLoaded,
  loader = fetchModelLayer,
  background,
  autoRotate = false,
  onInteraction,
  orbitFit = false,
}: {
  data: ModelDataset;
  visible: Set<string>;
  colors: Map<string, string>;
  markers: Marker[];
  focus?: SceneFocus | null;
  expanded?: boolean;
  explosionGap?: number;
  direction?: ViewDirection;
  onSelect?: (id: string | null) => void;
  onMarker?: (id: string) => void;
  onReady?: (v: SiteViewer | null) => void;
  onError?: (error: string) => void;
  onLoaded?: (ready: boolean) => void;
  loader?: (url: string) => Promise<ArrayBuffer>;
  background?: string;
  autoRotate?: boolean;
  onInteraction?: () => void;
  orbitFit?: boolean;
}) {
  const viewer = useRef<SiteViewer | null>(null),
    callbacks = useRef({
      onSelect,
      onMarker,
      onReady,
      onError,
      onLoaded,
      onInteraction,
    });
  const [ready, setReady] = useState(false),
    [loadedVersion, setLoadedVersion] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    callbacks.current = {
      onSelect,
      onMarker,
      onReady,
      onError,
      onLoaded,
      onInteraction,
    };
  }, [onSelect, onMarker, onReady, onError, onLoaded, onInteraction]);
  const handleReady = useCallback((v: SiteViewer | null) => {
    viewer.current = v;
    setReady(!!v);
    callbacks.current.onReady?.(v);
    if (v) {
      v.setGhostContext(false);
      v.on("select", (id) => callbacks.current.onSelect?.(id));
      v.on("marker", (id) => callbacks.current.onMarker?.(id));
      v.on("interaction", () => callbacks.current.onInteraction?.());
    }
  }, []);
  const failed = (text: string) => {
    setError(text);
    callbacks.current.onError?.(text);
    callbacks.current.onLoaded?.(false);
  };
  useEffect(() => {
    if (ready && background) viewer.current?.setBackground?.(background);
  }, [ready, background]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    let alive = true;
    setLoadedVersion("");
    setError("");
    callbacks.current.onLoaded?.(false);
    Promise.all(
      data.layers.map(
        async (l) => ({ ...l, data: await loader(l.url) }) as LayerData,
      ),
    )
      .then((layers) => (alive ? v.loadLayers(layers) : undefined))
      .then(() => {
        if (alive) {
          setError("");
          setLoadedVersion(data.version);
          callbacks.current.onLoaded?.(true);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          callbacks.current.onError?.(e.message);
          callbacks.current.onLoaded?.(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [ready, data.version, data.layers, loader]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    v.setAutoRotate?.(autoRotate && loadedVersion === data.version);
    return () => v.setAutoRotate?.(false);
  }, [ready, autoRotate, loadedVersion, data.version]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || loadedVersion !== data.version) return;
    v.setVisible(visible);
    v.setColors(colors);
    v.select(focus?.element || null);
    v.setMarkers(markers);
  }, [loadedVersion, data.version, visible, colors, markers, focus?.element]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || loadedVersion !== data.version) return;
    let alive = true;
    const offsets = levelOffsets(
      data.elements,
      data.plans,
      expanded,
      explosionGap,
    );
    v.setExplodedOffsets(offsets).then(() => {
      if (!alive) return;
      if (focus) {
        // Frame the actual component at its display position, preserving fine fitting detail.
        if (focus.point) {
          const p: [number, number, number] = [
            focus.point[0],
            focus.point[1] + (offsets.get(focus.element || "") || 0),
            focus.point[2],
          ];
          v.clearCutaway();
          v.flyTo({
            position: [p[0] + 3, p[1] + 2.5, p[2] + 3],
            target: p,
            section: null,
          });
        } else if (
          !focus.element ||
          !["iso", "overview"].includes(direction) ||
          !v.focusOn(focus.element, (focus.elements?.length || 0) > 1)
        ) {
          v.clearCutaway();
          v.frame(focus.elements?.length ? focus.elements : [...visible], direction);
        }
      } else {
        v.clearCutaway();
        if (orbitFit) v.frame([...visible], direction, true);
        else v.frame([...visible], direction);
      }
    });
    return () => {
      alive = false;
    };
  }, [
    loadedVersion,
    data.version,
    data.elements,
    data.plans,
    expanded,
    explosionGap,
    direction,
    orbitFit,
    focus,
    visible,
  ]);
  return (
    <>
      <ViewerCanvas
        visible={loadedVersion === data.version && !error}
        onReady={handleReady}
        onError={() =>
          failed(
            "3D is unavailable. The model records and 2D plans remain accessible.",
          )
        }
      />
      {error ? (
        <div className="viewer-overlay" role="alert">
          {error}
        </div>
      ) : loadedVersion !== data.version ? (
        <div className="viewer-overlay">Loading shared project model…</div>
      ) : null}
    </>
  );
}
