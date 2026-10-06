// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Box3, PerspectiveCamera, Vector3, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fitBounds, fitProjectedBounds } from "../viewer/spatialMath";
import type { ModelDataset } from "../viewer/modelData";
import {
  initialProjectState,
  plannedComponent,
} from "../workspace/projectState";
import { transition } from "../workspace/state";
import { unitForRoom } from "../workspace/spatialNavigation";
import { projectModel } from "../workspace/modelProjection";

const model = JSON.parse(
  readFileSync("public/bim-schependomlaan/model.json", "utf8"),
) as ModelDataset;
describe("apartment project and overview camera", () => {
  it("fits every projected corner more closely than the old sphere at desktop and phone ratios", () => {
    const boxes = [
      new Box3(new Vector3(-12, 0, -12), new Vector3(12, 20, 12)),
      new Box3(new Vector3(0, 0, 0), new Vector3(70, 9, 12)),
    ];
    for (const box of boxes)
      for (const aspect of [1.8, 1.1, 0.5]) {
        const fit = fitProjectedBounds(box, 55, aspect);
        expect(fit.distance).toBeLessThan(fitBounds(box, 55, aspect).distance);
        const camera = new PerspectiveCamera(55, aspect, fit.near, 1000);
        camera.position.fromArray(fit.position);
        camera.lookAt(new Vector3(...fit.target));
        camera.updateMatrixWorld(true);
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const p = new Vector3(x, y, z).project(camera);
              expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.2 + 1e-6);
              expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.2 + 1e-6);
              expect(p.z).toBeLessThan(1);
              expect(p.z).toBeGreaterThan(-1);
            }
      }
  });
  it("preserves real apartments, spaces and untracked progress without borrowing duplex fixtures", () => {
    expect(model.elements).toHaveLength(3504);
    expect(model.plans).toHaveLength(6);
    expect(model.plans.flatMap((p) => p.rooms)).toHaveLength(99);
    const groups = new Set(
      model.plans
        .flatMap((p) => p.rooms)
        .map((r) => unitForRoom(model, r.code))
        .filter(Boolean),
    );
    expect(groups).toEqual(
      new Set(Array.from({ length: 10 }, (_, n) => String(n + 1))),
    );
    expect(unitForRoom(model, "A0.01")).toBeNull();
    expect(initialProjectState(model).items).toEqual([]);
    const e = model.elements.find(
      (e) => e.ifc_class === "IfcDoor" && e.zone_id,
    )!;
    const item = plannedComponent(model, e.id, "Pipe check", "Crew lead");
    const state = transition(initialProjectState(model), {
      type: "plan",
      item,
    });
    expect(state.items[0].status).toBe("none");
    expect(projectModel(model, state.items).colors.get(e.id)).not.toBe(
      "#047857",
    );
    expect(() =>
      transition(state, {
        type: "accept",
        id: item.id,
        reason: "Without evidence",
      }),
    ).toThrow(/Evidence/);
    expect(() => transition(state, { type: "plan", item })).toThrow(/already/);
    const foreign = {
      ...item,
      location: { ...item.location!, version: "duplex" },
    };
    expect(() =>
      transition(initialProjectState(model), { type: "plan", item: foreign }),
    ).toThrow(/current project/);
  });
  it("retains all plumbing source nodes in the exported mesh and plan references", async () => {
    const file = readFileSync("public/bim-schependomlaan/plumbing.glb");
    const scene = await new GLTFLoader().parseAsync(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
      "",
    );
    const meshes: Mesh[] = [];
    scene.scene.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    expect(new Set(meshes.map((m) => m.name))).toEqual(
      new Set(
        model.elements
          .filter((e) => e.discipline === "plumbing")
          .map((e) => e.id),
      ),
    );
    expect(
      model.elements
        .filter((e) => e.discipline === "plumbing")
        .every((e) =>
          model.plans.some((p) => p.elements.some((x) => x.id === e.id)),
        ),
    ).toBe(true);
    meshes.forEach((m) => m.geometry.dispose());
  });
});
