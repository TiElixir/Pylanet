from config import load_config
from export.ply import export_ply
from planetgen import generate_planet

cfg = load_config()
planet = generate_planet(cfg)

export_ply(
    cfg["export"]["filename"],
    planet["vertices"],
    planet["faces"],
    planet["colors"]
)

print(f"Exported {cfg['export']['filename']}")
print(f"Vertices: {planet['stats']['vertices']} | Faces: {planet['stats']['faces']}")
print("Biomes:", planet["stats"]["biomes"])
