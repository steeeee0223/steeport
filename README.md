# Steeport

An afternoon café with a first-person window seat and a rotatable pixel view. The two views share the same room, visitor, and props.

## Run the preview

Use Node 26.13.0 and pnpm 12.16.1.

```sh
pnpm install
pnpm dev
```

Open `/` for the full-screen café. Open `/lab/` on the same server for the scene inspector and Blender stills.

- Press **C** to stand or sit near a seat. Use **WASD** or the arrow keys to walk. Drag or press **Q** or **E** to turn. Walk against a freestanding chair to slide it when there is room.
- Press **V** to switch cameras. In pixel view, press **Z** to zoom.
- Press **F** to use the primary nearby prop. Use the number shown next to an additional prop to interact with it. Open the laptop, then press **T** or select the screen to move closer. Press **Esc** to return.
- Take the atlas or trail journal from the shelf and press **R** to read it. Turn pages with the arrow keys or the buttons on the book.
- Fill a cup at the bar and press **H** to sip. Press **G** to put down the cup or **B** to put down a book. Select a clear surface within reach, press **F** to try placing it near the center, or press **Esc** to cancel.
- Miso wanders between the aisles and naps in different spots. Stand nearby and press **X** to crouch, then use the shortcut shown for **Pet Miso**.
- Sit by the window to see the trees stir. Press **M** or select the music control to play or mute the original lo-fi loop. The music starts muted.
- Open and close the front door from inside the entrance.

The laptop and books contain sample material for the room study.

The original score is in `scripts/compose_cafe_music.py`. To rebuild the music on macOS, render the WAV with Python and encode it with `afconvert`.

```sh
python3 scripts/compose_cafe_music.py /tmp/steeport-afternoon.wav
afconvert -f m4af -d aac -b 96000 /tmp/steeport-afternoon.wav public/afternoon-loop.m4a
```

## Rebuild the room

[The layout](scene/layout.json) contains the dimensions in meters, furniture footprints, and interaction positions. Blender and the browser use the same file. The floor plan shows the original concept.

Install Blender 4.5 LTS and make `blender` available on your PATH. Run the generator from the repository root. The checked-in assets were generated with Blender 4.5.13.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py
```

The command overwrites the following files.

- `scene/cafe.blend` is the editable scene.
- `public/cafe.glbz` and `public/street.glbz` contain the room and the default street exterior.
- `public/room-irradiance.png` stores the diffuse light bake.
- `public/studies/street-depth.glbz` contains the alternate street exterior.
- `public/studies/window-seat.jpg` and `public/studies/standing-turn.jpg` are the reference stills.

The `.glbz` files are gzip-compressed GLBs. Serve them as static binary assets. The browser decompresses them before loading, preserving the original geometry and textures.

Use this command to rebuild the scene, GLBs, and light atlas while keeping the existing JPEGs.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py -- --skip-stills
```

`build_cafe.py` imports `cafe_geometry.py` for mesh construction, `cafe_surfaces.py` for materials, and `cafe_lighting.py` for the light bake. Run them through the generator.

[Editable Blender scene](scene/cafe.blend) · [Seated still](public/studies/window-seat.jpg) · [Standing interior still](public/studies/standing-turn.jpg) · [Floor plan](docs/cafe-floor-plan.svg)

## Measure browser performance

Install Google Chrome and the project dependencies. From the repository root, start Vite on port 4173 and leave it running.

```sh
pnpm dev --host 127.0.0.1 --port 4173 --strictPort
```

In a second terminal at the repository root, run both street variants in sequence.

```sh
node scripts/measure-cafe.mjs
node scripts/measure-cafe.mjs 'http://127.0.0.1:4173/?street=depth'
```

With no URL argument, the script measures the default geometry at `http://127.0.0.1:4173/`. Pass a full URL to measure a different running build. The script prints the Chrome version and separate JSON arrays for desktop and iPhone 13 emulation. Each array has three runs by default. Set `CAFE_RUNS` to a positive integer to change that count. For a quick check, use one run per viewport.

```sh
CAFE_RUNS=1 node scripts/measure-cafe.mjs
```

- `ready` is the second animation-frame timestamp after the camera switch becomes enabled, in milliseconds since navigation.
- `firstPerson` and `pixel` report median (`p50`) and 95th-percentile (`p95`) frame intervals during movement. The `switch` field measures from the click that leaves that view to the second animation-frame callback. All three values are in milliseconds.
- `glbBytes` counts the encoded response bodies of GLB requests. The light atlas, JavaScript, and other files are outside that count.

Use the same browser and hardware when comparing revisions. See the [M4 review](docs/m4-review.md) for the original comparison.

## Verify the café

Run `pnpm test` with Google Chrome installed. The browser checks cover desktop movement, touch input at 390 × 844, the café props, camera switching, and the still-image fallback. Playwright saves the matched window captures in `test-results/`.

See the [interaction reference](docs/scene-interaction.md) for the shared controls and manual checks.

The generator builds Miso from editable geometry in `scripts/cafe_cat.py`.
