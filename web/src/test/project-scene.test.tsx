import { useEffect, useRef } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProjectScene from "../viewer/ProjectScene";
import type { ModelDataset } from "../viewer/modelData";
import type { SiteViewer } from "../viewer/Viewer";
const calls = vi.hoisted(() => ({
  load: vi.fn(async () => {}),
  frame: vi.fn(),
  focus: vi.fn(() => true),
  offsets: vi.fn(async (_offsets: Map<string, number>) => {}),
  markers: vi.fn(),
  rotate: vi.fn(),
  events: new Map<string, (...args: unknown[]) => void>(),
}));
vi.mock("../viewer/ViewerCanvas", () => ({
  default: function Stub({
    onReady,
  }: {
    onReady: (v: SiteViewer | null) => void;
  }) {
    const cb = useRef(onReady);
    useEffect(() => {
      const ready = cb.current;
      ready({
        loadLayers: calls.load,
        setExplodedOffsets: calls.offsets,
        frame: calls.frame,
        focusOn: calls.focus,
        clearCutaway: () => {},
        setMarkers: calls.markers,
        setAutoRotate: calls.rotate,
        setVisible: () => {},
        setColors: () => {},
        select: () => {},
        setGhostContext: () => {},
        on: (event: string, callback: (...args: unknown[]) => void) =>
          calls.events.set(event, callback),
      } as unknown as SiteViewer);
      return () => ready(null);
    }, []);
    return <div />;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  calls.events.clear();
});
it("starts showroom rotation only after geometry loads and disables it when leaving the scene", async () => {
  let finish!: (value: ArrayBuffer) => void;
  const loader = vi.fn(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finish = resolve;
      }),
  );
  const interaction = vi.fn();
  const view = render(
    <ProjectScene
      data={data}
      visible={visible}
      colors={colors}
      markers={markers}
      loader={loader}
      autoRotate
      orbitFit
      onInteraction={interaction}
    />,
  );
  await waitFor(() => expect(loader).toHaveBeenCalled());
  expect(calls.rotate).not.toHaveBeenCalledWith(true);
  finish(new ArrayBuffer(1));
  await waitFor(() => expect(calls.rotate).toHaveBeenLastCalledWith(true));
  await waitFor(() =>
    expect(calls.frame).toHaveBeenCalledWith(["pipe"], "iso", true),
  );
  calls.events.get("interaction")!();
  expect(interaction).toHaveBeenCalledOnce();
  view.unmount();
  expect(calls.rotate).toHaveBeenLastCalledWith(false);
});
const data = {
  version: "revision",
  layers: [
    { discipline: "plumbing", context: false, url: "/pipe.glb", bytes: 1 },
  ],
  elements: [{ id: "pipe", level_id: "upper" }],
  plans: [
    { id: "lower", elevation_m: 0 },
    { id: "upper", elevation_m: 3 },
  ],
} as ModelDataset;
const visible = new Set(["pipe"]),
  colors = new Map([["pipe", "#047857"]]),
  markers = [
    {
      id: "work",
      elementId: "pipe",
      position: [1, 2, 3] as [number, number, number],
      color: "#047857",
    },
  ];
it("fits the whole model first, then waits for exploded floors before framing the linked pin, without reloading geometry", async () => {
  const loader = vi.fn(async () => new ArrayBuffer(1));
  const view = render(
    <ProjectScene
      data={data}
      visible={visible}
      colors={colors}
      markers={markers}
      loader={loader}
    />,
  );
  await waitFor(() =>
    expect(calls.frame).toHaveBeenCalledWith(["pipe"], "iso"),
  );
  expect(calls.offsets.mock.calls.at(-1)![0].get("pipe")).toBe(0);
  calls.frame.mockClear();
  let finish!: () => void;
  calls.offsets.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const focus = { element: "pipe", token: 1 };
  view.rerender(
    <ProjectScene
      data={data}
      visible={visible}
      colors={colors}
      markers={markers}
      loader={loader}
      expanded
      focus={focus}
    />,
  );
  await waitFor(() =>
    expect(calls.offsets.mock.calls.at(-1)![0].get("pipe")).toBe(3),
  );
  expect(calls.focus).not.toHaveBeenCalled();
  finish();
  // A record focus cuts away what is above the component and frames it in place.
  await waitFor(() => expect(calls.focus).toHaveBeenCalledWith("pipe", false));
  view.rerender(
    <ProjectScene
      data={data}
      visible={visible}
      colors={new Map([["pipe", "#ef4444"]])}
      markers={markers}
      loader={loader}
      expanded
      focus={focus}
    />,
  );
  expect(loader).toHaveBeenCalledTimes(1);
  expect(calls.load).toHaveBeenCalledTimes(1);
  expect(calls.markers).toHaveBeenLastCalledWith(markers);
});
