import * as THREE from "three";
import type { Marker } from "./Viewer";

/** Base at the component anchor; the billboard's head remains fully clickable. */
export function createMarkerMesh(
  marker: Marker,
  clipPlanes: THREE.Plane[] = [],
) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-0.18, 0.3, -0.62, 0.75, -0.62, 1.12);
  shape.bezierCurveTo(-0.62, 1.98, 0.62, 1.98, 0.62, 1.12);
  shape.bezierCurveTo(0.62, 0.75, 0.18, 0.3, 0, 0);
  const pin = new THREE.Mesh(
    marker.kind === "pin"
      ? new THREE.ShapeGeometry(shape)
      : new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({
      color: marker.color,
      depthTest: false,
      clippingPlanes: clipPlanes,
      side: THREE.DoubleSide,
    }),
  );
  pin.renderOrder = 10;
  pin.userData = {
    markerId: marker.id,
    elementId: marker.elementId,
    canonicalPoint: [...marker.position],
    billboard: marker.kind === "pin",
  };
  if (marker.kind === "pin") {
    const centre = new THREE.Mesh(
      new THREE.CircleGeometry(0.2, 16),
      new THREE.MeshBasicMaterial({
        color: "#f3f7ff",
        depthTest: false,
        clippingPlanes: clipPlanes,
        side: THREE.DoubleSide,
      }),
    );
    centre.position.set(0, 1.17, 0.01);
    centre.renderOrder = 11;
    centre.userData = { markerId: marker.id, elementId: marker.elementId };
    pin.add(centre);
  }
  return pin;
}
