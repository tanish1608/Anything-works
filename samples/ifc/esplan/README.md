# Esplan building architectural sample

The fourth public project is a detailed IFC building example from Estonia, supplied by **Esplan** and distributed under **CC BY 4.0** through buildingSMART Community Sample Test Files.

- [Pinned source folder and author notes](https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20(IFC%202x3)/Esplanades).
- [source.json](source.json) records the unchanged original's SHA-256, repository revision, license and attribution. Our modifications are IFC-to-GLB/plan/property derivatives; the original source stays untracked and unchanged.

## Measured result and fidelity

[AUDIT.json](AUDIT.json): **1,958 rendered components**, **seven source levels**, **285 source spaces**, **157,367 triangles** and **1,340,956 bytes of GLBs**, with a **3.98 MB manifest**. The levels include foundation (`Vundament`), five numbered levels and roof (`Katus`); original names remain. There are architecture, structural and other components, with no invented MEP systems or reviewed unit grouping.

The model uses survey coordinates around 538,000 m / 6,591,000 m. Direct float32 world-coordinate vertices would lose small detail. The exporter now stores local vertices with a precise world translation on each large-coordinate mesh node. Source bounds, plans, room polygons, component IDs and pin world coordinates are unchanged. Small-coordinate existing exports retain their format. Regression tests check centimetre detail at survey coordinates; viewer geometry tests check actual source-node bounds and picking. This is representation precision, not a guessed measurement or relocation of the project.

## Reproduce

From `backend/`:

```bash
VISION_MODE=off .venv/bin/python -m app.bim.audit --source ../samples/ifc/esplan --download
```

The importer uses isolated database/storage and records missing/unsupported geometry rather than fabricating it. The source files are reference examples, not approved drawings for a client project.

Open `/?project=esplan` or select Esplan Building in the showroom. It starts with no inferred field progress. The issues panel guides you to select a source component and create planned work before uploading evidence. Project-local records and drafts stay separate from the other samples.
