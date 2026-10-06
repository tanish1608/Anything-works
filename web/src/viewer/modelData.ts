import type { ElementDetail } from "../api/types";
import type { ModelPlanData } from "./ModelPlan";

export interface ModelDataset {
  version: string;
  source: {
    attribution: string;
    license: string;
    repository: string;
    revision: string;
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
