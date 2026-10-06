import type { ModelDataset } from "../viewer/modelData";
import { PUBLIC_PROJECTS } from "../viewer/modelData";
import { unitForRoom } from "./spatialNavigation";

export interface PropertyChoice {
  id: string;
  name: string;
  description: string;
  category?: string;
  address?: string | null;
  thumbnail?: string;
  private: boolean;
}
export const PUBLIC_PROPERTIES: PropertyChoice[] = PUBLIC_PROJECTS.map((p) => ({
  id: p.id,
  name: p.name,
  private: false,
  thumbnail: `/project-previews/${p.id}.svg`,
  description: p.description,
  category: p.category,
}));
export function projectUrl(id: string) {
  const params = new URLSearchParams();
  if (id !== "duplex") params.set("project", id);
  params.set("panel", "issues");
  return params.size ? `/?${params}` : "/";
}
export function showroomUrl(returnTo: string, current: string) {
  const params = new URLSearchParams({
    screen: "projects",
    preview: current,
    returnTo,
  });
  if (current !== "duplex") params.set("project", current);
  return `/?${params}`;
}
export function safeReturnUrl(value: string | null, current: string) {
  // Internal root navigation only, with no showroom recursion or external redirects.
  if (value && /^\/(?:\?|#|$)/.test(value)) {
    const url = new URL(value, "https://workspace.invalid");
    if (url.searchParams.get("screen") !== "projects")
      return url.pathname + url.search + url.hash;
  }
  return projectUrl(current);
}
export function propertyFacts(model: ModelDataset) {
  const rooms = model.plans.flatMap((p) => p.rooms);
  const units = new Set(
    rooms.map((r) => unitForRoom(model, r.code)).filter(Boolean),
  );
  return {
    levels: model.plans.length,
    rooms: rooms.length,
    components: model.elements.length,
    units: units.size,
  };
}
