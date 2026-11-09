# Steeport

An afternoon café with a first-person window seat and a rotatable pixel view. The two views share the same room, visitor, and props.

## Run the preview

Use Node 26.13.0 and pnpm 12.16.1.

```sh
pnpm install
pnpm dev
```

Open `/` for the full-screen café. Open `/lab/` on the same server for the scene study and Blender stills.

- Press **C** to stand or sit near a seat. Use **WASD** or the arrow keys to walk. Drag or press **Q** or **E** to turn. Walk against a freestanding chair to slide it when there is room.
- Press **V** to switch cameras. In pixel view, press **Z** to zoom.
- Select a nearby prop or its action in the toolbar. Press **F** for the primary action, or use the number shown for another action. Open the laptop, then press **T** or select the screen to move closer.
- Open **Read field notes** at the window desk. At the bookcase, look for the atlas and trail journal beside the rows of books. Take either book and press **R** to read it. Turn pages with the arrow keys or the buttons on the book.
- To return to the café, press **Esc** or click outside the laptop screen or open book.
- Fill a cup at the bar and press **H** to sip. Press **G** to put down the cup or **B** to put down a book. Select a clear surface within reach, press **F** to try placing it near the center, or press **Esc** to cancel.
- Miso wanders between the aisles and naps in different spots. Stand nearby and press **X** to crouch, then use the shortcut shown for **Pet Miso**.
- Sit by the window to see the trees stir. Press **M** or select the music control to play or mute the original lo-fi loop. The music starts muted. **M** also works while a book is open.
- Open and close the front door from inside the entrance.

The laptop and books contain sample material for the room study.

Books animate when you pick them up, open them, close them, and set them down. The reduced motion preference switches book poses without the animation. See the [café controls and manual checks](docs/scene-interaction.md).

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

The `.glbz` files are gzip-compressed GLBs. Serve them as static binary assets without a `Content-Encoding: gzip` header. The browser fetches the gzip bytes and decompresses them before loading the models. The `.glbz` suffix keeps Vite from marking the files as precompressed HTTP responses.

Use this command to rebuild the scene, GLBs, and light atlas while keeping the existing JPEGs.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py -- --skip-stills
```

`build_cafe.py` uses `cafe_geometry.py` for mesh construction, `cafe_cat.py` for Miso's editable geometry, `cafe_surfaces.py` for materials, and `cafe_lighting.py` for the light bake. Run them through the generator.

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
- `glbBytes` counts the model bytes transferred for the room and selected exterior. The script counts both `.glbz` responses and `.glb` responses from older revisions. The light atlas, JavaScript, and music are separate downloads.

Use the same browser, hardware, and network settings when comparing revisions. See the [window and performance review](docs/m4-review.md) for the exterior comparison and the gzip benchmark.

## Verify the café

Install Google Chrome for the Playwright checks. Run these commands from the repository root.

```sh
pnpm build
pnpm lint
pnpm format
pnpm test
pnpx fallow dead-code
```

Playwright checks keyboard and touch controls, the reader, music opt-in, camera switching, and both model-loading fallbacks. It saves the matched window captures in `test-results/`. Fallow scans JavaScript and TypeScript for unused files, exports, and dependencies.

See the [interaction reference](docs/scene-interaction.md) for the shared controls and manual checks.
