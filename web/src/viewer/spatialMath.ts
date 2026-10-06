import { Box3, MathUtils, Vector3 } from "three";

export type Point3 = [number, number, number];
export type ViewDirection = "iso" | "top" | "front" | "side";
export const DIRECTIONS: Record<ViewDirection, Point3> = {
  iso: [1, 0.8, 1],
  top: [0.0001, 1, 0.0001],
  front: [0, 0, 1],
  side: [1, 0, 0],
};

/** Fit using both vertical and horizontal FOV; a 20mm fitting must not frame as a whole room. */
export function fitBounds(
  box: Box3,
  fov: number,
  aspect: number,
  direction: Point3 = DIRECTIONS.iso,
) {
  const center = box.getCenter(new Vector3());
  const radius = Math.max(box.getSize(new Vector3()).length() / 2, 0.005);
  const vertical = MathUtils.degToRad(fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(aspect, 0.1));
  const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.15;
  return {
    position: center
      .clone()
      .addScaledVector(new Vector3(...direction).normalize(), distance)
      .toArray() as Point3,
    target: center.toArray() as Point3,
    near: Math.max(0.0001, Math.min(0.02, radius / 100)),
    distance,
  };
}

export function ifcPointToViewer([x, y, z]: Point3): Point3 {
  return [x, z, -y];
}
export function viewerPointToIfc([x, y, z]: Point3): Point3 {
  return [x, -z, y];
}
