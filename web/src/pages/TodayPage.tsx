import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { can, type Issue, type UploadInfo } from "../api/types";
import { Card, Chip, Heading } from "../workspace/components";
import { Icon } from "../studio/Icon";
import { useProject } from "./ProjectLayout";

/** Same design language as the designer workspace, with actual authorized project records. */
export default function TodayPage() {
  const [today] = useState(() => new Date().toDateString());
  const { project } = useProject(),
    manager = can.editStructure(project.my_role);
  const progress = useQuery({
    queryKey: ["progress", project.id],
    queryFn: () =>
      api<{ totals: Record<string, number> }>(
        `/projects/${project.id}/progress`,
      ),
  });
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
  const open =
    issues.data?.filter((i) => ["open", "in_progress"].includes(i.status)) ||
    [];
  const totals = progress.data?.totals || {},
    total = Object.values(totals).reduce((a, b) => a + b, 0);
  const error =
    progress.error || issues.error || uploads.error || reviews.error;
  const recentToday =
    uploads.data?.filter(
      (u) =>
      new Date(u.created_at).toDateString() === today,
    ) || [];
  const needReview = totals.needs_review || 0;
  return (
    <div className="ew-app connected-overview">
      <div className="page">
        <Heading
          eyebrow="Project overview"
          title={`${project.name}. The latest work, in context.`}
          sub="Live project records from the connected workspace. Photo results describe the existing progress system."
          action={
            <Link className="btn primary" to={`/field/${project.id}`}>
              <Icon name="camera" size={16} />
              Submit field update
            </Link>
          }
        />
        {error && (
          <div className="inset warning" role="alert">
            Some project records could not be loaded: {(error as Error).message}
          </div>
        )}
        <div className="grid g-4">
          {[
            {
              label: "Received today",
              value: uploads.isPending ? "—" : recentToday.length,
              detail: "From the latest 20 project updates",
            },
            {
              label: "Need review",
              value: progress.isPending ? "—" : needReview,
              detail: "Element progress awaiting review",
            },
            {
              label: "Open issues",
              value: issues.isPending ? "—" : open.length,
              detail: "Assigned project findings and corrections",
            },
            {
              label: "Recorded complete",
              value: progress.isPending ? "—" : totals.done || 0,
              detail: "Existing progress status · see evidence",
            },
          ].map((k) => (
            <div key={k.label} className="card kpi">
              <span className="eyebrow">{k.label}</span>
              <div className="v">{k.value}</div>
              <p className="l">{k.detail}</p>
            </div>
          ))}
        </div>
        <div className="grid g-2-1">
          <div className="stack-lg">
            <Card
              title="Review and follow up"
              action={
                <Link className="small strong" to="../progress">
                  Open progress →
                </Link>
              }
            >
              <div className="list">
                {manager &&
                  reviews.data?.map((u) => (
                    <div className="item" key={u.id}>
                      <div className="ic amber">
                        <Icon name="camera" />
                      </div>
                      <div className="grow">
                        <b>
                          {u.zone_name} · {u.trade}
                        </b>
                        <p className="item-meta">
                          {u.user_name} ·{" "}
                          {new Date(u.created_at).toLocaleString()}
                        </p>
                        <p className="small muted">
                          {u.note || "Evidence submitted for review"}
                        </p>
                        <Chip status="review">
                          {
                            u.verifications.filter(
                              (v) => v.state === "proposed",
                            ).length
                          }{" "}
                          progress proposals
                        </Chip>
                      </div>
                      <Link
                        className="btn sm primary"
                        to={`../progress?upload=${u.id}`}
                      >
                        Review evidence
                      </Link>
                    </div>
                  ))}
                {(!manager || !reviews.data?.length) && (
                  <div className="card-pad small muted">
                    {reviews.isPending && manager
                      ? "Loading review records…"
                      : manager
                        ? "No pending review submissions."
                        : "Open Progress to see records available to your role."}
                  </div>
                )}
              </div>
            </Card>
            <Card
              title="Open issues"
              action={
                <Link className="small strong" to="../issues">
                  All issues →
                </Link>
              }
            >
              <div className="list">
                {open.slice(0, 6).map((i) => (
                  <div className="item" key={i.id}>
                    <div className="ic red">
                      <Icon name="alert" />
                    </div>
                    <div className="grow">
                      <Link
                        className="item-title"
                        to={`../model?issue=${i.id}`}
                      >
                        #{i.number} · {i.title}
                      </Link>
                      <p className="item-meta">
                        {i.trade || "General"} ·{" "}
                        {i.assignee_name || "Unassigned"} · {i.priority}
                      </p>
                      <Chip status="issue">{i.status.replace("_", " ")}</Chip>
                    </div>
                    <Link className="btn sm" to={`../model?issue=${i.id}`}>
                      Locate issue
                    </Link>
                  </div>
                ))}
                {!open.length && (
                  <p className="card-pad small muted">
                    {issues.isPending
                      ? "Loading issues…"
                      : "No open issues recorded."}
                  </p>
                )}
              </div>
            </Card>
          </div>
          <aside className="stack-lg">
            <Card title="Model progress">
              <div className="card-pad stack">
                <p className="small">
                  {total} tracked elements on the current model
                </p>
                <div className="covbar">
                  {(
                    [
                      "done",
                      "needs_review",
                      "in_progress",
                      "not_started",
                    ] as const
                  ).map((k) => (
                    <span
                      key={k}
                      style={{
                        width: `${total ? ((totals[k] || 0) / total) * 100 : 0}%`,
                        background: {
                          done: "#10b981",
                          needs_review: "#f59e0b",
                          in_progress: "#2563eb",
                          not_started: "#e2e8f0",
                        }[k],
                      }}
                    />
                  ))}
                </div>
                <p className="xs muted">
                  Element counts are not labor, cost or schedule percentages.
                  Existing completion records do not imply formal inspection.
                </p>
                <Link className="btn" to="../model">
                  <Icon name="cube" size={16} />
                  Open 3D model
                </Link>
              </div>
            </Card>
            <Card title="Latest updates">
              <div className="card-pad stack">
                {uploads.data?.slice(0, 5).map((u) => (
                  <Link
                    className="inset"
                    key={u.id}
                    to={`../progress?upload=${u.id}`}
                  >
                    <b className="small">
                      {u.zone_name} · {u.trade}
                    </b>
                    <p className="xs muted">
                      {u.photos.length} photos · {u.user_name}
                    </p>
                  </Link>
                ))}
                {!uploads.data?.length && (
                  <p className="small muted">
                    {uploads.isPending
                      ? "Loading updates…"
                      : "No field updates yet."}
                  </p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
