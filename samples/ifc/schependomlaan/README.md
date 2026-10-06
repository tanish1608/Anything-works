# Schependomlaan apartment-block test project

This second public building tests design iteration 2 with a larger real residential source. Original design model by **ROOT bv for Hendriks Bouw en Ontwikkeling**. Dataset collected by **Stijn van Schaijk, TU Eindhoven**, with TNO and RAAMAC, and redistributed by the buildingSMART community.

- [Pinned source folder](https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20(IFC%202x3)/Schependomlaan)
- [Source repository license](https://github.com/buildingsmart-community/Community-Sample-Test-Files/blob/7ddf57a201f88a0c213d5322b02ed15e94a60a40/LICENSE): CC BY 4.0; original author attribution retained.
- [Source README](https://github.com/buildingsmart-community/Community-Sample-Test-Files/blob/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20(IFC%202x3)/Schependomlaan/README.md): dataset context, contributors and source-quality cautions.

The unchanged 49,286,967-byte IFC stays untracked. [source.json](source.json) pins its SHA-256 and reviewed display associations. Generated GLBs, properties and model-derived plans in `web/public/bim-schependomlaan` are attributed derivatives, not approved drawings or evidence of installed work.

## Measured import

See [AUDIT.json](AUDIT.json): 3,504 rendered components, six source levels, 260,094 triangles and 4,734,560 bytes of GLB geometry. The six levels include foundation, four residential levels and roof; this is not a six-storey residential tower. Geometry covers architecture (2,935), structure (206), plumbing (60) and other source elements (303). There is no invented electrical/HVAC federation.

All 100 source space outlines are recovered: six from tessellated geometry and 94 from explicit closed IFC FootPrint polylines. The previous importer recovered only the six solids. Footprints retain source placement and units; bounding boxes and unsupported/open curves do not become fabricated room polygons.

The source has two `1.02 · toilet` space records. The importer now preserves their distinct IFC space GUIDs, yielding **100 distinct room records** without inventing new room numbers. Display labels show a source identity suffix when necessary. Numbered source labels are explicitly grouped into Units 1–10 for this pinned sample; A-prefixed circulation/service spaces stay shared. Room/component overlap assignments require location confirmation. None of the 60 plumbing elements is assigned to a source room by the current overlap rule; do not force them into apartment bathrooms.

## Reproduce and test

From `backend/`:

```bash
VISION_MODE=off .venv/bin/python -m app.bim.audit --source ../samples/ifc/schependomlaan --download
.venv/bin/pytest -q tests/test_apartment_upload.py
```

The audit creates an isolated in-memory project/storage and exports stable public element/floor/room IDs. The upload acceptance uses disposable test database/storage, real multipart IFC upload, the normal job/import path, draft approval, authorization, mesh/plan access and synthetic photo-backed human review. It checks that an open issue overrides completion and that review leaves the original GLB bytes unchanged. No AI is called. [UPLOAD_TEST.json](UPLOAD_TEST.json) records the measured run; the test skips when the untracked IFC is absent.

Open `/?project=schependomlaan` in the website, or use the project switcher. The project begins with **no field progress**. Select/search a source component, choose **Track work here**, supply a title/owner, then submit a daily update. Records, drafts, decisions and availability save separately from the duplex. Source geometry presence never implies construction completion.

The website currently selects bundled public projects. This API upload test does not mean arbitrary IFC upload, private-project onboarding or multi-user synchronization is connected to the public UI. Browser/WebGL and phone visual checks remain unverified.
