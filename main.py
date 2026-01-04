from config import load_config
from mesh.sphere import generate_uv_sphere
from procnoise.deform import apply_noise
from export.ply import export_ply

cfg = load_config()

lat = cfg["planet"]["resolution"]["lat"]
lon = cfg["planet"]["resolution"]["lon"]

vertices, faces = generate_uv_sphere(
    radius=cfg["planet"]["base_radius"],
    lat=lat,
    lon=lon
)

vertices, colors = apply_noise(vertices, cfg)

export_ply(
    cfg["export"]["filename"],
    vertices,
    faces,
    colors
)
print(cfg)
