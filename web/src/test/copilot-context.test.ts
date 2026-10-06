import { expect, it, vi } from "vitest";
import { copilotContext } from "../workspace/copilotContext";
import { initialState } from "../workspace/state";

const screen = { modelRevision: "model-1", component: null, level: null, unit: null, room: null, date: null };

it("grounds the selected problem in its owner, deadline, evidence and related work without inventing availability", () => {
  const state = initialState(), work = state.items[0];
  work.owner = "Recorded plumbing lead"; work.due = "2026-10-07T09:00";
  const packet = JSON.parse(copilotContext(state, work, screen));
  expect(packet.sampleProject).toBe(state.projectName);
  expect(packet.selectedWork).toMatchObject({ id: work.id, owner: work.owner, due: work.due, reference: work.reference.slice(0, 240) });
  expect(packet.recordedOwners[0]).toMatchObject({ owner: work.owner, calendarAvailability: "unknown", qualifications: "unknown" });
  expect(packet.relatedWork.every((item: { id: string }) => item.id !== work.id)).toBe(true);
  expect(packet.recentActivity.every((event: { workId: string }) => event.workId === work.id)).toBe(true);
});

it("keeps oversized context valid JSON within the API limit and preserves the selected problem", () => {
  const state = initialState(), work = state.items[0];
  for (const item of state.items) {
    item.title = "A".repeat(10000); item.scope = "B".repeat(10000); item.detail = "C".repeat(10000);
    item.reference = "D".repeat(10000); item.owner = "E".repeat(10000); item.issue = "F".repeat(10000);
    item.update = "G".repeat(10000);
  }
  state.projectName = "Project".repeat(10000);
  const serialized = copilotContext(state, work, { ...screen, room: "Room".repeat(10000) });
  expect(serialized.length).toBeLessThanOrEqual(6000);
  const packet = JSON.parse(serialized);
  expect(packet.selectedWork.id).toBe(work.id);
  expect(packet.constraints).toContain("no live calendar or external delivery");
});

it("uses the latest coordination activity and recorded reply instead of the oldest events", () => {
  const state = initialState(), work = state.items[0];
  state.events = [5, 4, 3, 2, 1].map(value => ({ id: String(value), item: work.id, text: `Activity ${value}`, at: `2030-01-01T0${value}:00:00Z`, actor: "Local manager", tone: "none" }));
  state.coordination = { calendars: [], tasks: [], followUps: [{ id: "reply", workId: work.id, taskId: "task", owner: work.owner,
    message: "Confirm access", due: "2030-01-01T12:00:00Z", status: "replied", reply: "Access confirmed", changedAt: "2030-01-01T10:00:00Z" }] };
  const packet = JSON.parse(copilotContext(state, work, screen));
  expect(packet.recentActivity.map((event: { text: string }) => event.text)).toEqual(["Activity 5", "Activity 4", "Activity 3"]);
  expect(packet.selectedWork.followUps[0]).toMatchObject({ status: "replied", reply: "Access confirmed" });
});


it("includes today's activity across the project even when a different component is selected", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(2030, 0, 3, 12));
  try {
    const state = initialState(), selected = state.items[0], other = state.items[1];
    state.events = [
      { id: 'today', item: other.id, at: new Date(2030, 0, 3, 10).toISOString(), actor: 'Worker', text: 'Submitted site photos', tone: 'evidence' },
      { id: 'old', item: selected.id, at: new Date(2030, 0, 2, 10).toISOString(), actor: 'Worker', text: 'Old work', tone: 'none' },
    ];
    const packet = JSON.parse(copilotContext(state, selected, screen));
    expect(packet.dailyActivity).toMatchObject({ today: '2030-01-03', reportDay: '2030-01-03', visibleEventCount: 1 });
    expect(packet.dailyActivity.events).toEqual([expect.objectContaining({ workId: other.id, text: 'Submitted site photos' })]);
    const historic = JSON.parse(copilotContext(state, selected, { ...screen, date: '2030-01-02' }));
    expect(historic.dailyActivity).toMatchObject({ today: '2030-01-03', reportDay: '2030-01-02', visibleEventCount: 1 });
    expect(historic.dailyActivity.events[0].text).toBe('Old work');
    state.events = [state.events[1]];
    expect(JSON.parse(copilotContext(state, selected, screen)).dailyActivity.visibleEventCount).toBe(0);
  } finally { vi.useRealTimers(); }
});
