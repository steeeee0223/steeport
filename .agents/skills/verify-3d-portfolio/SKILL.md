---
name: verify-3d-portfolio
description: Verify Steeport's 3D portfolio in a browser. Use after changes to scene art, project interactions, HTML fallback, or rendering performance, and before sharing a preview.
---

# Verify the 3D portfolio

Drive the changed visitor path in a browser. For a change to the entry or project flow, open the page, find a real project, open it, and return to the gallery. Check both the visible result and the destination. Verify that hidden links cannot still receive clicks or focus.

## Exercise transitions

- Use a keyboard on desktop and touch on a narrow viewport. Check focus when content opens and closes. Exercise rapid selection changes, resize during loading, and browser Back when the interaction changes the URL.
- Force the HTML view and simulate a failure appropriate to the change, such as blocked scene assets or unavailable WebGL. Verify that projects remain reachable and that a failed enhancement leaves no loading overlay. Check the reduced-motion preference separately.
- Capture the browser and device or emulation settings, the repro steps, and the resulting screenshot or trace. Use Playwright or existing browser tooling for repeatable checks. Use real hardware for claims about GPU performance.

## Check a visual or performance change

Compare captures with the same viewport, pixel ratio, camera pose, scene state, and animation time. Use more than one representative view if the camera moves. Use pixel differences to locate changes, then inspect those changes for seams, missing objects, altered contrast, or wrong light.

When optimizing, compare the same visitor path and hardware before and after. Repeat timing runs and report the spread. Record the measure the change targets, such as frame time, draw calls, or bytes transferred before the scene becomes usable. Treat a result within run-to-run variation as inconclusive.

## Source notes

- Rieseberg's browser QA found blank labels, links active behind cards, and races during rapid tape switches. His optimization checks paired rendering metrics with image comparisons from multiple angles. [Made by mechanical means](https://felixrieseberg.com/made-by-mechanical-means/)
- His JavaScript timing experiment shows how run-to-run variance can hide the effect of a change. His Jekyll workflow checked generated pages and links before deployment. [Adventures in measuring JavaScript](https://felixrieseberg.com/adventures-in-measuring-javascript/), [Deploy Jekyll Pages using Git and Travis CI](https://felixrieseberg.com/deploy-jekyll-pages-using-git-and-travis-ci/)
