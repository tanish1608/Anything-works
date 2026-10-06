import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableSlots, parseCalendar, type CalendarSnapshot } from "../workspace/calendarSnapshot";
import { initialProjectState } from "../workspace/projectState";
import { transition, type Action, type WorkspaceState } from "../workspace/state";
import type { ModelDataset } from "../viewer/modelData";

const model = JSON.parse(readFileSync("public/bim-duplex/model.json", "utf8")) as ModelDataset;
const now = "2030-01-01T08:00:00.000Z";
const at = (hour: number) => `2030-01-01T${String(hour).padStart(2, "0")}:00:00.000Z`;
const ics = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR\r\n`;
const event = (extra = "") => `BEGIN:VEVENT\r\nDTSTART:20300101T100000Z\r\nDTEND:20300101T110000Z\r\nSUMMARY:Private appointment\r\n${extra}\r\nEND:VEVENT`;
function setup() {
  let state = initialProjectState(model);
  const work = state.items.find(item => item.id === "PLAN-401")!;
  const calendar: CalendarSnapshot = { owner: work.owner, filename: "crew.ics", importedAt: now, start: at(9), end: at(17), busy: parseCalendar(ics(event())) };
  state = transition(state, { type: "calendar-import", calendar, coverageConfirmed: true }, now);
  const action: Extract<Action, { type: "coordinate" }> = { type: "coordinate", expectedOwner: work.owner, qualificationConfirmed: true,
    task: { id: "assignment-1", workId: work.id, owner: work.owner, start: at(9), end: at(10), minutes: 60,
      instruction: "Install radiator and share photos", prerequisites: "Confirm access with framing lead", reference: work.reference, modelVersion: model.version },
    followUp: { id: "followup-1", due: at(10), message: "Please confirm radiator installation and provide photos." } };
  return { state, action, calendar };
}

describe("bounded calendar snapshots", () => {
  it("extracts busy times without private event titles and respects exclusive event ends", () => {
    const { calendar } = setup();
    expect(calendar.busy).toEqual([{ start: at(10), end: at(11) }]);
    expect(JSON.stringify(calendar)).not.toContain("Private appointment");
    const slots = availableSlots(calendar, at(9), at(12), 60, [], Date.parse(now));
    expect(slots.map(slot => slot.start)).toEqual([at(9), at(11)]);
    expect(parseCalendar(ics(event("TRANSP:TRANSPARENT")))).toEqual([]);
  });
  it("rejects unsupported or incomplete events instead of treating them as free", () => {
    expect(() => parseCalendar(ics(event("RRULE:FREQ=DAILY")))).toThrow("recurring");
    expect(() => parseCalendar(ics(event("rrule:FREQ=DAILY")))).toThrow("recurring");
    expect(parseCalendar(ics(event().toLowerCase()))).toEqual([{ start: at(10), end: at(11) }]);
    expect(() => parseCalendar(ics(event().replace("DTSTART:", "DTSTART;TZID=America/Los_Angeles:")))).toThrow("timezone");
    expect(() => parseCalendar(ics(event().replace("DTEND:20300101T110000Z", "DURATION:PT1H")))).toThrow("start and end");
    expect(() => parseCalendar(ics(event().replace("20300101T100000Z", "20300230T100000Z")))).toThrow("invalid date");
  });
  it("never reports unknown, stale, uncovered or conflicted times as available", () => {
    const { calendar } = setup();
    expect(() => availableSlots(undefined, at(9), at(12), 60, [], Date.parse(now))).toThrow("Import");
    expect(() => availableSlots({ ...calendar, importedAt: "2029-01-01T00:00:00Z" }, at(9), at(12), 60, [], Date.parse(now))).toThrow("stale");
    expect(() => availableSlots(calendar, at(9), at(18), 60, [], Date.parse(now))).toThrow("coverage");
    expect(availableSlots(calendar, at(9), at(10), 60, [{ start: at(9), end: at(10) }], Date.parse(now))).toEqual([]);
  });
});

describe("local coordination", () => {
  it("saves one assignment, audit event and follow-up without completing work; retries are idempotent", () => {
    const { state, action } = setup();
    const next = transition(state, action, now);
    expect(next.coordination!.tasks).toHaveLength(1);
    expect(next.coordination!.followUps[0].status).toBe("pending");
    expect(next.items.find(item => item.id === action.task.workId)!.status).toBe("none");
    expect(next.events[0].text).toContain("Evidence/completion unchanged");
    expect(transition(next, action, now)).toBe(next);
    expect(state.coordination!.tasks).toHaveLength(0);
  });
  it("rechecks qualification, current ownership/model, deadlines and collisions at confirmation", () => {
    const { state, action } = setup();
    expect(() => transition(state, { ...action, qualificationConfirmed: false }, now)).toThrow("qualified");
    expect(() => transition(state, { ...action, expectedOwner: "other" }, now)).toThrow("context changed");
    expect(() => transition(state, { ...action, task: { ...action.task, modelVersion: "old" } }, now)).toThrow("context changed");
    const deadline = structuredClone(state); deadline.items.find(item => item.id === action.task.workId)!.due = at(9);
    expect(() => transition(deadline, action, now)).toThrow("deadline");
    const reserved = structuredClone(state); reserved.coordination!.tasks.push({ ...action.task, workId: "other", id: "other", createdAt: now });
    expect(() => transition(reserved, action, now)).toThrow("available");
    const busy = { ...action, task: { ...action.task, start: at(10), end: at(11) } };
    expect(() => transition(state, busy, now)).toThrow("available");
  });
  it("retains explicit replies and closes follow-ups without falsely resolving an issue", () => {
    const { state, action } = setup();
    let next = transition(state, action, now);
    expect(() => transition(next, { type: "followup", id: "followup-1", status: "replied", reply: "" }, now)).toThrow("reply");
    next = transition(next, { type: "followup", id: "followup-1", status: "escalated", reply: "Need access" }, now);
    next = transition(next, { type: "followup", id: "followup-1", status: "replied", reply: "Access confirmed" }, now);
    expect(next.coordination!.followUps[0]).toMatchObject({ status: "replied", reply: "Access confirmed" });
    expect(next.items.find(item => item.id === action.task.workId)!.status).toBe("none");
    expect(() => transition(next, { type: "followup", id: "followup-1", status: "escalated", reply: "" }, now)).toThrow("closed");
  });
  it("cancels pending follow-ups on a real local review decision and keeps projects isolated", () => {
    const { state, action } = setup();
    let next = transition(state, action, now);
    next = transition(next, { type: "dismiss", id: action.task.workId, reason: "Not required" }, now);
    expect(next.coordination!.followUps[0].status).toBe("cancelled");
    expect(() => transition(initialProjectState(model), { type: "followup", id: "followup-1", status: "cancelled", reply: "" }, now)).toThrow("not found");
    expect(JSON.parse(JSON.stringify(next)) as WorkspaceState).toMatchObject({ coordination: { tasks: [{ id: "assignment-1" }] } });
  });
  it("stops reminders when the existing explicit fixture simulation completes work", () => {
    const { state, action } = setup();
    const next = transition(state, action, now);
    next.items.find(item => item.id === action.task.workId)!.fixture = { checks: [], complete: true };
    const completed = transition(next, { type: "submit", offline: false, sample: true,
      draft: { item: action.task.workId, note: "Fixture simulation only", claim: "Done", step: 1,
        photos: [{ id: "fixture", sample: true, name: "Generated fixture", url: "/fixture.jpg" }] } }, now);
    expect(completed.items.find(item => item.id === action.task.workId)!.status).toBe("ai");
    expect(completed.coordination!.followUps[0].status).toBe("cancelled");
  });
});
