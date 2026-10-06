// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tokenStore } from "../api/client";
import { discardUpdate, getDraft, pendingUpdates, queueWorkUpdate, saveDraft, syncWorkUpdates } from "../workspace/workflowQueue";
import type { Draft } from "../workspace/state";
const draft: Draft = { clientId: "durable-capture", item: "work", note: "Installed, please review", claim: "Reported complete", step: 1,
  photos: [{ id: "local-photo", sample: false, url: "data:image/jpeg;base64,dGVzdA==", name: "photo.jpg" }] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => values.get(k) || null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  vi.stubGlobal("navigator", { onLine: true });
  tokenStore.set({ access_token: "crew-session", refresh_token: "r" });
  for (const u of await pendingUpdates("crew", "p")) await discardUpdate(u.client_uuid);
  await saveDraft("crew", "p", null); await saveDraft("other", "p", null);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fetcher() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).startsWith("data:")) return new Response(new Blob(["photo"], { type: "image/jpeg" }));
    if (url === "/api/auth/me") return response({ id: "crew" });
    throw Error("Network lost");
  });
}
it("stores drafts by account and keeps one stable upload identity through a lost response and retry", async () => {
  const f = fetcher();
  await saveDraft("crew", "p", draft);
  expect(await getDraft("other", "p")).toBeUndefined();
  const queued = await queueWorkUpdate("crew", "p", "v1", draft);
  expect(queued.client_uuid).toBe("durable-capture");
  expect(await getDraft("crew", "p")).toBeUndefined();
  expect(await pendingUpdates("other", "p")).toHaveLength(0);
  expect(await syncWorkUpdates("crew", "p")).toBe(0);
  expect((await pendingUpdates("crew", "p"))[0].state).toBe("queued");
  f.mockImplementation(async (url, init) => {
    if (url === "/api/auth/me") return response({ id: "crew" });
    const body = init!.body as FormData;
    expect(body.get("client_uuid")).toBe("durable-capture"); expect(body.get("captured_by")).toBe("crew");
    expect(body.get("model_version_id")).toBe("v1"); expect(body.get("files")).toBeInstanceOf(File);
    return response({ received: true, upload_id: "one-server-receipt" }, 201);
  });
  expect(await syncWorkUpdates("crew", "p")).toBe(1);
  expect(await pendingUpdates("crew", "p")).toHaveLength(0);
});
it("does not send another account's photos and preserves permanent failures for reconfirmation", async () => {
  const f = fetcher(); await queueWorkUpdate("crew", "p", "v1", draft);
  f.mockResolvedValue(response({ id: "other" }));
  expect(await syncWorkUpdates("crew", "p")).toBe(0);
  expect(f).toHaveBeenLastCalledWith("/api/auth/me", expect.anything());
  f.mockImplementation(async (url) => url === "/api/auth/me" ? response({ id: "crew" }) : response({ detail: "Approved model changed" }, 409));
  expect(await syncWorkUpdates("crew", "p")).toBe(0);
  const [failed] = await pendingUpdates("crew", "p");
  expect(failed.state).toBe("failed"); expect(failed.files[0].blob.size).toBeGreaterThan(0);
  expect(failed.error).toMatch("Approved model changed");
  const calls = f.mock.calls.length;
  await syncWorkUpdates("crew", "p"); expect(f.mock.calls.length).toBe(calls + 1); // auth check only, no repeated rejected upload
});
it("refuses generated sample evidence on private projects", async () => {
  await expect(queueWorkUpdate("crew", "p", "v1", { ...draft, photos: [{ ...draft.photos[0], sample: true }] })).rejects.toThrow("actual photos");
});

it("retains photos and a retryable error if preparing multipart fails before any upload", async () => {
  const f = fetcher();
  await queueWorkUpdate("crew", "p", "v1", draft);
  vi.stubGlobal("FormData", class { append() { throw Error("Unable to prepare photo upload"); } });
  expect(await syncWorkUpdates("crew", "p")).toBe(0);
  const [queued] = await pendingUpdates("crew", "p");
  expect(queued.state).toBe("queued");
  expect(queued.error).toBe("Unable to prepare photo upload");
  expect(queued.files[0].blob.size).toBeGreaterThan(0);
  expect(f.mock.calls.some(([url]) => String(url).endsWith("/updates"))).toBe(false);
});
