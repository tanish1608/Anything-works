import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { Blob as NativeBlob } from "node:buffer";
import { useEffect, type ComponentProps } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tokenStore } from "../api/client";
import { AppRoutes } from "../App";
import type ProjectScene from "../viewer/ProjectScene";
import type { ModelDataset } from "../viewer/modelData";
import { plannedComponent } from "../workspace/projectState";
import { pendingUpdates } from "../workspace/workflowQueue";
import { COLORS, type WorkspaceState } from "../workspace/state";

const original = JSON.parse(readFileSync("public/bim-duplex/model.json", "utf8")) as ModelDataset;
const component = original.elements.find((e) => e.trade === "plumbing" && e.zone_id)!;
const data: ModelDataset = { ...original, elements: [component], version: "shared-baseline",
  source: { ...original.source, name: "Shared construction", slug: "private:account:shared", apiProjectId: "shared", approvalStatus: "approved" } };
const scene = vi.hoisted(() => ({ last: null as ComponentProps<typeof ProjectScene> | null, mounts: 0 }));
vi.mock("../viewer/authorizedModel", async (load) => ({ ...(await load<typeof import("../viewer/authorizedModel")>()), loadAuthorizedModel: async () => ({ model: data }) }));
vi.mock("../viewer/ProjectScene", () => ({ default: function Scene(props: ComponentProps<typeof ProjectScene>) {
  scene.last = props; useEffect(() => { scene.mounts++; }, []);
  return <div data-testid="shared-scene"><button onClick={() => props.onSelect?.(component.id)}>Select source component</button>
    {props.markers.map((m) => <button key={m.id} onClick={() => props.onMarker?.(m.id)}>Open work {m.id}</button>)}</div>;
} }));
vi.mock("../workspace/photoInput", () => ({ readPhoto: async (file: File) => ({ id: file.name, name: file.name, sample: false, url: "data:image/jpeg;base64,dGVzdA==" }) }));
let state: WorkspaceState;
let actor: "pm" | "crew" | "viewer" = "pm";
const requests: { path: string; init?: RequestInit; actor: string }[] = [];
const people = [ { id: "member-pm", role: "owner", trades: [], zone_ids: null, user: { id: "pm", name: "Alex", email: "alex@example.com" } },
  { id: "member-crew", role: "trade", trades: ["plumbing"], zone_ids: null, user: { id: "crew", name: "Maya", email: "maya@example.com" } } ];
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
function mount(panel = "issues", work?: string) {
  tokenStore.set({ access_token: actor, refresh_token: "r" });
  return render(<MemoryRouter initialEntries={[`/?project=api:shared&panel=${panel}${work ? `&work=${work}` : ""}`]}><AppRoutes /></MemoryRouter>);
}
beforeEach(async () => {
  localStorage.clear(); requests.length = 0; scene.mounts = 0; actor = "pm";
  state = { version: 1, items: [], events: [], draft: null, projectName: "Shared construction", reportNote: "", reportSigned: null,
    modelVersion: data.version, modelApproved: true, assessmentJobs: [] };
  // JSDOM lacks Blob structured-clone and stream support; use Node's native multipart constructor.
  vi.stubGlobal("Blob", NativeBlob);
  const form = await new Response("a=b", { headers: { "content-type": "application/x-www-form-urlencoded" } }).formData();
  vi.stubGlobal("FormData", form.constructor);
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const path = String(url);
    if (path.startsWith("data:")) return new Response("actual bytes", { headers: { "content-type": "image/jpeg" } });
    const authenticated = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") || actor;
    requests.push({ path, init, actor: authenticated });
    if (path === "/api/auth/me") return response(people.find((p) => p.user.id === authenticated)?.user || { id: "viewer", name: "Customer" });
    if (path === "/api/projects/shared/workspace") return response({ state, user: people.find((p) => p.user.id === authenticated)?.user || { id: "viewer", name: "Customer" },
      role: authenticated === "pm" ? "owner" : authenticated === "crew" ? "trade" : "viewer",
      permissions: { review: authenticated === "pm", plan: authenticated === "pm", capture: authenticated !== "viewer" } });
    if (path === "/api/projects/shared/members") return response(people);
    if (path.startsWith("/api/notifications")) return response([]);
    if (path.startsWith("/api/elements/")) return response({ ...component, props: {}, history: [] });
    if (path.startsWith("/api/photos/")) return new Response("private image", { headers: { "content-type": "image/jpeg" } });
    if (path === "/api/projects/shared/work" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const work = plannedComponent(data, body.element_id, body.title, "Maya");
      Object.assign(work, { id: body.id, assigneeId: body.assignee_id, serverRevision: 1, captureGuidance: body.capture_guidance });
      state.items = [work]; return response(work);
    }
    const work = state.items[0];
    if (path.endsWith("/updates")) {
      const body = init!.body as FormData;
      expect(body.get("captured_by")).toBe(authenticated);
      const id = `received-${state.assessmentJobs!.length}`;
      Object.assign(work, { serverRevision: work.serverRevision! + 1, update: id, status: work.issue ? "issue" : "review", processing: "review", correction: !!work.issue,
        photos: [...work.photos, { id, url: `/api/photos/${id}`, name: "Field photo", sample: false }], coverage: "Awaiting review", review: "Awaiting review" });
      state.assessmentJobs!.unshift({ id, update: id, item: work.id, modelVersion: data.version, elements: [component.id], photos: [id], state: "manual_review", at: new Date().toISOString() });
      return response({ upload_id: id, received: true });
    }
    if (path.endsWith("/decisions")) {
      const body = JSON.parse(String(init!.body));
      expect(body.expected_revision).toBe(work.serverRevision); expect(body.update_id).toBe(work.update);
      expect(authenticated).toBe("pm");
      Object.assign(work, { serverRevision: work.serverRevision! + 1, review: `Reviewed by Alex` });
      if (body.type === "confirm") Object.assign(work, { issue: "issue-shared", status: "issue", correction: false, due: body.due, owner: "Maya", resolution: body.reason });
      if (body.type === "resolve") { work.status = "human"; delete work.issue; work.correction = false; work.progress = "Human accepted"; }
      state.events.unshift({ id: String(state.events.length), item: work.id, actor: "Alex", tone: work.status, text: body.reason, at: new Date().toISOString() });
      return response(work);
    }
    throw Error(`Unexpected connected route ${path}`);
  }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:private-evidence"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("connects the chosen UI across separate crew and PM mounts without sharing a local work store", async () => {
  let app = mount();
  await screen.findByText("No assigned work records yet");
  await userEvent.click(screen.getByRole("button", { name: "Select source component" }));
  await userEvent.click(await screen.findByRole("button", { name: "Track work here" }));
  await userEvent.selectOptions(screen.getByLabelText("Responsible person or team"), "crew");
  await userEvent.click(screen.getByRole("button", { name: "Create work record" }));
  await screen.findByText("Maya");
  const id = state.items[0].id;
  expect(requests.some((r) => r.path === "/api/projects/shared/work")).toBe(true);
  app.unmount(); localStorage.clear(); actor = "crew"; app = mount("capture", id);
  await screen.findByText("Show what changed.");
  expect(screen.queryByText("Use a generated sample to test the workflow")).not.toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("I confirm this is the correct work location."));
  await userEvent.upload(screen.getByLabelText("Upload evidence photos"), new File(["photo"], "field.jpg", { type: "image/jpeg" }));
  await userEvent.type(screen.getByLabelText("What changed?"), "Connection needs review");
  await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await screen.findByText("Project-manager review is required for acceptance and issue resolution.");
  try { await waitFor(() => expect(state.items[0].status).toBe("review")); }
  catch { throw Error(JSON.stringify({ requests: requests.map((r) => [r.path, r.actor]), queue: await pendingUpdates("crew", "shared") })); }
  app.unmount(); localStorage.clear(); actor = "pm"; app = mount("record", id);
  await screen.findByRole("button", { name: "Confirm an issue" });
  await userEvent.click(screen.getByRole("button", { name: "Confirm an issue" }));
  await userEvent.type(screen.getByLabelText("Due date"), "2026-10-07");
  await userEvent.type(screen.getByLabelText("Decision reason"), "Correct connection and submit fresh photos");
  await userEvent.click(screen.getByRole("button", { name: "Save decision" }));
  await waitFor(() => expect(scene.last!.colors.get(component.id)).toBe(COLORS.issue));
  expect(requests.some((r) => r.path.startsWith("/api/photos/") && r.actor === "pm")).toBe(true);
  app.unmount(); localStorage.clear(); actor = "crew"; app = mount("capture", id);
  await screen.findByText("Show what changed.");
  await userEvent.click(screen.getByLabelText("I confirm this is the correct work location."));
  await userEvent.upload(screen.getByLabelText("Upload evidence photos"), new File(["after"], "after.jpg", { type: "image/jpeg" }));
  await userEvent.type(screen.getByLabelText("What changed?"), "Connection corrected");
  await userEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await screen.findByText("Project-manager review is required for acceptance and issue resolution.");
  expect(state.items[0].status).toBe("issue");
  app.unmount(); localStorage.clear(); actor = "pm"; app = mount("record", id);
  await userEvent.click(await screen.findByRole("button", { name: "Accept correction & resolve" }));
  await userEvent.type(screen.getByLabelText("Decision reason"), "Fresh correction reviewed against approved reference");
  await userEvent.click(screen.getByRole("button", { name: "Save decision" }));
  await waitFor(() => expect(scene.last!.colors.get(component.id)).toBe(COLORS.human));
  expect(state.items[0].photos).toHaveLength(2);
  expect(localStorage.getItem("everything-works-project-v2:project:private:account:shared")).toBeNull();
  expect(scene.mounts).toBe(5); // one viewer in each separate user session, not one per panel
}, 15000);

it("makes actual viewer access read-only and exposes the real project membership", async () => {
  actor = "viewer"; mount();
  await screen.findByText("No assigned work records yet");
  expect(screen.getByRole("button", { name: "New update" })).toBeDisabled();
  await userEvent.click(screen.getByLabelText("Open project menu"));
  await userEvent.click(screen.getByRole("menuitem", { name: "Project team" }));
  expect(await screen.findByText("maya@example.com")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add teammate" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Preview user experience")).not.toBeInTheDocument();
});
