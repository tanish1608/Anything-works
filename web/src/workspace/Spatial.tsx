import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../studio/Icon";
import { BuildingScene, type SceneOptions, type System } from "../studio/scene";
import { UNITS } from "../studio/model";
import { Button, Card, Chip, Coverage, Heading } from "./components";
import { COLORS, LABELS, roomStatus, type Status } from "./state";
import { useWorkspace } from "./context";

const systems: { id: System; name: string }[] = [
  { id: "architecture", name: "Architecture" },
  { id: "plumbing", name: "Plumbing" },
  { id: "electrical", name: "Electrical" },
  { id: "hvac", name: "HVAC" },
  { id: "furniture", name: "Interiors" },
];
export default function Spatial() {
  const { state } = useWorkspace(),
    [params, setParams] = useSearchParams();
  const unit = params.get("unit") || "405",
    validUnit = unit === "Core" || UNITS.some((u) => u.id === unit) ? unit : "405";
  const [floor, setFloor] = useState(validUnit.startsWith("3") ? 3 : 4),
    [plan, setPlan] = useState(false),
    [xray, setXray] = useState(true),
    [exploded, setExploded] = useState(false);
  const [enabled, setEnabled] = useState(
      new Set<System>(systems.map((s) => s.id)),
    ),
    [failed, setFailed] = useState(false),
    [parts, setParts] = useState(0);
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<BuildingScene | null>(null),
    selectRef = useRef((id: string) => setParams({ unit: id }));
  useEffect(() => {
    selectRef.current = (id: string) => setParams({ unit: id });
  }, [setParams]);
  const initial = useRef<SceneOptions>({
    floor,
    plan,
    xray,
    exploded,
    selected: validUnit,
    systems: enabled,
    coloring: true,
    phase: 6,
  });
  useEffect(() => {
    if (!host.current) return;
    try {
      scene.current = new BuildingScene(
        host.current,
        (id) => selectRef.current(id),
        (n) => setParts(n),
        initial.current,
      );
    } catch {
      setFailed(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => {
    scene.current?.update({
      floor,
      plan,
      xray,
      exploded,
      selected: validUnit,
      systems: enabled,
      coloring: true,
      phase: 6,
    });
    scene.current?.frame(plan);
  }, [floor, plan, xray, exploded, validUnit, enabled]);
  useEffect(() => {
    const rooms = Object.fromEntries(
      UNITS.map((u) => {
        const status = roomStatus(state.items.filter((i) => i.unit === u.id));
        return [
          u.id,
          {
            color: COLORS[status],
            marker:
              status === "issue" ||
              status === "review" ||
              status === "evidence",
          },
        ];
      }),
    );
    scene.current?.setAppearance(rooms);
  }, [state.items]);
  const items = state.items.filter((i) => i.unit === validUnit),
    status = roomStatus(items);
  const choose = (id: string) => {
    setParams({ unit: id });
    const f = id === "Core" ? 4 : Number(id[0]);
    if (floor && floor !== f) setFloor(f);
  };
  return (
    <>
      <Heading
        eyebrow="Spatial workspace"
        title="Work, quality and context — in one view."
        sub="The approved geometry stays fixed. Daily evidence changes status, coverage and issue pins."
        action={
          <div className="row"><Link className="btn primary" to="/building">Explore imported BIM project →</Link><Link className="btn" to="/capture">
            New update <Icon name="camera" size={16} />
          </Link></div>
        }
      />
      <div className="context">
        <div className="row">
          <label className="inline-label">
            Level
            <select
              value={floor}
              onChange={(e) => {
                const f = Number(e.target.value);
                setFloor(f);
                if (f) choose(`${f}01`);
              }}
            >
              <option value="0">All modeled levels</option>
              <option value="4">Level 14 · rough-in</option>
              <option value="3">Level 3 · finishes</option>
            </select>
          </label>
          <div className="seg dark">
            <button
              className={!plan ? "on" : ""}
              onClick={() => setPlan(false)}
            >
              3D model
            </button>
            <button className={plan ? "on" : ""} onClick={() => setPlan(true)}>
              Plan view
            </button>
          </div>
        </div>
        <p className="xs muted">
          Illustrative six-level geometry · fictional project
        </p>
      </div>
      <div className="spatial-layout">
        <Card className="model-card">
          <div className="spatial-canvas-wrap">
            <div className="spatial-canvas" ref={host} />
            {failed && (
              <div className="spatial-fallback">
                <Icon name="cube" size={32} />
                <h2>3D unavailable in this browser</h2>
                <p>
                  Use the plan and unit list below to explore all work records.
                </p>
                <Button onClick={() => setPlan(true)}>Open plan view</Button>
              </div>
            )}
            <div className="canvas-label">
              <Chip status="fixture">Illustrative model</Chip>
              <span className="small">
                {floor === 4
                  ? "Level 14"
                  : floor === 3
                    ? "Level 3"
                    : "All modeled levels"}
              </span>
            </div>
            <div className="canvas-tools">
              <Button icon="expand" onClick={() => scene.current?.frame(plan)}>
                Fit
              </Button>
              <Button icon="plus" onClick={() => scene.current?.zoom(0.8)}>
                Zoom in
              </Button>
              <Button
                icon="reset"
                onClick={() => {
                  setFloor(4);
                  setPlan(false);
                  setXray(true);
                  setExploded(false);
                  setEnabled(new Set(systems.map((s) => s.id)));
                  choose("405");
                  scene.current?.frame(false);
                }}
              >
                Reset view
              </Button>
            </div>
            <div className="canvas-switches">
              <button
                className={`btn sm ${xray ? "primary" : ""}`}
                aria-pressed={xray}
                onClick={() => setXray(!xray)}
              >
                X-ray
              </button>
              <button
                className={`btn sm ${exploded ? "primary" : ""}`}
                aria-pressed={exploded}
                onClick={() => setExploded(!exploded)}
              >
                Explode floors
              </button>
            </div>
            <span className="orbit-hint">
              Drag to orbit · scroll to zoom · select a room
            </span>
          </div>
          <div className="card-pad stack">
            <div className="row">
              <span className="eyebrow">Layers</span>
              {systems.map((s) => (
                <button
                  key={s.id}
                  className={`btn sm ${enabled.has(s.id) ? "primary" : ""}`}
                  aria-pressed={enabled.has(s.id)}
                  onClick={() =>
                    setEnabled((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }
                >
                  {s.name}
                </button>
              ))}
            </div>
            {plan && (
              <div className="unit-plan" aria-label="Accessible unit plan">
                {UNITS.filter((u) => !floor || u.floor === floor).map((u) => {
                  const s = roomStatus(
                    state.items.filter((i) => i.unit === u.id),
                  );
                  return (
                    <button
                      key={u.id}
                      onClick={() => choose(u.id)}
                      className={u.id === validUnit ? "selected" : ""}
                      style={{ borderColor: COLORS[s] }}
                    >
                      <b>Unit {u.id}</b>
                      <span>{LABELS[s]}</span>
                      {s === "issue" && <Icon name="pin" size={16} />}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="legend">
              {(
                [
                  "issue",
                  "review",
                  "evidence",
                  "human",
                  "ai",
                  "unsupported",
                  "none",
                ] as Status[]
              ).map((s) => (
                <span key={s}>
                  <i style={{ background: COLORS[s] }} />
                  {LABELS[s]}
                </span>
              ))}
            </div>
            <p className="xs muted">
              {parts.toLocaleString()} illustrative parts · 48 modeled units ·
              issue pins are room-level, not surveyed element positions
            </p>
          </div>
        </Card>
        <aside className="stack-lg">
          <Card title={validUnit === 'Core' ? 'Level 14 core' : `Unit ${validUnit}`} action={<Chip status={status} />}>
            <div className="card-pad stack">
              <div className="row">
                <label className="grow">
                  Explore unit
                  <select
                    aria-label="Select unit"
                    value={validUnit}
                    onChange={(e) => choose(e.target.value)}
                  >
                    {UNITS.filter((u) => !floor || u.floor === floor).map(
                      (u) => (
                        <option key={u.id} value={u.id}>
                          Unit {u.id}
                        </option>
                      ),
                    )}
                    {(!floor || floor === 4) && <option value="Core">Level 14 core</option>}
                  </select>
                </label>
                <Button
                  icon="expand"
                  onClick={() => scene.current?.focus(validUnit)}
                >
                  Focus
                </Button>
              </div>
              {items.length ? (
                <>
                  <Coverage items={items} />
                  <div className="list">
                    {items.map((i) => (
                      <Link
                        className="inset stack item-record"
                        key={i.id}
                        to={
                          i.issue
                            ? `/issue/${i.id}`
                            : `/review/${i.id}`
                        }
                      >
                        <b className="small">{i.title}</b>
                        <Chip status={i.status} />
                        <span className="xs muted">
                          {i.reference} · {i.update || "No update"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <div className="inset">
                  <p className="small">
                    No work-item assessments for this unit. Its planned geometry
                    remains unassessed.
                  </p>
                </div>
              )}
              <p className="xs muted">
                Open issues override completion. Inspection is always a separate
                record.
              </p>
            </div>
          </Card>
          <Card title="Plan and evidence">
            <div className="card-pad stack">
              <p className="small muted">
                Choose a work item to compare its photos with its reference and
                see the checks performed.
              </p>
              <Link className="btn" to="/work">
                Open all work
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
