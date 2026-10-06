import { availableSlots, overlaps, type BusyTime, type CalendarSnapshot } from "./calendarSnapshot";
import type { WorkspaceState } from "./state";

export interface CoordinationTask extends BusyTime {
  id: string; workId: string; owner: string; minutes: number; instruction: string; prerequisites: string;
  reference: string; modelVersion: string; createdAt: string;
}
export interface FollowUp {
  id: string; taskId: string; workId: string; owner: string; message: string; due: string;
  status: "pending" | "replied" | "cancelled" | "escalated";
  reply?: string; changedAt: string;
}
export interface CoordinationState { calendars: CalendarSnapshot[]; tasks: CoordinationTask[]; followUps: FollowUp[] }
export type CoordinationAction =
  | { type: "calendar-import"; calendar: CalendarSnapshot; coverageConfirmed: boolean }
  | { type: "coordinate"; task: Omit<CoordinationTask, "createdAt">; expectedOwner: string;
      qualificationConfirmed: boolean; followUp: { id: string; due: string; message: string } }
  | { type: "followup"; id: string; status: "replied" | "cancelled" | "escalated"; reply: string };

export function stopResolvedFollowUps(state: WorkspaceState, now: string) {
  state.coordination?.followUps.filter(reminder => ["pending", "escalated"].includes(reminder.status)).forEach(reminder => {
    const work = state.items.find(item => item.id === reminder.workId);
    if (!work || work.dismissed || ["ai", "human"].includes(work.status)) { reminder.status = "cancelled"; reminder.changedAt = now; }
  });
}

export function coordinate(state: WorkspaceState, action: CoordinationAction, now: string): WorkspaceState {
  const next = structuredClone(state), data = next.coordination ||= { calendars: [], tasks: [], followUps: [] };
  const audit = (workId: string, text: string) => next.events.unshift({ id: crypto.randomUUID(), item: workId, at: now,
    actor: "Local demo manager", text, tone: next.items.find(item => item.id === workId)!.status });
  if (action.type === "calendar-import") {
    const calendar = action.calendar, start = Date.parse(calendar.start), end = Date.parse(calendar.end);
    if (!action.coverageConfirmed || !next.items.some(item => item.owner === calendar.owner)) throw Error("Confirm the calendar owner and complete exported window.");
    if (![start, end, Date.parse(calendar.importedAt)].every(Number.isFinite) || start >= end || end - start > 31 * 86400_000
      || calendar.busy.length > 2000 || calendar.busy.some(slot => !Number.isFinite(Date.parse(slot.start)) || !Number.isFinite(Date.parse(slot.end)) || Date.parse(slot.start) >= Date.parse(slot.end)))
      throw Error("Calendar coverage or event times are invalid. Use a window of at most 31 days.");
    data.calendars = [...data.calendars.filter(value => value.owner !== calendar.owner), structuredClone(calendar)];
    return next;
  }
  if (action.type === "followup") {
    const reminder = data.followUps.find(value => value.id === action.id);
    if (!reminder) throw Error("Follow-up not found in this project.");
    const work = next.items.find(item => item.id === reminder.workId);
    if (action.status !== "cancelled" && (!work || work.dismissed || ["ai", "human"].includes(work.status))) throw Error("Work is resolved; this follow-up cannot be escalated or replied to.");
    if (reminder.status === action.status && reminder.reply === action.reply.trim()) return state;
    if (!["pending", "escalated"].includes(reminder.status)) throw Error("This follow-up is already closed.");
    if (action.status === "replied" && !action.reply.trim()) throw Error("Enter the recipient's actual reply.");
    reminder.status = action.status; reminder.reply = action.reply.trim().slice(0, 2000); reminder.changedAt = now;
    audit(reminder.workId, `In-app follow-up ${action.status}${reminder.reply ? `: ${reminder.reply}` : "."} No external message sent.`);
    return next;
  }
  const task = action.task, work = next.items.find(item => item.id === task.workId);
  const existing = data.tasks.find(value => value.id === task.id);
  if (existing) {
    const { createdAt: _createdAt, ...saved } = existing;
    if (JSON.stringify(saved) !== JSON.stringify(task)) throw Error("This action identity was already used for a different assignment.");
    return state;
  }
  if (!work || work.dismissed || ["ai", "human"].includes(work.status)) throw Error("Choose unresolved work in this project.");
  if (!next.modelApproved || work.location?.version !== next.modelVersion || task.modelVersion !== next.modelVersion
    || task.reference !== work.reference || action.expectedOwner !== work.owner) throw Error("Work or model context changed. Rebuild the proposal.");
  if (!action.qualificationConfirmed || !next.items.some(item => item.owner === task.owner)) throw Error("Confirm this project member is qualified for the work.");
  if (!task.instruction.trim() || task.instruction.length > 2000 || task.prerequisites.length > 1000) throw Error("Provide a concise task instruction and prerequisites.");
  const ends = Date.parse(task.end), starts = Date.parse(task.start);
  if (ends - starts !== task.minutes * 60_000) throw Error("The selected slot does not match the duration.");
  if (work.due && Number.isFinite(Date.parse(work.due)) && ends > Date.parse(work.due)) throw Error("This slot misses the recorded deadline. Resolve the deadline in the work record first.");
  const reservations = data.tasks.filter(value => value.owner === task.owner && value.workId !== task.workId);
  const slots = availableSlots(data.calendars.find(value => value.owner === task.owner), task.start, task.end, task.minutes, reservations, Date.parse(now));
  if (!slots.length || reservations.some(value => overlaps(value, task))) throw Error("This slot is no longer available. Find another time.");
  if (!Number.isFinite(Date.parse(action.followUp.due)) || Date.parse(action.followUp.due) < ends || !action.followUp.message.trim() || action.followUp.message.length > 2000)
    throw Error("Set an in-app follow-up at or after the work's end, with a message.");
  if (data.followUps.some(reminder => reminder.id === action.followUp.id)) throw Error("Follow-up identity already exists.");
  data.tasks = [...data.tasks.filter(value => value.workId !== task.workId), { ...task, createdAt: now }];
  for (const reminder of data.followUps.filter(value => value.workId === work.id && ["pending", "escalated"].includes(value.status))) {
    reminder.status = "cancelled"; reminder.changedAt = now;
  }
  data.followUps.unshift({ ...action.followUp, taskId: task.id, workId: work.id, owner: task.owner, status: "pending", changedAt: now });
  work.owner = task.owner;
  audit(work.id, `Local assignment: ${task.instruction.trim()} → ${task.owner}; ${task.start}–${task.end}. In-app follow-up scheduled. Evidence/completion unchanged.`);
  return next;
}
