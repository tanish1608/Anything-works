# Design system — Everything Works AI

This merges the two Stitch design notes (“Everything Works AI” and “Calm Field & Spatial Clarity”) and adds the status semantics from the October 5 product spec. The implementation for the mockups is [`ew.css`](ew.css). The live reference is [`components.html`](components.html).

## Character

The UI should feel calm, precise and tool-grade, in the spirit of Linear and Asana. It avoids sci-fi telemetry, glowing AI theatrics and decorative gradients. Signal colors carry meaning and are used sparingly. Every claim on screen must be traceable to a record. Anything generated, simulated or self-reported carries a label saying so.

## Tokens

| Role | Value | Use |
|---|---|---|
| Ink | `#0F172A` (hover `#1E293B`) | Headings, primary buttons, active navigation |
| Ink 2 / 3 / muted | `#334155` / `#475569` / `#94A3B8` | Body, metadata, placeholders |
| Field / surface | `#F8FAFC` / `#FFFFFF` | App canvas / cards |
| Hairline / hover | `#E2E8F0` / `#CBD5E1` | Borders, dividers |
| Emerald | `#10B981` (`#ECFDF5`, `#065F46`, `#A7F3D0`) | AI-checked complete |
| Deep emerald | `#047857` (`#D1FAE5`, `#064E3B`, `#34D399`) | Human accepted |
| Red | `#EF4444` (`#FEF2F2`, `#991B1B`, `#FECACA`) | Potential discrepancy, open issue |
| Amber | `#F59E0B` (`#FFFBEB`, `#92400E`, `#FDE68A`) | Needs review, needs evidence, pending |
| Violet | `#6D28D9` (`#F5F3FF`, `#5B21B6`, `#DDD6FE`) | Formal inspection, approved revisions, fixture labels |
| Blue | `#2563EB` (`#EFF6FF`, `#1E40AF`, `#BFDBFE`) | Processing/sync states, record links |

Radii: 8 px for controls, 12 px for insets, 16 px for cards, full for chips. Shadows are reserved for floating surfaces (`0 10px 15px -3px rgba(15,23,42,.08)`).

## Typography

Inter at weights 400, 500 and 600 only. Headings use negative tracking (−0.015 to −0.02 em). Times, counts and IDs use tabular figures. JetBrains Mono is for record IDs and drawing references. Eyebrow labels are 11 px, 600 weight, uppercase, +0.06 em tracking.

## Status semantics

States are separate dimensions (spec §5). Never collapse them into one “done” flag or one color.

| Dimension | Chips |
|---|---|
| Processing | On this phone · Queued · Received · Checking · Completed · Analysis failed |
| Evidence coverage | Adequate · Partly occluded · Needs evidence |
| Observed progress | Not assessed · Partial · AI-checked complete |
| Check result | No discrepancy detected · Potential discrepancy · Insufficient evidence · Unsupported |
| Human review | Not requested · Pending · Human accepted · Rejected · Superseded |
| Issue | Potential finding · Open issue · Correction submitted · Resolved · Dismissed |
| Formal inspection | Not recorded · Requested · Passed · Failed (violet, linked record only) |
| Check release | Review only · Shadow mode · Auto-completion on · Not supported |

Rules:

- Every chip has an icon and text. Color is never the only signal.
- “AI-checked complete” is always scoped to named checks. Show what was *not* covered next to it.
- “No discrepancy detected” is not “passed.” Insufficient, unsupported and failed outcomes never render green.
- An open issue overrides completion in lists and in 3D. A dismissed finding doesn't erase a completion, and both stay in history.
- Never show “safe,” “compliant,” “verified” or “ready to cover” based on photo analysis.

## 3D and plan precedence

Open issue (red) › needs review (amber) › needs evidence (amber, hatched) › human accepted (deep emerald) › AI-checked complete (emerald) › unsupported (grey, hatched) › planned (neutral). Inspection is a separate violet badge. Use issue pins for confirmed issues. Use room-level pins when an element match is uncertain. Captures never move planned geometry.

## Components

- **Buttons:** primary (ink), secondary (outline), ghost and danger. Heights are 28 / 34 / 44 px; 44 px on mobile.
- **Exception row:** icon tile, title, status chip, a meta line (trade · reference revision · coverage · update ID · time) and one primary action. Ranked by downstream risk, then age.
- **Comparison panel:** evidence and reference side by side, highlighted regions labelled “observed” or “expected,” and a note on how the photo was matched to the location.
- **Record state table:** one row per state dimension.
- **Timeline:** dot colors follow the status palette. Ink marks human decisions; violet marks revisions and inspections.
- **Coverage bar:** segments in precedence order, always with the count sentence and a denominator note.
- **Works Beaver assistant:** floating panel, bottom right. It explains and drafts requests. Its footer states that it can't accept, close or inspect. No auto-approve control.
- **Honesty labels:** `FIXTURE RESULT`, “Generated sample image,” `SIMULATED DELIVERY IN DEMO`, “Worker claim,” “Sample values — not measured.”

## Layout

Desktop pages are capped at 1280 px with 24 px gutters, using two-column work surfaces (2:1 or 3:2). Below 1080 px, columns stack. Below 760 px, the nav collapses, rows wrap their actions under the content, and the page uses 16 px margins with no horizontal scroll. The field experience is phone-first (390 px) and needs no 3D navigation.
