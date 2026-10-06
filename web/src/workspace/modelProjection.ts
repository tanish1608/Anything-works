import type { ModelDataset } from "../viewer/modelData";
import type { Marker } from "../viewer/Viewer";
import { DISCIPLINE_COLORS } from "../viewer/colors";
import { COLORS, type WorkItem, type Status } from "./state";

/** Project every view from the same version-bound work records. Unknown scope never implies completion. */
export function projectModel(
  data: ModelDataset,
  items: WorkItem[],
  selected: string | null = null,
) {
  const ids = new Set(data.elements.map((e) => e.id));
  const linked = items.filter(
    (i) =>
      i.location?.version === data.version &&
      i.location.elements.length &&
      i.location.elements.every((id) => ids.has(id)),
  );
  const colors = new Map(
    data.elements.map((e) => [
      e.id,
      DISCIPLINE_COLORS[e.discipline] || COLORS.none,
    ]),
  );
  for (const e of data.elements) {
    const work = linked.filter((i) => i.location!.elements.includes(e.id));
    if (!work.length) continue;
    const blocked: Status[] = [
      "issue",
      "review",
      "failed",
      "evidence",
      "unsupported",
      "none",
    ];
    const status =
      blocked.find((s) => work.some((i) => i.status === s)) ||
      (work.some((i) => i.status === "human") ? "human" : "ai");
    colors.set(e.id, COLORS[status]);
  }
  const markers: Marker[] = linked
    .filter((i) => i.status !== "none")
    .map((i) => ({
      id: i.id,
      elementId: i.location!.elements[0],
      position: i.location!.anchor,
      color: i.id === selected ? "#172c27" : COLORS[i.status],
    }));
  return { colors, markers, linked };
}
