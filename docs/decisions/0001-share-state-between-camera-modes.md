# ADR 0001 Share scene state between camera modes

## Status

Accepted. Recorded 2026-11-23.

## Context

Visitors can switch views anywhere in the café, reading room, or studio. A visitor may be holding a book, sitting in a chair, or halfway through an open door when they switch.

## Decision

Use one set of movement and interaction rules for both views. `src/main.ts` handles input, and `src/cafe.ts` tracks movement and seating and checks collisions. `src/view.ts` draws the scene with the selected camera. Pixel view renders at a lower resolution and cuts away walls that block the view.

`src/annex.ts` defines the reading room grid. Build mode previews edits and checks that the path to the café stays open. The browser saves accepted layouts in a versioned entry under the `steeport.annex` local storage key. Visitor and object state stays in memory.

## Alternatives considered

Separate scenes would let us lay out each view for its camera. Switching views would then require mapping the visitor's position and keeping collisions and object state in sync. A single layout keeps the visitor at the same point in a doorway and leaves objects where they were.

## Consequences

Change the camera and wall visibility in the renderer. Change collision and placement rules in the shared scene code. After adding a room or movable object, try the same interaction in both views and check that you can still reach the exit. [Visitor controls](../scene-interaction.md)
