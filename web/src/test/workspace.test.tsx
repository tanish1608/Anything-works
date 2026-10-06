import { readFileSync } from "node:fs";
import type { ModelDataset } from "../viewer/modelData";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Workspace from "../workspace/Workspace";
import { STORE_KEY } from "../workspace/state";

const model = JSON.parse(
  readFileSync("public/bim-duplex/model.json", "utf8"),
) as ModelDataset;
const sceneCalls = vi.hoisted(() => ({
  scene: vi.fn(),
  selections: [] as ((id: string) => void)[],
}));
vi.mock("../viewer/modelData", async (original) => ({
  ...(await original<typeof import("../viewer/modelData")>()),
  loadDemoModel: async () => model,
}));
vi.mock("../viewer/ProjectScene", () => ({
  default: (props: Record<string, unknown>) => {
    sceneCalls.scene(props);
    const choose = props.onMarker as (id: string) => void;
    sceneCalls.selections.push(choose);
    return <div data-testid="shared-scene" />;
  },
}));

beforeAll(() =>
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  }),
);
afterAll(() =>
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal"),
);
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sceneCalls.selections.length = 0;
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function renderAt(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<Workspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("implemented designer workflow", () => {
  it("uses the imported building even for old illustrated-unit links", async () => {
    renderAt("/building?unit=Core");
    await screen.findByLabelText("Building viewer");
    expect(screen.getByLabelText("Level")).toHaveValue("");
    expect(sceneCalls.scene.mock.calls.at(-1)![0].data.version).toBe(
      model.version,
    );
    expect(screen.queryByText("Level 14 core")).not.toBeInTheDocument();
  });
  it("projects actual issue components and switches to their source plan", async () => {
    const user = userEvent.setup();
    renderAt("/building?work=ISS-031");
    await screen.findByLabelText("Building viewer");
    await waitFor(() =>
      expect(sceneCalls.scene.mock.calls.at(-1)![0].focus?.element).toBe(
        "f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c",
      ),
    );
    expect(
      sceneCalls.scene.mock.calls
        .at(-1)![0]
        .colors.get("f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c"),
    ).toBe("#ef4444");
    await user.click(screen.getByRole("button", { name: "Switch to 2D plan" }));
    expect(screen.getByLabelText("Level")).toHaveValue(model.elements.find(e=>e.id==='f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c')!.level_id);
    expect(screen.getByText(/Model-derived plan/)).toBeInTheDocument();
  });
  it("filters work and records an issue confirmation that persists after refresh", async () => {
    const user = userEvent.setup();
    const view = renderAt("/review/F-118");
    expect(
      await screen.findByRole("heading", {
        name: "Evidence vs approved reference",
      }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Resolution requires"),
      "Review door placement and submit corrected context photos.",
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm issue & assign owner" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Resolve this issue?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept correction & resolve" }),
    ).toBeDisabled();
    expect(
      JSON.parse(localStorage.getItem(STORE_KEY)!).items.find(
        (i: { id: string }) => i.id === "F-118",
      ).issue,
    ).toBeTruthy();
    view.unmount();
    renderAt("/work?filter=issues");
    await screen.findByLabelText("Find work");
    expect(
      screen.getAllByText(/Bedroom door — placement review/).length,
    ).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("Find work"), "connection");
    expect(
      screen.queryByText(/Bedroom door — placement review/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Bedroom pipe connection/)).toBeInTheDocument();
  });
  it("resolves a correction with a reason and updates the daily record", async () => {
    const user = userEvent.setup();
    renderAt("/issue/ISS-031");
    await screen.findByRole("button", { name: "Accept correction & resolve" });
    await user.click(
      screen.getByRole("button", { name: "Accept correction & resolve" }),
    );
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Decision reason"),
      "Reviewed corrected routing and fire-protection confirmation on site.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Record decision" }),
    );
    expect(
      await screen.findByText("Resolved · human accepted"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Logs" }));
    const saved = JSON.parse(localStorage.getItem(STORE_KEY)!);
    const at = new Date(saved.events[0].at);
    const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
    await user.clear(screen.getByLabelText("Selected log day"));
    await user.type(screen.getByLabelText("Selected log day"), date);
    expect(
      within(screen.getByLabelText("Daily activity")).getByText(
        /Reviewed corrected routing and fire-protection confirmation on site\./,
      ),
    ).toBeInTheDocument();
  });
  it("submits a sample update through capture steps and shows scoped completion", async () => {
    const user = userEvent.setup();
    renderAt("/capture?item=PLUMB-402");
    await user.click(
      await screen.findByRole("button", { name: "Next: photos" }),
    );
    await user.click(screen.getByRole("button", { name: "Use sample image" }));
    await user.type(
      screen.getByLabelText("Note"),
      "Visible plumbing completed.",
    );
    await user.selectOptions(
      screen.getByLabelText("Your status (optional)"),
      "Done",
    );
    await user.click(screen.getByRole("button", { name: "Review update" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Run the labeled sample check" }),
    );
    await user.click(screen.getByRole("button", { name: "Submit update" }));
    expect(
      await screen.findByRole("heading", { name: "AI-checked complete" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Not covered by this result" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Worker claim: Done")).toBeInTheDocument();
  });
  it("keeps an offline simulation queued and later moves it to review", async () => {
    const user = userEvent.setup();
    renderAt("/capture?item=ELEC-406");
    await user.click(
      await screen.findByRole("button", { name: "Next: photos" }),
    );
    await user.click(screen.getByRole("button", { name: "Use sample image" }));
    await user.click(screen.getByRole("button", { name: "Review update" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Simulate an offline submission" }),
    );
    await user.click(screen.getByRole("button", { name: "Submit update" }));
    expect(
      await screen.findByRole("heading", { name: "Saved on this device" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Move queued update to local demo review",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Your update is in review" }),
    ).toBeInTheDocument();
  });
  it("keeps setup names and redirects the removed report to Logs", async () => {
    const user = userEvent.setup();
    const view = renderAt("/setup");
    await user.clear(await screen.findByLabelText("Project name"));
    await user.type(
      screen.getByLabelText("Project name"),
      "Friends demo",
    );
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await user.click(screen.getByRole("link", { name: "Logs" }));
    expect(screen.getByRole("heading", { name: "Logs" })).toBeInTheDocument();
    expect(
      screen.getByText("Friends demo", { selector: "p" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Daily Report" }),
    ).not.toBeInTheDocument();
    view.unmount();
    renderAt("/report");
    expect(
      await screen.findByRole("heading", { name: "Logs" }),
    ).toBeInTheDocument();
  });
  it("links Home rows to model focus and model pins back to the selected record", async () => {
    const user = userEvent.setup();
    renderAt();
    expect(
      await screen.findByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Updates recorded")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Locate Firestop evidence at pipe penetration",
      }),
    );
    expect(sceneCalls.scene.mock.calls.at(-1)![0].focus.element).toBe(
      "d09d1641-ef7d-53db-9d74-afdf3091c96d",
    );
    expect(sceneCalls.scene.mock.calls.at(-1)![0].expanded).toBe(true);
    const { act } = await import("@testing-library/react");
    act(() => sceneCalls.selections.at(-1)!("ISS-031"));
    expect(
      screen.getByRole("button", {
        name: "Locate Bedroom pipe connection — correction submitted",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("link", { name: "Open evidence & decision →" }),
    ).toHaveAttribute("href", "/issue/ISS-031");
    const token = sceneCalls.scene.mock.calls.at(-1)![0].focus.token;
    await user.click(
      screen.getByRole("button", {
        name: "Locate Bedroom pipe connection — correction submitted",
      }),
    );
    expect(sceneCalls.scene.mock.calls.at(-1)![0].focus.token).toBeGreaterThan(
      token,
    );
    await user.click(screen.getByRole("button", { name: "Fit project model" }));
    expect(sceneCalls.scene.mock.calls.at(-1)![0].focus).toBeNull();
    expect(sceneCalls.scene.mock.calls.at(-1)![0].expanded).toBe(false);
    expect(
      new Set(
        model.elements
          .filter((e) =>
            sceneCalls.scene.mock.calls.at(-1)![0].visible.has(e.id),
          )
          .map((e) => e.level_id),
      ).size,
    ).toBeGreaterThan(1);
  });
  it("compares actual history without backdating current completion", async () => {
    const user = userEvent.setup();
    renderAt("/logs");
    await user.click(
      await screen.findByRole("checkbox", { name: "Compare dates" }),
    );
    expect(
      screen.getByText(/2 newly completed · 0 reopened/),
    ).toBeInTheDocument();
    const projections = sceneCalls.scene.mock.calls.map((c) => c[0]);
    const sink = "70bac51c-0cf4-5135-a685-95a5c44f7c6c",
      issue = "f1bbcc89-9317-5a67-b1e2-9e8b7c9a846c";
    expect(projections.some((p) => p.colors.get(sink) === "#e2e8f0")).toBe(
      true,
    );
    expect(projections.some((p) => p.colors.get(sink) === "#10b981")).toBe(
      true,
    );
    expect(projections.every((p) => p.colors.get(issue) !== "#10b981")).toBe(
      true,
    );
    expect(projections.every((p) => p.data.version === model.version)).toBe(
      true,
    );
  });
  it("shows People contacts and persists explicitly set availability", async () => {
    const user = userEvent.setup();
    const view = renderAt("/people");
    expect(
      await screen.findByRole("link", { name: "nina.patel@example.com" }),
    ).toHaveAttribute("href", "mailto:nina.patel@example.com");
    await user.selectOptions(
      screen.getByLabelText("Availability for Nina Patel"),
      "On site",
    );
    await user.click(screen.getByRole("button", { name: "Teams & hierarchy" }));
    expect(screen.getAllByText("Reports to Sarah Jenkins").length).toBe(6);
    view.unmount();
    renderAt("/people");
    expect(
      await screen.findByLabelText("Availability for Nina Patel"),
    ).toHaveValue("On site");
    await user.type(screen.getByLabelText("Find people"), "Nina");
    expect(
      screen.queryByRole("heading", { name: "Derrick Hall" }),
    ).not.toBeInTheDocument();
  });
});
