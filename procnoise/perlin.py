import math
import random

def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)

def lerp(a, b, t):
    return a + t * (b - a)

def grad(hash, x, y, z):
    h = hash & 15
    u = x if h < 8 else y
    v = y if h < 4 else (x if h in (12, 14) else z)
    return ((u if (h & 1) == 0 else -u) +
            (v if (h & 2) == 0 else -v))

class PerlinNoise:
    def __init__(self, seed=0):
        random.seed(seed)
        p = list(range(256))
        random.shuffle(p)
        self.p = p * 2

    def noise(self, x, y, z):
        X = int(math.floor(x)) & 255
        Y = int(math.floor(y)) & 255
        Z = int(math.floor(z)) & 255

        x -= math.floor(x)
        y -= math.floor(y)
        z -= math.floor(z)

        u, v, w = fade(x), fade(y), fade(z)

        A  = self.p[X] + Y
        AA = self.p[A] + Z
        AB = self.p[A + 1] + Z
        B  = self.p[X + 1] + Y
        BA = self.p[B] + Z
        BB = self.p[B + 1] + Z

        return lerp(
            lerp(
                lerp(grad(self.p[AA], x, y, z),
                     grad(self.p[BA], x - 1, y, z), u),
                lerp(grad(self.p[AB], x, y - 1, z),
                     grad(self.p[BB], x - 1, y - 1, z), u),
                v),
            lerp(
                lerp(grad(self.p[AA + 1], x, y, z - 1),
                     grad(self.p[BA + 1], x - 1, y, z - 1), u),
                lerp(grad(self.p[AB + 1], x, y - 1, z - 1),
                     grad(self.p[BB + 1], x - 1, y - 1, z - 1), u),
                v),
            w)

def fbm(noise, x, y, z, octaves=4, lacunarity=2.0, gain=0.5):
    value = 0.0
    amp = 1.0
    freq = 1.0

    for _ in range(octaves):
        value += amp * noise.noise(x * freq, y * freq, z * freq)
        freq *= lacunarity
        amp *= gain

    return value
