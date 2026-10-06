import type { WorkItem, WorkspaceState } from "./state";

const clip = (value: string | undefined, length = 160) => value?.slice(0, length);
const compactWork = (item: WorkItem) => ({
  id: clip(item.id, 80), title: clip(item.title), trade: clip(item.trade, 50), owner: clip(item.owner),
  status: item.status, due: clip(item.due, 40), level: item.level, unit: clip(item.unit, 60),
  issue: clip(item.issue),
});

export function copilotContext(state: WorkspaceState, selected: WorkItem | undefined, screen: {
  modelRevision: string; component: string | null; level: string | null; unit: string | null; room: string | null; date: string | null;
}) {
  const related = state.items.filter(item => item.id !== selected?.id && !item.dismissed
    && (!selected || item.owner === selected.owner || item.trade === selected.trade
      || (item.level === selected.level && item.unit === selected.unit)));
  const owners = [...new Set([...(selected ? [selected.owner] : []), ...related.map(item => item.owner)])];
  const packet = {
    provenance: "browser-local sample; not authenticated project evidence",
    sampleProject: clip(state.projectName),
    screen: Object.fromEntries(Object.entries(screen).map(([key, value]) => [key, value?.slice(0, 96) ?? null])),
    selectedWork: selected ? {
      ...compactWork(selected), reference: clip(selected.reference, 240), update: clip(selected.update, 360),
      scope: clip(selected.scope, 240), limits: clip(selected.limits, 240),
      detail: clip(selected.detail, 240), coverage: clip(selected.coverage),
      checks: selected.checks.slice(0, 4).map(check => ({ ...check, name: clip(check.name), release: clip(check.release) })),
      componentIds: selected.location?.elements.slice(0, 8).map(id => clip(id, 96)),
      coordination: state.coordination?.tasks.filter(task => task.workId === selected.id).map(task => ({
        owner: clip(task.owner), start: task.start, end: task.end, durationMinutes: task.minutes,
        instruction: clip(task.instruction, 240), prerequisites: clip(task.prerequisites, 160), provenance: "manager-confirmed local demo assignment",
      })).slice(0, 1),
      followUps: state.coordination?.followUps.filter(reminder => reminder.workId === selected.id).slice(0, 2).map(reminder => ({
        status: reminder.status, due: reminder.due, message: clip(reminder.message, 160), reply: clip(reminder.reply, 160), provenance: "local in-app follow-up; no external dispatch",
      })),
    } : null,
    relatedWork: related.slice(0, 6).map(compactWork),
    recordedOwners: owners.slice(0, 4).map(owner => ({
      owner: clip(owner), trades: [...new Set(state.items.filter(item => item.owner === owner).map(item => clip(item.trade, 50)))].slice(0, 3),
      visibleOpenWorkCount: state.items.filter(item => item.owner === owner && !item.dismissed && !["human", "ai"].includes(item.status)).length,
      qualifications: "unknown",
      calendarAvailability: state.coordination?.calendars.find(calendar => calendar.owner === owner) ? "imported bounded snapshot; not live sync" : "unknown",
    })),
    recentActivity: state.events.filter(event => selected ? event.item === selected.id : true).slice(0, 3).map(event => ({
      workId: clip(event.item, 80), at: clip(event.at, 40), actor: clip(event.actor, 80), text: clip(event.text, 160),
    })),
    constraints: "Related work and owners are partial local records. Recorded ownership is not qualification. Due dates are deadlines, not available time slots. Local coordination controls can import a bounded calendar export and confirm a demo assignment and in-app follow-up. Chat itself cannot apply actions; no live calendar or external delivery is connected.",
  };
  // Drop lower-priority context as whole records so the contract limit never truncates JSON.
  while (JSON.stringify(packet).length > 6000) {
    if (packet.relatedWork.length) packet.relatedWork.pop();
    else if (packet.recentActivity.length) packet.recentActivity.shift();
    else if (packet.recordedOwners.length) packet.recordedOwners.pop();
    else break;
  }
  return JSON.stringify(packet);
}
