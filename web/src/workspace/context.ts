import { createContext, useContext } from "react";
import type { Action, WorkItem, WorkspaceState } from "./state";
import type { ViewRole } from "./viewRoles";
import type { ModelDataset } from "../viewer/modelData";

export interface Decision {
  item: WorkItem;
  type:
    | "accept"
    | "reopen"
    | "dismiss"
    | "request"
    | "resolve"
    | "reject"
    | "retry"
    | "assign";
}
interface Context {
  model: ModelDataset;
  state: WorkspaceState;
  act: (action: Action) => boolean;
  decide: (item: WorkItem, type: Decision["type"]) => void;
  online: boolean;
  view?: ViewRole;
  previewOwner?: string;
  changeView?: (role: ViewRole, owner: string) => void;
}
export const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Missing workspace");
  const view = value.view || "pm";
  const connected = !!value.model.source.apiProjectId;
  return {
    ...value,
    view,
    canReview: !connected && view === "pm",
    canCapture: !connected && view !== "customer",
    canPlan: !connected && view === "pm",
  };
}
