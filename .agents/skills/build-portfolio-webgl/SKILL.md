---
name: build-portfolio-webgl
description: Integrate the browser scene for Steeport's 3D portfolio. Use for Three.js scene loading, interactive props, canvas-based displays, fallback modes, or porting Shadertoy GLSL.
---

# Build the portfolio WebGL scene

Render titles, descriptions, and links as semantic HTML. Keep them reachable when the scene cannot render. Share identifiers and destinations between the scene and HTML. Load the scene after the HTML is available. Use one visitor state for both cameras. Feed the studio monitors and the HTML fallback from the same terminal dialog. [Camera state](../../../docs/decisions/0001-share-state-between-camera-modes.md) · [Studio terminal](../../../docs/decisions/0002-keep-the-studio-demo-client-side.md)

1. Load one representative asset and reproduce the approved framing. Check the imported model before adding effects so you can tell an export problem from a rendering problem.
2. Connect one prop to one real project. Use the same action for a scene hit target and its HTML control. Define who owns selection and focus so a route change, a click, and a key press cannot leave the scene and content out of sync.
3. If a prop hosts animated content, give the content a small lifecycle for mounting, updating, and cleanup. Stop its frame updates and media when the prop closes. When selection changes during a load, prevent the old result from taking over the new selection.
4. Give visitors a direct way back to the HTML view. Stop scene work when that view takes over. For reduced motion, keep the same destinations and remove nonessential camera movement. Start sound only after a visitor action that clearly requests it.
5. Use [the Shadertoy porting workflow](references/shadertoy.md) when an effect needs a Shadertoy shader. Start with the smallest pass that proves the effect in the browser.

## Source notes

- Rieseberg's tapes isolate their drawing, input, and cleanup behind a shared interface. The published site also offers static and interactive modes. [Made by mechanical means](https://felixrieseberg.com/made-by-mechanical-means/), [Felix Rieseberg's homepage](https://felixrieseberg.com/)
