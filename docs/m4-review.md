# Window and performance review

The default street uses 3D models for the buildings. The depth variant uses orthographic depth samples to reconstruct a mesh for the distant buildings, then projects a Cycles color bake onto it. Both variants share the road, trees, and window frame. Open `/?street=depth` to see the depth variant.

Run `pnpm test --grep 'compares both streets'` to save seated, standing, and along-window screenshots at 1440 × 940 in `test-results/`. Compare the window frame and how the trees overlap the buildings in the first two views. In the side view, compare the awnings and building edges. The full models preserve the thickness of the shopfronts from that angle.

The browser fetches the room, the selected street, and the diffuse light atlas in parallel. Pixel view renders the same room at a lower resolution and reuses the loaded assets. Blender bakes indirect light into the atlas and floor contact shadows into a separate occlusion map. The browser adds live lighting and updates the sun shadow map when the camera mode, visible walls, or props that cast shadows change.

## Blender 5.2 rebuild

The rebuild uses one bevel segment on decorative shelf books, fewer divisions along the slope of the roof tiles, and smaller meshes for Miso's open eyes. The default street keeps its 3D buildings and the profile of the roof eaves.

| Exported geometry       |  Before |   After |
| ----------------------- | ------: | ------: |
| Bookcase                |  34,992 |  15,472 |
| Roof tiles              |  44,608 |  22,528 |
| Miso's open eyes        |   5,040 |   2,160 |
| Room and default street | 289,093 | 244,613 |

The table counts triangles in the exported GLBs. Together, the two default `.glbz` files went from 4.33 MB to 3.96 MB on disk. The box generator caps bevel width at 40% of the shortest side to keep opposite bevels apart. Blender Agent Studio reported zero degenerate faces and zero-length edges after reimporting both exports.

## First switch to pixel view

The renderer starts compiling pixel-view shaders during browser idle time, including the transparent wall material. Chrome 157 linked seven programs during the first switch before the change and zero once precompilation finished.

| Viewport            |  Before |   After |
| ------------------- | ------: | ------: |
| Desktop             | 79.2 ms | 35.3 ms |
| iPhone 13 emulation | 48.4 ms | 25.9 ms |

These are medians from four fresh browser contexts per version and viewport, alternating versions with identical models and textures. The test timed the first switch from the click to the second animation-frame callback. First usable frame ranges overlapped in both viewports. The phone results use the desktop GPU.

## Historical M4 timing runs

These measurements predate later café revisions. Each variant ran in three fresh Chrome 156 contexts on macOS arm64. The desktop viewport was 1440 × 940. For timing, Chrome emulated an iPhone 13 at 390 × 664 and DPR 3. The separate touch tests used 390 × 844. Both used the desktop GPU. Testing on a physical phone is still pending.

| Variant     | Viewport        | First usable frame, median (range) | Walking frame p95 across runs | Camera switch, either direction | GLB bytes |
| ----------- | --------------- | ---------------------------------: | ----------------------------: | ------------------------------: | --------: |
| M2 baseline | Desktop         |                   328 ms (294–455) |                  16.7–16.8 ms |                        22–25 ms | 1,562,284 |
| M2 baseline | Phone emulation |                   259 ms (256–263) |                  16.7–16.8 ms |                        21–24 ms | 1,562,284 |
| M4 geometry | Desktop         |                   357 ms (297–749) |                  16.7–16.8 ms |                        18–38 ms | 2,802,420 |
| M4 geometry | Phone emulation |                   275 ms (274–275) |                  16.7–16.8 ms |                        21–28 ms | 2,802,420 |
| M4 depth    | Desktop         |                   321 ms (317–370) |                  16.7–16.8 ms |                        17–30 ms | 2,852,280 |
| M4 depth    | Phone emulation |                   284 ms (272–310) |                  16.7–16.8 ms |                        21–31 ms | 2,852,280 |

Both M4 variants reached a median time to the first usable frame of 600 ms or less, a walking p95 below 20 ms, and a camera switch within 50 ms. One desktop run with full geometry took 749 ms to reach its first usable frame. The timing ranges overlap. In the M4 runs, the depth variant transferred more GLB bytes in total. After gzip compression, the depth exterior alone was about 460 kB and the default exterior was about 917 kB.

## Lossless model compression

Gzip reduced the transfer size of the default room and street models from 11,977,796 to 4,059,623 bytes. All three compressed models decode to the exact bytes of their original GLBs.

The two local production builds used the same scene. The test alternated builds in Chrome 156 at 1440 × 940, with three fresh browser contexts per build. It recorded the time to the second animation frame after the camera switch became available.

| Network setting                               | Uncompressed median (range) | Gzip median (range) |
| --------------------------------------------- | --------------------------: | ------------------: |
| Loopback without throttling                   |            399 ms (393–406) |    400 ms (400–409) |
| 20 Mbps download with 45 ms simulated latency |          6.02 s (5.99–6.03) |  2.89 s (2.89–2.90) |

Seven of the nine screenshot pairs matched exactly across desktop, phone emulation, and the depth exterior. On desktop, eight pixels differed in the window seat view and two in the reader.

## Benchmark the current build

Run both street variants. The script uses the browser session's network conditions without throttling. [Browser benchmark instructions](../README.md#measure-browser-performance)
