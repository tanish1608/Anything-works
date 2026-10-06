import ProjectModelContext from "../components/ProjectModelContext";
import type { Timeline } from "../lib/replay";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { EventRow, Issue } from "../api/types";
import LogCalendar from "../components/LogCalendar";
import { describe } from "../lib/events";
import { dayKey } from "../workspace/history";
import { useProject } from "./ProjectLayout";
import "../workspace/operations.css";

/** Audit dates are scoped by the API. A loaded page is never described as full project history. */
export default function LogsPage() {
  const { project } = useProject();
  const [day, setDay] = useState(() => dayKey(new Date().toISOString())),
    [compare, setCompare] = useState(false),
    [from, setFrom] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return dayKey(d.toISOString());
    });
  const [selected, setSelected] = useState<string | null>(null);
  const issues = useQuery({
    queryKey: ["overview-issues", project.id],
    queryFn: () => api<Issue[]>(`/projects/${project.id}/issues`),
  });
  const timeline = useQuery({
    queryKey: ["timeline", project.id],
    queryFn: () => api<Timeline>(`/projects/${project.id}/timeline`),
  });
  const q = useInfiniteQuery({
    queryKey: ["logs-events", project.id],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      api<EventRow[]>(
        `/projects/${project.id}/events?limit=200${pageParam ? `&before_id=${pageParam}` : ""}`,
      ),
    getNextPageParam: (last) =>
      last.length === 200 ? last.at(-1)!.id : undefined,
  });
  const events = q.data?.pages.flat() || [],
    rows = events.filter((e) => dayKey(e.at) === day);
  const selectedDays = new Set(events.map((e) => dayKey(e.at)).filter(Boolean));
  const earlier = events.filter((e) => dayKey(e.at) === from);
  const changes = (list: EventRow[]) =>
    list.filter((e) => e.type === "element.status_changed");
  return (
    <div className="page operations-page">
      <div className="operations-heading">
        <div>
          <p className="operations-kicker">{project.name}</p>
          <h1>Logs</h1>
          <p>Daily progress and decisions from the project record.</p>
        </div>
        <Link className="btn" to="../progress">
          Review field updates →
        </Link>
      </div>
      <div className="logs-layout">
        <aside className="logs-sidebar">
          <LogCalendar
            key={day.slice(0, 7)}
            selected={day}
            onSelect={setDay}
            days={selectedDays}
          />
          <label>
            Selected day
            <input
              aria-label="Selected log day"
              type="date"
              value={day}
              onChange={(e) => {
                if (e.target.value) setDay(e.target.value);
              }}
            />
          </label>
          <label className="compare-toggle">
            <input
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            Compare dates
          </label>
          {compare && (
            <label>
              Compare with
              <input
                aria-label="Compare with"
                type="date"
                value={from}
                onChange={(e) => {
                  if (e.target.value) setFrom(e.target.value);
                }}
              />
            </label>
          )}
          <p className="history-note">
            {q.isPending
              ? "Loading history…"
              : q.error
                ? "History is unavailable."
                : q.hasNextPage
                  ? "Partial history: load older records to cover the dates you need."
                  : "All available records have been loaded."}{" "}
            Model colours replay recorded status on the current geometry. They
            do not reconstruct past design geometry or infer inspection
            approval.
          </p>
        </aside>
        <div className="logs-main">
          {q.error && <p role="alert">{q.error.message}</p>}
          {compare && (
            <div className="comparison-heading">
              <h2>
                {from} compared with {day}
              </h2>
              <p>
                {earlier.length} → {rows.length} loaded events ·{" "}
                {changes(earlier).length} → {changes(rows).length} element
                status changes
              </p>
            </div>
          )}
          <ProjectModelContext
            projectId={project.id}
            issues={issues.data || []}
            selected={issues.data?.find((i) => i.id === selected) || null}
            onSelect={setSelected}
            history={
              timeline.data
                ? {
                    at: new Date(day + "T23:59:59.999").getTime(),
                    timeline: timeline.data,
                  }
                : undefined
            }
          />
          {timeline.isPending && <p>Loading recorded model progress…</p>}
          {timeline.error && (
            <p role="alert">
              Progress history unavailable; model shows current status.
            </p>
          )}
          <section className="daily-log">
            <div className="row between">
              <h2>{day}</h2>
              <span>{rows.length} loaded events</span>
            </div>
            {rows.map((e) => (
              <article key={e.id} className="log-event">
                <time>
                  {new Date(e.at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <div>
                  <p>{describe(e)}</p>
                  <small>
                    {e.actor_name || "System"}
                    {e.evidence_ids.length
                      ? ` · ${e.evidence_ids.length} linked evidence records`
                      : ""}
                  </small>
                  <div className="row">
                    {e.entity_type === "element" && (
                      <Link to={`../model?element=${e.entity_id}`}>
                        Locate component →
                      </Link>
                    )}
                    {e.entity_type === "issue" && (
                      <Link to={`../model?issue=${e.entity_id}`}>
                        Locate issue →
                      </Link>
                    )}
                    {e.entity_type === "upload" && (
                      <Link to={`../progress?upload=${e.entity_id}`}>
                        View evidence →
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}
            {!rows.length && (
              <p className="feed-empty">
                {q.isPending
                  ? "Loading project history…"
                  : q.hasNextPage
                    ? "No events on this date in the loaded history. Load older records below."
                    : "No events recorded on this date."}
              </p>
            )}
          </section>
          {q.hasNextPage && (
            <button
              disabled={q.isFetchingNextPage}
              onClick={() => q.fetchNextPage()}
            >
              {q.isFetchingNextPage ? "Loading…" : "Load older records"}
            </button>
          )}
          <Link to="../model">Open current progress model →</Link>
        </div>
      </div>
    </div>
  );
}
