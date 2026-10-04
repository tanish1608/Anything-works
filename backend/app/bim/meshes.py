"""Write per-discipline GLB files: one node per element, named by our element UUID.

IFC is Z-up; glTF is Y-up. We convert here so the viewer works in native three.js coordinates:
    three (x, y, z) = IFC (x, z, -y)
"""

import io

import numpy as np
import trimesh


def ifc_to_three(v: np.ndarray) -> np.ndarray:
    return np.column_stack([v[:, 0], v[:, 2], -v[:, 1]])


def three_to_ifc(p: list[float] | tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = p
    return (x, -z, y)


def build_glb(meshes: list[tuple[str, np.ndarray, np.ndarray]]) -> bytes:
    """meshes: (element_id, verts (N,3) IFC coords, faces (M,3))."""
    scene = trimesh.Scene()
    for element_id, verts, faces in meshes:
        if len(faces) == 0:
            continue
        m = trimesh.Trimesh(vertices=ifc_to_three(verts), faces=faces, process=False)
        scene.add_geometry(m, node_name=element_id, geom_name=element_id)
    buf = io.BytesIO()
    scene.export(buf, file_type="glb")
    return buf.getvalue()
