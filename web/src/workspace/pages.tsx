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
  Coverage,
  Heading,
  Photo,
  Reference,
  WorkRow,
} from "./components";
import { ASSETS, counts, reportText, type WorkItem } from "./state";
import { useWorkspace } from "./context";

export function Today() {
  const { state, decide } = useWorkspace();
  const [day, setDay] = useState("today"),
    [sort, setSort] = useState("urgency");
  const items = state.items;
  const attention = items
    .filter(
      (i) =>
        ["review", "unsupported"].includes(i.status) ||
        (i.status === "issue" && i.correction),
    )
    .sort((a, b) =>
      sort === "location"
        ? a.unit.localeCompare(b.unit)
        : sort === "trade"
          ? a.trade.localeCompare(b.trade)
          : 0,
    );
  const waiting = items.filter((i) =>
    ["evidence", "failed"].includes(i.status),
  );
  const completed = items.filter(
    (i) => i.update && ["ai", "human"].includes(i.status),
  );
  const dailyItems = items.filter((i) => i.update);
  const receivedCount = state.events.filter(
    (e) => e.actor === "Fixture check" || e.actor === "Field worker",
  ).length;
  return (
    <>
      <div className="context">
        <div className="crumbs">
          <Icon name="building" size={14} />
          <b>{state.projectName}</b>
          <span className="sep">/</span>Active stages:
          <span className="chip tag">Level 14 · Rough-in</span>
          <span className="chip tag">Level 3 · Finishes & punch</span>
        </div>
        <div className="row">
          <span className="small muted">
            Sample day · {day === "today" ? "Tue, Oct 6" : "Mon, Oct 5"}, 2026
          </span>
          <div className="seg">
            {["yesterday", "today"].map((d) => (
              <button
                key={d}
                className={day === d ? "on" : ""}
                onClick={() => setDay(d)}
              >
                {d === "today" ? "Today" : "Yesterday"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Heading
        eyebrow="PM daily overview"
        title={
          <>
            Good morning, Sarah.{" "}
            {day === "today" ? (
              <>
                {receivedCount} updates recorded —{" "}
                <span className="red-text">
                  {attention.length} need your decision.
                </span>
              </>
            ) : (
              "A new reference was approved yesterday."
            )}
          </>
        }
        sub="Every submitted demo update has a processing state. View the checks, evidence and decisions behind each result."
        action={
          <Link className="btn" to="/demo/capture">
            <Icon name="camera" size={16} />
            New field update
          </Link>
        }
      />
      {day === "yesterday" ? (
        <Card title="Reference activity · Oct 5">
          <div className="card-pad stack">
            <Chip status="inspect">A-402 Rev C · approved reference</Chip>
            <p>
              Rev C superseded Rev B and reopened Unit 407 framing. The earlier
              decision stays in history.
            </p>
            <Link className="btn" to="/demo/review/FRAME-407">
              Review affected work <Icon name="arrow" size={15} />
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid g-4">
            {[
              {
                label: "Updates recorded",
                value: receivedCount,
                detail: `${dailyItems.reduce((n, i) => n + i.photos.length, 0)} linked images · sample records`,
                tone: "",
                icon: "work",
              },
              {
                label: "Need your decision",
                value: attention.length,
                detail: "Findings, corrections and review items",
                tone: "red",
                icon: "alert",
              },
              {
                label: "Waiting on others",
                value: waiting.length,
                detail: "Evidence requests and analysis failures",
                tone: "amber",
                icon: "clock",
              },
              {
                label: "Completed today",
                value: completed.length,
                detail: `${completed.filter((i) => i.status === "ai").length} AI-checked · ${completed.filter((i) => i.status === "human").length} human accepted`,
                tone: "green",
                icon: "check",
              },
            ].map((k) => (
              <div
                key={k.label}
                className={`card kpi ${k.tone ? `accent-${k.tone}` : ""}`}
              >
                <div className="row between">
                  <span className="eyebrow">{k.label}</span>
                  <Icon name={k.icon} size={16} />
                </div>
                <div className="v">{k.value}</div>
                <p className="l">{k.detail}</p>
              </div>
            ))}
          </div>
          <div className="grid g-2-1">
            <div className="stack-lg">
              <Card
                title={`Needs your decision · ${attention.length}`}
                action={
                  <div className="seg">
                    {["urgency", "location", "trade"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSort(s)}
                        className={sort === s ? "on" : ""}
                      >
                        By {s}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="list">
                  {attention.map((i) => (
                    <WorkRow key={i.id} item={i} />
                  ))}
                  {!attention.length && (
                    <div className="empty">
                      <Icon name="check" />
                      <h3>All decisions recorded</h3>
                      <p>
                        Evidence requests and new submissions can still need
                        attention.
                      </p>
                    </div>
                  )}
                </div>
              </Card>
              <Card
                title={`Waiting on others · ${waiting.length}`}
                action={
                  <span className="small muted">
                    Evidence and processing remain separate
                  </span>
                }
              >
                <div className="list">
                  {waiting.map((i) => (
                    <WorkRow key={i.id} item={i} />
                  ))}
                  {!waiting.length && (
                    <p className="card-pad muted">
                      No outstanding evidence requests.
                    </p>
                  )}
                </div>
              </Card>
              <Card
                title={`Completed today · ${completed.length}`}
                action={
                  <span className="small muted">
                    Review or reopen any result
                  </span>
                }
              >
                <div className="list">
                  {completed.map((i) => (
                    <WorkRow
                      key={i.id}
                      item={i}
                      onDecision={(item) =>
                        decide(item, item.status === "ai" ? "accept" : "reopen")
                      }
                    />
                  ))}
                </div>
              </Card>
            </div>
            <aside className="stack-lg">
              <Card
                title="Level 14 coverage"
                action={
                  <Link className="small strong" to="/demo/building">
                    Open in 3D →
                  </Link>
                }
              >
                <div className="card-pad">
                  <Coverage items={items.filter((i) => i.level === 14)} />
                </div>
              </Card>
              <Card title="Reference changes">
                <div className="card-pad stack">
                  <div className="inset stack">
                    <div className="row">
                      <Icon name="report" size={16} />
                      <b>A-402 Rev C approved Oct 5</b>
                    </div>
                    <p className="small muted">
                      Supersedes Rev B for Level 14 partitions. Reopened Unit
                      407 framing. Earlier decisions remain in history.
                    </p>
                    <Link className="small strong" to="/demo/review/FRAME-407">
                      See affected items →
                    </Link>
                  </div>
                </div>
              </Card>
              <Card title="Inspections & tests">
                <div className="card-pad stack">
                  <p className="xs muted">
                    Formal records only. Never inferred from AI results.
                  </p>
                  <div className="row between">
                    <span className="small">Level 14 rough-in</span>
                    <Chip status="inspect">Requested · Oct 8 · sample</Chip>
                  </div>
                  <div className="row between">
                    <span className="small">Unit 402 pressure test</span>
                    <Chip status="none">Not recorded</Chip>
                  </div>
                </div>
              </Card>
              <Card title="Recent activity">
                <div className="card-pad">
                  <Timeline limit={4} />
                </div>
              </Card>
            </aside>
          </div>
        </>
      )}
    </>
  );
}

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
          <Link className="btn primary" to="/demo/capture">
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
            <option value="14">Level 14</option>
            <option value="3">Level 3</option>
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
        <Link to="/demo">← Today</Link>
        <span>/</span>Level {item.level}
        <span>/</span>Unit {item.unit}
        <span>/</span>
        <b>{item.id}</b>
      </div>
      <Link className="btn sm" to={`/demo/building?unit=${item.unit}`}>
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
          Unit {item.unit} · confirmed sample location
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
                unit selection. The highlighted position is approximate. No
                dimensions are inferred from the image.
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
                <Link className="btn primary" to={`/demo/issue/${item.id}`}>
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
                            navigate(`/demo/issue/${item.id}`);
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
              <Link className="btn" to={`/demo/capture?item=${item.id}`}>
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
              <Link className="btn" to={`/demo/capture?item=${item.id}`}>
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
            <Link to={`/demo/review/${e.item}`}>
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
export function Report() {
  const { state, act } = useWorkspace(),
    [note, setNote] = useState(state.reportNote);
  const text = reportText(state),
    c = counts(state.items);
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "everything-works-daily-report.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <Heading
        eyebrow="Daily report & history"
        title="A report grounded in the record."
        sub="Scope, decisions and evidence gaps. No invented weather, headcount or costs."
        action={
          <Button icon="download" onClick={download}>
            Download report
          </Button>
        }
      />
      <div className="grid g-3-2">
        <div className="stack-lg">
          <Card
            title="Daily project record"
            action={
              <Chip status={state.reportSigned ? "human" : "review"}>
                {state.reportSigned
                  ? "Signed locally · snapshot locked"
                  : "Unsigned draft"}
              </Chip>
            }
          >
            <div className="card-pad stack">
              <h2>{state.projectName}</h2>
              <p className="xs muted">Fictional project · local demo records</p>
              <div className="grid g-3">
                <div className="inset">
                  <h2>{c.ai + c.human}</h2>
                  <p className="small">Completed work items</p>
                </div>
                <div className="inset">
                  <h2>{c.issue}</h2>
                  <p className="small">Open issues</p>
                </div>
                <div className="inset">
                  <h2>{c.evidence}</h2>
                  <p className="small">Need evidence</p>
                </div>
              </div>
              <pre className="report-text">{text}</pre>
              {state.reportSigned && (
                <p className="xs muted">
                  The signed text above is a fixed snapshot. Current counts and
                  source history show subsequent activity.
                </p>
              )}
              <label>
                PM note
                <textarea
                  rows={4}
                  value={note}
                  readOnly={!!state.reportSigned}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add only information you can support."
                />
              </label>
              {!state.reportSigned && (
                <div className="row">
                  <Button
                    onClick={() => act({ type: "report", note, sign: false })}
                  >
                    Save draft note
                  </Button>
                  <Button
                    kind="primary"
                    icon="lock"
                    onClick={() => act({ type: "report", note, sign: true })}
                  >
                    Sign report snapshot
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
        <aside className="stack-lg">
          <Card title="Source history">
            <div className="card-pad">
              <Timeline limit={20} />
            </div>
          </Card>
          <Card title="What wasn't reported">
            <div className="card-pad stack">
              <p className="small muted">
                Weather, crew hours and costs have not been recorded. AI
                progress does not establish inspection approval.
              </p>
              <Chip status="fixture">Fixture results · sample project</Chip>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
export function Setup() {
  const { state, act } = useWorkspace(),
    [name, setName] = useState(state.projectName);
  const references = [
    "A-402 Rev C",
    "M-402 Rev 3",
    "E-14 Rev B",
    "P-201 Rev 2",
    "FP-214 Rev 1",
  ];
  return (
    <>
      <Heading
        eyebrow="Project setup"
        title="References, work items and checks"
        sub="Approved context for each assessment. Missing context needs review; it is never guessed."
      />
      <div className="setup-grid">
        <nav className="setup-nav" aria-label="Setup sections">
          <a href="#project">Project</a>
          <a href="#references">Approved references</a>
          <a href="#checks">Check catalog</a>
          <a href="#model">Model & drawings</a>
          <a href="#packages">Work packages</a>
        </nav>
        <div className="stack-lg">
          <Card title="Project" className="anchor-section">
            <form
              id="project"
              className="card-pad row"
              onSubmit={(e) => {
                e.preventDefault();
                act({ type: "project", name });
              }}
            >
              <label className="grow">
                Local demo project name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <Button type="submit" kind="primary">
                Save name
              </Button>
            </form>
          </Card>
          <Card title="Approved references">
            <div id="references" className="table-wrap anchor-section">
              <table className="t">
                <thead>
                  <tr>
                    <th>Sheet / document</th>
                    <th>Status</th>
                    <th>Applies to</th>
                    <th>Effect on decisions</th>
                  </tr>
                </thead>
                <tbody>
                  {references.map((r, i) => (
                    <tr key={r}>
                      <td>
                        <b>{r}</b>
                      </td>
                      <td>
                        <Chip status="inspect">Approved · sample record</Chip>
                      </td>
                      <td>
                        {
                          [
                            "L14 framing",
                            "L14 HVAC",
                            "L14 electrical",
                            "Unit plumbing",
                            "L14 fire protection",
                          ][i]
                        }
                      </td>
                      <td>
                        {i === 0
                          ? "Reopened Unit 407"
                          : i === 2
                            ? "Symbols schematic; no exact box heights"
                            : "Source retained with assessments"}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>M-402 Rev 4 (draft)</td>
                    <td>
                      <Chip status="review">Not approved</Chip>
                    </td>
                    <td>Not active</td>
                    <td>Not used by checks</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
          <Card
            title="Check catalog"
            footer="Release states below are designer fixtures, not measured evaluation results or enabled live automation."
          >
            <div id="checks" className="table-wrap anchor-section">
              <table className="t">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Capture needed</th>
                    <th>Release state</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "Visible plumbing components & routing",
                      "Each fixture wall, full height",
                      "Fixture auto-completion",
                    ],
                    [
                      "Duct presence",
                      "Ceiling from two angles",
                      "Fixture auto-completion",
                    ],
                    [
                      "Punch item visually resolved",
                      "Context and close-up",
                      "Fixture auto-completion",
                    ],
                    [
                      "Box presence & wall association",
                      "Every wall with boxes",
                      "Shadow mode",
                    ],
                    [
                      "Framing openings & placement",
                      "Partition from doorway and window",
                      "Review only",
                    ],
                    [
                      "Firestop installation / clearances",
                      "Qualified on-site review",
                      "Unsupported",
                    ],
                  ].map(([title, capture, release]) => (
                    <tr key={title}>
                      <td>
                        <b>{title}</b>
                      </td>
                      <td>{capture}</td>
                      <td>
                        <Chip
                          status={
                            release.startsWith("Fixture")
                              ? "fixture"
                              : release === "Unsupported"
                                ? "unsupported"
                                : "review"
                          }
                        >
                          {release}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Model & drawings">
            <div id="model" className="card-pad stack anchor-section">
              <p>
                The demo uses illustrative procedural geometry. Six modeled
                levels provide spatial navigation; Level 14 and Level 3 are the
                active fixture work locations.
              </p>
              <div className="row">
                <Link className="btn" to="/demo/building">
                  Explore demo model <Icon name="cube" size={16} />
                </Link>
                <Link className="btn" to="/">
                  Open connected projects / import real drawings{" "}
                  <Icon name="arrow" size={15} />
                </Link>
              </div>
              <p className="xs muted">
                Actual drawing imports, revisions and member permissions are
                managed in the authenticated connected workspace.
              </p>
            </div>
          </Card>
          <Card title="Work packages">
            <div id="packages" className="card-pad stack anchor-section">
              <p>
                {state.items.length} named work items across{" "}
                {new Set(state.items.map((i) => i.trade)).size} trades. Every
                record references its source and required checks.
              </p>
              <Link className="btn" to="/demo/work">
                Open work-item list
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
function Missing() {
  return (
    <div className="empty">
      <h1>Work item not found</h1>
      <Link className="btn" to="/demo/work">
        Back to work
      </Link>
    </div>
  );
}
