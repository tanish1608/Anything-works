import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { tokenStore } from "../api/client";
import { cacheKey, readModel, writeModel } from "../viewer/modelCache";

const jwt = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.y`;
afterEach(() => tokenStore.set(null));

it("caches model metadata per account and version, and clears it when the account changes", async () => {
  tokenStore.set({ access_token: jwt("alex"), refresh_token: "r" });
  const key = cacheKey("project-1", "version-1");
  expect(key).toBe("alex:project-1:version-1");
  await writeModel(key, { elements: [{ id: "e1" }] });
  expect(await readModel(key)).toEqual({ elements: [{ id: "e1" }] });
  tokenStore.set({ access_token: jwt("maya"), refresh_token: "r" });
  await new Promise((r) => setTimeout(r, 50));
  expect(await readModel(key)).toBeUndefined(); // another person never sees the previous account's cache
  tokenStore.set(null);
  expect(cacheKey("project-1", "version-1")).toBeNull(); // signed out: nothing cached
});
