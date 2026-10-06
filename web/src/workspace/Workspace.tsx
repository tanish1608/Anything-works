import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Icon } from "../studio/Icon";
import { Button, Modal } from "./components";
import { Work, Review, Issue, Setup } from "./pages";
import Home from "./Home";
import Logs from "./Logs";
import People, { PEOPLE_KEY } from "./People";
import { Capture, Result } from "./capture";
import Building from "./Building";
import {
  ASSETS,
  STORE_KEY,
  transition,
  type Action,
  type WorkItem,
} from "./state";
import { WorkspaceContext, type Decision } from "./context";
import "./design.css";
import "./workspace.css";
import "./header.css";
import { loadDemoModel, type ModelDataset } from "../viewer/modelData";
import {
  initialProjectState,
  loadProjectState,
  locationLabel,
} from "./projectState";

const NAV = [
  { path: "", label: "Home" },
  { path: "work", label: "Work & Issues" },
  { path: "building", label: "Building" },
  { path: "logs", label: "Logs" },
  { path: "people", label: "People" },
  { path: "setup", label: "Setup" },
];
export default function Workspace() {
  const [model, setModel] = useState<ModelDataset | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    loadDemoModel()
      .then((data) => {
        if (alive) setModel(data);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!model)
    return (
      <div className="page">
        <h1>Project workspace</h1>
        <p role={error ? "alert" : undefined}>
          {error || "Loading the shared building model…"}
        </p>
      </div>
    );
  return <LoadedWorkspace model={model} />;
}
function LoadedWorkspace({ model }: { model: ModelDataset }) {
  const [state, setState] = useState(() => loadProjectState(model)),
    stateRef = useRef(state);
  const [message, setMessage] = useState(""),
    [decision, setDecision] = useState<Decision | null>(null),
    [reason, setReason] = useState("");
  const [online, setOnline] = useState(navigator.onLine),
    [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState(""),
    [projectMenu, setProjectMenu] = useState(false),
    [reset, setReset] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const navigate = useNavigate(),
    location = useLocation(),
    searchRef = useRef<HTMLInputElement>(null);
  const homePage =
    location.pathname === "/demo" || location.pathname === "/demo/";
  const importedBuilding = location.pathname === "/demo/building";
  const act = useCallback((action: Action) => {
    try {
      const next = transition(stateRef.current, action);
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      stateRef.current = next;
      setState(next);
      if (action.type !== "draft")
        setMessage(
          action.type === "submit"
            ? action.offline
              ? "Update queued on this device."
              : "Update saved in the local demo."
            : action.type === "sync"
              ? "Queued updates moved to local review."
              : "Decision saved. Related views are updated.",
        );
      return true;
    } catch (e) {
      setMessage(
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "Device storage is full. Remove a draft photo or export your records before resetting the demo."
          : (e as Error).message,
      );
      return false;
    }
  }, []);
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
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    setMobileNav(false);
    setProjectMenu(false);
    setSearch("");
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const decide = (item: WorkItem, type: Decision["type"]) => {
    setDecision({ item, type });
    setReason("");
  };
  const attention = state.items.filter(
    (i) =>
      ["review", "unsupported"].includes(i.status) ||
      (i.status === "issue" && i.correction),
  );
  const searchItems = search.trim()
    ? state.items
        .filter((i) =>
          `${i.unit} ${i.title} ${i.id} ${i.trade}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .slice(0, 6)
    : [];
  return (
    <WorkspaceContext.Provider value={{ state, act, decide, online, model }}>
      <div className="ew-app">
        <a className="ew-skip" href="#workspace-main">
          Skip to content
        </a>
        <header className="topbar workspace-header">
          <div className="topbar-in workspace-header-main">
            <Link className="brand" to="/demo">
              <span className="brand-mark">
                <Icon name="bolt" size={17} />
              </span>
              <span className="brand-name">Everything Works AI</span>
            </Link>
            <div className="project-control">
              <button
                className="project-pill"
                onClick={() => setProjectMenu(!projectMenu)}
                aria-expanded={projectMenu}
                aria-label={`Project: ${state.projectName}`}
              >
                <span className="strong">{state.projectName}</span>
                <Icon name="down" size={13} />
              </button>
              {projectMenu && (
                <div className="project-dropdown card card-pad stack">
                  <Link to="/">
                    All projects <Icon name="arrow" size={14} />
                  </Link>
                  <Link to="/demo/setup">Project settings</Link>
                  <Button
                    icon="reset"
                    onClick={() => {
                      setProjectMenu(false);
                      setReset(true);
                    }}
                  >
                    Reset workspace
                  </Button>
                </div>
              )}
            </div>
            <div className="top-right">
              <div className="workspace-search">
                <Icon name="search" size={15} />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search project"
                  aria-label="Search workspace"
                  onKeyDown={(e) => e.key === "Escape" && setSearch("")}
                />
                <kbd>⌘K</kbd>
                {search && (
                  <div className="search-results card">
                    {searchItems.map((i) => (
                      <Link
                        key={i.id}
                        to={
                          i.issue
                            ? `/demo/issue/${i.id}`
                            : `/demo/review/${i.id}`
                        }
                      >
                        <strong>
                          {locationLabel(i)} · {i.title}
                        </strong>
                        <small>
                          {i.id} · {i.trade}
                        </small>
                      </Link>
                    ))}
                    {!searchItems.length && <p>No matching work items.</p>}
                  </div>
                )}
              </div>
              <Link
                className="icon-button"
                to="/demo/work?filter=review"
                aria-label="Open review queue"
              >
                <Icon name="bell" />
              </Link>
              <span className="avatar">SJ</span>
              <div className="who">
                <b>Sarah Jenkins</b>
                <span>Project manager</span>
              </div>
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                aria-expanded={mobileNav}
                aria-controls="workspace-mobile-navigation"
                onClick={() => setMobileNav(!mobileNav)}
              >
                <Icon name="menu" />
              </button>
            </div>
          </div>
          <nav className="nav workspace-header-nav" aria-label="Workspace">
            {NAV.map((n) => (
              <NavLink
                key={n.path}
                end
                to={`/demo${n.path ? `/${n.path}` : ""}`}
                className={({ isActive }) => (isActive ? "on" : "")}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          {mobileNav && (
            <nav
              id="workspace-mobile-navigation"
              className="mobile-nav"
              aria-label="Mobile workspace"
            >
              {NAV.map((n) => (
                <NavLink
                  end
                  key={n.path}
                  to={`/demo${n.path ? `/${n.path}` : ""}`}
                >
                  {n.label}
                </NavLink>
              ))}
              <Link to="/demo/capture">Field capture</Link>
            </nav>
          )}
        </header>
        <main
          className={importedBuilding ? "page simple-building-page" : "page"}
          id="workspace-main"
        >
          <Routes>
            <Route index element={<Home />} />
            <Route path="home" element={<Navigate to="/demo" replace />} />
            <Route path="today" element={<Navigate to="/demo" replace />} />
            <Route path="work" element={<Work />} />
            <Route path="review/:id" element={<Review />} />
            <Route path="issue/:id" element={<Issue />} />
            <Route path="building" element={<Building />} />
            <Route path="logs" element={<Logs />} />
            <Route path="people" element={<People />} />
            <Route
              path="report"
              element={<Navigate to="/demo/logs" replace />}
            />
            <Route path="setup" element={<Setup />} />
            <Route path="capture" element={<Capture />} />
            <Route path="result/:id" element={<Result />} />
            <Route
              path="field"
              element={<Navigate to="/demo/capture" replace />}
            />
            <Route
              path="evidence"
              element={<Navigate to="/demo/work?filter=review" replace />}
            />
            <Route
              path="activity"
              element={<Navigate to="/demo/logs" replace />}
            />
            <Route
              path="handoffs"
              element={<Navigate to="/demo/work" replace />}
            />
            <Route path="*" element={<Navigate to="/demo" replace />} />
          </Routes>
        </main>
        {!importedBuilding && !homePage && (
          <button
            className="beaver-launch"
            aria-expanded={assistant}
            onClick={() => setAssistant(!assistant)}
          >
            <img src={ASSETS + "works-beaver.jpg"} alt="" />
            Works Beaver
            <Icon name={assistant ? "close" : "spark"} size={16} />
          </button>
        )}
        {assistant && !importedBuilding && !homePage && (
          <aside className="beaver" aria-label="Works Beaver assistant">
            <div className="beaver-head">
              <img
                src={ASSETS + "works-beaver.jpg"}
                alt="Works Beaver mascot"
              />
              <div className="grow">
                <h3>Works Beaver</h3>
                <p className="xs muted">
                  Daily-update assistant · local record summary
                </p>
              </div>
              <Button icon="close" onClick={() => setAssistant(false)}>
                Close
              </Button>
            </div>
            <div className="beaver-body">
              {attention.length
                ? `${attention.length} work items need a decision. Start with ${locationLabel(attention[0])}: ${attention[0].title}.`
                : "No outstanding decisions. Check evidence requests and newly submitted updates next."}
            </div>
            <div className="beaver-actions">
              <Button
                kind="primary"
                onClick={() => {
                  navigate("/demo/work?filter=review");
                  setAssistant(false);
                }}
              >
                Review next items
              </Button>
              <Button
                onClick={() => {
                  navigate(
                    `/demo/building${attention[0] ? `?work=${attention[0].id}` : ""}`,
                  );
                  setAssistant(false);
                }}
              >
                Pinpoint in 3D
              </Button>
            </div>
            <div className="beaver-note">
              Summarizes demo records. It cannot accept work, close issues or
              record inspections.
            </div>
          </aside>
        )}
        {message && (
          <div className="workspace-toast" role="status">
            {message}
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>
              <Icon name="close" size={15} />
            </button>
          </div>
        )}
        {decision && (
          <Modal
            title={`${decision.type === "resolve" ? "Accept correction & resolve" : decision.type === "request" ? "Request additional evidence" : decision.type.charAt(0).toUpperCase() + decision.type.slice(1)} · ${locationLabel(decision.item)}`}
            close={() => setDecision(null)}
          >
            <p className="small muted">{decision.item.title}</p>
            {decision.type === "resolve" && decision.item.condition && (
              <div className="inset warning">
                {decision.item.condition} Record how you reviewed this
                prerequisite before resolving.
              </div>
            )}
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (act({ type: decision.type, id: decision.item.id, reason }))
                  setDecision(null);
              }}
            >
              <label>
                Decision reason
                <textarea
                  autoFocus
                  required
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="What did you review, decide or request?"
                />
              </label>
              <p className="xs muted">
                Saved with Sarah Jenkins and the current time. Demo
                notifications are simulated; no external message is sent.
              </p>
              <Button type="submit" kind="primary" disabled={!reason.trim()}>
                Record decision
              </Button>
            </form>
          </Modal>
        )}
        {reset && (
          <Modal title="Reset the local demo?" close={() => setReset(false)}>
            <p>
              Removes this demo's decisions, uploads and drafts from this
              browser. Export your logs first if you want a record.
            </p>
            <Button
              kind="danger"
              icon="reset"
              onClick={() => {
                try {
                  const fresh = initialProjectState(model);
                  localStorage.setItem(STORE_KEY, JSON.stringify(fresh));
                  localStorage.removeItem(PEOPLE_KEY);
                  stateRef.current = fresh;
                  setState(fresh);
                  setReset(false);
                  navigate("/demo");
                  setMessage("Demo restored.");
                } catch {
                  setMessage("This browser could not reset local storage.");
                }
              }}
            >
              Reset demo
            </Button>
          </Modal>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}
