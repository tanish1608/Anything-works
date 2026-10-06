import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import ProjectScene, { type SceneFocus } from "../viewer/ProjectScene";
import ModelPlan from "../viewer/ModelPlan";
import { visibleIds } from "../viewer/filters";
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS } from "../viewer/colors";
import type { SiteViewer } from "../viewer/Viewer";
import { Icon } from "../studio/Icon";
import { useWorkspace } from "./context";
import { projectModel } from "./modelProjection";
import { COLORS, type WorkItem } from "./state";
import { floorName, unitForRoom } from "./spatialNavigation";

export default function BuildingCanvas({
  items,
  work,
  element,
  level,
  unit,
  room,
  focusToken,
  closeup,
  historical,
  onWork,
  onElement,
  onScope,
  onOverview,
}: {
  items: WorkItem[];
  work: string | null;
  element: string | null;
  level: string | null;
  unit: string | null;
  room: string | null;
  focusToken: number;
  closeup: boolean;
  historical?: string;
  onWork: (id: string) => void;
  onElement: (id: string) => void;
  onScope: (
    level: string | null,
    unit?: string | null,
    room?: string | null,
  ) => void;
  onOverview: () => void;
}) {
  const { model } = useWorkspace();
  const viewer = useRef<SiteViewer | null>(null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [expanded, setExpanded] = useState(true);
  const [shell, setShell] = useState(false);
  const [isolate, setIsolate] = useState(false);
  const [layers, setLayers] = useState(
    () =>
      new Set(
        model.layers
          .filter((l) => l.discipline !== "other")
          .map((l) => l.discipline),
      ),
  );
  const projection = useMemo(
    () => projectModel(model, items, work),
    [model, items, work],
  );
  const active = projection.linked.find((i) => i.id === work);
  const selected = active?.location?.elements[0] || element;
  const selectedElement = model.elements.find((e) => e.id === selected);
  const focusedLevel =
    level || active?.location?.levelId || selectedElement?.level_id || null;
  const focusedRoom =
    room || active?.location?.roomId || selectedElement?.zone_id || null;
  const focusedPlan = model.plans.find((p) => p.id === focusedLevel);
  const focusedSpace = focusedPlan?.rooms.find((r) => r.id === focusedRoom);
  const selectedUnit =
    unit ||
    unitForRoom(model, active?.location?.spaceCode || focusedSpace?.code);
  const plan =
    focusedPlan ||
    model.plans.find((p) => p.rooms.some((r) => unitForRoom(model, r.code))) ||
    model.plans[0];
  const visible = useMemo(() => {
    const scopeLevel = active || selected ? null : level;
    const ids = visibleIds(model.elements, {
      disciplines: layers,
      levelId: scopeLevel,
      zoneId: null,
      interior: !shell,
      hideRoof:
        !shell &&
        !model.plans.find((p) => p.id === scopeLevel)?.name.includes("Roof"),
      revealed: selected,
    });
    // A focused record is always revealed even when its system was turned off.
    if (selected) ids.add(selected);
    if (isolate && selected) return new Set([selected]);
    if (!active && !selected && (unit || room)) {
      const rooms = new Set(
        model.plans
          .flatMap((p) => p.rooms)
          .filter((r) =>
            room
              ? r.id === room
              : unit === "shared"
                ? !unitForRoom(model, r.code)
                : unitForRoom(model, r.code) === unit,
          )
          .map((r) => r.id),
      );
      for (const e of model.elements)
        if (!e.context && (!e.zone_id || !rooms.has(e.zone_id)))
          ids.delete(e.id);
    }
    return ids;
  }, [model, layers, level, unit, room, shell, selected, active, isolate]);
  const colors = useMemo(() => {
    const map = new Map(projection.colors);
    for (const e of model.elements) {
      if (!projection.linked.some((w) => w.location!.elements.includes(e.id))) {
        map.set(
          e.id,
          e.discipline === "architecture"
            ? "#aab7c4"
            : e.discipline === "electrical"
              ? "#b292f5"
              : DISCIPLINE_COLORS[e.discipline] || "#77889c",
        );
      }
    }
    return map;
  }, [projection, model]);
  const markers = useMemo(() => {
    const pins = projection.markers
      .filter((m) => visible.has(m.elementId || ""))
      .map((m) => ({
        ...m,
        kind: "pin" as const,
        color: COLORS[projection.linked.find((i) => i.id === m.id)!.status],
      }));
    if (active && !pins.some((p) => p.id === active.id))
      pins.push({
        id: active.id,
        elementId: active.location!.elements[0],
        position: active.location!.anchor,
        color: "#98c9ff",
        kind: "pin",
      });
    return pins;
  }, [projection, visible, active]);
  const focus: SceneFocus | null = useMemo(() => {
    if (!selected) return null;
    const context =
      !closeup && !isolate && focusedRoom
        ? model.elements
            .filter((e) => e.zone_id === focusedRoom && visible.has(e.id))
            .map((e) => e.id)
        : [];
    return {
      element: selected,
      elements: context.length
        ? [...new Set([...context, selected])]
        : [selected],
      token: focusToken,
    };
  }, [selected, focusToken, closeup, isolate, focusedRoom, model, visible]);
  const chooseElement = (id: string | null) => {
    if (!id) return;
    const item = projection.linked.find((i) =>
      i.location!.elements.includes(id),
    );
    if (item) onWork(item.id);
    else onElement(id);
  };
  const ready = useCallback((v: SiteViewer | null) => {
    viewer.current = v;
  }, []);
  const toggleLayer = (discipline: string) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(discipline)) next.delete(discipline);
      else next.add(discipline);
      return next;
    });
  return (
    <section className="world-canvas" aria-label="Building workspace">
      <div
        className="world-renderer"
        style={{ visibility: mode === "3d" ? "visible" : "hidden" }}
      >
        <ProjectScene
          data={model}
          visible={visible}
          colors={colors}
          markers={markers}
          focus={focus}
          expanded={expanded}
          background="#131f2e"
          onReady={ready}
          onMarker={onWork}
          onSelect={chooseElement}
        />
      </div>
      {mode === "2d" && plan && (
        <div className="world-plan">
          <ModelPlan
            plan={plan}
            selected={selected}
            visible={visible}
            colors={colors}
            onSelect={chooseElement}
          />
        </div>
      )}
      <div className="world-canvas-top">
        <nav className="world-breadcrumb" aria-label="Model location">
          <button onClick={onOverview}>
            <Icon name="building" size={15} />
            Building
          </button>
          {focusedPlan && (
            <>
              <Icon name="chevron" size={12} />
              <button onClick={() => onScope(focusedPlan.id)}>
                {floorName(focusedPlan.name)}
              </button>
            </>
          )}
          {selectedUnit && (
            <>
              <Icon name="chevron" size={12} />
              <button onClick={() => onScope(focusedLevel, selectedUnit)}>
                {selectedUnit === "shared"
                  ? "Shared spaces"
                  : `Unit ${selectedUnit}`}
              </button>
            </>
          )}
          {focusedSpace && (
            <>
              <Icon name="chevron" size={12} />
              <button
                onClick={() =>
                  onScope(focusedLevel, selectedUnit, focusedSpace.id)
                }
              >
                {focusedSpace.name}
              </button>
            </>
          )}
        </nav>
        <div className="world-view-switch" aria-label="Model views">
          <button
            className={mode === "3d" ? "active" : ""}
            aria-pressed={mode === "3d"}
            onClick={() => setMode("3d")}
          >
            3D
          </button>
          <button
            className={mode === "2d" ? "active" : ""}
            aria-pressed={mode === "2d"}
            onClick={() => setMode("2d")}
          >
            2D plan
          </button>
        </div>
      </div>
      <div className="world-floor-rail" aria-label="Building levels">
        <button
          className={!level && !focusedLevel ? "active" : ""}
          aria-label="Show entire building"
          onClick={onOverview}
        >
          <Icon name="building" size={17} />
          <span>All</span>
        </button>
        {[...model.plans]
          .sort((a, b) => b.elevation_m - a.elevation_m)
          .map((p) => (
            <button
              key={p.id}
              className={focusedLevel === p.id ? "active" : ""}
              onClick={() => {
                setIsolate(false);
                onScope(p.id);
              }}
              aria-label={`Show ${floorName(p.name)}`}
            >
              <span>
                {floorName(p.name)
                  .replace("Level ", "L")
                  .replace("T/FDN", "Base")}
              </span>
              <small>
                {items.filter(
                  (i) => i.location?.levelId === p.id && i.status === "issue",
                ).length || ""}
              </small>
            </button>
          ))}
      </div>
      <div className="world-tools" aria-label="Model controls">
        <button
          title="Expand floors"
          aria-label="Expand floors"
          aria-pressed={expanded}
          className={expanded ? "active" : ""}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon name="layers" />
        </button>
        <button
          title="Show exterior walls"
          aria-label="Show exterior walls"
          aria-pressed={shell}
          className={shell ? "active" : ""}
          onClick={() => setShell(!shell)}
        >
          <Icon name="eye" />
        </button>
        <button
          title="Fit current view"
          aria-label="Fit current view"
          onClick={() => viewer.current?.frame([...visible])}
        >
          <Icon name="expand" />
        </button>
        {selected && (
          <button
            title="Isolate component"
            aria-label="Isolate component"
            aria-pressed={isolate}
            className={isolate ? "active" : ""}
            onClick={() => setIsolate(!isolate)}
          >
            <Icon name="cube" />
          </button>
        )}
      </div>
      <div className="world-layers" aria-label="Building systems">
        {model.layers.map((l) => (
          <button
            key={l.discipline}
            aria-pressed={layers.has(l.discipline)}
            onClick={() => toggleLayer(l.discipline)}
            style={
              {
                "--system-color":
                  l.discipline === "electrical"
                    ? "#b292f5"
                    : DISCIPLINE_COLORS[l.discipline] || "#8998ac",
              } as CSSProperties
            }
          >
            <Icon
              name={
                l.discipline === "plumbing"
                  ? "water"
                  : l.discipline === "electrical"
                    ? "bolt"
                    : l.discipline === "hvac"
                      ? "wind"
                      : "layers"
              }
              size={17}
            />
            <span>{DISCIPLINE_LABELS[l.discipline] || l.discipline}</span>
            <i />
          </button>
        ))}
      </div>
      <div className="world-canvas-foot">
        <span>
          {historical
            ? `Recorded status · ${historical}`
            : selected
              ? "Component selected · drag to orbit"
              : "Drag to orbit · scroll to zoom · select a pin"}
        </span>
        <a
          href={`https://github.com/${model.source.repository}/tree/${model.source.revision}`}
          target="_blank"
          rel="noreferrer"
          title={model.source.attribution}
        >
          Source · {model.source.license}
        </a>
      </div>
    </section>
  );
}
