import { createContext, useContext } from "react";
import type { Action, WorkItem, WorkspaceState } from "./state";

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
  state: WorkspaceState;
  act: (action: Action) => boolean;
  decide: (item: WorkItem, type: Decision["type"]) => void;
  online: boolean;
}
export const WorkspaceContext = createContext<Context | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Missing workspace");
  return value;
}
