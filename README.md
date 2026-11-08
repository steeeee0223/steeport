# Steeport

An afternoon café with a first-person window seat and a rotatable pixel view. The M1 and M2 preview starts seated beside the open window.

## Run the preview

Use Node 26.13.0 and pnpm 12.16.1.

```sh
pnpm install
pnpm dev
```

- Click **Stand up** to walk. Use **WASD** on desktop or hold the on-screen arrows on touch.
- Drag to look in first person. The left and right arrow keys also turn your head.
- Click **Pixel view** to switch cameras. Drag, press **Q** or **E**, or use the orbit buttons to rotate around the room.
- Return to the middle chair at the window and click **Sit down**. Click the laptop in the scene or use **Open laptop** to see the test screen. **C** toggles posture and **F** operates the laptop when in reach.

## Build the room

[The layout](scene/layout.json) contains the dimensions in meters, furniture footprints, and window interaction positions. Blender and the browser use the same file. The browser uses the exported model in both views.

Open [the Blender scene](scene/cafe.blend) to inspect the seated and standing cameras. To rebuild the model, Blender file, and JPEGs from the layout, run this from the repository root with Blender 4.5 LTS. The reference stills were rendered with Cycles in Blender 4.5.13.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py
```

[Seated window still](public/studies/window-seat.jpg) · [Standing interior still](public/studies/standing-turn.jpg) · [Floor plan](docs/cafe-floor-plan.svg)

## Verify the prototype

Run `pnpm test` with Google Chrome installed. The suite drives the desktop controls and a 390 × 844 touch-enabled viewport, compares rendered frames across camera switches, and checks the fallback when the model cannot load. Screenshots are saved in `test-results/`.
