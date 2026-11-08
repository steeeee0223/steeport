"""Create packed, UV-mapped PBR surfaces for the café's Blender and GLB files."""

import math
import re
import zlib

import bpy
import numpy as np


def linear_color(hex_color):
    rgb = np.array([int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def image(name, values, colorspace):
    height, width, channels = values.shape
    packed = bpy.data.images.new(name, width=width, height=height, alpha=False)
    packed.colorspace_settings.name = colorspace
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[:, :, :channels] = np.clip(values, 0, 1)
    if channels == 1:
        rgba[:, :, 1:3] = rgba[:, :, :1]
    packed.pixels.foreach_set(rgba.ravel())
    packed.pack()
    return packed


def variation(u, v, columns, rows, rng):
    """Periodic grid noise for continuous texture tiling."""
    grid = rng.random((rows, columns))
    a, b = u * columns, v * rows
    i, j = np.floor(a).astype(int), np.floor(b).astype(int)
    s, t = a - i, b - j
    s, t = s * s * (3 - 2 * s), t * t * (3 - 2 * t)
    i, j = i % columns, j % rows
    ii, jj = (i + 1) % columns, (j + 1) % rows
    return (grid[j, i] * (1 - s) + grid[j, ii] * s) * (1 - t) + (
        grid[jj, i] * (1 - s) + grid[jj, ii] * s) * t - 0.5


def wood(u, v, rng):
    # Offset the same rings at each knot, with longer curves along the grain.
    warped = v + 0.013 * variation(u, v, 4, 11, rng)
    cathedral = np.sin(math.tau * (1.2 * u + 3 * v))
    warped += 0.012 * cathedral + 0.018 * variation(u, v, 3, 7, rng)
    knot = np.zeros_like(u)
    for x, y, width, height in ((0.23, 0.21, 0.075, 0.051),
                                (0.71, 0.65, 0.12, 0.062),
                                (0.91, 0.39, 0.061, 0.043)):
        dx = ((u - x + 0.5) % 1 - 0.5) / width
        dy = ((v - y + 0.5) % 1 - 0.5) / height
        r = dx * dx + dy * dy
        warped += 0.048 * dy * np.exp(-r * 0.7)
        knot += np.exp(-r * 3.5)
    annual = np.sin(math.tau * (34 * warped + 0.29 * variation(u, v, 5, 15, rng)))
    latewood = np.maximum(annual, 0) ** 7
    fiber = variation(u, v, 18, 157, rng)
    broad = variation(u, v, 5, 18, rng)
    pore = np.maximum(0, variation(u, v, 155, 125, rng) - 0.2)
    mineral = np.maximum(0, variation(u, v, 5, 42, rng) - 0.11)
    tone = 1 + 0.26 * broad + 0.22 * fiber - 0.20 * latewood - 0.39 * knot - 0.17 * pore - 0.12 * mineral
    return tone, 0.41 + 0.07 * latewood + 0.16 * broad, -0.28 * latewood + 0.28 * fiber - pore


def plaster(u, v, rng):
    stains = variation(u, v, 7, 6, rng)
    patches = variation(u, v, 19, 16, rng)
    aggregate = variation(u, v, 134, 135, rng)
    tone = 1 + 0.14 * stains + 0.13 * patches + 0.075 * aggregate
    return tone, 0.87 + 0.12 * patches, 0.45 * aggregate + 0.4 * patches


def stone(u, v, rng):
    stain = variation(u, v, 5, 5, rng) + 0.45 * variation(u, v, 15, 16, rng)
    grain = variation(u, v, 87, 95, rng)
    grit = np.maximum(0, variation(u, v, 229, 236, rng) - 0.19)
    tone = 1 + 0.24 * stain + 0.11 * grain - 0.27 * grit
    return tone, 0.68 + 0.19 * stain, 0.35 * grain - 0.55 * grit


def brick(u, v, rng):
    # Six courses in 42 cm, with a half-brick running bond.
    rows, columns = 6, 4
    row = np.floor(v * rows).astype(int)
    course_x = u * columns + (row % 2) * 0.5
    joints_x = np.abs((course_x + 0.5) % 1 - 0.5)
    joints_y = np.abs((v * rows + 0.5) % 1 - 0.5)
    aggregate = variation(u, v, 105, 69, rng)
    irregularity = variation(u, v, 35, 26, rng) * 0.027
    body = np.clip((np.minimum(joints_x * 3.7, joints_y) + irregularity - 0.054) / 0.045, 0, 1)
    brick_tone = rng.uniform(0.78, 1.19, (rows, columns))[row, np.floor(course_x).astype(int) % columns]
    tone = body * (brick_tone + 0.22 * aggregate) + (1 - body) * 1.75
    return tone, 0.82 + 0.15 * (1 - body) + 0.15 * aggregate, body + 0.25 * aggregate


def bark(u, v, rng):
    # The stem meshes carry longitudinal UVs, so ridges follow bends and forks.
    ridges = variation(u, v, 4, 34, rng)
    cracks = np.maximum(0, variation(u, v, 8, 67, rng) - 0.10) ** 1.4
    plates = variation(u, v, 14, 18, rng)
    return 1 + 0.36 * ridges + 0.24 * plates - 0.52 * cracks, 0.83 + 0.09 * plates, ridges - 1.5 * cracks


def coated(u, v, rng):
    marks = variation(u, v, 14, 27, rng)
    abrasion = variation(u, v, 60, 168, rng)
    return 1 + 0.11 * marks + 0.05 * abrasion, 0.37 + 0.12 * marks, 0.15 * abrasion


def anodized(u, v, rng):
    tone = variation(u, v, 26, 27, rng)
    texture = variation(u, v, 61, 170, rng)
    return 1 + 0.035 * tone, 0.49 + 0.065 * tone, 0.05 * texture


def brushed_steel(u, v, rng):
    brush = variation(u, v, 4, 112, rng)
    tone = variation(u, v, 12, 18, rng)
    return 1 + 0.055 * brush + 0.025 * tone, 0.38 + 0.10 * brush, 0.09 * brush


def fabric(u, v, rng):
    warp = np.sin(math.tau * 88 * u)
    weft = np.sin(math.tau * 95 * v)
    mottling = variation(u, v, 14, 13, rng)
    weave = warp * weft
    return 1 + 0.12 * mottling + 0.06 * weave, 0.84 + 0.05 * weave, 0.1 * weave


def mapped_surface(material, hex_color, pattern, size, normal_strength, metal=0):
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    for name in ("Base Color", "Roughness", "Normal"):
        for link in list(bsdf.inputs[name].links):
            material.node_tree.links.remove(link)
    coords = np.arange(size) / size
    u, v = np.meshgrid(coords, coords)
    seed = zlib.crc32(material.name.encode())
    tone, roughness, height = pattern(u, v, np.random.default_rng(seed))
    rgb = linear_color(hex_color)
    material.diffuse_color = (*rgb, 1)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Metallic"].default_value = metal

    def map_texture(label, values, colorspace):
        texture = nodes.new("ShaderNodeTexImage")
        texture.label = label
        texture.image = image(f"{material.name} {label}", values, colorspace)
        return texture.outputs["Color"]

    base = np.clip(tone[:, :, None] * rgb, 0, 1)
    base = np.where(base <= 0.0031308, base * 12.92, 1.055 * base ** (1 / 2.4) - 0.055)
    material.node_tree.links.new(map_texture("Albedo", base, "sRGB"), bsdf.inputs["Base Color"])
    material.node_tree.links.new(
        map_texture("Roughness", roughness[:, :, None], "Non-Color"), bsdf.inputs["Roughness"],
    )
    if not normal_strength:
        return
    grad_x = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * normal_strength
    grad_y = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * normal_strength
    normals = np.stack((-grad_x, -grad_y, np.ones_like(height)), axis=2)
    normals = normals / np.linalg.norm(normals, axis=2, keepdims=True) * 0.5 + 0.5
    normal = nodes.new("ShaderNodeNormalMap")
    material.node_tree.links.new(map_texture("Normal", normals, "Non-Color"), normal.inputs["Color"])
    material.node_tree.links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])


def project_surface(obj, width, depth, align_world, grain):
    """Project each face at a repeat measured in metres and keep the existing UV channel."""
    mesh = obj.data
    uvs = mesh.uv_layers.active
    if uvs is None:
        uvs = mesh.uv_layers.new(name="UVMap")
    offset = zlib.crc32(obj.name.encode()) / 2 ** 32
    dimensions = obj.dimensions
    for face in mesh.polygons:
        axis = max(range(3), key=lambda index: abs(face.normal[index]))
        tangent = [index for index in range(3) if index != axis]
        if grain:
            tangent.sort(key=lambda index: dimensions[index], reverse=True)
        u, v = tangent
        for loop_index in face.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if align_world:
                vertex = obj.matrix_world @ vertex
            else:
                vertex = tuple(value * obj.scale[index] for index, value in enumerate(vertex))
            uvs.data[loop_index].uv = (vertex[u] / width + (0 if align_world else offset),
                                       vertex[v] / depth + (0 if align_world else offset * 0.71))


def apply_surfaces(scene):
    # color, pattern, texture size, normal strength, metallic factor, UV repeat width/depth, mode
    specs = {
        "Honey oak": ("80583e", wood, 512, 0.44, 0, 1.95, 0.63, "grain"),
        "End grain": ("735036", wood, 256, 0.29, 0, 1.6, 0.64, "grain"),
        "Limewash": ("bfb09c", plaster, 384, 0.54, 0, 2.4, 2.4, "world"),
        "Painted green trim": ("403b33", coated, 192, 0.20, 0.10, 0.82, 0.82, "local"),
        "Blackened oak door": ("393128", wood, 256, 0.34, 0, 1.95, 0.63, "grain"),
        "Brushed stainless steel": ("a6a5a0", brushed_steel, 192, 0.19, 0.72, 0.64, 0.37, "grain"),
        "Dark metal": ("423d36", coated, 192, 0.4, 0.42, 0.64, 0.64, "local"),
        "Graphite laptop": ("4d4b47", anodized, 128, 0.0, 0.40, 0.36, 0.36, "local"),
        "Brass": ("ae8654", coated, 192, 0.28, 0.65, 0.34, 0.34, "local"),
        "Counter tile": ("465647", coated, 192, 0.33, 0.04, 0.72, 0.72, "local"),
        "Honed soapstone": ("777571", stone, 192, 0.33, 0, 1.18, 0.76, "world"),
        "Olive cloth": ("77745f", fabric, 256, 0.41, 0, 0.21, 0.21, "local"),
        "Plane tree bark": ("5c4a3a", bark, 384, 0.69, 0, 1, 1, "existing"),
        "Weathered cedar": ("75523b", wood, 256, 0.52, 0, 1.50, 0.58, "grain"),
        "Weathered field journal leather": ("70553c", plaster, 192, 0.42, 0, 0.19, 0.19, "local"),
        "Street": ("60625f", stone, 192, 0.35, 0, 2.2, 2.2, "world"),
        "Street facade 0": ("9e6957", brick, 256, 0.52, 0, 0.99, 0.42, "world"),
        "Street facade 1": ("b0a391", plaster, 192, 0.42, 0, 1.9, 1.9, "world"),
        "Street facade 2": ("9c9682", plaster, 192, 0.42, 0, 1.9, 1.9, "world"),
        "Street facade 3": ("a46a53", brick, 256, 0.52, 0, 0.99, 0.42, "world"),
        "Street facade 4": ("b6a18c", plaster, 192, 0.42, 0, 1.9, 1.9, "world"),
    }
    for i, hex_color in enumerate(("8e8173", "968b7e", "877e73", "9b8e80", "928576", "908679")):
        specs[f"Quarry tile {i}"] = (hex_color, stone, 128, 0.37, 0, 1, 1, "existing")

    for i, color in enumerate(("9e947e", "aba08c", "9e9581", "b3a68d", "978b78")):
        specs[f"Street limestone {i}"] = (color, stone, 128, 0.34, 0, 1.2, 1.2, "world")

    # Individual mapping must run before static batching, while object axes and scale are available.
    bpy.context.view_layer.update()
    for obj in scene.objects:
        if obj.type != "MESH" or len(obj.data.materials) != 1:
            continue
        material = obj.data.materials[0]
        spec = specs.get(material.name)
        if spec is not None and spec[-1] != "existing":
            width, depth, mode = spec[-3:]
            project_surface(obj, width, depth, mode == "world", mode == "grain")
        if (re.sub(r"\.\d+$", "", obj.name) == "Glazed counter tile"
                and "Counter tile" in bpy.data.materials):
            obj.data.materials[0] = bpy.data.materials["Honey oak"]
            project_surface(obj, 1.95, 0.63, False, True)

    for name, spec in specs.items():
        material = bpy.data.materials.get(name)
        if material is not None:
            mapped_surface(material, *spec[:5])
    # Desaturate grout and the large cream ceiling to keep the warm sun directional.
    for name, color in (("Tile grout", "73675c"), ("Warm ivory", "d8ccba")):
        material = bpy.data.materials.get(name)
        if material is not None:
            rgb = (*linear_color(color), 1)
            material.diffuse_color = rgb
            material.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = rgb
