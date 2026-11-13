"""Recolor and animate the three source meshes documented in the Leo development log."""

import argparse
import gzip
import math
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory

import bmesh
import bpy
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from coat import linear, paint, smooth


PAWS = {
    # X forward, Y lateral, Z up. The stepping pose is naturally asymmetric.
    "Standing": ((.147, -.039, 0), (.147, .039, 0), (-.142, -.069, .01), (-.142, .069, .01)),
    "Walking": ((.267, -.015, .005), (.122, .073, 0), (-.022, -.009, 0), (-.182, .085, 0)),
}
PAW_LABELS = ("FL", "FR", "HL", "HR")
WALK_DISTANCE = .29


def archive_meshes(path):
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        target.objects = source.objects
    meshes = []
    for obj in target.objects:
        if obj is None or obj.type != "MESH":
            continue
        # An appended ID retains a weak reference to its original library.
        # Copies give the deliverable mesh its own local IDs.
        local = obj.copy()
        local.data = obj.data.copy()
        meshes.append(local)
    return meshes


def array(collection, prop, width):
    data = np.empty(len(collection) * width, np.float32)
    collection.foreach_get(prop, data)
    return data.reshape((-1, width))


def transform(obj, pose):
    points = array(obj.data.vertices, "co", 3)
    x, y, z = points.T
    if pose == "Standing":
        aligned = np.column_stack((-.213 * y, .213 * x, .213 * (z + .26553687)))
    elif pose == "Walking":
        u = 1.09 * (.66 * x - .751 * y)
        v = 1.09 * (.751 * x + .66 * y) - .07
        aligned = np.column_stack((.974 * u - .225 * v - .008,
                                   .225 * u + .974 * v - .003, 1.09 * z))
    else:
        aligned = np.column_stack((-3.12 * x, -3.12 * y, 3.12 * (z + .0000003)))
    obj.parent = None
    obj.matrix_basis.identity()
    obj.data.vertices.foreach_set("co", aligned.ravel())
    obj.data.update()


def subdivide(obj, level):
    bpy.context.view_layer.objects.active = obj
    sub = obj.modifiers.new("Archive surface for coat painting", "SUBSURF")
    sub.subdivision_type = "SIMPLE"
    sub.levels = level
    bpy.ops.object.modifier_apply(modifier=sub.name)


def simplify(obj, ratio):
    bpy.context.view_layer.objects.active = obj
    decimate = obj.modifiers.new("Web surface", "DECIMATE")
    decimate.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=decimate.name)


def weld_walking(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    # Shared UV boundaries need identical positions for continuous deformation.
    bmesh.ops.remove_doubles(mesh, verts=list(mesh.verts), dist=.000012)
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    return obj


def shade(obj, pose, material, atlas):
    mesh = obj.data
    points = array(mesh.vertices, "co", 3)
    normals = array(mesh.vertices, "normal", 3)
    if pose == "Walking":
        # The original color uses the active UV map. Sample per corner to
        # preserve the facial details across the source's UV seams.
        uv = array(mesh.uv_layers.active.uv, "vector", 2)
        indices = array(mesh.loops, "vertex_index", 1).astype(int).ravel()
        pixels, width, height = atlas
        u = np.clip((uv[:, 0] * width).astype(int), 0, width - 1)
        v = np.clip((uv[:, 1] * height).astype(int), 0, height - 1)
        original = pixels[v, u, :3]
        colors = paint(points[indices], normals[indices], pose, atlas=original)
        domain = "CORNER"
    else:
        colors = paint(points, normals, pose)
        domain = "POINT"
    coat = mesh.color_attributes.new(name="Leo coat", type="BYTE_COLOR", domain=domain)
    rgba = np.column_stack((np.clip(colors, 0, 1), np.ones(len(colors))))
    coat.data.foreach_set("color_srgb", rgba.ravel())
    mesh.color_attributes.active_color = coat
    mesh.materials.clear()
    mesh.materials.append(material)
    for uv_layer in list(mesh.uv_layers):
        mesh.uv_layers.remove(uv_layer)
    for polygon in mesh.polygons:
        polygon.use_smooth = True


def shape(obj, name, points):
    key = obj.shape_key_add(name=name, from_mix=False)
    key.data.foreach_set("co", points.ravel())
    key.slider_min = -2
    key.slider_max = 2
    key.value = 0
    return key


def paw_morphs(obj, points, pose):
    x, y, z = points.T
    anchors = np.asarray(PAWS[pose])
    # Follow each bent lower leg back toward the body. At the shoulder the
    # influence fades to zero, so every morph shares one continuous coat.
    if pose == "Walking":
        knees = np.array([[.177, .004, .115], [.112, .063, .126],
                          [-.091, -.030, .12], [-.163, .069, .119]])
    else:
        knees = np.array([[.123, -.044, .13], [.123, .044, .13],
                          [-.186, -.055, .12], [-.186, .055, .12]])
    amount = smooth(.036, .15, z)
    centers = anchors[None, :, :2] + amount[:, None, None] * (knees - anchors)[None, :, :2]
    gap = np.linalg.norm(points[:, None, :2] - centers, axis=2)
    owner = np.argmin(gap, axis=1)
    for i, (label, anchor) in enumerate(zip(PAW_LABELS, anchors)):
        weight = ((1 - smooth(.034, .164, z)) * (owner == i)
                  * (1 - smooth(.040, .086, gap[:, i])))
        axes = (("Stride", 0), ("Lift", 2)) if pose == "Walking" else (("Lift", 2),)
        for name, axis in axes:
            offset = points.copy()
            offset[:, axis] += weight * (.14 if axis == 0 else .18)
            shape(obj, f"{name} {label}", offset)



def animate_mesh(obj, points, pose):
    obj.shape_key_add(name="Archive pose")
    x, y, z = points.T
    if pose in PAWS:
        paw_morphs(obj, points, pose)
    if pose == "Standing":
        rest = points.copy()
        # Lower the chest and hips while the paws stay on the cushion.
        torso = smooth(.02, .25, z)
        tail = (1 - smooth(-.24, -.17, x)) * smooth(.26, .41, z)
        rest[:, 2] = z * (1 - .53 * torso) - .098 * tail
        rest[:, 0] += .035 * torso + .105 * tail
        rest[:, 1] += (.05 + .075 * np.sin(9 * (x + .27))) * tail
        shape(obj, "Rest", rest)
        lean = points.copy()
        lean[:, 0] += .055 * smooth(.06, .24, x) * smooth(.01, .16, z)
        lean[:, 2] -= .105 * smooth(-.08, .23, x) * smooth(.014, .13, z)
        shape(obj, "Reach", lean)
    if pose == "Stretching":
        # Keep the rear contact while pulling the long forelegs back under
        # the shoulder and raising the front of the trunk.
        foreleg = smooth(.11, .34, x) * (1 - smooth(.025, .11, z))
        front = smooth(-.11, .19, x)
        tucked = points.copy()
        tucked[:, 0] -= .183 * foreleg
        tucked[:, 0] += .058 * front * smooth(.04, .16, z)
        tucked[:, 1] *= 1 - .30 * foreleg
        tucked[:, 2] += .145 * front * smooth(.008, .103, z)
        shape(obj, "Recover", tucked)
    if pose != "Stretching":
        tail = (1 - smooth(-.26, -.18, x)) * smooth(.09, .18, z)
        swish = points.copy()
        swish[:, 1] += .068 * tail
        shape(obj, "Tail sway", swish)
    pet = points.copy()
    front = smooth(.04, .28, x) * smooth(.055, .20, z)
    pet[:, 2] += .024 * front
    pet[:, 1] += .021 * front
    shape(obj, "Lean into pet", pet)


def native_action(obj, pose):
    keys = obj.data.shape_keys.key_blocks
    if pose == "Walking":
        for frame in range(1, 33):
            gait = (frame - 1) / 32
            for label, anchor, offset in zip(PAW_LABELS, PAWS[pose], (0, .5, .23, .73)):
                phase = (gait + offset) % 1
                swing = max(0, (phase - .64) / .36)
                ahead = WALK_DISTANCE * (.32 - phase + float(smooth(0, 1, swing)))
                home_x = PAWS["Standing"][PAW_LABELS.index(label)][0]
                keys[f"Stride {label}"].value = (home_x + ahead - anchor[0]) / .14
                keys[f"Lift {label}"].value = (math.sin(math.pi * swing)**2 * .032 - anchor[2]) / .18
                for name in ("Stride", "Lift"):
                    keys[f"{name} {label}"].keyframe_insert("value", frame=frame)
            keys["Tail sway"].value = math.sin(gait * math.tau) * .38
            keys["Tail sway"].keyframe_insert("value", frame=frame)
        for key in keys:
            key.value = 0
            if key.name.startswith(("Stride ", "Lift ")) or key.name == "Tail sway":
                key.keyframe_insert("value", frame=33)
        # Copy the first frame exactly at the loop boundary.
        animation = obj.data.shape_keys.animation_data
        action = animation.action
        for channel in action.layers[0].strips[0].channelbag(animation.action_slot).fcurves:
            channel.keyframe_points[-1].co.y = channel.keyframe_points[0].co.y
            channel.update()
        action.name = "Leo • Walk in place"
    else:
        name = "Rest" if pose == "Standing" else "Recover"
        samples = ((1, 1), (16, 1), (42, 0), (76, 0), (104, 1)) if pose == "Standing" else (
            (1, 1), (18, 0), (43, 0), (64, 1))
        for frame, value in samples:
            keys[name].value = value
            keys[name].keyframe_insert("value", frame=frame)
        obj.data.shape_keys.animation_data.action.name = f"Leo • {pose}"


def coat_material():
    material = bpy.data.materials.new("Leo's orange tabby coat")
    material.use_nodes = True
    material.diffuse_color = (*linear(np.array([.71, .43, .23])), 1)
    nodes = material.node_tree.nodes
    vertex_color = nodes.new("ShaderNodeVertexColor")
    vertex_color.layer_name = "Leo coat"
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .78
    material.node_tree.links.new(vertex_color.outputs["Color"], shader.inputs["Base Color"])
    return material


def read_atlas(path):
    image = bpy.data.images.load(str(path))
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape((height, width, 4)), width, height


def configure_studio(scene, collection, camera, world):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = -.48
    scene.world = world
    scene.collection.children.link(collection)
    scene.camera = camera


def studio():
    collection = bpy.data.collections.new("Preview studio")
    world = bpy.data.worlds.new("Warm grey studio")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs[0].default_value = (.33, .32, .29, 1)
    background.inputs[1].default_value = .7
    floor = bpy.data.materials.get("Warm grey floor")
    if floor is None:
        floor = bpy.data.materials.new("Warm grey floor")
        floor.diffuse_color = (.21, .195, .174, 1)
    mesh = bpy.data.meshes.new("Studio floor")
    mesh.from_pydata([(-200, -200, -.002), (200, -200, -.002),
                      (200, 200, -.002), (-200, 200, -.002)], [], [(0, 1, 2, 3)])
    mesh.materials.append(floor)
    collection.objects.link(bpy.data.objects.new("Studio floor", mesh))
    target = Vector((0, 0, .17))
    for name, position, power, size, color in (
        ("Key", (1.1, -.65, 1.2), 68, .95, (1, .91, .80)),
        ("Fill", (.35, .95, .68), 36, .85, (.81, .89, 1)),
        ("Rim", (-.72, -.19, .90), 52, .80, (1, .91, .77)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.size, data.color = power, size, color
        lamp = bpy.data.objects.new(name, data)
        collection.objects.link(lamp)
        lamp.location = position
        lamp.rotation_euler = (target - lamp.location).to_track_quat("-Z", "Y").to_euler()
    camera = bpy.data.objects.new("Studio camera", bpy.data.cameras.new("Studio camera"))
    collection.objects.link(camera)
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = .88
    set_camera(camera, (1.04, -.95, .57), target)
    return collection, camera, world


def set_camera(camera, position, target):
    camera.location = position
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def export_gzip(path):
    with TemporaryDirectory() as tmp:
        model = Path(tmp) / "leo.glb"
        bpy.ops.export_scene.gltf(filepath=str(model), export_format="GLB",
                                  export_animations=False, export_morph_normal=False,
                                  export_shared_accessors=True,
                                  export_vertex_color="MATERIAL")
        with model.open("rb") as source, path.open("wb") as output:
            with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as packed:
                shutil.copyfileobj(source, packed)


def build(args):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    staging = bpy.context.scene
    bpy.ops.wm.fbx_import(filepath=str(args.stretch.resolve()))
    stretch = [obj for obj in staging.objects if obj.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    meshes = {"Standing": archive_meshes(args.stand), "Walking": archive_meshes(args.step),
              "Stretching": stretch}
    material = coat_material()
    atlas = read_atlas(args.atlas)
    groups = {}
    for pose, objects in meshes.items():
        collection = bpy.data.collections.new(f"Leo {pose}")
        groups[pose] = collection
        staging.collection.children.link(collection)
        for obj in objects:
            for existing in list(obj.users_collection):
                existing.objects.unlink(obj)
            collection.objects.link(obj)
            transform(obj, pose)
        if pose == "Walking":
            objects = [weld_walking(objects)]
            meshes[pose] = objects
        for obj in objects:
            if pose == "Standing":
                subdivide(obj, 2)
                smooth_body = obj.modifiers.new("Soften archive faceting", "SMOOTH")
                smooth_body.factor = .38
                smooth_body.iterations = 2
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.modifier_apply(modifier=smooth_body.name)
            elif pose == "Walking":
                simplify(obj, .21)
            else:
                simplify(obj, .055)
            obj.data.validate(verbose=False, clean_customdata=False)
            shade(obj, pose, material, atlas)
            if pose == "Standing":
                # Reduce the painted surface before adding morph targets.
                simplify(obj, .42)
            obj.data.validate(verbose=False, clean_customdata=False)
            animate_mesh(obj, array(obj.data.vertices, "co", 3), pose)
            obj.name = pose
            obj.data.name = f"Leo {pose} mesh"
    export_gzip(args.output / "leo.glbz")

    scenes = {}
    studio_assets = studio()
    for pose, collection in groups.items():
        scene = bpy.data.scenes.new(pose)
        scenes[pose] = scene
        scene.collection.children.link(collection)
        scene.render.fps = 32
        scene.frame_end = {"Standing": 104, "Walking": 33, "Stretching": 64}[pose]
        for obj in meshes[pose]:
            native_action(obj, pose)
        configure_studio(scene, *studio_assets)
        scene.frame_set({"Standing": 50, "Walking": 10, "Stretching": 30}[pose])
    bpy.context.window.scene = scenes["Standing"]
    bpy.data.scenes.remove(staging)
    bpy.data.orphans_purge(do_recursive=True)
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "FILE_BROWSER" and space.params:
                    space.params.directory = b"//"
                if space.type == "VIEW_3D":
                    space.region_3d.view_perspective = "CAMERA"
                    space.shading.color_type = "MATERIAL"
    bpy.ops.wm.save_as_mainfile(filepath=str((args.output / "leo.blend").resolve()), compress=True)

    if args.render_dir:
        args.render_dir.mkdir(parents=True, exist_ok=True)
        for pose, scene in scenes.items():
            bpy.context.window.scene = scene
            for view, position, target in (
                ("hero", (1.04, -.95, .57), (0, 0, .17)),
                ("side", (.01, -1.5, .30), (0, 0, .18)),
                ("face", (1.33, -.04, .40), (.23, 0, .24 if pose != "Stretching" else .15)),
                ("back", (-1.17, -.2, .42), (0, 0, .17)),
                ("other-side", (.01, 1.5, .30), (0, 0, .18)),
                ("top", (.03, 0, 1.6), (0, 0, .16)),
            ):
                set_camera(scene.camera, position, target)
                scene.camera.data.ortho_scale = .30 if view == "face" else .88
                scene.render.filepath = str((args.render_dir / f"{pose.lower()}-{view}.png").resolve())
                bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stand", type=Path, required=True)
    parser.add_argument("--step", type=Path, required=True)
    parser.add_argument("--stretch", type=Path, required=True)
    parser.add_argument("--atlas", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "public/models")
    parser.add_argument("--render-dir", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    args.output.mkdir(parents=True, exist_ok=True)
    build(args)
