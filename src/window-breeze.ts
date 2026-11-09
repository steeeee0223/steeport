import { Material, Mesh, MeshStandardMaterial, type Object3D } from 'three'

export function windowBreeze(street: Object3D) {
  const wind = { value: 0 }
  const time = { value: 0 }
  const materials = new Map<Material, Material>()
  const isMaterial = (value: unknown): value is Material =>
    value instanceof Material
  function flutter(material: Material) {
    if (!(material instanceof MeshStandardMaterial)) return material
    const existing = materials.get(material)
    if (existing) return existing
    const canopy = material.clone()
    canopy.onBeforeCompile = (shader) => {
      shader.uniforms.windowWind = wind
      shader.uniforms.windowTime = time
      shader.vertexShader =
        'uniform float windowWind; uniform float windowTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float wave = windowTime * 2.9 - position.x * 1.25 + position.z * 0.72;
          float flutter = sin(wave * 2.8 + position.y * 7.0);
          transformed.x += windowWind * (0.053 + 0.039 * sin(wave) + 0.013 * flutter);
          transformed.z += windowWind * (0.024 + 0.021 * sin(wave + 1.4));
          transformed.y += windowWind * (0.018 * sin(wave - 0.7) + 0.009 * flutter);`,
        )
    }
    canopy.customProgramCacheKey = () => 'cafe-window-breeze'
    materials.set(material, canopy)
    return canopy
  }
  street.traverse((object) => {
    if (
      !(object instanceof Mesh) ||
      !object.name.startsWith('Plane_tree_canopy')
    )
      return
    const material: unknown = object.material
    if (Array.isArray(material)) {
      object.material = material.filter(isMaterial).map(flutter)
    } else if (isMaterial(material)) {
      object.material = flutter(material)
    }
  })

  let start = 0
  let gust = 0
  const lulls = [18600, 24800, 14700, 22100]
  const duration = 4300
  return {
    update(now: number, active: boolean) {
      wind.value = 0
      if (!active || materials.size === 0) {
        start = 0
        return { moving: false, wakeAt: Infinity }
      }
      start ||= now + 3500
      if (now >= start + duration) {
        start = now + (lulls[gust % lulls.length] ?? 19000)
        gust++
      }
      if (now < start) return { moving: false, wakeAt: start }
      time.value = (now - start) / 1000
      wind.value = Math.sin((Math.PI * (now - start)) / duration) ** 2
      return { moving: true, wakeAt: Infinity }
    },
    dispose() {
      for (const material of materials.values()) material.dispose()
    },
  }
}
