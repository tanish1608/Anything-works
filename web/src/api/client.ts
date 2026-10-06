// Thin fetch wrapper: attaches the access token, refreshes it once on 401, and throws ApiError.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

const KEY = "sitemesh.tokens";
type Listener = (t: Tokens | null) => void;
const listeners = new Set<Listener>();

export const tokenStore = {
  get(): Tokens | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(t: Tokens | null) {
    // Remove historical service-worker caches that were not account-scoped.
    if (typeof caches !== "undefined")
      void Promise.all(
        ["api", "model-meshes"].map((k) => caches.delete(k)),
      ).catch(() => {});
    try {
      if (t) localStorage.setItem(KEY, JSON.stringify(t));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: session-only login */
    }
    listeners.forEach((l) => l(t));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const t = tokenStore.get();
  if (!t) return false;
  refreshing ??= fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  })
    .then(async (r) => {
      if (!r.ok) {
        tokenStore.set(null);
        return false;
      }
      tokenStore.set(await r.json());
      return true;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function errorMessage(r: Response): Promise<string> {
  try {
    const body = await r.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail))
      return body.detail.map((d: { msg: string }) => d.msg).join("; ");
  } catch {
    /* not JSON */
  }
  return `${r.status} ${r.statusText}`;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const doFetch = () => {
    const headers = new Headers(rest.headers);
    const t = tokenStore.get();
    if (t) headers.set("Authorization", `Bearer ${t.access_token}`);
    if (json !== undefined) headers.set("Content-Type", "application/json");
    return fetch(`/api${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };
  let r = await doFetch();
  if (r.status === 401 && tokenStore.get() && (await refresh()))
    r = await doFetch();
  if (!r.ok) throw new ApiError(r.status, await errorMessage(r));
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? r.json() : r.blob()) as Promise<T>;
}
