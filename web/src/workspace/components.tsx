import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../studio/Icon";
import {
  ASSETS,
  COLORS,
  LABELS,
  counts,
  type Status,
  type WorkItem,
} from "./state";

const icons: Record<Status, string> = {
  ai: "check",
  human: "people",
  issue: "alert",
  review: "clock",
  evidence: "camera",
  failed: "alert",
  unsupported: "eye",
  none: "work",
};
export function Chip({
  status,
  children,
}: {
  status: Status | "proc" | "inspect" | "fixture";
  children?: ReactNode;
}) {
  return (
    <span className={`chip ${status}`}>
      <Icon
        name={
          status in icons
            ? icons[status as Status]
            : status === "inspect"
              ? "report"
              : "spark"
        }
        size={14}
      />
      {children || LABELS[status as Status]}
    </span>
  );
}
export function Button({
  children,
  icon,
  onClick,
  kind = "",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  icon?: string;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`btn ${kind}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}
export function Card({
  title,
  action,
  children,
  footer,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
      {footer && <div className="card-foot small muted">{footer}</div>}
    </section>
  );
}
export function Heading({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {action}
    </section>
  );
}
export function Photo({
  src,
  label,
  sample = true,
  highlight,
}: {
  src: string;
  label: string;
  sample?: boolean;
  highlight?: boolean;
}) {
  return (
    <figure className="photo evidence-photo">
      <img src={src} alt={label} />
      <span className="label">{label}</span>
      {highlight && (
        <div className="region">
          <b>Observed · approximate</b>
        </div>
      )}
      <span className="gen">
        {sample ? "Generated sample image" : "Uploaded photo · not analyzed"}
      </span>
    </figure>
  );
}
export function Reference({ item }: { item: WorkItem }) {
  if (item.trade !== "Framing")
    return (
      <div className="sheet reference-sheet">
        <span className="label">{item.reference} · sample reference</span>
        <svg
          viewBox="0 0 340 320"
          role="img"
          aria-label={`Illustrative ${item.trade} reference`}
        >
          <rect
            x="35"
            y="65"
            width="270"
            height="210"
            fill="none"
            stroke="#0f172a"
            strokeWidth="4"
          />
          <path
            d="M35 165h130V65M165 275V195"
            fill="none"
            stroke="#0f172a"
            strokeWidth="3"
          />
          <path
            d="M60 100h55v-15h145v120H190"
            fill="none"
            stroke={
              item.trade === "Plumbing"
                ? "#2563eb"
                : item.trade === "Electrical"
                  ? "#b45309"
                  : "#047857"
            }
            strokeWidth="4"
          />
          {[70, 135, 215, 260].map((x) => (
            <rect
              key={x}
              x={x}
              y="98"
              width="12"
              height="12"
              fill="#ecfdf5"
              stroke="#10b981"
            />
          ))}
          <text x="35" y="302" fontSize="10" fill="#475569">
            Illustrative plan · not a measurement or registration
          </text>
        </svg>
      </div>
    );
  return (
    <div className="sheet reference-sheet">
      <span className="label">
        {item.reference} · approved sample reference
      </span>
      <svg
        viewBox="0 0 340 320"
        role="img"
        aria-label={`Schematic reference for ${item.title}`}
      >
        <rect
          x="28"
          y="68"
          width="284"
          height="208"
          fill="none"
          stroke="#0f172a"
          strokeWidth="4"
        />
        <path d="M28 163h284" stroke="#0f172a" strokeWidth="3" />
        <rect
          x="52"
          y="150"
          width="74"
          height="26"
          rx="4"
          fill="#ecfdf5"
          stroke="#10b981"
          strokeWidth="2"
        />
        <path
          d="M52 163a74 60 0 0 1 74 0"
          stroke="#10b981"
          strokeDasharray="4 3"
          fill="none"
        />
        <rect
          x="233"
          y="151"
          width="69"
          height="26"
          rx="4"
          fill="#fef2f2"
          stroke="#ef4444"
          strokeDasharray="4 3"
        />
        <text x="170" y="120" textAnchor="middle" fontSize="12" fill="#475569">
          BEDROOM 2
        </text>
        <text x="170" y="239" textAnchor="middle" fontSize="12" fill="#475569">
          BEDROOM 1
        </text>
        <text x="52" y="195" fontSize="11" fill="#047857">
          Expected (west)
        </text>
        <text x="229" y="140" fontSize="10" fill="#991b1b">
          Observed (east)
        </text>
        <text x="28" y="302" fontSize="10" fill="#475569">
          Illustrative reference · positions approximate · no dimensions
        </text>
      </svg>
    </div>
  );
}
export function WorkRow({
  item,
  onDecision,
}: {
  item: WorkItem;
  onDecision?: (item: WorkItem) => void;
}) {
  const target = item.issue
    ? `/demo/issue/${item.id}`
    : `/demo/review/${item.id}`;
  return (
    <div
      className={`item ${["issue", "review"].includes(item.status) ? "accent-red" : item.status === "evidence" ? "accent-amber" : ""}`}
    >
      {item.image && ["ai", "human"].includes(item.status) ? (
        <div className="thumb">
          <img src={ASSETS + item.image} alt="Generated sample evidence" />
        </div>
      ) : (
        <div
          className={`ic ${item.status === "issue" || item.status === "failed" ? "red" : item.status === "ai" || item.status === "human" ? "green" : "amber"}`}
        >
          <Icon name={icons[item.status]} />
        </div>
      )}
      <div className="grow">
        <div className="row">
          <Link className="item-title" to={target}>
            {item.unit === "Core" ? "Level 14 core" : `Unit ${item.unit}`} —{" "}
            {item.title}
          </Link>
          <Chip status={item.status} />
        </div>
        <div className="item-meta">
          {item.trade} · {item.owner} · {item.reference} ·{" "}
          {item.update || item.id} · {item.time}
        </div>
        {item.detail && (
          <p className="small muted item-detail">{item.detail}</p>
        )}
        <div className="row item-tags">
          <Chip status="fixture">Fixture record</Chip>
          {item.processing === "queued" && (
            <Chip status="proc">On this device · queued</Chip>
          )}
          {item.dismissed && (
            <span className="chip none">Finding dismissed</span>
          )}
        </div>
      </div>
      <div className="row row-actions">
        {["ai", "human"].includes(item.status) && onDecision ? (
          <Button icon="people" onClick={() => onDecision(item)}>
            {item.status === "ai" ? "Accept" : "Reopen"}
          </Button>
        ) : (
          <Link
            className={`btn sm ${item.status === "review" || item.issue ? "primary" : ""}`}
            to={target}
          >
            {item.issue
              ? "Review correction"
              : item.status === "evidence"
                ? "View request"
                : "Compare & decide"}
            <Icon name="arrow" size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}
export function Coverage({ items }: { items: WorkItem[] }) {
  const values = counts(items);
  return (
    <div className="stack coverage">
      <p className="small muted">
        {items.length} required work items in this view
      </p>
      <div className="covbar" aria-label="Work-item coverage">
        {Object.entries(values).map(
          ([s, n]) =>
            n > 0 && (
              <span
                key={s}
                className={`c-${s}`}
                style={{
                  width: `${(n / items.length) * 100}%`,
                  backgroundColor: COLORS[s as Status],
                }}
              />
            ),
        )}
      </div>
      {Object.entries(values).map(([s, n]) => (
        <div key={s} className="row between">
          <Chip status={s as Status} />
          <span className="num">{n}</span>
        </div>
      ))}
      <p className="xs muted">
        Counts work items, not labor hours, cost or schedule percentage.
      </p>
    </div>
  );
}
export function CheckTable({ item }: { item: WorkItem }) {
  return (
    <Card
      title="Checks performed on this update"
      action={
        <span className="small muted">
          {item.photos.length} photos · 1 work item
        </span>
      }
      footer={`Not established: ${item.limits}.`}
    >
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Check</th>
              <th>Evidence</th>
              <th>Result</th>
              <th>Release state</th>
            </tr>
          </thead>
          <tbody>
            {item.checks.map((c, i) => (
              <tr key={i}>
                <td>
                  <b>{c.name}</b>
                </td>
                <td>
                  <Chip
                    status={
                      c.result === "insufficient"
                        ? "evidence"
                        : c.result === "unsupported"
                          ? "none"
                          : "ai"
                    }
                  >
                    {c.result === "insufficient"
                      ? "Partly occluded"
                      : c.result === "unsupported"
                        ? "Not assessed"
                        : "Adequate"}
                  </Chip>
                </td>
                <td>
                  <Chip
                    status={
                      c.result === "ok"
                        ? "ai"
                        : c.result === "discrepancy"
                          ? "issue"
                          : c.result === "insufficient"
                            ? "evidence"
                            : "unsupported"
                    }
                  >
                    {c.result === "ok"
                      ? "No discrepancy detected"
                      : c.result === "discrepancy"
                        ? "Potential discrepancy"
                        : c.result === "insufficient"
                          ? "Insufficient evidence"
                          : "Unsupported"}
                  </Chip>
                </td>
                <td>
                  <span className="chip tag">{c.release}</span>
                </td>
              </tr>
            ))}
            {!item.checks.length && (
              <tr>
                <td colSpan={4}>
                  No completed analysis. Evidence awaits review.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    dialog.current?.showModal();
    const el = dialog.current;
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    el?.addEventListener("cancel", cancel);
    return () => el?.removeEventListener("cancel", cancel);
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ew-modal"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="ew-app">
        <div className="card-head">
          <h2>{title}</h2>
          <Button icon="close" onClick={close}>
            Close
          </Button>
        </div>
        <div className="card-pad stack">{children}</div>
      </div>
    </dialog>
  );
}
