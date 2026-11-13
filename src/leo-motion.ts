import {
  BufferGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'

import { leoCycleDistance } from './leo'

export const archivePaws = [
  { label: 'FL', x: 0.147, z: 0.039, stepX: 0.267, stepY: 0.005, phase: 0 },
  { label: 'FR', x: 0.147, z: -0.039, stepX: 0.122, stepY: 0, phase: 0.5 },
  { label: 'HL', x: -0.142, z: 0.069, stepX: -0.022, stepY: 0, phase: 0.23 },
  { label: 'HR', x: -0.142, z: -0.069, stepX: -0.182, stepY: 0, phase: 0.73 },
] as const

export function archivePose(asset: Object3D, name: string) {
  const root = asset.getObjectByName(name)
  if (!root) throw new Error(`Missing Leo pose ${name}`)
  const meshes: Object3D[] = []
  const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>()
  root.traverse((object) => {
    if (
      !(object instanceof Mesh) ||
      !(object.material instanceof MeshStandardMaterial)
    )
      return
    const original = object.material
    let material = materials.get(original)
    if (!material) {
      material = original.clone()
      material.alphaHash = true
      materials.set(original, material)
    }
    object.material = material
    object.userData.placement_ignore = true
    meshes.push(object)
  })
  if (!meshes.length) throw new Error(`Missing Leo geometry for ${name}`)
  return {
    root,
    weight(value: number) {
      root.visible = value > 0.015
      for (const material of materials.values()) material.opacity = value
    },
    morph(key: string, value: number) {
      for (const mesh of meshes) {
        if (!(mesh instanceof Mesh)) continue
        const index = mesh.morphTargetDictionary?.[key]
        if (index !== undefined && mesh.morphTargetInfluences)
          mesh.morphTargetInfluences[index] = value
      }
    },
    dispose() {
      for (const mesh of meshes) {
        if (mesh instanceof Mesh && mesh.geometry instanceof BufferGeometry)
          mesh.geometry.dispose()
      }
      for (const material of materials.values()) material.dispose()
    },
  }
}

export function walkPaws(
  walking: ReturnType<typeof archivePose>,
  gait: number,
  stride: number,
  ground: (x: number, z: number) => number,
) {
  for (const paw of archivePaws) {
    const phase = (gait + paw.phase) % 1
    const stance = 0.64
    const swing = Math.max(0, (phase - stance) / (1 - stance))
    // World travel cancels local paw travel through the grounded part.
    const travel =
      (stance / 2 - phase + MathUtils.smoothstep(swing, 0, 1)) *
      leoCycleDistance *
      stride
    const lift = Math.sin(Math.PI * swing) ** 2 * stride * 0.034
    walking.morph(`Stride ${paw.label}`, (paw.x + travel - paw.stepX) / 0.14)
    walking.morph(
      `Lift ${paw.label}`,
      (ground(paw.x + travel, paw.z) + lift - paw.stepY) / 0.18,
    )
  }
}
