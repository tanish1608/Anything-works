import { useState } from "react";
import { dayKey } from "../workspace/history";

export default function LogCalendar({
  selected,
  onSelect,
  days,
}: {
  selected: string;
  onSelect: (day: string) => void;
  days: Set<string>;
}) {
  const [month, setMonth] = useState(() => selected.slice(0, 7));
  const date = new Date(month + "-01T12:00:00");
  const year = date.getFullYear(),
    index = date.getMonth();
  const count = new Date(year, index + 1, 0).getDate();
  const shift = (delta: number) =>
    setMonth(
      dayKey(new Date(year, index + delta, 1, 12).toISOString()).slice(0, 7),
    );
  return (
    <section className="log-calendar" aria-label="Progress calendar">
      <header>
        <button aria-label="Previous month" onClick={() => shift(-1)}>
          ‹
        </button>
        <h2>
          {date.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button aria-label="Next month" onClick={() => shift(1)}>
          ›
        </button>
      </header>
      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <span className="calendar-weekday" key={d}>
            {d}
          </span>
        ))}
        {Array.from({ length: date.getDay() }, (_, i) => (
          <span key={"empty" + i} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, "0")}`;
          return (
            <button
              key={key}
              aria-label={key + (days.has(key) ? " · recorded activity" : "")}
              aria-pressed={selected === key}
              className={selected === key ? "selected" : ""}
              onClick={() => onSelect(key)}
            >
              {i + 1}
              <i className={days.has(key) ? "has-activity" : ""} />
            </button>
          );
        })}
      </div>
      <small>Dots show dates with recorded activity.</small>
    </section>
  );
}
