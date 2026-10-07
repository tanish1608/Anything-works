import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleLayerUrl, sampleMeshIds, sampleSlug, uuid5 } from "../viewer/sampleGeometry";

describe("bundled sample geometry for cloud projects", () => {
  it("computes the same version-5 UUID as Python's uuid.uuid5", async () => {
    expect(await uuid5("clinic:2O2Fr$t4X7Zf8NOew3FLKI")).toBe("391d0da7-cb37-59f5-b8df-eb4cc5c7935a");
  });

  it("maps every bundled duplex mesh to the project's element by IFC GUID", async () => {
    const local = JSON.parse(readFileSync("public/bim-duplex/model.json", "utf8")) as { elements: { id: string; ifc_guid: string }[] };
    // A cloud project has its own element IDs for the same IFC components.
    const cloud = local.elements.map((e, i) => ({ id: `cloud-${i}`, ifc_guid: e.ifc_guid }));
    const ids = await sampleMeshIds("duplex", cloud);
    expect(ids.size).toBe(local.elements.length);
    expect(ids.get(local.elements[0].id)).toBe("cloud-0");
  });

  it("recognises imported samples by setting or name, never arbitrary uploads", () => {
    expect(sampleSlug({ name: "Medical-Dental Clinic" })).toBe("clinic");
    expect(sampleSlug({ name: "Anything", settings: { sample_slug: "esplan" } })).toBe("esplan");
    expect(sampleSlug({ name: "My new house" })).toBeNull();
    expect(sampleLayerUrl("clinic", "plumbing")).toBe("/bim-clinic/plumbing.glb");
  });
});
