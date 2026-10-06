/** Designer fixtures. This store never calls AI, sends messages, or changes live projects. */
export type Status =
  | "ai"
  | "human"
  | "issue"
  | "review"
  | "evidence"
  | "failed"
  | "unsupported"
  | "none";
export type Processing = "completed" | "failed" | "queued" | "review";
export interface Check {
  name: string;
  result: "ok" | "discrepancy" | "insufficient" | "unsupported";
  release: string;
}
export interface WorkItem {
  serverRevision?: number;
  assigneeId?: string;
  captureGuidance?: string;
  location?: {
    version: string;
    building: string;
    levelId: string;
    levelName: string;
    roomId: string | null;
    roomName: string;
    spaceCode: string;
    elements: string[];
    anchor: [number, number, number];
  };
  fixture?: { checks: Check[]; complete: boolean };
  id: string;
  unit: string;
  level: number;
  title: string;
  trade: string;
  owner: string;
  status: Status;
  reference: string;
  update: string;
  time: string;
  detail: string;
  scope: string;
  limits: string;
  image?: string;
  checks: Check[];
  processing: Processing;
  coverage: string;
  progress: string;
  review: string;
  issue?: string;
  correction?: boolean;
  inspection: string;
  photos: Photo[];
  claimed?: string;
  due?: string;
  resolution?: string;
  condition?: string;
  dismissed?: boolean;
  assessments?: {
    update: string;
    reference: string;
    checks: Check[];
    coverage: string;
    progress: string;
    photos: Photo[];
    at: string;
  }[];
}
export interface Photo {
  id: string;
  url: string;
  sample: boolean;
  name: string;
}
export interface Activity {
  snapshot?: WorkItem;
  id: string;
  item: string;
  at: string;
  actor: string;
  text: string;
  tone: Status;
}
export interface Draft {
  clientId?: string;
  item: string;
  note: string;
  claim: string;
  photos: Photo[];
  step: number;
}
export interface WorkspaceState {
  version: 1;
  items: WorkItem[];
  events: Activity[];
  draft: Draft | null;
  projectName: string;
  reportNote: string;
  reportSigned: string | null;
  reportSnapshot?: string;
  modelVersion?: string;
  modelApproved?: boolean;
  assessmentJobs?: {
    id: string;
    update: string;
    item: string;
    modelVersion: string;
    elements: string[];
    photos: string[];
    note?: string;
    claim?: string;
    reference?: string;
    scope?: string;
    state:
      | "queued_offline"
      | "awaiting_agent"
      | "manual_review"
      | "fixture_complete"
      | "superseded";
    at: string;
  }[];
}
export const LEGACY_STORE_KEY = "everything-works-designer-v1";
export const STORE_KEY = "everything-works-project-v2";
export function roomStatus(items: WorkItem[]): Status {
  const order: Status[] = [
    "issue",
    "review",
    "failed",
    "evidence",
    "human",
    "ai",
    "unsupported",
    "none",
  ];
  return order.find((s) => items.some((i) => i.status === s)) || "none";
}
export const LABELS: Record<Status, string> = {
  ai: "AI-checked complete",
  human: "Human accepted",
  issue: "Open issue",
  review: "Needs review",
  evidence: "Needs evidence",
  failed: "Analysis failed",
  unsupported: "Unsupported check",
  none: "Not assessed",
};
export const COLORS: Record<Status, string> = {
  ai: "#10b981",
  human: "#047857",
  issue: "#ef4444",
  review: "#f59e0b",
  evidence: "#f59e0b",
  failed: "#ef4444",
  unsupported: "#94a3b8",
  none: "#e2e8f0",
};
export const ASSETS = "/design-assets/";
const check = (
  name: string,
  result: Check["result"],
  release = "Review only",
): Check => ({ name, result, release });
const defaults = {
  level: 14,
  time: "08:15",
  update: "",
  detail: "",
  scope: "Visible conditions in the captured area",
  limits: "Hidden connections, functional performance and formal inspection",
  processing: "completed" as Processing,
  coverage: "Adequate for the named check",
  progress: "Partial",
  review: "Pending",
  inspection: "Not recorded",
  photos: [] as Photo[],
};
function item(
  data: Omit<WorkItem, keyof typeof defaults> & Partial<typeof defaults>,
): WorkItem {
  const value = { ...defaults, ...data };
  if (value.image)
    value.photos = [
      {
        id: `sample-${value.id}`,
        url: ASSETS + value.image,
        sample: true,
        name: "Generated sample image",
      },
    ];
  return value;
}
export function initialState(): WorkspaceState {
  const items: WorkItem[] = [
    item({
      id: "F-118",
      unit: "403",
      title: "Door opening appears at the opposite end of the partition",
      trade: "Framing",
      owner: "Titan Framing · Carlos Diaz",
      status: "review",
      reference: "A-402 Rev C",
      update: "UPD-2291",
      time: "06:52",
      image: "framing-unit-403.jpg",
      detail:
        "Opening observed at the east end; the approved detail places it at the west end.",
      scope: "Opening presence and apparent placement",
      limits:
        "Exact dimensions, header size, structural adequacy and hidden fastenings",
      checks: [
        check("Opening present in partition", "ok"),
        check("Apparent opening placement", "discrepancy"),
        check("Stud count, east wall", "insufficient"),
        check("Header size & fastening", "unsupported", "No check"),
      ],
      due: "2026-10-07T07:00",
      resolution:
        "Reframe opening at west end per A-402 Rev C. Submit context and doorway photos.",
    }),
    item({
      id: "ISS-031",
      unit: "405",
      title: "Supply duct routing — correction submitted",
      trade: "HVAC",
      owner: "Apex Mechanical · Marco Rossi",
      status: "issue",
      reference: "M-402 Rev 3",
      update: "UPD-2293",
      time: "09:40",
      image: "duct-unit-405-after.jpg",
      issue: "ISS-031",
      correction: true,
      detail:
        "Recheck: no discrepancy detected for routing. The issue stays open until you record a resolution decision.",
      scope: "Apparent duct routing west of grid C-12",
      limits: "Clearance measurements and fire-protection sign-off",
      condition: "Fire-protection subcontractor confirmation is not recorded.",
      checks: [
        check("Apparent duct routing", "ok"),
        check("Sprinkler branch visibility", "insufficient"),
        check("Clearance distance", "unsupported", "No check"),
      ],
      due: "2026-10-06T17:00",
      resolution:
        "Route west of grid C-12; provide doorway and chase photos; record fire-protection confirmation.",
    }),
    item({
      id: "CORE-14",
      unit: "Core",
      title: "Firestop at penetrations P-01 to P-06",
      trade: "Firestop",
      owner: "Alpha Firestop · Kai Lee",
      status: "unsupported",
      reference: "FP-214 Rev 1",
      update: "UPD-2297",
      time: "13:30",
      coverage: "No supported check",
      detail:
        "No released check for this work type. Route to a qualified reviewer.",
      checks: [check("Firestop installation", "unsupported", "Not supported")],
    }),
    item({
      id: "ELEC-406",
      unit: "406",
      title: "Electrical boxes · bedroom 2",
      trade: "Electrical",
      owner: "Volt Electric · Derrick Hall",
      status: "evidence",
      reference: "E-14 Rev B",
      update: "UPD-2292",
      time: "08:19",
      image: "wall-unit-406.jpg",
      coverage: "2 of 4 expected boxes visible",
      detail:
        "North wall is not in frame. Stand in the doorway and photograph the full north wall, with the window on your right.",
      scope: "Visible box presence and wall association",
      limits: "Exact heights, hidden wiring and electrical performance",
      claimed: "Done",
      checks: [
        check("Boxes 3 and 4 visible", "ok", "Shadow mode"),
        check("Boxes 1 and 2, north wall", "insufficient", "Shadow mode"),
        check("Box heights", "unsupported", "No check"),
      ],
    }),
    item({
      id: "ELEC-408",
      unit: "408",
      title: "Electrical sub-panel",
      trade: "Electrical",
      owner: "Volt Electric · Derrick Hall",
      status: "failed",
      reference: "E-14 Rev B",
      update: "UPD-2296",
      time: "12:02",
      processing: "failed",
      coverage: "Not assessed",
      detail:
        "The sample analysis timed out. Evidence remains stored; retry requires review.",
      checks: [],
    }),
    item({
      id: "PLUMB-402",
      unit: "402",
      title: "Plumbing rough-in · bath",
      trade: "Plumbing",
      owner: "River Plumbing · Nina Patel",
      status: "ai",
      reference: "P-201 Rev 2",
      update: "UPD-2294",
      time: "10:07",
      image: "plumbing-unit-402.jpg",
      progress: "AI-checked complete",
      review: "Not requested",
      inspection: "Requested · Oct 8 · sample record",
      detail:
        "Visible supply and drain components present; apparent routing matches the plan.",
      scope: "Visible components and apparent routing",
      checks: [
        check(
          "Supply and drain stubs at four fixture locations",
          "ok",
          "Fixture auto-completion",
        ),
        check("Apparent routing", "ok", "Fixture auto-completion"),
      ],
    }),
    item({
      id: "PUNCH-302",
      unit: "302",
      level: 3,
      title: "Punch P-118 · hall-closet paint touch-up",
      trade: "Finishes",
      owner: "Northline Finishes · Ana Ortiz",
      status: "ai",
      reference: "Punch list P-118",
      update: "UPD-2295",
      time: "11:24",
      progress: "AI-checked complete",
      review: "Not requested",
      detail:
        "Marked area is visible; no unfinished patch detected in the sample result.",
      scope: "Visible resolution of punch item P-118",
      limits: "Paint specification, adhesion and hidden surface conditions",
      checks: [
        check("Marked patch visibly complete", "ok", "Fixture auto-completion"),
      ],
    }),
    item({
      id: "FRAME-407",
      unit: "407",
      title: "Framing reopened after reference change",
      trade: "Framing",
      owner: "Titan Framing · Carlos Diaz",
      status: "review",
      reference: "A-402 Rev C",
      time: "Oct 5",
      detail:
        "Rev C supersedes Rev B. The earlier completion remains in history; new evidence is needed.",
      coverage: "Evidence predates current revision",
      checks: [check("Opening placement against Rev C", "insufficient")],
    }),
    item({
      id: "HVAC-401",
      unit: "401",
      title: "Visible duct presence",
      trade: "HVAC",
      owner: "Apex Mechanical · Marco Rossi",
      status: "ai",
      reference: "M-402 Rev 3",
      time: "Oct 4",
      progress: "AI-checked complete",
      review: "Not requested",
      checks: [check("Duct presence", "ok", "Fixture auto-completion")],
    }),
    item({
      id: "PLUMB-405",
      unit: "405",
      title: "Visible plumbing components",
      trade: "Plumbing",
      owner: "River Plumbing · Nina Patel",
      status: "ai",
      reference: "P-201 Rev 2",
      time: "Oct 2",
      progress: "AI-checked complete",
      review: "Not requested",
      checks: [check("Visible components", "ok", "Fixture auto-completion")],
    }),
    item({
      id: "ELEC-405",
      unit: "405",
      title: "Electrical rough-in",
      trade: "Electrical",
      owner: "Volt Electric · Derrick Hall",
      status: "human",
      reference: "E-14 Rev B",
      time: "Oct 4",
      progress: "Human accepted",
      review: "Sarah Jenkins · checked on site walk",
      checks: [check("Box presence", "ok", "Shadow mode")],
    }),
    item({
      id: "ISS-028",
      unit: "404",
      title: "Pipe route needs correction",
      trade: "Plumbing",
      owner: "River Plumbing · Nina Patel",
      status: "issue",
      issue: "ISS-028",
      reference: "P-201 Rev 2",
      time: "Oct 3",
      detail: "Confirmed routing discrepancy; awaiting correction evidence.",
      checks: [check("Apparent pipe route", "discrepancy")],
      resolution: "Correct the visible route and submit context photos.",
    }),
    item({
      id: "PLAN-401",
      unit: "401",
      title: "Framing · next work package",
      trade: "Framing",
      owner: "Titan Framing · Carlos Diaz",
      status: "none",
      reference: "A-402 Rev C",
      coverage: "No evidence",
      progress: "Not assessed",
      review: "Not requested",
      checks: [],
    }),
    item({
      id: "PLAN-408",
      unit: "408",
      title: "Plumbing · next work package",
      trade: "Plumbing",
      owner: "River Plumbing · Nina Patel",
      status: "none",
      reference: "P-201 Rev 2",
      coverage: "No evidence",
      progress: "Not assessed",
      review: "Not requested",
      checks: [],
    }),
  ];
  return {
    version: 1,
    items,
    draft: null,
    projectName: "Hawthorne Tower",
    reportNote: "",
    reportSigned: null,
    events: [
      ...items
        .filter((i) => i.status === "ai" && i.time === "Oct 4")
        .map((i) => ({
          id: `baseline-${i.id}`,
          item: i.id,
          at: "2026-10-04T15:00:00",
          actor: "Fixture check",
          text: `${i.title} — scoped sample completion recorded.`,
          tone: i.status,
        })),
      {
        id: "seed-1",
        item: "FRAME-407",
        at: "2026-10-05T16:10:00",
        actor: "Sarah Jenkins",
        text: "A-402 Rev C approved. Unit 407 reopened; earlier decision retained.",
        tone: "review",
      },
      ...items
        .filter((i) => i.update)
        .map((i) => ({
          id: `seed-${i.id}`,
          item: i.id,
          at: `2026-10-06T${i.time}:00`,
          actor: "Fixture check",
          text: `${i.update}: ${i.title} — ${LABELS[i.status]}`,
          tone: i.status,
        })),
    ],
  };
}
export type Action =
  | { type: "plan"; item: WorkItem }
  | { type: "draft"; draft: Draft | null }
  | { type: "submit"; draft: Draft; offline: boolean; sample: boolean }
  | { type: "sync" }
  | {
      type:
        | "accept"
        | "reopen"
        | "dismiss"
        | "request"
        | "resolve"
        | "reject"
        | "retry"
        | "assign"
        | "reference";
      id: string;
      reason: string;
      owner?: string;
      due?: string;
    }
  | { type: "confirm"; id: string; owner: string; due: string; reason: string }
  | { type: "project"; name: string }
  | { type: "report"; note: string; sign: boolean };

export function transition(
  state: WorkspaceState,
  action: Action,
  now = new Date().toISOString(),
): WorkspaceState {
  // Capture keystrokes must not rebuild model colors/markers or clone every evidence image.
  if (action.type === "draft")
    return {
      ...state,
      draft: action.draft ? structuredClone(action.draft) : null,
    };
  const next = structuredClone(state);
  const record = (work: WorkItem, text: string, actor = "Sarah Jenkins") => {
    next.events.unshift({
      id: crypto.randomUUID(),
      item: work.id,
      at: now,
      actor,
      text,
      tone: work.status,
    });
  };
  if (action.type === "plan") {
    const item = action.item;
    if (!state.modelApproved || item.location?.version !== state.modelVersion)
      throw new Error("Confirm this work against the current project model.");
    if (
      !item.title.trim() ||
      !item.owner.trim() ||
      !item.location?.elements.length
    )
      throw new Error("Work title, owner and model location are required.");
    if (
      item.status !== "none" ||
      item.photos.length ||
      item.checks.length ||
      item.issue
    )
      throw new Error(
        "New planned work cannot contain reviewed progress or evidence.",
      );
    if (
      next.items.some(
        (i) =>
          i.id === item.id ||
          i.location?.elements.some((e) => item.location!.elements.includes(e)),
      )
    )
      throw new Error("This component already has tracked work.");
    next.items.push(structuredClone(item));
    record(
      item,
      `Planned work added: ${item.title}. No field evidence received.`,
    );
    return next;
  }
  if (action.type === "project") {
    if (!action.name.trim()) throw new Error("Project name is required.");
    next.projectName = action.name.trim();
    return next;
  }
  if (action.type === "report") {
    if (state.reportSigned)
      throw new Error("This report is signed. Its record is locked.");
    next.reportNote = action.note;
    if (action.sign) {
      next.reportSigned = now;
      next.reportSnapshot = reportText(next);
    }
    return next;
  }
  if (action.type === "sync") {
    next.assessmentJobs
      ?.filter((j) => j.state === "queued_offline")
      .forEach((j) => {
        j.state = "awaiting_agent";
      });
    next.items
      .filter((i) => i.processing === "queued")
      .forEach((i) => {
        i.processing = "review";
        i.status = i.issue ? "issue" : "review";
        i.detail =
          "Saved in this local demo. Awaiting manual review; no live AI or server upload.";
        record(
          i,
          `${i.update} moved from local queue to demo review.`,
          "Demo system",
        );
      });
    return next;
  }
  const work = next.items.find(
    (i) => i.id === ("draft" in action ? action.draft.item : action.id),
  );
  if (!work) throw new Error("Work item not found.");
  if (action.type === "submit") {
    if (
      state.modelVersion &&
      (!state.modelApproved ||
        work.location?.version !== state.modelVersion ||
        !work.location.elements.length)
    )
      throw Error(
        "Approve the model and confirm this work location before submitting.",
      );
    if (!action.draft.photos.length)
      throw new Error("Attach a photo before submitting.");
    next.assessmentJobs
      ?.filter(
        (j) =>
          j.item === work.id &&
          ["queued_offline", "awaiting_agent"].includes(j.state),
      )
      .forEach((j) => {
        j.state = "superseded";
      });
    work.assessments = [
      ...(work.assessments || []),
      {
        update: work.update,
        reference: work.reference,
        checks: structuredClone(work.checks),
        coverage: work.coverage,
        progress: work.progress,
        photos: structuredClone(work.photos),
        at: now,
      },
    ];
    work.photos.push(...action.draft.photos);
    work.claimed = action.draft.claim;
    work.checks = [];
    work.review = "Awaiting review of new evidence";
    work.correction = !!work.issue;
    work.dismissed = false;
    work.update = `UPD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    work.time = new Date(now).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (action.offline) {
      work.processing = "queued";
      work.status = work.issue ? "issue" : "review";
      work.coverage = "New evidence on this device only";
      work.progress = "Not assessed";
      work.detail =
        "On this device only. Reconnect to move this update into local demo review.";
    } else if (
      action.sample &&
      action.draft.photos.every((p) => p.sample) &&
      (work.fixture || initialState().items.some((i) => i.id === work.id))
    ) {
      const fixture =
        work.fixture || initialState().items.find((i) => i.id === work.id)!;
      work.checks = structuredClone(fixture.checks).map((c) =>
        work.issue && c.result === "discrepancy" ? { ...c, result: "ok" } : c,
      );
      work.processing = "completed";
      work.coverage =
        work.id === "ELEC-406"
          ? work.location
            ? "Insufficient sample coverage for the linked component"
            : "2 of 4 boxes visible"
          : "Adequate for fixture checks";
      if (work.issue) {
        work.correction = true;
        work.status = "issue";
        work.progress = "Correction awaiting acceptance";
        work.detail =
          "Sample correction rechecked. Explicit resolution is still required.";
      } else if (
        work.fixture?.complete ||
        (!work.fixture && (work.id === "PLUMB-402" || work.id === "PUNCH-302"))
      ) {
        work.status = "ai";
        work.progress = "AI-checked complete";
        work.review = "Not requested";
      } else if (work.id === "ELEC-406") work.status = "evidence";
      else {
        work.status = "review";
        work.progress = "Partial";
      }
    } else {
      work.processing = "review";
      work.status = work.issue ? "issue" : "review";
      work.progress = "Not assessed";
      work.coverage = "Awaiting review";
      work.detail =
        "Uploaded photo saved locally. No AI analysis has been performed.";
    }
    record(
      work,
      `${work.update} submitted: ${action.draft.note || "Photo update"} · worker claim: ${work.claimed || "Not specified"}. ${action.sample ? "Sample simulation requested." : "Manual review required."}`,
      "Field worker",
    );
    if (work.location) {
      next.assessmentJobs ||= [];
      next.assessmentJobs.unshift({
        id: crypto.randomUUID(),
        update: work.update,
        item: work.id,
        modelVersion: work.location.version,
        elements: [...work.location.elements],
        photos: action.draft.photos.map((p) => p.id),
        note: action.draft.note,
        claim: action.draft.claim,
        reference: work.reference,
        scope: work.scope,
        state: action.offline
          ? "queued_offline"
          : action.sample && action.draft.photos.every((p) => p.sample)
            ? work.processing === "completed" && work.checks.length > 0
              ? "fixture_complete"
              : "manual_review"
            : "awaiting_agent",
        at: now,
      });
    }
    next.draft = null;
    return next;
  }
  if (!action.reason.trim())
    throw new Error("Record a reason for this decision.");
  if (
    work.processing === "queued" &&
    ["accept", "resolve", "retry"].includes(action.type)
  )
    throw new Error(
      "Queued evidence has not been reviewed. Sync it before making this decision.",
    );
  switch (action.type) {
    case "confirm":
      if (work.issue) throw new Error("This finding already has an issue.");
      if (!action.owner.trim() || !action.due)
        throw new Error("Owner and due date are required.");
      work.issue = `ISS-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
      work.status = "issue";
      work.owner = action.owner;
      work.due = action.due;
      work.resolution = action.reason;
      work.review = "Confirmed by Sarah Jenkins";
      break;
    case "accept":
      if (work.issue)
        throw new Error("Resolve the open issue before accepting work.");
      if (!work.photos.length && work.status !== "ai")
        throw new Error("Evidence is required to accept this work.");
      work.status = "human";
      work.progress = "Human accepted";
      work.review = "Accepted by Sarah Jenkins";
      break;
    case "resolve":
      if (!work.issue || !work.correction)
        throw new Error("Correction evidence must be submitted first.");
      work.status = "human";
      work.progress = "Human accepted";
      work.review = "Correction accepted by Sarah Jenkins";
      work.issue = undefined;
      work.correction = false;
      break;
    case "dismiss":
      if (work.issue)
        throw new Error(
          "Use the issue-resolution workflow for confirmed issues.",
        );
      work.status = "review";
      work.dismissed = true;
      work.review = "Finding dismissed by Sarah Jenkins";
      work.detail =
        "Finding dismissed with a reason. Completion still requires sufficient evidence.";
      break;
    case "request":
      work.status = work.issue ? "issue" : "evidence";
      work.detail = action.reason;
      work.review = "Additional evidence requested";
      break;
    case "reject":
      work.status = work.issue ? "issue" : "review";
      work.correction = false;
      work.review = "Correction rejected";
      break;
    case "retry":
      work.status = "review";
      work.processing = "review";
      work.detail =
        "Sample retry moved to manual review. No AI check has been performed.";
      break;
    case "assign":
      if (action.owner !== undefined) {
        if (
          !action.owner.trim() ||
          !action.due ||
          !/^\d{4}-\d{2}-\d{2}$/.test(action.due)
        )
          throw Error("Owner and due date are required.");
        work.owner = action.owner.trim();
        work.due = action.due;
      }
      work.review = `Assignment updated: ${action.reason}`;
      break;
    case "reopen":
      work.status = work.issue ? "issue" : "review";
      work.progress = "Partial";
      work.review = "Reopened by Sarah Jenkins";
      break;
  }
  next.assessmentJobs
    ?.filter((j) => j.item === work.id && j.update === work.update)
    .forEach((j) => {
      j.state = "manual_review";
    });
  record(
    work,
    `${action.type}: ${action.reason}${action.type === "assign" && action.owner ? ` · owner ${work.owner} · due ${work.due}` : ""}`,
  );
  return next;
}
export function loadState(key = STORE_KEY): WorkspaceState {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (
      value?.version === 1 &&
      typeof value.projectName === "string" &&
      Array.isArray(value.items) &&
      value.items.every(
        (i: WorkItem) =>
          i &&
          typeof i.id === "string" &&
          i.status in LABELS &&
          Array.isArray(i.photos) &&
          Array.isArray(i.checks),
      ) &&
      Array.isArray(value.events)
    )
      return value;
  } catch {
    /* Restore usable sample state if local data is unavailable. */
  }
  return initialState();
}
export function counts(items: WorkItem[]): Record<Status, number> {
  const result = Object.fromEntries(
    Object.keys(LABELS).map((k) => [k, 0]),
  ) as Record<Status, number>;
  items.forEach((i) => result[i.status]++);
  return result;
}
export function reportText(state: WorkspaceState): string {
  if (state.reportSigned && state.reportSnapshot) return state.reportSnapshot;
  const c = counts(state.items);
  return `${state.projectName} — daily record\nFictional project · fixture results · local demo\n\nWORK-ITEM COVERAGE\n${state.items.length} items: ${c.ai} AI-checked complete; ${c.human} human accepted; ${c.issue} open issues; ${c.review} need review; ${c.evidence} need evidence; ${c.failed} failed; ${c.unsupported} unsupported; ${c.none} not assessed.\nCounts are work items, not labor, cost or schedule percentages.\n\nOPEN ITEMS\n${state.items
    .filter((i) => !["ai", "human"].includes(i.status))
    .map(
      (i) =>
        `${i.id} · Unit ${i.unit} · ${i.title} · ${LABELS[i.status]} · ${i.reference}`,
    )
    .join("\n")}\n\nRECENT DECISIONS\n${state.events
    .slice(0, 12)
    .map((e) => `${e.at} · ${e.actor} · ${e.item} · ${e.text}`)
    .join(
      "\n",
    )}\n\nPM NOTE\n${state.reportNote || "No additional note recorded."}\n\nLIMITATIONS\nWeather, crew hours and costs were not reported. No inspection is inferred from AI results. No live notifications or AI checks were sent.\n${state.reportSigned ? `Signed locally by Sarah Jenkins at ${state.reportSigned}` : "Unsigned draft"}`;
}
