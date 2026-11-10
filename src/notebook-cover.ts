import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'

import { books } from './books'

export function notebookCover(cover: Object3D) {
  // Older room exports still have the original lettering baked into a mesh.
  const oldTitle = cover.getObjectByName('Notebook_cover_lettering')
  if (oldTitle) oldTitle.visible = false

  const label = cover.getObjectByName('Pressed_cloth_label')
  const book = books.notebook
  if (!label || !book) return

  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 224
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#3a2415'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = /^(\S+)\s+(.+)$/u.exec(book.title)?.slice(1) ?? [book.title]
  ctx.font = '600 94px system-ui, sans-serif'
  for (const [index, line] of lines.entries()) {
    const y = canvas.height / 2 + (index - (lines.length - 1) / 2) * 92
    ctx.fillText(line, canvas.width / 2, y, canvas.width - 50)
  }

  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8
  const material = new MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: 0.86,
  })
  // Fit just inside the bevel on the cloth label.
  const geometry = new PlaneGeometry(0.118, 0.041)
  const mesh = new Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.00065
  mesh.receiveShadow = true
  label.add(mesh)
  return () => {
    mesh.removeFromParent()
    geometry.dispose()
    material.dispose()
    map.dispose()
  }
}
