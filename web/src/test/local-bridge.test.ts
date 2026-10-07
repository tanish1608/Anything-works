import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { ModelDataset } from "../viewer/modelData";
import type { WorkItem, WorkspaceState } from "../workspace/state";

const api = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ api }));
const { createLocalBridge } = await import("../workspace/localBridge");

const model = JSON.parse(readFileSync("public/bim-duplex/model.json", "utf8")) as ModelDataset;
const local = model.elements.find((e) => e.zone_id && e.bbox)!;

it("translates cloud work records to bundled IDs and new work back to the project's IDs", async () => {
  api.mockImplementation(async (_path: string, init: { json: { ids: string[]; guids: string[] } }) => ({
    ids: Object.fromEntries(init.json.ids.filter((id) => id === "cloud-1").map((id) => [id, local.ifc_guid])),
    guids: Object.fromEntries(init.json.guids.filter((g) => g === local.ifc_guid).map((g) => [g, "cloud-1"])),
  }));
  const bridge = createLocalBridge(model, "p1");
  const work = { id: "W1", title: "Outlet", location: { version: "v", building: "B", levelId: "cloud-level", levelName: "L1",
    roomId: "cloud-room", roomName: "Room", spaceCode: "", elements: ["cloud-1"], anchor: [0, 0, 0] } } as unknown as WorkItem;
  const state = await bridge.state({ version: 1, items: [work], events: [{ id: "e", item: "W1", at: "", actor: "", text: "", tone: "none",
    snapshot: work }], draft: null, projectName: "", reportNote: "", reportSigned: null, assessmentJobs: [] } as WorkspaceState);
  const loc = state.items[0].location!;
  expect(loc.elements).toEqual([local.id]);
  expect(loc.levelId).toBe(local.level_id);
  expect(loc.roomId).toBe(local.zone_id);
  expect(state.events[0].snapshot!.location!.elements).toEqual([local.id]);
  expect(await bridge.cloudId(local.id)).toBe("cloud-1");
});
