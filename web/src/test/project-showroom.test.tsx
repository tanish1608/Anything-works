import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import ProjectShowroom from "../workspace/ProjectShowroom";
import type ProjectScene from "../viewer/ProjectScene";
import type { ModelDataset } from "../viewer/modelData";

const deps = vi.hoisted(() => ({
  publicModel: vi.fn(),
  privateModel: vi.fn(),
  privateLayer: vi.fn(),
  api: vi.fn(),
  token: null as unknown,
  scene: null as ComponentProps<typeof ProjectScene> | null,
}));
vi.mock("../api/client", () => ({
  api: deps.api,
  tokenStore: { get: () => deps.token, set: (t: unknown) => { deps.token = t; }, subscribe: () => () => {} },
}));
vi.mock("../viewer/modelData", async (original) => ({
  ...(await original<typeof import("../viewer/modelData")>()),
  loadPublicProject: deps.publicModel,
}));
vi.mock("../viewer/authorizedModel", () => ({
  loadAuthorizedModel: deps.privateModel,
  loadAuthorizedLayer: deps.privateLayer,
}));
vi.mock("../viewer/ProjectScene", () => ({
  default: (props: ComponentProps<typeof ProjectScene>) => {
    deps.scene = props;
    return (
      <div data-testid="showroom-scene">
        <button onClick={props.onInteraction}>Drag building</button>
      </div>
    );
  },
}));
function Route() {
  const location = useLocation();
  return (
    <output data-testid="url">
      {location.pathname + location.search + location.hash}
    </output>
  );
}
function mount(
  url = "/?screen=projects&preview=duplex&returnTo=%2F%3Fpanel%3Dissues%23pin",
) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ProjectShowroom current="duplex" />
      <Route />
    </MemoryRouter>,
  );
}
const model = {
  version: "v1",
  source: { revision: "source", license: "Sample", attribution: "IFC source" },
  layers: [
    { discipline: "architecture", url: "/model.glb", bytes: 1, context: true },
  ],
  plans: [],
  elements: [
    {
      id: "outer",
      ifc_class: "IfcWall",
      props: { "Pset_WallCommon.IsExternal": true },
      discipline: "architecture",
    },
    {
      id: "inner",
      ifc_class: "IfcWall",
      props: { "Pset_WallCommon.IsExternal": false },
      discipline: "architecture",
    },
    {
      id: "roof",
      ifc_class: "IfcSlab",
      props: { "IFC.predefined_type": "ROOF" },
      discipline: "structure",
    },
  ],
} as unknown as ModelDataset;
beforeEach(() => {
  vi.clearAllMocks();
  deps.token = null;
  deps.scene = null;
  deps.publicModel.mockResolvedValue(model);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("browses a real model without opening it, then opens with stale work context cleared", async () => {
  mount();
  await screen.findByTestId("showroom-scene");
  expect(screen.getByRole("link", { name: "Placeholder AI" })).toBeInTheDocument();
  expect(deps.publicModel).toHaveBeenCalledWith("duplex");
  expect(deps.scene!.orbitFit).toBe(true);
  expect(screen.getAllByTestId("showroom-scene")).toHaveLength(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Preview Schependomlaan Apartments" }),
  );
  await waitFor(() =>
    expect(deps.publicModel).toHaveBeenCalledWith("schependomlaan"),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Open project" })).toBeEnabled(),
  );
  expect(screen.getByTestId("url").textContent).toContain("screen=projects");
  expect(
    screen.getByRole("button", { name: "Preview Schependomlaan Apartments" }),
  ).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Open project" }));
  expect(screen.getByTestId("url").textContent).toBe(
    "/?project=schependomlaan&panel=issues",
  );
});

it("returns to the original issue and pin even after browsing another building", async () => {
  mount();
  await screen.findByTestId("showroom-scene");
  await userEvent.click(screen.getByRole("button", { name: "Next project" }));
  fireEvent.keyDown(screen.getByRole("main"), { key: "Escape" });
  expect(screen.getByTestId("url").textContent).toBe("/?panel=issues#pin");
});

it("shows the interior and rotates by default without preview-control buttons", async () => {
  mount();
  await screen.findByTestId("showroom-scene");
  expect(deps.scene!.autoRotate).toBe(true);
  expect([...deps.scene!.visible]).toEqual(["inner"]);
  expect(
    screen.queryByRole("button", {
      name: /rotation|Rotate building|Peek inside|Show exterior/,
    }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(4);
  await userEvent.click(screen.getByRole("button", { name: "Drag building" }));
  expect(deps.scene!.autoRotate).toBe(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Preview Medical-Dental Clinic" }),
  );
  await waitFor(() => expect(deps.publicModel).toHaveBeenCalledWith("clinic"));
  expect(deps.scene!.autoRotate).toBe(true);
});

it("keeps model-load failures explicit and can retry the selected project", async () => {
  deps.publicModel.mockRejectedValueOnce(
    new Error("Mesh manifest unavailable"),
  );
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Mesh manifest unavailable",
  );
  expect(screen.getByRole("button", { name: "Open project" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Retry preview" }));
  await screen.findByTestId("showroom-scene");
  expect(screen.getByRole("button", { name: "Open project" })).toBeEnabled();
});

it("loads connected projects through authorized geometry and sends empty projects to setup", async () => {
  deps.token = { access: "test" };
  deps.api.mockResolvedValue([
    { id: "private", name: "Our site", address: "Site address" },
  ]);
  deps.privateModel.mockResolvedValue({ model: { ...model, layers: [] } });
  mount("/?screen=projects&preview=api%3Aprivate");
  const open = await screen.findByRole("button", {
    name: "Set up building model",
  });
  expect(deps.privateModel).toHaveBeenCalledWith("private", null, true);
  expect(deps.publicModel).not.toHaveBeenCalled();
  expect(screen.queryByTestId("showroom-scene")).not.toBeInTheDocument();
  await userEvent.click(open);
  expect(screen.getByTestId("url").textContent).toBe(
    "/?project=api%3Aprivate&panel=import",
  );
});

it("does not substitute a sample for an inaccessible private project", async () => {
  mount("/?screen=projects&preview=api%3Aunknown");
  expect(
    screen.getByText("This project is not available to this account."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open project" })).toBeDisabled();
  expect(deps.publicModel).not.toHaveBeenCalled();
  expect(deps.privateModel).not.toHaveBeenCalled();
});

it("respects reduced motion across project changes and pauses a rotating preview when backgrounded", async () => {
  const motion = {
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => motion);
  mount();
  await screen.findByTestId("showroom-scene");
  expect(deps.scene!.autoRotate).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Next project" }));
  expect(deps.scene!.autoRotate).toBe(false);
  motion.matches = false;
  await userEvent.click(screen.getByRole("button", { name: "Next project" }));
  await waitFor(() => expect(deps.scene!.autoRotate).toBe(true));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  fireEvent(document, new Event("visibilitychange"));
  expect(deps.scene!.autoRotate).toBe(false);
});

it("uses the private layer loader for the current approved connected model", async () => {
  deps.token = { access: "test" };
  deps.api.mockResolvedValue([{ id: "private", name: "Our site" }]);
  deps.privateModel.mockResolvedValue({ model });
  mount("/?screen=projects&preview=api%3Aprivate");
  await screen.findByTestId("showroom-scene");
  expect(deps.scene!.loader).toBe(deps.privateLayer);
  expect(deps.privateModel).toHaveBeenCalledWith("private", null, true);
  expect(deps.publicModel).not.toHaveBeenCalled();
});

it("pages a larger catalog without scrolling or losing access to any project", async () => {
  deps.token = { access: "test" };
  deps.api.mockResolvedValue(
    Array.from({ length: 5 }, (_, i) => ({
      id: `private-${i}`,
      name: `Site ${i + 1}`,
    })),
  );
  deps.privateModel.mockResolvedValue({ model });
  mount();
  await screen.findByRole("button", { name: "Next project page" });
  expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(4);
  await userEvent.click(
    screen.getByRole("button", { name: "Next project page" }),
  );
  await screen.findByRole("button", { name: "Preview Site 1" });
  expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(4);
  await userEvent.click(
    screen.getByRole("button", { name: "Next project page" }),
  );
  await screen.findByRole("button", { name: "Preview Site 5" });
  expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Next project page" }),
  );
  expect(
    screen.getByRole("button", { name: "Preview Duplex Apartment" }),
  ).toHaveAttribute("aria-pressed", "true");
});

it("can stop default motion with the keyboard without adding preview buttons", async () => {
  mount();
  await screen.findByTestId("showroom-scene");
  fireEvent.keyDown(
    screen.getByRole("region", { name: "Property model preview" }),
    { key: " " },
  );
  expect(deps.scene!.autoRotate).toBe(false);
});


it("keeps samples usable when the connected service returns 502 and recovers on retry", async () => {
  deps.token = { access_token: "session" };
  deps.api.mockRejectedValueOnce(new Error("502 Bad Gateway")).mockResolvedValueOnce([{ id: "recovered", name: "Recovered site" }]);
  mount("/");
  expect(await screen.findByText("Connected projects are unavailable.")).toBeInTheDocument();
  expect(screen.queryByText(/502 Bad Gateway/)).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /^Preview / })).toHaveLength(4);
  expect(screen.getByRole("button", { name: "Open project" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Retry connection" }));
  await waitFor(() => expect(screen.queryByText("Connected projects are unavailable.")).not.toBeInTheDocument());
  expect(screen.getByText("1–4 of 5 buildings")).toBeInTheDocument();
});
