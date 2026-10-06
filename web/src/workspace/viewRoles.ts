import type { WorkspaceState } from "./state";

export type ViewRole = "pm" | "customer" | "subcontractor" | "worker";
export const VIEW_ROLES: { id: ViewRole; label: string }[] = [
  { id: "pm", label: "Project manager" },
  { id: "customer", label: "Customer / owner" },
  { id: "subcontractor", label: "Subcontractor lead" },
  { id: "worker", label: "Field worker" },
];
/** Presentation preview on public records. Private access remains enforced by the API. */
export function viewState(
  state: WorkspaceState,
  role: ViewRole,
  owner: string,
) {
  if (role === "pm" || role === "customer") return state;
  const items = state.items.filter((i) => i.owner === owner);
  const ids = new Set(items.map((i) => i.id));
  return {
    ...state,
    items,
    events: state.events.filter((e) => ids.has(e.item)),
    assessmentJobs: state.assessmentJobs?.filter((j) => ids.has(j.item)),
    draft: state.draft && ids.has(state.draft.item) ? state.draft : null,
  };
}
