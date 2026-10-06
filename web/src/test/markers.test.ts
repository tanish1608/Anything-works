import { expect, it } from "vitest";
import { Raycaster, Vector3 } from "three";
import { createMarkerMesh } from "../viewer/markers";

it("selects the same work ID through a pin's centre and body, preserving its component anchor", () => {
  const anchor: [number, number, number] = [10, 20, 30];
  const pin = createMarkerMesh({
    id: "issue",
    elementId: "fitting",
    position: anchor,
    color: "#ef4444",
    kind: "pin",
  });
  pin.position.fromArray(anchor);
  pin.updateMatrixWorld(true);
  for (const y of [20.35, 21.17]) {
    const hit = new Raycaster(
      new Vector3(10, y, 40),
      new Vector3(0, 0, -1),
    ).intersectObjects([pin], true)[0];
    expect(hit.object.userData.markerId).toBe("issue");
    expect(hit.object.userData.elementId).toBe("fitting");
  }
  expect(pin.userData.canonicalPoint).toEqual(anchor);
  expect(anchor).toEqual([10, 20, 30]);
});
