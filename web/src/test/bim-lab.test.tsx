import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Workbench, type BimDataset } from "../pages/BimLabPage";
import type { ElementDetail } from "../api/types";

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
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
