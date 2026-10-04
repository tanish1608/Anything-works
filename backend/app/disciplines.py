"""IFC class → discipline/trade mapping. Disciplines are viewer layers; trades are who installs it."""

DISCIPLINES = ["architecture", "structure", "plumbing", "electrical", "hvac", "flooring", "other"]

_CLASS_MAP: dict[str, str] = {
    # architecture
    "IfcWall": "architecture", "IfcWallStandardCase": "architecture", "IfcDoor": "architecture",
    "IfcWindow": "architecture", "IfcSlab": "architecture", "IfcRoof": "architecture", "IfcStair": "architecture",
    "IfcStairFlight": "architecture", "IfcRailing": "architecture", "IfcCurtainWall": "architecture",
    "IfcFurniture": "architecture", "IfcFurnishingElement": "architecture", "IfcChimney": "architecture",
    "IfcCovering": "architecture", "IfcPlate": "architecture", "IfcRamp": "architecture",
    # structure
    "IfcBeam": "structure", "IfcColumn": "structure", "IfcFooting": "structure", "IfcPile": "structure",
    "IfcMember": "structure", "IfcDiscreteAccessory": "structure", "IfcReinforcingBar": "structure",
    "IfcMechanicalFastener": "structure",
    # plumbing
    "IfcPipeSegment": "plumbing", "IfcPipeFitting": "plumbing", "IfcSanitaryTerminal": "plumbing",
    "IfcValve": "plumbing", "IfcPump": "plumbing", "IfcTank": "plumbing", "IfcWasteTerminal": "plumbing",
    "IfcBoiler": "plumbing", "IfcFireSuppressionTerminal": "plumbing",
    # electrical
    "IfcCableSegment": "electrical", "IfcCableCarrierSegment": "electrical", "IfcCableFitting": "electrical",
    "IfcCableCarrierFitting": "electrical", "IfcLightFixture": "electrical", "IfcLamp": "electrical",
    "IfcOutlet": "electrical", "IfcSwitchingDevice": "electrical", "IfcElectricDistributionBoard": "electrical",
    "IfcJunctionBox": "electrical", "IfcElectricAppliance": "electrical", "IfcProtectiveDevice": "electrical",
    "IfcAlarm": "electrical", "IfcSensor": "electrical",
    # hvac
    "IfcDuctSegment": "hvac", "IfcDuctFitting": "hvac", "IfcAirTerminal": "hvac", "IfcFan": "hvac",
    "IfcUnitaryEquipment": "hvac", "IfcDamper": "hvac", "IfcAirTerminalBox": "hvac", "IfcCoil": "hvac",
    "IfcChiller": "hvac", "IfcSpaceHeater": "hvac",
}


def discipline_for(ifc_class: str, predefined_type: str | None = None, hint: str | None = None) -> str:
    """Our own exports set an explicit discipline property (passed as hint); otherwise infer from class."""
    if hint in DISCIPLINES:
        return hint
    if ifc_class == "IfcCovering" and (predefined_type or "").upper() == "FLOORING":
        return "flooring"
    return _CLASS_MAP.get(ifc_class, "other")


def trade_for(discipline: str) -> str:
    """Default trade responsible for a discipline. Framing installs structure on wood-frame residential."""
    return {"structure": "framing", "other": "architecture"}.get(discipline, discipline)
