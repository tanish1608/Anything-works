import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../studio/Icon";
import Agent from "./Agent";
import AgentIsle from "./AgentIsle";
import {
  loadDemoModel,
  loadPublicProject,
  PUBLIC_PROJECTS,
  type PublicProjectId,
  type ModelDataset,
} from "../viewer/modelData";
import { WorkspaceContext, type Decision } from "./context";
import {
  initialProjectState,
  loadProjectState,
  projectStorageKey,
  availabilityStorageKey,
} from "./projectState";
import { transition, type Action } from "./state";
import { itemsAt } from "./history";
import BuildingCanvas from "./BuildingCanvas";
import {
  PANELS,
  initialNavigation,
  workspaceUrl,
  type Panel,
} from "./spatialNavigation";
import {
  ActivityPanel,
  ComponentPanel,
  IssuesPanel,
  LocationsPanel,
  ProjectPanel,
  RecordPanel,
  SummaryPanel,
  TeamPanel,
  UpdatePanel,
} from "./WorldPanels";
import "./world.css";
import WorldDialog from "./WorldDialog";

const TITLES: Record<Panel, string> = {
  summary: "Project pulse",
  issues: "Work & issues",
  activity: "Progress history",
  team: "Project team",
  project: "Project context",
  capture: "Daily update",
  record: "Work record",
  component: "Component details",
  locations: "Explore building",
};
export default function Workspace() {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("project");
  const project: PublicProjectId =
    PUBLIC_PROJECTS.find((p) => p.id === requested)?.id || "duplex";
  const [loaded, setLoaded] = useState<{
      project: PublicProjectId;
      model: ModelDataset;
    } | null>(null),
    [error, setError] = useState<{
      project: string;
      retry: number;
      message: string;
    } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    (project === "duplex" ? loadDemoModel() : loadPublicProject(project))
      .then((m) => {
        if (alive) setLoaded({ project, model: m });
      })
      .catch((e) => {
        if (alive) setError({ project, retry, message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [project, retry]);
  const errorMessage =
    error?.project === project && error.retry === retry ? error.message : "";
  if (location.pathname === "/agent") return <Agent />;
  if (!loaded || loaded.project !== project)
    return (
      <div className="world-loading">
        <div className="world-loading-mark">
          <Icon name="cube" size={32} />
        </div>
        <h1>
          {errorMessage
            ? "The building couldn't load"
            : "Opening your building"}
        </h1>
        <p role={errorMessage ? "alert" : undefined}>
          {errorMessage || "Preparing the shared model and project records…"}
        </p>
        {errorMessage && (
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        )}
      </div>
    );
  return (
    <BuildingWorkspace key={project} model={loaded.model} project={project} />
  );
}
function BuildingWorkspace({
  model,
  project,
}: {
  model: ModelDataset;
  project: PublicProjectId;
}) {
  const storageKey = projectStorageKey(model);
  const [state, setState] = useState(() => loadProjectState(model)),
    stateRef = useRef(state);
  const [online, setOnline] = useState(navigator.onLine),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState("");
  const [focusToken, setFocusToken] = useState(0),
    [reset, setReset] = useState(false);
  const [closeup, setCloseup] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null),
    menuRef = useRef<HTMLDetailsElement>(null);
  const location = useLocation(),
    navigate = useNavigate();
  const params = useMemo(
    () => initialNavigation(location.pathname, location.search),
    [location.pathname, location.search],
  );
  const requestedPanel = params.get("panel");
  const panel = PANELS.includes(requestedPanel as Panel)
    ? (requestedPanel as Panel)
    : null;
  const workId =
      params.get("work") ||
      (panel === "capture"
        ? state.draft?.item ||
          state.items.find((i) => i.status === "none")?.id ||
          state.items[0]?.id
        : null),
    element = params.get("element");
  const level = params.get("level"),
    unit = params.get("unit"),
    room = params.get("room");
  const date = panel === "activity" ? params.get("date") : null;
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const work = state.items.find((i) => i.id === workId);
  const items = useMemo(
    () => (validDate ? itemsAt(state, validDate) : state.items),
    [state, validDate],
  );
  useEffect(() => {
    if (location.pathname !== "/")
      navigate(workspaceUrl(params) + location.hash, { replace: true });
  }, [location.pathname, location.hash, params, navigate]);
  const go = (changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    navigate(workspaceUrl(next), { replace });
    menuRef.current?.removeAttribute("open");
  };
  const open = (next: Panel, id?: string) => {
    const target =
      id ||
      (next === "capture"
        ? stateRef.current.draft?.item ||
          stateRef.current.items.find((i) => i.status === "none")?.id ||
          stateRef.current.items[0]?.id
        : null);
    go({
      panel: next,
      work: target || null,
      element: null,
      date: null,
      ...(target ? { level: null, unit: null, room: null } : {}),
    });
    if (target) {
      setCloseup(false);
      setFocusToken((t) => t + 1);
    }
  };
  const selectWork = (id: string) => {
    setSearch("");
    setCloseup(false);
    go({
      panel: "record",
      work: id,
      element: null,
      level: null,
      unit: null,
      room: null,
      date: null,
    });
    setFocusToken((t) => t + 1);
  };
  const selectElement = (id: string) => {
    go({
      panel: "component",
      element: id,
      work: null,
      level: null,
      unit: null,
      room: null,
      date: null,
    });
    setFocusToken((t) => t + 1);
  };
  const scope = (
    l: string | null,
    u: string | null = null,
    r: string | null = null,
  ) => {
    go({
      panel: "locations",
      level: l,
      unit: u,
      room: r,
      work: null,
      element: null,
      date: null,
    });
  };
  const overview = () => {
    setSearch("");
    navigate(project === "duplex" ? "/" : `/?project=${project}`);
    menuRef.current?.removeAttribute("open");
  };
  const close = () => {
    go({ panel: null, work: null, element: null, date: null });
    setSearch("");
  };
  const act = useCallback(
    (action: Action) => {
      try {
        const next = transition(stateRef.current, action);
        localStorage.setItem(storageKey, JSON.stringify(next));
        stateRef.current = next;
        setState(next);
        if (action.type !== "draft")
          setMessage(
            action.type === "submit"
              ? action.offline
                ? "Update queued on this device."
                : "Update saved. Evidence awaits review."
              : action.type === "sync"
                ? "Queued updates are ready for review."
                : "Saved. The building and records are up to date.",
          );
        return true;
      } catch (e) {
        setMessage(
          e instanceof DOMException && e.name === "QuotaExceededError"
            ? "Device storage is full. Export your records before resetting the workspace."
            : (e as Error).message,
        );
        return false;
      }
    },
    [storageKey],
  );
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (
        navigator.onLine &&
        stateRef.current.items.some((i) => i.processing === "queued")
      )
        act({ type: "sync" });
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [act]);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(""), 7000);
    return () => clearTimeout(id);
  }, [message]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (reset) setReset(false);
        else {
          navigate(project === "duplex" ? "/" : `/?project=${project}`);
          setSearch("");
          menuRef.current?.removeAttribute("open");
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [navigate, reset, project]);
  const decide = (item: Decision["item"]) => selectWork(item.id);
  const issues = state.items.filter((i) => i.issue).length;
  const context = { model, state, act, decide, online };
  const renderPanel = () => {
    switch (panel) {
      case "summary":
        return <SummaryPanel open={open} />;
      case "issues":
        return (
          <IssuesPanel
            open={(p, id) => (id ? selectWork(id) : open(p))}
            search={search}
          />
        );
      case "locations":
        return (
          <LocationsPanel
            level={level}
            unit={unit}
            room={room}
            scope={scope}
            selectElement={selectElement}
            open={(p, id) => (id ? selectWork(id) : open(p))}
          />
        );
      case "record":
        return work ? (
          <RecordPanel
            key={work.id}
            item={work}
            open={open}
            locate={() => {
              setCloseup(true);
              setFocusToken((t) => t + 1);
            }}
          />
        ) : (
          <div className="world-empty">
            <Icon name="pin" size={28} />
            <h2>Work record not found</h2>
            <p>This link does not identify work in the current project.</p>
            <button onClick={() => open("issues")}>Browse work records</button>
          </div>
        );
      case "component":
        return element ? (
          <ComponentPanel
            id={element}
            open={(p, id) => (id ? selectWork(id) : open(p))}
          />
        ) : null;
      case "capture":
        if (!state.items.length)
          return (
            <div className="world-empty">
              <Icon name="pin" size={28} />
              <h2>Choose the work first.</h2>
              <p>
                Select a component in the building or spatial directory and
                track work there. Then attach your daily update.
              </p>
              <button onClick={() => open("locations")}>
                Find a component
              </button>
            </div>
          );
        return (
          <UpdatePanel key={workId || "draft"} work={workId} open={open} />
        );
      case "activity":
        return (
          <ActivityPanel
            date={validDate}
            changeDate={(d) => go({ date: d })}
            open={(p, id) => (id ? selectWork(id) : open(p))}
          />
        );
      case "team":
        return <TeamPanel />;
      case "project":
        return <ProjectPanel reset={() => setReset(true)} />;
      default:
        return null;
    }
  };
  return (
    <WorkspaceContext.Provider value={context}>
      <div className="world-app">
        <a className="world-skip" href="#workspace-main">
          Skip to building
        </a>
        <header className="world-header">
          <button
            className="world-brand"
            onClick={overview}
            aria-label="Placeholder AI — building overview"
          >
            <span>
              <Icon name="cube" size={24} />
            </span>
            <b>
              Placeholder <em>AI</em>
            </b>
          </button>
          <div className="world-project-title">
            <h1>{state.projectName}</h1>
            <select
              aria-label="Switch building project"
              value={project}
              onChange={(e) => {
                setSearch("");
                navigate(
                  e.target.value === "duplex"
                    ? "/"
                    : `/?project=${e.target.value}`,
                );
              }}
            >
              {PUBLIC_PROJECTS.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span>
              {online ? "Project workspace" : "Offline · device storage"}
            </span>
          </div>
          <div className="world-search">
            <Icon name="search" size={16} />
            <input
              ref={searchRef}
              aria-label="Search building records"
              placeholder="Find a room, trade or issue…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (panel !== "issues") open("issues");
              }}
            />
            <kbd>⌘K</kbd>
          </div>
          <div className="world-header-actions">
            <button
              className={`world-issue-trigger ${panel === "issues" ? "active" : ""}`}
              onClick={() => open("issues")}
              aria-label="Open work and issues"
            >
              <Icon name="pin" size={17} />
              <span>Issues</span>
              <i>{issues}</i>
            </button>
            <button
              className="world-primary"
              aria-label="New update"
              onClick={() => open("capture", work?.id)}
            >
              <Icon name="plus" size={17} />
              <span>New update</span>
            </button>
            <details className="world-project-menu" ref={menuRef}>
              <summary aria-label="Open project menu">
                <span className="world-profile">SJ</span>
                <Icon name="down" size={12} />
              </summary>
              <div role="menu">
                {PUBLIC_PROJECTS.map((p) => (
                  <button
                    key={p.id}
                    role="menuitem"
                    onClick={() => {
                      menuRef.current?.removeAttribute("open");
                      navigate(p.id === "duplex" ? "/" : `/?project=${p.id}`);
                    }}
                  >
                    <Icon name="building" size={16} />
                    {p.name}
                    {p.id === project ? " · current" : ""}
                  </button>
                ))}
                {[
                  ["summary", "spark", "Project pulse"],
                  ["activity", "clock", "Progress history"],
                  ["team", "people", "Project team"],
                  ["locations", "building", "Explore building"],
                  ["project", "settings", "Project context"],
                ].map(([p, icon, text]) => (
                  <button
                    key={p}
                    role="menuitem"
                    onClick={() => open(p as Panel)}
                  >
                    <Icon name={icon} size={16} />
                    {text}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </header>
        <AgentIsle page={panel || "overview"} label={panel ? TITLES[panel] : "Building overview"}
          displayContext={JSON.stringify({ provenance: "browser-local sample; not authenticated project evidence",
            sampleProject: state.projectName, modelRevision: model.version,
            selectedWork: work ? { id: work.id, title: work.title, trade: work.trade, status: work.status,
              update: work.update, issue: work.issue, scope: work.scope, limits: work.limits } : null,
            selectedComponent: element, level, unit, room, date: validDate }).slice(0, 6000)} />
        <main
          id="workspace-main"
          className={`world-stage ${panel ? "has-panel" : ""}`}
        >
          <div className="world-scene-region">
            <BuildingCanvas
              items={items}
              work={workId}
              element={element}
              level={level}
              unit={unit}
              room={room}
              focusToken={focusToken}
              closeup={closeup}
              historical={validDate || undefined}
              onWork={selectWork}
              onElement={selectElement}
              onScope={scope}
              onOverview={overview}
            />
            {!panel && (
              <button
                className="world-pulse-card"
                onClick={() => open("summary")}
              >
                <span className="world-pulse-icon">
                  <Icon name="spark" size={21} />
                </span>
                <span>
                  <strong>The building, at a glance.</strong>
                  <small>{issues} open issues · your next decisions</small>
                </span>
                <Icon name="arrow" size={17} />
              </button>
            )}
          </div>
          {panel && (
            <aside className="world-drawer" aria-label={TITLES[panel]}>
              <div className="world-drawer-bar">
                {["record", "component", "capture"].includes(panel) ? (
                  <button
                    onClick={() => open("issues")}
                    aria-label="Back to work records"
                  >
                    <Icon
                      name="chevron"
                      className="world-back-icon"
                      size={15}
                    />
                    Work records
                  </button>
                ) : (
                  <span>{TITLES[panel]}</span>
                )}
                <button onClick={close} aria-label="Close side panel">
                  <Icon name="close" size={18} />
                </button>
              </div>
              <div
                className="world-drawer-scroll"
                key={`${panel}:${workId || element || ""}`}
              >
                {renderPanel()}
              </div>
            </aside>
          )}
        </main>
        {message && (
          <div className="world-toast" role="status">
            <Icon name="check" size={16} />
            <span>{message}</span>
            <button onClick={() => setMessage("")} aria-label="Dismiss message">
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        {reset && (
          <WorldDialog
            className="world-reset-overlay"
            label="Reset local workspace"
            close={() => setReset(false)}
          >
            <div>
              <Icon name="reset" size={28} />
              <h2>Reset this testing workspace?</h2>
              <p>
                This removes local uploads, drafts, decisions and availability
                from this browser. Export your progress history first if you
                need a copy.
              </p>
              <div className="world-action-pair">
                <button autoFocus onClick={() => setReset(false)}>
                  Cancel
                </button>
                <button
                  className="world-danger"
                  onClick={() => {
                    try {
                      const next = initialProjectState(model);
                      localStorage.setItem(storageKey, JSON.stringify(next));
                      localStorage.removeItem(availabilityStorageKey(model));
                      stateRef.current = next;
                      setState(next);
                      setReset(false);
                      overview();
                      setMessage("Workspace restored.");
                    } catch {
                      setMessage("Local storage could not be reset.");
                    }
                  }}
                >
                  Reset workspace
                </button>
              </div>
            </div>
          </WorldDialog>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
