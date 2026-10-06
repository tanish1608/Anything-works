# Sample data

Every file here lists its source and licence. Don't add files whose licence doesn't allow redistribution.

## `ifc/`: buildingSMART "Simple-Scene" building (IFC4 ADD2 TC1)

| File | Content |
|---|---|
| `Building-Architecture.ifc` | slab, walls, roof, chimney, furniture, 2 spaces (living room, entry hall) |
| `Building-Structural.ifc` | footing, walls, beams, beam shoes |
| `Building-Hvac.ifc` | duct segment, air terminals |

- Source: https://github.com/buildingSMART/Sample-Test-Files, folder `IFC 4.0.2.1 (IFC 4 ADD2 TC1)/Simple-Scene/`
- Licence: **CC BY 4.0**, (C) buildingSMART International Ltd. See http://creativecommons.org/licenses/by/4.0/

These are a small one-storey house split by discipline (a "federated" model). They share a few elements (chimney, proxies) under the same GlobalId, and our importer de-duplicates them.

## `dxf/`: generated residential plans

See `dxf/README.md`.

## `photos/`: labeled progress photo set

See `photos/README.md`.

## Role in the new product

These samples support the existing import and evaluation pipelines. They do not establish reliable daily quality checking or automatic completion on real sites. The current photo labels describe presence and visibility, not plan compliance. See the [product specification](../docs/PRODUCT_SPEC.md) and [evaluation backlog](../TODO.md) before extending the dataset. Preserve the source attribution above.

Generated vector-PDF cases are described in [pdf/README.md](pdf/README.md).
