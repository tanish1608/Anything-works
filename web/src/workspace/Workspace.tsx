import { BrandMark } from "../branding/BrandMark";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "../studio/Icon";
import {
  loadDemoModel,
  loadPublicProject,
  PUBLIC_PROJECTS,
  type ModelDataset,
  type PublicProjectId,
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
import ProjectShowroom from "./ProjectShowroom";
import { showroomUrl } from "./propertyCatalog";
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
import { VIEW_ROLES, viewState, type ViewRole } from "./viewRoles";
import ProjectImportPanel from "./ProjectImportPanel";
import { loadAuthorizedModel } from "../viewer/authorizedModel";
import { tokenStore } from "../api/client";

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
  import: "Project & model setup",
};
export default function Workspace() {
  const location = useLocation();
  const requested = new URLSearchParams(location.search).get("project");
  const navigate = useNavigate();
  const project = requested?.startsWith("api:")
    ? requested
    : PUBLIC_PROJECTS.find((p) => p.id === requested)?.id || "duplex";
  const version = new URLSearchParams(location.search).get("version");
  const showroom =
    new URLSearchParams(location.search).get("screen") === "projects";
  const identity = `${project}:${version || "current"}`;
  useEffect(
    () =>
      tokenStore.subscribe((t) => {
        if (!t && project.startsWith("api:"))
          navigate("/?panel=import", { replace: true });
      }),
    [project, navigate],
  );
  const [loaded, setLoaded] = useState<{
      project: string;
      model: ModelDataset;
    } | null>(null),
    [error, setError] = useState<{
      project: string;
      retry: number;
      message: string;
    } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (showroom) return;
    let alive = true;
    (project.startsWith("api:")
      ? loadAuthorizedModel(project.slice(4), version, true).then(
          (r) => r.model,
        )
      : project === "duplex"
        ? loadDemoModel()
        : loadPublicProject(project as PublicProjectId)
    )
      .then((m) => {
        if (alive) setLoaded({ project: identity, model: m });
      })
      .catch((e) => {
        if (alive) setError({ project: identity, retry, message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [project, version, identity, retry, showroom]);
  const errorMessage =
    error?.project === identity && error.retry === retry ? error.message : "";
  if (showroom) return <ProjectShowroom current={project} />;
  if (!loaded || loaded.project !== identity)
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
          <>
            <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
            <button onClick={() => navigate("/?panel=import")}>
              Return to public workspace
            </button>
          </>
        )}
      </div>
    );
  return (
    <BuildingWorkspace
      key={`${identity}:${loaded.model.version}:${loaded.model.source.approvalStatus || "sample"}`}
      model={loaded.model}
      project={project}
      reload={() => setRetry((n) => n + 1)}
    />
  );
}
function BuildingWorkspace({
  model,
  project,
  reload,
}: {
  model: ModelDataset;
  project: string;
  reload: () => void;
}) {
  const storageKey = projectStorageKey(model);
  const [view, setView] = useState<ViewRole>("pm");
  const [previewOwner, setPreviewOwner] = useState("");
  const [state, setState] = useState(() => loadProjectState(model)),
    stateRef = useRef(state);
  const [online, setOnline] = useState(navigator.onLine),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState("");
  const [focusToken, setFocusToken] = useState(0),
    [reset, setReset] = useState(false);
  const [closeup, setCloseup] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const previousPanel = useRef(false);
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
  useEffect(() => {
    if (panel) {
      if (!previousPanel.current)
        previousFocus.current = document.activeElement as HTMLElement;
      if (document.activeElement !== searchRef.current)
        panelRef.current?.focus();
    } else if (previousPanel.current && previousFocus.current?.isConnected)
      previousFocus.current.focus();
    previousPanel.current = !!panel;
  }, [panel]);
  const scopedState = useMemo(
    () => viewState(state, view, previewOwner),
    [state, view, previewOwner],
  );
  const workId =
      params.get("work") ||
      (panel === "capture"
        ? scopedState.draft?.item ||
          scopedState.items.find((i) => i.status === "none")?.id ||
          scopedState.items[0]?.id
        : null),
    element = params.get("element");
  const level = params.get("level"),
    unit = params.get("unit"),
    room = params.get("room");
  const date = panel === "activity" ? params.get("date") : null;
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  const work = scopedState.items.find((i) => i.id === workId);
  const items = useMemo(
    () => (validDate ? itemsAt(scopedState, validDate) : scopedState.items),
    [scopedState, validDate],
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
    if (document.activeElement !== searchRef.current) {
      previousFocus.current = document.activeElement as HTMLElement;
      if (next === panel) panelRef.current?.focus();
    }
    const target =
      id ||
      (next === "capture"
        ? viewState(stateRef.current, view, previewOwner).draft?.item ||
          viewState(stateRef.current, view, previewOwner).items.find(
            (i) => i.status === "none",
          )?.id ||
          viewState(stateRef.current, view, previewOwner).items[0]?.id
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
  const openModel = useCallback(
    (id: string, version?: string) => {
      const next = new URLSearchParams({
        project: `api:${id}`,
        panel: "import",
      });
      if (version) next.set("version", version);
      navigate(workspaceUrl(next));
      reload();
    },
    [navigate, reload],
  );
  const overviewUrl = useCallback(() => {
    const next = new URLSearchParams();
    if (project !== "duplex") next.set("project", project);
    next.set("panel", "issues");
    if (model.source.apiProjectId && params.get("version"))
      next.set("version", params.get("version")!);
    return workspaceUrl(next);
  }, [project, params, model.source.apiProjectId]);
  const overview = () => {
    setSearch("");
    navigate(overviewUrl());
    menuRef.current?.removeAttribute("open");
  };
  const close = () => {
    go({ panel: "none", work: null, element: null, date: null });
    setSearch("");
  };
  const act = useCallback(
    (action: Action) => {
      try {
        if (model.source.apiProjectId)
          throw Error(
            "Private work records are not connected yet. Use a public sample to test this flow.",
          );
        if (view === "customer" && action.type !== "sync")
          throw Error("The customer preview is read-only.");
        if (view === "subcontractor" || view === "worker") {
          if (!["draft", "submit", "sync"].includes(action.type))
            throw Error(
              "This preview sends evidence to the project manager for review.",
            );
          const id =
            action.type === "submit"
              ? action.draft.item
              : action.type === "draft"
                ? action.draft?.item
                : null;
          if (
            id &&
            stateRef.current.items.find((i) => i.id === id)?.owner !==
              previewOwner
          )
            throw Error("Choose work assigned to this crew.");
        }
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
    [storageKey, model.source.apiProjectId, view, previewOwner],
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
      if (
        e.key === "Escape" &&
        !e.defaultPrevented &&
        !document.querySelector("dialog[open]")
      ) {
        if (reset) setReset(false);
        else {
          const dismissed = new URLSearchParams(
            new URL(overviewUrl(), window.location.origin).search,
          );
          dismissed.set("panel", "none");
          navigate(workspaceUrl(dismissed));
          setSearch("");
          menuRef.current?.removeAttribute("open");
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [navigate, reset, project, overviewUrl]);
  const decide = (item: Decision["item"]) => selectWork(item.id);
  const issues = scopedState.items.filter((i) => i.issue).length;
  const context = {
    model,
    state: scopedState,
    act,
    decide,
    online,
    view,
    previewOwner,
    changeView: (role: ViewRole, owner: string) => {
      setView(role);
      setPreviewOwner(owner);
      close();
    },
  };
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
        if (view === "customer" || model.source.apiProjectId)
          return (
            <div className="world-empty">
              <h2>
                {model.source.apiProjectId
                  ? "Field records are not connected yet."
                  : "Customer progress view"}
              </h2>
              <p>
                {model.source.apiProjectId
                  ? "Use a public sample to test the daily evidence flow."
                  : "Browse work evidence and progress. Your project manager records decisions."}
              </p>
              <button onClick={() => open("issues")}>
                Browse work records
              </button>
            </div>
          );
        if (!scopedState.items.length)
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
        return model.source.apiProjectId ? (
          <div className="world-empty">
            <h2>Team view pending integration</h2>
            <p>
              The account uses server project permissions. No sample contacts
              are shown for private projects.
            </p>
          </div>
        ) : (
          <TeamPanel />
        );
      case "project":
        return (
          <ProjectPanel
            reset={() => setReset(true)}
            openImport={() => open("import")}
            owners={[...new Set(state.items.map((i) => i.owner))]}
          />
        );
      case "import":
        return (
          <ProjectImportPanel
            projectId={model.source.apiProjectId}
            versionId={model.version || undefined}
            onOpen={openModel}
            onPublic={() => navigate("/")}
          />
        );
      default:
        return null;
    }
  };
  return (
    <WorkspaceContext.Provider value={context}>
      <div className="world-app">
        {view !== "pm" && (
          <div className="world-view-banner" role="status">
            Preview: {VIEW_ROLES.find((r) => r.id === view)!.label}
            {previewOwner ? ` · ${previewOwner}` : ""} · public sample
            experience
            <button
              onClick={() => {
                setView("pm");
                close();
              }}
            >
              Return to PM
            </button>
          </div>
        )}
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
              <BrandMark size={32} />
            </span>
            <b>
              Placeholder <em>AI</em>
            </b>
          </button>
          <div className="world-project-title">
            <h1>{state.projectName}</h1>
            <button
              className="world-project-switch"
              aria-label="Switch building project"
              onClick={() =>
                navigate(
                  showroomUrl(workspaceUrl(params) + location.hash, project),
                )
              }
            >
              <Icon name="down" size={14} />
            </button>
            <span>
              {model.source.apiProjectId
                ? `${model.source.approvalStatus === "draft" ? "Draft reference" : model.source.approvalStatus === "missing" ? "Awaiting model" : "Connected model"} · work records pending`
                : online
                  ? "Project workspace"
                  : "Offline · device storage"}
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
              disabled={view === "customer" || !!model.source.apiProjectId}
              onClick={() => open("capture", work?.id)}
            >
              <Icon name="plus" size={17} />
              <span>New update</span>
            </button>
            <details className="world-project-menu" ref={menuRef}>
              <summary aria-label="Open project menu">
                <span className="world-profile">
                  {model.source.apiProjectId ? (
                    <Icon name="building" size={15} />
                  ) : (
                    "SJ"
                  )}
                </span>
                <Icon name="down" size={12} />
              </summary>
              <div role="menu">
                <button
                  role="menuitem"
                  onClick={() =>
                    navigate(
                      showroomUrl(
                        workspaceUrl(params) + location.hash,
                        project,
                      ),
                    )
                  }
                >
                  <Icon name="building" size={16} />
                  Switch project
                </button>
                {[
                  ["summary", "spark", "Project pulse"],
                  ["activity", "clock", "Progress history"],
                  ["team", "people", "Project team"],
                  ["locations", "building", "Explore building"],
                  ["project", "settings", "Project context"],
                  ["import", "building", "Add / import project"],
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
              onImport={() => open("import")}
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
            <aside
              ref={panelRef}
              tabIndex={-1}
              className="world-drawer"
              aria-label={TITLES[panel]}
            >
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
