import "./inspection.css";
import { useMemo, useRef, useState } from "react";
import { DISCIPLINE_COLORS } from "./colors";
import { planViewBox } from "./planGeometry";

export interface ModelPlanData {
  id: string;
  name: string;
  elevation_m: number;
  provenance: string;
  elements: { id: string; discipline: string; points: number[][] }[];
  rooms: {
    id: string;
    name: string;
    code: string | null;
    polygon: number[][];
  }[];
}
type ViewBox = [number, number, number, number];

/** Real geometry silhouettes in IFC XY metres. No claim of approved drawings or hidden detail. */
export default function ModelPlan({
  plan,
  selected,
  visible,
  colors,
  onSelect,
  onPoint,
  minimal = false,
}: {
  plan: ModelPlanData;
  selected: string | null;
  visible?: Set<string>;
  colors?: Map<string, string>;
  onSelect: (id: string) => void;
  onPoint?: (p: [number, number]) => void;
  minimal?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState<ViewBox | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    box: ViewBox;
    moved: boolean;
    element: string | null;
  } | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ distance: number; box: ViewBox } | null>(null);
  const base = useMemo(() => planViewBox(plan), [plan]);
  const box = viewport ?? base;
  const point = (x: number, y: number) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return [p.x, -p.y] as [number, number];
  };
  const zoom = (factor: number) =>
    setViewport([
      box[0] + (box[2] * (1 - factor)) / 2,
      box[1] + (box[3] * (1 - factor)) / 2,
      box[2] * factor,
      box[3] * factor,
    ]);
  const focus = () => {
    const points = plan.elements.find((e) => e.id === selected)?.points;
    if (!points?.length) return;
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => -p[1]);
    const size =
      Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
        0.05,
      ) * 2;
    setViewport([
      (Math.min(...xs) + Math.max(...xs)) / 2 - size / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2 - size / 2,
      size,
      size,
    ]);
  };
  return (
    <div className="model-plan">
      {!minimal && (
        <div className="model-plan-heading">
          <b>{plan.name}</b>
          <span>{plan.provenance}</span>
        </div>
      )}
      <svg
        ref={svg}
        viewBox={box.join(" ")}
        aria-label="Model-derived level plan"
        onWheel={(e) => zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15)}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = {
              distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
              box: [...box],
            };
            drag.current = null;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            return;
          }
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            box: [...box],
            moved: false,
            element: (e.target as Element).getAttribute("data-element"),
          };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId))
            pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
          if (pinch.current && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()],
              p = pinch.current;
            const factor = Math.max(
              0.05,
              Math.min(
                20,
                p.distance / Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
              ),
            );
            setViewport([
              p.box[0] + (p.box[2] * (1 - factor)) / 2,
              p.box[1] + (p.box[3] * (1 - factor)) / 2,
              p.box[2] * factor,
              p.box[3] * factor,
            ]);
            return;
          }
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (Math.hypot(dx, dy) > 4) d.moved = true;
          if (!d.moved) return;
          const rect = e.currentTarget.getBoundingClientRect(),
            scale = Math.max(d.box[2] / rect.width, d.box[3] / rect.height);
          setViewport([
            d.box[0] - dx * scale,
            d.box[1] - dy * scale,
            d.box[2],
            d.box[3],
          ]);
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pinch.current) {
            if (!pointers.current.size) pinch.current = null;
            drag.current = null;
            return;
          }
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          const id = d.element;
          if (id) onSelect(id);
          else {
            const p = point(e.clientX, e.clientY);
            if (p) onPoint?.(p);
          }
        }}
        onPointerCancel={() => {
          pointers.current.clear();
          pinch.current = null;
          drag.current = null;
        }}
      >
        {plan.rooms.map((r) => (
          <polygon
            key={r.id}
            points={r.polygon.map(([x, y]) => `${x},${-y}`).join(" ")}
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth="0.02"
          />
        ))}
        {plan.elements
          .filter((e) => !visible || visible.has(e.id))
          .map((e) => (
            <polygon
              key={e.id}
              data-element={e.id}
              points={e.points.map(([x, y]) => `${x},${-y}`).join(" ")}
              fill={
                e.id === selected
                  ? "#7c4dff"
                  : (colors?.get(e.id) ??
                    DISCIPLINE_COLORS[e.discipline] ??
                    "#94a3b8")
              }
              fillOpacity={e.id === selected ? 0.8 : 0.25}
              stroke={
                e.id === selected
                  ? "#7c4dff"
                  : (colors?.get(e.id) ??
                    DISCIPLINE_COLORS[e.discipline] ??
                    "#94a3b8")
              }
              strokeWidth={e.id === selected ? "0.01" : "0.008"}
            >
              <title>{e.id}</title>
            </polygon>
          ))}
        {plan.rooms
          .filter((r) => r.polygon.length)
          .map((r) => {
            const x =
              r.polygon.reduce((n, p) => n + p[0], 0) / r.polygon.length;
            const y =
              -r.polygon.reduce((n, p) => n + p[1], 0) / r.polygon.length;
            return (
              <text
                key={r.id}
                x={x}
                y={y}
                textAnchor="middle"
                fontSize="0.16"
                fill="#475569"
                pointerEvents="none"
              >
                {r.code} {r.name}
              </text>
            );
          })}
      </svg>
      {!minimal && (
        <div className="model-plan-tools">
          <button onClick={() => zoom(0.7)} aria-label="Zoom plan in">
            +
          </button>
          <button onClick={() => zoom(1.4)} aria-label="Zoom plan out">
            −
          </button>
          <button onClick={() => setViewport(null)}>Fit plan</button>
          <button disabled={!selected} onClick={focus}>
            Focus component
          </button>
        </div>
      )}
    </div>
  );
}
