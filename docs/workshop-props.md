# Workshop props

Open the packed `.blend` to edit the repair bench, safe, keyboards, and other studio props. The generator exports them as a gzip-compressed GLB for the browser. The generator and browser use the same bench and desk dimensions from `layout.json`. [Blender scene](../scene/workshop-props.blend) · [Generator](../scripts/build_workshop_props.py) · [Browser model](../public/models/workshop-props.glbz) · [Layout](../scene/layout.json)

## Asset sources

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

1. Download the originals into a source directory. Name the Grab3D GLBs `grab-keyboard.glb`, `grab-safe.glb`, `pegboard-tool-wall.glb`, `multimeter.glb`, and `circuit-board.glb`. Name the Innerscene files `router.glb` and `repair-bench.glb`. Name the Poly Pizza file `folder.glb`.
2. Download the 1K glTF packages from Poly Haven. Extract their glTF files, buffers, and `textures/` into the same directory. The glTF files are `office_notepads_1k.gltf`, `screwdriver_1k.gltf`, `metal_toolbox_1k.gltf`, and `desk_lamp_arm_01_1k.gltf`.
3. Run Blender 5.2 LTS from the repository root. Replace `path/to/downloaded-models` with your source directory.

   ```sh
   blender -b --factory-startup --disable-autoexec --python-exit-code 1 \
     --python scripts/build_workshop_props.py -- --sources path/to/downloaded-models
   ```

The generator saves both the packed `.blend` and `.glbz`. It stores texture paths and the Blender file browser's directory relative to the project.

## Check the result in the browser

- The generator uses face indices from the original Grab3D mesh to color the liner, rear panel, and shelf. If you replace the source mesh, check those indices before assigning the black material.
- Keep the `Steel office safe` parent and `Workshop safe door` node. The renderer finds them by name and rotates the door around the Blender origin. Check that the door clears the bench and sits flush with the frame when shut.
- The desk and monitors come from `workshop-setup.glbz`. If you replace that file, keep the display node names that `src/workshop-visuals.ts` reads.
- After exporting, inspect the worktop and open the safe from the aisle in the running site. Run `pnpm test tests/workshop.spec.ts` to check the safe, keypad, and terminal fallback. [Studio controls](scene-interaction.md#造訪駭客工作室)
