import { locationLabel } from "./projectState";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "./context";
import { type WorkItem } from "./state";
import WorkflowModel from "./WorkflowModel";
import { dayKey, latestRecordedDay } from "./history";
import { Icon } from "../studio/Icon";
import "./operations.css";

const category = (i: WorkItem) =>
  ["review", "unsupported", "issue"].includes(i.status)
    ? "Decisions"
    : ["evidence", "failed"].includes(i.status)
      ? "Waiting on others"
      : "Completed";
export default function Home() {
  const { state } = useWorkspace();
  const [selected, setSelected] = useState<string | null>(null),
    [sort, setSort] = useState("priority");
  const [focusToken, setFocusToken] = useState(0);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const items = state.items.filter((i) => i.status !== "none");
  const current = items.find((i) => i.id === selected);
  const day = latestRecordedDay(state.events);
  const today = state.events.filter((e) => dayKey(e.at) === day);
  const decisions = items.filter((i) => category(i) === "Decisions");
  const waiting = items.filter((i) => category(i) === "Waiting on others");
  const complete = items.filter((i) => category(i) === "Completed");
  const select = (id: string) => {
    if (!id) {
      setSelected(null);
      return;
    }
    // Scene returns exact, version-bound work IDs.
    const item =
      items.find((i) => i.id === id) || items.find((i) => i.unit === id);
    if (item) {
      setSelected(item.id);
      setFocusToken((n) => n + 1);
    }
  };
  useEffect(() => {
    if (selected)
      refs.current
        .get(selected)
        ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  return (
    <div className="operations-page">
      <div className="operations-heading">
        <div>
          <p className="operations-kicker">{state.projectName}</p>
          <h1>Home</h1>
        </div>
        <Link className="btn" to="/capture">
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
              {new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}{" "}
              · Project records
            </span>
          </div>
          <p>
            {today.length} events recorded.{" "}
            {decisions.length
              ? `${decisions.length} items need a decision`
              : "No decisions are outstanding"}
            {decisions[0]
              ? `, starting with ${decisions[0].unit === "Core" ? "the core" : locationLabel(decisions[0])}.`
              : "."}{" "}
            {waiting.length} items are waiting on evidence or a successful
            check. {complete.length} work items have scoped completion recorded.
          </p>
          <small>Summary of recorded project activity.</small>
        </div>
      </section>
      <div className="home-workspace">
        <WorkflowModel
          focusToken={focusToken}
          items={state.items}
          selected={selected}
          onSelect={select}
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
                <option value="location">Location</option>
                <option value="trade">Trade</option>
              </select>
            </label>
          </header>
          <div className="home-feed-scroll">
            {["Decisions", "Waiting on others", "Completed"].map((group) => {
              const rows = items
                .filter((i) => category(i) === group)
                .sort((a, b) =>
                  sort === "location"
                    ? a.unit.localeCompare(b.unit)
                    : sort === "trade"
                      ? a.trade.localeCompare(b.trade)
                      : Number(b.status === "issue") -
                        Number(a.status === "issue"),
                );
              return (
                <section className="feed-group" key={group}>
                  <h3>
                    {group === "Decisions" ? "Needs your decision" : group}{" "}
                    <span>{rows.length}</span>
                  </h3>
                  {rows.map((i) => (
                    <div
                      className={`pin-record ${selected === i.id ? "selected" : ""}`}
                      key={i.id}
                      ref={(el) => {
                        if (el) refs.current.set(i.id, el);
                        else refs.current.delete(i.id);
                      }}
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
                          <strong>{i.title}</strong>
                          <small>
                            {locationLabel(i)} · Level {i.level} · {i.owner}
                          </small>
                        </span>
                        <Icon name="arrow" size={15} />
                      </button>
                      {selected === i.id && (
                        <div className="pin-detail">
                          <p>{i.detail || i.progress}</p>
                          <small>
                            {i.reference} ·{" "}
                            {i.update || "No new update recorded"}
                          </small>
                          <Link
                            className="btn sm"
                            to={
                              i.issue
                                ? `/issue/${i.id}`
                                : `/review/${i.id}`
                            }
                          >
                            Open evidence & decision →
                          </Link>
                        </div>
                      )}
                    </div>
                  ))}
                  {!rows.length && (
                    <p className="feed-empty">Nothing here at the moment.</p>
                  )}
                </section>
              );
            })}
          </div>
          <footer aria-live="polite">
            {current
              ? `Selected: ${current.title}`
              : "Select an item or a model pin to see the work in context."}
          </footer>
        </aside>
      </div>
    </div>
  );
}
