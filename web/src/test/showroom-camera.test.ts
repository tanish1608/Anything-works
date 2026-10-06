// @vitest-environment node
import { Box3, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DIRECTIONS, fitOrbitBounds } from "../viewer/spatialMath";
import {
  projectUrl,
  safeReturnUrl,
  showroomUrl,
} from "../workspace/propertyCatalog";

describe("project showroom camera and navigation", () => {
  it("keeps all building corners inside the frame throughout a full rotation on wide and phone viewports", () => {
    for (const size of [
      [45, 14, 8],
      [9, 55, 9],
      [22, 12, 27],
    ]) {
      const box = new Box3(
        new Vector3(100, -3, -50),
        new Vector3(100 + size[0], -3 + size[1], -50 + size[2]),
      );
      const center = box.getCenter(new Vector3());
      const direction = new Vector3(...DIRECTIONS.overview).normalize();
      const horizontal = Math.hypot(direction.x, direction.z);
      for (const aspect of [2, 1, 0.55]) {
        const fit = fitOrbitBounds(box, 55, aspect);
        expect(fit.target).toEqual(center.toArray());
        const camera = new PerspectiveCamera(55, aspect, fit.near, 10000);
        for (let degrees = 0; degrees < 360; degrees += 10) {
          const angle = (degrees * Math.PI) / 180;
          camera.position
            .copy(center)
            .add(
              new Vector3(
                Math.sin(angle) * horizontal,
                direction.y,
                Math.cos(angle) * horizontal,
              ).multiplyScalar(fit.distance),
            );
          camera.lookAt(center);
          camera.updateMatrixWorld();
          for (const x of [box.min.x, box.max.x])
            for (const y of [box.min.y, box.max.y])
              for (const z of [box.min.z, box.max.z]) {
                const point = new Vector3(x, y, z).project(camera);
                expect(Math.abs(point.x)).toBeLessThanOrEqual(1 / 1.12 + 1e-6);
                expect(Math.abs(point.y)).toBeLessThanOrEqual(1 / 1.12 + 1e-6);
                expect(point.z).toBeGreaterThan(-1);
                expect(point.z).toBeLessThan(1);
              }
        }
      }
    }
  });
  it("preserves the return context while keeping opening and unsafe redirects separate", () => {
    const context = "/?project=schependomlaan&panel=record&work=local#evidence";
    const url = new URL(
      showroomUrl(context, "schependomlaan"),
      "https://local.invalid",
    );
    expect(url.searchParams.get("preview")).toBe("schependomlaan");
    expect(safeReturnUrl(url.searchParams.get("returnTo"), "duplex")).toBe(
      context,
    );
    for (const unsafe of [
      "https://external.invalid",
      "//external.invalid",
      "/p/old",
      "/?screen=projects",
      null,
    ]) {
      expect(safeReturnUrl(unsafe, "duplex")).toBe("/?panel=issues");
    }
    expect(projectUrl("api:private")).toBe(
      "/?project=api%3Aprivate&panel=issues",
    );
  });
});
