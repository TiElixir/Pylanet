# Pylanet Agent Handoff

This project is a procedural planet generator with a WebGL browser UI. Recent work expanded it toward a solar-system workspace, but the actual planet generation modules should remain modular and reusable.

## Current Architecture

- `config.yaml` stores default generator settings.
- `config.py` loads YAML configuration.
- `mesh/sphere.py` creates the UV sphere mesh.
- `procnoise/perlin.py` contains noise helpers.
- `procnoise/deform.py` applies procedural terrain deformation, color generation, biome classification, biome biases, plains bias, and planet presets.
- `planetgen.py` is the main generation API. `generate_planet(cfg)` returns vertices, faces, colors, metadata, and stats.
- `export/ply.py` writes generated geometry to PLY.
- `main.py` is the CLI export path.
- `web.py` serves the browser UI and exposes:
  - `GET /api/defaults`
  - `POST /api/generate`
  - `POST /api/save`
- `static/index.html`, `static/styles.css`, and `static/app.js` implement the WebGL UI.

## Important Current Features

The planet generator supports:

- Presets: `earthlike`, `arid`, `frozen`, `oceanic`, `volcanic`.
- Configurable resolution.
- Terrain controls for amplitude, sea level, pattern scale, color detail, continent scale, mountain strength, detail strength, moisture, temperature, ice caps, and plains bias.
- Biome bias controls for ocean, desert, savanna, grassland, forest, rainforest, tundra, snow, and rock.
- WebGL planet preview with smooth unrestricted drag rotation, zoom, and optional auto-rotate.
- Browser-side PLY download.

The solar-system workspace currently supports:

- A `Planet` / `System` mode switch in the UI.
- Saving the current generated planet as a named body with `mass`, `radius`, and `atmosphere`.
- Creating stars with `name`, `mass`, `radius`, and `temperature`.
- Saving planets and stars in `localStorage` under `pylanet.savedBodies`.
- Saving placed system bodies in `localStorage` under `pylanet.systemBodies`.
- Dropping saved bodies into a system.
- Orbit spawn controls for semi-major axis, semi-minor axis, phase, and initial tangent velocity.
- A draggable SVG spawn editor. The ellipse is only used to choose initial position and velocity.
- A simple WebGL system preview driven by mutable position and velocity.
- Mutual-gravity simulation with configurable gravity strength and time scale.
- Optional collision merging.
- Current-session generated planet mesh previews in the system renderer.

## Known Limitations

- The solar-system view now uses a simple browser-side gravity integrator, but it is still a lightweight simulation rather than a validated astrophysics engine.
- Orbit controls only define spawn state. After spawning, movement is determined by gravity and current velocity.
- Saved bodies are browser-local only. There is no backend persistence yet.
- Procedural planet meshes render in the system only during the current browser session. Persisted/reloaded planets fall back to colored spheres because full meshes are not stored in `localStorage`.
- Star visuals are simple color-coded spheres based on temperature.
- Existing WebGL rendering is handwritten WebGL, not Three.js.
- There is no automated test suite yet.

## Recommended Next Steps

For a real physics simulation, add a dedicated module instead of putting physics inside the UI:

- `physics/bodies.py` for physical body models.
- `physics/orbits.py` for orbit helpers and orbital parameter conversion.
- `physics/integrator.py` for timestep integration.
- `physics/system.py` for solar-system state and update loops.

Suggested physics behavior:

- Represent position and velocity as vectors.
- Use gravitational force: `F = G * m1 * m2 / r^2`.
- Use an integrator such as semi-implicit Euler first, then consider Verlet or RK4 if stability becomes a problem.
- Keep units explicit. Decide whether UI values are game-scaled units or real SI-like units.
- Separate simulation state from render state.

For persistence:

- Add backend endpoints for saved bodies and systems.
- Store saved data in JSON files first, likely under a dedicated project directory such as `saved/`.
- Validate names and file paths carefully before writing.

For rendering:

- Consider moving the 3D system view to Three.js if orbit editing, labels, trails, lighting, and picking become more complex.
- Keep the planet generation pipeline independent from renderer choice.

## Verification Commands

Use these after changes:

```powershell
.\venv\Scripts\python.exe -m py_compile main.py planetgen.py web.py procnoise\deform.py procnoise\perlin.py mesh\sphere.py export\ply.py
node --check static\app.js
.\venv\Scripts\python.exe main.py
```

To run the Web UI:

```powershell
.\venv\Scripts\python.exe -c "import web; web.run(port=8003)"
```

If port `8003` is already in use, choose another port.

## Development Notes

- Preserve the existing module boundaries. Do not fold generation, web serving, physics, and rendering into one file.
- Prefer small, deterministic generation tests when adding a test suite.
- The UI currently assumes all saved body data can fit in browser `localStorage`.
- Avoid introducing a database until the saved-system data model is clearer.
- The project currently uses only `numpy` and `pyyaml` in `requirements.txt`.
- Keep generated PLY files and saved artifacts out of source control unless explicitly intended.

## Visual Documentation Requirement

`CONTRIBUTING.md` asks contributors to update the GIF or preview media in `README.md` after any significant visual change. Keep that requirement in sync if UI, rendering, planet visuals, orbit visuals, or system previews change materially.

## Current Working Tree Context

Recent solar-system UI work touched:

- `static/index.html`
- `static/styles.css`
- `static/app.js`

Before changing these files further, inspect the latest worktree and avoid reverting unrelated user edits.
