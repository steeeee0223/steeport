import {
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  Vector3,
} from 'three'

import { type Point } from './visitor'

export function floorLamps(scene: Object3D) {
  const darkMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>()
  const lit = new Map<Object3D, Vector3>()
  // Keep the lighting cost bounded when a room has many lamps. Each shade
  // still shows its own switch state.
  const lights = Array.from({ length: 3 }, () => {
    const light = new PointLight(0xffcc8a, 0, 2.15)
    scene.add(light)
    return light
  })
  function add(model: Object3D) {
    const shades: ((on: boolean) => void)[] = []
    model.traverse((object) => {
      if (
        !(object instanceof Mesh) ||
        !(object.material instanceof MeshStandardMaterial)
      )
        return
      const on = object.material
      if (on.emissive.getHex() === 0 || on.emissiveIntensity <= 0) return
      let off = darkMaterials.get(on)
      if (!off) {
        off = on.clone()
        off.emissiveIntensity = 0
        darkMaterials.set(on, off)
      }
      const dark = off
      shades.push((lit) => {
        const intensity = on.lightMapIntensity
        if (!Object.is(dark.lightMapIntensity, intensity))
          dark.lightMapIntensity = intensity
        const material = lit ? on : dark
        if (object.material !== material) object.material = material
      })
    })
    let wasOn: boolean | undefined
    return {
      set(on: boolean) {
        if (wasOn !== on) {
          wasOn = on
          if (on) {
            const point = model.getWorldPosition(new Vector3())
            point.y += 1.32
            lit.set(model, point)
          } else lit.delete(model)
        }
        for (const shade of shades) shade(on)
      },
      remove: () => lit.delete(model),
    }
  }

  function draw(visitor: Point) {
    const nearest = [...lit.values()]
    const distance = (point: Vector3) =>
      (point.x - visitor.x) ** 2 + (point.z - visitor.z) ** 2
    if (nearest.length > lights.length)
      nearest.sort((a, b) => distance(a) - distance(b))
    for (const [index, light] of lights.entries()) {
      const lamp = nearest[index]
      light.intensity = lamp ? 2.6 : 0
      if (lamp) light.position.copy(lamp)
    }
  }

  function dispose() {
    for (const off of darkMaterials.values()) off.dispose()
    for (const light of lights) light.dispose()
  }

  return { add, draw, dispose }
}
