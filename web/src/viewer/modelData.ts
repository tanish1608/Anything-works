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
    apiProjectId?: string;
    approvalStatus?: string;
  };
  layers: {
    discipline: string;
    context: boolean;
    url: string;
    bytes: number;
  }[];
  elements: ElementDetail[];
  /** Bundled sample meshes are renamed to these element IDs when drawn (see sampleGeometry.ts). */
  meshIds?: Map<string, string>;
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
  {
    id: "duplex",
    name: "Duplex Apartment",
    url: "/bim-duplex/model.json",
    category: "Residential",
    description:
      "A two-unit residential building with detailed plumbing, electrical and mechanical systems.",
  },
  {
    id: "schependomlaan",
    name: "Schependomlaan Apartments",
    url: "/bim-schependomlaan/model.json",
    category: "Residential",
    description:
      "A larger residential block with ten reviewed apartment groups, shared spaces and detailed source components.",
  },
  {
    id: "clinic",
    name: "Medical-Dental Clinic",
    url: "/bim-clinic/model.json",
    category: "Healthcare",
    description:
      "A two-storey clinic with architecture, structure and sample engineering systems for detailed coordination workflows.",
  },
  {
    id: "esplan",
    name: "Esplan Building",
    url: "/bim-esplan/model.json",
    category: "Architectural source",
    description:
      "A detailed building from Estonia with source rooms, levels and architectural components. No field progress is inferred.",
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
