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
}));
vi.mock("../viewer/ViewerCanvas", async () => {
  const React = await import("react");
  return {
    default: function Stub({ onReady }: { onReady: (v: unknown) => void }) {
      React.useEffect(() => {
        onReady(viewer);
        return () => onReady(null);
      }, [onReady]);
      return <div>Renderer stub</div>;
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
    await screen.findByRole("heading", { name: "Explore the duplex" }),
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
    screen.getByRole("link", { name: "Daily workflow · illustrated building" }),
  ).toHaveAttribute("href", "/demo/building?view=workflow");
  expect(
    screen.getByRole("checkbox", {
      name: "Interior view · hide exterior walls",
    }),
  ).toBeChecked();
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
