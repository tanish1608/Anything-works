import { api } from "../api/client";
import type { ModelDataset } from "../viewer/modelData";
import { ifcPointToViewer } from "../viewer/spatialMath";
import type { WorkItem, WorkspaceState } from "./state";

/**
 * Work records from the cloud use the project's own element IDs; a building drawn from its bundled copy uses
 * bundled IDs. Both come from the same IFC GUIDs, so translate the few components that work refers to.
 */
export function createLocalBridge(model: ModelDataset, projectId: string) {
  const byGuid = new Map(model.elements.map((e) => [e.ifc_guid, e]));
  const byLocal = new Map(model.elements.map((e) => [e.id, e]));
  const cloudToGuid = new Map<string, string>();
  const guidToCloud = new Map<string, string>();

  async function lookup(ids: string[], guids: string[]) {
    const needIds = [...new Set(ids)].filter((id) => !cloudToGuid.has(id) && !byLocal.has(id));
    const needGuids = [...new Set(guids)].filter((g) => !guidToCloud.has(g));
    for (let i = 0; i < Math.max(needIds.length, needGuids.length); i += 500) {
      const r = await api<{ ids: Record<string, string>; guids: Record<string, string> }>(
        `/projects/${projectId}/element-guids`,
        { method: "POST", json: { ids: needIds.slice(i, i + 500), guids: needGuids.slice(i, i + 500) } },
      );
      for (const [id, guid] of Object.entries(r.ids)) { cloudToGuid.set(id, guid); guidToCloud.set(guid, id); }
      for (const [guid, id] of Object.entries(r.guids)) { guidToCloud.set(guid, id); cloudToGuid.set(id, guid); }
    }
  }

  const localOf = (cloudId: string) => byGuid.get(cloudToGuid.get(cloudId) || "") || byLocal.get(cloudId);

  function item<T extends Partial<WorkItem>>(work: T): T {
    const loc = work.location;
    if (!loc) return work;
    const elements = loc.elements.map((id) => localOf(id));
    const first = elements[0];
    if (!first) return work;
    const b = first.bbox;
    return {
      ...work,
      location: {
        ...loc,
        elements: elements.map((e, i) => e?.id ?? loc.elements[i]),
        levelId: first.level_id || loc.levelId,
        roomId: first.zone_id ?? loc.roomId,
        anchor: b ? ifcPointToViewer([(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]) : loc.anchor,
      },
    };
  }

  return {
    /** Rewrite a cloud workspace snapshot to bundled IDs. */
    async state(state: WorkspaceState): Promise<WorkspaceState> {
      const ids = [
        ...state.items.flatMap((i) => i.location?.elements ?? []),
        ...state.events.flatMap((e) => e.snapshot?.location?.elements ?? []),
        ...(state.assessmentJobs ?? []).flatMap((j) => j.elements),
      ];
      try {
        await lookup(ids, []);
      } catch {
        // Lookup unavailable: keep the records (lists still work); untranslated items just lack model pins.
      }
      return {
        ...state,
        items: state.items.map((i) => item(i)),
        events: state.events.map((e) => (e.snapshot ? { ...e, snapshot: item(e.snapshot) } : e)),
        assessmentJobs: state.assessmentJobs?.map((j) => ({ ...j, elements: j.elements.map((id) => localOf(id)?.id ?? id) })),
      };
    },
    /** A bundled element ID -> this project's element ID, for requests that create work. */
    async cloudId(localId: string | undefined): Promise<string | undefined> {
      const guid = localId ? byLocal.get(localId)?.ifc_guid : undefined;
      if (!guid) return localId;
      await lookup([], [guid]);
      return guidToCloud.get(guid) ?? localId;
    },
  };
}
