import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ElementDetail } from "../api/types";
import ViewerCanvas from "../viewer/ViewerCanvas";
import type { SiteViewer, LayerData, SectionBox } from "../viewer/Viewer";
import ModelPlan, { type ModelPlanData } from "../viewer/ModelPlan";
import {
  ifcPointToViewer,
  viewerPointToIfc,
  type ViewDirection,
} from "../viewer/spatialMath";
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS } from "../viewer/colors";
import {
  emptyLab,
  labStatus,
  labTransition,
  type LabAction,
  type LabPin,
  type LabState,
} from "../viewer/labState";
import { ASSETS, COLORS, LABELS } from "../workspace/state";
import { Icon } from "../studio/Icon";
import "../workspace/design.css";
import "../workspace/workspace.css";
import "../viewer/inspection.css";
import "./bim-lab.css";

export interface BimDataset {
  version: string;
  source: {
    attribution: string;
    license: string;
    repository: string;
    revision: string;
  };
  layers: {
    discipline: string;
    context: boolean;
    url: string;
    bytes: number;
  }[];
  elements: ElementDetail[];
  plans: ModelPlanData[];
  audit: {
    elements: number;
    rooms: number;
    levels: number;
    mesh_bytes: number;
    bedroom_fitting: { id: string } | null;
  };
}
const KEY = "ew-real-bim-lab-v1";

export default function BimLabPage() {
  const [data, setData] = useState<BimDataset | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/bim-duplex/model.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok)
          throw Error(
            "Model dataset is unavailable. Run the BIM audit command in the developer guide.",
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  if (!data)
    return (
      <div className="ew-app page">
        <Link to="/demo">← Daily workspace</Link>
        <h1>Imported BIM workbench</h1>
        <p role={error ? "alert" : undefined}>
          {error || "Loading the attributed duplex project…"}
        </p>
      </div>
    );
  return <Workbench key={data.version} data={data} />;
}

export function Workbench({ data }: { data: BimDataset }) {
  const [local, setLocal] = useState<LabState>(() => {
    try {
      const state = JSON.parse(localStorage.getItem(KEY) || "null");
      if (
        state?.version === data.version &&
        state.pins &&
        state.observations &&
        state.history
      )
        return state;
    } catch {
      /* use seed */
    }
    return emptyLab(data.version);
  });
  const stateRef = useRef(local),
    viewer = useRef<SiteViewer | null>(null);
  const [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(
    data.audit.bedroom_fitting?.id ?? null,
  );
  const [search, setSearch] = useState(""),
    [level, setLevel] = useState(""),
    [room, setRoom] = useState("");
  const [layers, setLayers] = useState(
    new Set(data.layers.map((l) => l.discipline)),
  );
  const [isolated, setIsolated] = useState<string | null>(null),
    [hidden, setHidden] = useState(new Set<string>());
  const [planOpen, setPlanOpen] = useState(true),
    [coloring, setColoring] = useState(true),
    [cut, setCut] = useState(1);
  const [pinDraft, setPinDraft] = useState<LabPin | null>(null),
    [pinTitle, setPinTitle] = useState(""),
    [picking, setPicking] = useState(false);
  const [reason, setReason] = useState(""),
    [propertySearch, setPropertySearch] = useState("");
  const act = (action: LabAction) => {
    try {
      const next = labTransition(stateRef.current, action);
      localStorage.setItem(KEY, JSON.stringify(next));
      stateRef.current = next;
      setLocal(next);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };
  const onReady = useCallback(
    (v: SiteViewer | null) => {
      viewer.current = v;
      setReady(!!v);
      if (!v) return;
      v.on("select", (id) => {
        setSelected(id);
        setReason("");
        setPropertySearch("");
      });
      v.on("pick", (hit) => {
        const item = data.elements.find((e) => e.id === hit.elementId);
        if (!item) return;
        v.setPickMode(false);
        setPicking(false);
        setSelected(item.id);
        setPinDraft({
          id: crypto.randomUUID(),
          element: item.id,
          guid: item.ifc_guid,
          point: hit.point,
          version: data.version,
          viewpoint: v.getViewpoint(),
          title: "",
        });
        setPinTitle("");
      });
      v.on("marker", (id) => {
        const pin = stateRef.current.pins.find((p) => p.id === id);
        if (pin) {
          setSelected(pin.element);
          v.flyTo(pin.viewpoint);
        }
      });
    },
    [data],
  );
  useEffect(() => {
    const v = viewer.current;
    if (!v || !ready) return;
    const controller = new AbortController();
    let alive = true;
    Promise.all(
      data.layers.map(async (layer) => {
        const response = await fetch(layer.url, { signal: controller.signal });
        if (!response.ok) throw Error(`Could not load ${layer.discipline}`);
        return { ...layer, data: await response.arrayBuffer() } as LayerData;
      }),
    )
      .then((ls) => (alive ? v.loadLayers(ls) : undefined))
      .then(() => {
        if (alive) setLoaded(true);
      })
      .catch((e) => {
        if (alive && e.name !== "AbortError") setError(e.message);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [data, ready]);
  const item = data.elements.find((e) => e.id === selected);
  const plan =
    data.plans.find((p) => p.id === (level || item?.level_id)) ??
    data.plans.find((p) => p.rooms.length) ??
    data.plans[0];
  const rooms = data.plans.flatMap((p) => p.rooms);
  const visible = useMemo(
    () =>
      new Set(
        data.elements
          .filter(
            (e) =>
              layers.has(e.discipline) &&
              (!level || e.level_id === level) &&
              (!room || e.zone_id === room) &&
              !hidden.has(e.id) &&
              (!isolated || e.id === isolated),
          )
          .map((e) => e.id),
      ),
    [data, layers, level, room, hidden, isolated],
  );
  const colors = useMemo(
    () =>
      new Map(
        data.elements.map((e) => {
          const status = labStatus(local, e.id);
          return [
            e.id,
            coloring && status !== "none"
              ? COLORS[status]
              : DISCIPLINE_COLORS[e.discipline],
          ];
        }),
      ),
    [data, local, coloring],
  );
  useEffect(() => {
    if (!loaded) return;
    viewer.current?.setVisible(visible);
    viewer.current?.setColors(colors);
    viewer.current?.select(selected);
  }, [loaded, visible, colors, selected]);
  useEffect(() => {
    if (loaded)
      viewer.current?.setMarkers(
        local.pins
          .filter((p) => !p.resolved && visible.has(p.element))
          .map((p) => ({ id: p.id, position: p.point, color: COLORS.issue })),
      );
  }, [local.pins, loaded, visible]);
  useEffect(() => {
    const section: SectionBox | null =
      cut < 1 ? { min: [0, 0, 0], max: [1, cut, 1] } : null;
    if (loaded) viewer.current?.setSection(section);
  }, [cut, loaded]);
  const select = (id: string) => {
    setSelected(id);
    setReason("");
    setPropertySearch("");
    setHidden(new Set());
    setIsolated(null);
    setRoom("");
    setLevel("");
    setCut(1);
    const e = data.elements.find((e) => e.id === id);
    if (e) setLayers((s) => new Set([...s, e.discipline]));
    viewer.current?.select(id);
    viewer.current?.frame([id]);
  };
  const observation = item && local.observations[item.id],
    status = item ? labStatus(local, item.id) : "none";
  const attach = async (file: File) => {
    if (!item) return;
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 1024 * 1024
      )
        throw Error(
          "For local workbench evidence, choose a JPEG, PNG or WebP under 1 MB.",
        );
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      act({
        type: "photo",
        element: item.id,
        photo: { id: crypto.randomUUID(), url, sample: false, name: file.name },
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="ew-app bim-lab">
      <header className="topbar">
        <Link className="brand" to="/demo">
          <span className="mark">
            <Icon name="bolt" />
          </span>
          Everything Works AI
        </Link>
        <Link className="btn" to="/demo/building">
          Daily demo
        </Link>
        <span className="grow" />
        <b>Imported BIM workbench</b>
        <a
          className="btn"
          href={`https://github.com/${data.source.repository}/tree/${data.source.revision}/IFC%202.3.0.1%20(IFC%202x3)/Duplex%20Apartment`}
          target="_blank"
          rel="noreferrer"
        >
          Source project ↗
        </a>
      </header>
      <div className="mock-strip">
        Real imported IFC geometry · {data.audit.elements.toLocaleString()}{" "}
        elements · {data.audit.rooms} rooms · {data.source.license}. Pins and
        review decisions are local test records. AI results are simulated;
        formal inspections are not recorded.
      </div>
      {error && (
        <div className="bim-error" role="alert">
          {error}
        </div>
      )}
      <div className="bim-layout">
        <aside className="bim-controls">
          <h2>Explore the duplex</h2>
          <p className="small muted">
            Architecture, pipes, fittings, electrical and mechanical detail from
            the source files.
          </p>
          <button
            className="btn primary"
            disabled={!data.audit.bedroom_fitting || !loaded}
            onClick={() =>
              data.audit.bedroom_fitting &&
              select(data.audit.bedroom_fitting.id)
            }
          >
            Inspect bedroom pipe elbow
          </button>
          <label>
            Find a component
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pipe, fitting, GUID, type or system"
            />
          </label>
          <div className="component-search-results">
            {search.trim() &&
              data.elements
                .filter((e) =>
                  `${e.name} ${e.ifc_class} ${e.ifc_guid} ${JSON.stringify(e.props)}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .slice(0, 30)
                .map((e) => (
                  <button key={e.id} onClick={() => select(e.id)}>
                    {e.name || e.ifc_class}
                  </button>
                ))}
          </div>
          <label>
            Level
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setRoom("");
              }}
            >
              <option value="">All levels</option>
              {data.plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Room
            <select
              value={room}
              onChange={(e) => {
                setRoom(e.target.value);
                const ids = data.elements
                  .filter((x) => x.zone_id === e.target.value)
                  .map((x) => x.id);
                if (ids.length) viewer.current?.frame(ids);
              }}
            >
              <option value="">All rooms / unassigned</option>
              {data.plans
                .filter((p) => !level || p.id === level)
                .flatMap((p) =>
                  p.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} · {r.name}
                    </option>
                  )),
                )}
            </select>
          </label>
          <h3>Layers</h3>
          {data.layers.map((l) => (
            <label className="bim-check" key={l.discipline}>
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
              {DISCIPLINE_LABELS[l.discipline]}
            </label>
          ))}
          <h3>View</h3>
          <div className="inspection-controls">
            {(["iso", "top", "front", "side"] as ViewDirection[]).map((v) => (
              <button
                key={v}
                onClick={() =>
                  viewer.current?.frame(isolated ? [isolated] : undefined, v)
                }
              >
                {v === "iso" ? "Isometric" : v}
              </button>
            ))}
            <button onClick={() => viewer.current?.zoom(0.7)}>Zoom in</button>
            <button onClick={() => viewer.current?.zoom(1.4)}>Zoom out</button>
            <button onClick={() => viewer.current?.frame()}>
              Fit building
            </button>
          </div>
          <div className="inspection-controls">
            <button
              disabled={!selected}
              onClick={() => selected && viewer.current?.frame([selected])}
            >
              Focus selected
            </button>
            <button disabled={!selected} onClick={() => setIsolated(selected)}>
              Isolate
            </button>
            <button
              disabled={!selected}
              onClick={() =>
                selected && setHidden((s) => new Set([...s, selected]))
              }
            >
              Hide
            </button>
            <button
              onClick={() => {
                setHidden(new Set());
                setIsolated(null);
                setLayers(new Set(data.layers.map((l) => l.discipline)));
                setRoom("");
                setLevel("");
                setCut(1);
              }}
            >
              Reset visibility
            </button>
          </div>
          <label>
            Section height
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.01"
              value={cut}
              onChange={(e) => setCut(Number(e.target.value))}
            />
          </label>
          <label className="bim-check">
            <input
              type="checkbox"
              checked={planOpen}
              onChange={(e) => setPlanOpen(e.target.checked)}
            />
            Show 2D model plan
          </label>
          <label className="bim-check">
            <input
              type="checkbox"
              checked={coloring}
              onChange={(e) => setColoring(e.target.checked)}
            />
            Show test progress colors
          </label>
          <p className="xs muted">
            {visible.size} visible elements. Geometry coordinates are metres;
            source property values retain their original units and may contain
            placeholders.
          </p>
        </aside>
        <main className="bim-views">
          <div className="bim-canvas">
            <ViewerCanvas
              onReady={onReady}
              onError={() =>
                setError(
                  "WebGL could not start. The 2D plan and metadata remain available.",
                )
              }
            />
            {!loaded && (
              <div className="viewer-overlay">
                {ready ? "Loading imported geometry…" : "Starting 3D…"}
              </div>
            )}
            <div className="bim-canvas-toolbar">
              <button
                disabled={!loaded}
                className={picking ? "btn primary" : "btn"}
                onClick={() => {
                  viewer.current?.setPickMode(!picking);
                  setPicking(!picking);
                }}
              >
                {picking
                  ? "Click a surface to pin · cancel"
                  : "Pin an exact model location"}
              </button>
              <span className="small">
                Orbit · drag / pan · right drag / zoom · scroll
              </span>
            </div>
          </div>
          {planOpen && plan && (
            <ModelPlan
              key={plan.id}
              plan={plan}
              selected={selected}
              visible={visible}
              colors={colors}
              onSelect={select}
              onPoint={(p) => {
                const target = ifcPointToViewer([
                  p[0],
                  p[1],
                  plan.elevation_m + 1,
                ]);
                viewer.current?.flyTo({
                  position: [target[0] + 2, target[1] + 2, target[2] + 2],
                  target,
                });
              }}
            />
          )}
        </main>
        <aside className="bim-details">
          {item ? (
            <>
              <span className="eyebrow">Selected component</span>
              <h2>
                {(item.props["IFC.resolved_class"] as string) || item.ifc_class}
              </h2>
              <p className="small">{item.name}</p>
              <span className={`chip ${status}`}>{LABELS[status]}</span>
              <p className="small muted">
                {rooms.find((r) => r.id === item.zone_id)?.code} ·{" "}
                {rooms.find((r) => r.id === item.zone_id)?.name ||
                  "No confirmed room association"}
              </p>
              <code className="xs">{item.ifc_guid}</code>
              <h3>Evidence and progress</h3>
              <p className="xs muted">
                Changes apply only to this component. This workbench tests
                projection; it does not run live AI or certify inspection.
              </p>
              <label>
                Add a photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void attach(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="btn"
                onClick={() =>
                  act({
                    type: "photo",
                    element: item.id,
                    photo: {
                      id: crypto.randomUUID(),
                      url: ASSETS + "plumbing-unit-402.jpg",
                      sample: true,
                      name: "Generated workflow sample; not this duplex",
                    },
                  })
                }
              >
                Use labeled workflow sample
              </button>
              {observation?.photos.at(-1) && (
                <figure>
                  <img
                    src={observation.photos.at(-1)!.url}
                    alt="Latest component evidence"
                  />
                  <figcaption className="xs muted">
                    {observation.photos.at(-1)!.name}
                  </figcaption>
                </figure>
              )}
              <label>
                Decision / resolution reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                />
              </label>
              <button
                className="btn primary"
                disabled={!observation?.photos.length || !reason.trim()}
                onClick={() =>
                  act({ type: "accept", element: item.id, reason })
                }
              >
                Record local human acceptance
              </button>
              <button
                className="btn"
                disabled={!observation?.photos.at(-1)?.sample || !reason.trim()}
                onClick={() =>
                  act({ type: "sample", element: item.id, reason })
                }
              >
                Simulate scoped AI completion
              </button>
              {observation && (
                <p className="xs muted">
                  {observation.status === "ai"
                    ? "Fixture result only; no live analysis. "
                    : ""}
                  {observation.reason} Formal inspection: not recorded.
                </p>
              )}
              {pinDraft && (
                <div className="inset">
                  <h3>New surface pin</h3>
                  <p className="xs">
                    IFC position:{" "}
                    {viewerPointToIfc(pinDraft.point)
                      .map((n) => n.toFixed(4))
                      .join(", ")}{" "}
                    m
                  </p>
                  <label>
                    Issue title
                    <input
                      value={pinTitle}
                      onChange={(e) => setPinTitle(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn primary"
                    disabled={!pinTitle.trim()}
                    onClick={() => {
                      if (
                        act({
                          type: "pin",
                          pin: { ...pinDraft, title: pinTitle },
                        })
                      )
                        setPinDraft(null);
                    }}
                  >
                    Save local pin
                  </button>
                  <button className="btn" onClick={() => setPinDraft(null)}>
                    Cancel
                  </button>
                </div>
              )}
              <h3>Saved locations</h3>
              {local.pins
                .filter((p) => p.element === item.id)
                .map((p) => (
                  <div className="inset" key={p.id}>
                    <b className="small">
                      {p.title} {p.resolved && "· resolved"}
                    </b>
                    <p className="xs muted">
                      {viewerPointToIfc(p.point)
                        .map((n) => n.toFixed(4))
                        .join(", ")}{" "}
                      m · source revision {p.version.slice(0, 7)}
                    </p>
                    <button
                      className="btn sm"
                      onClick={() => viewer.current?.flyTo(p.viewpoint)}
                    >
                      Reopen saved view
                    </button>
                    {!p.resolved && (
                      <button
                        className="btn sm"
                        onClick={() =>
                          act({ type: "resolve", pin: p.id, reason })
                        }
                      >
                        Resolve after review
                      </button>
                    )}
                  </div>
                ))}
              <h3>Properties ({Object.keys(item.props).length})</h3>
              <input
                aria-label="Filter component properties"
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                placeholder="Diameter, material, system…"
              />
              <div className="bim-properties">
                <table className="props">
                  <tbody>
                    {Object.entries(item.props)
                      .filter(([k, v]) =>
                        `${k} ${JSON.stringify(v)}`
                          .toLowerCase()
                          .includes(propertySearch.toLowerCase()),
                      )
                      .map(([k, v]) => (
                        <tr key={k}>
                          <th>{k}</th>
                          <td>
                            {typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v ?? "Not supplied")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <h3>History</h3>
              {local.history
                .filter((h) => h.element === item.id)
                .map((h, i) => (
                  <p key={i} className="xs muted">
                    {new Date(h.at).toLocaleString()} · {h.text}
                  </p>
                ))}
            </>
          ) : (
            <p>Select a component from 3D, 2D or search.</p>
          )}
          <hr />
          <p className="xs muted">
            {data.source.attribution}. Derived GLBs, metadata and silhouettes;
            original IFCs unchanged.{" "}
            {Math.round((data.audit.mesh_bytes / 1024 / 1024) * 10) / 10} MB of
            geometry.
          </p>
          <button
            className="btn"
            onClick={() => {
              if (
                window.confirm(
                  "Clear this workbench’s local pins and review records?",
                )
              ) {
                const next = emptyLab(data.version);
                localStorage.removeItem(KEY);
                stateRef.current = next;
                setLocal(next);
              }
            }}
          >
            Reset local test records
          </button>
        </aside>
      </div>
    </div>
  );
}
