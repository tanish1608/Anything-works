import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BimDataset } from "../pages/BimLabPage";
import type { SiteViewer } from "../viewer/Viewer";
import ProjectScene from "../viewer/ProjectScene";
import { projectModel } from "./modelProjection";
import type { WorkItem } from "./state";
import ModelPlan from "../viewer/ModelPlan";
import { planViewBox } from "../viewer/planGeometry";
import { visibleIds } from "../viewer/filters";
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS } from "../viewer/colors";
import type { ViewDirection } from "../viewer/spatialMath";
import "./simple-building.css";

/** The everyday Building surface; inspection authoring remains in the workbench. */
const NO_WORK: WorkItem[] = [];
export default function SimpleBuilding({
  data,
  items = NO_WORK,
  selectedWork = null,
  onSelectWork,
}: {
  data: BimDataset;
  items?: WorkItem[];
  selectedWork?: string | null;
  onSelectWork?: (id: string) => void;
}) {
  const viewer = useRef<SiteViewer | null>(null);
  const layersMenu = useRef<HTMLDetailsElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"3d" | "2d">("3d"),
    [view, setView] = useState<ViewDirection>("iso");
  const [chosenLevel, setLevel] = useState(""),
    [chosenElement, setSelected] = useState<string | null>(null);
  const [layers, setLayers] = useState(
    new Set(data.layers.map((l) => l.discipline)),
  );
  const [thumbnail, setThumbnail] = useState(""),
    [error, setError] = useState(""),
    [failed, setFailed] = useState(false);
  const active = items.find(
    (i) => i.id === selectedWork && i.location?.version === data.version,
  );
  const selected = active?.location?.elements[0] || chosenElement;
  const level = active
    ? mode === "2d"
      ? active.location!.levelId
      : ""
    : chosenLevel;
  const plan =
    data.plans.find((p) => p.id === level) ??
    data.plans.find(
      (p) => p.id === data.elements.find((e) => e.id === selected)?.level_id,
    ) ??
    data.plans.find((p) => p.rooms.length) ??
    data.plans[0];
  const visible = useMemo(
    () =>
      visibleIds(data.elements, {
        disciplines: layers,
        levelId: level || null,
        zoneId: null,
        interior: true,
        hideRoof: true,
        revealed: selected,
      }),
    [data, layers, level, selected],
  );
  const projection = useMemo(
    () => projectModel(data, items, selectedWork),
    [data, items, selectedWork],
  );
  const colors = projection.colors;
  const focus = useMemo(
    () => (selected ? { element: selected } : null),
    [selected],
  );
  const onReady = useCallback((v: SiteViewer | null) => {
    viewer.current = v;
  }, []);
  const selectElement = (id: string | null) => {
    setSelected(id);
    const work = projection.linked.find((i) =>
      i.location!.elements.includes(id || ""),
    );
    onSelectWork?.(work?.id || "");
  };
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (layersMenu.current && !layersMenu.current.contains(e.target as Node))
        layersMenu.current.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && layersMenu.current)
        layersMenu.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (mode !== "2d" || !loaded || failed) return;
    // Capture once after the camera's 600ms flight, rather than running a second renderer.
    const timer = setTimeout(() => {
      try {
        setThumbnail(viewer.current?.snapshot("image/jpeg", 0.6) || "");
      } catch {
        /* keep previous preview */
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [mode, loaded, failed, level, view, visible]);
  const switchMode = () => {
    if (mode === "3d") {
      try {
        setThumbnail(viewer.current?.snapshot("image/jpeg", 0.6) || "");
      } catch {
        setThumbnail("");
      }
      if (!level && plan) setLevel(plan.id);
      setMode("2d");
    } else setMode("3d");
  };
  return (
    <section className="simple-building" aria-label="Building viewer">
      <div
        className="simple-building-3d"
        aria-hidden={mode !== "3d"}
        style={{ visibility: mode === "3d" ? "visible" : "hidden" }}
      >
        <ProjectScene
          data={data}
          visible={visible}
          colors={colors}
          markers={projection.markers.filter((m) => visible.has(m.elementId!))}
          focus={focus}
          expanded={!!active}
          direction={view}
          onReady={onReady}
          onLoaded={setLoaded}
          onSelect={selectElement}
          onMarker={(id) => onSelectWork?.(id)}
          onError={(text) => {
            setFailed(true);
            setMode("2d");
            if (plan) setLevel(plan.id);
            setError(text);
          }}
        />
      </div>
      {mode === "2d" && (
        <div className="simple-building-plan">
          {plan ? (
            <ModelPlan
              key={plan.id}
              plan={plan}
              minimal
              selected={selected}
              visible={visible}
              colors={colors}
              onSelect={selectElement}
            />
          ) : (
            <p>No 2D plan is available.</p>
          )}
        </div>
      )}
      <div className="simple-building-controls" aria-label="Building controls">
        <label>
          Level
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setSelected(null);
              onSelectWork?.("");
            }}
          >
            {mode === "3d" && <option value="">All levels</option>}
            {data.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name.replace(/^Building · /, "")}
              </option>
            ))}
          </select>
        </label>
        <label>
          View
          <select
            value={mode === "2d" ? "plan" : view}
            disabled={failed}
            onChange={(e) => {
              setView(e.target.value as ViewDirection);
              setMode("3d");
            }}
          >
            {mode === "2d" && (
              <option value="plan" disabled>
                2D plan
              </option>
            )}
            <option value="iso">Isometric</option>
            <option value="top">Top</option>
            <option value="front">Front</option>
            <option value="side">Side</option>
          </select>
        </label>
        <details ref={layersMenu} className="simple-building-layers">
          <summary>Layers</summary>
          <div className="simple-building-layer-menu">
            {data.layers.map((l) => (
              <label key={l.discipline}>
                <input
                  type="checkbox"
                  checked={layers.has(l.discipline)}
                  onChange={() =>
                    setLayers((old) => {
                      const next = new Set(old);
                      if (next.has(l.discipline)) next.delete(l.discipline);
                      else next.add(l.discipline);
                      return next;
                    })
                  }
                />
                <i style={{ background: DISCIPLINE_COLORS[l.discipline] }} />
                {DISCIPLINE_LABELS[l.discipline] || l.discipline}
              </label>
            ))}
          </div>
        </details>
      </div>
      <button
        className="simple-building-preview"
        onClick={switchMode}
        disabled={mode === "3d" ? !plan : failed || !loaded}
        aria-label={mode === "3d" ? "Switch to 2D plan" : "Switch to 3D model"}
      >
        {mode === "3d" && plan ? (
          <svg viewBox={planViewBox(plan).join(" ")} aria-hidden="true">
            {plan.rooms.map((r) => (
              <polygon
                key={r.id}
                points={r.polygon.map(([x, y]) => `${x},${-y}`).join(" ")}
                fill="#f8fafc"
                stroke="#94a3b8"
                strokeWidth=".04"
              />
            ))}
            {plan.elements
              .filter((e) => visible.has(e.id))
              .map((e) => (
                <polygon
                  key={e.id}
                  points={e.points.map(([x, y]) => `${x},${-y}`).join(" ")}
                  fill={colors.get(e.id)}
                  fillOpacity=".25"
                  stroke={colors.get(e.id)}
                  strokeWidth=".025"
                />
              ))}
          </svg>
        ) : thumbnail ? (
          <img src={thumbnail} alt="Current 3D building view" />
        ) : (
          <span className="simple-building-preview-empty">
            {failed ? "3D unavailable" : "3D model"}
          </span>
        )}
        <span className="simple-building-preview-label">
          {mode === "3d" ? "2D plan" : "3D model"}{" "}
          <span aria-hidden="true">↗</span>
        </span>
      </button>
      {error && (
        <div className="simple-building-error" role="alert">
          {error}
        </div>
      )}
      <div className="simple-building-caption">
        {mode === "2d"
          ? `${plan?.name ?? "2D"} · Model-derived plan`
          : "Drag to orbit · Scroll to zoom"}
      </div>
      <a
        className="simple-building-source"
        href={`https://github.com/${data.source.repository}/tree/${data.source.revision}`}
        target="_blank"
        rel="noreferrer"
        title={data.source.attribution}
      >
        Source · {data.source.license}
      </a>
    </section>
  );
}
