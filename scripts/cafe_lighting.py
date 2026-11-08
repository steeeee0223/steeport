"""Bake diffuse window and pendant light for the fixed room surfaces."""
import math

import bpy
import numpy as np


ATLAS_SIZE = 1024
TEXELS_PER_METER = 33
PADDING = 4
BOUNCE_UV = "Room irradiance"
BOUNCE_RANGE = 3.0


def _receives_bounce(obj):
    if obj.type != "MESH" or not obj.data.materials or obj.hide_render:
        return False
    name = obj.name.partition(".")[0]
    parent = obj.parent.name.partition(".")[0] if obj.parent else ""
    return name in {
        "Quarry tiles", "Ceiling panel", "Oak top", "Countertop",
        "Counter body", "Glazed counter tile", "Cabinet", "Worktop",
        "Booth base", "Booth cushion", "Booth back", "Chair seat",
        "Bookcase back", "Shelf upright", "Shelf board",
    } or parent in {
        "WallBack", "WallLeft", "WallRight", "FrontPlaster", "Open casement",
    } or name in {"Window rail", "Window mullion", "Window jamb", "Door jamb", "Door lintel", "Transom rail"}


def _charts(obj):
    mesh = obj.data
    world = obj.matrix_world
    if obj.name == "Quarry tiles":
        upper_loops = [mesh.loops[index] for face in mesh.polygons
                       if face.normal.z > 0.1 for index in face.loop_indices]
        return [(upper_loops, (0, 1), [world @ vertex.co for vertex in mesh.vertices])]
    # These receivers are boxes. Separate faces avoid packing surfaces that
    # face the window with surfaces that face into the room.
    points = [vertex.co.copy() for vertex in mesh.vertices]
    for point in points:
        for axis in range(3):
            point[axis] *= world.col[axis].to_3d().length
    return [(list(mesh.loops[face.loop_start:face.loop_start + face.loop_total]),
             tuple(axis for axis in range(3) if axis != max(range(3), key=lambda i: abs(face.normal[i]))),
             points) for face in mesh.polygons]


def _pack(charts, scale):
    rows, packed = [], []
    for chart in sorted(charts, key=lambda chart: -chart[3][1]):
        w, h = [max(3, math.ceil(length * scale)) for length in chart[3]]
        width, height = w + 2 * PADDING, h + 2 * PADDING
        if width > ATLAS_SIZE:
            return None
        row = next((row for row in rows if row[0] + width <= ATLAS_SIZE), None)
        if row is None:
            y = rows[-1][1] + rows[-1][2] if rows else 0
            if y + height > ATLAS_SIZE:
                return None
            row = [0, y, height]
            rows.append(row)
        x, y, _ = row
        packed.append((chart, x, y, w, h))
        row[0] += width
    return packed


def _atlas_uvs(objects):
    charts = []
    for obj in objects:
        layers = obj.data.uv_layers
        uv = layers.new(name=BOUNCE_UV, do_init=False)
        for loops, axes, points in _charts(obj):
            extent = [[points[loop.vertex_index][axis] for loop in loops] for axis in axes]
            offsets = tuple(min(values) for values in extent)
            spans = tuple(max(values) - start for values, start in zip(extent, offsets))
            charts.append((uv, loops, extent, spans, offsets))
        obj["irradianceUv"] = len(layers) - 1

    for scale in range(TEXELS_PER_METER, 8, -2):
        packed = _pack(charts, scale)
        if packed is not None:
            break
    else:
        raise RuntimeError("Room irradiance atlas ran out of chart space")
    print(f"Irradiance atlas: {len(charts)} surfaces at {scale} texels/m", flush=True)
    for (uv, loops, extent, spans, offsets), x, y, w, h in packed:
        for loop, u, v in zip(loops, *extent):
            uv.data[loop.index].uv = (
                (x + PADDING + (u - offsets[0]) / max(spans[0], 1e-6) * w) / ATLAS_SIZE,
                (y + PADDING + (v - offsets[1]) / max(spans[1], 1e-6) * h) / ATLAS_SIZE,
            )


def _make_bake_proxy(objects):
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mats = {}
    copies = []
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        # The bake uses the same beveled surfaces and UVs as the exported room.
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                                depsgraph=depsgraph)
        copy = bpy.data.objects.new("Irradiance proxy", mesh)
        scene.collection.objects.link(copy)
        copy.matrix_world = obj.matrix_world
        for index, mat in enumerate(mesh.materials):
            if mat not in mats:
                mats[mat] = mat.copy()
            mesh.materials[index] = mats[mat]
        copies.append(copy)
        copy.select_set(True)
        obj.hide_render = True
    bpy.context.view_layer.objects.active = copies[0]
    bpy.ops.object.join()
    return bpy.context.object, mats.values()


def smooth_irradiance(rgb):
    """Remove bake noise in linear RGB. The three-pixel radius stays inside chart padding."""
    weights = (1 / 64, 6 / 64, 15 / 64, 20 / 64, 15 / 64, 6 / 64, 1 / 64)
    height, width = rgb.shape[:2]

    def blur(values):
        # Edge padding only affects the black perimeter of the atlas.
        horizontal = np.pad(values, ((0, 0), (3, 3), (0, 0)), mode="edge")
        horizontal = sum(weight * horizontal[:, i:i + width] for i, weight in enumerate(weights))
        vertical = np.pad(horizontal, ((3, 3), (0, 0), (0, 0)), mode="edge")
        return sum(weight * vertical[i:i + height] for i, weight in enumerate(weights))

    local = blur(rgb)
    return blur(np.minimum(rgb, 2.5 * local + 0.025))


def write_irradiance(linear, output):
    rgb = np.where(linear < 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055)
    rgba = np.concatenate((rgb, np.ones_like(rgb[:, :, :1])), axis=2)
    image = bpy.data.images.new("Room irradiance", linear.shape[1], linear.shape[0], alpha=False)
    image.colorspace_settings.name = "sRGB"
    image.pixels.foreach_set(rgba.ravel())
    image.file_format = "PNG"
    image.filepath_raw = str(output)
    image.save()
    return image


def bake_room_bounce(output, sun, moving):
    """Store two Cycles diffuse passes in one sRGB PNG with fixed linear range."""
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    objects = [obj for obj in scene.objects if _receives_bounce(obj)]
    _atlas_uvs(objects)
    proxy, materials = _make_bake_proxy(objects)
    hidden = {obj: obj.hide_render for root in moving for obj in (root, *root.children_recursive)}
    for obj in hidden:
        obj.hide_render = True

    target = bpy.data.images.new("Room irradiance bake", ATLAS_SIZE, ATLAS_SIZE,
                                 alpha=False, float_buffer=True)
    target.colorspace_settings.name = "Non-Color"
    for mat in materials:
        nodes = mat.node_tree.nodes
        node = nodes.new("ShaderNodeTexImage")
        node.image = target
        nodes.active = node

    samples = scene.cycles.samples
    scene.cycles.samples = 16
    bake = scene.render.bake
    bake.use_pass_color = False
    bake.use_pass_indirect = True

    def bake_pixels(direct):
        bake.use_pass_direct = direct
        bpy.ops.object.bake(type="DIFFUSE", uv_layer=BOUNCE_UV, margin=PADDING - 1)
        rgba = np.empty(ATLAS_SIZE * ATLAS_SIZE * 4, dtype=np.float32)
        target.pixels.foreach_get(rgba)
        return rgba.reshape((ATLAS_SIZE, ATLAS_SIZE, 4))[:, :, :3].copy()

    # The desktop sun remains live so dappled light responds to the door and
    # props. Bake its soft bounce separately from the sky and fixtures.
    sun.hide_render = True
    irradiance = bake_pixels(direct=True)
    sun.hide_render = False
    sky_strength = scene.world.node_tree.nodes["Background"].inputs["Strength"]
    ambient_strength = sky_strength.default_value
    sky_strength.default_value = 0
    lights = [obj for obj in scene.objects if obj.type == "LIGHT" and obj != sun]
    for light in lights:
        light.hide_render = True
    irradiance += bake_pixels(direct=False)
    for light in lights:
        light.hide_render = False
    sky_strength.default_value = ambient_strength
    scene.cycles.samples = samples

    linear = np.clip(smooth_irradiance(irradiance) / BOUNCE_RANGE, 0, 1)
    image = write_irradiance(linear, output)
    image.pack()
    image.filepath_raw = "//../public/room-irradiance.png"
    bpy.data.images.remove(target)
    print("Room irradiance quantiles:", np.quantile(irradiance[irradiance > 0], (0.05, 0.5, 0.95, 0.99)))

    mesh = proxy.data
    bpy.data.objects.remove(proxy, do_unlink=True)
    for mat in materials:
        bpy.data.materials.remove(mat)
    bpy.data.meshes.remove(mesh)
    for obj in objects:
        obj.hide_render = False
    for obj, was_hidden in hidden.items():
        obj.hide_render = was_hidden
