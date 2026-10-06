import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { can, type Issue, type UploadInfo } from "../api/types";
import { Icon } from "../studio/Icon";
import ProjectModelContext from "../components/ProjectModelContext";
import { useProject } from "./ProjectLayout";
import { dayKey } from "../workspace/history";
import "../workspace/design.css";
import "../workspace/workspace.css";
import "../workspace/operations.css";

export default function TodayPage() {
  const { project } = useProject(),
    manager = can.editStructure(project.my_role);
  const [selected, setSelected] = useState<string | null>(null),
    [sort, setSort] = useState("priority");
  const [focusToken, setFocusToken] = useState(0);
  const select = (id: string) => {
    setSelected(id);
    setFocusToken((n) => n + 1);
  };
  const refs = useRef(new Map<string, HTMLDivElement>());
  const issues = useQuery({
    queryKey: ["overview-issues", project.id],
    queryFn: () => api<Issue[]>(`/projects/${project.id}/issues`),
  });
  const uploads = useQuery({
    queryKey: ["uploads", project.id],
    queryFn: () =>
      api<UploadInfo[]>(`/projects/${project.id}/uploads?limit=20`),
  });
  const reviews = useQuery({
    queryKey: ["reviews", project.id],
    queryFn: () => api<UploadInfo[]>(`/projects/${project.id}/reviews`),
    enabled: manager,
  });
  const open = useMemo(
    () =>
      issues.data?.filter((i) => ["open", "in_progress"].includes(i.status)) ||
      [],
    [issues.data],
  );
  const [date] = useState(() => new Date());
  const today = dayKey(date.toISOString());
  const allUploads = [
    ...new Map(
      [...(reviews.data || []), ...(uploads.data || [])].map((u) => [u.id, u]),
    ).values(),
  ];
  const pendingIds = new Set(reviews.data?.map((u) => u.id));
  const waiting = allUploads.filter((u) =>
    ["queued", "running", "failed"].includes(u.analysis_status),
  );
  const waitingIds = new Set(waiting.map((u) => u.id));
  const latest = allUploads.filter(
    (u) => !pendingIds.has(u.id) && !waitingIds.has(u.id),
  );
  const activeIssue = open.find((i) => i.id === selected) || null;
  const activeUpload = allUploads.find((u) => u.id === selected);
  const focus = useMemo(
    () =>
      activeUpload
        ? {
            id: activeUpload.id,
            elements: activeUpload.verifications.map((v) => v.element_id),
            zone: activeUpload.zone_id,
          }
        : null,
    [activeUpload],
  );
  const error = issues.error || uploads.error || reviews.error;
  const loading =
    issues.isPending || uploads.isPending || (manager && reviews.isPending);
  useEffect(() => {
    if (selected)
      refs.current
        .get(selected)
        ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const sortedIssues = [...open].sort((a, b) =>
    sort === "trade"
      ? (a.trade || "").localeCompare(b.trade || "")
      : sort === "recent"
        ? b.created_at.localeCompare(a.created_at)
        : ["critical", "high", "medium", "low"].indexOf(a.priority) -
          ["critical", "high", "medium", "low"].indexOf(b.priority),
  );
  const uploadRow = (u: UploadInfo) => (
    <div
      key={u.id}
      ref={(el) => {
        if (el) refs.current.set(u.id, el);
        else refs.current.delete(u.id);
      }}
      className={`pin-record ${selected === u.id ? "selected" : ""}`}
    >
      <button
        className="pin-select"
        aria-pressed={selected === u.id}
        onClick={() => select(u.id)}
      >
        <span className="pin-number">
          <Icon name="pin" size={15} />
        </span>
        <span>
          <strong>
            {u.zone_name || "Location unconfirmed"} · {u.trade}
          </strong>
          <small>
            {u.user_name} · {new Date(u.created_at).toLocaleString()}
          </small>
        </span>
      </button>
      {selected === u.id && (
        <div className="pin-detail">
          <p>{u.note || "Field evidence submitted."}</p>
          <Link className="btn sm" to={`../progress?upload=${u.id}`}>
            Open evidence & decision →
          </Link>
        </div>
      )}
    </div>
  );
  return (
    <div className="ew-app connected-overview">
      <div className="page">
        <div className="operations-page">
          <div className="operations-heading">
            <div>
              <p className="operations-kicker">{project.name}</p>
              <h1>Home</h1>
            </div>
            <Link className="btn" to={`/field/${project.id}`}>
              <Icon name="camera" size={16} /> New update
            </Link>
          </div>
          <section className="daily-summary" aria-labelledby="summary-title">
            <div className="summary-icon">
              <Icon name="spark" size={21} />
            </div>
            <div>
              <div className="summary-heading">
                <h2 id="summary-title">Your daily summary</h2>
                <span>
                  {date.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · Project records
                </span>
              </div>
              <p>
                {loading
                  ? "Loading project records…"
                  : `${uploads.data?.filter((u) => dayKey(u.created_at) === today).length || 0} updates received today in the latest 20 submissions. ${issues.error ? "Issue records are unavailable." : `${open.length} open issues${open[0] ? `, including ${open[0].title}` : ""}.`} ${manager && !reviews.error ? `${reviews.data?.length || 0} submissions await a decision.` : ""} ${waiting.length} updates are waiting on analysis or a retry.`}
              </p>
              <small>
                Record-based summary. Live AI summaries are not connected;
                completion does not establish inspection approval.
              </small>
            </div>
          </section>
          {error && (
            <p role="alert">
              Some records could not be loaded: {(error as Error).message}
            </p>
          )}
          <div className="home-workspace">
            <ProjectModelContext
              projectId={project.id}
              issues={open}
              selected={activeIssue}
              onSelect={select}
              focusToken={focusToken}
              focus={focus}
            />
            <aside className="home-feed" aria-label="Project work pins">
              <header>
                <h2>Work to follow up</h2>
                <label>
                  Sort
                  <select
                    aria-label="Sort work pins"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="priority">Priority</option>
                    <option value="trade">Trade</option>
                    <option value="recent">Newest</option>
                  </select>
                </label>
              </header>
              <div className="home-feed-scroll">
                <section className="feed-group">
                  <h3>Needs your decision</h3>
                  {sortedIssues.map((i) => (
                    <div
                      key={i.id}
                      ref={(el) => {
                        if (el) refs.current.set(i.id, el);
                        else refs.current.delete(i.id);
                      }}
                      className={`pin-record ${selected === i.id ? "selected" : ""}`}
                    >
                      <button
                        className="pin-select"
                        aria-label={`Locate ${i.title}`}
                        aria-pressed={selected === i.id}
                        onClick={() => select(i.id)}
                      >
                        <span className="pin-number">
                          <Icon name="pin" size={15} />
                        </span>
                        <span>
                          <strong>
                            #{i.number} · {i.title}
                          </strong>
                          <small>
                            {i.trade || "General"} ·{" "}
                            {i.assignee_name || "Unassigned"}
                            {i.due_date ? ` · Due ${i.due_date}` : ""}
                          </small>
                        </span>
                        <Icon name="arrow" size={15} />
                      </button>
                      {selected === i.id && (
                        <div className="pin-detail">
                          <p>{i.description}</p>
                          <Link
                            className="btn sm"
                            to={`../model?issue=${i.id}`}
                          >
                            Open issue & evidence →
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                  {reviews.data
                    ?.filter((u) => !waitingIds.has(u.id))
                    .map(uploadRow)}
                  {!open.length && !reviews.data?.length && (
                    <p className="feed-empty">
                      {loading
                        ? "Loading…"
                        : "No outstanding decisions recorded."}
                    </p>
                  )}
                </section>
                <section className="feed-group">
                  <h3>Waiting on others</h3>
                  {waiting.map(uploadRow)}
                  {!waiting.length && (
                    <p className="feed-empty">
                      No analysis or retry is outstanding.
                    </p>
                  )}
                </section>
                <section className="feed-group">
                  <h3>Latest updates</h3>
                  {latest.map(uploadRow)}
                  {!latest.length && (
                    <p className="feed-empty">No other updates recorded.</p>
                  )}
                </section>
              </div>
              <footer aria-live="polite">
                {activeIssue
                  ? `Selected: ${activeIssue.title}`
                  : activeUpload
                    ? "Selected field update"
                    : "Select an item or a model pin to see its location."}
              </footer>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
