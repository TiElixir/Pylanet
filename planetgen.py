from collections import Counter

from mesh.sphere import generate_uv_sphere
from procnoise.deform import apply_noise

def generate_planet(cfg, debug=False):
    planet_cfg = cfg.get("planet", {})
    resolution = planet_cfg.get("resolution", {})
    lat = int(resolution.get("lat", 96))
    lon = int(resolution.get("lon", 128))

    vertices, faces = generate_uv_sphere(
        radius=float(planet_cfg.get("base_radius", 1.0)),
        lat=lat,
        lon=lon,
    )
    vertices, colors, metadata = apply_noise(vertices, cfg)

    if debug:
        peak_snow_near_equator = [
            item for item in metadata
            if item["biome"] == "snow" and item["height"] > 0.74
        ]
        peak_snow_excluding_polar = [
            item for item in metadata
            if item["biome"] == "snow" and item["height"] > 0.74 and item["temperature"] >= 0.18
        ]
        print(len(peak_snow_near_equator), "peak-snow vertices found (total, including polar overlap)")
        print(len(peak_snow_excluding_polar), "peak-snow vertices found (excluding polar overlap)")

    biome_counts = Counter(item["biome"] for item in metadata)

    return {
        "vertices": vertices,
        "faces": faces,
        "colors": colors,
        "metadata": metadata,
        "stats": {
            "vertices": len(vertices),
            "faces": len(faces),
            "biomes": dict(sorted(biome_counts.items())),
        },
    }
