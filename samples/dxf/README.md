# DXF samples (generated)

All drawings here come from `generate.py`. They're original, so the licence is CC0. Regenerate them with:

```bash
cd backend && .venv/bin/python ../samples/dxf/generate.py
```

| File | What it tests |
|---|---|
| `house_a_L1_arch.dxf` | Single-family ground floor in inches with AIA layers (A-WALL, A-DOOR, A-GLAZ, A-AREA-IDEN). Walls are drawn as outlines with gaps at openings, door blocks have swing arcs, there are window blocks, room labels with area notes, a title-block scale note and one dimension |
| `house_a_L1_arch_messy.dxf` | The same building drawn sloppily: no `$INSUNITS`, face lines broken into overlapping pieces, 1/8" endpoint jitter, MTEXT labels |
| `house_a_L1_plumbing.dxf` | Fixtures (WC, LAV, TUB, SINK-K, WH blocks on P-FIXT) plus cold, hot and waste runs as polylines. Includes tees, elbows and a crossing between systems |
| `house_a_L1_plumbing_fixtures_only.dxf` | The typical residential case: fixtures shown, no pipe routes |
| `house_a_L1_electrical.dxf` | Receptacles, switches and lights (blocks on E-POWR / E-LITE), no wiring |
| `duplex_L1_arch.dxf`, `duplex_L2_arch.dxf` | Two-unit metric (mm) floors with non-AIA layer names (WALLS, DOORS, ...) and "UNIT 101 BEDROOM"-style labels |
| `duplex_L1_layer0.dxf` | Everything on layer 0 plus furniture noise, so detection has to use geometry only |

Ground truth is in `expected.json`. Run the evaluation with:

```bash
cd backend && .venv/bin/python -m app.conversion.eval_conversion ../samples/dxf --csv ../samples/dxf/RESULTS.csv
```

**Caveat:** I wrote both the generator and the detector, so a perfect score here only proves that the pipeline works end to end and that regressions get caught. It doesn't predict accuracy on real drawings. Real builder sets will bring things these samples don't, for example:
- xrefs
- hatches
- walls drawn as single lines
- curved walls
- inconsistent layers
- dimension-only scale

Add each real set as a folder with its own `expected.json` and track it in `RESULTS.csv`.
