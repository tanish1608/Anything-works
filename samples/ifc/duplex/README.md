# Detailed public duplex sample

Attribution: **BSI (2020) “Duplex Apartment Test Files,” buildingSMART International**.

[Source files and author/license notes](https://github.com/buildingsmart-community/Community-Sample-Test-Files/tree/7ddf57a201f88a0c213d5322b02ed15e94a60a40/IFC%202.3.0.1%20(IFC%202x3)/Duplex%20Apartment). License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Original IFCs are downloaded locally, checksum-verified and unchanged. They are ignored by Git. [source.json](source.json) records the pinned revision, expected hashes and reviewed building-label alias. Geometry coordinates are not changed. The generated GLBs, metadata and silhouettes in `web/public/bim-duplex/` are derivatives used for testing; progress examples are not real construction evidence.

From `backend/`, run `VISION_MODE=off .venv/bin/python -m app.bim.audit --download`. See [the audit report](../../../docs/BIM_AUDIT.md) for results, limits, viewer choice and testing instructions. [AUDIT.json](AUDIT.json) is the latest measured import inventory.
