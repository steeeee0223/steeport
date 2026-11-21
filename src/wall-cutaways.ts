import {
  type BufferGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from 'three'

import { type Point } from './visitor'

function isPanel(
  object: Object3D,
): object is Mesh<BufferGeometry, MeshStandardMaterial> {
  return (
    object instanceof Mesh && object.material instanceof MeshStandardMaterial
  )
}

export function wallCutaways() {
  const fadedMeshes = new WeakMap<Object3D, MeshStandardMaterial>()
  const walls = new Set<ReturnType<typeof createWall>>()

  function createWall(roots: readonly Object3D[], outward: Point) {
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>()
    const panels: {
      mesh: Mesh
      opaque: MeshStandardMaterial
      faded: MeshStandardMaterial
    }[] = []
    for (const root of roots)
      root.traverse((mesh) => {
        if (!isPanel(mesh)) return
        const opaque = mesh.material
        let faded = materials.get(opaque)
        if (!faded) {
          faded = opaque.clone()
          faded.lightMapIntensity = 0
          faded.transparent = true
          faded.depthWrite = false
          materials.set(opaque, faded)
        }
        fadedMeshes.set(mesh, faded)
        panels.push({ mesh, opaque, faded })
      })

    let opacity = 1
    return {
      update(orbitDirection: Point | undefined) {
        const facing = orbitDirection
          ? outward.x * orbitDirection.x + outward.z * orbitDirection.z
          : 0
        const next = MathUtils.lerp(
          1,
          0.13,
          MathUtils.smoothstep(facing, 0.05, 0.55),
        )
        if (next === opacity) return false
        const castsShadow = next >= 0.8
        const castShadowBefore = opacity >= 0.8
        opacity = next
        materials.forEach((material) => {
          material.opacity = opacity
        })
        for (const { mesh, opaque, faded } of panels) {
          mesh.material = opacity === 1 ? opaque : faded
          mesh.castShadow = castsShadow
        }
        return castsShadow !== castShadowBefore
      },
      warmup(target: Group) {
        for (const { mesh, faded } of panels)
          target.add(new Mesh(mesh.geometry, faded))
      },
      dispose() {
        for (const { mesh } of panels) fadedMeshes.delete(mesh)
        for (const material of materials.values()) material.dispose()
      },
    }
  }

  function add(roots: readonly Object3D[], outward: Point) {
    const wall = createWall(roots, outward)
    walls.add(wall)
    return () => {
      if (walls.delete(wall)) wall.dispose()
    }
  }

  return {
    add,
    update(orbitDirection: Point | undefined) {
      let shadowChanged = false
      for (const wall of walls)
        shadowChanged = wall.update(orbitDirection) || shadowChanged
      return shadowChanged
    },
    warmup() {
      const target = new Group()
      for (const wall of walls) wall.warmup(target)
      return target
    },
    dispose() {
      for (const wall of walls) wall.dispose()
      walls.clear()
    },
    has: (mesh: Object3D) => fadedMeshes.has(mesh),
    blocksPointer: (mesh: Object3D) =>
      (fadedMeshes.get(mesh)?.opacity ?? 1) >= 0.4,
  }
}
