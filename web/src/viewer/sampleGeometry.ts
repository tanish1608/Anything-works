/**
 * Bundled geometry for cloud projects imported from our public sample buildings.
 *
 * The website ships each sample's GLB layers under /bim-<slug>/. A cloud project imported from the same pinned
 * IFC files has identical components, but different element IDs: bundled meshes are named
 * uuid5(URL namespace, "<slug>:<IFC GUID>") while the database assigns its own. Loading the local files and
 * renaming meshes by IFC GUID gives the same building without downloading tens of megabytes from the API.
 * Live data (work, evidence, status) still comes from the cloud.
 */
const URL_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

const SAMPLE_BY_NAME: Record<string, string> = {
  "Duplex Apartment — detailed BIM": "duplex",
  "Duplex Apartment": "duplex",
  "Schependomlaan Apartments": "schependomlaan",
  "Medical-Dental Clinic": "clinic",
  "Esplan Building": "esplan",
};

export function sampleSlug(project: { name: string; settings?: Record<string, unknown> | null } | null): string | null {
  if (!project) return null;
  const configured = project.settings?.sample_slug;
  if (typeof configured === "string" && /^[a-z]+$/.test(configured)) return configured;
  return SAMPLE_BY_NAME[project.name] ?? null;
}

function bytesOf(uuid: string) {
  const hex = uuid.replace(/-/g, "");
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}

/** RFC 4122 version-5 UUID (same as Python's uuid.uuid5). */
export async function uuid5(name: string, namespace = URL_NAMESPACE): Promise<string> {
  const ns = bytesOf(namespace);
  const text = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + text.length);
  input.set(ns);
  input.set(text, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = [...hash].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Bundled mesh name -> cloud element ID, matched by IFC GUID. */
export async function sampleMeshIds(slug: string, elements: { id: string; ifc_guid?: string | null }[]) {
  const pairs = await Promise.all(
    elements.filter((e) => e.ifc_guid).map(async (e) => [await uuid5(`${slug}:${e.ifc_guid}`), e.id] as const),
  );
  return new Map(pairs);
}

export function sampleLayerUrl(slug: string, discipline: string) {
  return `/bim-${slug}/${discipline}.glb`;
}
