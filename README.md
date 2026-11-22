# Steeport

Steeport opens at a café window seat. Explore in first person or in Pixel view, build a reading room next door, or walk to the hacker studio. The café's books are also available at `/books/`.

## Run locally

Use Node 26.13.0 and pnpm 12.16.1. The repository includes the exported models and media.

```sh
pnpm install
pnpm dev
```

Open the local URL Vite prints.

For deployment, serve `dist/` as the site root so the book and model URLs resolve.

| Command          | Result                                                      |
| ---------------- | ----------------------------------------------------------- |
| `pnpm dev`       | Start Vite and reload the site as you edit.                 |
| `pnpm build`     | Type-check the code and write the static site to `dist/`.   |
| `pnpm preview`   | Serve the production build locally. Run `pnpm build` first. |
| `pnpm typecheck` | Check TypeScript types.                                     |
| `pnpm lint`      | Check the code with ESLint.                                 |
| `pnpm format`    | Check formatting for files covered by Prettier.             |
| `pnpm test`      | Run the browser tests in Google Chrome.                     |

## Visit the café and studio

Open **Settings** at the top right to see the controls or switch camera views. Choose **Build mode** to work on the plot beside the café. Attach a room or lay floor tiles, then add walls, doors, and furniture. The browser saves each accepted edit. Choose **Done** to leave Build mode and walk into the room.

Leave through the front door and follow the pavement past the café window to studio **08**. Select **Enter door code** and follow the staff note on the keypad. Inside, select **Use workstation** to open the practice terminal. Use the movement keys to roll either studio chair while seated. To open the safe, approach the repair bench from the aisle. [Traditional Chinese controls guide](docs/scene-interaction.md)

If the scene fails to load, the homepage shows a still of the café. From there you can open a book, watch a film, or launch the studio demo.

## Keyboard controls

| Key                                      | Action                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **W**, **A**, **S**, **D** or arrow keys | Walk. In a studio chair, roll the chair.                                                                           |
| **Shift** or **Space**                   | Hold **Shift** to run. Press **Space** to jump while upright.                                                      |
| **Q** or **E**                           | Turn the camera left or right. You can also drag the scene.                                                        |
| **C**                                    | Stand up or sit down near a seat.                                                                                  |
| **X**                                    | Crouch or stand upright. Crouch near Leo to reveal **Pet Leo**.                                                    |
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
| **Esc**                                  | Close the current dialog, leave a screen close-up, cancel placement, or exit Build mode.                           |
| **M**                                    | Play or mute the lo-fi loop. In the TV close-up, toggle the film sound.                                            |

Face nearby props to select them directly or use the toolbar. Select an open laptop screen to move closer. To return to the room, click outside the screen or book. When placing an item, click a clear surface within reach.

In pixel view, the visitor turns as they change direction and plants their last step when you release the movement key. Crouch within arm's reach of Leo to enter a deep squat, then select **Pet Leo**. The visitor uses a free hand to stroke Leo's back.

Open **Steeport 開發日誌** at the window desk to read the illustrated development journal. The bookcase holds **雷歐**, with modeling notes and reference photos, and **Trail journal**. With reduced motion enabled, books change poses without animation.

Walk into a freestanding chair to slide it if there's room. You can open and close the front door from inside and watch the trees move from the window seat.

## Project structure

| Path                                                                 | Responsibility                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`, `src/cafe.ts`, `src/view.ts`                          | Connect the HTML controls, visitor and room state, and Three.js renderer. Both camera modes read the same visitor state. |
| `src/annex.ts`, `src/annex-visuals.ts`                               | Validate, save, and render the Build mode plot.                                                                          |
| `src/workshop.ts`, `src/workshop-demo.ts`, `src/workshop-visuals.ts` | Present the terminal, simulate its responses in the browser, and render the studio.                                      |
| `scene/`, `scripts/`, `public/`                                      | Store the Blender sources, build scripts, and assets served to the browser.                                              |
| `content/books/`, `scripts/books.mjs`                                | Compile Markdown for the in-scene reader and standalone HTML.                                                            |
| `tests/`                                                             | Test scene controls, guides, book pages, and fallbacks with Playwright.                                                  |

Architecture records explain why the two views share state, how the studio terminal runs in the browser, and how Markdown feeds both readers. [Camera state](docs/decisions/0001-share-state-between-camera-modes.md) · [Studio demo](docs/decisions/0002-keep-the-studio-demo-client-side.md) · [Book publishing](docs/decisions/0003-publish-both-book-views-from-markdown.md)

The physical-phone and first-time visitor checks are still pending. [Milestones and acceptance criteria](docs/milestones.md)

## Add a book

Give each book a lowercase, hyphenated folder name under `content/books/`. The folder name sets the book URL, such as `/books/steeport-devlog/`. Put the title and placement in `index.md`. Write the introduction below the front matter.

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

Put each chapter in a numbered Markdown file, such as `01-floor-plan.md`. Include at least one chapter. Each chapter can have `title` and `date` fields in its front matter. Use `YYYY-MM-DD` for dates. Put raster images in the book's `images/` folder. To add a caption, put the image on its own line and give it a Markdown title.

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

## Rebuild scene assets

Blender and the browser share the room dimensions, furniture footprints, and interaction positions in [scene/layout.json](scene/layout.json).

Use Blender 5.2 LTS and put `blender` on your PATH. The checked-in models came from Blender 5.2.3. Run the café generator from the repository root.

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

The room generator uses `cafe_geometry.py` for meshes, `cafe_surfaces.py` for materials, and `cafe_lighting.py` for light bakes. The editable room includes Leo from `public/models/leo.blend`. The browser loads Leo’s three poses from `public/models/leo.glbz`. [Leo model development log](models/cat-archives/index.html) · [Rebuild Leo](scene/leo/reference_notes.md)

[Editable Blender scene](scene/cafe.blend) · [Seated still](public/studies/window-seat.jpg) · [Standing interior still](public/studies/standing-turn.jpg) · [Café concept floor plan](docs/cafe-floor-plan.svg)

Run the studio prop generator separately when you change the repair bench, desk props, or safe. [Workshop model credits and rebuild](docs/workshop-props.md)

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
- `glbBytes` totals the encoded response sizes for `.glbz` and `.glb` files. The current run counts the café, the selected street, Leo, and both studio model bundles. The light atlas, JavaScript, and media are separate downloads.

Use the same browser, hardware, and network settings when comparing revisions. The [performance review](docs/m4-review.md) records the asset sizes, camera switch timings, and street comparison.

## Verify changes

Install Google Chrome for the Playwright checks. Run these commands from the repository root.

```sh
pnpm build
pnpm lint
pnpm format
pnpm test
```

The full suite also checks keyboard and touch controls, camera switching, chapter links, and whether Build mode edits persist on reload. Playwright saves screenshots in `test-results/`. For studio changes, run `pnpm test tests/workshop.spec.ts` to check the keypad, chairs, safe, terminal, and HTML fallback.

Use `pnpx fallow dead-code` for a separate scan of unused JavaScript and TypeScript files, exports, and dependencies.
