import { api, ApiError } from "../api/client";
import type {
  Building,
  ElementInfo,
  ViewerManifest,
  Project,
  User,
} from "../api/types";
import { fetchModelLayer, loadPublicProject, type ModelDataset, type PublicProjectId } from "./modelData";
import { sampleLayerUrl, sampleMeshIds, sampleSlug } from "./sampleGeometry";
import { cacheKey, readModel, writeModel } from "./modelCache";

/** All private geometry remains behind the authenticated client. No public cache or sample fallback. */
export async function loadAuthorizedModel(
  projectId: string,
  version: string | null = null,
  setup = false,
) {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : "";
  const [manifest, projectInfo] = await Promise.all([
    api<ViewerManifest>(`/projects/${projectId}/viewer${suffix}`),
    api<Project>(`/projects/${projectId}`).catch(() => null),
  ]);
  // A project imported from one of our bundled sample buildings is drawn entirely from the local copy:
  // geometry, components, floors and rooms. Only work records come from the cloud (translated by IFC GUID).
  const local = !version && manifest.version ? sampleSlug(projectInfo) : null;
  if (local && manifest.version) {
    const [bundled, me] = await Promise.all([
      loadPublicProject(local as PublicProjectId),
      setup ? api<User>("/auth/me") : Promise.resolve(null),
    ]);
    const model: ModelDataset = {
      ...bundled,
      version: manifest.version.id,
      localIds: local,
      source: {
        ...bundled.source,
        attribution: `${bundled.source.attribution} · drawn from the bundled copy of this project's source`,
        ...(setup && projectInfo && me
          ? { apiProjectId: projectId, slug: `private:${me.id}:${projectId}`, name: projectInfo.name,
              approvalStatus: manifest.version.status }
          : { slug: undefined }),
      },
    };
    return { manifest, model };
  }
  type Cached = { elements: ElementInfo[]; tree: Building[]; project: Project | null; plans?: ModelDataset["plans"] };
  const key = manifest.version ? cacheKey(projectId, manifest.version.id) : null;
  const cached = await readModel<Cached>(key);
  const [elements, tree, project, user] = await Promise.all([
    cached ? cached.elements : api<ElementInfo[]>(`/projects/${projectId}/elements${suffix}`),
    cached ? cached.tree : api<Building[]>(`/projects/${projectId}/tree`),
    // Needed for setup, and to recognise a bundled sample; if it fails, geometry simply comes from the API.
    Promise.resolve(projectInfo),
    setup ? api<User>("/auth/me") : Promise.resolve(null),
  ]);
  // Projects imported from a bundled sample draw the local copy of the same geometry (much faster).
  const slug = manifest.version ? sampleSlug(project) : null;
  const meshIds = slug ? await sampleMeshIds(slug, elements) : undefined;
  const model: ModelDataset = {
    version: manifest.version?.id || "",
    source: {
      attribution: slug ? "Project IFC upload · geometry drawn from the bundled copy of the same source" : "Project IFC upload",
      license: "Private project",
      repository: "",
      revision: manifest.version?.id || "",
      ...(setup && project && user
        ? {
            apiProjectId: projectId,
            slug: `private:${user.id}:${projectId}`,
            name: project.name,
            approvalStatus: manifest.version?.status || "missing",
          }
        : {}),
    },
    layers: manifest.layers.map((l) => ({ ...l, url: slug ? sampleLayerUrl(slug, l.discipline) : l.url, bytes: 0 })),
    meshIds,
    elements: elements.map((e) => ({ ...e, props: {}, history: [] })),
    plans: setup
      ? manifest.version
        ? cached?.plans ?? (
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
  if (key && (!cached || (setup && !cached.plans)))
    void writeModel(key, { elements, tree, project, plans: setup ? model.plans : cached?.plans } satisfies Cached);
  return { manifest, model };
}
export async function loadAuthorizedLayer(url: string) {
  // Bundled sample geometry is a public static file; everything else stays behind the authenticated API.
  if (url.startsWith("/bim-")) return fetchModelLayer(url);
  return (await api<Blob>(url.replace(/^\/api/, ""))).arrayBuffer();
}
