import numpy as np

def generate_uv_sphere(radius=1.0, lat=50, lon=50):
    vertices = []
    faces = []

    for i in range(lat + 1):
        theta = np.pi * i / lat
        for j in range(lon):
            phi = 2 * np.pi * j / lon
            x = radius * np.sin(theta) * np.cos(phi)
            y = radius * np.cos(theta)
            z = radius * np.sin(theta) * np.sin(phi)
            vertices.append((x, y, z))

    for i in range(lat):
        for j in range(lon):
            curr = i * lon + j
            next = curr + lon
            faces.append((curr, next, curr + 1))
            faces.append((curr + 1, next, next + 1))

    return vertices, faces
