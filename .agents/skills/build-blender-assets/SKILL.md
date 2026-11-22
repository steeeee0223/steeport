---
name: build-blender-assets
description: Model, light, bake, and export Blender assets for Steeport's browser scene. Use for props, scene geometry, procedural materials, lightmaps, or Blender-to-glTF handoff.
---

# Build Blender assets

Block out the approved camera view at the intended scale. Place the main prop and light first. Render a still before refining objects that are small or outside the frame. If visitors can move the camera, check the extremes of travel before spending time on hidden geometry.

1. For procedural or repeated work, use Blender Python with explicit scene inputs and output paths. Keep the editable source and a reproducible export path. Record the Blender version when its output depends on version-specific behavior.
2. Separate fixed geometry from props that move, emit light, or receive input. Give interactive parts stable names and meaningful origins. Test a hinge or screen pivot before authoring variations.
3. Export a representative glTF or GLB early. Inspect it in the intended browser renderer for dimensions, orientation, hierarchy, normals, UV sets, materials, and pivots. Bake procedural materials into supported textures where needed.
4. If browser lighting misses the approved look or exceeds the measured budget, use the [lightmap workflow](references/lightmaps.md). Start with one representative surface and one lighting state.
5. For each third-party asset, record the author, source, license, and required attribution. Keep that record with the asset when it moves into the web scene.

Hand off the editable source, the web asset, and a reference still from the intended camera. Include any material bindings or decoder requirements the browser needs. Before sharing the Blender file, check its packed image paths and file-browser settings for local paths. Keep the node names and hinge origins the browser uses. [Café asset build](../../../README.md#rebuild-scene-assets) · [Studio prop build](../../../docs/workshop-props.md)

## Source notes

- Rieseberg used Python to generate room geometry, props, and procedural materials, then rendered stills to guide revisions. His team used licensed assets for some furniture. [Made by mechanical means](https://felixrieseberg.com/made-by-mechanical-means/)
- Check material and export support against the Blender version in use. [Blender glTF exporter](https://docs.blender.org/manual/en/dev/addons/scene_gltf2.html), [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
