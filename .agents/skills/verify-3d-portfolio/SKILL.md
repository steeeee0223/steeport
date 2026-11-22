---
name: verify-3d-portfolio
description: Verify Steeport's 3D portfolio in a browser. Use after changes to scene art, project interactions, HTML fallback, or rendering performance, and before sharing a preview.
---

# Verify the 3D portfolio

Test the changed interaction in a browser. For the reading room or studio, start at the window seat and walk there. For a book, open it in the café reader and follow the chapter link. Check that the link opens the right chapter with JavaScript disabled. Verify that hidden links cannot receive clicks or focus. [Visitor controls](../../../docs/scene-interaction.md) · [Verification commands](../../../README.md#verify-changes)

## Exercise transitions

- Use a keyboard on desktop and touch on a narrow viewport. Check focus when content opens and closes. Exercise rapid selection changes, resize during loading, and browser Back when the interaction changes the URL.
- Block the room asset or disable WebGL. From the static homepage, open a book and launch the studio demo. For terminal changes, also disable native HTML-to-canvas drawing and check that the terminal opens as a dialog inside the studio. Check reduced motion separately.
- Capture the browser and device or emulation settings, the repro steps, and the resulting screenshot or trace. Use Playwright or existing browser tooling for repeatable checks. Use real hardware for claims about GPU performance.

## Check a visual or performance change

Compare captures with the same viewport, pixel ratio, camera pose, scene state, and animation time. Use more than one representative view if the camera moves. Use pixel differences to locate changes, then inspect those changes for seams, missing objects, altered contrast, or wrong light.

When optimizing, compare the same visitor path and hardware before and after. Repeat timing runs and report the spread. Record the measure the change targets, such as frame time, draw calls, or bytes transferred before the scene becomes usable. Treat a result within run-to-run variation as inconclusive.

## Source notes

- Rieseberg's browser QA found blank labels, links active behind cards, and races during rapid tape switches. His optimization checks paired rendering metrics with image comparisons from multiple angles. [Made by mechanical means](https://felixrieseberg.com/made-by-mechanical-means/)
- His JavaScript timing experiment shows how run-to-run variance can hide the effect of a change. His Jekyll workflow checked generated pages and links before deployment. [Adventures in measuring JavaScript](https://felixrieseberg.com/adventures-in-measuring-javascript/), [Deploy Jekyll Pages using Git and Travis CI](https://felixrieseberg.com/deploy-jekyll-pages-using-git-and-travis-ci/)
