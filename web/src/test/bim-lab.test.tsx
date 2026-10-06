import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Workbench, type BimDataset } from "../pages/BimLabPage";
import type { ElementDetail } from "../api/types";
import Workspace from "../workspace/Workspace";
import SimpleBuilding from "../workspace/SimpleBuilding";
import ModelPlan from "../viewer/ModelPlan";
import ModelPage from "../pages/ModelPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ api: apiMock }));
vi.mock("../pages/ProjectLayout", () => ({
  useProject: () => ({
    project: {
      id: "p1",
      name: "Connected duplex",
      my_role: "pm",
      settings: {},
    },
  }),
}));

const viewer = vi.hoisted(() => ({
  loadLayers: vi.fn(async () => {}),
  setVisible: vi.fn(),
  setColors: vi.fn(),
  select: vi.fn(),
  frame: vi.fn(),
  setMarkers: vi.fn(),
  setSection: vi.fn(),
  zoom: vi.fn(),
  setPickMode: vi.fn(),
  flyTo: vi.fn(),
  on: vi.fn(),
  getViewpoint: vi.fn(),
  setGhostContext: vi.fn(),
  snapshot: vi.fn(() => "data:image/jpeg;base64,cHJldmlldw=="),
}));
vi.mock("../viewer/ViewerCanvas", async () => {
  const React = await import("react");
  return {
    default: function Stub({ onReady }: { onReady: (v: unknown) => void }) {
      React.useEffect(() => {
        onReady(viewer);
        return () => onReady(null);
      }, [onReady]);
      return <div data-testid="viewer">Renderer stub</div>;
    },
  };
});
const element: ElementDetail = {
  id: "elbow",
  ifc_guid: "guid-1",
  name: "Bedroom pipe elbow",
  ifc_class: "IfcFlowFitting",
  discipline: "plumbing",
  trade: "plumbing",
  level_id: "L2",
  zone_id: "A203",
  bbox: [0, 0, 3, 0.03, 0.03, 3.03],
  status: "not_started",
  flags: [],
  source: "imported",
  confidence: null,
  open_issues: 0,
  context: false,
  history: [],
  props: { "IFC.resolved_class": "IfcPipeFitting" },
};
const data: BimDataset = {
  version: "sample-revision",
  source: {
    attribution: "Public sample",
    license: "CC BY 4.0",
    repository: "sample/source",
    revision: "revision",
  },
  layers: [
    { discipline: "plumbing", context: false, url: "/fixture.glb", bytes: 0 },
  ],
  elements: [element],
  plans: [
    {
      id: "L2",
      name: "Level 2",
      elevation_m: 3.1,
      provenance: "Not an approved drawing",
      rooms: [
        {
          id: "A203",
          name: "Bedroom 2",
          code: "A203",
          polygon: [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
          ],
        },
      ],
      elements: [
        {
          id: "elbow",
          discipline: "plumbing",
          points: [
            [0, 0],
            [0.03, 0],
            [0.03, 0.03],
          ],
        },
      ],
    },
  ],
  audit: {
    elements: 1,
    rooms: 1,
    levels: 1,
    mesh_bytes: 100,
    bedroom_fitting: { id: "elbow" },
  },
};
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => data,
    })),
  );
});

it("opens the real BIM viewer inside Building with shared navigation and a distinct project identity", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(
    <MemoryRouter initialEntries={["/demo/building"]}>
      <Routes>
        <Route path="/demo/*" element={<Workspace />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    await screen.findByRole("region", { name: "Building viewer" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Duplex Apartment")).toBeInTheDocument();
  expect(
    screen.getByRole("navigation", { name: "Workspace" }),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("link", { name: "Everything Works AI" }),
  ).toHaveLength(1);
  expect(screen.queryByLabelText("Search workspace")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Daily workflow · illustrated building"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Level")).toBeInTheDocument();
  expect(screen.getByLabelText("View")).toBeInTheDocument();
  expect(screen.getByText("Layers")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Decision / resolution reason"),
  ).not.toBeInTheDocument();
  expect(document.querySelector(".bim-controls")).toBeNull();
  expect(document.querySelector(".bim-details")).toBeNull();
});

it("switches the corner preview between 3D and 2D without reloading the model or losing filters", async () => {
  render(<SimpleBuilding data={data} />);
  await waitFor(() => expect(viewer.loadLayers).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Level"), { target: { value: "L2" } });
  fireEvent.change(screen.getByLabelText("View"), {
    target: { value: "front" },
  });
  await waitFor(() =>
    expect(viewer.frame).toHaveBeenLastCalledWith(["elbow"], "front"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch to 2D plan" }));
  expect(screen.getByLabelText("Model-derived level plan")).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: "Current 3D building view" }),
  ).toHaveAttribute("src", "data:image/jpeg;base64,cHJldmlldw==");
  expect(viewer.snapshot).toHaveBeenCalledWith("image/jpeg", 0.6);
  expect(
    screen.queryByRole("button", { name: "Fit plan" }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByTestId("viewer")).toHaveLength(1);
  fireEvent.click(screen.getByText("Layers"));
  fireEvent.click(screen.getByLabelText("Plumbing"));
  await waitFor(() =>
    expect(viewer.setVisible).toHaveBeenLastCalledWith(new Set()),
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch to 3D model" }));
  expect(
    screen.queryByLabelText("Model-derived level plan"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Level")).toHaveValue("L2");
  expect(screen.getByLabelText("View")).toHaveValue("front");
  expect(screen.getByLabelText("Plumbing")).not.toBeChecked();
  expect(viewer.loadLayers).toHaveBeenCalledTimes(1);
});

it("keeps a usable 2D plan when WebGL cannot start", async () => {
  // A rejected layer load takes the same fallback path as an unavailable renderer.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false })),
  );
  render(<SimpleBuilding data={data} />);
  expect(
    await screen.findByLabelText("Model-derived level plan"),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Switch to 3D model" }),
  ).toBeDisabled();
});

it("supports touch pinch zoom in the minimal plan without selecting a component", () => {
  const onSelect = vi.fn();
  render(
    <ModelPlan
      plan={data.plans[0]}
      minimal
      selected={null}
      onSelect={onSelect}
    />,
  );
  const svg = screen.getByLabelText("Model-derived level plan");
  const initial = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
  fireEvent.pointerDown(svg, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerDown(svg, { pointerId: 2, clientX: 30, clientY: 10 });
  fireEvent.pointerMove(svg, { pointerId: 2, clientX: 50, clientY: 10 });
  expect(Number(svg.getAttribute("viewBox")!.split(" ")[2])).toBeLessThan(
    initial,
  );
  fireEvent.pointerUp(svg, { pointerId: 1 });
  fireEvent.pointerUp(svg, { pointerId: 2 });
  expect(onSelect).not.toHaveBeenCalled();
});

it("hides tagged exterior walls and roof, retains party walls and restores the shell on demand", async () => {
  const wall = (id: string, props: Record<string, unknown>): ElementDetail => ({
    ...element,
    id,
    name: id,
    ifc_class: "IfcWallStandardCase",
    discipline: "architecture",
    context: true,
    props,
  });
  const shellData = {
    ...data,
    layers: [
      ...data.layers,
      {
        discipline: "architecture",
        context: true,
        url: "/walls.glb",
        bytes: 0,
      },
    ],
    elements: [
      element,
      wall("outer", {
        "Pset_WallCommon.IsExternal": true,
        "PSet_Revit_Type_Construction.Function": 1,
      }),
      wall("party", {
        "Pset_WallCommon.IsExternal": true,
        "PSet_Revit_Type_Construction.Function": 5,
      }),
      wall("internal", { "Pset_WallCommon.IsExternal": false }),
      wall("unknown", {}),
      { ...wall("roof", {}), ifc_class: "IfcRoof" },
    ],
  };
  render(
    <MemoryRouter>
      <Workbench data={shellData} />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(viewer.setVisible).toHaveBeenLastCalledWith(
      new Set(["elbow", "party", "internal", "unknown"]),
    ),
  );
  expect(viewer.setGhostContext).toHaveBeenLastCalledWith(false);
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Interior view · hide exterior walls",
    }),
  );
  await waitFor(() =>
    expect(viewer.setVisible).toHaveBeenLastCalledWith(
      new Set(["elbow", "outer", "party", "internal", "unknown"]),
    ),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Hide roof" }));
  await waitFor(() =>
    expect(viewer.setVisible).toHaveBeenLastCalledWith(
      new Set(shellData.elements.map((e) => e.id)),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reset visibility" }));
  await waitFor(() =>
    expect(viewer.setVisible).toHaveBeenLastCalledWith(
      new Set(["elbow", "party", "internal", "unknown"]),
    ),
  );
});

it("applies the same reversible interior view to an authorized connected model", async () => {
  const outer = {
    ...element,
    id: "outer",
    ifc_class: "IfcWallStandardCase",
    discipline: "architecture",
    exterior_wall: true,
    context: true,
  };
  const party = { ...outer, id: "party", exterior_wall: false };
  const elements = [element, outer, party];
  apiMock.mockImplementation(async (path: string) => {
    if (path === "/projects/p1/viewer")
      return {
        version: {
          id: "v1",
          number: 1,
          status: "approved",
          source: "ifc_import",
        },
        layers: [
          ...data.layers,
          { discipline: "architecture", context: true, url: "/walls.glb" },
        ],
      };
    if (path === "/projects/p1/elements") return elements;
    if (path.endsWith(".glb")) return new Blob();
    return [];
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ModelPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(viewer.setVisible).toHaveBeenLastCalledWith(
      new Set(["elbow", "party"]),
    ),
  );
  expect(
    screen.getByRole("checkbox", { name: "Hide exterior walls" }),
  ).toBeChecked();
  expect(viewer.setGhostContext).toHaveBeenLastCalledWith(false);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Hide exterior walls" }),
  );
  await waitFor(() =>
    expect(viewer.setVisible).toHaveBeenLastCalledWith(
      new Set(["elbow", "outer", "party"]),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("focuses the detailed component and updates 3D and plan colors from a scoped sample decision", async () => {
  render(
    <MemoryRouter>
      <Workbench data={data} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(viewer.loadLayers).toHaveBeenCalled());
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect bedroom pipe elbow" }),
  );
  expect(viewer.frame).toHaveBeenCalledWith(["elbow"]);
  fireEvent.click(
    screen.getByRole("button", { name: "Use labeled workflow sample" }),
  );
  expect(screen.getByText("Needs review")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Decision / resolution reason"), {
    target: { value: "Supported fixture scope only." },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Simulate scoped AI completion" }),
  );
  expect(screen.getByText("AI-checked complete")).toBeInTheDocument();
  await waitFor(() =>
    expect(viewer.setColors).toHaveBeenLastCalledWith(
      new Map([["elbow", "#10b981"]]),
    ),
  );
  expect(localStorage.getItem("ew-real-bim-lab-v1")).toContain(
    "Supported fixture scope only.",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Use labeled workflow sample" }),
  );
  expect(screen.getByText("Needs review")).toBeInTheDocument();
});

it("retains 2D element selection through a pointer-capture gesture", async () => {
  const { container } = render(
    <MemoryRouter>
      <Workbench data={data} />
    </MemoryRouter>,
  );
  const polygon = container.querySelector('[data-element="elbow"]')!;
  fireEvent.pointerDown(polygon, { clientX: 20, clientY: 20 });
  fireEvent.pointerUp(screen.getByLabelText("Model-derived level plan"), {
    clientX: 20,
    clientY: 20,
  });
  expect(viewer.frame).toHaveBeenCalledWith(["elbow"]);
});
