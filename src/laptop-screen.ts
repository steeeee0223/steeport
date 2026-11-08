import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Vector2,
} from 'three'

import { type Book, pages, screenBooks } from './props'

export function laptopScreen() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 700
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not draw the laptop display')
  const ctx = context

  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  const material = new MeshBasicMaterial({ map, toneMapped: false })
  const mesh = new Mesh(new PlaneGeometry(0.343, 0.235), material)
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(0, -0.0087, 0.133)
  let selected: Book | null = null

  function draw(book: Book | null) {
    selected = book
    ctx.fillStyle = '#142520'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#22372e'
    ctx.fillRect(0, 0, canvas.width, 80)
    ctx.fillStyle = '#c7dfaf'
    ctx.font = '26px monospace'
    ctx.fillText('STEEPORT  /  READING ROOM', 70, 51)
    ctx.fillStyle = '#fff2d7'
    ctx.font = '54px Georgia'
    ctx.fillText(book ?? 'From the shelves', 70, 164)
    if (book) {
      ctx.font = '32px Georgia'
      let y = 231
      for (const passage of pages[book]) {
        let line = ''
        for (const word of passage.split(' ')) {
          const next = line ? line + ' ' + word : word
          if (ctx.measureText(next).width > 880) {
            ctx.fillText(line, 70, y)
            line = word
            y += 44
          } else line = next
        }
        ctx.fillText(line, 70, y)
        y += 74
      }
      ctx.fillStyle = '#c7dfaf'
      ctx.font = '27px monospace'
      ctx.fillText('←  BACK TO SHELF INDEX', 70, 637)
    } else {
      for (const [index, title] of screenBooks.entries()) {
        const y = 235 + index * 103
        ctx.fillStyle = '#263e34'
        ctx.fillRect(70, y, 884, 76)
        ctx.fillStyle = '#fff2d7'
        ctx.font = '34px Georgia'
        ctx.fillText(title, 108, y + 49)
        ctx.fillStyle = '#c7dfaf'
        ctx.font = '30px monospace'
        ctx.fillText('→', 886, y + 49)
      }
    }
    map.needsUpdate = true
  }

  draw(null)
  return {
    mesh,
    draw,
    selected: () => selected,
    choose(uv: Vector2) {
      const x = uv.x * canvas.width
      const y = (1 - uv.y) * canvas.height
      if (selected) {
        if (y >= 581 && x < 610) draw(null)
        return
      }
      const index = Math.floor((y - 235) / 103)
      const book = screenBooks[index]
      if (book && x >= 70 && x <= 954 && (y - 235) % 103 <= 76) draw(book)
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
      map.dispose()
    },
  }
}
