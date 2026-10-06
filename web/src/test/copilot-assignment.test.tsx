import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ModelDataset } from "../viewer/modelData";
import Workspace from "../workspace/Workspace";
import { projectStorageKey } from "../workspace/projectState";

const model = JSON.parse(readFileSync("public/bim-duplex/model.json", "utf8")) as ModelDataset;
vi.mock("../viewer/modelData", async original => ({ ...await original<typeof import("../viewer/modelData")>(), loadDemoModel: async () => model }));
vi.mock("../workspace/BuildingCanvas", () => ({ default: () => <div data-testid="shared-building" /> }));
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); });

it("assigns the responsible trade without a calendar and preserves completion and the recorded deadline", async () => {
  render(<MemoryRouter initialEntries={["/?panel=record&work=ISS-031"]}><Workspace /></MemoryRouter>);
  await screen.findByRole("complementary", { name: "Work record" });
  const copilot = within(screen.getByRole("region", { name: "Project Copilot" }));
  fireEvent.click(copilot.getByRole("button", { name: "Open Project Copilot" }));
  fireEvent.click(copilot.getByRole("button", { name: "Assign" }));
  const form = within(copilot.getByRole("region", { name: "Assign responsible trade" }));
  expect(form.getByLabelText("Work")).toHaveValue("ISS-031");
  expect(form.queryByText("Connect calendar export")).not.toBeInTheDocument();
  expect(form.getByRole("button", { name: "Review assignment" })).toBeDisabled();
  fireEvent.change(form.getByLabelText("Responsible person"), { target: { value: "Apex Mechanical · Marco Rossi" } });
  fireEvent.change(form.getByLabelText("Task instruction"), { target: { value: "Review pipe connection with the plumbing lead and submit fix photos" } });
  fireEvent.click(form.getByLabelText("I confirm this person is qualified for this work."));
  fireEvent.click(form.getByRole("button", { name: "Review assignment" }));
  fireEvent.click(form.getByRole("button", { name: "Confirm assignment" }));
  await form.findByText("Responsible trade assigned. Completion unchanged.");
  const saved = JSON.parse(localStorage.getItem(projectStorageKey(model))!);
  const work = saved.items.find((item: { id: string }) => item.id === "ISS-031");
  expect(work).toMatchObject({ owner: "Apex Mechanical · Marco Rossi", due: "2026-10-06T17:00", status: "issue" });
  expect(saved.events[0].text).toContain("Review pipe connection");
  expect(screen.getAllByTestId("shared-building")).toHaveLength(1);
});
