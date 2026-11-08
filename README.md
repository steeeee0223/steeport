# Steeport

An afternoon café with a first-person window seat and a rotatable pixel view. The two views share the same room, visitor, and props.

## Run the preview

Use Node 26.13.0 and pnpm 12.16.1.

```sh
pnpm install
pnpm dev
```

The café fills the home page. Open [the scene study](/lab/) for the inspector-style layout and Blender stills.

- Press **C** or select **Stand up**. Use **WASD** or the arrow keys to walk in either camera mode. Drag or press **Q** or **E** to turn the camera.
- Select **Pixel view** to switch cameras and **+** to look closer. Select a nearby seat or press **C** to sit. Walk against a freestanding chair to slide it when there is room.
- Open the laptop, then select its screen or **Look at laptop** to move closer. Press **Esc** to return. The shelf has an atlas and a trail journal. Select **Read** for the book in hand and turn its pages.
- Fill a cup at the bar or press **X** to crouch near Miso. Select **Put down** from **In hand**, then select a clear surface within reach. **F** uses the action in the hint or places an item near the center.
- Open and close the front door from inside the entrance.

The laptop and books contain sample material for the room study.

## Rebuild the room

[The layout](scene/layout.json) contains the dimensions in meters, furniture footprints, and interaction positions. Blender and the browser use the same file.

Run the generator from the repository root with Blender 4.5 LTS. Blender 4.5.13 produced the checked-in source, GLBs, diffuse light atlas, and Cycles stills.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py
```

Add `-- --skip-stills` to rebuild the model and depth study without rerendering the reference JPEGs.

[Editable Blender scene](scene/cafe.blend) · [Seated still](public/studies/window-seat.jpg) · [Standing interior still](public/studies/standing-turn.jpg) · [Floor plan](docs/cafe-floor-plan.svg)

## Verify the café

Run `pnpm test` with Google Chrome installed. The browser checks cover desktop movement, touch input at 390 × 844, the café props, camera switching, and the still-image fallback. Playwright saves the matched window captures in `test-results/`.

See [the M4 review](docs/m4-review.md) for the street comparison and how to repeat the timing runs.

The curled sleeping cat is adapted from [Innerscene's CC0 model](https://www.innerscene.com/tools/library/3d-parts/domestic-cat-curled-asleep-73a8a293). The source GLB is in `scene/assets/`.
