# M4 window and performance review

The default café uses full geometry for the buildings across the street. The depth study keeps the same road, trees, and window frame. It replaces the far buildings with a Cycles color bake projected onto a mesh reconstructed from orthographic depth samples. Open `/?street=depth` to try that version. Both versions use the same room and controls.

Run `pnpm test --grep 'compares both streets'` to capture the seated, standing, and along-window views at 1440 × 940. Playwright saves both sets in `test-results/`. Use the seated and standing views to compare the window frame and tree occlusion. Use the side view to check the awnings and the edges of the buildings. The full model preserves the thickness of the shopfronts at an angle.

The browser fetches the shared room, the selected exterior, and the diffuse light atlas in parallel. Pixel view uses the same room at a smaller render resolution, so switching cameras requires no asset fetch. Blender bakes indirect light into the atlas and floor contact shadows into a separate occlusion map. The browser adds live lighting and updates the sun shadow map when the camera mode, visible walls, or shadow-casting props change.

## Historical M4 timing runs

These measurements predate the later café revisions. Each variant ran in three cold browser contexts on a macOS arm64 desktop with Chrome 156. The desktop viewport is 1440 × 940. The phone setting uses Chrome's iPhone 13 emulation at 390 × 664 and DPR 3. The separate touch tests use 390 × 844. Both phone settings use the desktop GPU. A physical phone run is deferred.

| Variant | Viewport | First usable frame, median (range) | Walking frame p95 across runs | Camera switch, either direction | GLB bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| M2 baseline | Desktop | 328 ms (294–455) | 16.7–16.8 ms | 22–25 ms | 1,562,284 |
| M2 baseline | Phone emulation | 259 ms (256–263) | 16.7–16.8 ms | 21–24 ms | 1,562,284 |
| M4 geometry | Desktop | 357 ms (297–749) | 16.7–16.8 ms | 18–38 ms | 2,802,420 |
| M4 geometry | Phone emulation | 275 ms (274–275) | 16.7–16.8 ms | 21–28 ms | 2,802,420 |
| M4 depth | Desktop | 321 ms (317–370) | 16.7–16.8 ms | 17–30 ms | 2,852,280 |
| M4 depth | Phone emulation | 284 ms (272–310) | 16.7–16.8 ms | 21–31 ms | 2,852,280 |

The M4 targets were a median usable frame within 600 ms, walking p95 under 20 ms, and a switch within 50 ms. Both M4 variants met those targets in these runs. The geometry had one 749 ms desktop load. The timing ranges overlap, so the results do not establish a speed advantage for either exterior. The depth variant used more GLB bytes at M4. In the current build, the depth exterior GLB is smaller than the geometry exterior GLB.

## Benchmark the current build

Run both variants using the [browser benchmark instructions](../README.md#measure-browser-performance).
