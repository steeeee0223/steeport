import {
  atLaptop,
  atSeat,
  changePosture,
  initialCafe,
  location,
  walk,
} from './cafe'
import './style.css'

function element<T extends HTMLElement>(
  id: string,
  type: abstract new () => T,
): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) throw new Error('Missing page control: ' + id)
  return found
}

const viewport = element('viewport', HTMLElement)
const marker = element('laptop-marker', HTMLElement)
const preview = element('preview', HTMLImageElement)
const message = element('scene-message', HTMLElement)
const viewSwitch = element('view-switch', HTMLButtonElement)
const seatButton = element('seat', HTMLButtonElement)
const laptopButton = element('laptop', HTMLButtonElement)
const actions = element('actions', HTMLElement)
const touchPad = element('touch-pad', HTMLElement)
const orbitControls = element('orbit-controls', HTMLElement)
const viewLabel = element('view-label', HTMLElement)
const locationText = element('location-text', HTMLElement)
const hint = element('hint', HTMLElement)
const touch = matchMedia('(any-pointer: coarse)')
const cafe = initialCafe

let failed = false

function showFallback() {
  failed = true
  preview.hidden = false
  actions.hidden = touchPad.hidden = orbitControls.hidden = marker.hidden = true
  viewSwitch.disabled = true
  viewport.querySelector('canvas')?.remove()
  viewLabel.textContent = '01 / BLENDER STUDY'
  locationText.textContent = 'Window seat'
  message.hidden = false
  message.textContent =
    'The interactive room is unavailable. You can still view the Blender studies.'
  hint.textContent = 'Seated at the open window.'
}

async function start() {
  const { loadView } = await import('./view')
  const view = await loadView(viewport, marker, showFallback)
  if (failed) return
  const keys = new Set<string>()
  const touchKeys = new Map<number, string>()
  const movementKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
  ])
  let frame = 0
  let previousTime = 0
  let drag: { id: number; x: number; y: number; distance: number } | undefined

  function syncControls() {
    const pixel = cafe.view === 'pixel'
    const seated = cafe.visitor.kind === 'seated'
    const nearby = atSeat(cafe.visitor)
    viewport.classList.toggle('pixel', pixel)
    viewSwitch.setAttribute('aria-pressed', String(pixel))
    viewLabel.textContent = pixel ? '02 / PIXEL ROOM' : '01 / FIRST PERSON'
    locationText.textContent = location(cafe.visitor)
    seatButton.textContent = seated ? 'Stand up' : 'Sit down'
    seatButton.disabled = !nearby
    laptopButton.textContent = cafe.laptopOpen ? 'Close laptop' : 'Open laptop'
    laptopButton.setAttribute('aria-pressed', String(cafe.laptopOpen))
    laptopButton.disabled = !atLaptop(cafe.visitor)
    touchPad.hidden = !touch.matches || seated
    orbitControls.hidden = !pixel

    const controls = touch.matches
      ? seated
        ? 'Drag to look'
        : 'Hold arrows to walk · Drag to look'
      : seated
        ? 'Drag or use ← → to look'
        : 'WASD to walk · Drag or use ← → to look'
    const retroControls = touch.matches
      ? seated
        ? 'Drag or use ↶ ↷ to orbit'
        : 'Hold arrows to walk · Drag or use ↶ ↷ to orbit'
      : seated
        ? 'Drag or use Q / E to orbit'
        : 'WASD to walk · Q / E to orbit'
    const guide =
      !seated && !nearby ? ' · Return to the middle window chair to sit' : ''
    hint.textContent = (pixel ? retroControls : controls) + guide
  }

  function turn(yaw: number, pitch = 0) {
    cafe.visitor.yaw += yaw
    cafe.visitor.pitch = Math.max(
      -1.23,
      Math.min(1.23, cafe.visitor.pitch + pitch),
    )
  }

  function pressed(...codes: string[]) {
    return codes.some(
      (code) => keys.has(code) || [...touchKeys.values()].includes(code),
    )
  }

  function requestDraw() {
    if (!frame && !failed) frame = requestAnimationFrame(draw)
  }

  function draw(time: number) {
    frame = 0
    if (failed) return
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.04) : 0
    const pixel = cafe.view === 'pixel'
    const side =
      Number(pressed('KeyD') || (pixel && pressed('ArrowRight'))) -
      Number(pressed('KeyA') || (pixel && pressed('ArrowLeft')))
    const forward =
      Number(pressed('KeyW', 'ArrowUp')) - Number(pressed('KeyS', 'ArrowDown'))
    if (!pixel) {
      const look = Number(pressed('ArrowLeft')) - Number(pressed('ArrowRight'))
      if (look) turn(look * dt * 1.95)
    }
    if (side || forward) walk(cafe, side, forward, dt)
    syncControls()
    view.draw(cafe)

    if (keys.size || touchKeys.size) {
      previousTime = time
      requestDraw()
    } else {
      previousTime = 0
    }
  }

  function orbit(radians: number) {
    if (cafe.view !== 'pixel') return
    cafe.orbit = (cafe.orbit + radians) % (Math.PI * 2)
    requestDraw()
  }

  function toggleLaptop() {
    if (failed || !atLaptop(cafe.visitor)) return
    cafe.laptopOpen = !cafe.laptopOpen
    requestDraw()
  }

  function toggleSeat() {
    if (failed) return
    touchKeys.clear()
    changePosture(cafe)
    requestDraw()
  }

  viewSwitch.addEventListener('click', () => {
    cafe.view = cafe.view === 'pixel' ? 'first-person' : 'pixel'
    drag = undefined
    keys.clear()
    touchKeys.clear()
    requestDraw()
  })
  seatButton.addEventListener('click', toggleSeat)
  laptopButton.addEventListener('click', toggleLaptop)
  element('orbit-left', HTMLButtonElement).addEventListener('click', () =>
    orbit(-Math.PI / 4),
  )
  element('orbit-right', HTMLButtonElement).addEventListener('click', () =>
    orbit(Math.PI / 4),
  )

  window.addEventListener('keydown', (event) => {
    if (
      failed ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (event.target instanceof HTMLElement &&
        event.target.closest(
          'a, summary, input, textarea, select, [contenteditable]',
        ))
    )
      return
    if (movementKeys.has(event.code)) {
      event.preventDefault()
      keys.add(event.code)
      requestDraw()
    } else if (!event.repeat) {
      if (event.code === 'KeyQ') orbit(-Math.PI / 4)
      if (event.code === 'KeyE') orbit(Math.PI / 4)
      if (event.code === 'KeyF') toggleLaptop()
      if (event.code === 'KeyC') toggleSeat()
    }
  })
  window.addEventListener('keyup', (event) => keys.delete(event.code))
  window.addEventListener('blur', () => {
    keys.clear()
    touchKeys.clear()
    drag = undefined
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      keys.clear()
      touchKeys.clear()
      drag = undefined
    }
  })

  for (const button of touchPad.querySelectorAll('button')) {
    const code = button.dataset.move
    if (!code) continue
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      touchKeys.set(event.pointerId, code)
      requestDraw()
    })
    for (const eventName of [
      'pointerup',
      'pointercancel',
      'lostpointercapture',
    ]) {
      button.addEventListener(eventName, (event) => {
        if (event instanceof PointerEvent) touchKeys.delete(event.pointerId)
      })
    }
  }

  view.canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag) return
    view.canvas.setPointerCapture(event.pointerId)
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: 0,
    }
  })
  view.canvas.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag = {
      id: drag.id,
      x: event.clientX,
      y: event.clientY,
      distance: drag.distance + Math.hypot(dx, dy),
    }
    if (cafe.view === 'pixel') orbit(dx * 0.009)
    else turn(-dx * 0.006, -dy * 0.006)
    requestDraw()
  })
  view.canvas.addEventListener('pointerup', (event) => {
    if (drag?.id !== event.pointerId) return
    if (drag.distance < 5 && view.hitsLaptop(event)) toggleLaptop()
    drag = undefined
  })
  view.canvas.addEventListener('lostpointercapture', (event) => {
    if (drag?.id === event.pointerId) drag = undefined
  })

  new ResizeObserver(requestDraw).observe(viewport)
  touch.addEventListener('change', requestDraw)
  syncControls()
  view.draw(cafe)
  preview.hidden = message.hidden = true
  actions.hidden = viewSwitch.disabled = false
}

void start().catch(showFallback)
