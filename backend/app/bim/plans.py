"""Model-derived plan silhouettes, not approved construction drawings. IFC metres, Z up."""
from shapely.geometry import MultiPoint

from app.bim.ifc_import import Item


def footprint(item: Item) -> list[list[float]]:
    hull = MultiPoint(item.verts[:, :2]).convex_hull.simplify(0.002)
    if hull.geom_type == "Polygon":
        points = list(hull.exterior.coords)
    elif hull.geom_type == "LineString":
        points = list(hull.coords)
    else:
        points = [[hull.x, hull.y]]
    return [[round(x, 4), round(y, 4)] for x, y in points]
