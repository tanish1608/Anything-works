import { readFileSync } from "node:fs";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { ModelDataset } from "../viewer/modelData";
import { applyDisplayOffset, levelOffsets } from "../viewer/explosion";
import { initialProjectState, plannedComponent } from "../workspace/projectState";
import { projectModel } from "../workspace/modelProjection";
import { transition, type Draft } from "../workspace/state";
const model = JSON.parse(
  readFileSync("public/bim-duplex/model.json", "utf8"),
) as ModelDataset;
const draft = (item: string): Draft => ({
  item,
  note: "Checked installation",
  claim: "Done",
  step: 3,
  photos: [
    {
      id: "fresh-photo",
      url: "data:image/jpeg;base64,x",
      name: "Field photo",
      sample: false,
    },
  ],
});
describe("shared model and field workflow", () => {
  it("lets a PM raise an assigned issue on an untracked component without inventing evidence", () => {
    const state = initialProjectState(model);
    const tracked = new Set(state.items.flatMap((i) => i.location!.elements));
    const element = model.elements.find(
      (e) => e.bbox && e.level_id && !tracked.has(e.id),
    )!;
    const item = plannedComponent(model, element.id, "Wrong pipe slope", "PM");
    const next = transition(state, {
      type: "raise",
      item,
      description: "Slope runs the wrong way.",
      reporter: "Sarah Jenkins",
      owner: "River Plumbing",
      due: "2026-10-12",
    });
    const raised = next.items.find((i) => i.id === item.id)!;
    expect(raised.issue).toMatch(/^ISS-/);
    expect(raised.status).toBe("issue");
    expect(raised.owner).toBe("River Plumbing");
    expect(raised.photos).toHaveLength(0);
    expect(raised.progress).toBe("Not assessed");
    expect(next.events[0].actor).toBe("Sarah Jenkins");
    expect(() =>
      transition(next, { type: "raise", item, description: "Again", reporter: "x" }),
    ).toThrow(/already has tracked work/);
  });

  it("keeps a customer or crew report in PM triage instead of confirming an issue", () => {
    const state = initialProjectState(model);
    const work = state.items.find((i) => !i.issue && i.status !== "issue")!;
    const next = transition(state, {
      type: "raise",
      id: work.id,
      description: "Paint is chipped at the door frame.",
      reporter: "Customer (preview)",
    });
    const reported = next.items.find((i) => i.id === work.id)!;
    expect(reported.issue).toBeUndefined();
    expect(reported.status).toBe("review");
    expect(reported.review).toMatch(/awaiting project-manager triage/);
    expect(next.events[0].actor).toBe("Customer (preview)");
    expect(() =>
      transition(state, { type: "raise", id: work.id, description: " ", reporter: "x" }),
    ).toThrow(/Describe the problem/);
  });

  it("binds all work packages to existing components, source rooms, levels and one revision", () => {
    const state = initialProjectState(model);
    expect(state.items).toHaveLength(14);
    expect(new Set(state.items.map((i) => i.location!.levelId)).size).toBe(2);
    for (const item of state.items) {
      expect(item.location!.version).toBe(model.version);
      const element = model.elements.find(
        (e) => e.id === item.location!.elements[0],
      )!;
      expect(element).toBeDefined();
      expect(element.level_id).toBe(item.location!.levelId);
      expect(element.zone_id).toBe(item.location!.roomId);
    }
  });
  it("records the assessment handoff and withdraws green for fresh evidence without running AI", () => {
    const seed = initialProjectState(model),
      id = "PLUMB-402";
    const state = transition(
      seed,
      { type: "submit", draft: draft(id), offline: false, sample: false },
      "2026-10-07T15:00:00Z",
    );
    const item = state.items.find((i) => i.id === id)!;
    expect(item.status).toBe("review");
    expect(item.assessments).toHaveLength(1);
    expect(state.assessmentJobs![0]).toMatchObject({
      modelVersion: model.version,
      elements: item.location!.elements,
      photos: ["fresh-photo"],
      state: "awaiting_agent",
      update: item.update,
    });
    expect(
      projectModel(model, state.items).colors.get(item.location!.elements[0]),
    ).not.toBe("#10b981");
    const accepted = transition(state, {
      type: "accept",
      id,
      reason: "Inspected photo and model context",
    });
    expect(
      projectModel(model, accepted.items).colors.get(
        item.location!.elements[0],
      ),
    ).toBe("#047857");
  });
  it("keeps one version-bound request through offline syncing and never pretends real photos were simulated", () => {
    const state = transition(initialProjectState(model), {
      type: "submit",
      draft: draft("PLUMB-402"),
      offline: true,
      sample: true,
    });
    expect(state.assessmentJobs![0].state).toBe("queued_offline");
    const synced = transition(transition(state, { type: "sync" }), {
      type: "sync",
    });
    expect(synced.assessmentJobs).toHaveLength(1);
    expect(synced.assessmentJobs![0].id).toBe(state.assessmentJobs![0].id);
    expect(synced.assessmentJobs![0].state).toBe("awaiting_agent");
    expect(synced.items.find((i) => i.id === "PLUMB-402")!.status).toBe(
      "review",
    );
    const online = transition(initialProjectState(model), {
      type: "submit",
      draft: draft("PLUMB-402"),
      offline: false,
      sample: true,
    });
    expect(online.assessmentJobs![0].state).toBe("awaiting_agent");
  });
  it("supersedes an older pending update instead of processing both after reconnect", () => {
    const queued = transition(initialProjectState(model), {
      type: "submit",
      draft: draft("PLUMB-402"),
      offline: true,
      sample: false,
    });
    const newer = transition(queued, {
      type: "submit",
      draft: { ...draft("PLUMB-402"), note: "New context photo" },
      offline: false,
      sample: false,
    });
    const synced = transition(newer, { type: "sync" });
    expect(synced.assessmentJobs!.map((j) => j.state)).toEqual([
      "awaiting_agent",
      "superseded",
    ]);
    expect(synced.assessmentJobs![0].note).toBe("New context photo");
    expect(synced.assessmentJobs![0].reference).toBe(
      synced.items.find((i) => i.id === "PLUMB-402")!.reference,
    );
  });
  it("blocks stale locations and unapproved baselines", () => {
    const state = initialProjectState(model);
    state.modelApproved = false;
    expect(() =>
      transition(state, {
        type: "submit",
        draft: draft("PLUMB-402"),
        offline: false,
        sample: false,
      }),
    ).toThrow(/Approve the model/);
    state.modelApproved = true;
    state.items.find((i) => i.id === "PLUMB-402")!.location!.version = "old";
    expect(() =>
      transition(state, {
        type: "submit",
        draft: draft("PLUMB-402"),
        offline: false,
        sample: false,
      }),
    ).toThrow(/confirm this work location/);
    expect(
      projectModel(model, state.items).markers.some(
        (m) => m.id === "PLUMB-402",
      ),
    ).toBe(false);
  });
  it("keeps open issues and unassessed scope above older completion on shared components", () => {
    const state = initialProjectState(model),
      complete = state.items.find((i) => i.id === "PLUMB-402")!;
    state.items.push({ ...complete, id: "another-scope", status: "issue" });
    expect(
      projectModel(model, state.items).colors.get(
        complete.location!.elements[0],
      ),
    ).toBe("#ef4444");
    state.items.at(-1)!.status = "none";
    expect(
      projectModel(model, state.items).colors.get(
        complete.location!.elements[0],
      ),
    ).toBe("#e2e8f0");
  });
  it("explodes all floors deterministically and restores source transforms without accumulating offsets", () => {
    const offsets = levelOffsets(model.elements, model.plans, true);
    expect(new Set(offsets.values()).size).toBe(4);
    expect(
      new Set(levelOffsets(model.elements, model.plans, false).values()),
    ).toEqual(new Set([0]));
    const parent = new Group();
    parent.rotation.x = -Math.PI / 2;
    parent.scale.set(2, 2, 2);
    parent.position.set(4, 5, 6);
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.position.set(1, 2, 3);
    parent.add(mesh);
    parent.updateMatrixWorld(true);
    const before = mesh.getWorldPosition(new Vector3()),
      vertices = [...mesh.geometry.attributes.position.array];
    applyDisplayOffset(mesh, 6);
    applyDisplayOffset(mesh, 6);
    expect(
      mesh
        .getWorldPosition(new Vector3())
        .distanceTo(before.clone().add(new Vector3(0, 6, 0))),
    ).toBeLessThan(1e-10);
    applyDisplayOffset(mesh, 0);
    expect(
      mesh.getWorldPosition(new Vector3()).distanceTo(before),
    ).toBeLessThan(1e-10);
    expect([...mesh.geometry.attributes.position.array]).toEqual(vertices);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
