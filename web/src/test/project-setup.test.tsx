import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import ProjectSetupPage from "../pages/ProjectSetupPage";
const api = vi.hoisted(() => vi.fn());
vi.mock("../api/client", () => ({ api }));
vi.mock("../pages/ProjectLayout", () => ({
  useProject: () => ({ project: { id: "p", my_role: "pm" } }),
}));
vi.mock("../api/jobs", () => ({
  waitForJob: async () => ({ status: "done", result: { version_id: "draft" } }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("guides a first upload into review and requires explicit baseline approval before exposing field capture", async () => {
  let imported = false,
    approved = false;
  api.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.endsWith("/models/import")) {
      imported = true;
      return { id: "job" };
    }
    if (path === "/models/draft/approve") {
      approved = true;
      return {};
    }
    if (path.endsWith("/models"))
      return imported
        ? [
            {
              id: "draft",
              number: 1,
              message: "First upload",
              status: approved ? "approved" : "draft",
              is_current: approved,
            },
          ]
        : [];
    if (path.endsWith("/tree"))
      return [
        {
          id: "b",
          levels: [
            { id: "l", name: "Level 1", zones: [{ id: "r", name: "Bedroom" }] },
          ],
        },
      ];
    if (path.includes("/elements"))
      return [{ id: "pipe", level_id: "l", zone_id: "r" }];
    throw Error("Unexpected " + path + " " + init?.method);
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/p/p/setup"]}>
        <ProjectSetupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText("Upload your first IFC to continue."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Open field capture →" }),
  ).not.toBeInTheDocument();
  await user.upload(
    screen.getByLabelText(/IFC files/),
    new File(["ISO-10303-21;"], "building.ifc", {
      type: "application/octet-stream",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Upload as draft" }));
  expect(
    await screen.findByRole("button", { name: "Approve model baseline" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("link", { name: /Inspect draft in 3D/ }),
  ).toHaveAttribute("href", "/p/p/model?version=draft");
  expect(api.mock.calls.some((c) => c[0] === "/models/draft/approve")).toBe(
    false,
  );
  await user.click(
    screen.getByRole("checkbox", { name: /I reviewed this revision/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Approve model baseline" }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", { name: "Approve model baseline" }),
  );
  expect(
    await screen.findByText("The approved baseline is active."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Open field capture →" }),
  ).toHaveAttribute("href", "/field/p");
});
