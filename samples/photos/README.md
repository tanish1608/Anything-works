# Labeled progress photo set

The existing harness evaluates visible element presence, absence and visibility. It does **not** yet evaluate all the plan-discrepancy or automatic-completion requirements in the [new product specification](../../docs/PRODUCT_SPEC.md).

## Current case format

Each case is a folder containing field photos, an optional reference render and `case.json`. See [the template](./_template_case/case.json).

```text
samples/photos/
  <case_id>/
    case.json
    photo1.jpg
    reference.jpg
  _template_case/
  RESULTS.csv
  last_run.json
```

Folders beginning with an underscore are ignored. Evaluation writes result files.

Each element has `id`, `ifc_class`, `name`, an optional `position_hint` and `truth`.

| Current truth label | Meaning |
|---|---|
| installed | The element is in place and visible in the capture |
| missing | The expected location is visible and the element is absent |
| not_visible | The capture does not establish what is at the expected location |

“Installed” is not a label for correct installation, code compliance or formal approval. Do not silently reuse these labels for the new quality-checking task.

## Run

From `backend/`:

```bash
.venv/bin/python -m app.vision.eval_vision ../samples/photos --mock
```

For a live run, configure `GEMINI_API_KEY` and an available `VISION_MODEL`, then omit `--mock`. The live run uses the provider API. Never put credentials in case files.

`synthetic_bath_01` is a drawn stand-in. It checks harness behavior, not field accuracy.

## New dataset work

Extend the schema and evaluator during P2.3 in [TODO.md](../../TODO.md). New cases need permissioned evidence, confirmed location, immutable approved reference, required checks, expert-labeled quality/completion outcomes and approved-change context.

Include correct, partial, defective, occluded, ambiguous, stale-reference and corrected work across the supported stages. Keep sites/projects separated between development and evaluation when possible.

Measure false completions, missed defects, false alerts, coverage and abstention per check. A high installed precision score does not authorize automatic progress completion. Release needs the check-specific policy and evaluation gate; human acceptance and inspection remain distinct.

Only redistribute evidence when permitted. Keep private jobsite captures outside the public sample repository.
