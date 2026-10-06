import type { ModelDataset } from "../viewer/modelData";
import { ifcPointToViewer } from "../viewer/spatialMath";
import {
  STORE_KEY,
  initialState,
  loadState,
  type Check,
  type WorkItem,
  type WorkspaceState,
} from "./state";

/** New sample work packages, explicitly associated with real source components.
 * They are demonstrations on a public design, not observations of the actual building. */
const packages: Record<
  string,
  { element: string; title: string; trade?: string }
> = {
  "F-118": {
    element: "c22b642a-f56e-5e66-913e-4a72fbcf62cc",
    title: "Bedroom door — placement review",
  },
  "ISS-031": {
    element: "f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c",
    title: "Bedroom pipe connection — correction submitted",
    trade: "Plumbing",
  },
  "CORE-14": {
    element: "d09d1641-ef7d-53db-9d74-afdf3091c96d",
    title: "Firestop evidence at pipe penetration",
  },
  "ELEC-406": {
    element: "e3ae713a-1537-5bad-b6ba-21b3439bc030",
    title: "Kitchen receptacle — more evidence needed",
  },
  "ELEC-408": {
    element: "67293c4b-dc58-5a12-bf31-5ca129d95fec",
    title: "Bedroom light — processing failed",
  },
  "PLUMB-402": {
    element: "70bac51c-0cf4-5135-a685-95a5c44f7c6c",
    title: "Kitchen sink connections",
  },
  "PUNCH-302": {
    element: "83d31769-ead4-5538-a3fa-d5f369803d04",
    title: "Living room ceiling finish",
  },
  "FRAME-407": {
    element: "291f86d9-3e5f-5b2a-88ff-c1e396b53a18",
    title: "Bedroom door — reference review",
  },
  "HVAC-401": {
    element: "5ff6e5a2-a789-5100-8791-d1d402213df2",
    title: "Living room radiator",
  },
  "PLUMB-405": {
    element: "7873fef4-3d76-5bcf-901a-b61d54802a0a",
    title: "Bedroom pipe fitting",
  },
  "ELEC-405": {
    element: "a23cf34d-5c31-5d85-aad8-768571524a54",
    title: "Bathroom light installation",
  },
  "PLAN-401": {
    element: "8186a27c-0d9d-5eca-b0e2-b2358af87cb7",
    title: "Bedroom radiator — planned work",
    trade: "HVAC",
  },
  "ISS-028": {
    element: "6ac05afe-2984-544c-a5c5-67e8844d48f6",
    title: "Waste pipe route — correction required",
  },
  "PLAN-408": {
    element: "e648bae6-9d04-5795-93a9-5c3bc6047e29",
    title: "Bathroom faucet — planned work",
  },
};
export function initialProjectState(data: ModelDataset): WorkspaceState {
  const template = initialState();
  if (data.source.slug && data.source.slug !== "duplex")
    return {
      ...template,
      items: [],
      events: [],
      draft: null,
      projectName: data.source.name || "Imported building",
      modelVersion: data.version,
      modelApproved: true,
      assessmentJobs: [],
    };
  const items = template.items.flatMap((i): WorkItem[] => {
    const p = packages[i.id],
      e = data.elements.find((e) => e.id === p?.element);
    const level = data.plans.find((l) => l.id === e?.level_id);
    if (!p || !e?.bbox || !level) return [];
    const room = level.rooms.find((r) => r.id === e.zone_id);
    const b = e.bbox,
      anchor = ifcPointToViewer([
        (b[0] + b[3]) / 2,
        (b[1] + b[4]) / 2,
        (b[2] + b[5]) / 2,
      ]);
    const levelName = level.name.replace(/^Building · /, "");
    const location = {
      version: data.version,
      building: "Duplex Apartment",
      levelId: level.id,
      levelName,
      roomId: room?.id || null,
      roomName: room?.name || "Unassigned area",
      spaceCode: room?.code || "",
      elements: [e.id],
      anchor,
    };
    const checks: Check[] =
      i.status === "none" || i.status === "failed"
        ? []
        : [
            {
              name: `Visible ${e.props["IFC.resolved_class"] || e.ifc_class} condition`,
              result:
                i.status === "review"
                  ? "discrepancy"
                  : i.status === "unsupported"
                    ? "unsupported"
                    : i.status === "evidence"
                      ? "insufficient"
                      : "ok",
              release: ["ai", "human"].includes(i.status)
                ? "Fixture only — not a released live check"
                : "Manual review / sample only",
            },
          ];
    return [
      {
        ...i,
        title: p.title,
        trade: p.trade || i.trade,
        owner: p.trade ? template.items.find(item => item.trade === p.trade)?.owner || i.owner : i.owner,
        unit: room?.code || levelName,
        level: Math.round(level.elevation_m / 3.1) + 1,
        location,
        reference: `Imported IFC · revision ${data.version.slice(0, 7)} · ${e.ifc_guid}`,
        detail:
          i.status === "issue"
            ? "Sample correction evidence is attached; explicit acceptance is still required."
            : i.status === "review"
              ? "Sample finding awaiting a human decision against the linked design component."
              : i.status === "unsupported"
                ? "This photo check is unsupported. Request evidence or record an explicit human review."
                : i.status === "evidence"
                  ? "The sample evidence does not show enough of the selected work."
                  : i.status === "failed"
                    ? "Analysis failed. No completion decision is recorded."
                    : "Demonstration record for the linked component; not evidence of actual construction.",
        coverage:
          i.status === "evidence"
            ? "Insufficient sample evidence for the linked component"
            : i.status === "none"
              ? "No evidence"
              : i.status === "unsupported"
                ? "No supported check"
                : i.status === "failed"
                  ? "Not assessed"
                  : "Scope of the sample component check only",
        scope: `Linked component only: ${e.name || e.ifc_class}`,
        limits:
          "Hidden conditions, code compliance, exact measurements and formal inspections",
        checks,
        fixture: {
          checks,
          complete: ["PLUMB-402", "PUNCH-302"].includes(i.id),
        },
        condition: i.issue
          ? "Required follow-up confirmation has not been recorded."
          : undefined,
        resolution: i.issue
          ? "Review fresh correction evidence for the linked component and record a resolution reason."
          : undefined,
      },
    ];
  });
  const events = template.events
    .filter((e) => items.some((i) => i.id === e.item))
    .map((e) => ({
      ...e,
      text: `${items.find((i) => i.id === e.item)!.title} — sample ${e.tone} record.`,
    }));
  return {
    ...template,
    projectName: "Duplex Apartment",
    items,
    events,
    modelVersion: data.version,
    modelApproved: true,
    assessmentJobs: [],
  };
}
export function projectStorageKey(data: ModelDataset) {
  return data.source.slug && data.source.slug !== "duplex"
    ? `${STORE_KEY}:project:${data.source.slug}`
    : STORE_KEY;
}
export function availabilityStorageKey(data: ModelDataset) {
  return data.source.slug && data.source.slug !== "duplex"
    ? `ew-demo-people-v1:${data.source.slug}`
    : "ew-demo-people-v1";
}
export function loadProjectState(data: ModelDataset) {
  const key = projectStorageKey(data);
  const saved = loadState(key);
  // Earlier illustrated-project records stay in their original storage key; never reinterpret locations.
  if (
    saved.modelVersion !== data.version ||
    !saved.items.every(
      (i) =>
        i.location?.version === data.version &&
        i.location.elements.every((id) =>
          data.elements.some((e) => e.id === id),
        ),
    )
  ) {
    const raw = localStorage.getItem(key);
    if (raw)
      localStorage.setItem(
        `${key}:archive:${saved.modelVersion || "unbound"}:${Date.now()}`,
        raw,
      );
    return initialProjectState(data);
  }
  return saved;
}

export function plannedComponent(
  data: ModelDataset,
  id: string,
  title: string,
  owner: string,
): WorkItem {
  const element = data.elements.find((e) => e.id === id);
  const level = data.plans.find((p) => p.id === element?.level_id);
  if (!element?.bbox || !level)
    throw Error(
      "This component needs a confirmed source floor before tracking.",
    );
  const room = level.rooms.find((r) => r.id === element.zone_id),
    b = element.bbox;
  return {
    id: `WORK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    title: title.trim(),
    owner: owner.trim(),
    trade: element.trade || element.discipline,
    unit: room?.code || floorNameForRecord(level.name),
    level: data.plans.indexOf(level) + 1,
    location: {
      version: data.version,
      building: data.source.name || "Duplex Apartment",
      levelId: level.id,
      levelName: floorNameForRecord(level.name),
      roomId: room?.id || null,
      roomName: room?.name || "Unassigned area",
      spaceCode: room?.code || "",
      elements: [element.id],
      anchor: ifcPointToViewer([
        (b[0] + b[3]) / 2,
        (b[1] + b[4]) / 2,
        (b[2] + b[5]) / 2,
      ]),
    },
    status: "none",
    processing: "completed",
    update: "",
    time: "",
    reference: `Imported IFC · ${data.source.revision.slice(0, 7)} · ${element.ifc_guid}`,
    detail:
      "Planned work linked to the design. No field evidence or completion recorded.",
    scope: `Linked component only: ${element.name || element.ifc_class}`,
    limits:
      "Hidden conditions, code compliance, exact measurements and formal inspections",
    checks: [],
    photos: [],
    coverage: "No evidence",
    progress: "Not assessed",
    review: "Not requested",
    inspection: "Not recorded",
  };
}
const floorNameForRecord = (name: string) =>
  name.replace(/^Building\s*·\s*/, "");
export function locationLabel(item: WorkItem) {
  return item.location
    ? `${item.location.levelName} · ${item.location.spaceCode} ${item.location.roomName}`
    : item.unit === "Core"
      ? "Level 14 core"
      : `Unit ${item.unit}`;
}
