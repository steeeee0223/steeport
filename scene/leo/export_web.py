"""Export Leo's collection from the Blender file for the 3D viewer."""

import argparse
import gzip
from pathlib import Path
import shutil
import sys
from tempfile import TemporaryDirectory

import bpy


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    cat = bpy.data.collections["Leo"]
    bpy.ops.object.select_all(action="DESELECT")
    by_material = {}
    for obj in cat.all_objects:
        obj.select_set(True)
        obj.vertex_groups.clear()
        for layer in list(obj.data.uv_layers):
            obj.data.uv_layers.remove(layer)
        by_material.setdefault(obj.data.materials[0], []).append(obj)

    body = bpy.data.objects["Leo · body"]
    bpy.context.view_layer.objects.active = body
    simplify = body.modifiers.new("Browser mesh", "DECIMATE")
    simplify.ratio = 0.12
    bpy.ops.object.modifier_apply(modifier=simplify.name)

    bpy.ops.object.select_all(action="DESELECT")
    for material, objects in by_material.items():
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.join()
            bpy.context.object.name = material.name
        bpy.context.object.select_set(False)

    for obj in cat.all_objects:
        obj.select_set(True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as directory:
        glb = Path(directory) / "leo.glb"
        bpy.ops.export_scene.gltf(
            filepath=str(glb),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
        )
        with glb.open("rb") as source, args.output.open("wb") as output:
            with gzip.GzipFile(filename="", fileobj=output, mode="wb", mtime=0) as packed:
                shutil.copyfileobj(source, packed)


if __name__ == "__main__":
    main()
