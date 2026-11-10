# Steeport

Explore an afternoon café in first person or rotate the pixel view.

## Run the preview

Use Node 26.13.0 and pnpm 12.16.1.

```sh
pnpm install
pnpm dev
```

Open `/` for the full-screen café.

## Keyboard controls

| Key                                      | Action                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **W**, **A**, **S**, **D** or arrow keys | Walk while standing.                                                                                               |
| **Q** or **E**                           | Turn the camera left or right. You can also drag the scene.                                                        |
| **C**                                    | Stand up or sit down near a seat.                                                                                  |
| **X**                                    | Crouch or stand upright. Crouch near Miso to reveal **Pet Miso**.                                                  |
| **V**                                    | Switch between first-person and pixel views.                                                                       |
| **Z**                                    | Zoom in or out in pixel view.                                                                                      |
| **F**                                    | Run the primary action shown in the toolbar. When placing an item, try to set it down near the center of the view. |
| Number shown on screen                   | Run the action next to that number.                                                                                |
| **T**                                    | Move closer to the laptop screen after opening the laptop.                                                         |
| **R**                                    | Read the book you're holding.                                                                                      |
| **←** or **→**                           | Turn pages while reading.                                                                                          |
| **H**                                    | Sip from the cup after filling it at the bar.                                                                      |
| **G**                                    | Choose where to set down the cup.                                                                                  |
| **B**                                    | Choose where to set down the book.                                                                                 |
| **Esc**                                  | Close the book, leave the laptop close-up, or cancel placement.                                                    |
| **M**                                    | Play or mute the lo-fi loop, even while reading. Music starts muted.                                               |

Select nearby props directly or use the toolbar. Select an open laptop screen to move closer. To return to the room, click outside the screen or book. When placing an item, click a clear surface within reach.

In pixel view, the visitor turns as they change direction and plants their last step when you release the movement key. Crouch within arm's reach of Miso to enter a deep squat, then select **Pet Miso**. The visitor uses a free hand to stroke Miso's back.

Open **Steeport 開發日誌** at the window desk to read the illustrated development journal. The atlas and trail journal at the bookcase still contain sample content. With reduced motion enabled, books change poses without animation.

Walk into a freestanding chair to slide it if there's room. You can open and close the front door from inside and watch the trees move from the window seat.

See the [café controls in Traditional Chinese](docs/scene-interaction.md) for keyboard, mouse, and touch controls.

## Add a book

Give each book a folder under `content/books/`. The folder name becomes its URL, such as `/books/steeport-devlog/`. Put the title and placement in `index.md`. Text after the front matter appears as the introduction on the shareable page.

```yaml
---
title: Steeport 開發日誌
language: zh-Hant
placement: window
---
```

- `window` uses the book at the window seat. `shelf` and `journal` use the two existing bookshelf props. Each slot holds one book. An optional `label` gives the toolbar a shorter name.
- `web` lists the book at `/books/` and gives it a shareable page. This is the default placement.
- `draft` keeps the book and its images out of the generated site.

Add one numbered Markdown file per chapter, such as `01-floor-plan.md`. A chapter can have `title` and `date` front matter. Put screenshots in the book's `images/` folder. A standalone image with a Markdown title shows that title as a caption.

```markdown
![Floor plan with the window, bar and bookshelf](images/floor-plan.jpg 'The first floor plan.')
```

The café reader and the shareable page use the same chapter files. The reader's **Open shareable page** link opens the current chapter by its filename. Keep filenames stable once their links are shared.

## Rebuild the music

On macOS, render the score to a WAV with Python, then encode it with `afconvert`.

```sh
python3 scripts/compose_cafe_music.py /tmp/steeport-afternoon.wav
afconvert -f m4af -d aac -b 96000 /tmp/steeport-afternoon.wav public/afternoon-loop.m4a
```

## Rebuild the room

Blender and the browser share the room dimensions, furniture footprints, and interaction positions in [scene/layout.json](scene/layout.json).

Use Blender 5.2 LTS and put `blender` on your PATH. The current assets were built with 5.2.3. Run the generator from the repository root.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py
```

The command overwrites the following files.

- `scene/cafe.blend` is the editable scene.
- `public/cafe.glbz` and `public/street.glbz` contain the room and the default street exterior.
- `public/room-irradiance.png` stores the diffuse light bake.
- `public/studies/street-depth.glbz` contains the alternate street exterior.
- `public/studies/window-seat.jpg` and `public/studies/standing-turn.jpg` are the reference stills.

Serve `.glbz` as a binary asset. After the browser decodes any HTTP content encoding, the response body must still contain the gzip-compressed GLB. The scene loader decompresses that file before parsing it.

To keep the existing JPEGs when you rebuild, pass `--skip-stills`.

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/build_cafe.py -- --skip-stills
```

The generator calls `cafe_geometry.py` to build meshes, `cafe_cat.py` to build Miso, `cafe_surfaces.py` to make materials, and `cafe_lighting.py` to bake the lighting.

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

The script defaults to `http://127.0.0.1:4173/`. Pass a full URL to measure a different running build. The script prints the Chrome version and results for desktop and iPhone 13 emulation as separate JSON arrays. It runs three times per viewport by default. Set `CAFE_RUNS` to a positive integer to change that count.

```sh
CAFE_RUNS=1 node scripts/measure-cafe.mjs
```

- `ready` is the second animation-frame timestamp after the camera switch becomes enabled, in milliseconds since navigation.
- `firstPerson` and `pixel` report median (`p50`) and 95th-percentile (`p95`) frame intervals during movement. The `switch` field measures from the click that leaves that view to the second animation-frame callback. All three values are in milliseconds.
- `glbBytes` counts the model bytes transferred for the room and selected exterior. The script counts both `.glbz` responses and `.glb` responses from older revisions. The light atlas, JavaScript, and music are separate downloads.

Use the same browser, hardware, and network settings when comparing revisions. The [performance review](docs/m4-review.md) records the asset sizes, camera switch timings, and street comparison.

## Verify the café

Install Google Chrome for the Playwright checks. Run these commands from the repository root.

```sh
pnpm build
pnpm lint
pnpm format
pnpm test
pnpx fallow dead-code
```

Playwright checks keyboard and touch controls, the reader, music opt-in, camera switching, and both model-loading fallbacks. It also checks the pixel visitor's seated, walking, crouching, and prop interaction poses. Playwright saves captures in `test-results/`. Fallow scans JavaScript and TypeScript for unused files, exports, and dependencies.
