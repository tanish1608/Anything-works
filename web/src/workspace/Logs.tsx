import { locationLabel } from "./projectState";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useWorkspace } from "./context";
import { LABELS, type WorkItem } from "./state";
import { dayKey, itemsAt, latestRecordedDay, validHistory } from "./history";
import WorkflowModel from "./WorkflowModel";
import LogCalendar from "../components/LogCalendar";
import "./operations.css";

const completed = (i: WorkItem) => i.status === "human" || i.status === "ai";
export default function Logs() {
  const { state } = useWorkspace();
  const latest = latestRecordedDay(state.events);
  const [focusToken, setFocusToken] = useState(0);
  const [day, setDay] = useState(latest),
    [compare, setCompare] = useState(false),
    [from, setFrom] = useState(() => {
      const d = new Date(latest + "T12:00:00");
      d.setDate(d.getDate() - 1);
      return dayKey(d.toISOString());
    }),
    [selected, setSelected] = useState<string | null>(null);
  const history = validHistory(state.events);
  const after = itemsAt(state, day),
    before = itemsAt(state, from);
  const changed = after.filter((i, n) => i.status !== before[n].status);
  const rows = history.filter((e) => dayKey(e.at) === day).reverse();
  const newComplete = changed.filter((i) => completed(i));
  const reopened = changed.filter(
    (i) => !completed(i) && completed(before.find((b) => b.id === i.id)!),
  );
  const invalidRange = from > day;
  const select = (id: string) => {
    if (!id) {
      setSelected(null);
      return;
    }
    const item =
      state.items.find((i) => i.id === id) ||
      state.items.find((i) => i.unit === id);
    if (item) {
      setSelected(item.id);
      setFocusToken((n) => n + 1);
    }
  };
  const download = () => {
    const text = `${state.projectName} · Logs · ${day}\nFictional project / local records\n\n${rows.map((e) => `${e.at} · ${e.actor}\n${e.text}`).join("\n\n")}${state.reportSnapshot ? "\n\nPreviously saved report snapshot\n" + state.reportSnapshot : ""}`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" })),
      a = document.createElement("a");
    a.href = url;
    a.download = `project-log-${day}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="operations-page">
      <div className="operations-heading">
        <div>
          <p className="operations-kicker">{state.projectName}</p>
          <h1>Logs</h1>
          <p>Follow daily activity and see how recorded progress changed.</p>
        </div>
        <button className="btn" onClick={download}>
          Export this day
        </button>
      </div>
      <div className="logs-layout">
        <aside className="logs-sidebar">
          <LogCalendar
            key={day.slice(0, 7)}
            selected={day}
            onSelect={setDay}
            days={new Set(history.map((e) => dayKey(e.at)))}
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
            />{" "}
            Compare dates
          </label>
          {compare && (
            <label>
              Compare from
              <input
                type="date"
                value={from}
                max={day}
                onChange={(e) => {
                  if (e.target.value) setFrom(e.target.value);
                }}
              />
            </label>
          )}
          <p className="history-note">
            Only recorded statuses are reconstructed. Unrecorded work stays
            unassessed. Geometry is unchanged; green indicates scoped
            completion, not inspection approval.
          </p>
        </aside>
        <div className="logs-main">
          {invalidRange && compare ? (
            <p role="alert">Choose a comparison date on or before {day}.</p>
          ) : (
            <>
              {compare && (
                <div className="comparison-heading">
                  <h2>
                    {from} → {day}
                  </h2>
                  <p>
                    {newComplete.length} newly completed · {reopened.length}{" "}
                    reopened · {changed.length} changed items
                  </p>
                </div>
              )}
              <div className={compare ? "log-models" : "log-model-single"}>
                {compare && (
                  <div>
                    <h3>{from}</h3>
                    <WorkflowModel
                      focusToken={focusToken}
                      items={before}
                      selected={selected}
                      onSelect={select}
                      historical
                    />
                  </div>
                )}
                <div>
                  <h3>{day}</h3>
                  <WorkflowModel
                    focusToken={focusToken}
                    items={after}
                    selected={selected}
                    onSelect={select}
                    historical
                  />
                </div>
              </div>
              {compare && (
                <section className="log-changes" aria-label="Progress changes">
                  <h2>What changed</h2>
                  {changed.map((i) => (
                    <div key={i.id} className="log-change">
                      <button
                        aria-pressed={selected === i.id}
                        onClick={() => select(i.id)}
                      >
                        {locationLabel(i)} · {i.title}
                      </button>
                      <span>
                        {LABELS[before.find((b) => b.id === i.id)!.status]} →{" "}
                        {LABELS[i.status]}
                      </span>
                    </div>
                  ))}
                  {!changed.length && (
                    <p>No recorded status changes between these dates.</p>
                  )}
                </section>
              )}
            </>
          )}
          <section className="daily-log" aria-label="Daily activity">
            <div className="row between">
              <h2>Daily activity</h2>
              <span>
                {rows.length} events · {day}
              </span>
            </div>
            {rows.map((e) => (
              <article className="log-event" key={e.id}>
                <time>
                  {new Date(e.at).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <div>
                  <p>{e.text}</p>
                  <small>{e.actor}</small>
                  {e.item && (
                    <div className="row">
                      <button className="link" onClick={() => select(e.item)}>
                        Locate in model
                      </button>
                      <Link
                        to={
                          state.items.find((i) => i.id === e.item)?.issue
                            ? `/demo/issue/${e.item}`
                            : `/demo/review/${e.item}`
                        }
                      >
                        Open current record →
                      </Link>
                    </div>
                  )}
                </div>
              </article>
            ))}
            {!rows.length && (
              <p className="feed-empty">
                No activity was recorded on this date.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
