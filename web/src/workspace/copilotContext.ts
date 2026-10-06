import { locationLabel } from "./projectState";
import { LABELS, type WorkspaceState } from "./state";

const clip = (value: string | undefined, n = 140) => (value || "").slice(0, n);

/** Visible public-sample records for the copilot; partial, local and unauthenticated by design. */
export function sampleContext(state: WorkspaceState, selected?: string) {
  const items = [...state.items].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  const packet = {
    provenance: "browser-local sample records; not authenticated project evidence",
    project: clip(state.projectName),
    work: items.map((i) => ({
      id: i.id, title: clip(i.title), trade: i.trade, owner: clip(i.owner, 60), status: LABELS[i.status],
      location: locationLabel(i), due: i.due, open_issue: !!i.issue, review: clip(i.review, 100),
    })),
    recent_events: state.events.slice(0, 8).map((e) => ({ work: e.item, at: e.at, actor: e.actor, text: clip(e.text, 160) })),
  };
  while (JSON.stringify(packet).length > 5800 && (packet.recent_events.length || packet.work.length > 1)) {
    if (packet.recent_events.length) packet.recent_events.pop();
    else packet.work.pop();
  }
  return JSON.stringify(packet);
}

