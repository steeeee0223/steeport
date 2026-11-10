import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  MathUtils,
  Mesh,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'

import { type Cafe, canMisoWalk, layout } from './cafe'
import { misoCycleDistance, misoRoutine } from './miso'

export function misoVisuals(node: (name: string) => Object3D) {
  const cat = node('Miso')
  const torso = node('MisoTorso')
  const head = node('MisoHead')
  const tail = node('MisoTail')
  const tailFur = node('MisoTailFur')
  const closed = node('MisoClosedEyes')
  const open = node('MisoOpenEyes')
  const routine = misoRoutine()
  if (!(torso instanceof Mesh)) throw new Error('Missing Miso’s fused coat')
  const loadedGeometry: unknown = torso.geometry
  if (!(loadedGeometry instanceof BufferGeometry))
    throw new Error('Invalid Miso coat geometry')
  const geometry = loadedGeometry
  const vertices: unknown = geometry.getAttribute('position')
  const curled = geometry.morphAttributes.position?.[0]
  const normals: unknown = geometry.getAttribute('normal')
  if (
    !(vertices instanceof BufferAttribute) ||
    !(normals instanceof BufferAttribute) ||
    !(curled instanceof BufferAttribute) ||
    !torso.morphTargetInfluences
  )
    throw new Error('Missing Miso’s standing and curled poses')
  torso.morphTargetInfluences[0] = 0
  vertices.setUsage(DynamicDrawUsage)
  normals.setUsage(DynamicDrawUsage)
  geometry.computeBoundingSphere()
  if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.15

  const position = vertices
  const rest = curled
  const bind = vertices.clone()
  const paws = [0, 1, 2, 3].map((index) => ({
    phase: -1,
    plant: new Vector2(),
    x: index < 2 ? 0.124 : -0.159,
    z: index % 2 === 0 ? 0.064 : -0.064,
    dx: 0,
    dz: 0,
    height: 0,
    flex: 0,
  }))
  const skin = Array.from({ length: bind.count }, (_, i) => {
    const x = bind.getX(i)
    const y = bind.getY(i)
    const z = bind.getZ(i)
    return {
      x,
      y,
      z,
      paw: paws[(x > -0.028 ? 0 : 2) + (z > 0 ? 0 : 1)],
      // The weighted area ends inside the welded shoulder or haunch. The
      // belly above the medial leg keeps its shape as the paws move.
      weight:
        (1 - MathUtils.smoothstep(y, 0.043, 0.246)) *
        MathUtils.smoothstep(Math.abs(x + 0.028), 0, 0.035) *
        MathUtils.smoothstep(Math.abs(z), 0, 0.027) *
        (1 -
          MathUtils.smoothstep(y, 0.13, 0.225) *
            (1 - MathUtils.smoothstep(Math.abs(z), 0.013, 0.05))),
      flex:
        MathUtils.smoothstep(y, 0.04, 0.125) *
        (1 - MathUtils.smoothstep(y, 0.15, 0.225)),
    }
  })
  const target = new Vector2()
  const strokePoint = new Vector3()
  const headAtRest = head.rotation.clone()
  const tailAtRest = tail.position.y
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
  cat.add(shadow, bedShadow)

  function poseCoat(
    upright: number,
    rock: number,
    tilt: number,
    previousUpright: number,
  ) {
    if (!upright && !previousUpright && paws.every((paw) => !paw.height)) return
    for (const [i, point] of skin.entries()) {
      const { x, y, z, paw, weight, flex } = point
      const curl = 1 - upright
      position.setXYZ(
        i,
        x +
          rest.getX(i) * curl +
          (paw?.dx ?? 0) * weight +
          (paw?.flex ?? 0) * flex,
        y +
          rest.getY(i) * curl +
          (paw?.height ?? 0) * weight +
          (rock + tilt * x) * (1 - weight),
        z + rest.getZ(i) * curl + (paw?.dz ?? 0) * weight,
      )
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
  }

  let previousUpright = -1
  function update(cafe: Cafe, now: number, dt: number, reduce: boolean) {
    const { miso } = cafe
    const pose = routine.update(miso, now, dt, reduce, (point) =>
      canMisoWalk(cafe, point),
    )
    const { upright, stride, gait, pet } = pose
    const wave = Math.sin(gait * Math.PI * 4)
    const rock = upright * 0.0035 * wave * stride
    const lift = upright * 0.176 + rock
    const cos = Math.cos(pose.heading)
    const sin = Math.sin(pose.heading)
    function ground(x: number, z: number) {
      const dx = Math.max(
        0,
        Math.abs(miso.x + x * cos + z * sin - bed.x) - 0.295,
      )
      const dz = Math.max(
        0,
        Math.abs(miso.z - x * sin + z * cos - bed.z) - 0.225,
      )
      return (
        bed.y * (1 - MathUtils.smoothstep(Math.hypot(dx, dz), 0.024, 0.069))
      )
    }
    const tilt =
      upright * 0.46 * Math.atan2(ground(0.16, 0) - ground(-0.16, 0), 0.32)
    cat.position.set(miso.x, miso.y, miso.z)
    cat.rotation.y = pose.heading
    head.position.set(
      0.139 + 0.019 * upright,
      0.149 + lift + 0.027 * upright + 0.013 * pet + tilt * 0.14,
      0,
    )
    head.rotation.set(
      headAtRest.x + 0.12 * pet,
      headAtRest.y * (1 - upright) +
        stride * 0.045 * Math.sin(gait * Math.PI * 2),
      headAtRest.z + 0.24 * upright + 0.12 * pet,
    )
    const blink = now % 4900 > 4740
    open.visible = upright > 0.4 && !blink && pet < 0.5
    closed.visible = !open.visible
    tail.position.y = tailAtRest + lift + 0.018 * upright - tilt * 0.18
    tail.rotation.y = stride * 0.09 * Math.sin(gait * Math.PI * 2) + pet * 0.1
    if (tailFur instanceof Mesh && tailFur.morphTargetInfluences) {
      const raise = MathUtils.smoothstep(upright, 0.4, 1)
      const unfurl = MathUtils.smoothstep(upright, 0, 0.4)
      tailFur.morphTargetInfluences[0] = unfurl * (1 - raise)
      tailFur.morphTargetInfluences[1] = raise
    }

    for (const [i, paw] of paws.entries()) {
      const hind = i >= 2
      // Lateral sequence: a hind paw touches down just before the forepaw
      // on the same side. Keep the contact in world space through turns.
      const phase = (gait + (i % 2) * 0.5 + (hind ? 0.23 : 0)) % 1
      const stance = 0.66
      const travel = misoCycleDistance * stride
      const ready = upright >= 0.995 && stride > 0.04
      const swing = ready ? Math.max(0, (phase - stance) / (1 - stance)) : 0
      if (ready) {
        const ahead =
          (phase < stance ? stance / 2 - phase : stance / 2 + 1 - phase) *
          travel
        const x = paw.x + ahead
        target.set(
          miso.x + x * cos + paw.z * sin,
          miso.z - x * sin + paw.z * cos,
        )
        if (paw.phase === -1 || phase < paw.phase) paw.plant.copy(target)
        paw.phase = phase
        target.lerp(paw.plant, 1 - MathUtils.smoothstep(swing, 0, 1))
        target.set(target.x - miso.x, target.y - miso.z)
        paw.dx = MathUtils.clamp(
          target.x * cos - target.y * sin - paw.x,
          -0.13,
          0.13,
        )
        paw.dz = MathUtils.clamp(
          target.x * sin + target.y * cos - paw.z,
          -0.06,
          0.06,
        )
      } else {
        paw.phase = -1
        paw.dx = MathUtils.damp(paw.dx, 0, 14, dt)
        paw.dz = MathUtils.damp(paw.dz, 0, 14, dt)
      }
      const curledX = hind ? 0.026 : i === 0 ? 0.062 : 0.047
      const footY =
        ground(paw.x + paw.dx + curledX * (1 - upright), paw.z + paw.dz) -
        miso.y
      const rise = Math.sin(Math.PI * swing) ** 2 * stride
      paw.height = footY + rise * (hind ? 0.029 : 0.037)
      paw.flex = rise * (hind ? 0.022 : -0.018)
    }
    poseCoat(upright, rock, tilt, previousUpright)
    previousUpright = upright
    shadow.position.set(-0.034, 0.003 - miso.y, 0)
    bedShadow.visible = Math.hypot(miso.x - bed.x, miso.z - bed.z) < 0.72
    bedShadow.position.set(-0.034, bed.y + 0.005 - miso.y, 0)
    contactDensity.value = 0.55 - 0.13 * upright
    return pose
  }

  function petPoint(x: number, z: number, upright: number, now: number) {
    cat.worldToLocal(strokePoint.set(x, cat.position.y, z))
    const alongBack = MathUtils.clamp(strokePoint.x, -0.13, 0.14)
    const nearSide = MathUtils.clamp(strokePoint.z, -0.06, 0.06)
    return cat.localToWorld(
      strokePoint.set(
        alongBack + 0.032 * Math.sin(now * 0.026),
        0.195 + 0.154 * upright,
        nearSide,
      ),
    )
  }

  return {
    update,
    pet: routine.pet,
    petPoint,
    dispose: () => {
      shadow.geometry.dispose()
      shadow.material.dispose()
      bedShadow.material.dispose()
    },
  }
}
