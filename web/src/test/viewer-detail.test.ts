// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Box3, Raycaster, Vector3, Mesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  fitBounds,
  ifcPointToViewer,
  viewerPointToIfc,
} from "../viewer/spatialMath";
import { emptyLab, labStatus, labTransition } from "../viewer/labState";
import { elementColor, STATUS_COLORS } from "../viewer/colors";
import type { BimDataset } from "../pages/BimLabPage";
import { exteriorWall, roofElement } from "../viewer/envelope";
import { visibleIds } from "../viewer/filters";

const dataset = JSON.parse(
  readFileSync(
    new URL("../../public/bim-duplex/model.json", import.meta.url),
    "utf8",
  ),
) as BimDataset;

describe("detailed BIM geometry and camera", () => {
  it("removes the real tagged exterior shell while preserving the duplex shared walls and every pipe", () => {
    const walls = dataset.elements.filter((e) =>
      e.ifc_class.startsWith("IfcWall"),
    );
    expect(walls.filter((e) => exteriorWall(e) === true)).toHaveLength(19);
    const party = walls.filter(
      (e) => e.props["PSet_Revit_Type_Construction.Function"] === 5,
    );
    expect(party).toHaveLength(4);
    const visible = visibleIds(dataset.elements, {
      disciplines: new Set(dataset.layers.map((l) => l.discipline)),
      levelId: null,
      zoneId: null,
      interior: true,
      hideRoof: true,
    });
    expect(party.every((e) => visible.has(e.id))).toBe(true);
    const roofs = dataset.elements.filter(roofElement);
    expect(roofs).toHaveLength(1);
    expect(roofs[0].ifc_class).toBe("IfcSlab");
    expect(visible.has(roofs[0].id)).toBe(false);
    expect(
      dataset.elements
        .filter((e) => e.discipline === "plumbing")
        .every((e) => visible.has(e.id)),
    ).toBe(true);
    expect(
      walls
        .filter((e) => exteriorWall(e) === true)
        .every((e) => !visible.has(e.id)),
    ).toBe(true);
    const exterior = walls.find((e) => exteriorWall(e) === true)!;
    const revealed = visibleIds(dataset.elements, {
      disciplines: new Set(["architecture"]),
      levelId: null,
      zoneId: null,
      interior: true,
      revealed: exterior.id,
    });
    expect(revealed.has(exterior.id)).toBe(true);
  });
  it("fits a 35mm fitting closely and respects a narrow mobile viewport", () => {
    const box = new Box3(
      new Vector3(0, 0, 0),
      new Vector3(0.035, 0.035, 0.035),
    );
    const wide = fitBounds(box, 55, 1.7),
      narrow = fitBounds(box, 55, 0.5);
    expect(wide.distance).toBeLessThan(0.2);
    expect(narrow.distance).toBeGreaterThan(wide.distance);
    expect(wide.near).toBeLessThan(0.001);
    const point: [number, number, number] = [8.3341, -16.7511, 3.1915];
    expect(viewerPointToIfc(ifcPointToViewer(point))).toEqual(point);
  });
  it("retains every exported element node and resolves an actual bedroom elbow surface", async () => {
    const file = readFileSync(
      new URL("../../public/bim-duplex/plumbing.glb", import.meta.url),
    );
    const gltf = await new GLTFLoader().parseAsync(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
      "",
    );
    gltf.scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    const ids = new Set(meshes.map((m) => m.name));
    expect(ids).toEqual(
      new Set(
        dataset.elements
          .filter((e) => e.discipline === "plumbing")
          .map((e) => e.id),
      ),
    );
    const id = dataset.audit.bedroom_fitting!.id,
      mesh = meshes.find((m) => m.name === id)!;
    const box = new Box3().setFromObject(mesh),
      fit = fitBounds(box, 55, 1.5);
    expect(box.getSize(new Vector3()).length()).toBeLessThan(0.1);
    const center = box.getCenter(new Vector3()),
      direction = new Vector3(1, 0.8, 1).normalize();
    const ray = new Raycaster(
      center.clone().addScaledVector(direction, 0.2),
      direction.negate(),
    );
    const hits = ray.intersectObject(mesh, false);
    expect(hits.length).toBeGreaterThan(0);
    expect(box.containsPoint(hits[0].point)).toBe(true);
    expect(fit.distance).toBeLessThan(0.2);
    expect(dataset.plans.some((p) => p.elements.some((e) => e.id === id))).toBe(
      true,
    );
    expect(
      dataset.elements.find((e) => e.id === id)!.props["IFC.resolved_class"],
    ).toBe("IfcPipeFitting");
    meshes.forEach((m) => m.geometry.dispose());
  });
});

describe("scoped imported-model progress", () => {
  const photo = {
    id: "photo",
    name: "Field photo",
    url: "data:image/jpeg;base64,test",
    sample: false,
  };
  it("never turns an uploaded photo into completion, and blocks fixture analysis of real evidence", () => {
    const state = labTransition(emptyLab("v1"), {
      type: "photo",
      element: "a",
      photo,
    });
    expect(labStatus(state, "a")).toBe("review");
    expect(labStatus(state, "b")).toBe("none");
    expect(() =>
      labTransition(state, { type: "sample", element: "a", reason: "Test" }),
    ).toThrow("sample evidence");
    expect(() =>
      labTransition(state, { type: "accept", element: "a", reason: "" }),
    ).toThrow("reason");
    const accepted = labTransition(state, {
      type: "accept",
      element: "a",
      reason: "Checked selected fitting.",
    });
    expect(labStatus(accepted, "a")).toBe("human");
    expect(labStatus(accepted, "b")).toBe("none");
    const pinned = labTransition(accepted, {
      type: "pin",
      pin: {
        id: "after-acceptance",
        element: "a",
        guid: "g",
        point: [1, 2, 3],
        version: "v1",
        title: "New defect",
        viewpoint: { position: [2, 3, 4], target: [1, 2, 3] },
      },
    });
    expect(() =>
      labTransition(pinned, {
        type: "resolve",
        pin: "after-acceptance",
        reason: "Reuse old acceptance",
      }),
    ).toThrow("correction evidence");
    const renewed = labTransition(accepted, {
      type: "photo",
      element: "a",
      photo,
    });
    expect(labStatus(renewed, "a")).toBe("review");
    expect(renewed.history).toHaveLength(3);
  });
  it("keeps an exact pin tied to its revision and open until correction evidence is reviewed", () => {
    const state = labTransition(emptyLab("v1"), {
      type: "pin",
      pin: {
        id: "pin",
        element: "a",
        guid: "g",
        point: [1.12, 3.4, -5.6],
        version: "v1",
        title: "Wrong corner",
        viewpoint: { position: [2, 3, 4], target: [1.12, 3.4, -5.6] },
      },
    });
    expect(labStatus(state, "a")).toBe("issue");
    expect(() =>
      labTransition(state, { type: "resolve", pin: "pin", reason: "Okay" }),
    ).toThrow("correction evidence");
    const evidence = labTransition(state, {
      type: "photo",
      element: "a",
      photo,
    });
    const accepted = labTransition(evidence, {
      type: "accept",
      element: "a",
      reason: "Inspected the correction.",
    });
    expect(labStatus(accepted, "a")).toBe("issue");
    const resolved = labTransition(accepted, {
      type: "resolve",
      pin: "pin",
      reason: "Correction verified.",
    });
    expect(labStatus(resolved, "a")).toBe("human");
    expect(resolved.pins[0].point).toEqual(state.pins[0].point);
    expect(() =>
      labTransition(emptyLab("v2"), { type: "pin", pin: state.pins[0] }),
    ).toThrow("revision");
  });
  it("distinguishes real human acceptance from legacy automatic approvals", () => {
    const element = { discipline: "plumbing", status: "done", open_issues: 0 };
    expect(elementColor({ ...element, completion_basis: "human" }, true)).toBe(
      STATUS_COLORS.human,
    );
    expect(
      elementColor({ ...element, completion_basis: "legacy_ai" }, true),
    ).toBe(STATUS_COLORS.review);
    expect(
      elementColor(
        { ...element, completion_basis: "human", open_issues: 1 },
        true,
      ),
    ).toBe(STATUS_COLORS.issue);
  });
});
