import type { ElementDetail } from "../api/types";
import type { ModelPlanData } from "./ModelPlan";

export interface ModelDataset {
  version: string;
  source: {
    attribution: string;
    license: string;
    repository: string;
    revision: string;
    name?: string;
    slug?: string;
    room_units?: Record<string, string>;
  };
  layers: {
    discipline: string;
    context: boolean;
    url: string;
    bytes: number;
  }[];
  elements: ElementDetail[];
  plans: ModelPlanData[];
  audit: {
    elements: number;
    rooms: number;
    levels: number;
    mesh_bytes: number;
    bedroom_fitting: { id: string } | null;
  };
}
/** Public sample only; authorized uploads use their own API manifest and loader. */
let publicDataset: Promise<ModelDataset> | undefined;
export const PUBLIC_PROJECTS = [
  { id: "duplex", name: "Duplex Apartment", url: "/bim-duplex/model.json" },
  {
    id: "schependomlaan",
    name: "Schependomlaan Apartments",
    url: "/bim-schependomlaan/model.json",
  },
] as const;
export type PublicProjectId = (typeof PUBLIC_PROJECTS)[number]["id"];
const projectDatasets = new Map<string, Promise<ModelDataset>>();
export function loadPublicProject(id: PublicProjectId): Promise<ModelDataset> {
  if (id === "duplex") return loadDemoModel();
  const project = PUBLIC_PROJECTS.find((p) => p.id === id)!;
  if (!projectDatasets.has(id))
    projectDatasets.set(
      id,
      fetch(project.url)
        .then((r) => {
          if (!r.ok) throw Error("The project model could not load.");
          return r.json();
        })
        .catch((e) => {
          projectDatasets.delete(id);
          throw e;
        }),
    );
  return projectDatasets.get(id)!;
}
export function loadDemoModel(): Promise<ModelDataset> {
  if (!publicDataset)
    publicDataset = fetch("/bim-duplex/model.json")
      .then((r) => {
        if (!r.ok) throw Error("The shared project model could not load.");
        return r.json();
      })
      .catch((e) => {
        publicDataset = undefined;
        throw e;
      });
  return publicDataset;
}
export async function fetchModelLayer(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw Error("The model geometry could not load.");
  return r.arrayBuffer();
}
