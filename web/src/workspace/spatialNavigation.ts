import type { ModelDataset } from "../viewer/modelData";
import type { WorkItem } from "./state";

export const PANELS = [
  "summary",
  "issues",
  "activity",
  "team",
  "project",
  "capture",
  "record",
  "component",
  "locations",
] as const;
export type Panel = (typeof PANELS)[number];
export const floorName = (name: string) => name.replace(/^Building\s*·\s*/, "");

/** Reviewed display grouping for this public duplex's A/B room codes only.
 * Uploaded projects must provide reviewed unit associations; unknown rooms remain unassigned. */
export function unitForRoom(
  model: ModelDataset,
  code: string | null | undefined,
) {
  if (
    model.source.repository !==
      "buildingsmart-community/Community-Sample-Test-Files" ||
    model.source.revision !== "7ddf57a201f88a0c213d5322b02ed15e94a60a40"
  )
    return null;
  if (model.source.slug === "schependomlaan")
    return model.source.room_units?.[code || ""] || null;
  return /^([AB])\d{3}$/.exec(code || "")?.[1] || null;
}
export function workPath(model: ModelDataset, work: WorkItem) {
  const l = work.location;
  if (!l) return ["Location unconfirmed"];
  const unit = unitForRoom(model, l.spaceCode);
  return [
    l.building,
    floorName(l.levelName),
    unit ? `Unit ${unit}` : "Shared / unassigned",
    `${l.roomName}${l.spaceCode ? ` · ${l.spaceCode}` : ""}`,
  ];
}
export function initialNavigation(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const path = pathname.replace(/\/+$/, "") || "/";
  const match = /^\/(issue|review|result)\/([^/]+)$/.exec(path);
  if (match) {
    params.set("panel", "record");
    params.set("work", decodeURIComponent(match[2]));
  } else {
    const alias: Record<string, Panel> = {
      "/work": "issues",
      "/logs": "activity",
      "/report": "activity",
      "/activity": "activity",
      "/people": "team",
      "/setup": "project",
      "/capture": "capture",
      "/evidence": "issues",
      "/handoffs": "issues",
    };
    if (alias[path]) params.set("panel", alias[path]);
    if (path === "/building" && params.has("work"))
      params.set("panel", "record");
  }
  if (params.has("item")) {
    params.set("work", params.get("item")!);
    params.delete("item");
  }
  // Former illustrated-unit labels do not identify rooms in the imported model.
  if (path === "/building") {
    params.delete("view");
    if (!/^[AB]$/.test(params.get("unit") || "")) params.delete("unit");
  }
  return params;
}
export function workspaceUrl(params: URLSearchParams) {
  const query = params.toString();
  return "/" + (query ? `?${query}` : "");
}
