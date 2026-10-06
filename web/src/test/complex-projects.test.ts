// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelDataset } from "../viewer/modelData";
import {
  initialProjectState,
  plannedComponent,
  projectStorageKey,
} from "../workspace/projectState";
import { unitForRoom } from "../workspace/spatialNavigation";
import { fitBounds, ifcPointToViewer } from "../viewer/spatialMath";
import { transition } from "../workspace/state";

const sources = [
  {
    slug: "clinic",
    elements: 16071,
    levels: 4,
    rooms: 798,
    discipline: "electrical",
  },
  {
    slug: "esplan",
    elements: 1958,
    levels: 7,
    rooms: 285,
    discipline: "architecture",
  },
];
describe.each(sources)(
  "$slug source fidelity and field-work context",
  (expected) => {
    const model = JSON.parse(
      readFileSync(`public/bim-${expected.slug}/model.json`, "utf8"),
    ) as ModelDataset;
    it("retains distinct source records and project identity without invented units or field progress", () => {
      expect(model.elements).toHaveLength(expected.elements);
      expect(model.plans).toHaveLength(expected.levels);
      const rooms = model.plans.flatMap((p) => p.rooms);
      expect(rooms).toHaveLength(expected.rooms);
      expect(new Set(rooms.map((r) => r.id)).size).toBe(expected.rooms);
      expect(new Set(model.elements.map((e) => e.ifc_guid)).size).toBe(
        expected.elements,
      );
      expect(unitForRoom(model, "A101")).toBeNull();
      expect(initialProjectState(model).items).toEqual([]);
      expect(projectStorageKey(model)).toContain(`:project:${expected.slug}`);
      const levelIds = new Set(model.plans.map((p) => p.id));
      expect(
        model.elements.every(
          (e) => e.level_id == null || levelIds.has(e.level_id),
        ),
      ).toBe(true);
      const roomIds = new Set(rooms.map((r) => r.id));
      expect(
        model.elements
          .filter((e) => e.zone_id)
          .every((e) => roomIds.has(e.zone_id!)),
      ).toBe(true);
    });
    it("allows explicit planned work on an actual room-linked component while blocking evidence-free acceptance", () => {
      const e = model.elements.find(
        (e) => e.zone_id && e.discipline === expected.discipline,
      )!;
      expect(e).toBeDefined();
      const item = plannedComponent(
        model,
        e.id,
        "Daily work check",
        "Responsible crew",
      );
      const state = transition(initialProjectState(model), {
        type: "plan",
        item,
      });
      expect(state.items[0].location?.version).toBe(model.version);
      expect(state.items[0].location?.elements).toEqual([e.id]);
      expect(state.items[0].status).toBe("none");
      expect(() =>
        transition(state, { type: "accept", id: item.id, reason: "No photos" }),
      ).toThrow(/Evidence/);
    });
    it("keeps layer node identities and real source bounds, including precise survey-coordinate picking", async () => {
      const file = readFileSync(
        `public/bim-${expected.slug}/${expected.discipline}.glb`,
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
      const records = model.elements.filter(
        (e) => e.discipline === expected.discipline,
      );
      expect(new Set(meshes.map((m) => m.name))).toEqual(
        new Set(records.map((e) => e.id)),
      );
      for (const record of records.slice(0, 8)) {
        const box = new Box3().setFromObject(
          meshes.find((m) => m.name === record.id)!,
        );
        const [x, y, z, xx, yy, zz] = record.bbox!;
        const min = ifcPointToViewer([x, y, z]),
          max = ifcPointToViewer([xx, yy, zz]);
        const expectedBox = new Box3().setFromPoints([
          new Vector3(...min),
          new Vector3(...max),
        ]);
        expect(box.min.distanceTo(expectedBox.min)).toBeLessThan(0.0002);
        expect(box.max.distanceTo(expectedBox.max)).toBeLessThan(0.0002);
      }
      const target =
        meshes.find(
          (m) =>
            model.elements.find((e) => e.id === m.name)?.ifc_class ===
            "IfcDoor",
        ) || meshes[0];
      const attribute = target.geometry.getAttribute("position");
      const index = target.geometry.index;
      const vertices = [0, 1, 2].map((i) =>
        new Vector3()
          .fromBufferAttribute(attribute, index ? index.getX(i) : i)
          .applyMatrix4(target.matrixWorld),
      );
      const center = vertices
        .reduce((sum, v) => sum.add(v), new Vector3())
        .divideScalar(3);
      const normal = vertices[1]
        .clone()
        .sub(vertices[0])
        .cross(vertices[2].clone().sub(vertices[0]))
        .normalize();
      const ray = new Raycaster(
        center.clone().addScaledVector(normal, 1),
        normal.clone().negate(),
      );
      expect(ray.intersectObject(target).length).toBeGreaterThan(0);
      const fit = fitBounds(new Box3().setFromObject(target), 55, 0.7);
      expect(fit.target.every(Number.isFinite)).toBe(true);
      meshes.forEach((m) => m.geometry.dispose());
    });
  },
);
