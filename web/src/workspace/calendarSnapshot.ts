export interface BusyTime { start: string; end: string }
export interface CalendarSnapshot {
  owner: string; filename: string; importedAt: string; start: string; end: string; busy: BusyTime[];
}
export const CALENDAR_MAX_AGE = 24 * 60 * 60 * 1000;

// A file with unsupported rules must never be treated as an empty/free calendar.
export function parseCalendar(text: string): BusyTime[] {
  if (text.length > 1_000_000) throw Error("Use a calendar export smaller than 1 MB.");
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n").map(line => line.trim().toUpperCase()).filter(Boolean);
  if (lines[0] !== "BEGIN:VCALENDAR" || lines.at(-1) !== "END:VCALENDAR") throw Error("Choose an iCalendar (.ics) export.");
  const busy: BusyTime[] = [];
  let event: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      if (event) throw Error("Invalid calendar event.");
      event = [];
    } else if (line === "END:VEVENT") {
      if (!event) throw Error("Invalid calendar event.");
      if (event.some(value => /^(RRULE|RDATE|EXDATE|RECURRENCE-ID)(;|:)/.test(value)))
        throw Error("This export contains recurring events. Export expanded occurrences for the selected window.");
      const values = (name: string) => event!.filter(value => value.startsWith(name + ":") || value.startsWith(name + ";"));
      const starts = values("DTSTART"), ends = values("DTEND");
      if (starts.length !== 1 || ends.length !== 1) throw Error("Each event needs a start and end time; duration-only exports are unsupported.");
      const start = calendarDate(starts[0]), end = calendarDate(ends[0]);
      if (start >= end) throw Error("Calendar event has an invalid time range.");
      if (!event.includes("STATUS:CANCELLED") && !event.includes("TRANSP:TRANSPARENT")) busy.push({ start, end });
      if (busy.length > 2000) throw Error("Export a shorter calendar window (at most 2,000 events).");
      event = null;
    } else if (event) event.push(line);
    else if (/^BEGIN:V(FREEBUSY|TODO|JOURNAL)/.test(line)) throw Error("Use an export containing calendar events, not free/busy or task components.");
  }
  if (event) throw Error("Incomplete calendar event.");
  return busy.sort((a, b) => a.start.localeCompare(b.start));
}

function calendarDate(line: string): string {
  const match = /^(DTSTART|DTEND)(;VALUE=DATE)?:([0-9]{8})(?:T([0-9]{6})(Z)?)?$/.exec(line);
  if (!match) throw Error("This export uses an unsupported timezone. Export UTC times or local times; timezone-tagged events are not treated as free.");
  const [, , dateOnly, date, time, utc] = match;
  if (dateOnly && time) throw Error("Invalid all-day calendar event.");
  const stamp = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${time ? `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4)}` : "00:00:00"}${utc || ""}`;
  const parsed = new Date(stamp);
  const year = utc ? parsed.getUTCFullYear() : parsed.getFullYear();
  const month = utc ? parsed.getUTCMonth() + 1 : parsed.getMonth() + 1;
  const day = utc ? parsed.getUTCDate() : parsed.getDate();
  if (!Number.isFinite(parsed.getTime()) || year !== Number(date.slice(0, 4)) || month !== Number(date.slice(4, 6)) || day !== Number(date.slice(6)))
    throw Error("Calendar contains an invalid date.");
  return parsed.toISOString();
}

export function overlaps(a: BusyTime, b: BusyTime): boolean {
  return Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);
}

export function availableSlots(calendar: CalendarSnapshot | undefined, start: string, end: string,
  minutes: number, reserved: BusyTime[], now = Date.now()): BusyTime[] {
  if (!calendar) throw Error("Import and confirm this person's calendar window first.");
  const from = Date.parse(start), until = Date.parse(end), imported = Date.parse(calendar.importedAt);
  const coverageStart = Date.parse(calendar.start), coverageEnd = Date.parse(calendar.end);
  if (![coverageStart, coverageEnd].every(Number.isFinite) || coverageStart >= coverageEnd
    || calendar.busy.some(block => ![Date.parse(block.start), Date.parse(block.end)].every(Number.isFinite) || Date.parse(block.start) >= Date.parse(block.end)))
    throw Error("Calendar snapshot is invalid. Import a fresh export.");
  if (![from, until, imported].every(Number.isFinite) || from >= until || from < now) throw Error("Choose a future scheduling window.");
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) throw Error("Enter a duration between 15 and 480 minutes.");
  if (now - imported > CALENDAR_MAX_AGE || imported > now + 60_000) throw Error("Calendar snapshot is stale. Import a fresh export.");
  if (from < coverageStart || until > coverageEnd) throw Error("Selected times are outside the confirmed calendar coverage.");
  const slots: BusyTime[] = [], blocked = [...calendar.busy, ...reserved];
  for (let at = Math.ceil(from / 900_000) * 900_000; at + minutes * 60_000 <= until && slots.length < 3; at += 900_000) {
    const slot = { start: new Date(at).toISOString(), end: new Date(at + minutes * 60_000).toISOString() };
    if (!blocked.some(block => overlaps(slot, block))) slots.push(slot);
  }
  return slots;
}
