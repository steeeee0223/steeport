"""Fit CC0 workshop props to the browser desks and export a packed Blender scene."""

import argparse
import gzip
import json
import shutil
import sys
from math import pi
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
LAYOUT = json.loads((ROOT / "scene/layout.json").read_text())
DESKS = LAYOUT["workshopDesks"]
REPAIR_BENCH = LAYOUT["workshopBench"]
DESK_TOP = 0.79
MAT_TOP = 0.798


def group(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def meshes_from(path, names=None, *, reduction=1, prepare=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = set(bpy.data.objects) - before
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    result = []
    for obj in sorted(imported, key=lambda obj: obj.name):
        if obj.type != "MESH" or (names is not None and obj.name not in names):
            continue
        if prepare is not None:
            prepare(obj)
        if reduction < 1 and len(obj.data.polygons) > 1000:
            modifier = obj.modifiers.new("Browser mesh", "DECIMATE")
            modifier.ratio = reduction
            modifier.use_collapse_triangulate = True
            depsgraph.update()
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated)
        copy = bpy.data.objects.new(obj.name + "_fitted", mesh)
        bpy.context.collection.objects.link(copy)
        copy.matrix_world = evaluated.matrix_world
        result.append(copy)
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    if not result:
        raise ValueError(f"No matching meshes in {path.name}")
    return result


def bounds(objects, transform=Matrix.Identity(4)):
    points = [
        transform @ obj.matrix_world @ Vector(corner)
        for obj in objects
        for corner in obj.bound_box
    ]
    return Vector(tuple(map(min, zip(*points)))), Vector(tuple(map(max, zip(*points))))


def fitted(name, objects, rotation=None, width=None, scale=1.0, origin=None):
    orientation = Matrix.Identity(4) if rotation is None else rotation
    low, high = bounds(objects, orientation)
    if width is not None:
        scale = width / (high.x - low.x)
    anchor = origin if origin is not None else Vector(
        ((low.x + high.x) / 2, (low.y + high.y) / 2, low.z)
    )
    transform = Matrix.Scale(scale, 4) @ Matrix.Translation(-anchor) @ orientation
    root = group(name)
    for obj in objects:
        matrix = transform @ obj.matrix_world
        obj.parent = root
        obj.matrix_world = matrix
    return root


def place(parent, desk, x, z, height=DESK_TOP, angle=0):
    parent.location = (desk["x"] + x, -(desk["z"] + z), height)
    parent.rotation_euler.z = angle


def duplicate(original, name):
    root = group(name)
    for obj in original.children:
        copy = obj.copy()
        bpy.context.collection.objects.link(copy)
        local = obj.matrix_basis.copy()
        copy.parent = root
        copy.matrix_basis = local
    return root


def material(name, rgba, roughness=0.84, metal=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    return mat


def set_surface(mat, **values):
    shader = mat.node_tree.nodes.get("Principled BSDF")
    for name, value in values.items():
        socket = shader.inputs[name.replace("_", " ")]
        for link in list(socket.links):
            mat.node_tree.links.remove(link)
        socket.default_value = value


def print_label(text, position, size, ink, parent=None):
    font = bpy.data.curves.new(text, "FONT")
    font.body = text
    font.size = size
    font.align_x = "CENTER"
    font.align_y = "CENTER"
    font.resolution_u = 2
    obj = bpy.data.objects.new(text, font)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = position
    font.materials.append(ink)
    # glTF exports only mesh geometry.
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
    label = bpy.data.objects.new(text + "_ink", mesh)
    bpy.context.collection.objects.link(label)
    label.parent = parent
    label.location = position
    bpy.data.objects.remove(obj, do_unlink=True)
    return label


def keyboard_legends():
    ink = material("Keyboard pad-printed ink", (0.081, 0.093, 0.088, 1))
    # Keycap row centers measured on the imported keyboard, in millimeters.
    rows = (
        (17, 42.2, [-164, -126, -107, -88, -69, -40, -21, -2, 17, 45, 64, 83, 102],
         ("ESC", *(f"F{i}" for i in range(1, 13)))),
        (-11, 39.3, [-164, -145, -126, -107, -88, -69, -50, -31, -12, 7, 26, 45, 64, 93],
         (*"`1234567890-=", "BACK")),
        (-30, 37.2, [-160, -136, -117, -98, -79, -60, -40, -21, -2, 17, 36, 55, 74, 98],
         ("TAB", *"QWERTYUIOP[]", "\\")),
        (-49, 35.3, [-157, -131, -112, -93, -74, -55, -36, -17, 2, 21, 40, 60, 90],
         ("CAPS", *"ASDFGHJKL;'", "ENTER")),
        (-68, 33.9, [-152, -121, -102, -83, -64, -45, -26, -7, 12, 31, 50, 86, 145],
         ("SHIFT", *"ZXCVBNM,./", "SHIFT", "↑")),
        (-87, 32.5, [-162, -138, -114, 29, 52, 76, 100, 126, 145, 164],
         ("CTRL", "WIN", "ALT", "ALT", "FN", "MENU", "CTRL", "←", "↓", "→")),
    )
    labels = [
        print_label(key, (x / 1000, y / 1000, (height + 0.23) / 1000), 0.0048, ink)
        for y, height, columns, keys in rows
        for x, key in zip(columns, keys, strict=True)
    ]
    bpy.ops.object.select_all(action="DESELECT")
    for label in labels:
        label.select_set(True)
    bpy.context.view_layer.objects.active = labels[0]
    bpy.ops.object.join()
    labels[0].name = "Keyboard legends"
    bpy.context.view_layer.update()
    return labels[0]


def annotations(parent):
    ink = material("Document toner", (0.10, 0.14, 0.14, 1))
    print_label("BENCH 08 / LINK CHECK", (0, 0.104, 0.001), 0.013, ink, parent)
    vertices = []
    faces = []
    for row, width in enumerate((0.15, 0.16, 0.105, 0.14, 0.152, 0.094, 0.114)):
        y = 0.075 - row * 0.011
        start = len(vertices)
        vertices.extend([(-0.08, y, 0.001), (-0.08 + width, y, 0.001),
                         (-0.08 + width, y + 0.002, 0.001), (-0.08, y + 0.002, 0.001)])
        faces.append((start, start + 1, start + 2, start + 3))
    mesh = bpy.data.meshes.new("Printed lines")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(ink)
    obj = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent


def finish_safe_liner(obj):
    if obj.name != "office-safe_body":
        return
    # In the Grab3D source, the liner shell, rear panel, and shelf occupy this
    # contiguous face range. The next faces belong to the paper stack.
    if len(obj.data.polygons) != 3244:
        raise ValueError("Unexpected Grab3D office safe mesh for the liner finish")
    liner = material("Safe interior black enamel", (0.014, 0.015, 0.017, 1), roughness=0.73)
    liner_index = len(obj.data.materials)
    obj.data.materials.append(liner)
    for face in obj.data.polygons[1116:1620]:
        face.material_index = liner_index


def dress_repair_bench(sources, router, folder, stack, memo, tool):
    bench = REPAIR_BENCH
    facing_aisle = pi / 2
    orientation = Matrix.Rotation(facing_aisle, 4, "Z")
    parts = meshes_from(sources / "repair-bench.glb")
    # Leave the safe's door swing clear and retain the back and end ties.
    front_tie = next(part for part in parts if part.name == "Long frame tie_fitted")
    parts.remove(front_tie)
    bpy.data.objects.remove(front_tie, do_unlink=True)
    low, high = bounds(parts, orientation)
    stand = fitted("Entrance repair bench", parts, orientation)
    top, mat, shelf = [
        bounds([next(part for part in parts if part.name == name + "_fitted")])[1].z
        for name in (
            "Technical work surface",
            "Antistatic repair mat",
            "Raised test instrument shelf",
        )
    ]
    vertical_scale = 0.90 / top
    stand.scale = (
        bench["width"] / (high.x - low.x),
        bench["depth"] / (high.y - low.y),
        vertical_scale,
    )
    place(stand, bench, 0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    worktop = next(part for part in parts if part.name == "Technical work surface_fitted")
    bpy.context.view_layer.objects.active = worktop
    bpy.ops.object.join()
    worktop.name = "Workbench frame, shelves, and ESD mat"
    mat_top = mat * vertical_scale
    shelf_top = shelf * vertical_scale

    safe_parts = meshes_from(
        sources / "grab-safe.glb", reduction=0.57, prepare=finish_safe_liner,
    )
    door = next(part for part in safe_parts if part.name == "office-safe_door_fitted")
    # The source leaf is already centered on its left hinge axis.
    door.name = "Workshop safe door"
    safe = fitted("Steel office safe", safe_parts, scale=0.82)
    for name in ("office-safe_body_pbr", "office-safe_door_pbr"):
        set_surface(bpy.data.materials[name], Metallic=0.28, Roughness=0.70)
    place(safe, bench, -0.05, 0.29, 0, facing_aisle)

    pegboard = fitted(
        "Wall-mounted tool board",
        meshes_from(sources / "pegboard-tool-wall.glb", reduction=0.64),
        scale=1.22,
    )
    place(pegboard, bench, -0.322, 0, 1.65, facing_aisle)

    meter = fitted(
        "Digital multimeter with probes",
        meshes_from(sources / "multimeter.glb", reduction=0.65),
    )
    set_surface(bpy.data.materials["multimeter_body_pbr"], Metallic=0, Roughness=0.70)
    place(meter, bench, 0.13, 0.31, mat_top, facing_aisle + 0.24)

    pcb = fitted(
        "Populated circuit board",
        meshes_from(sources / "circuit-board.glb", reduction=0.45),
        scale=1.46,
    )
    set_surface(bpy.data.materials["circuit-board_body_pbr"], Metallic=0.16, Roughness=0.55)
    place(pcb, bench, -0.018, 0.08, mat_top, facing_aisle - 0.21)

    case = fitted(
        "Vintage steel toolbox",
        meshes_from(sources / "metal_toolbox_1k.gltf", reduction=0.60),
        width=0.37,
    )
    place(case, bench, -0.207, -0.36, shelf_top, facing_aisle)
    test_router = duplicate(router, "Repair bench test router")
    place(test_router, bench, -0.207, 0.20, shelf_top, facing_aisle + 0.08)
    lamp = fitted(
        "Clamp-mounted task lamp",
        meshes_from(sources / "desk_lamp_arm_01_1k.gltf", reduction=0.48),
        scale=0.58,
        origin=Vector((0, 0, 0)),
    )
    place(lamp, bench, -0.061, 0.59, shelf_top, -facing_aisle)

    binder = duplicate(folder, "Repair job folder")
    forms = duplicate(stack, "Repair job documents")
    report = duplicate(memo, "Repair job test sheet")
    place(binder, bench, 0.11, -0.43, mat_top, facing_aisle - 0.12)
    folder_top = max(
        (obj.matrix_basis @ Vector(corner)).z
        for obj in binder.children
        for corner in obj.bound_box
    )
    place(forms, bench, 0.103, -0.427, mat_top + folder_top, facing_aisle + 0.04)
    place(report, bench, 0.11, -0.41, mat_top + folder_top + 0.011, facing_aisle - 0.07)

    screwdriver = duplicate(tool, "Repair bench screwdriver")
    place(screwdriver, bench, 0.233, 0.025, mat_top, facing_aisle - 0.22)


def darken_safe_paint(image):
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgb = pixels.reshape(-1, 4)[:, :3]
    red, green, blue = rgb.T
    # Replace the sage enamel while retaining the dial, hardware and cabinet contents.
    blend = np.clip((green - np.maximum(red, blue) - 0.015) / 0.055, 0, 1)
    blend *= np.clip((green - 0.32) / 0.23, 0, 1)
    shade = np.clip(0.13 + (green - 0.72) * 0.28, 0.075, 0.20)
    graphite = shade[:, None] + np.array([0.0, 0.006, 0.012], dtype=np.float32)
    rgb += (graphite - rgb) * blend[:, None]
    image.pixels.foreach_set(pixels)
    image.update()


def limit_images():
    bpy.data.orphans_purge(do_recursive=True)
    for image in bpy.data.images:
        width, height = image.size
        limit = 256
        if image.name.startswith(("office-safe", "office_notepads")):
            limit = 384
        if image.name.startswith("el102_col_"):
            limit = 32
        resized = max(width, height) > limit
        if resized:
            ratio = limit / max(width, height)
            image.scale(round(width * ratio), round(height * ratio))
        safe_paint = image.name.startswith("office-safe") and image.name.endswith("basecolor")
        if safe_paint:
            darken_safe_paint(image)
        if resized or safe_paint:
            image.file_format = "PNG"
            image.pack()
        portable_path = f"//textures/{image.name}.{image.file_format.lower()}"
        image.filepath = portable_path
        for packed in image.packed_files:
            packed.filepath = portable_path


def build(sources, output):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    desk, other = DESKS

    keys = meshes_from(sources / "grab-keyboard.glb")
    set_surface(
        bpy.data.materials["keyboard_body_pbr"], Base_Color=(0.063, 0.081, 0.092, 1),
        Metallic=0.36, Roughness=0.57,
    )
    set_surface(bpy.data.materials["keyboard_keycap_pbr"], Metallic=0, Roughness=0.69)
    keys.append(keyboard_legends())
    keyboard = fitted("Mechanical keyboard A", keys, scale=1.15)
    second = duplicate(keyboard, "Mechanical keyboard B")
    place(keyboard, desk, 0.14, -0.16, MAT_TOP, pi)
    place(second, other, 0.14, -0.16, MAT_TOP, pi)

    router = fitted("Wi-Fi router", meshes_from(sources / "router.glb"))
    place(router, desk, -0.75, -0.005, angle=pi + 0.23)

    folder_mesh = meshes_from(sources / "folder.glb", {"images"})
    folder_mesh[0].data.materials.clear()
    folder_mesh[0].data.materials.append(material("Muted blue folder", (0.092, 0.163, 0.182, 1)))
    folder = fitted("File folder", folder_mesh, Matrix.Rotation(pi / 2, 4, "X"), width=0.32)
    spare_folder = duplicate(folder, "Spare file folder")
    place(folder, desk, 0.77, 0.15, angle=pi - 0.14)
    place(spare_folder, other, -0.67, -0.22, angle=pi + 0.15)

    paper_names = ("office_notepads_a4_stack", "office_notepads_a4_a", "office_notepads_note_stack")
    papers = meshes_from(sources / "office_notepads_1k.gltf", set(paper_names))
    stack, memo, cards = [
        fitted(name, [next(obj for obj in papers if obj.name == source + "_fitted")])
        for name, source in zip(("A4 paper stack", "Bench test sheet", "Reference cards"), paper_names, strict=True)
    ]
    place(stack, desk, 0.70, -0.20, angle=pi + 0.07)
    place(memo, desk, 0.72, -0.19, DESK_TOP + 0.011, pi - 0.08)
    annotations(memo)
    place(cards, other, -0.70, -0.04, angle=pi - 0.14)

    tool = fitted(
        "Flathead screwdriver", meshes_from(sources / "screwdriver_1k.gltf"),
        Matrix.Rotation(pi / 2, 4, "Y"),
    )
    extra_tool = duplicate(tool, "Spare flathead screwdriver")
    place(tool, desk, -0.73, -0.27, angle=-0.25)
    place(extra_tool, other, 0.74, -0.28, angle=0.6)

    dress_repair_bench(sources, router, folder, stack, memo, tool)

    limit_images()
    bpy.ops.file.pack_all()
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "FILE_BROWSER" and space.params is not None:
                    params = space.params
                    # Blender saves the fixed buffer, including bytes after the terminator.
                    buffer_size = params.bl_rna.properties["directory"].length_max
                    params.directory = b" " * (buffer_size - 1)
                    params.directory = b"//"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "scene/workshop-props.blend"), compress=True)
    with TemporaryDirectory() as temp:
        glb = Path(temp) / "workshop-props.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(glb), export_format="GLB", export_animations=False,
            export_image_format="AUTO", export_jpeg_quality=86,
        )
        with glb.open("rb") as src, (output / "public/models/workshop-props.glbz").open("wb") as dst:
            with gzip.GzipFile(filename="", fileobj=dst, mode="wb", mtime=0) as packed:
                shutil.copyfileobj(src, packed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    build(args.sources.resolve(), ROOT)
