# Workshop props

The packed Blender scene is [workshop-props.blend](../scene/workshop-props.blend). The browser loads [workshop-props.glbz](../public/models/workshop-props.glbz), a gzip-compressed GLB. Both use the desk coordinates in [layout.json](../scene/layout.json).

| Original model | Creator | License | Changes in Steeport |
| --- | --- | --- | --- |
| [Mechanical Keyboard](https://grab3d.com/models/electronics/keyboard/) | Grab3D | CC0 | Slate case, key legends, and mounting on both desks |
| [Office Safe](https://grab3d.com/models/props/office-safe/) | Grab3D | CC0 | Matte graphite exterior, black interior panels, and a simplified mesh with the original hinge |
| [Wi-Fi router](https://www.innerscene.com/tools/library/3d-parts/wi-fi-router-fb251a04) | Innerscene | CC0 | Angled toward the aisle and adjusted texture resolution |
| [Folder](https://poly.pizza/m/emdPCRNhTX) | reyshapes | CC0 | Static tabletop pose and a custom cover color |
| [Office Notepads](https://polyhaven.com/a/office_notepads) | Ulan Cabanilla | CC0 | A4 stack, printed test sheet, and reference cards |
| [Screwdriver](https://polyhaven.com/a/screwdriver) | PierreB3D | CC0 | Laid flat at each workstation |
| [Electronics Repair Bench](https://www.innerscene.com/tools/library/3d-parts/electronics-repair-bench-technical-workbench-96f9d5a8) | Innerscene | CC0 | Fitted to the existing floor footprint with the work surface facing the aisle |
| [Pegboard Tool Wall](https://grab3d.com/models/tools/pegboard-tool-wall/) | Grab3D | CC0 | Mounted above the repair bench |
| [Multimeter](https://grab3d.com/models/electronics/multimeter/) | Grab3D | CC0 | Placed on the ESD mat with the probes visible |
| [Circuit Board](https://grab3d.com/models/electronics/circuit-board/) | Grab3D | CC0 | Scaled for a readable tabletop silhouette |
| [Metal Toolbox](https://polyhaven.com/a/metal_toolbox) | Mateusz Sadek | CC0 | Fitted to the instrument shelf |
| [Desk Lamp Arm 01](https://polyhaven.com/a/desk_lamp_arm_01) | Kuutti Siitonen and Yann Kervran | CC0 | Mounted at the shelf edge, aimed at the ESD mat |

## Regenerate

Put the Grab3D GLBs in a source directory as `grab-keyboard.glb`, `grab-safe.glb`, `pegboard-tool-wall.glb`, `multimeter.glb`, and `circuit-board.glb`. Put the Innerscene GLBs there as `router.glb` and `repair-bench.glb` and the Poly Pizza GLB as `folder.glb`. Select the 1K glTF downloads for the four Poly Haven models and extract their glTF files, buffers, and `textures/` into the same directory. The glTF files are `office_notepads_1k.gltf`, `screwdriver_1k.gltf`, `metal_toolbox_1k.gltf`, and `desk_lamp_arm_01_1k.gltf`.

Run from the repository root with Blender 5.2 LTS.

```sh
blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
  --python scripts/build_workshop_props.py -- --sources path/to/downloaded-models
```
