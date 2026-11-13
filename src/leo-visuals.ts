import {
  Group,
  MathUtils,
  Mesh,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'

import { type Cafe, canLeoWalk, layout } from './cafe'
import { leoRoutine } from './leo'
import { archivePaws, archivePose, walkPaws } from './leo-motion'

export function leoVisuals(cat: Group, asset: Object3D) {
  const standing = archivePose(asset, 'Standing')
  const walking = archivePose(asset, 'Walking')
  const stretching = archivePose(asset, 'Stretching')
  const poses = [standing, walking, stretching]
  const routine = leoRoutine()
  const strokePoint = new Vector3()
  for (const pose of poses) cat.add(pose.root)

  const bed = layout.props.cat
  const contactDensity = { value: 0.53 }
  const shadow = new Mesh(
    new PlaneGeometry(0.82, 0.46),
    new ShaderMaterial({
      uniforms: {
        density: contactDensity,
        bedMask: { value: false },
        bedCenter: { value: [bed.x, bed.z] },
      },
      vertexShader: `
        varying vec2 contactUv;
        varying vec2 groundPoint;
        void main() {
          contactUv = uv;
          groundPoint = (modelMatrix * vec4(position, 1.0)).xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float density;
        uniform bool bedMask;
        uniform vec2 bedCenter;
        varying vec2 contactUv;
        varying vec2 groundPoint;
        void main() {
          vec2 p = contactUv * 2.0 - 1.0;
          float shade = 1.0 - smoothstep(0.05, 0.97, dot(p, p));
          if (bedMask) {
            float edge = length(max(abs(groundPoint - bedCenter) - vec2(0.295, 0.225), 0.0));
            shade *= 1.0 - smoothstep(0.009, 0.04, edge);
          }
          gl_FragColor = vec4(0.029, 0.022, 0.016, shade * shade * density);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  const bedShadow = shadow.clone()
  bedShadow.material = shadow.material.clone()
  bedShadow.material.uniforms = {
    ...shadow.material.uniforms,
    bedMask: { value: true },
  }
  shadow.raycast = bedShadow.raycast = () => undefined
  cat.add(shadow, bedShadow)

  function update(cafe: Cafe, now: number, dt: number, reduce: boolean) {
    const { leo } = cafe
    const pose = routine.update(leo, now, dt, reduce, (point) =>
      canLeoWalk(cafe, point),
    )
    const { upright, stride, gait, pet, stretch, walkBlend } = pose
    const cos = Math.cos(pose.heading)
    const sin = Math.sin(pose.heading)
    function ground(x: number, z: number) {
      const dx = Math.max(
        0,
        Math.abs(leo.x + x * cos + z * sin - bed.x) - 0.295,
      )
      const dz = Math.max(
        0,
        Math.abs(leo.z - x * sin + z * cos - bed.z) - 0.225,
      )
      return (
        bed.y * (1 - MathUtils.smoothstep(Math.hypot(dx, dz), 0.024, 0.069))
      )
    }
    cat.position.set(leo.x, leo.y, leo.z)
    cat.rotation.y = pose.heading

    standing.weight((1 - walkBlend) * (1 - stretch))
    walking.weight(walkBlend)
    stretching.weight(stretch)
    standing.morph('Rest', 1 - upright)
    standing.morph('Reach', stretch * 0.92)
    stretching.morph('Recover', 1 - stretch)
    walking.morph('Tail sway', Math.sin(gait * Math.PI * 2) * stride * 0.46)
    standing.morph('Tail sway', pet * 0.25)
    for (const state of poses) state.morph('Lean into pet', pet)
    walkPaws(walking, gait, stride, (x, z) => ground(x, z) - leo.y)
    for (const paw of archivePaws) {
      standing.morph(`Lift ${paw.label}`, (ground(paw.x, paw.z) - leo.y) / 0.18)
    }
    shadow.position.set(-0.034, 0.003 - leo.y, 0)
    bedShadow.visible = Math.hypot(leo.x - bed.x, leo.z - bed.z) < 0.72
    bedShadow.position.set(-0.034, bed.y + 0.005 - leo.y, 0)
    contactDensity.value = 0.53 - 0.13 * upright
    return { ...pose, backHeight: 0.16 + 0.145 * upright - 0.075 * stretch }
  }

  function petPoint(x: number, z: number, backHeight: number, now: number) {
    cat.worldToLocal(strokePoint.set(x, cat.position.y, z))
    return cat.localToWorld(
      strokePoint.set(
        MathUtils.clamp(strokePoint.x, -0.13, 0.14) +
          0.032 * Math.sin(now * 0.026),
        backHeight,
        MathUtils.clamp(strokePoint.z, -0.06, 0.06),
      ),
    )
  }

  return {
    update,
    pet: routine.pet,
    petPoint,
    dispose() {
      for (const pose of poses) pose.dispose()
      shadow.geometry.dispose()
      shadow.material.dispose()
      bedShadow.material.dispose()
    },
  }
}
