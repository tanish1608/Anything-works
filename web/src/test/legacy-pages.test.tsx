import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "../api/client";
import ProjectLayout from "../pages/ProjectLayout";
import TodayPage from "../pages/TodayPage";
import StructurePage from "../pages/StructurePage";
import ProjectsPage from "../pages/ProjectsPage";
import LoginPage from "../pages/LoginPage";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { describe as describeEvent } from "../lib/events";

// Keep authorization/page regression checks without mounting the retired UI in App.
function LegacyPages() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <LoginPage />;
  return <Routes>
    <Route path="/" element={<ProjectsPage />} />
    <Route path="/p/:pid" element={<ProjectLayout />}>
      <Route path="today" element={<Navigate to="../home" replace />} />
      <Route path="home" element={<TodayPage />} />
      <Route path="structure" element={<StructurePage />} />
    </Route>
  </Routes>;
}

type Handler = (url: string, init?: RequestInit) => unknown;
function mockApi(routes: Record<string, Handler | unknown>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      const key = `${init?.method ?? "GET"} ${url.replace("/api", "").split("?")[0]}`;
      if (!(key in routes))
        return new Response(JSON.stringify({ detail: `unmocked ${key}` }), {
          status: 500,
        });
      const r = routes[key];
      const body = typeof r === "function" ? (r as Handler)(url, init) : r;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <LegacyPages />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  tokenStore.set(null);
});

vi.mock("../viewer/ViewerCanvas", () => ({
  default: () => <div data-testid="viewer" />,
}));

describe("retained connected components (not public routes)", () => {
  it("uses real project records in the linked Home page", async () => {
    tokenStore.set({ access_token: "a", refresh_token: "r" });
    mockApi({
      "GET /auth/me": { id: "u1", email: "pm@example.com", name: "Pat" },
      "GET /projects/p1": {
        id: "p1",
        name: "Maple Court",
        my_role: "pm",
        settings: {},
      },
      "GET /projects/p1/progress": {
        totals: { done: 2, needs_review: 1, not_started: 3 },
      },
      "GET /projects/p1/issues": [
        {
          id: "i1",
          number: 12,
          title: "Routing correction",
          status: "open",
          trade: "Plumbing",
          assignee_name: "Crew lead",
          priority: "high",
        },
      ],
      "GET /projects/p1/uploads": [],
      "GET /projects/p1/reviews": [],
      "GET /projects/p1/viewer": { version: null, layers: [] },
      "GET /projects/p1/elements": [],
    });
    renderAt("/p/p1/today");
    expect(
      await screen.findByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("#12 · Routing correction"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/1 open issues, including Routing correction/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Fixture result")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Locate Routing correction" }),
    );
    expect(
      screen.getByRole("link", { name: "Open issue & evidence →" }),
    ).toHaveAttribute("href", "/p/p1/model?issue=i1");
  });
  it("redirects to login when signed out, then signs in", async () => {
    mockApi({
      "POST /auth/login": { access_token: "a", refresh_token: "r" },
      "GET /auth/me": { id: "u1", email: "pm@example.com", name: "Pat" },
      "GET /projects": [
        {
          id: "p1",
          name: "Maple Court",
          address: null,
          settings: {},
          created_at: "",
          my_role: "pm",
        },
      ],
    });
    renderAt("/");
    await userEvent.type(
      await screen.findByLabelText("Email"),
      "pm@example.com",
    );
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Maple Court")).toBeInTheDocument();
    expect(screen.getByText("Project manager")).toBeInTheDocument();
  });

  it("hides edit controls for viewers", async () => {
    tokenStore.set({ access_token: "a", refresh_token: "r" });
    mockApi({
      "GET /auth/me": { id: "u1", email: "v@example.com", name: "Val" },
      "GET /projects/p1": {
        id: "p1",
        name: "Maple Court",
        address: null,
        settings: {},
        created_at: "",
        my_role: "viewer",
      },
      "GET /projects/p1/tree": [
        {
          id: "b1",
          project_id: "p1",
          name: "Building A",
          levels: [
            {
              id: "l1",
              building_id: "b1",
              name: "Level 3",
              index: 3,
              elevation_m: 0,
              height_m: 3,
              zones: [
                {
                  id: "z1",
                  level_id: "l1",
                  name: "Unit 304, Bedroom 2",
                  code: null,
                  kind: "room",
                  polygon: null,
                  qr_token: "t",
                },
              ],
            },
          ],
        },
      ],
    });
    renderAt("/p/p1/structure");
    expect(await screen.findByText("Unit 304, Bedroom 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByPlaceholderText("New building")).toBeNull();
  });
});

describe("activity descriptions", () => {
  it("names the entity", () => {
    const e = {
      id: 1,
      actor_name: "Pat",
      at: "",
      type: "zone.updated",
      entity_type: "zone",
      entity_id: "z",
      zone_id: "z",
      evidence_ids: [],
      data: { before: { name: "A" }, after: { name: "B" } },
      message: null,
    };
    expect(describeEvent(e)).toBe("updated zone “B”");
  });
});
