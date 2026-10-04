# Vector PDF samples (generated)

`generate_pdf.py` plots the same buildings as `../dxf` to PDF, the way a CAD plot would look:
- heavy wall lines
- door swings drawn as Bezier arcs
- thin window lines
- room labels
- a sheet frame and title block with the scale note

The files are original and licensed CC0.

| File | Sheet | Scale |
|---|---|---|
| `house_a_L1_arch.pdf` | Tabloid (11×17), with a double-line sheet frame | 1/4" = 1'-0" |
| `duplex_L1_arch.pdf` | A4 | 1:100 |

To regenerate the files and run the evaluation:

```bash
cd backend && .venv/bin/python ../samples/pdf/generate_pdf.py
.venv/bin/python -m app.conversion.eval_conversion ../samples/pdf --csv ../samples/pdf/RESULTS.csv
```

**What PDF input can't do yet.** A PDF has no layers, no blocks and no units. The reader works around this:
- the scale comes from the title-block note, or from your confirmation;
- walls are taken from the heaviest line weights;
- doors are recognised from their swing arcs.

Fixtures and devices in trade PDFs are only symbols without names, so trade sheets need symbol matching (planned). Upload trade drawings as DXF for now, or trace them in the review editor.

**Real plots will bring more than these samples have:**
- hatching
- dimension strings
- multi-page sets
- text drawn as outlines

Add real PDFs with an `expected.json` to measure them.
