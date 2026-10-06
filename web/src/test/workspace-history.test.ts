import { describe, expect, it } from "vitest";
import { initialState, transition } from "../workspace/state";
import { itemsAt, validHistory } from "../workspace/history";

describe("recorded progress by date", () => {
  it("does not apply current completion or open issues to dates before their records", () => {
    const state = initialState();
    expect(
      itemsAt(state, "2026-10-01").every(
        (i) => i.status === "none" && !i.issue,
      ),
    ).toBe(true);
    expect(
      itemsAt(state, "2026-10-05").find((i) => i.id === "PLUMB-402")?.status,
    ).toBe("none");
    expect(
      itemsAt(state, "2026-10-06").find((i) => i.id === "PLUMB-402")?.status,
    ).toBe("ai");
    expect(
      itemsAt(state, "2026-10-06").find((i) => i.id === "ISS-031")?.status,
    ).toBe("issue");
  });
  it("retains completion before a reopening, even when two decisions share a timestamp", () => {
    const accepted = transition(
      initialState(),
      { type: "accept", id: "PLUMB-402", reason: "Reviewed visible work." },
      "2026-10-07T11:00:00",
    );
    const reopened = transition(
      accepted,
      { type: "reopen", id: "PLUMB-402", reason: "Revised reference." },
      "2026-10-07T11:00:00",
    );
    expect(
      itemsAt(reopened, "2026-10-06").find((i) => i.id === "PLUMB-402")?.status,
    ).toBe("ai");
    expect(
      itemsAt(reopened, "2026-10-07").find((i) => i.id === "PLUMB-402")?.status,
    ).toBe("review");
    expect(validHistory(reopened.events)).toHaveLength(reopened.events.length);
  });
});
