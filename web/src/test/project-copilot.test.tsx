import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ModelDataset } from "../viewer/modelData";
import Workspace from "../workspace/Workspace";

const model = JSON.parse(readFileSync("public/bim-duplex/model.json", "utf8")) as ModelDataset;
vi.mock("../viewer/modelData", async (original) => ({
  ...(await original<typeof import("../viewer/modelData")>()),
  loadDemoModel: async () => model,
}));
vi.mock("../workspace/BuildingCanvas", () => ({ default: () => <div data-testid="shared-building" /> }));
vi.mock("../workspace/photoInput", () => ({
  readPhoto: async (file: File) => ({ id: file.name, name: file.name, sample: false, url: "data:image/jpeg;base64,cHJldmlldw==" }),
}));
const chat = vi.fn();
beforeEach(() => {
  localStorage.clear();
  chat.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/copilot/public-chat")) {
      const body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify(chat(body)), { headers: { "content-type": "application/json" } });
    }
    throw Error(`unexpected ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const copilot = () => within(screen.getByRole("region", { name: "Timber" }));
const saved = () => Object.keys(localStorage).map((k) => { try { return JSON.parse(localStorage.getItem(k)!); } catch { return null; } })
  .find((r) => r?.items?.some((i: { id: string }) => i.id === "ISS-031"));

async function sendPhoto(note: string) {
  fireEvent.click(copilot().getByRole("button", { name: "Open Timber" }));
  fireEvent.change(copilot().getByLabelText("Attach work photos"), { target: { files: [new File(["x"], "fix.jpg", { type: "image/jpeg" })] } });
  await copilot().findByRole("img", { name: "fix.jpg" });
  await userEvent.type(copilot().getByLabelText("Message Timber"), note);
  await userEvent.click(copilot().getByRole("button", { name: "Send" }));
}

it("routes chat photos to the suggested work and requires location confirmation", async () => {
  chat.mockImplementation((body) => ({ input_revision: body.input_revision, status: "available",
    message: "These look like the bedroom pipe correction.", suggested_questions: [], work_ids: ["ISS-031"], sources: [] }));
  render(<MemoryRouter initialEntries={["/?panel=issues"]}><Workspace /></MemoryRouter>);
  await screen.findByRole("complementary", { name: "Work & issues" });
  await sendPhoto("Re-made the bedroom pipe joint");
  const sent = chat.mock.calls[0][0];
  expect(sent.attachments).toBe(1);
  expect(sent.candidate_work_ids).toContain("ISS-031");
  expect(JSON.parse(sent.display_context).work.length).toBeGreaterThan(0);
  const card = within(await copilot().findByRole("article", { name: "Send photos as a daily update" }));
  expect(card.getByLabelText("Work item")).toHaveValue("ISS-031");
  const submit = card.getByRole("button", { name: "Submit update" });
  expect(submit).toBeDisabled(); // location must be confirmed first
  await userEvent.click(card.getByRole("checkbox"));
  await userEvent.click(submit);
  await copilot().findByText(/photo\(s\) sent to/);
  await waitFor(() => {
    const issue = saved().items.find((i: { id: string }) => i.id === "ISS-031");
    expect(issue.photos.some((p: { name: string }) => p.name === "fix.jpg")).toBe(true);
    expect(issue.status).toBe("issue"); // a correction never resolves the issue by itself
  });
});

it("still lets people send photos when the AI is unavailable, without guessing the work", async () => {
  chat.mockImplementation((body) => ({ input_revision: body.input_revision, status: "unavailable",
    message: "Copilot chat is turned off on this server.", suggested_questions: [], work_ids: [], sources: [] }));
  render(<MemoryRouter initialEntries={["/?panel=issues"]}><Workspace /></MemoryRouter>);
  await screen.findByRole("complementary", { name: "Work & issues" });
  await sendPhoto("Outlet boxes installed");
  const card = within(await copilot().findByRole("article", { name: "Send photos as a daily update" }));
  expect(card.getByLabelText("Work item")).toHaveValue("");
  expect(card.getByRole("button", { name: "Submit update" })).toBeDisabled();
});

it("keeps customers read-only: they can ask but not attach photos", async () => {
  render(<MemoryRouter initialEntries={["/?panel=issues"]}><Workspace /></MemoryRouter>);
  await screen.findByRole("complementary", { name: "Work & issues" });
  await userEvent.click(screen.getByLabelText("Open project menu"));
  await userEvent.selectOptions(screen.getByLabelText("Preview user experience"), "customer");
  fireEvent.click(copilot().getByRole("button", { name: "Open Timber" }));
  expect(copilot().getByRole("button", { name: "Attach photo" })).toBeDisabled();
});
