import copy
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from config import load_config
from export.ply import export_ply
from planetgen import generate_planet
from procnoise.deform import DEFAULT_BIOMES, PLANET_PRESETS

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"

def _number(value, fallback, as_int=False):
    try:
        return int(value) if as_int else float(value)
    except (TypeError, ValueError):
        return fallback

def _cfg_from_payload(payload):
    cfg = copy.deepcopy(load_config())
    planet = cfg.setdefault("planet", {})
    resolution = planet.setdefault("resolution", {})
    noise = cfg.setdefault("noise", {})
    terrain = cfg.setdefault("terrain", {})
    ocean = cfg.setdefault("ocean", {})

    planet["preset"] = payload.get("preset", planet.get("preset", "earthlike"))
    preset = PLANET_PRESETS.get(planet["preset"], PLANET_PRESETS["earthlike"])

    noise["amplitude"] = preset["amplitude"]
    terrain["pattern_scale"] = preset["pattern_scale"]
    terrain["continent_scale"] = preset["continent_scale"]
    terrain["mountain_strength"] = preset["mountain_strength"]
    terrain["detail_strength"] = preset["detail_strength"]
    terrain["color_detail"] = preset["color_detail"]
    terrain["moisture"] = preset["moisture"]
    terrain["temperature"] = preset["temperature"]
    terrain["ice_caps"] = preset["ice_caps"]
    ocean["sea_level"] = preset["sea_level"]

    if "resolution" in payload:
        slider_resolution = max(24, min(360, _number(payload.get("resolution"), resolution.get("lat", 180), True)))
        resolution["lat"] = slider_resolution
        resolution["lon"] = int(round(slider_resolution * 4 / 3))
    else:
        resolution["lat"] = max(12, min(360, _number(payload.get("lat"), resolution.get("lat", 180), True)))
        resolution["lon"] = max(16, min(480, _number(payload.get("lon"), resolution.get("lon", 240), True)))
    planet["base_radius"] = _number(payload.get("baseRadius"), planet.get("base_radius", 1.0))

    noise["seed"] = _number(payload.get("seed"), noise.get("seed", 0), True)
    noise["amplitude"] = _number(payload.get("amplitude"), noise.get("amplitude", 0.28))
    noise["octaves"] = max(1, min(9, _number(payload.get("octaves"), noise.get("octaves", 5), True)))
    noise["lacunarity"] = _number(payload.get("lacunarity"), noise.get("lacunarity", 2.0))
    noise["gain"] = _number(payload.get("gain"), noise.get("gain", 0.5))

    terrain["pattern_scale"] = _number(payload.get("patternScale"), terrain.get("pattern_scale", 1.0))
    terrain["color_detail"] = _number(payload.get("colorDetail"), terrain.get("color_detail", 0.5))
    terrain["plains_bias"] = _number(payload.get("plainsBias"), terrain.get("plains_bias", 0.0))
    terrain["continent_scale"] = _number(payload.get("continentScale"), terrain.get("continent_scale", 0.95))
    terrain["mountain_strength"] = _number(payload.get("mountainStrength"), terrain.get("mountain_strength", 0.3))
    terrain["detail_strength"] = _number(payload.get("detailStrength"), terrain.get("detail_strength", 0.08))
    terrain["moisture"] = _number(payload.get("moisture"), terrain.get("moisture", 0.6))
    terrain["temperature"] = _number(payload.get("temperature"), terrain.get("temperature", 0.58))
    terrain["ice_caps"] = _number(payload.get("iceCaps"), terrain.get("ice_caps", 0.35))
    bias_keys = {
        "oceanBias": "ocean",
        "desertBias": "desert",
        "savannaBias": "savanna",
        "grasslandBias": "grassland",
        "forestBias": "forest",
        "rainforestBias": "rainforest",
        "tundraBias": "tundra",
        "snowBias": "snow",
        "rockBias": "rock",
    }
    biome_biases = terrain.setdefault("biome_biases", {})
    for payload_key, biome_name in bias_keys.items():
        biome_biases[biome_name] = _number(payload.get(payload_key), biome_biases.get(biome_name, 1.0))
    ocean["sea_level"] = _number(payload.get("seaLevel"), ocean.get("sea_level", 1.02))

    return cfg

class PlanetHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC), **kwargs)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/defaults":
            self._json({
                "config": load_config(),
                "presets": list(PLANET_PRESETS.keys()),
                "presetSettings": PLANET_PRESETS,
                "biomes": DEFAULT_BIOMES,
            })
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/generate":
            if path != "/api/save":
                self.send_error(404, "Unknown endpoint")
                return
            self._save_planet()
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            cfg = _cfg_from_payload(payload)
            planet = generate_planet(cfg)
            self._json({
                "vertices": planet["vertices"],
                "faces": planet["faces"],
                "colors": planet["colors"],
                "stats": planet["stats"],
            })
        except Exception as exc:
            self._json({"error": str(exc)}, status=500)

    def _save_planet(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            cfg = _cfg_from_payload(payload)
            planet = generate_planet(cfg)
            export_cfg = cfg.setdefault("export", {})
            filename = export_cfg.get("filename", "planet.ply")
            target = (ROOT / filename).resolve()
            if ROOT not in target.parents and target != ROOT:
                target = ROOT / "planet.ply"
            export_ply(str(target), planet["vertices"], planet["faces"], planet["colors"])
            self._json({
                "path": str(target),
                "stats": planet["stats"],
            })
        except Exception as exc:
            self._json({"error": str(exc)}, status=500)

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def run(host="127.0.0.1", port=8000):
    server = ThreadingHTTPServer((host, port), PlanetHandler)
    print(f"Pylanet web UI running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()

if __name__ == "__main__":
    run()
