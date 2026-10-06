import { createContext, useContext } from "react";
import type { Action, WorkItem, WorkspaceState } from "./state";
import type { ViewRole } from "./viewRoles";
import type { useConnectedWork } from "./useConnectedWork";
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
  connected?: ReturnType<typeof useConnectedWork>;
  commit?: (action: Action, basis?: WorkItem) => Promise<boolean>;
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
    commit: value.commit || (async (action: Action) => value.act(action)),
    canReview: connected ? !!value.connected?.snapshot?.permissions.review && !value.connected.error && value.online && value.model.version === value.connected.snapshot.state.modelVersion && value.model.source.approvalStatus === "approved" : view === "pm",
    canCapture: connected ? !!value.connected?.snapshot?.permissions.capture && value.model.source.approvalStatus === "approved" && value.connected.snapshot.state.modelVersion === value.model.version : view !== "customer",
    canPlan: connected ? !!value.connected?.snapshot?.permissions.plan && !value.connected.error && value.model.source.approvalStatus === "approved" && value.connected.snapshot.state.modelVersion === value.model.version : view === "pm",
  };
}
