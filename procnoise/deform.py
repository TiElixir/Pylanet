import numpy as np
from procnoise.perlin import PerlinNoise, fbm

def apply_noise(vertices, cfg):
    pn = PerlinNoise(cfg["noise"]["seed"])

    base_radius = cfg["planet"]["base_radius"]   # ✅ FIX
    amplitude   = cfg["noise"]["amplitude"]
    sea_level   = cfg["ocean"]["sea_level"]

    ocean_col = tuple(cfg["ocean"]["ocean_color"])
    land_col  = tuple(cfg["ocean"]["land_color"])

    new_vertices = []
    colors = []

    for x, y, z in vertices:
        v = np.array([x, y, z])
        u = v / np.linalg.norm(v)

        h = fbm(
            pn,
            u[0], u[1], u[2],
            octaves=cfg["noise"]["octaves"]
        )

        r = base_radius + h * amplitude

        if r < sea_level:
            r = sea_level
            colors.append(ocean_col)
        else:
            colors.append(land_col)

        new_vertices.append(tuple(u * r))

    return new_vertices, colors
