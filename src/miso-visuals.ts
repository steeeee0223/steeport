import {
  MathUtils,
  Mesh,
  type Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'

import { type Cafe, canMisoWalk, layout } from './cafe'
import { misoRoutine } from './miso'

export function misoVisuals(node: (name: string) => Object3D) {
  const cat = node('Miso')
  const torso = node('MisoTorso')
  const head = node('MisoHead')
  const tail = node('MisoTail')
  const tailFur = node('MisoTailFur')
  const closed = node('MisoClosedEyes')
  const open = node('MisoOpenEyes')
  const routine = misoRoutine()
  const legs = [0, 1, 2, 3].map((index) => ({
    upper: node('MisoUpper' + index),
    lower: node('MisoLower' + index),
    paw: node('MisoPaw' + index),
  }))
  const up = new Vector3(0, 1, 0)
  const axis = new Vector3()
  const hip = new Vector3()
  const joint = new Vector3()
  const ankle = new Vector3()
  const headAtRest = head.rotation.clone()
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

  function segment(mesh: Object3D, from: Vector3, to: Vector3) {
    mesh.position.copy(from).lerp(to, 0.5)
    axis.subVectors(to, from)
    mesh.scale.y = (axis.length() * 0.5 + 0.033) / 0.065
    mesh.quaternion.setFromUnitVectors(up, axis.normalize())
  }

  function update(cafe: Cafe, now: number, dt: number, reduce: boolean) {
    const { miso } = cafe
    const pose = routine.update(miso, now, dt, reduce, (point) =>
      canMisoWalk(cafe, point),
    )
    const { upright, stride, gait, pet } = pose
    const wave = Math.sin(gait * Math.PI * 4)
    const lift = upright * (0.176 + 0.008 * wave * stride)
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
    torso.position.y = lift
    torso.scale.z = 1 - upright * 0.2
    torso.rotation.z = tilt
    head.position.set(
      0.139 + 0.022 * upright,
      0.149 + lift + 0.038 * upright + 0.013 * pet + tilt * 0.14,
      0,
    )
    head.rotation.set(
      headAtRest.x + 0.12 * pet,
      headAtRest.y * (1 - upright) + stride * 0.07 * Math.sin(gait * 2.8),
      headAtRest.z + 0.24 * upright + 0.12 * pet,
    )
    const blink = now % 4900 > 4740
    open.visible = upright > 0.4 && !blink && pet < 0.5
    closed.visible = !open.visible
    tail.position.y = 0.07 + lift + 0.045 * upright - tilt * 0.15
    tail.rotation.y = stride * 0.17 * Math.sin(gait * 2.7) + pet * 0.17
    tail.rotation.z = upright * 0.09 * wave * stride
    if (tailFur instanceof Mesh && tailFur.morphTargetInfluences)
      tailFur.morphTargetInfluences[0] = upright

    for (const [i, { upper, lower, paw }] of legs.entries()) {
      const hind = i >= 2
      const side = i % 2 === 0 ? 1 : -1
      // Lateral sequence walk. A planted paw moves back at floor speed
      // until its swing phase takes it forward and up again.
      const phase = (gait + (i % 2) * 0.5 + (hind ? 0.78 : 0)) % 1
      const stance = 0.64
      const swing = Math.max(0, (phase - stance) / (1 - stance))
      const offset =
        phase < stance
          ? MathUtils.lerp(0.093, -0.093, phase / stance)
          : MathUtils.lerp(-0.093, 0.093, MathUtils.smoothstep(swing, 0, 1))
      const restX = hind ? -0.132 : i === 0 ? 0.19 : 0.171
      const toe = MathUtils.lerp(restX, hind ? -0.171 : 0.119, upright)
      const x = toe + offset * stride
      const z = side * (0.056 + 0.008 * upright)
      const floor = ground(x, z) - miso.y
      paw.position.set(
        x,
        0.025 + floor + Math.sin(swing * Math.PI) * 0.055 * stride,
        z,
      )
      hip.set(
        hind ? -0.145 : 0.088,
        (hind ? 0.094 - tilt * 0.145 : 0.07 + tilt * 0.088) + lift,
        side * (0.065 - 0.006 * upright),
      )
      joint.set(
        MathUtils.lerp(
          hind ? -0.196 : 0.128,
          paw.position.x + (hind ? 0.038 : -0.047),
          upright,
        ),
        MathUtils.lerp(
          0.035 + floor,
          paw.position.y + (hind ? 0.124 : 0.103),
          upright,
        ),
        paw.position.z,
      )
      ankle.copy(paw.position)
      ankle.x -= 0.017
      ankle.y += 0.005
      segment(upper, hip, joint)
      segment(lower, joint, ankle)
    }
    shadow.position.set(-0.034, 0.003 - miso.y, 0)
    bedShadow.visible = Math.hypot(miso.x - bed.x, miso.z - bed.z) < 0.72
    bedShadow.position.set(-0.034, bed.y + 0.005 - miso.y, 0)
    contactDensity.value = 0.55 - 0.13 * upright
    return pose
  }

  return {
    update,
    pet: routine.pet,
    dispose: () => {
      shadow.geometry.dispose()
      shadow.material.dispose()
      bedShadow.material.dispose()
    },
  }
}
