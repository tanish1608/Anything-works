# P3: detailed BIM import and inspection

Verified October 6, 2026 and integrated into the app's Building flow. This work replaces assumptions about our procedural demo with a measured import of a public residential BIM dataset. It does not validate live AI photo checking.

## Open and test

Open `/demo/building` for the simple everyday viewer: a full-width canvas, floating **Level**, **View** and **Layers**, and a top-right preview that switches between 3D and 2D. The preview uses the actual level silhouette or a snapshot of the loaded model. Both inspection sidebars and the project tabs are removed from this surface. The same renderer stays mounted during switching; filters are retained and 2D supports pan, wheel/pinch zoom and component selection. Existing local progress colors/pins are projected without exposing review authoring here.

Open `/bim-lab` for the detailed workbench described below. Building uses shared app navigation and identifies the public duplex separately from fictional daily-workflow records. Existing `?unit=` and `?view=workflow` links retain the illustrated building and its own evidence. No apartment IDs are silently mapped onto unrelated duplex components.

The real exported duplex geometry works without a backend login. Click **Inspect bedroom pipe elbow**, then **Isolate** and **Focus selected**. Search works across component names, GUIDs, types and source properties. Top, front, side and isometric camera views, close zoom, discipline filters and height cuts are available.

**Interior view** hides 19 source-tagged exterior walls and the roof by default, preserving four shared/party walls, untagged walls and all pipes. Turn off the exterior-wall/roof controls to restore the shell. Selecting a shell component reveals it. Remaining architecture renders solid; transparency is optional, avoiding the earlier overlapping translucent surfaces. These are visibility/material settings, not edits to approved geometry. The source roof is an `IfcSlab` with `PredefinedType=ROOF`; import now retains that property. Existing imports can recognize Revit's explicit `Basic Roof:` name prefix when the property was omitted. Unknown walls are not inferred from bounding boxes.

Click **Pin an exact model location**, then click a component surface and save a title. The workbench retains the element GUID, hit point, source revision and camera/section viewpoint locally. **Reopen saved view** returns to that location. This is a model-coordinate location, not an automatically localized phone photo or a survey measurement.

The lower pane shows an IFC-derived level silhouette. Select a component in either view, focus it in 2D, or pan/zoom the plan. These silhouettes are not approved construction drawings; they are convex plan projections and can hide holes and height differences.

The evidence controls demonstrate scope: uploading a photo leaves the selected component awaiting review. Human acceptance requires evidence and a reason. The separate fixture AI button requires labeled sample evidence and is explicitly simulated. An unresolved pin keeps that component red even when an acceptance exists. New evidence reopens review. Geometry stays unchanged.

For connected API testing, run migrations and `.venv/bin/python -m app.seed --duplex` from `backend/` after downloading the source files. This adds **Duplex Apartment — detailed BIM** without replacing existing projects. The connected Model screen has component search/focus/isolation, model-derived plans, original-file references and model-version-linked issue pins. Its existing review flow projects saved, photo-backed completion into the model and exposes actual decision provenance. Legacy automatic approvals are shown as requiring review, not as newly validated AI completion.

During this implementation a separate test database was seeded at `/tmp/ew-bim-session/app.db`, with storage at `/tmp/ew-bim-session/storage`; the running frontend on port 5180 proxies its API on port 8002. The normal workspace database was not changed. Those temporary files are not repository artifacts.

## Source and reproduction

Source: [Duplex Apartment Test Files](https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20(IFC%202x3)/Duplex%20Apartment), distributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Required attribution: **BSI (2020) “Duplex Apartment Test Files,” buildingSMART International**. This is an older public test project, not an active jobsite or a code-compliance benchmark.

The four IFC2x3 source files are architecture, plumbing, electrical and mechanical/rooms. They total 44,321,546 bytes. Original files are unchanged and kept untracked; their pinned source revision and SHA-256 checksums are in [source.json](../samples/ifc/duplex/source.json). Generated GLBs, metadata and plan projections are attributed derivatives in `web/public/bim-duplex/`.

Reproduce from `backend/`:

```bash
VISION_MODE=off .venv/bin/python -m app.bim.audit --download
```

The command checks every source hash, tessellates with IfcOpenShell, imports through `create_version` in a disposable database, exports viewer assets and writes [AUDIT.json](../samples/ifc/duplex/AUDIT.json). It never modifies an existing project or calls AI.

The files label the same building as `Building` or `XYZ`. The sample manifest explicitly maps `XYZ` to `Building` after reviewing their shared world geometry. Only the label changes; coordinates do not. General imports require an explicitly reviewed `model_building_aliases` project setting. Matching floor names alone does not merge buildings.

## Measured results

| Measure | Result |
|---|---:|
| Unique renderable elements | 1,282 |
| Architecture / structure | 196 / 19 |
| Plumbing / electrical / HVAC | 944 / 90 / 26 |
| Other | 7 |
| Levels | 4: foundation, Level 1, Level 2, roof |
| Distinct room/space records | 22, including roof spaces |
| Elements associated with a room | 806 |
| Exported triangles / vertices | 549,338 / 297,918 |
| GLB size | 6,174,160 bytes across six layers |
| Largest property count on a source element | 128 |
| Latest local source read/tessellation time | About 119 seconds total |
| Latest version/GLB export time | 1.49 seconds |

Timings are observations on this machine, not service guarantees. The source property values often include placeholder strings and authoring-tool quantities whose units differ from geometry units. Geometry is in metres; raw property values must not be treated as validated measurement results.

Source products without renderable geometry are retained in the audit: 3 architectural products and 970 plumbing products. Many are distribution ports/relationships used for topology, not physical meshes. Spatial containers and openings are intentionally excluded as standalone installation elements; spaces become room outlines. No represented physical products were reported unrendered in this run. This does not establish IFC schema validity or complete lossless extraction of every relationship, layer, material appearance or annotation.

The tested close-up is source GUID `13kXneVBL8egWoGKRJw4aA`, a pipe elbow assigned by model overlap to **A203 · Bedroom 2**. Its bounds span approximately 29 × 35 × 35 mm. A CPU ray test hits its actual exported mesh; camera-fit calculations frame it at under 20 cm with a suitably small near plane. Room assignment uses containment/overlap and needs field confirmation; a precise surface pin does not make all room associations exact.

## Problems fixed

- Generic IFC2x3 distribution occurrences previously all landed in `Other`. Their specific assigned types now drive classification while original occurrence classes remain available.
- `Bedroom 1` in apartments A and B previously could merge. Space codes now distinguish them.
- Properties were truncated at 60 in import and 30 in the connected panel. The importer and UI now preserve/display the available properties, type metadata, material names and explicitly assigned systems.
- Camera framing imposed a one-metre minimum radius. It now accounts for object size and viewport aspect, with closer clipping for small components.
- Pins had coordinates but no model revision. New pins retain their revision; old pins are not silently placed on another version. Reopening a versioned issue loads its recorded model.
- Model loads could race or leave replaced GPU resources behind. Replacement is guarded by a load generation; geometry, materials and markers are disposed.
- Uploading or accepting evidence could leave related summaries stale. Saved decisions invalidate the relevant connected element/progress queries.

## Viewer choice

We retain the existing three.js/GLB viewer for this slice. It already preserves per-element identity, works with the authorized API and supports exact mesh ray hits, sections and persisted viewpoints. The audit found extraction and camera problems that replacing the renderer alone would not fix.

[That Open Components](https://github.com/ThatOpen/engine_components) is a credible MIT-licensed alternative with ready-made BIM tools and a fragment-based data layer. We reviewed its documented capabilities and integration costs, but did not install it or run a performance comparison. Revisit it for much larger federations, worker-based loading and richer measurement/navigation tools. No off-the-shelf viewer has been demonstrated to recover detail absent from these source files.

The 3D engine and inspection routes now load separately from the base app. The production build no longer emits the previous oversized main-bundle warning. The sample still downloads roughly 5 MB of metadata and 6 MB of geometry; mobile load time, draw-call cost and large-model performance need measurement.

## Verification and remaining work

46 frontend tests and production compilation pass after the Building simplification; the unchanged backend last passed 128 tests and Ruff. Frontend lint finishes with existing warnings. Checks include real GLB node identity and surface ray hits, close-fit/coordinate math, room-code preservation, model-version pin persistence, authorized plan-layer filtering and photo/proposal → human review → saved element completion. The GLB bytes remain unchanged after progress updates. Interface tests cover scoped fixture projection, 2D selection/pinch zoom, shared Building navigation, retained filters and a single renderer across view switching, 2D fallback and reversible shell visibility in the workbench and authorized connected viewer.

Browser inspection remained blocked by the saved local-URL browser-access preference. CPU geometry tests and renderer stubs do not verify WebGL appearance, actual gestures, PDF rendering or mobile usability. Keep those acceptance tasks open.

Live plan-compliance checks, released automatic AI completion, precise phone-photo localization, LiDAR alignment, complete IFC topology/material-layer extraction, registered approved sheet revisions and formal inspection records remain separate work. See [P3 in TODO](../TODO.md) and P0–P2 dependencies.
