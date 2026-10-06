import { describe, expect, it } from "vitest";
import {
  ASSETS,
  counts,
  initialState,
  reportText,
  transition,
  type Draft,
} from "../workspace/state";
import { roomStatus } from "../workspace/state";

const now = "2026-10-06T15:00:00Z";
function draft(item: string, sample = true): Draft {
  return {
    item,
    note: "Work completed today",
    claim: "Done",
    step: 3,
    photos: [
      {
        id: "capture-1",
        url: sample
          ? ASSETS + "plumbing-unit-402.jpg"
          : "data:image/jpeg;base64,example",
        name: "Evidence",
        sample,
      },
    ],
  };
}
describe("designer workspace decisions", () => {
  it("preserves all 13 Level 14 work-item dimensions and keeps issue precedence", () => {
    const state = initialState(),
      level = state.items.filter((i) => i.level === 14);
    expect(level).toHaveLength(13);
    expect(counts(level)).toMatchObject({
      ai: 3,
      human: 1,
      issue: 2,
      review: 2,
      evidence: 1,
      failed: 1,
      unsupported: 1,
      none: 2,
    });
    expect(roomStatus(state.items.filter((i) => i.unit === "405"))).toBe(
      "issue",
    );
  });
  it("requires reason and evidence for human acceptance; never turns a claim into AI completion", () => {
    const state = initialState();
    expect(() =>
      transition(state, { type: "accept", id: "PLUMB-402", reason: "" }, now),
    ).toThrow("reason");
    expect(() =>
      transition(
        state,
        { type: "accept", id: "PLAN-401", reason: "Looks done" },
        now,
      ),
    ).toThrow("Evidence");
    const next = transition(
      state,
      {
        type: "submit",
        draft: draft("PLUMB-402", false),
        offline: false,
        sample: false,
      },
      now,
    );
    const item = next.items.find((i) => i.id === "PLUMB-402")!;
    expect(item.status).toBe("review");
    expect(item.progress).toBe("Not assessed");
    expect(item.claimed).toBe("Done");
    expect(item.checks).toEqual([]);
    expect(item.assessments?.[0].checks).toHaveLength(2);
    expect(state.items.find((i) => i.id === "PLUMB-402")!.status).toBe("ai");
  });
  it("only simulates completion for explicitly requested sample evidence", () => {
    const state = initialState();
    expect(
      transition(
        state,
        {
          type: "submit",
          draft: draft("PLUMB-402"),
          offline: false,
          sample: false,
        },
        now,
      ).items.find((i) => i.id === "PLUMB-402")!.status,
    ).toBe("review");
    expect(
      transition(
        state,
        {
          type: "submit",
          draft: draft("PLUMB-402"),
          offline: false,
          sample: true,
        },
        now,
      ).items.find((i) => i.id === "PLUMB-402")!.status,
    ).toBe("ai");
    expect(
      transition(
        state,
        {
          type: "submit",
          draft: draft("PLUMB-402", false),
          offline: false,
          sample: true,
        },
        now,
      ).items.find((i) => i.id === "PLUMB-402")!.status,
    ).toBe("review");
  });
  it("keeps queued updates unassessed and syncs the same ID only once", () => {
    const queued = transition(
      initialState(),
      {
        type: "submit",
        draft: draft("PLUMB-402"),
        offline: true,
        sample: true,
      },
      now,
    );
    const item = queued.items.find((i) => i.id === "PLUMB-402")!;
    expect(item.processing).toBe("queued");
    expect(item.status).toBe("review");
    expect(item.checks).toEqual([]);
    expect(() =>
      transition(
        queued,
        { type: "accept", id: item.id, reason: "Reviewed" },
        now,
      ),
    ).toThrow("Queued");
    const synced = transition(queued, { type: "sync" }, now);
    expect(synced.items.find((i) => i.id === item.id)!.update).toBe(
      item.update,
    );
    expect(synced.items.find((i) => i.id === item.id)!.processing).toBe(
      "review",
    );
    expect(transition(synced, { type: "sync" }, now).events).toHaveLength(
      synced.events.length,
    );
  });
  it("supports confirmed finding → correction evidence → explicit resolution without inspecting", () => {
    const state = initialState();
    const confirmed = transition(
      state,
      {
        type: "confirm",
        id: "F-118",
        owner: "Titan Framing",
        due: "2026-10-07T07:00",
        reason: "Move the opening west and send two photos.",
      },
      now,
    );
    expect(confirmed.items.find((i) => i.id === "F-118")!.status).toBe("issue");
    expect(() =>
      transition(
        confirmed,
        { type: "resolve", id: "F-118", reason: "Reviewed correction." },
        now,
      ),
    ).toThrow("Correction evidence");
    const submitted = transition(
      confirmed,
      { type: "submit", draft: draft("F-118"), offline: false, sample: true },
      now,
    );
    expect(submitted.items.find((i) => i.id === "F-118")!.issue).toBeTruthy();
    expect(submitted.items.find((i) => i.id === "F-118")!.checks[1].result).toBe("ok");
    expect(submitted.items.find((i) => i.id === "F-118")!.assessments?.[0].checks[1].result).toBe("discrepancy");
    const resolved = transition(
      submitted,
      {
        type: "resolve",
        id: "F-118",
        reason: "Reviewed both photos and the reference.",
      },
      now,
    );
    const result = resolved.items.find((i) => i.id === "F-118")!;
    expect(result.status).toBe("human");
    expect(result.issue).toBeUndefined();
    expect(result.inspection).toBe("Not recorded");
    expect(resolved.events.slice(0, 3).map((e) => e.actor)).toEqual([
      "Sarah Jenkins",
      "Field worker",
      "Sarah Jenkins",
    ]);
  });
  it("does not close a confirmed issue by acceptance or dismissing a finding", () => {
    const state = initialState();
    expect(() =>
      transition(state, { type: "accept", id: "ISS-031", reason: "Okay" }, now),
    ).toThrow("Resolve");
    expect(() =>
      transition(
        state,
        { type: "dismiss", id: "ISS-031", reason: "Okay" },
        now,
      ),
    ).toThrow("issue-resolution");
  });
  it("keeps real correction uploads unassessed and retains their open issue through queue sync", () => {
    const queued = transition(initialState(), {
      type: "submit", draft: draft("ISS-031", false), offline: true, sample: false,
    }, now);
    const synced = transition(queued, { type: "sync" }, now);
    const work = synced.items.find((i) => i.id === "ISS-031")!;
    expect(work.status).toBe("issue");
    expect(work.issue).toBe("ISS-031");
    expect(work.correction).toBe(true);
    expect(work.checks).toEqual([]);
    expect(work.progress).toBe("Not assessed");
    expect(work.review).toBe("Awaiting review of new evidence");
    const resolved = transition(synced, { type: "resolve", id: work.id, reason: "Inspected new evidence on site." }, now);
    expect(resolved.items.find((i) => i.id === work.id)!.status).toBe("human");
  });
  it("retains signed reports as immutable snapshots when later work changes", () => {
    const signed = transition(
      initialState(),
      { type: "report", note: "Field review recorded.", sign: true },
      now,
    );
    const before = reportText(signed);
    const changed = transition(
      signed,
      {
        type: "resolve",
        id: "ISS-031",
        reason: "All correction evidence reviewed on site.",
      },
      now,
    );
    expect(reportText(changed)).toBe(before);
    expect(reportText(changed)).toContain("Field review recorded.");
    expect(() =>
      transition(changed, { type: "report", note: "Change", sign: false }, now),
    ).toThrow("locked");
  });
});
