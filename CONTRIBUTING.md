# Contributing

Thanks for helping improve Pylanet. Keep changes focused, reproducible, and easy to review.

## Development Setup

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Run the CLI generator:

```powershell
python main.py
```

Run the Web UI:

```powershell
python web.py
```

Then open:

```text
http://127.0.0.1:8000
```

## Before You Make Changes

- Check the existing project structure and keep changes consistent with it.
- Prefer small, focused changes over broad rewrites.
- Avoid committing generated files unless they are intentionally part of the change.
- Do not remove existing configuration options without a migration path or a clear reason.

## Code Guidelines

- Keep procedural generation behavior deterministic for the same seed and configuration.
- Add new generation controls through `config.yaml`, the Web UI payload, and the generator code together.
- Keep UI labels short and directly tied to the control behavior.
- Use existing helpers and modules before adding new abstractions.
- Keep exported PLY files compatible with common tools such as Blender and MeshLab.

## Visual Changes

For any significant visual change, update the GIF or preview media shown in `README.md` so the documentation matches the current UI and planet output. This includes changes to:

- Planet rendering, lighting, colors, or texture detail
- Camera controls, rotation behavior, or zoom behavior
- Web UI layout or major control additions
- New presets, biome behavior, or terrain generation style

If the visual change is minor, mention in the pull request why the existing README media still represents the project accurately.

## Testing

Before opening a pull request, run:

```powershell
python -m py_compile main.py planetgen.py web.py procnoise\deform.py procnoise\perlin.py mesh\sphere.py export\ply.py
python main.py
```

For Web UI changes, also run `python web.py` and manually verify:

- The page loads without console errors.
- Generate works with default settings.
- Rotation, zoom, and save behavior still work.
- Any new controls visibly affect the generated planet.

## Pull Requests

Include a short summary of what changed, why it changed, and how it was tested. For visual changes, include updated screenshots/GIFs or explain why no media update was needed.
