import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, tokenStore } from "../api/client";
import type { Member, User, Notification } from "../api/types";
import type { Action, Draft, WorkspaceState, WorkItem } from "./state";
import { getDraft, pendingUpdates, saveDraft, queueWorkUpdate, syncWorkUpdates, type PendingWorkUpdate } from "./workflowQueue";
import type { ModelDataset } from "../viewer/modelData";
import { createLocalBridge } from "./localBridge";

export interface WorkSnapshot {
  state: WorkspaceState;
  user: User;
  role: "pm" | "owner" | "trade" | "viewer";
  permissions: { review: boolean; capture: boolean; plan: boolean };
}
export function useConnectedWork(model: ModelDataset, changed: (state: WorkspaceState) => void, message: (text: string) => void) {
  const project = model.source.apiProjectId;
  const [snapshot, setSnapshot] = useState<WorkSnapshot | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [queue, setQueue] = useState<PendingWorkUpdate[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef(true), draft = useRef<Draft | null>(null), actor = useRef<string | null>(null);
  const saving = useRef(false);
  const loading = useRef<Promise<void> | null>(null);
  const generation = useRef(0);
  // Buildings drawn from their bundled copy exchange work records through IFC GUIDs.
  const bridge = useMemo(() => (project && model.localIds ? createLocalBridge(model, project) : null), [project, model]);
  useEffect(() => { const lifecycle = live; lifecycle.current = true; return () => { lifecycle.current = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!project) return;
    if (loading.current) return loading.current;
    const epoch = generation.current;
    const run = (async () => {
      try {
        const fetched = await api<WorkSnapshot>(`/projects/${project}/workspace`);
        const result = bridge ? { ...fetched, state: await bridge.state(fetched.state) } : fetched;
        if (!live.current || epoch !== generation.current) return;
        // Different accounts never inherit a previous account's in-memory draft.
        if (actor.current !== result.user.id) {
          actor.current = result.user.id;
          draft.current = await getDraft(result.user.id, project) || null;
        }
        if (!live.current || epoch !== generation.current) return;
        setSnapshot(result);
        changed({ ...result.state, draft: draft.current });
        setError("");
        const pending = await pendingUpdates(result.user.id, project);
        if (live.current && epoch === generation.current) setQueue(pending);
        const notices = await api<Notification[]>("/notifications?unread=true");
        if (live.current && epoch === generation.current) setNotifications(notices.filter((n) => n.project_id === project));
      } catch (e) { if (live.current && epoch === generation.current) setError((e as Error).message); }
    })().finally(() => { loading.current = null; });
    loading.current = run;
    return run;
  }, [project, changed, bridge]);
  const sync = useCallback(async () => {
    if (!project || !actor.current) return;
    try { await syncWorkUpdates(actor.current, project); } catch (e) { message((e as Error).message); }
    await refresh();
  }, [project, refresh, message]);
  const refreshMembers = useCallback(async () => {
    if (!project) return;
    const epoch = generation.current;
    const result = await api<Member[]>(`/projects/${project}/members`);
    if (live.current && epoch === generation.current) setMembers(result);
  }, [project]);
  useEffect(() => {
    if (!project) return;
    const kick = () => { if (navigator.onLine && document.visibilityState !== "hidden") void refresh().then(sync); };
    void refresh().then(sync);
    void refreshMembers().catch((e: Error) => setError(e.message));
    const timer = setInterval(kick, 10000);
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    const unsubscribe = tokenStore.subscribe(() => {
      generation.current++;
      draft.current = null; actor.current = null;
      setSnapshot(null); setQueue([]); setMembers([]); setNotifications([]);
      changed({ version: 1, items: [], events: [], draft: null, projectName: model.source.name || "Project", reportNote: "", reportSigned: null });
      loading.current = null;
      if (tokenStore.get()) { void refresh().then(sync); void refreshMembers().catch(() => {}); }
    });
    return () => { clearInterval(timer); unsubscribe(); window.removeEventListener("online", kick); document.removeEventListener("visibilitychange", kick); };
  }, [project, refresh, refreshMembers, sync, changed, model.source.name]);
  const save = useCallback((value: Draft | null) => {
    draft.current = value;
    if (project && actor.current) void saveDraft(actor.current, project, value).catch((e: Error) => message(`Draft could not be saved: ${e.message}`));
  }, [project, message]);
  const toCloud = async (id: string | undefined) => (bridge ? bridge.cloudId(id) : id);
  const commit = async (action: Action, basis?: WorkItem): Promise<boolean> => {
    if (!project || !snapshot || saving.current) return false;
    saving.current = true; setBusy(true);
    try {
      if (action.type === "plan") {
        const item = action.item;
        await api(`/projects/${project}/work`, { method: "POST", json: { id: item.id, title: item.title,
          assignee_id: item.assigneeId, element_id: await toCloud(item.location?.elements[0]), model_version_id: model.version,
          capture_guidance: item.captureGuidance || "Context view and close-up of reported condition" } });
      } else if (action.type === "raise") {
        // Shared records only accept PM-assigned issues: plan the component, then confirm the issue.
        if (!snapshot.permissions.review || !action.owner || !action.due)
          throw Error("Only a project manager can raise a shared issue. Choose who fixes it and when.");
        let id = action.id, revision = 1;
        if (action.item) {
          id = action.item.id;
          await api(`/projects/${project}/work`, { method: "POST", json: { id, title: action.item.title,
            assignee_id: action.owner, element_id: await toCloud(action.item.location?.elements[0]), model_version_id: model.version,
            capture_guidance: action.item.captureGuidance || "Context view and close-up of the reported condition" } });
        } else {
          const item = snapshot.state.items.find((i) => i.id === id);
          if (!item) throw Error("Work item not found.");
          revision = item.serverRevision || 1;
          if (item.update) throw Error("Review this work's latest evidence, then confirm the issue from its record.");
        }
        await api(`/work/${id}/decisions`, { method: "POST", json: { type: "confirm", reason: action.description,
          assignee_id: action.owner, due: action.due, expected_revision: revision, update_id: null } });
        message("Issue raised under your account and pinned on the shared model.");
      } else if (action.type === "submit") {
        const saved = draft.current;
        const same = !saved || saved.clientId === action.draft.clientId;
        await queueWorkUpdate(snapshot.user.id, project, model.version, action.draft, !same);
        if (same) draft.current = null;
        if (navigator.onLine) { try { await syncWorkUpdates(snapshot.user.id, project); } catch { /* durable outbox remains */ } }
        message("Update saved. The outbox shows any photos still waiting for a server receipt.");
      } else if ("id" in action) {
        const item = basis || snapshot.state.items.find((i) => i.id === action.id)!;
        await api(`/work/${item.id}/decisions`, { method: "POST", json: { type: action.type,
          reason: action.reason, assignee_id: action.owner, due: action.due,
          expected_revision: item.serverRevision, update_id: item.update || null,
          ...("assessment" in action && action.assessment ? { assessment_id: action.assessment } : {}) } });
        message("Decision saved under your account. Shared progress is updated.");
      } else throw Error("This action is only available in public samples.");
      await refresh();
      return true;
    } catch (e) {
      message((e as Error).message);
      await refresh();
      return false;
    } finally { saving.current = false; setBusy(false); }
  };
  return { notifications, snapshot, members, refreshMembers, queue, refresh, sync, saveDraft: save, commit, error, busy };
}
export function eligibleMembers(members: Member[], item: WorkItem) {
  return members.filter((m) => m.role === "pm" || m.role === "owner" || (m.role === "trade" && m.trades.includes(item.trade) &&
    (m.zone_ids === null || (!!item.location?.roomId && m.zone_ids.includes(item.location.roomId)))));
}
