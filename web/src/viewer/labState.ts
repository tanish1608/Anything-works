import type { Viewpoint } from "./Viewer";
import type { Photo } from "../workspace/state";

export interface LabPin {
  id: string;
  element: string;
  guid: string;
  point: [number, number, number];
  version: string;
  viewpoint: Viewpoint;
  title: string;
  resolved?: boolean;
  evidence_before?: string[];
}
export interface Observation {
  status: "review" | "human" | "ai";
  photos: Photo[];
  reason: string;
  version: string;
}
export interface LabState {
  version: string;
  pins: LabPin[];
  observations: Record<string, Observation>;
  history: { element: string; text: string; at: string }[];
}
export type LabAction =
  | { type: "photo"; element: string; photo: Photo }
  | { type: "accept" | "sample"; element: string; reason: string }
  | { type: "pin"; pin: LabPin }
  | { type: "resolve"; pin: string; reason: string };
export const emptyLab = (version: string): LabState => ({
  version,
  pins: [],
  observations: {},
  history: [],
});

export function labTransition(
  state: LabState,
  action: LabAction,
  now = new Date().toISOString(),
): LabState {
  const next = structuredClone(state);
  let element: string, text: string;
  if (action.type === "pin") {
    if (
      action.pin.version !== state.version ||
      !action.pin.title.trim() ||
      !action.pin.point.every(Number.isFinite)
    )
      throw Error(
        "A pin needs a title and a finite location in this model revision.",
      );
    next.pins.push({
      ...action.pin,
      evidence_before: (
        next.observations[action.pin.element]?.photos ?? []
      ).map((p) => p.id),
    });
    element = action.pin.element;
    text = `Issue pinned: ${action.pin.title}`;
  } else if (action.type === "resolve") {
    const pin = next.pins.find((p) => p.id === action.pin);
    if (!pin || !action.reason.trim())
      throw Error("Record the resolution reason.");
    const evidence = next.observations[pin.element];
    if (
      !evidence?.photos.some(
        (p) => !(pin.evidence_before ?? []).includes(p.id),
      ) ||
      evidence.status !== "human"
    )
      throw Error("Review correction evidence before resolving this issue.");
    pin.resolved = true;
    element = pin.element;
    text = `Issue resolved: ${action.reason}`;
  } else {
    element = action.element;
    const current = next.observations[element];
    if (action.type === "photo") {
      next.observations[element] = {
        status: "review",
        photos: [...(current?.photos ?? []), action.photo],
        reason: "New evidence awaits review; no live AI analysis.",
        version: state.version,
      };
      text = `Evidence submitted: ${action.photo.name}`;
    } else {
      if (!current?.photos.length || !action.reason.trim())
        throw Error("Evidence and a decision reason are required.");
      if (action.type === "sample" && !current.photos.at(-1)?.sample)
        throw Error(
          "Fixture AI results can only be applied to labeled sample evidence.",
        );
      current.status = action.type === "sample" ? "ai" : "human";
      current.reason = action.reason;
      text = `${action.type === "sample" ? "Fixture AI result (simulated)" : "Local human acceptance"}: ${action.reason}`;
    }
  }
  next.history.unshift({ element, text, at: now });
  return next;
}

export function labStatus(
  state: LabState,
  element: string,
): "issue" | "review" | "human" | "ai" | "none" {
  return state.pins.some((p) => p.element === element && !p.resolved)
    ? "issue"
    : (state.observations[element]?.status ?? "none");
}
