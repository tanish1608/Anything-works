import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { ElementDetail } from "../api/types";
import { Icon } from "../studio/Icon";
import ModelPlan from "../viewer/ModelPlan";
import { useWorkspace } from "./context";
import {
  ASSETS,
  COLORS,
  LABELS,
  type Action,
  type Draft,
  type WorkItem,
} from "./state";
import { readPhoto } from "./photoInput";
import { dayKey, itemsAt, latestRecordedDay, validHistory } from "./history";
import {
  floorName,
  unitForRoom,
  workPath,
  type Panel,
} from "./spatialNavigation";
import EvidenceImage from "./EvidenceImage";
import { VIEW_ROLES, type ViewRole } from "./viewRoles";
import WorldDialog from "./WorldDialog";
import { plannedComponent, availabilityStorageKey } from "./projectState";

type Open = (panel: Panel, work?: string) => void;
export type ReviewAction =
  | "accept"
  | "confirm"
  | "request"
  | "resolve"
  | "reject"
  | "reopen"
  | "dismiss"
  | "retry"
  | "assign";
export function WorkState({ item }: { item: WorkItem }) {
  return (
    <span className="world-state" style={{ color: COLORS[item.status] }}>
      <i style={{ background: COLORS[item.status] }} />
      {item.processing === "queued"
        ? "Queued on this device"
        : LABELS[item.status]}
    </span>
  );
}
function WorkRow({ item, open }: { item: WorkItem; open: Open }) {
  const { model } = useWorkspace();
  return (
    <button
      className="world-work-row"
      aria-label={`${item.title}. ${workPath(model, item).slice(1).join(" / ")}. ${item.owner}`}
      onClick={() => open("record", item.id)}
    >
      <span
        className="world-work-dot"
        style={{ background: COLORS[item.status] }}
      />
      <span>
        <strong>{item.title}</strong>
        <small>{workPath(model, item).slice(1).join(" / ")}</small>
        <small>{item.owner}</small>
      </span>
      <Icon name="chevron" size={16} />
    </button>
  );
}
export function SummaryPanel({ open }: { open: Open }) {
  const { state, canCapture } = useWorkspace();
  const issues = state.items.filter((i) => i.issue),
    review = state.items.filter((i) =>
      ["review", "evidence", "failed", "unsupported"].includes(i.status),
    );
  const complete = state.items.filter((i) =>
    ["human", "ai"].includes(i.status),
  );
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">PROJECT PULSE</span>
        <h2>The building, today.</h2>
        <p>
          {issues.length} open issues and {review.length} updates need
          attention. {complete.length} of {state.items.length} tracked work
          packages have recorded completion.
        </p>
      </div>
      <div className="world-summary-grid">
        <button onClick={() => open("issues")}>
          <strong>{issues.length}</strong>
          <span>Open issues</span>
        </button>
        <button onClick={() => open("issues")}>
          <strong>{review.length}</strong>
          <span>Awaiting review</span>
        </button>
      </div>
      <div className="world-section-heading">
        <h3>Start here</h3>
        <button onClick={() => open("issues")}>
          View all <Icon name="arrow" size={13} />
        </button>
      </div>
      {[...new Map([...issues, ...review].map((i) => [i.id, i])).values()]
        .slice(0, 4)
        .map((i) => (
          <WorkRow key={i.id} item={i} open={open} />
        ))}
      <div className="world-note">
        <Icon name="spark" size={17} />
        <p>
          This summary follows the project records. New uploaded photos await
          review; the live AI agent is not connected.
        </p>
      </div>
      <button
        className="world-primary world-wide"
        onClick={() => open("capture")}
        disabled={!canCapture}
      >
        <Icon name="camera" size={16} />
        Add a daily update
      </button>
    </>
  );
}
export function IssuesPanel({ open, search }: { open: Open; search: string }) {
  const { state, model } = useWorkspace();
  const [filter, setFilter] = useState("attention");
  const [sort, setSort] = useState("priority");
  const [owner, setOwner] = useState("");
  const [limit, setLimit] = useState(40);
  const rows = state.items
    .filter((i) => {
      // Header search spans all statuses; a planned or accepted item must remain findable.
      if (!search.trim()) {
        if (filter === "issues" && !i.issue) return false;
        if (
          filter === "attention" &&
          !["issue", "review", "evidence", "failed", "unsupported"].includes(
            i.status,
          )
        )
          return false;
        if (filter === "complete" && !["human", "ai"].includes(i.status))
          return false;
      }
      if (owner && i.owner !== owner) return false;
      return `${i.id} ${i.title} ${i.owner} ${i.trade} ${workPath(model, i).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase().trim());
    })
    .sort((a, b) => {
      if (sort === "due")
        return (
          (a.due || "9999").localeCompare(b.due || "9999") ||
          a.title.localeCompare(b.title)
        );
      if (sort === "owner")
        return a.owner.localeCompare(b.owner) || a.title.localeCompare(b.title);
      const rank = (i: WorkItem) =>
        i.issue
          ? 0
          : ["review", "failed"].includes(i.status)
            ? 1
            : ["evidence", "unsupported"].includes(i.status)
              ? 2
              : i.status === "none"
                ? 3
                : 4;
      return (
        rank(a) - rank(b) ||
        (a.due || "9999").localeCompare(b.due || "9999") ||
        a.title.localeCompare(b.title)
      );
    });
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">WORK & ISSUES</span>
        <h2>{search ? "Search the building" : "What needs attention"}</h2>
        <p>
          Select a record to find its exact component and follow the evidence.
        </p>
      </div>
      <div className="world-filter-row">
        {[
          ["attention", "Attention"],
          ["issues", "Issues"],
          ["complete", "Complete"],
          ["all", "All work"],
        ].map(([value, label]) => (
          <button
            className={filter === value ? "active" : ""}
            aria-pressed={filter === value}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="world-list-controls">
        <label>
          Sort
          <select
            aria-label="Sort work records"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="priority">Issues first</option>
            <option value="due">Due date</option>
            <option value="owner">Responsible team</option>
          </select>
        </label>
        <label>
          Team
          <select
            aria-label="Filter responsible team"
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setLimit(40);
            }}
          >
            <option value="">All teams</option>
            {[...new Set(state.items.map((i) => i.owner))].sort().map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </div>
      {search.trim() && <p className="world-muted">Searching all statuses.</p>}
      <span className="world-list-count">
        {rows.length} {rows.length === 1 ? "record" : "records"}
      </span>
      {rows.slice(0, limit).map((i) => (
        <WorkRow key={i.id} item={i} open={open} />
      ))}
      {rows.length > limit && (
        <button
          className="world-secondary world-wide"
          onClick={() => setLimit((n) => n + 40)}
        >
          Show more records ({rows.length - limit} remaining)
        </button>
      )}
      {!rows.length && (
        <div className="world-empty">
          <Icon name="search" size={28} />
          <h3>No matching records</h3>
          <p>Try another location, trade or work item.</p>
        </div>
      )}
    </>
  );
}
export function LocationsPanel({
  level,
  unit,
  room,
  scope,
  open,
  selectElement,
}: {
  level: string | null;
  unit: string | null;
  room: string | null;
  scope: (
    level: string | null,
    unit?: string | null,
    room?: string | null,
  ) => void;
  open: Open;
  selectElement: (id: string) => void;
}) {
  const { model, state } = useWorkspace();
  const [query, setQuery] = useState("");
  const [componentLimit, setComponentLimit] = useState(40);
  const plan = model.plans.find((p) => p.id === level);
  const groups = [
    ...new Set(plan?.rooms.map((r) => unitForRoom(model, r.code)) || []),
  ];
  const rooms =
    plan?.rooms.filter(
      (r) =>
        !unit ||
        (unit === "shared"
          ? !unitForRoom(model, r.code)
          : unitForRoom(model, r.code) === unit),
    ) || [];
  const rows = state.items.filter(
    (i) =>
      (!level || i.location?.levelId === level) &&
      (!unit ||
        (unit === "shared"
          ? !unitForRoom(model, i.location?.spaceCode)
          : unitForRoom(model, i.location?.spaceCode) === unit)) &&
      (!room || i.location?.roomId === room),
  );
  const components = model.elements.filter((e) => {
    if ((level && e.level_id !== level) || (room && e.zone_id !== room))
      return false;
    if (unit && !room && !rooms.some((r) => r.id === e.zone_id)) return false;
    return (
      !query.trim() ||
      `${e.name} ${e.ifc_guid} ${e.id} ${e.discipline} ${e.ifc_class}`
        .toLowerCase()
        .includes(query.toLowerCase().trim())
    );
  });
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">SPATIAL DIRECTORY</span>
        <h2>{plan ? floorName(plan.name) : "Explore the building"}</h2>
        <p>
          {room
            ? "Work tied to the selected room and its source components."
            : "Move from a floor to a unit, then into the work."}
        </p>
      </div>
      {!plan &&
        model.plans.map((p) => (
          <button
            className="world-location-row"
            key={p.id}
            onClick={() => scope(p.id)}
          >
            <Icon name="layers" size={18} />
            <span>
              <strong>{floorName(p.name)}</strong>
              <small>{p.rooms.length} source spaces</small>
            </span>
            <Icon name="chevron" size={15} />
          </button>
        ))}
      {plan && (
        <>
          <div className="world-filter-row">
            <button
              className={!unit ? "active" : ""}
              onClick={() => scope(plan.id)}
            >
              All spaces
            </button>
            {groups.map((g) => (
              <button
                className={(g || "shared") === unit ? "active" : ""}
                key={g || "shared"}
                onClick={() => scope(plan.id, g || "shared")}
              >
                {g ? `Unit ${g}` : "Shared"}
              </button>
            ))}
          </div>
          {rooms.map((r) => (
            <button
              className={`world-location-row ${room === r.id ? "selected" : ""}`}
              key={r.id}
              aria-label={`Explore ${r.name} · ${r.code || "No space code"}${rooms.filter((other) => other.code === r.code && other.name === r.name).length > 1 ? ` · source ${r.ifc_guid || r.id}` : ""}`}
              onClick={() => scope(plan.id, unitForRoom(model, r.code), r.id)}
            >
              <Icon name="cube" size={18} />
              <span>
                <strong>{r.name}</strong>
                <small>
                  {r.code || "No space code"}
                  {rooms.filter(
                    (other) => other.code === r.code && other.name === r.name,
                  ).length > 1
                    ? ` · source ${(r.ifc_guid || r.id).slice(0, 8)}`
                    : ""}
                  {unitForRoom(model, r.code)
                    ? ` · Unit ${unitForRoom(model, r.code)}`
                    : ""}
                </small>
              </span>
              <Icon name="chevron" size={15} />
            </button>
          ))}
          {!rooms.length && (
            <p className="world-muted">
              No rooms are defined on this source level.
            </p>
          )}
        </>
      )}
      <div className="world-section-heading">
        <h3>Located work</h3>
        <span>{rows.length}</span>
      </div>
      {rows.map((i) => (
        <WorkRow key={i.id} item={i} open={open} />
      ))}
      {!rows.length && (
        <p className="world-muted">
          No work packages are tracked in this selection yet.
        </p>
      )}
      <section className="world-detail-section">
        <h3>Source components</h3>
        <label>
          Find a component
          <input
            type="search"
            value={query}
            placeholder="Name, system or source ID…"
            onChange={(e) => {
              setQuery(e.target.value);
              setComponentLimit(40);
            }}
          />
        </label>
        {components.slice(0, componentLimit).map((e) => (
          <button
            className="world-location-row"
            key={e.id}
            onClick={() => selectElement(e.id)}
          >
            <Icon name="cube" size={17} />
            <span>
              <strong>{e.name || e.ifc_class}</strong>
              <small>
                {e.discipline} · {e.ifc_guid}
              </small>
            </span>
            <Icon name="chevron" size={15} />
          </button>
        ))}
        <p className="world-muted">
          Showing {Math.min(components.length, componentLimit)} of{" "}
          {components.length} source components.
        </p>
        {components.length > componentLimit && (
          <button
            className="world-secondary world-wide"
            onClick={() => setComponentLimit((n) => n + 40)}
          >
            Show more components
          </button>
        )}
        {!components.length && (
          <p>No source components match this selection.</p>
        )}
      </section>
    </>
  );
}
export function RecordPanel({
  item,
  open,
  locate,
}: {
  item: WorkItem;
  open: Open;
  locate: () => void;
}) {
  const { model, state, act, canReview, canCapture } = useWorkspace();
  const latestJob = state.assessmentJobs?.find(
    (j) => j.item === item.id && j.update === item.update,
  );
  const [image, setImage] = useState(() =>
      latestJob?.photos.length
        ? Math.max(
            0,
            item.photos.findIndex((p) => p.id === latestJob.photos[0]),
          )
        : 0,
    ),
    [compare, setCompare] = useState(false),
    [review, setReview] = useState<ReviewAction | null>(null);
  const [reason, setReason] = useState(""),
    [owner, setOwner] = useState(item.owner),
    [due, setDue] = useState(item.due || "");
  const [lightbox, setLightbox] = useState(false);
  const photo = item.photos[image] || item.photos[0];
  const fallback = item.image
    ? { url: ASSETS + item.image, sample: true, name: "Generated illustration" }
    : null;
  const displayedPhoto = photo || fallback;
  const element = model.elements.find(
    (e) => e.id === item.location?.elements[0],
  );
  const plan = model.plans.find((p) => p.id === item.location?.levelId);
  const history = validHistory(state.events.filter((e) => e.item === item.id));
  const perform = () => {
    if (!review) return;
    const action: Action =
      review === "confirm" || review === "assign"
        ? { type: review, id: item.id, owner, due, reason }
        : { type: review, id: item.id, reason };
    if (act(action)) {
      setReview(null);
      setReason("");
    }
  };
  const startReview = (type: ReviewAction) => {
    setReview(type);
    setReason("");
  };
  return (
    <>
      <div className="world-record-heading">
        <span className="world-eyebrow">
          {item.issue || item.id} / {item.trade}
        </span>
        <h2>{item.title}</h2>
        <WorkState item={item} />
        <p className="world-record-path">{workPath(model, item).join(" › ")}</p>
      </div>
      <div className="world-evidence">
        {displayedPhoto ? (
          <button
            className="world-photo-open"
            onClick={() => setLightbox(true)}
            aria-label="Enlarge evidence photo"
          >
            <EvidenceImage src={displayedPhoto.url} alt={displayedPhoto.name} />
            <span>
              <Icon name="expand" size={15} />
            </span>
          </button>
        ) : (
          <div className="world-evidence-empty">
            <Icon name="camera" size={30} />
            <p>No evidence attached</p>
          </div>
        )}
        <div className="world-evidence-caption">
          <span>
            {displayedPhoto?.sample
              ? "Generated sample · not a photo of this building"
              : "Uploaded evidence · review required"}
          </span>
          <span>{photo ? `${image + 1} / ${item.photos.length}` : ""}</span>
        </div>
        {item.photos.length > 1 && (
          <div className="world-photo-strip">
            {item.photos.map((p, n) => (
              <button
                key={p.id}
                className={image === n ? "active" : ""}
                onClick={() => setImage(n)}
                aria-label={`Evidence photo ${n + 1}`}
              >
                <EvidenceImage src={p.url} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
      {lightbox && displayedPhoto && (
        <WorldDialog
          className="world-lightbox"
          label="Evidence photo"
          close={() => setLightbox(false)}
        >
          <button
            autoFocus
            aria-label="Close evidence photo"
            onClick={() => setLightbox(false)}
          >
            <Icon name="close" />
          </button>
          <EvidenceImage src={displayedPhoto.url} alt={displayedPhoto.name} />
          <p>
            {displayedPhoto.sample
              ? "Generated sample image"
              : "Uploaded photo"}
          </p>
        </WorldDialog>
      )}
      <div className="world-record-tools">
        <button onClick={locate}>
          <Icon name="pin" size={15} />
          Zoom to component
        </button>
        <button aria-expanded={compare} onClick={() => setCompare(!compare)}>
          <Icon name="layers" size={15} />
          {compare ? "Hide reference" : "Compare reference"}
        </button>
      </div>
      {compare && plan && (
        <section className="world-reference">
          <h3>Source model plan</h3>
          <ModelPlan
            plan={plan}
            selected={element?.id || null}
            onSelect={() => {}}
            minimal
          />
          <p>
            Model-derived geometry. This is not an approved construction
            drawing. Reference: {item.reference}.
          </p>
        </section>
      )}
      <section className="world-detail-section">
        <h3>What needs to happen</h3>
        <p>
          {item.detail ||
            item.resolution ||
            "Confirm the work against its reference and record the outcome."}
        </p>
        {item.issue && <p className="world-condition">{item.resolution}</p>}
        <dl>
          <div>
            <dt>Responsible team</dt>
            <dd>{item.owner}</dd>
          </div>
          {item.due && (
            <div>
              <dt>Due</dt>
              <dd>{item.due}</dd>
            </div>
          )}
          <div>
            <dt>Evidence</dt>
            <dd>{item.coverage}</dd>
          </div>
          <div>
            <dt>Review</dt>
            <dd>{item.review}</dd>
          </div>
        </dl>
      </section>
      {item.checks.length > 0 && (
        <section className="world-detail-section">
          <h3>Recorded checks</h3>
          {item.checks.map((c, n) => (
            <div className="world-check-row" key={n}>
              <Icon
                name={
                  c.result === "ok"
                    ? "check"
                    : c.result === "discrepancy"
                      ? "alert"
                      : "eye"
                }
                size={16}
              />
              <span>
                {c.name}
                <small>
                  {c.result === "ok"
                    ? "Fixture check recorded"
                    : c.result === "discrepancy"
                      ? "Potential discrepancy"
                      : c.result === "insufficient"
                        ? "Evidence insufficient"
                        : "Unsupported check"}{" "}
                  · {c.release}
                </small>
              </span>
            </div>
          ))}
          <p className="world-muted">
            Scope: {item.scope}. Not established: {item.limits}. Inspection:{" "}
            {item.inspection}.
          </p>
        </section>
      )}
      <section className="world-detail-section">
        <h3>Next action</h3>
        {!canReview ? (
          <div className="world-note">
            <Icon name="eye" />
            <p>
              Project-manager review is required for acceptance and issue
              resolution.
            </p>
            {canCapture && (
              <button onClick={() => open("capture", item.id)}>
                Add daily update
              </button>
            )}
          </div>
        ) : item.processing === "queued" ? (
          <div className="world-note">
            <Icon name="wifi" />
            <p>
              This update is queued on this device. Reconnect before reviewing
              it.
            </p>
          </div>
        ) : (
          <div className="world-action-stack">
            {item.issue ? (
              item.correction ? (
                <>
                  <button
                    className="world-primary"
                    onClick={() => startReview("resolve")}
                  >
                    <Icon name="check" size={16} />
                    Accept correction & resolve
                  </button>
                  <button
                    className="world-secondary"
                    onClick={() => startReview("reject")}
                  >
                    Return correction
                  </button>
                </>
              ) : (
                <button
                  className="world-primary"
                  onClick={() => open("capture", item.id)}
                >
                  <Icon name="camera" size={16} />
                  Add correction evidence
                </button>
              )
            ) : ["human", "ai"].includes(item.status) ? (
              <button
                className="world-secondary"
                onClick={() => startReview("reopen")}
              >
                Reopen for review
              </button>
            ) : (
              <>
                <button
                  className="world-primary"
                  disabled={!item.photos.length}
                  onClick={() => startReview("accept")}
                >
                  <Icon name="check" size={16} />
                  Accept reviewed work
                </button>
                <button
                  className="world-secondary"
                  onClick={() => startReview("confirm")}
                >
                  Confirm an issue
                </button>
              </>
            )}
            <div className="world-action-pair">
              <button onClick={() => startReview("request")}>
                Request evidence
              </button>
              <button onClick={() => open("capture", item.id)}>
                Add daily update
              </button>
            </div>
            <button
              className="world-text-action"
              onClick={() => startReview("assign")}
            >
              Change owner / due date
            </button>
          </div>
        )}
        {review && (
          <form
            className="world-decision"
            onSubmit={(e) => {
              e.preventDefault();
              perform();
            }}
          >
            <h4>
              {review === "resolve"
                ? "Resolve this issue"
                : review === "confirm"
                  ? "Confirm and assign issue"
                  : review === "request"
                    ? "Request more evidence"
                    : "Record your decision"}
            </h4>
            {review === "resolve" && item.condition && (
              <p className="world-condition">{item.condition}</p>
            )}
            {(review === "confirm" || review === "assign") && (
              <>
                <label>
                  Assignee
                  <input
                    required
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  />
                </label>
                <label>
                  Due date
                  <input
                    required
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
              </>
            )}
            <label>
              Decision reason
              <textarea
                autoFocus
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="What did you review, and what must happen next?"
              />
            </label>
            <p>
              Recorded under the sample PM identity. Notifications are
              simulated; no external message is sent.
            </p>
            <div className="world-action-pair">
              <button type="button" onClick={() => setReview(null)}>
                Cancel
              </button>
              <button
                className="world-primary"
                type="submit"
                disabled={!reason.trim()}
              >
                Save decision
              </button>
            </div>
          </form>
        )}
      </section>
      <section className="world-detail-section">
        <h3>Progress timeline</h3>
        <ol className="world-timeline">
          {history.map((e) => (
            <li
              key={e.id}
              style={{ "--event-color": COLORS[e.tone] } as React.CSSProperties}
            >
              <span className="world-timeline-dot" />
              <div>
                <b>{e.actor}</b>
                <time>
                  {new Date(e.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
                <p>{e.text}</p>
              </div>
            </li>
          ))}
        </ol>
        {!history.length && (
          <p className="world-muted">
            No activity has been recorded for this work item.
          </p>
        )}
      </section>
      {element && (
        <details className="world-source-details">
          <summary>Component & source details</summary>
          <dl>
            <div>
              <dt>Component</dt>
              <dd>{element.name || element.ifc_class}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{element.ifc_class}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{model.version}</dd>
            </div>
            <div>
              <dt>ID</dt>
              <dd>{element.id}</dd>
            </div>
          </dl>
        </details>
      )}
    </>
  );
}
export function ComponentPanel({ id, open }: { id: string; open: Open }) {
  const { model, state, act, canPlan } = useWorkspace();
  const [tracking, setTracking] = useState(false),
    [title, setTitle] = useState(""),
    [owner, setOwner] = useState(""),
    [error, setError] = useState("");
  const [detail, setDetail] = useState<{
    version: string;
    element: ElementDetail;
  } | null>(null);
  const [detailError, setDetailError] = useState("");
  const [propertyQuery, setPropertyQuery] = useState("");
  useEffect(() => {
    if (!model.source.apiProjectId) return;
    let active = true;
    api<ElementDetail>(
      `/elements/${encodeURIComponent(id)}?version=${encodeURIComponent(model.version)}`,
    )
      .then((element) => {
        if (active) setDetail({ version: model.version, element });
      })
      .catch((e) => {
        if (active) setDetailError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, model.version, model.source.apiProjectId]);
  const element =
    detail?.version === model.version && detail.element.id === id
      ? detail.element
      : model.elements.find((e) => e.id === id);
  if (!element)
    return (
      <div className="world-empty">
        <h2>Component unavailable</h2>
        <p>This selection does not belong to the current source revision.</p>
      </div>
    );
  const work = state.items.filter((i) => i.location?.elements.includes(id));
  const plan = model.plans.find((p) => p.id === element.level_id),
    room = plan?.rooms.find((r) => r.id === element.zone_id),
    unit = unitForRoom(model, room?.code);
  const props = Object.entries(element.props || {})
    .filter(
      ([k, v]) =>
        /\.(System Name|System Type|Size|Material)$/.test(k) &&
        typeof v === "string" &&
        v !== k.split(".").at(-1),
    )
    .slice(0, 5);
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">SELECTED COMPONENT</span>
        <h2>{element.name || element.ifc_class}</h2>
        <p>
          {[plan && floorName(plan.name), unit && `Unit ${unit}`, room?.name]
            .filter(Boolean)
            .join(" › ") || "Location unassigned in source"}
        </p>
      </div>
      <dl className="world-property-list">
        <div>
          <dt>System</dt>
          <dd>{element.discipline}</dd>
        </div>
        <div>
          <dt>Source class</dt>
          <dd>{element.ifc_class}</dd>
        </div>
        {props.map(([k, v]) => (
          <div key={k}>
            <dt>{k.split(".").at(-1)}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="world-section-heading">
        <h3>Linked work</h3>
        <span>{work.length}</span>
      </div>
      {work.map((i) => (
        <WorkRow key={i.id} item={i} open={open} />
      ))}
      {!work.length && (
        <div className="world-note">
          <Icon name="eye" />
          <p>
            This component has no tracked work or evidence record. Its presence
            in the design does not establish installed progress.
          </p>
        </div>
      )}
      {!work.length && plan && !tracking && canPlan && (
        <button
          className="world-primary"
          onClick={() => {
            setTitle(element.name || element.ifc_class);
            setTracking(true);
          }}
        >
          Track work here
        </button>
      )}
      {!work.length && tracking && (
        <form
          className="world-update-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const item = plannedComponent(model, element.id, title, owner);
              if (act({ type: "plan", item })) open("record", item.id);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Work title
            <input
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Responsible person or team
            <input
              required
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Who will do this work?"
            />
          </label>
          <p className="world-muted">
            This creates planned work at the selected source component. It does
            not record installation or completion.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="world-action-pair">
            <button type="button" onClick={() => setTracking(false)}>
              Cancel
            </button>
            <button
              className="world-primary"
              disabled={!title.trim() || !owner.trim()}
            >
              Create work record
            </button>
          </div>
        </form>
      )}
      <details className="world-source-details">
        <summary>
          All source properties ({Object.keys(element.props || {}).length})
        </summary>
        <label className="world-component-search">
          Find a property
          <input
            value={propertyQuery}
            onChange={(e) => setPropertyQuery(e.target.value)}
            placeholder="Material, size, manufacturer…"
          />
        </label>
        {model.source.apiProjectId && !detail && !detailError && (
          <p role="status">Loading authorized component properties…</p>
        )}
        {detailError && (
          <p role="alert">Source details could not load: {detailError}</p>
        )}
        <dl className="world-property-list">
          {Object.entries(element.props || {})
            .filter(([k, v]) =>
              `${k} ${JSON.stringify(v)}`
                .toLowerCase()
                .includes(propertyQuery.toLowerCase()),
            )
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
        </dl>
      </details>
      <details className="world-source-details">
        <summary>Source identity</summary>
        <p>{element.id}</p>
        <p>Revision {model.version}</p>
      </details>
    </>
  );
}
export function UpdatePanel({
  work,
  open,
}: {
  work: string | null;
  open: Open;
}) {
  const { state, model, act, online } = useWorkspace();
  const requested = state.items.find((i) => i.id === work);
  const [draft, setDraft] = useState<Draft>(() =>
    state.draft && (!requested || state.draft.item === requested.id)
      ? state.draft
      : {
          item:
            requested?.id ||
            state.items.find((i) => i.status === "none")?.id ||
            state.items[0].id,
          photos: [],
          note: "",
          claim: "",
          step: 1,
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const item = state.items.find((i) => i.id === draft.item)!;
  const save = (changes: Partial<Draft>) => {
    const next = { ...draft, ...changes };
    if (act({ type: "draft", draft: next })) setDraft(next);
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      if (draft.photos.length + files.length > 6)
        throw Error("Use up to six photos per update.");
      const photos = await Promise.all([...files].map(readPhoto));
      save({ photos: [...draft.photos, ...photos] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const submit = () => {
    if (!confirmed) {
      setError("Confirm the model location before submitting.");
      return;
    }
    if (!draft.photos.length) {
      setError("Attach evidence before submitting.");
      return;
    }
    if (act({ type: "submit", draft, offline: !online, sample: false }))
      open("record", item.id);
  };
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">DAILY UPDATE</span>
        <h2>Show what changed.</h2>
        <p>
          Attach the work to its location. Add evidence, describe the update and
          send it for review.
        </p>
      </div>
      <form
        className="world-update-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label>
          Work item
          <select
            value={draft.item}
            onChange={(e) => {
              save({ item: e.target.value, photos: [], note: "", claim: "" });
              setConfirmed(false);
              open("capture", e.target.value);
            }}
          >
            {state.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </select>
        </label>
        <div className="world-update-location">
          <Icon name="pin" size={18} />
          <span>{workPath(model, item).join(" › ")}</span>
          <button type="button" onClick={() => open("record", item.id)}>
            Locate
          </button>
        </div>
        <label className="world-checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm this is the correct work location.
        </label>
        <label className="world-upload-target">
          <Icon name="camera" size={28} />
          <strong>
            {busy ? "Preparing your photos…" : "Add photos of the work"}
          </strong>
          <span>Take a photo or choose from your device</span>
          <input
            ref={input}
            type="file"
            aria-label="Upload evidence photos"
            accept="image/*"
            capture="environment"
            multiple
            disabled={busy}
            onChange={(e) => upload(e.target.files)}
          />
        </label>
        {draft.photos.length > 0 && (
          <div className="world-upload-grid">
            {draft.photos.map((p) => (
              <figure key={p.id}>
                <EvidenceImage src={p.url} alt={p.name} />
                <button
                  type="button"
                  aria-label={`Remove ${p.name}`}
                  onClick={() =>
                    save({
                      photos: draft.photos.filter((photo) => photo.id !== p.id),
                    })
                  }
                >
                  <Icon name="close" size={13} />
                </button>
                <figcaption>
                  {p.sample ? "Generated sample" : "Your photo"}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        <button
          className="world-text-action"
          type="button"
          disabled={draft.photos.length >= 6}
          onClick={() =>
            save({
              photos: [
                ...draft.photos,
                {
                  id: crypto.randomUUID(),
                  url: ASSETS + (item.image || "wall-unit-406.jpg"),
                  sample: true,
                  name: "Generated sample image",
                },
              ],
            })
          }
        >
          Use a generated sample to test the workflow
        </button>
        <label>
          What changed?
          <textarea
            required
            rows={4}
            value={draft.note}
            onChange={(e) => save({ note: e.target.value })}
            placeholder="What was completed? Any deviations, blockers or missing work?"
          />
        </label>
        <label>
          Your progress claim
          <select
            value={draft.claim}
            onChange={(e) => save({ claim: e.target.value })}
          >
            <option value="">No claim</option>
            <option>Work in progress</option>
            <option>Reported complete</option>
            <option>Correction submitted</option>
          </select>
        </label>
        {error && (
          <p className="world-error" role="alert">
            {error}
          </p>
        )}
        <div className="world-note">
          <Icon name={online ? "eye" : "wifi"} size={17} />
          <p>
            {online
              ? "Evidence is saved on this device and awaits review. Submission does not mark work complete or run an AI check."
              : "You are offline. The same update will remain queued on this device until you reconnect."}
          </p>
        </div>
        <button
          className="world-primary world-wide"
          type="submit"
          disabled={
            busy || !confirmed || !draft.photos.length || !draft.note.trim()
          }
        >
          <Icon name="arrow" size={16} />
          {online ? "Submit for review" : "Queue update"}
        </button>
        <p className="world-muted">Drafts save on this device as you work.</p>
      </form>
    </>
  );
}
export function ActivityPanel({
  date,
  changeDate,
  open,
}: {
  date: string | null;
  changeDate: (date: string | null) => void;
  open: Open;
}) {
  const { state } = useWorkspace();
  const day = date || latestRecordedDay(state.events);
  const [compare, setCompare] = useState("");
  const rows = validHistory(state.events)
    .filter((e) => dayKey(e.at) === day)
    .reverse();
  const after = itemsAt(state, day),
    before = compare ? itemsAt(state, compare) : [];
  const changed = after.filter(
    (i, n) => before[n] && before[n].status !== i.status,
  );
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">PROGRESS HISTORY</span>
        <h2>The story of the work.</h2>
        <p>See daily activity and replay recorded progress on this building.</p>
      </div>
      <div className="world-history-controls">
        <label>
          Show recorded day
          <input
            type="date"
            value={day}
            onChange={(e) => changeDate(e.target.value || null)}
          />
        </label>
        <label>
          Compare with
          <input
            type="date"
            max={day}
            value={compare}
            onChange={(e) => setCompare(e.target.value)}
          />
        </label>
      </div>
      {date && (
        <button
          className="world-secondary world-wide"
          onClick={() => changeDate(null)}
        >
          Return model to current progress
        </button>
      )}
      <p className="world-muted">
        History replays recorded status on the current design. Opening a work
        record shows its current evidence.
      </p>
      {compare && (
        <section className="world-detail-section">
          <h3>
            {compare > day
              ? "Choose an earlier comparison date"
              : `${changed.length} recorded changes`}
          </h3>
          {compare <= day &&
            changed.map((i) => (
              <button
                className="world-history-change"
                key={i.id}
                onClick={() => open("record", i.id)}
              >
                <strong>{i.title}</strong>
                <span>
                  {LABELS[before.find((b) => b.id === i.id)!.status]} →{" "}
                  {LABELS[i.status]}
                </span>
              </button>
            ))}
        </section>
      )}
      <ol className="world-timeline">
        {rows.map((e) => (
          <li
            key={e.id}
            style={{ "--event-color": COLORS[e.tone] } as React.CSSProperties}
          >
            <span className="world-timeline-dot" />
            <div>
              <b>{e.actor}</b>
              <time>
                {new Date(e.at).toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
              <button onClick={() => open("record", e.item)}>{e.text}</button>
            </div>
          </li>
        ))}
      </ol>
      {!rows.length && (
        <div className="world-empty">
          <Icon name="clock" size={25} />
          <h3>No updates recorded that day</h3>
          <p>Choose another date or add the next update.</p>
        </div>
      )}
      <button
        className="world-secondary world-wide"
        onClick={() => {
          const content = `${state.projectName} · ${day}\nLocal sample project records\n\n${rows.map((e) => `${e.at} · ${e.actor}\n${e.text}`).join("\n\n")}${state.reportSnapshot ? "\n\nPreviously saved report\n" + state.reportSnapshot : ""}`;
          const url = URL.createObjectURL(
            new Blob([content], { type: "text/plain" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = `project-log-${day}.txt`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        <Icon name="download" size={15} />
        Export this day
      </button>
    </>
  );
}
export function TeamPanel() {
  const { state, model, canReview } = useWorkspace();
  const peopleKey = availabilityStorageKey(model);
  const [availability, setAvailability] = useState<Record<string, string>>(
    () => {
      try {
        return JSON.parse(localStorage.getItem(peopleKey) || "{}");
      } catch {
        return {};
      }
    },
  );
  const [error, setError] = useState("");
  const teams = [...new Set(state.items.map((i) => i.owner))];
  const update = (id: string, value: string) => {
    const next = { ...availability, [id]: value };
    try {
      localStorage.setItem(peopleKey, JSON.stringify(next));
      setAvailability(next);
    } catch {
      setError("Availability could not be saved on this device.");
    }
  };
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">PROJECT TEAM</span>
        <h2>The people behind the work.</h2>
        <p>Find the responsible team and keep availability in view.</p>
      </div>
      <div className="world-team-lead">
        <span>SJ</span>
        <div>
          <strong>Sarah Jenkins</strong>
          <small>Project manager</small>
        </div>
      </div>
      <p className="world-team-connector">
        TRADE LEADS · REPORT TO PROJECT MANAGER
      </p>
      {teams.map((owner, n) => {
        const [team, name] = owner.split(" · ");
        const work = state.items.filter((i) => i.owner === owner);
        return (
          <details className="world-team-card" key={owner}>
            <summary>
              <span className="world-team-avatar">
                {(name || team)
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{name || team}</strong>
                <small>
                  {team} · {work.length} assigned work items
                </small>
              </span>
              <Icon name="down" size={14} />
            </summary>
            {!model.source.slug || model.source.slug === "duplex" ? (
              <p>
                {(name || owner).toLowerCase().replaceAll(" ", ".")}@example.com
                <br />
                +1 (202) 555-01{String(n + 1).padStart(2, "0")}
              </p>
            ) : (
              <p>Contact details not recorded.</p>
            )}
            <label>
              Availability
              <select
                disabled={!canReview}
                value={availability[owner] || "Not set"}
                onChange={(e) => update(owner, e.target.value)}
              >
                {["Not set", "On site", "Available", "Busy", "Off site"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </label>
          </details>
        );
      })}
      {error && <p role="alert">{error}</p>}
      <p className="world-muted">
        Sample contacts and reporting lines. Availability is saved locally.
      </p>
    </>
  );
}
export function ProjectPanel({
  reset,
  openImport,
  owners = [],
}: {
  reset: () => void;
  openImport?: () => void;
  owners?: string[];
}) {
  const { model, state, act, view, previewOwner, changeView, canReview } =
    useWorkspace();
  const [name, setName] = useState(state.projectName);
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">PROJECT CONTEXT</span>
        <h2>A shared source of truth.</h2>
        <p>
          The design, spatial structure and work records behind this building.
        </p>
      </div>
      {changeView && !model.source.apiProjectId && (
        <section className="world-detail-section">
          <h3>Preview a user experience</h3>
          <label className="world-import-select">
            View
            <select
              aria-label="Preview user experience"
              value={view}
              onChange={(e) =>
                changeView(
                  e.target.value as ViewRole,
                  previewOwner || owners[0] || "",
                )
              }
            >
              {VIEW_ROLES.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="world-import-select">
            Crew for field / subcontractor preview
            <select
              aria-label="Preview crew"
              value={previewOwner || owners[0] || ""}
              onChange={(e) => changeView(view, e.target.value)}
            >
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <p className="world-muted">
            Public-sample presentation only. Customer: evidence and progress;
            PM: decisions and coordination; subcontractor: assigned work and
            corrections; field worker: assigned daily capture. These previews do
            not grant private-project permissions.
          </p>
        </section>
      )}
      {openImport && (
        <button className="world-primary world-wide" onClick={openImport}>
          Add / import a project
        </button>
      )}
      <form
        className="world-update-form"
        onSubmit={(e) => {
          e.preventDefault();
          act({ type: "project", name });
        }}
      >
        <label>
          Project name
          <input
            required
            disabled={!canReview}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="world-secondary" type="submit" disabled={!canReview}>
          Save project name
        </button>
      </form>
      <dl className="world-property-list">
        <div>
          <dt>Components</dt>
          <dd>{model.elements.length.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Levels / spaces</dt>
          <dd>
            {model.plans.length} /{" "}
            {model.plans.reduce((n, p) => n + p.rooms.length, 0)}
          </dd>
        </div>
        <div>
          <dt>Tracked work</dt>
          <dd>{state.items.length} packages</dd>
        </div>
      </dl>
      <section className="world-detail-section">
        <h3>Model and location context</h3>
        <p>{model.source.attribution}</p>
        <p className="world-muted">
          {model.source.apiProjectId
            ? `Private upload · ${model.source.approvalStatus} reference. Model approval does not establish installed progress or inspection approval. Unit associations need project review.`
            : `${model.source.license}. Public sample geometry; not an approved construction document. Unit display groups follow this sample's reviewed room associations.`}{" "}
          Unknown locations remain unassigned.
        </p>
        <details className="world-source-details">
          <summary>Revision & source</summary>
          <p>{model.version}</p>
          {model.source.repository && (
            <a
              href={`https://github.com/${model.source.repository}/tree/${model.source.revision}`}
              target="_blank"
              rel="noreferrer"
            >
              View original source
            </a>
          )}
        </details>
      </section>
      <section className="world-detail-section">
        <h3>Daily review</h3>
        <p>
          Each update keeps its work location, component IDs, source revision
          and evidence together. New evidence awaits review; open issues close
          only after an explicit resolution.
        </p>
        <p className="world-muted">
          Public samples use local records and a sample PM identity. Private
          model onboarding uses the connected account; its field records are
          still pending integration.
        </p>
      </section>
      <button className="world-danger" onClick={reset} disabled={!canReview}>
        <Icon name="reset" size={15} />
        Reset local workspace
      </button>
    </>
  );
}
