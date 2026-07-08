import numpy as np
from procnoise.perlin import PerlinNoise, fbm

DEFAULT_BIOMES = {
    "deep_ocean": [8, 22, 74],
    "ocean": [20, 74, 156],
    "shallows": [46, 142, 178],
    "beach": [210, 190, 118],
    "grassland": [78, 156, 68],
    "forest": [32, 105, 56],
    "rainforest": [22, 132, 74],
    "savanna": [168, 156, 82],
    "desert": [202, 164, 96],
    "tundra": [160, 176, 160],
    "snow": [238, 244, 248],
    "rock": [116, 112, 108],
    "basalt": [58, 54, 52],
    "lava": [232, 78, 26],
}

PLANET_PRESETS = {
    "earthlike": {
        "sea_level": 1.0,
        "temperature": 0.58,
        "moisture": 0.6,
        "ice_caps": 0.35,
        "ocean_mix": 0.55,
        "amplitude": 0.28,
        "continent_scale": 0.95,
        "mountain_strength": 0.34,
        "detail_strength": 0.08,
        "pattern_scale": 1.0,
        "color_detail": 0.5,
    },
    "arid": {
        "sea_level": 0.97,
        "temperature": 0.82,
        "moisture": 0.28,
        "ice_caps": 0.15,
        "ocean_mix": 0.35,
        "amplitude": 0.25,
        "continent_scale": 1.15,
        "mountain_strength": 0.42,
        "detail_strength": 0.1,
        "pattern_scale": 1.15,
        "color_detail": 0.62,
    },
    "frozen": {
        "sea_level": 1.01,
        "temperature": 0.28,
        "moisture": 0.52,
        "ice_caps": 0.78,
        "ocean_mix": 0.5,
        "amplitude": 0.2,
        "continent_scale": 0.85,
        "mountain_strength": 0.24,
        "detail_strength": 0.05,
        "pattern_scale": 0.85,
        "color_detail": 0.38,
    },
    "oceanic": {
        "sea_level": 1.06,
        "temperature": 0.62,
        "moisture": 0.82,
        "ice_caps": 0.25,
        "ocean_mix": 0.8,
        "amplitude": 0.18,
        "continent_scale": 0.7,
        "mountain_strength": 0.2,
        "detail_strength": 0.06,
        "pattern_scale": 0.8,
        "color_detail": 0.48,
    },
    "volcanic": {
        "sea_level": 0.92,
        "temperature": 0.9,
        "moisture": 0.18,
        "ice_caps": 0.03,
        "ocean_mix": 0.15,
        "amplitude": 0.36,
        "continent_scale": 1.35,
        "mountain_strength": 0.72,
        "detail_strength": 0.14,
        "pattern_scale": 1.45,
        "color_detail": 0.78,
    },
}

def _clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))

def _mix_color(a, b, t):
    t = _clamp(t)
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def _scale_color(color, factor):
    return tuple(int(_clamp(channel * factor, 0, 255)) for channel in color)

def _color_variation(cfg, biome, base_color, u, height01, moisture, temperature, texture_noise, detail_noise, pattern_scale, amount):
    macro = fbm(
        texture_noise,
        u[0] * 5.5 * pattern_scale,
        u[1] * 5.5 * pattern_scale,
        u[2] * 5.5 * pattern_scale,
        octaves=4,
    )
    grain = fbm(
        detail_noise,
        u[0] * 22.0 * pattern_scale,
        u[1] * 22.0 * pattern_scale,
        u[2] * 22.0 * pattern_scale,
        octaves=3,
    )
    speckle = fbm(
        texture_noise,
        u[0] * 55.0 * pattern_scale,
        u[1] * 55.0 * pattern_scale,
        u[2] * 55.0 * pattern_scale,
        octaves=2,
    )
    texture = macro * 0.55 + grain * 0.32 + speckle * 0.13
    contrast = 1.0 + texture * amount * 0.55

    color = base_color
    if biome in ("grassland", "forest", "rainforest", "savanna"):
        lush = _mix_color(_color(cfg, "grassland"), _color(cfg, "forest"), _clamp(moisture))
        dry = _mix_color(_color(cfg, "savanna"), _color(cfg, "desert"), _clamp(temperature - moisture + 0.35))
        color = _mix_color(dry, lush, _clamp(moisture + macro * 0.3))
    elif biome in ("ocean", "deep_ocean"):
        depth = _clamp((1.0 - height01) * 1.4)
        color = _mix_color(_color(cfg, "shallows"), _color(cfg, "deep_ocean"), depth)
        contrast = 1.0 + macro * amount * 0.25
    elif biome == "beach":
        color = _mix_color(_color(cfg, "beach"), _color(cfg, "grassland"), _clamp(moisture * 0.35 + macro * 0.18))
    elif biome == "desert":
        color = _mix_color(_color(cfg, "desert"), [230, 198, 126], _clamp(macro * 0.5 + 0.5))
    elif biome == "rock":
        color = _mix_color(_color(cfg, "rock"), [86, 82, 78], _clamp(height01))
    elif biome == "basalt":
        color = _mix_color(_color(cfg, "basalt"), [96, 84, 74], _clamp(macro * 0.5 + 0.5))
    elif biome == "lava":
        ember = _mix_color(_color(cfg, "lava"), [255, 190, 58], _clamp(speckle * 0.6 + 0.4))
        color = _mix_color(_color(cfg, "basalt"), ember, _clamp(0.55 + grain * 0.45))
    elif biome == "snow":
        color = _mix_color(_color(cfg, "snow"), [190, 210, 220], _clamp((1.0 - temperature) * 0.25 + macro * 0.15))

    return _scale_color(color, contrast)

def _cfg_get(cfg, section, key, default):
    return cfg.get(section, {}).get(key, default)

def _color(cfg, name):
    return tuple(cfg.get("biomes", {}).get(name, DEFAULT_BIOMES[name]))

def _biome_bias(cfg, name):
    return _clamp(cfg.get("terrain", {}).get("biome_biases", {}).get(name, 1.0), 0.0, 2.0)

def _preset(cfg):
    name = cfg.get("planet", {}).get("preset", "earthlike")
    return PLANET_PRESETS.get(name, PLANET_PRESETS["earthlike"])

def _preset_name(cfg):
    return cfg.get("planet", {}).get("preset", "earthlike")

def _ridged_noise(noise, x, y, z, octaves, lacunarity, gain):
    value = 0.0
    amp = 1.0
    freq = 1.0
    weight_total = 0.0

    for _ in range(octaves):
        n = noise.noise(x * freq, y * freq, z * freq)
        value += (1.0 - abs(n)) * amp
        weight_total += amp
        freq *= lacunarity
        amp *= gain

    return value / weight_total if weight_total else 0.0

def classify_biome(cfg, radius, sea_level, height01, moisture, temperature, ice_caps):
    beach_band = _cfg_get(cfg, "terrain", "beach_band", 0.025)
    mountain_level = _cfg_get(cfg, "terrain", "mountain_level", 0.74)
    volcanic = _preset_name(cfg) == "volcanic"
    ocean_bias = _biome_bias(cfg, "ocean")
    snow_bias = _biome_bias(cfg, "snow")
    rock_bias = _biome_bias(cfg, "rock")
    effective_sea_level = sea_level + (ocean_bias - 1.0) * 0.08
    effective_mountain_level = mountain_level - (rock_bias - 1.0) * 0.12

    if radius < effective_sea_level - 0.045:
        return "deep_ocean", _color(cfg, "deep_ocean")
    if radius < effective_sea_level:
        return "ocean", _mix_color(_color(cfg, "ocean"), _color(cfg, "shallows"), height01)
    if radius < effective_sea_level + beach_band:
        return "beach", _color(cfg, "beach")
    if volcanic and height01 > effective_mountain_level:
        if height01 > 0.9 and moisture < 0.45:
            return "lava", _color(cfg, "lava")
        return "basalt", _color(cfg, "basalt")
    if temperature < 0.18 + (snow_bias - 1.0) * 0.12:
        return "snow", _color(cfg, "snow")
    if height01 > effective_mountain_level:
        snow_line = 1.0 - ice_caps * 0.3 - (1.0 - temperature) * 0.04 - (snow_bias - 1.0) * 0.1
        if height01 > snow_line:
            return "snow", _color(cfg, "snow")
        return "rock", _color(cfg, "rock")
    tundra_bias = _biome_bias(cfg, "tundra")
    if temperature < 0.28 + (tundra_bias - 1.0) * 0.12:
        return "tundra", _color(cfg, "tundra")

    scores = {
        "desert": _clamp((0.5 - moisture) * 2.1) * _clamp((temperature - 0.35) * 1.8),
        "savanna": _clamp(1.0 - abs(moisture - 0.34) * 3.0) * _clamp((temperature - 0.25) * 1.6),
        "grassland": _clamp(1.0 - abs(moisture - 0.48) * 2.0) * _clamp(1.0 - abs(temperature - 0.5) * 1.5),
        "forest": _clamp((moisture - 0.42) * 2.0) * _clamp(1.0 - abs(temperature - 0.48) * 1.35),
        "rainforest": _clamp((moisture - 0.62) * 2.6) * _clamp((temperature - 0.45) * 1.8),
    }
    weighted_scores = {name: score * _biome_bias(cfg, name) for name, score in scores.items()}
    winner = max(weighted_scores, key=weighted_scores.get)
    if weighted_scores[winner] <= 0:
        winner = "grassland"
    return winner, _color(cfg, winner)

def apply_noise(vertices, cfg):
    noise_cfg = cfg.get("noise", {})
    terrain_cfg = cfg.get("terrain", {})
    preset = _preset(cfg)

    pn = PerlinNoise(noise_cfg.get("seed", 0))
    moisture_noise = PerlinNoise(noise_cfg.get("seed", 0) + 101)
    detail_noise = PerlinNoise(noise_cfg.get("seed", 0) + 211)
    texture_noise = PerlinNoise(noise_cfg.get("seed", 0) + 307)

    base_radius = cfg.get("planet", {}).get("base_radius", 1.0)
    amplitude = noise_cfg.get("amplitude", preset["amplitude"])
    octaves = noise_cfg.get("octaves", 5)
    lacunarity = noise_cfg.get("lacunarity", 2.0)
    gain = noise_cfg.get("gain", 0.5)
    pattern_scale = terrain_cfg.get("pattern_scale", preset["pattern_scale"])
    color_detail = terrain_cfg.get("color_detail", preset["color_detail"])
    continent_scale = terrain_cfg.get("continent_scale", preset["continent_scale"])
    mountain_strength = terrain_cfg.get("mountain_strength", preset["mountain_strength"])
    detail_strength = terrain_cfg.get("detail_strength", preset["detail_strength"])
    plains_bias = _clamp(terrain_cfg.get("plains_bias", 0.0))
    sea_level = cfg.get("ocean", {}).get("sea_level", preset["sea_level"])
    sea_level += (preset["ocean_mix"] - 0.5) * 0.07
    effective_sea_level = sea_level + (_biome_bias(cfg, "ocean") - 1.0) * 0.08
    moisture_bias = terrain_cfg.get("moisture", preset["moisture"])
    temperature_bias = terrain_cfg.get("temperature", preset["temperature"])
    ice_caps = terrain_cfg.get("ice_caps", preset["ice_caps"])

    new_vertices = []
    colors = []
    metadata = []

    for x, y, z in vertices:
        v = np.array([x, y, z])
        u = v / np.linalg.norm(v)

        continental = fbm(
            pn,
            u[0] * continent_scale * pattern_scale,
            u[1] * continent_scale * pattern_scale,
            u[2] * continent_scale * pattern_scale,
            octaves=octaves,
            lacunarity=lacunarity,
            gain=gain,
        )
        ridges = _ridged_noise(
            detail_noise,
            u[0] * 2.8 * pattern_scale,
            u[1] * 2.8 * pattern_scale,
            u[2] * 2.8 * pattern_scale,
            max(2, octaves - 1),
            lacunarity,
            gain,
        )
        fine_detail = fbm(
            detail_noise,
            u[0] * 8.0 * pattern_scale,
            u[1] * 8.0 * pattern_scale,
            u[2] * 8.0 * pattern_scale,
            octaves=max(2, octaves - 2),
            lacunarity=lacunarity,
            gain=gain,
        )

        flattened_continents = continental * (1.0 - plains_bias * 0.28)
        softened_ridges = ridges * mountain_strength * (1.0 - plains_bias * 0.82)
        softened_detail = fine_detail * detail_strength * (1.0 - plains_bias * 0.7)
        elevation = flattened_continents + softened_ridges + softened_detail
        elevation *= 1.0 - plains_bias * 0.22
        r = base_radius + elevation * amplitude
        original_radius = r
        raw_height01 = _clamp((r - (base_radius - amplitude)) / (amplitude * 2.0))
        latitude = abs(u[1])

        temp_noise = fbm(
            moisture_noise,
            u[0] * 1.4 * pattern_scale,
            u[1] * 1.4 * pattern_scale,
            u[2] * 1.4 * pattern_scale,
            octaves=3,
        )
        moisture_value = fbm(
            moisture_noise,
            u[0] * 2.5 * pattern_scale,
            u[1] * 2.5 * pattern_scale,
            u[2] * 2.5 * pattern_scale,
            octaves=4,
        )
        moisture = _clamp(0.5 + moisture_value * 0.55 + (moisture_bias - 0.5))
        temperature = _clamp(
            temperature_bias
            - (latitude ** 16) * (2.5 + ice_caps * 1.5)
            + temp_noise * 0.12
            - raw_height01 * 0.12
        )

        biome, color = classify_biome(cfg, original_radius, sea_level, raw_height01, moisture, temperature, ice_caps)
        color = _color_variation(
            cfg,
            biome,
            color,
            u,
            raw_height01,
            moisture,
            temperature,
            texture_noise,
            detail_noise,
            pattern_scale,
            color_detail,
        )
        if r < effective_sea_level:
            r = effective_sea_level
        colors.append(color)
        metadata.append({
            "biome": biome,
            "height": round(raw_height01, 4),
            "moisture": round(moisture, 4),
            "temperature": round(temperature, 4),
        })
        new_vertices.append(tuple(u * r))

    return new_vertices, colors, metadata
