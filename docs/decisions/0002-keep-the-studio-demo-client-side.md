# ADR 0002 Keep the studio demo in the browser

## Status

Accepted. Recorded 2026-11-23.

## Context

Visitors can type into the studio terminal, inspect a simulated computer, and read an event log. They need to be able to do all three when WebGL or native HTML-to-canvas drawing is unavailable.

## Decision

`src/workshop-demo.ts` simulates the exercise with synthetic records and keeps its state in browser memory. `src/workshop.ts` handles input, history, and monitor selection in one HTML dialog.

`src/html-in-canvas.ts` draws the HTML onto the monitor when the browser and viewport support it. On narrow screens and on the static homepage, the visitor uses the dialog directly. The browser also tracks whether the studio door is locked.

The browser loads the desk and monitors in one bundle and the other studio props in another. It moves the entry door, chairs, and safe door. The safe model provides the hinge origin.

## Alternatives considered

A terminal drawn only on the monitor would need separate input handling and a second interface for the fallback. A live service would require a server to run the same exercise for every visitor. The HTML dialog lets both views use the same input and exercise data.

## Consequences

The static site can run the whole exercise. When changing the terminal, check keyboard focus as you switch between the monitor and dialog. Run the exercise from the static homepage too. When changing the model, keep the display node names and the safe door's hinge origin. [Model rebuild and export checks](../workshop-props.md)
