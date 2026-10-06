import { api, ApiError } from "../api/client";
import type {
  Building,
  ElementInfo,
  ViewerManifest,
  Project,
  User,
} from "../api/types";
import type { ModelDataset } from "./modelData";

/** All private geometry remains behind the authenticated client. No public cache or sample fallback. */
export async function loadAuthorizedModel(
  projectId: string,
  version: string | null = null,
  setup = false,
) {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : "";
  const [manifest, elements, tree, project, user] = await Promise.all([
    api<ViewerManifest>(`/projects/${projectId}/viewer${suffix}`),
    api<ElementInfo[]>(`/projects/${projectId}/elements${suffix}`),
    api<Building[]>(`/projects/${projectId}/tree`),
    setup ? api<Project>(`/projects/${projectId}`) : Promise.resolve(null),
    setup ? api<User>("/auth/me") : Promise.resolve(null),
  ]);
  const model: ModelDataset = {
    version: manifest.version?.id || "",
    source: {
      attribution: "Project IFC upload",
      license: "Private project",
      repository: "",
      revision: manifest.version?.id || "",
      ...(project && user
        ? {
            apiProjectId: projectId,
            slug: `private:${user.id}:${projectId}`,
            name: project.name,
            approvalStatus: manifest.version?.status || "missing",
          }
        : {}),
    },
    layers: manifest.layers.map((l) => ({ ...l, bytes: 0 })),
    elements: elements.map((e) => ({ ...e, props: {}, history: [] })),
    plans: setup
      ? manifest.version
        ? (
            await Promise.all(
              tree
                .flatMap((b) => b.levels)
                .map(async (l) => {
                  try {
                    return await api<ModelDataset["plans"][number]>(
                      `/models/${manifest.version!.id}/plans/${l.id}`,
                    );
                  } catch (e) {
                    if (e instanceof ApiError && e.status === 404) return null;
                    throw e;
                  }
                }),
            )
          ).filter((p): p is ModelDataset["plans"][number] => p !== null)
        : []
      : tree.flatMap((b) =>
          b.levels.map((l) => ({
            id: l.id,
            name: `${b.name} · ${l.name}`,
            elevation_m: l.elevation_m,
            provenance: "IFC spatial hierarchy",
            elements: [],
            rooms: l.zones.map((z) => ({
              id: z.id,
              name: z.name,
              code: z.code,
              polygon: z.polygon || [],
            })),
          })),
        ),
    audit: {
      elements: elements.length,
      rooms: tree.flatMap((b) => b.levels.flatMap((l) => l.zones)).length,
      levels: tree.flatMap((b) => b.levels).length,
      mesh_bytes: 0,
      bedroom_fitting: null,
    },
  };
  return { manifest, model };
}
export async function loadAuthorizedLayer(url: string) {
  return (await api<Blob>(url.replace(/^\/api/, ""))).arrayBuffer();
}
