import { cleanup, render, screen, within } from "@testing-library/react";
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
import { STORE_KEY, initialState } from "../workspace/state";

const sceneCalls = vi.hoisted(() => ({
  appearance: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../studio/scene", () => ({
  BuildingScene: class {
    constructor(
      _host: HTMLElement,
      _select: (id: string) => void,
      stats: (count: number) => void,
    ) {
      stats(120);
    }
    update = sceneCalls.update;
    setAppearance = sceneCalls.appearance;
    dispose = sceneCalls.dispose;
    frame() {}
    focus() {}
    zoom() {}
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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function renderAt(path = "/demo") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/demo/*" element={<Workspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("implemented designer workflow", () => {
  it('keeps a core-level location instead of incorrectly selecting an apartment', () => {
    renderAt('/demo/building?unit=Core');
    expect(screen.getByRole('heading', { name: 'Level 14 core' })).toBeInTheDocument();
    expect(screen.getByText('Firestop at penetrations P-01 to P-06')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unit 405' })).not.toBeInTheDocument();
  });
  it("projects issue precedence into 3D and provides an accessible plan fallback", async () => {
    const user = userEvent.setup();
    renderAt("/demo/building?unit=405");
    expect(sceneCalls.appearance).toHaveBeenCalledWith(
      expect.objectContaining({ "405": { color: "#ef4444", marker: true } }),
    );
    expect(
      screen.getByRole("heading", { name: "Unit 405" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Plan view" }));
    expect(
      within(screen.getByLabelText("Accessible unit plan")).getByRole("button", { name: /405/ }),
    ).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Level"), "3");
    await user.click(
      within(screen.getByLabelText("Accessible unit plan")).getByRole("button", { name: /302/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Unit 302" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Punch P-118 · hall-closet paint touch-up"),
    ).toBeInTheDocument();
  });
  it("filters work and records an issue confirmation that persists after refresh", async () => {
    const user = userEvent.setup();
    const view = renderAt("/demo/review/F-118");
    expect(
      screen.getByRole("heading", { name: "Evidence vs approved reference" }),
    ).toBeInTheDocument();
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
    renderAt("/demo/work?filter=issues");
    expect(screen.getAllByText(/Door opening appears/).length).toBeGreaterThan(
      0,
    );
    await user.type(screen.getByLabelText("Find work"), "405");
    expect(screen.queryByText(/Door opening appears/)).not.toBeInTheDocument();
    expect(screen.getByText(/Supply duct routing/)).toBeInTheDocument();
  });
  it("resolves a correction with a reason and updates the daily record", async () => {
    const user = userEvent.setup();
    renderAt("/demo/issue/ISS-031");
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
    await user.click(screen.getByRole("link", { name: "Daily Report" }));
    expect(
      screen.getByText(
        /Reviewed corrected routing and fire-protection confirmation on site\./,
        { selector: "pre" },
      ),
    ).toBeInTheDocument();
  });
  it("submits a sample update through capture steps and shows scoped completion", async () => {
    const user = userEvent.setup();
    renderAt("/demo/capture?item=PLUMB-402");
    await user.click(screen.getByRole("button", { name: "Next: photos" }));
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
    renderAt("/demo/capture?item=ELEC-406");
    await user.click(screen.getByRole("button", { name: "Next: photos" }));
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
  it("renders setup and a persisted report without inventing inspected status", async () => {
    localStorage.setItem(STORE_KEY, JSON.stringify(initialState()));
    const user = userEvent.setup();
    renderAt("/demo/setup");
    expect(
      screen.getByRole("heading", { name: "Approved references" }),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Local demo project name"));
    await user.type(
      screen.getByLabelText("Local demo project name"),
      "Friends demo",
    );
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await user.click(screen.getByRole("link", { name: "Daily Report" }));
    expect(
      screen.getByRole("heading", { name: "Friends demo" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("PM note"), "Reviewed references.");
    await user.click(
      screen.getByRole("button", { name: "Sign report snapshot" }),
    );
    expect(
      screen.getByText("Signed locally · snapshot locked"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("PM note")).toHaveAttribute("readonly");
  });
});
