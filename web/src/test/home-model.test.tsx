import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectModelContext from "../components/ProjectModelContext";
import type { ElementInfo, Issue } from "../api/types";
import type { SiteViewer } from "../viewer/Viewer";

const mock = vi.hoisted(() => ({
  api: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
  markers: vi.fn(),
  colors: vi.fn(),
  visible: vi.fn(),
  fly: vi.fn(),
  frame: vi.fn(),
  select: vi.fn(),
  events: new Map<string, (id: string) => void>(),
}));
vi.mock("../api/client", () => ({ api: mock.api }));
vi.mock("../viewer/ViewerCanvas", () => ({
  default: function MockViewerCanvas({
    onReady,
  }: {
    onReady: (v: SiteViewer | null) => void;
  }) {
    const initialReady = useRef(onReady);
    useEffect(() => {
      const ready = initialReady.current;
      ready({
        loadLayers: mock.load,
        setExplodedOffsets: vi.fn(async () => {}),
        setMarkers: mock.markers,
        setColors: mock.colors,
        setVisible: mock.visible,
        setGhostContext: () => {},
        select: mock.select,
        flyTo: mock.fly,
        frame: mock.frame,
        on: (name: string, cb: (id: string) => void) =>
          mock.events.set(name, cb),
      } as unknown as SiteViewer);
      return () => ready(null);
    }, []);
    return <div data-testid="viewer" />;
  },
}));
const element = {
  id: "pipe",
  ifc_class: "IfcPipeSegment",
  discipline: "plumbing",
  status: "done",
  completion_basis: "human",
  open_issues: 1,
  context: false,
  level_id: "level",
  zone_id: "room",
} as ElementInfo;
const wall = {
  ...element,
  id: "shell",
  ifc_class: "IfcWall",
  context: true,
  discipline: "architecture",
  exterior_wall: true,
  open_issues: 0,
};
const issue = {
  id: "current",
  element_id: "pipe",
  level_id: "level",
  model_version_id: "v2",
  anchor: [1, 2, 3],
  status: "open",
  viewpoint: { position: [8, 6, 5], target: [1, 2, 3] },
  title: "Routing",
  zone_id: "room",
} as Issue;
beforeEach(() => {
  vi.clearAllMocks();
  mock.events.clear();
  mock.api.mockImplementation(async (path: string) => {
    if (path.includes("/viewer")) {
      const id = path.includes("version=v1") ? "v1" : "v2";
      return {
        version: { id, number: id === "v1" ? 1 : 2 },
        layers: [
          {
            discipline: "plumbing",
            context: false,
            url: "/api/models/pipe.glb",
          },
        ],
      };
    }
    if (path.includes("/elements")) return [element, wall];
    if (path.endsWith("/tree"))
      return [
        {
          id: "b",
          name: "Building",
          levels: [{ id: "level", name: "Level", elevation_m: 0, zones: [] }],
        },
      ];
    if (path === "/models/pipe.glb") return new Blob(["geometry"]);
    throw new Error("Unexpected request " + path);
  });
});
afterEach(cleanup);
function view(selected: Issue | null, issues: Issue[], onSelect = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProjectModelContext
          projectId="p"
          issues={issues}
          selected={selected}
          onSelect={onSelect}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe("minimal authorized Home model", () => {
  it("focuses the saved issue, links pin selection and hides the shell without marking an issue complete", async () => {
    const select = vi.fn();
    view(issue, [issue], select);
    await waitFor(() =>
      expect(mock.fly).toHaveBeenCalledWith({
        position: [4, 4.5, 6],
        target: [1, 2, 3],
        section: null,
      }),
    );
    expect(mock.markers).toHaveBeenLastCalledWith([
      {
        id: "current",
        elementId: "pipe",
        position: [1, 2, 3],
        color: "#1b3325",
      },
    ]);
    expect(mock.visible.mock.calls.at(-1)![0].has("shell")).toBe(false);
    expect(mock.colors.mock.calls.at(-1)![0].get("pipe")).not.toBe("#7fba9c");
    act(() => mock.events.get("marker")!("current"));
    expect(select).toHaveBeenCalledWith("current");
  });
  it("loads an older issue revision and excludes newer pins from its geometry", async () => {
    const older = {
      ...issue,
      id: "older",
      model_version_id: "v1",
      anchor: [9, 2, 3] as [number, number, number],
    };
    const select = vi.fn();
    view(older, [issue, older], select);
    await waitFor(() => expect(mock.markers).toHaveBeenCalled());
    expect(mock.api).toHaveBeenCalledWith("/projects/p/viewer?version=v1");
    expect(mock.api).toHaveBeenCalledWith("/projects/p/elements?version=v1");
    expect(
      mock.markers.mock.calls.at(-1)![0].map((p: { id: string }) => p.id),
    ).toEqual(["older"]);
    act(() => mock.events.get("select")!("pipe"));
    expect(select).toHaveBeenCalledWith("older");
  });
  it("does not place a legacy or unlocated issue at an invented point", async () => {
    const unlocated = {
      ...issue,
      model_version_id: null,
      element_id: null,
      zone_id: null,
      level_id: null,
    };
    view(unlocated, [unlocated]);
    expect(
      await screen.findByText(
        "This issue has no confirmed location on the displayed model.",
      ),
    ).toBeInTheDocument();
    expect(mock.fly).not.toHaveBeenCalled();
    await waitFor(() => expect(mock.markers).toHaveBeenLastCalledWith([]));
  });
});
