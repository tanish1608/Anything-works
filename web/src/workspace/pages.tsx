import { locationLabel } from "./projectState";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Icon } from "../studio/Icon";
import {
  Button,
  Card,
  CheckTable,
  Chip,
  Heading,
  Photo,
  Reference,
  WorkRow,
} from "./components";
import { ASSETS, type WorkItem } from "./state";
import { useWorkspace } from "./context";

export function Work() {
  const { state } = useWorkspace(),
    [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "all";
  const [search, setSearch] = useState(""),
    [trade, setTrade] = useState("all"),
    [level, setLevel] = useState("all");
  const items = state.items.filter(
    (i) =>
      (filter === "all" ||
        (filter === "issues" && !!i.issue) ||
        (filter === "review" &&
          (["review", "unsupported", "failed"].includes(i.status) ||
            i.correction)) ||
        (filter === "evidence" && i.status === "evidence") ||
        (filter === "complete" && ["ai", "human"].includes(i.status))) &&
      (trade === "all" || i.trade === trade) &&
      (level === "all" || String(i.level) === level) &&
      `${i.unit} ${i.title} ${i.id} ${i.owner}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="Work & issues"
        title="Every work item. Its evidence. Its next step."
        sub="Scope, progress and exceptions in one place. Open any row to see the source record."
        action={
          <Link className="btn primary" to="/capture">
            <Icon name="plus" size={16} />
            Submit daily update
          </Link>
        }
      />
      <div className="context">
        <div className="seg work-tabs">
          {[
            ["all", "All work"],
            ["review", "Needs review"],
            ["issues", "Open issues"],
            ["evidence", "Needs evidence"],
            ["complete", "Completed"],
          ].map(([id, text]) => (
            <button
              key={id}
              className={filter === id ? "on" : ""}
              onClick={() => setParams(id === "all" ? {} : { filter: id })}
            >
              {text}
            </button>
          ))}
        </div>
        <span className="small muted">
          {items.length} of {state.items.length} items
        </span>
      </div>
      <div className="row filters">
        <label className="grow">
          Find work
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search unit, title, owner or ID"
          />
        </label>
        <label>
          Trade
          <select value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="all">All trades</option>
            {Array.from(new Set(state.items.map((i) => i.trade))).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">All levels</option>
            {[...new Set(state.items.map((i) => i.level))].sort().map((l) => (
              <option key={l} value={l}>
                {state.items.find((i) => i.level === l)?.location?.levelName ||
                  `Level ${l}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Card>
        <div className="list">
          {items.map((i) => (
            <WorkRow key={i.id} item={i} />
          ))}
          {!items.length && (
            <div className="empty">
              <Icon name="search" size={26} />
              <h3>No matching work</h3>
              <p>Change the filters or search to see more items.</p>
              <Button
                onClick={() => {
                  setSearch("");
                  setTrade("all");
                  setLevel("all");
                  setParams({});
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

function useItem() {
  const { id } = useParams(),
    { state } = useWorkspace();
  return state.items.find((i) => i.id === id);
}
function Breadcrumb({ item }: { item: WorkItem }) {
  return (
    <div className="context">
      <div className="crumbs">
        <Link to="/">← Home</Link>
        <span>/</span>Level {item.level}
        <span>/</span>
        {locationLabel(item)}
        <span>/</span>
        <b>{item.id}</b>
      </div>
      <Link className="btn sm" to={`/building?work=${item.id}`}>
        Locate in 3D <Icon name="cube" size={14} />
      </Link>
    </div>
  );
}
function RecordState({ item }: { item: WorkItem }) {
  return (
    <Card
      title="Record state"
      action={
        <span className="xs muted">Each dimension is stored separately</span>
      }
    >
      <dl className="state-table">
        {[
          [
            "Processing",
            item.processing === "completed"
              ? "Completed"
              : item.processing === "queued"
                ? "On this device · queued"
                : item.processing === "failed"
                  ? "Analysis failed"
                  : "Awaiting manual review",
            item.processing === "failed" ? "failed" : "proc",
          ],
          [
            "Evidence coverage",
            item.coverage,
            item.status === "evidence" ? "evidence" : "none",
          ],
          [
            "Observed progress",
            item.progress,
            ["ai", "human"].includes(item.status) ? item.status : "none",
          ],
          [
            "Check result",
            item.checks.some((c) => c.result === "discrepancy")
              ? "Potential discrepancy"
              : item.checks.some((c) => c.result === "insufficient")
                ? "Insufficient evidence"
                : item.checks.length
                  ? "See individual checks"
                  : "Not assessed",
            item.status,
          ],
          [
            "Human review",
            item.review,
            item.status === "human" ? "human" : "review",
          ],
          [
            "Issue",
            item.issue ||
              (item.dismissed ? "Finding dismissed" : "Not confirmed"),
            item.issue ? "issue" : "none",
          ],
          [
            "Formal inspection",
            item.inspection,
            item.inspection === "Not recorded" ? "none" : "inspect",
          ],
        ].map(([label, value, status]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <Chip status={status as Parameters<typeof Chip>[0]["status"]}>
                {value}
              </Chip>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
export function Review() {
  const item = useItem(),
    { act, decide } = useWorkspace(),
    navigate = useNavigate();
  const [view, setView] = useState("Side by side"),
    [owner, setOwner] = useState(item?.owner || ""),
    [due, setDue] = useState(item?.due || "2026-10-07T07:00"),
    [requirements, setRequirements] = useState(item?.resolution || "");
  if (!item) return <Missing />;
  const photo = item.photos.at(-1);
  return (
    <>
      <Breadcrumb item={item} />
      <Heading
        eyebrow={`${item.trade} · ${item.update || item.id}`}
        title={item.title}
        sub={`${item.owner} · ${item.reference} · ${item.coverage}`}
      />
      <div className="row">
        <Chip status={item.status} />
        <Chip status="fixture">Fixture result</Chip>
        <span className="chip tag">
          <Icon name="pin" size={14} />
          {locationLabel(item)} · confirmed sample location
        </span>
      </div>
      <div className="grid g-3-2">
        <div className="stack-lg">
          <Card
            title="Evidence vs approved reference"
            action={
              <div className="seg dark">
                {["Side by side", "Photo", "Reference", "Overlay"].map((t) => (
                  <button
                    className={view === t ? "on" : ""}
                    key={t}
                    onClick={() => setView(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            }
          >
            <div className="card-pad stack">
              <div
                className={`comparison ${view === "Photo" || view === "Reference" ? "single" : ""} ${view === "Overlay" ? "overlay" : ""}`}
              >
                {view !== "Reference" &&
                  (photo ? (
                    <Photo
                      src={photo.url}
                      sample={photo.sample}
                      label={`${item.update || item.id} · latest evidence`}
                      highlight={item.id === "F-118"}
                    />
                  ) : (
                    <div className="placeholder evidence-photo">
                      <div>
                        <Icon name="camera" size={30} />
                        <p>
                          No image attached.
                          <br />
                          Capture evidence to assess this work.
                        </p>
                      </div>
                    </div>
                  ))}
                {view !== "Photo" && <Reference item={item} />}
              </div>
              <div className="inset small">
                <b>How the photo was matched:</b> fixture location confirmed by
                the selected model component. The pin marks its model centre;
                photo registration is not performed. No dimensions are inferred
                from the image.
              </div>
            </div>
          </Card>
          <CheckTable item={item} />
          {!!item.assessments?.length && (
            <Card title="Earlier assessment snapshots">
              <div className="card-pad stack">
                {item.assessments.map((a, i) => (
                  <details className="inset" key={`${a.update}-${i}`}>
                    <summary>
                      {a.update || "Earlier record"} · {a.reference} ·{" "}
                      {a.progress}
                    </summary>
                    <p className="xs muted">
                      Retained before the later update · {a.coverage}
                    </p>
                    {a.checks.map((c, n) => (
                      <p key={n} className="small">
                        {c.name}: {c.result}
                      </p>
                    ))}
                  </details>
                ))}
              </div>
            </Card>
          )}
          <Card title="Sources used">
            <div className="card-pad grid g-3">
              <div className="inset">
                <b>{item.reference}</b>
                <p className="xs muted">
                  Approved sample reference · snapshot at check time
                </p>
              </div>
              <div className="inset">
                <b>{item.update || "No update yet"}</b>
                <p className="xs muted">Linked evidence and worker claim</p>
              </div>
              <div className="inset">
                <b>Fixture check policy</b>
                <p className="xs muted">
                  Sample result · no field accuracy claim
                </p>
              </div>
            </div>
          </Card>
        </div>
        <aside className="stack-lg">
          <RecordState item={item} />
          <Card title="Your decision">
            <div className="card-pad stack">
              <p className="small muted">
                The original result is kept. Your reason, name and time are
                recorded.
              </p>
              {item.issue ? (
                <Link className="btn primary" to={`/issue/${item.id}`}>
                  Review open issue
                </Link>
              ) : (
                <>
                  {item.checks.some((c) => c.result === "discrepancy") &&
                    !item.dismissed && (
                      <form
                        className="inset stack"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (
                            act({
                              type: "confirm",
                              id: item.id,
                              owner,
                              due,
                              reason: requirements,
                            })
                          )
                            navigate(`/issue/${item.id}`);
                        }}
                      >
                        <h3>Confirm as issue</h3>
                        <label>
                          Owner
                          <input
                            required
                            value={owner}
                            onChange={(e) => setOwner(e.target.value)}
                          />
                        </label>
                        <label>
                          Due
                          <input
                            type="datetime-local"
                            required
                            value={due}
                            onChange={(e) => setDue(e.target.value)}
                          />
                        </label>
                        <label>
                          Resolution requires
                          <textarea
                            required
                            rows={3}
                            value={requirements}
                            onChange={(e) => setRequirements(e.target.value)}
                          />
                        </label>
                        <Button
                          type="submit"
                          kind="danger"
                          icon="alert"
                          disabled={!requirements.trim()}
                        >
                          Confirm issue & assign owner
                        </Button>
                        <p className="xs muted">
                          Delivery is simulated in this demo.
                        </p>
                      </form>
                    )}
                  <div className="row">
                    <Button
                      icon="camera"
                      onClick={() => decide(item, "request")}
                    >
                      Request evidence
                    </Button>
                    {item.status === "ai" && (
                      <Button
                        kind="primary"
                        icon="people"
                        onClick={() => decide(item, "accept")}
                      >
                        Human accept
                      </Button>
                    )}
                    {item.status === "human" && (
                      <Button onClick={() => decide(item, "reopen")}>
                        Reopen
                      </Button>
                    )}
                    {item.status === "failed" && (
                      <Button
                        icon="reset"
                        onClick={() => decide(item, "retry")}
                      >
                        Retry in review mode
                      </Button>
                    )}
                    {item.status === "unsupported" && (
                      <Button
                        icon="people"
                        onClick={() => decide(item, "assign")}
                      >
                        Assign qualified reviewer
                      </Button>
                    )}
                  </div>
                  {item.checks.some((c) => c.result === "discrepancy") && (
                    <Button
                      kind="ghost"
                      onClick={() => decide(item, "dismiss")}
                    >
                      Dismiss with reason / approved change
                    </Button>
                  )}
                </>
              )}
              <Link className="btn" to={`/capture?item=${item.id}`}>
                <Icon name="camera" size={15} />
                Add evidence
              </Link>
            </div>
          </Card>
          <Card title="History">
            <div className="card-pad">
              <Timeline item={item.id} />
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
export function Issue() {
  const item = useItem(),
    { decide } = useWorkspace();
  if (!item) return <Missing />;
  const photo = item.photos.at(-1);
  return (
    <>
      <Breadcrumb item={item} />
      <Heading
        eyebrow={`${item.issue || "Resolved issue"} · ${item.trade}`}
        title={item.title}
        sub={`Owner ${item.owner} · reference ${item.reference}`}
      />
      <div className="row">
        <Chip status={item.issue ? "issue" : "human"}>
          {item.issue ? "Open issue" : "Resolved · human accepted"}
        </Chip>
        {item.correction && <Chip status="proc">Correction submitted</Chip>}
        <Chip status="fixture">Fixture result</Chip>
      </div>
      <Card>
        <div className="lifecycle">
          {[
            "Potential finding",
            "Confirmed · assigned",
            "Correction submitted",
            "Resolution decision",
          ].map((text, i) => (
            <div
              key={text}
              className={`lc ${i < 2 || (i === 2 && item.correction) || !item.issue ? "done" : ""} ${i === 3 && item.issue ? "now" : ""}`}
            >
              <span className="n">{i + 1}</span>
              <strong>{text}</strong>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid g-3-2">
        <div className="stack-lg">
          <Card title="Before and after">
            <div className="card-pad comparison">
              <Photo
                src={
                  ASSETS +
                  (item.id === "ISS-031"
                    ? "duct-unit-405-before.jpg"
                    : item.image || "framing-unit-403.jpg")
                }
                label="Before · generated sample"
                highlight
              />
              <div>
                {photo ? (
                  <Photo
                    src={photo.url}
                    sample={photo.sample}
                    label={
                      item.correction || !item.issue
                        ? "Correction evidence"
                        : "Latest evidence · not yet corrected"
                    }
                  />
                ) : (
                  <div className="placeholder evidence-photo">
                    No correction evidence yet
                  </div>
                )}
              </div>
            </div>
          </Card>
          <CheckTable item={item} />
          <Card title="Resolution requirements">
            <div className="card-pad stack">
              <p>
                {item.resolution ||
                  "Submit clear correction evidence for review."}
              </p>
              {item.condition && (
                <div className="inset warning">{item.condition}</div>
              )}
              <p className="xs muted">
                A new photo or a recheck alone does not close this issue.
              </p>
            </div>
          </Card>
          <Card title="Decision history">
            <div className="card-pad">
              <Timeline item={item.id} />
            </div>
          </Card>
        </div>
        <aside className="stack-lg">
          <Card
            title={item.issue ? "Resolve this issue?" : "Resolution recorded"}
          >
            <div className="card-pad stack">
              {item.issue ? (
                <>
                  <p className="small muted">
                    Review correction evidence and record how each resolution
                    requirement was addressed.
                  </p>
                  <Button
                    kind="primary lg block"
                    icon="check"
                    disabled={!item.correction}
                    onClick={() => decide(item, "resolve")}
                  >
                    Accept correction & resolve
                  </Button>
                  {!item.correction && (
                    <p className="xs muted">
                      Correction evidence is required before resolution.
                    </p>
                  )}
                  <div className="row">
                    <Button
                      icon="camera"
                      onClick={() => decide(item, "request")}
                    >
                      More evidence needed
                    </Button>
                    <Button
                      kind="danger"
                      onClick={() => decide(item, "reject")}
                    >
                      Reject correction
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Chip status="human">Human acceptance recorded</Chip>
                  <p className="small">
                    The original finding, evidence and decision remain in
                    history.
                  </p>
                  <Button onClick={() => decide(item, "reopen")}>
                    Reopen work
                  </Button>
                </>
              )}
              <Link className="btn" to={`/capture?item=${item.id}`}>
                <Icon name="camera" size={16} />
                Submit correction evidence
              </Link>
              <div className="inset xs muted">
                This decision does not record an inspection. Notifications are
                simulated in this local demo.
              </div>
            </div>
          </Card>
          <Card title="Assignment">
            <div className="card-pad">
              <dl className="kv left">
                <dt>Owner</dt>
                <dd>{item.owner}</dd>
                <dt>Due</dt>
                <dd>{item.due?.replace("T", " · ") || "Not assigned"}</dd>
                <dt>Reference</dt>
                <dd>{item.reference}</dd>
                <dt>Formal inspection</dt>
                <dd>{item.inspection}</dd>
              </dl>
            </div>
          </Card>
          <RecordState item={item} />
        </aside>
      </div>
    </>
  );
}
export function Timeline({
  item,
  limit = 12,
}: {
  item?: string;
  limit?: number;
}) {
  const { state } = useWorkspace(),
    events = state.events
      .filter((e) => !item || e.item === item)
      .slice(0, limit);
  return (
    <div className="tl">
      {events.map((e) => (
        <div
          className={`tl-item ${["ai", "human"].includes(e.tone) ? "green" : e.tone === "issue" ? "red" : "amber"}`}
          key={e.id}
        >
          <div className="tl-time">
            {new Date(e.at).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {e.actor}
          </div>
          <div className="small">
            <Link to={`/review/${e.item}`}>
              <b>{e.item}</b>
            </Link>{" "}
            · {e.text}
          </div>
        </div>
      ))}
      {!events.length && (
        <p className="small muted">No events for this item yet.</p>
      )}
    </div>
  );
}
export function Setup() {
  const { state, act, model } = useWorkspace(),
    [name, setName] = useState(state.projectName);
  return (
    <>
      <Heading
        eyebrow="Project setup"
        title="Model, locations and daily updates"
        sub="One source model for Home, Logs and Building."
      />
      <Card title="1. Project and design baseline">
        <form
          className="card-pad row"
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "project", name });
          }}
        >
          <label className="grow">
            Project name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <Button type="submit">Save name</Button>
        </form>
        <div className="card-pad">
          <p>
            {model.source.attribution} · {model.source.license}
          </p>
          <p>
            Revision {model.version}. This public design is ready for
            demonstration, not an approved construction document.
          </p>
          <Link className="btn" to="/">
            Create a connected project and upload your IFC
          </Link>
        </div>
      </Card>
      <Card title="2. Review the imported structure">
        <div className="card-pad stack">
          <p>
            {model.elements.length} components across {model.plans.length}{" "}
            levels and {model.plans.reduce((n, l) => n + l.rooms.length, 0)}{" "}
            spaces. Names and associations come from the IFC; unassigned areas
            remain unassigned.
          </p>
          {model.plans.map((l) => (
            <details key={l.id}>
              <summary>
                {l.name} · {l.rooms.length} spaces ·{" "}
                {model.elements.filter((e) => e.level_id === l.id).length}{" "}
                components
              </summary>
              <ul>
                {l.rooms.map((r) => (
                  <li key={r.id}>
                    {r.code} {r.name} ·{" "}
                    {model.elements.filter((e) => e.zone_id === r.id).length}{" "}
                    components
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <Link className="btn" to="/building">
            Review model and model-derived 2D plans
          </Link>
        </div>
      </Card>
      <Card title="3. Work locations">
        <div className="card-pad stack">
          <p>
            Every sample work package references this revision and explicit
            component IDs. Generated sample photos demonstrate the workflow;
            they are not photos of this building.
          </p>
          {state.items.map((i) => (
            <Link key={i.id} to={`/building?work=${i.id}`}>
              {i.title} — {locationLabel(i)}
            </Link>
          ))}
        </div>
      </Card>
      <Card title="4. Daily update to progress">
        <div className="card-pad stack">
          <p>
            Select work → confirm its model location → attach evidence and a
            progress claim → submit. A version-bound assessment request is
            recorded. The live AI agent is not connected; new evidence awaits
            manual review. Open issues require explicit resolution. Completion
            updates component colour consistently on all pages.
          </p>
          <p>
            Offline updates remain queued on this device. Reconnecting moves the
            same request into review; it does not analyse evidence or mark work
            complete.
          </p>
          <Link className="btn" to="/capture">
            Try a daily update
          </Link>
          <Link className="btn" to="/logs">
            View recorded progress
          </Link>
        </div>
      </Card>
    </>
  );
}
function Missing() {
  return (
    <div className="empty">
      <h1>Work item not found</h1>
      <Link className="btn" to="/work">
        Back to work
      </Link>
    </div>
  );
}
