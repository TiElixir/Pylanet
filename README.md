# Pylanet

<p align="center"> 
    <img src="https://img.shields.io/github/issues/TiElixir/Pylanet">
    <img src="https://img.shields.io/github/forks/TiElixir/Pylanet">
    <img src="https://img.shields.io/github/stars/TiElixir/Pylanet">
    <img src="https://img.shields.io/github/license/TiElixir/Pylanet">
</p>

Pylanet is a procedural planet generator written in Python. It builds a UV sphere, deforms it with layered 3D Perlin noise, assigns biome colors, and exports the result as a vertex-colored PLY mesh. It also includes a local Web UI for generating and inspecting planets interactively.

<img width="1280" height="720" alt="Pylanet-2" src="https://github.com/user-attachments/assets/46cf2302-4e04-4539-b2ee-a8b26b4f44db" />

## Features

- Procedural 3D planet meshes
- Configurable resolution, seed, terrain relief, sea level, octaves, gain, continent scale, plains bias, biome bias, and color texture
- Planet presets: earthlike, arid, frozen, oceanic, and volcanic
- Layered biome coloring for oceans, beaches, grasslands, forests, rainforests, savannas, deserts, tundra, rock, snow, basalt, and lava
- CLI export to `planet.ply`
- WebGL viewer with rotate and zoom controls
- Web UI PLY saving after generation
- Black universe-style background
- No web framework required; the UI runs on Python's built-in HTTP server

## Setup

```powershell
python -m venv venv

**Windows:**
```powershell
.\venv\Scripts\Activate.ps1

**Linux/macOS:**
```bash
source venv/bin/activate

```powershell
pip install -r requirements.txt
```

## Export A PLY

Edit `config.yaml`, then run:

```powershell
python main.py
```

The mesh is written to the path configured in:

```yaml
export:
  filename: planet.ply
```

Open the exported PLY in tools such as Blender, MeshLab, or CloudCompare. The file includes RGB vertex colors.

## Run The Web UI

```powershell
python web.py
```

Open:

```text
http://127.0.0.1:8000
```

Use **Generate** to rebuild the planet after changing settings. Drag on the planet to rotate it and use the mouse wheel or trackpad scroll to zoom. Use **Save PLY** to download the current generated mesh with vertex colors.

The Web UI exposes resolution as one slider. The slider controls latitude segments, and longitude is set automatically to a 4:3 ratio for cleaner spherical coverage.

## Configuration

The main controls live in `config.yaml`.

```yaml
planet:
  preset: earthlike
  base_radius: 1.0
  resolution:
    lat: 180
    lon: 240

noise:
  seed: 106
  amplitude: 0.28
  octaves: 6
  lacunarity: 2.0
  gain: 0.5

terrain:
  pattern_scale: 1.0
  color_detail: 0.5
  plains_bias: 0.0
  continent_scale: 0.95
  mountain_strength: 0.34
  detail_strength: 0.08
  moisture: 0.62
  temperature: 0.58
  ice_caps: 0.35
  biome_biases:
    ocean: 1.0
    desert: 1.0
    grassland: 1.0
    forest: 1.0
    snow: 1.0
```

Useful knobs:

- `seed`: changes the generated world while keeping the same settings
- `amplitude`: increases or reduces terrain height
- `sea_level`: controls how much land is underwater
- `pattern_scale`: changes the overall size of noise patterns across terrain and biomes
- `color_detail`: controls how strongly biome colors are broken up by layered surface texture
- `plains_bias`: flattens ridges and compresses elevation to make broader plain areas
- `biome_biases`: controls how strongly each biome competes during classification; `1.0` is neutral
- `continent_scale`: lower values create larger landmasses; higher values create smaller, noisier ones
- `mountain_strength`: adds sharper ridged terrain
- `detail_strength`: adds fine surface variation
- `moisture`, `temperature`, `ice_caps`: influence biome placement
- `lat`, `lon`: control mesh resolution

## Project Layout

```text
Pylanet/
  config.py            YAML loader
  config.yaml          default planet settings
  main.py              CLI PLY exporter
  planetgen.py         shared planet generation pipeline
  web.py               local Web UI server
  export/ply.py        PLY writer
  mesh/sphere.py       UV sphere mesh builder
  procnoise/perlin.py  3D Perlin/fBM noise
  procnoise/deform.py  terrain deformation and biome classification
  static/              WebGL viewer
```

## Notes

High resolutions create larger responses in the Web UI and larger PLY files. The default `lat: 180` and `lon: 240` gives much sharper biome boundaries; lower it while exploring if generation feels slow.
