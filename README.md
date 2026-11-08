# Steeport

An afternoon café with a first-person window seat and a rotatable pixel view. The two views share the same room, visitor, and props.

## Run the preview

Use Node 26.13.0 and pnpm 12.16.1.

```sh
pnpm install
pnpm dev
```

- Select **Stand up** or press **C**. Walk with **WASD** or hold the on-screen arrows. Drag to look around.
- Select **Pixel view** to change cameras. Drag, press **Q** or **E**, or use the orbit buttons to rotate the pixel view. The visitor stays in place.
- At the window, open the laptop, plug in the charger, and turn the pages of the field notes. Walk to the back shelf for the atlas, the end of the bar for water, and the cushion for Miso. Select a nearby marker or action button. **F** uses the action named in the hint.
- Read the atlas and sip water from **In hand**. The atlas, your page, and the water level stay with you when you switch views. Return to the middle window chair to sit down.

The laptop and books contain sample material for the room study.

## Rebuild the room

[The layout](scene/layout.json) contains the dimensions in meters, furniture footprints, and interaction positions. Blender and the browser use the same file.

Run the generator from the repository root with Blender 4.5 LTS. Blender 4.5.13 produced the checked-in source, GLBs, and Cycles stills.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py
```

Add `-- --skip-stills` to rebuild the model and depth study without rerendering the reference JPEGs.

[Editable Blender scene](scene/cafe.blend) · [Seated still](public/studies/window-seat.jpg) · [Standing interior still](public/studies/standing-turn.jpg) · [Floor plan](docs/cafe-floor-plan.svg)

## Verify the café

Run `pnpm test` with Google Chrome installed. The browser checks cover desktop movement, touch input at 390 × 844, the café props, camera switching, and the still-image fallback. Playwright saves the matched window captures in `test-results/`.

See [the M4 review](docs/m4-review.md) for the street comparison and how to repeat the timing runs.
