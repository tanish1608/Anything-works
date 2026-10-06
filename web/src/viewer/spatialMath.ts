import { Box3, MathUtils, Vector3 } from "three";

export type Point3 = [number, number, number];
export type ViewDirection = "iso" | "overview" | "top" | "front" | "side";
export const DIRECTIONS: Record<ViewDirection, Point3> = {
  iso: [1, 0.8, 1],
  overview: [1, 0.65, 1.35],
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

/** Fit projected corners, rather than a bounding sphere, for a larger building overview.
 * Every corner still fits in both axes, including long buildings and narrow viewports. */
export function fitProjectedBounds(
  box: Box3,
  fov: number,
  aspect: number,
  direction: Point3 = DIRECTIONS.overview,
  padding = 1.2,
) {
  const center = box.getCenter(new Vector3());
  const towardsCamera = new Vector3(...direction).normalize();
  const right = new Vector3(0, 1, 0).cross(towardsCamera).normalize();
  if (right.lengthSq() < 0.00001) right.set(1, 0, 0);
  const up = towardsCamera.clone().cross(right).normalize();
  const vertical = Math.tan(MathUtils.degToRad(fov / 2));
  const horizontal = vertical * Math.max(aspect, 0.1);
  let distance = 0.01;
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const corner = new Vector3(x, y, z).sub(center);
        const depth = corner.dot(towardsCamera);
        distance = Math.max(
          distance,
          depth + (padding * Math.abs(corner.dot(right))) / horizontal,
          depth + (padding * Math.abs(corner.dot(up))) / vertical,
        );
      }
  return {
    position: center
      .clone()
      .addScaledVector(towardsCamera, distance)
      .toArray() as Point3,
    target: center.toArray() as Point3,
    near: Math.max(
      0.0001,
      Math.min(0.02, box.getSize(new Vector3()).length() / 200),
    ),
    distance,
  };
}
