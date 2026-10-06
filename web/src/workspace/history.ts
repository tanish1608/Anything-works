import type { Activity, WorkItem, WorkspaceState } from "./state";

/** Use local calendar dates consistently, including offset-bearing later decisions. */
export function dayKey(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function validHistory(events: Activity[]) {
  return events
    .filter((e) => dayKey(e.at))
    .reverse()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** Only reconstruct recorded status. Current evidence and reference are not historical snapshots. */
export function itemsAt(state: WorkspaceState, day: string): WorkItem[] {
  const status = new Map<string, WorkItem["status"]>();
  for (const e of validHistory(state.events))
    if (dayKey(e.at) <= day) status.set(e.item, e.tone);
  return state.items.map((i) => ({
    ...i,
    status: status.get(i.id) || "none",
    issue: status.get(i.id) === "issue" ? i.id : undefined,
  }));
}

export function latestRecordedDay(events: Activity[]) {
  return (
    validHistory(events)
      .map((e) => dayKey(e.at))
      .sort()
      .at(-1) || dayKey(new Date().toISOString())
  );
}
