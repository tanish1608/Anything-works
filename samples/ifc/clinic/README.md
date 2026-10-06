# Medical-Dental Clinic coordination sample

This third public project adds a larger multi-discipline coordination case. The source describes a redacted two-storey clinic, with sample engineering models created for coordination/COBie testing. It does not establish installed work or engineering completeness.

- [Pinned source and author notes](https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20(IFC%202x3)/Medical-Dental%20Clinic).
- Attribution: **BSI (2020) Medical-Dental Test Files, buildingSMART International**, distributed through the linked buildingSMART repository under **CC BY 4.0**. Our changes are IFC-to-GLB/plan/property derivatives and explicit display-name federation; original IFCs are unchanged.
- [source.json](source.json) records the revision, five original file SHA-256s, attribution and sample-specific label mappings. IFC downloads stay untracked.

## Measured result

[AUDIT.json](AUDIT.json) records **16,071 rendered components**, **four source levels**, **798 source-space records**, **4,842,703 triangles**, and **51,566,484 bytes of meshes**. The detailed manifest is approximately **59 MB**. This is deliberately a heavy coordination sample; phone loading, memory and frame-rate acceptance remain pending.

Layers: architecture 1,998, structure 1,563, plumbing 6,764, electrical 2,082, HVAC 3,632 and other 32. Four source levels include foundation and roof; the source describes two occupied storeys. The 798 space records come from multiple disciplines and are not a claim of 798 different physical rooms. Distinct source GUIDs remain distinct; a reviewed physical-room reconciliation is future work. No apartment numbers are inferred.

The source discipline files use unnamed/`Medical Clinic` building labels and `First Floor`/`Level 1`, `Second Floor`/`Level 2`, `Roof - Main`/`Roof - Mech` names. Their metre-normalized elevations and common geometry extent were checked before recording the explicit mappings in source.json. Display labels are unified; world geometry, units and GUIDs are unchanged. Unknown names are preserved. Arbitrary client uploads are not automatically granted this mapping: a client-facing federation review UI is pending. Server import can consume explicitly configured `model_building_aliases` and building-scoped `model_level_aliases`; these settings are not exposed by the current public settings form.

## Reproduce

From `backend/`:

```bash
VISION_MODE=off .venv/bin/python -m app.bim.audit --source ../samples/ifc/clinic --download
```

The audit uses isolated in-memory database/storage and does not reset existing projects or invoke AI. It exports stable component/floor/space identities and records source products that did not render. See the audit rather than assuming 100% source coverage.

Open `/?project=clinic` or select Medical-Dental Clinic in the showroom. Work & issues opens with **No field updates yet**. Use Explore building work → a source component → Track work here to create local planned work, then upload daily photos for manual review. Records stay under this project's own local key. The model is design context, not completion evidence.
