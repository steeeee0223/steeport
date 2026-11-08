# Bake fixed lighting for the browser

1. Establish the target with a Cycles still at the portfolio camera. Keep a copy for browser comparisons.
2. Give fixed surfaces a separate UV set for baked lighting. Pack islands without overlap on each shared atlas and leave margins for filtering and mipmaps. Select the intended UV set and bake target explicitly.
3. Start with one bake and wire it into the actual browser material. If the material still receives live light, account for the light already present in the bake. Inspect UV seams, dark corners, and color shifts in the browser before expanding the atlas.
4. If the visitor can change a light source, isolate its contribution only when that change needs to affect nearby surfaces. For a screen that casts colored light, bake its white-light contribution separately. Tint and combine it with the base lighting in linear space. For a light switch, compare separate states or a separate contribution against the simpler single-bake result.
5. Keep moving props on a live lighting path. Export the lightmaps with an explicit texture encoding and UV binding. Check those bindings after export and verify the browser's display transform with the reference still.

If a distant backdrop needs only slight parallax or occlusion, compare a licensed photo with a depth map against full geometry. Judge both from the camera range visitors can actually reach.

## Sources

Rieseberg used separate atlases for base color and lighting. His screen tint affected a white-light bake, and moving props used live lighting. His window used separate depth treatments for smooth parallax and sharper occlusion. [Made by mechanical means](https://felixrieseberg.com/made-by-mechanical-means/)

Check the bake target, pass, and UV margins in the manual for the Blender version in use. [Blender render baking](https://docs.blender.org/manual/en/4.4/render/cycles/baking.html)
