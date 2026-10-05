# Labeled progress photo set (vision eval)

Each case is one field report: one folder holding the photos, an optional reference render, and `case.json` with the expected elements and their **true** status.

```
samples/photos/
  <case_id>/
    case.json          # zone, trade, note, photos[], reference, elements[] (see _template_case)
    photo1.jpg ...     # as taken on site (any size; resized before sending)
    reference.jpg      # optional: viewer snapshot of the zone's trade layer
  _template_case/      # folders starting with "_" are ignored
  RESULTS.csv          # appended by every eval run (model + prompt version + per-type scores)
  last_run.json        # per-element verdicts from the latest run
```

Each element in `case.json` has these fields:
- `id`: any unique id.
- `ifc_class`: the element type, which scores are grouped by.
- `name`.
- `position_hint`: optional. The app generates it from the model; copy it from an upload's analysis if you have one.
- `truth`: one of these values:

| `truth` | When to use it |
|---|---|
| `installed` | The element is really in place and you can see it in the photos |
| `missing` | The spot where it belongs is visible, and the element isn't there |
| `not_visible` | The photos don't show where it belongs |

**Building the set from real uploads.** For every report the app stores the photos, the reference render and the AI verdicts. Export a few dozen of them, correct the truths by hand, and drop them in here. Aim for a mix of:
- clearly done work
- partly done work
- photos with work hidden behind something
- photos taken after the drywall went up

Run the eval:

```bash
cd backend
export GEMINI_API_KEY=...
.venv/bin/python -m app.vision.eval_vision ../samples/photos                       # default VISION_MODEL
.venv/bin/python -m app.vision.eval_vision ../samples/photos --model gemini-3.1-pro-preview
.venv/bin/python -m app.vision.eval_vision ../samples/photos --mock               # no API; checks the data
```

**What to watch:**
- **false greens:** keep this at **0**.
- **precision** for "installed": this should be at least 0.95 before anyone switches a project to auto-approve.
- **recall:** comes second. A low recall only means more photos go to manual review.

`synthetic_bath_01` is a drawn stand-in, not a real site photo. It only checks that the harness runs. Replace it with real cases.
