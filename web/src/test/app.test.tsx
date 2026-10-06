import { readFileSync } from "node:fs";
import { useEffect, type ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../App";
import type ProjectScene from "../viewer/ProjectScene";
import type { ModelDataset } from "../viewer/modelData";
import { COLORS, STORE_KEY, type WorkspaceState } from "../workspace/state";
import {
  projectStorageKey,
  initialProjectState,
  plannedComponent,
} from "../workspace/projectState";

const model = JSON.parse(
  readFileSync("public/bim-duplex/model.json", "utf8"),
) as ModelDataset;
const apartment = JSON.parse(
  readFileSync("public/bim-schependomlaan/model.json", "utf8"),
) as ModelDataset;
const scene = vi.hoisted(() => ({
  mount: vi.fn(),
  dispose: vi.fn(),
  last: null as ComponentProps<typeof ProjectScene> | null,
}));
vi.mock("../viewer/modelData", async (original) => ({
  ...(await original<typeof import("../viewer/modelData")>()),
  loadDemoModel: async () => model,
  loadPublicProject: async (id: string) =>
    id === "duplex" ? model : apartment,
}));
vi.mock("../workspace/photoInput", () => ({
  readPhoto: async (file: File) => ({
    id: "uploaded-photo",
    url: "data:image/jpeg;base64,dGVzdA==",
    sample: false,
    name: file.name,
  }),
}));
vi.mock("../viewer/ProjectScene", () => ({
  default: function Scene(props: ComponentProps<typeof ProjectScene>) {
    scene.last = props;
    useEffect(() => {
      scene.mount();
      return () => scene.dispose();
    }, []);
    return (
      <div data-testid="project-scene">
        {props.markers.map((m) => (
          <button key={m.id} onClick={() => props.onMarker?.(m.id)}>
            Model pin {m.id}
          </button>
        ))}
        <button onClick={() => props.onSelect?.(model.elements[0].id)}>
          Select untracked component
        </button>
        {props.data.source.slug === "schependomlaan" && (
          <button
            onClick={() =>
              props.onSelect?.(
                props.data.elements.find(
                  (e) => e.ifc_class === "IfcDoor" && e.zone_id,
                )!.id,
              )
            }
          >
            Select apartment component
          </button>
        )}
      </div>
    );
  },
}));
function CurrentUrl() {
  const { pathname, search, hash } = useLocation();
  return (
    <output data-testid="url">
      {pathname}
      {search}
      {hash}
    </output>
  );
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <CurrentUrl />
    </MemoryRouter>,
  );
}
async function switchProject(id: "duplex" | "schependomlaan") {
  await userEvent.click(screen.getByLabelText("Switch building project"));
  await userEvent.click(
    screen.getByRole("button", {
      name: `Preview ${id === "duplex" ? "Duplex Apartment" : "Schependomlaan Apartments"}`,
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Open project" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Open project" }));
}
function saved(): WorkspaceState {
  return JSON.parse(localStorage.getItem(STORE_KEY)!);
}
async function ready() {
  await screen.findByRole(
    "region",
    { name: "Building workspace" },
    { timeout: 5000 },
  );
}
async function menu(name: string) {
  await userEvent.click(screen.getByLabelText("Open project menu"));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}
async function addEvidence() {
  await userEvent.click(
    screen.getByLabelText("I confirm this is the correct work location."),
  );
  await userEvent.upload(
    screen.getByLabelText("Upload evidence photos"),
    new File(["photo"], "field-photo.jpg", { type: "image/jpeg" }),
  );
  await userEvent.type(
    screen.getByLabelText("What changed?"),
    "New connection photo; please review against the source plan.",
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  scene.last = null;
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected network request"),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("one building workspace", () => {
  it("starts a new source project with issues and a direct path to planning work", async () => {
    renderAt("/?project=schependomlaan");
    await ready();
    expect(screen.getByRole("button", { name: "Placeholder AI — building overview" })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Work & issues" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No field updates yet")).toBeInTheDocument();
    expect(screen.queryByText("No matching records")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Explore building work" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Explore building" }),
    ).toBeInTheDocument();
  });
  it("offers existing planned work when attention is empty and preserves explicit panel dismissal on reload", async () => {
    const item = plannedComponent(
      apartment,
      apartment.elements.find((e) => e.ifc_class === "IfcDoor" && e.zone_id)!
        .id,
      "Install room door",
      "Fit-out crew",
    );
    localStorage.setItem(
      projectStorageKey(apartment),
      JSON.stringify({ ...initialProjectState(apartment), items: [item] }),
    );
    const view = renderAt("/?project=schependomlaan");
    await ready();
    expect(screen.getByText("No updates need attention")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Show all work" }),
    );
    expect(
      screen.getByRole("button", { name: /Install room door\./ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Close side panel"));
    expect(screen.getByTestId("url").textContent).toBe(
      "/?project=schependomlaan&panel=none",
    );
    view.unmount();
    renderAt("/?project=schependomlaan&panel=none");
    await ready();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });
  it("replaces the workspace canvas with one showroom preview and restores the original panel on cancel", async () => {
    renderAt("/?panel=issues");
    await ready();
    expect(screen.getAllByTestId("project-scene")).toHaveLength(1);
    await userEvent.click(screen.getByLabelText("Switch building project"));
    await screen.findByRole("main", { name: "Choose building project" });
    await waitFor(() => expect(scene.last!.orbitFit).toBe(true));
    expect(screen.getAllByTestId("project-scene")).toHaveLength(1);
    expect(scene.dispose).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("region", { name: "Building workspace" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Back to building" }),
    );
    await ready();
    expect(screen.getByTestId("url").textContent).toBe("/?panel=issues");
    expect(scene.last!.data).toBe(model);
    expect(screen.getAllByTestId("project-scene")).toHaveLength(1);
  });
  it("keeps apartment work, drafts and decisions separate while switching buildings", async () => {
    renderAt("/");
    await ready();
    await userEvent.click(screen.getByLabelText("Open work and issues"));
    await switchProject("schependomlaan");
    await ready();
    expect(scene.last!.data).toBe(apartment);
    expect(
      screen.getByRole("complementary", { name: "Work & issues" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("url").textContent).toBe(
      "/?project=schependomlaan&panel=issues",
    );
    await userEvent.click(screen.getByRole("button", { name: "New update" }));
    expect(screen.getByText("Choose the work first.")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Select apartment component" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Track work here" }),
    );
    await userEvent.clear(screen.getByLabelText("Work title"));
    await userEvent.type(
      screen.getByLabelText("Work title"),
      "Apartment pipe check",
    );
    await userEvent.type(
      screen.getByLabelText("Responsible person or team"),
      "Apartment plumbing crew",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create work record" }),
    );
    const key = projectStorageKey(apartment);
    const planned = JSON.parse(localStorage.getItem(key)!) as WorkspaceState;
    expect(planned.items).toHaveLength(1);
    expect(planned.items[0]).toMatchObject({
      status: "none",
      photos: [],
      checks: [],
      inspection: "Not recorded",
    });
    expect(planned.items[0].location!.version).toBe(apartment.version);
    await userEvent.click(screen.getByRole("button", { name: "New update" }));
    await addEvidence();
    await userEvent.click(
      screen.getByRole("button", { name: "Submit for review" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Accept reviewed work" }),
    );
    await userEvent.type(
      screen.getByLabelText("Decision reason"),
      "Test review of the scoped evidence.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save decision" }),
    );
    const accepted = JSON.parse(localStorage.getItem(key)!) as WorkspaceState;
    expect(accepted.items[0].status).toBe("human");
    expect(accepted.assessmentJobs![0].state).toBe("manual_review");
    expect(
      scene.last!.colors.get(accepted.items[0].location!.elements[0]),
    ).toBe(COLORS.human);
    await switchProject("duplex");
    await ready();
    expect(scene.last!.data).toBe(model);
    expect(screen.getByTestId("url").textContent).toBe("/?panel=issues");
    await userEvent.click(screen.getByLabelText("Open work and issues"));
    expect(screen.queryByText("Apartment pipe check")).not.toBeInTheDocument();
    await switchProject("schependomlaan");
    await ready();
    await userEvent.click(screen.getByLabelText("Open work and issues"));
    await userEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(screen.getByText("Apartment pipe check")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(key)!).items[0].status).toBe(
      "human",
    );
    await userEvent.click(screen.getByRole("button", { name: "New update" }));
    await userEvent.type(
      screen.getByLabelText("What changed?"),
      "Draft stays in this apartment.",
    );
    await switchProject("duplex");
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "New update" }));
    expect(screen.getByLabelText("What changed?")).not.toHaveValue(
      "Draft stays in this apartment.",
    );
    expect(JSON.parse(localStorage.getItem(key)!).draft.note).toBe(
      "Draft stays in this apartment.",
    );
  }, 15000); // Repeated full-source project/capture/review journeys exceed the short unit-test budget.
  it("keeps the selected project when Escape closes a contextual panel", async () => {
    renderAt("/?project=schependomlaan&panel=project");
    await ready();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByTestId("url").textContent).toBe(
      "/?project=schependomlaan&panel=none",
    );
    expect(scene.last!.data).toBe(apartment);
  });
  it("opens the building without login or page tabs and keeps one scene mounted through every panel", async () => {
    renderAt("/");
    await ready();
    expect(
      screen.queryByRole("navigation", { name: "Workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Work & issues" }),
    ).toBeInTheDocument();
    const firstData = scene.last!.data;
    for (const name of [
      "Project pulse",
      "Progress history",
      "Project team",
      "Project context",
      "Explore building",
    ]) {
      await menu(name);
      expect(screen.getByRole("complementary", { name })).toBeInTheDocument();
      expect(screen.getAllByTestId("project-scene")).toHaveLength(1);
    }
    await userEvent.click(screen.getByLabelText("Close side panel"));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(scene.mount).toHaveBeenCalledTimes(1);
    expect(scene.dispose).not.toHaveBeenCalled();
    expect(scene.last!.data).toBe(firstData);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("preserves bookmarked issue selection and fragments while moving old screens into root panels", async () => {
    renderAt("/demo/building/?work=ISS-031#workspace-main");
    await ready();
    await screen.findByRole("complementary", { name: "Work record" });
    await waitFor(() =>
      expect(screen.getByTestId("url").textContent).toBe(
        "/?work=ISS-031&panel=record#workspace-main",
      ),
    );
    expect(scene.last!.focus!.element).toBe(
      "f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c",
    );
    expect(scene.last!.expanded).toBe(true);
  });
  it("preserves saved project records in the new interface", async () => {
    const first = renderAt("/setup");
    await ready();
    const input = await screen.findByLabelText("Project name");
    await userEvent.clear(input);
    await userEvent.type(input, "Elm Court");
    await userEvent.click(
      screen.getByRole("button", { name: "Save project name" }),
    );
    expect(saved().projectName).toBe("Elm Court");
    first.unmount();
    renderAt("/");
    await ready();
    expect(
      screen.getByRole("heading", { name: "Elm Court" }),
    ).toBeInTheDocument();
  });
  it.each([
    ["/logs", "Progress history"],
    ["/people", "Project team"],
    ["/setup", "Project context"],
  ])("opens %s as a panel after a refresh", async (path, name) => {
    renderAt(path);
    await ready();
    await screen.findByRole("complementary", { name });
    await waitFor(() =>
      expect(screen.getByTestId("url").textContent).toMatch(/^\/\?panel=/),
    );
  });
  it.each([
    "/demo",
    "/login",
    "/p/private/home",
    "/field/private/zone/room",
    "/q/private-token",
    "/embed/p/private/viewer",
    "/unknown-page",
  ])("retires %s without mounting the old app", async (path) => {
    renderAt(path);
    await ready();
    await waitFor(() =>
      expect(screen.getByTestId("url").textContent).toBe(
        path === "/unknown-page" ? "/?panel=issues" : "/",
      ),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("maps a model pin through the source floor, unit and room, and supports a tighter component focus", async () => {
    renderAt("/");
    await ready();
    await userEvent.click(
      screen.getByRole("button", { name: "Model pin ISS-031" }),
    );
    const nav = within(
      screen.getByRole("navigation", { name: "Model location" }),
    );
    expect(nav.getByRole("button", { name: "Level 2" })).toBeInTheDocument();
    expect(nav.getByRole("button", { name: "Unit A" })).toBeInTheDocument();
    expect(nav.getByRole("button", { name: "Bedroom 2" })).toBeInTheDocument();
    expect(scene.last!.focus!.elements!.length).toBeGreaterThan(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Zoom to component" }),
    );
    expect(scene.last!.focus!.elements).toEqual([
      "f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c",
    ]);
    await userEvent.click(nav.getByRole("button", { name: "Unit A" }));
    expect(
      screen.getByRole("complementary", { name: "Explore building" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("url").textContent).toContain("unit=A");
    const directory = within(screen.getByRole("complementary"));
    expect(
      directory.getByRole("button", { name: /Explore Bedroom 2 · A203/ }),
    ).toBeInTheDocument();
    expect(
      directory.queryByRole("button", { name: /B203/ }),
    ).not.toBeInTheDocument();
  });
  it("resolves a reviewed correction, updates the same component and records history without changing the model", async () => {
    renderAt("/issue/ISS-031");
    await ready();
    const source = scene.last!.data,
      element = source.elements.find(
        (e) => e.id === "f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c",
      )!,
      bbox = [...element.bbox!];
    await userEvent.click(
      screen.getByRole("button", { name: "Accept correction & resolve" }),
    );
    await userEvent.type(
      screen.getByLabelText("Decision reason"),
      "Reviewed the correction evidence and confirmed the required follow-up.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save decision" }),
    );
    const record = saved().items.find((i) => i.id === "ISS-031")!;
    expect(record.status).toBe("human");
    expect(record.issue).toBeUndefined();
    expect(scene.last!.colors.get(element.id)).toBe(COLORS.human);
    expect(scene.last!.data).toBe(source);
    expect(element.bbox).toEqual(bbox);
    expect(saved().events[0].text).toContain(
      "Reviewed the correction evidence",
    );
    expect(record.inspection).toBe("Not recorded");
  });
  it("submits actual photo evidence from the side panel and withdraws previous completion pending review", async () => {
    renderAt("/capture?item=PLUMB-402");
    await ready();
    await addEvidence();
    await userEvent.click(
      screen.getByRole("button", { name: "Submit for review" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Work record" }),
    ).toBeInTheDocument();
    const state = saved(),
      record = state.items.find((i) => i.id === "PLUMB-402")!;
    expect(record.status).toBe("review");
    expect(record.photos.find((p) => p.id === "uploaded-photo")!.sample).toBe(
      false,
    );
    expect(
      screen.getByRole("img", { name: "field-photo.jpg" }),
    ).toBeInTheDocument();
    expect(state.assessmentJobs![0].state).toBe("awaiting_agent");
    expect(state.assessmentJobs![0].modelVersion).toBe(model.version);
    expect(scene.last!.colors.get(record.location!.elements[0])).not.toBe(
      COLORS.human,
    );
    expect(scene.mount).toHaveBeenCalledTimes(1);
  });
  it("retains the same offline submission identity when reconnecting and does not auto-complete it", async () => {
    const connection = vi
      .spyOn(navigator, "onLine", "get")
      .mockReturnValue(false);
    renderAt("/capture?item=PLUMB-402");
    await ready();
    await addEvidence();
    await userEvent.click(screen.getByRole("button", { name: "Queue update" }));
    const before = saved().assessmentJobs![0];
    expect(before.state).toBe("queued_offline");
    connection.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    const after = saved().assessmentJobs![0];
    expect(after.id).toBe(before.id);
    expect(after.update).toBe(before.update);
    expect(after.state).toBe("awaiting_agent");
    expect(saved().items.find((i) => i.id === "PLUMB-402")!.status).toBe(
      "review",
    );
  });
  it("moves the same model to a changed capture target and asks for fresh location confirmation", async () => {
    renderAt("/capture?item=PLUMB-402");
    await ready();
    await userEvent.click(
      screen.getByLabelText("I confirm this is the correct work location."),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Work item"),
      "ISS-031",
    );
    expect(
      screen.getByLabelText("I confirm this is the correct work location."),
    ).not.toBeChecked();
    expect(scene.last!.focus!.element).toBe(
      "f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c",
    );
    expect(screen.getByTestId("url").textContent).toContain("work=ISS-031");
    expect(scene.mount).toHaveBeenCalledTimes(1);
  });
  it("searches room context and opens the matching issue without losing the building", async () => {
    renderAt("/");
    await ready();
    await userEvent.type(
      screen.getByLabelText("Search building records"),
      "Bedroom pipe connection",
    );
    const panel = within(
      screen.getByRole("complementary", { name: "Work & issues" }),
    );
    await userEvent.click(
      panel.getByRole("button", { name: /Bedroom pipe connection/ }),
    );
    expect(
      screen.getByRole("complementary", { name: "Work record" }),
    ).toBeInTheDocument();
    expect(scene.mount).toHaveBeenCalledTimes(1);
  });
  it("replays historical status on the same scene and returns to current evidence when opening a record", async () => {
    renderAt("/logs");
    await ready();
    const source = scene.last!.data;
    fireEvent.change(screen.getByLabelText("Show recorded day"), {
      target: { value: "2026-01-01" },
    });
    await waitFor(() =>
      expect(screen.getByTestId("url").textContent).toContain(
        "date=2026-01-01",
      ),
    );
    expect(scene.last!.data).toBe(source);
    expect(scene.last!.markers).toHaveLength(0);
    await userEvent.click(
      screen.getByRole("button", { name: "Return model to current progress" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Model pin ISS-031" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Work record" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("url").textContent).not.toContain("date=");
    expect(scene.mount).toHaveBeenCalledTimes(1);
  });
  it("opens untracked components without inventing work or completion", async () => {
    renderAt("/");
    await ready();
    await userEvent.click(
      screen.getByRole("button", { name: "Select untracked component" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Component details" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no tracked work or evidence record/),
    ).toBeInTheDocument();
    expect(saved()?.assessmentJobs || []).toHaveLength(0);
  });
});

it("searches accepted work across the default attention filter and preserves search focus", async () => {
  renderAt("/");
  await ready();
  const search = screen.getByLabelText("Search building records");
  await userEvent.type(search, "Kitchen sink");
  expect(search).toHaveFocus();
  expect(screen.getByText("Searching all statuses.")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: /Kitchen sink connections\./ }),
  );
  expect(
    screen.getByRole("heading", { name: "Kitchen sink connections" }),
  ).toBeInTheDocument();
});

it("changes the responsible owner and due date without resolving an open issue", async () => {
  renderAt("/?panel=record&work=ISS-031");
  await ready();
  await userEvent.click(
    screen.getByRole("button", { name: "Change owner / due date" }),
  );
  await userEvent.clear(screen.getByLabelText("Assignee"));
  await userEvent.type(screen.getByLabelText("Assignee"), "New plumbing lead");
  fireEvent.change(screen.getByLabelText("Due date"), {
    target: { value: "2026-10-15" },
  });
  await userEvent.type(
    screen.getByLabelText("Decision reason"),
    "Crew change; preserve the open correction.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save decision" }));
  const record = saved().items.find((i) => i.id === "ISS-031")!;
  expect(record.owner).toBe("New plumbing lead");
  expect(record.due).toBe("2026-10-15");
  expect(record.issue).toBeTruthy();
  expect(record.status).toBe("issue");
  expect(saved().events[0].text).toContain("owner New plumbing lead");
});

it("previews a read-only customer and scoped field worker without remounting the building", async () => {
  renderAt("/?panel=project");
  await ready();
  const mounts = scene.mount.mock.calls.length;
  await userEvent.selectOptions(
    screen.getByLabelText("Preview user experience"),
    "customer",
  );
  expect(screen.getByRole("button", { name: "New update" })).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Model pin F-118" }),
  );
  expect(
    screen.queryByRole("button", { name: "Confirm an issue" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Project-manager review is required/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Return to PM" }));
  await menu("Project context");
  await userEvent.selectOptions(
    screen.getByLabelText("Preview user experience"),
    "worker",
  );
  expect(screen.getByRole("button", { name: "New update" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "New update" }));
  const options = within(screen.getByLabelText("Work item")).getAllByRole(
    "option",
  );
  expect(options.length).toBeGreaterThan(0);
  expect(options.length).toBeLessThan(model.elements.length);
  expect(scene.mount.mock.calls.length).toBe(mounts);
});

it("focuses the contextual panel and restores the invoking button on close", async () => {
  renderAt("/");
  await ready();
  const trigger = screen.getByLabelText("Open work and issues");
  await userEvent.click(trigger);
  expect(screen.getByRole("complementary")).toHaveFocus();
  await userEvent.click(screen.getByLabelText("Close side panel"));
  expect(trigger).toHaveFocus();
});

it("retains unavailable photo evidence instead of substituting an unrelated image", async () => {
  renderAt("/?panel=record&work=F-118");
  await ready();
  const image = within(
    screen.getByLabelText("Enlarge evidence photo"),
  ).getByRole("img");
  fireEvent.error(image);
  expect(screen.getByText(/Photo unavailable/)).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Bedroom door — placement review" }),
  ).toBeInTheDocument();
});

it("creates a private project, previews a real draft in the shared canvas and requires explicit approval", async () => {
  let created = false,
    imported = false,
    approved = false;
  const requests: string[] = [];
  const project = {
    id: "private-project",
    name: "Client apartment",
    my_role: "owner",
    my_trades: [],
    my_zone_ids: null,
  };
  const level = model.plans.find((p) => p.elements.length)!,
    version = () => ({
      id: "private-revision",
      number: 1,
      status: approved ? "approved" : "draft",
      is_current: approved,
      message: "Client IFC",
    });
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const path = String(input);
    requests.push(path);
    let body: unknown;
    if (path === "/api/auth/login")
      body = { access_token: "test-private", refresh_token: "test-refresh" };
    else if (path === "/api/auth/me")
      body = { id: "client-pm", name: "Client PM", email: "pm@example.com" };
    else if (path === "/api/projects" && init?.method === "POST") {
      created = true;
      body = project;
    } else if (path === "/api/projects") body = created ? [project] : [];
    else if (path === "/api/projects/private-project") body = project;
    else if (path.includes("/models/import")) {
      imported = true;
      expect((init!.body as FormData).getAll("files")).toHaveLength(1);
      body = { id: "import-job", status: "queued" };
    } else if (path === "/api/jobs/import-job")
      body = {
        id: "import-job",
        status: "done",
        result: { version_id: "private-revision" },
      };
    else if (path === "/api/models/private-revision/approve") {
      approved = true;
      body = version();
    } else if (path.endsWith("/models")) body = imported ? [version()] : [];
    else if (path.includes("/viewer"))
      body = {
        version: imported ? version() : null,
        layers: imported
          ? [
              {
                discipline: "architecture",
                context: false,
                url: "/api/models/private-revision/meshes/architecture.glb",
              },
            ]
          : [],
      };
    else if (path.includes("/elements"))
      body = imported
        ? model.elements.filter((e) => e.level_id === level.id).slice(0, 2)
        : [];
    else if (path.endsWith("/tree"))
      body = imported
        ? [{ name: "Building", levels: [{ ...level, zones: level.rooms }] }]
        : [];
    else if (path.includes("/plans/")) body = level;
    else throw Error(`Unexpected request ${path}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  renderAt("/?panel=import");
  await ready();
  await userEvent.type(screen.getByLabelText("Email"), "pm@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "test-password");
  await userEvent.click(
    screen.getByRole("button", { name: "Connect account" }),
  );
  await screen.findByText("Client PM");
  await userEvent.type(
    screen.getByLabelText("Project name"),
    "Client apartment",
  );
  await userEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByText("No model yet. Upload IFC to begin.");
  expect(screen.queryByText("Sarah Jenkins")).not.toBeInTheDocument();
  await userEvent.upload(
    await screen.findByLabelText("IFC model files"),
    new File(["ISO-10303-21;"], "client.ifc"),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Upload as draft" }),
  );
  const approve = await screen.findByRole("button", {
    name: "Approve as project reference",
  });
  expect(approve).toBeDisabled();
  expect(approved).toBe(false);
  expect(scene.last!.data.source.apiProjectId).toBe("private-project");
  expect(scene.last!.data.plans[0].elements.length).toBeGreaterThan(0);
  expect(scene.last!.loader).toBeDefined();
  expect(scene.last!.markers).toHaveLength(0);
  expect(screen.getByRole("button", { name: "New update" })).toBeDisabled();
  await userEvent.click(
    screen.getByLabelText("I reviewed this source structure and geometry."),
  );
  await userEvent.click(approve);
  await screen.findByText("Connected model · work records pending");
  expect(approved).toBe(true);
  expect(requests).toContain("/api/models/private-revision/approve");
  expect(screen.getByRole("button", { name: "New update" })).toBeDisabled();
}, 10000);

it("keeps scene colors and pins stable while writing a daily-update draft", async () => {
  renderAt("/?panel=capture&work=PLUMB-402");
  await ready();
  const colors = scene.last!.colors,
    markers = scene.last!.markers;
  await userEvent.type(
    screen.getByLabelText("What changed?"),
    "Finished the connection.",
  );
  expect(scene.last!.colors).toBe(colors);
  expect(scene.last!.markers).toBe(markers);
  expect(saved().draft?.note).toBe("Finished the connection.");
});
