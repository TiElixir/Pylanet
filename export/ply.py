def export_ply(filename, vertices, faces, colors):
    with open(filename, "w") as f:
        f.write("ply\nformat ascii 1.0\n")
        f.write(f"element vertex {len(vertices)}\n")
        f.write("property float x\nproperty float y\nproperty float z\n")
        f.write("property uchar red\nproperty uchar green\nproperty uchar blue\n")
        f.write(f"element face {len(faces)}\n")
        f.write("property list uchar int vertex_indices\nend_header\n")

        for (x, y, z), (r, g, b) in zip(vertices, colors):
            f.write(f"{x} {y} {z} {r} {g} {b}\n")

        for face in faces:
            f.write(f"3 {face[0]} {face[1]} {face[2]}\n")
