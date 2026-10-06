# Placeholder AI identity

October 6, 2026. The user supplied the new name and angular P logo. The mark is recreated as a clean vector for application use. The workspace keeps its existing dark building-centered theme, navigation and workflow.

- Master black mark: [`web/public/brand/mark.svg`](../web/public/brand/mark.svg).
- Shared decorative header mark: [`BrandMark.tsx`](../web/src/branding/BrandMark.tsx), rendered white for the dark workspace/showroom and retained header surfaces.
- Wordmark: **Placeholder AI**, set in the existing Inter type family with matching white text on dark surfaces. Use the full name for accessible links/buttons, browser title and installed app name. Compact workspace headers may show only the mark while retaining their accessible name.
- Icon master: [`app-icon.svg`](../web/public/brand/app-icon.svg), white mark on `#101b2a`; matching favicon and 192/512 PNG installed-app icons. The glyph stays within the maskable safe circle.
- Current product docs and the standalone subcontractor handoff use Placeholder AI. Dated research and original designer/source documents may retain their historical branding.

## Rebuild icons

The SVG mark is the editable source. With the `sharp` package available:

```bash
NODE_PATH=/path/to/node_modules node scripts/build_brand_icons.mjs
```

This renders the favicon, SVG icon and both PNGs; it does not process or alter the original reference JPEG. Production PWA precaching includes the branding assets.

Internal SiteMesh identifiers, bridge names, storage keys, IFC property names, source model revisions and existing work records remain stable. Rebranding does not require a data migration.
