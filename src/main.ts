import { atSeat, changePosture, initialCafe, location, walk } from './cafe'
import {
  type PropId,
  bookPage,
  inReach,
  label,
  pages,
  propIds,
  sip,
  turnPage,
  useProp,
} from './props'
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
const markerLayer = element('markers', HTMLElement)
const preview = element('preview', HTMLImageElement)
const message = element('scene-message', HTMLElement)
const viewSwitch = element('view-switch', HTMLButtonElement)
const seatButton = element('seat', HTMLButtonElement)
const actions = element('actions', HTMLElement)
const touchPad = element('touch-pad', HTMLElement)
const orbitControls = element('orbit-controls', HTMLElement)
const viewLabel = element('view-label', HTMLElement)
const locationText = element('location-text', HTMLElement)
const hint = element('hint', HTMLElement)
const touch = matchMedia('(any-pointer: coarse)')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
const feedback = element('feedback', HTMLElement)
const propActions = element('prop-actions', HTMLElement)
const pockets = element('pockets', HTMLElement)
const cupState = element('cup-state', HTMLElement)
const sipButton = element('sip', HTMLButtonElement)
const atlasButton = element('read-atlas', HTMLButtonElement)
const reader = element('reader', HTMLDialogElement)
const bookTitle = element('book-title', HTMLElement)
const bookText = element('book-page', HTMLElement)
const pageNumber = element('page-number', HTMLElement)
const previousPage = element('previous-page', HTMLButtonElement)
const nextPage = element('next-page', HTMLButtonElement)
const closeBook = element('close-book', HTMLButtonElement)
const cafe = initialCafe

let failed = false
let dispose: (() => void) | undefined

function write(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value
}

function showFallback() {
  failed = true
  preview.hidden = false
  actions.hidden =
    touchPad.hidden =
    orbitControls.hidden =
    markerLayer.hidden =
    pockets.hidden =
      true
  if (reader.open) reader.close()
  dispose?.()
  viewSwitch.disabled = true
  viewport.querySelector('canvas')?.remove()
  viewLabel.textContent = '01 / BLENDER STUDY'
  locationText.textContent = 'Window seat'
  message.hidden = false
  message.textContent =
    'The interactive room is unavailable. You can still view the Blender studies.'
  hint.textContent = 'Seated at the open window.'
  feedback.textContent = ''
}

async function start() {
  const { loadView } = await import('./view')
  const markers = new Map<PropId, HTMLElement>()
  const buttons = new Map<PropId, HTMLButtonElement>()
  const symbols: Record<PropId, string> = {
    laptop: '▰',
    notebook: '▤',
    charger: 'ϟ',
    shelf: '▥',
    water: '◒',
    cat: '✦',
  }
  for (const id of propIds) {
    const button = document.createElement('button')
    button.type = 'button'
    button.addEventListener('click', () => interact(id, button))
    propActions.append(button)
    buttons.set(id, button)

    const marker = document.createElement('span')
    marker.className = 'prop-marker'
    marker.dataset.marker = id
    marker.textContent = symbols[id]
    marker.hidden = true
    marker.addEventListener('click', () => interact(id, button))
    markerLayer.append(marker)
    markers.set(id, marker)
  }
  const view = await loadView(viewport, markers, showFallback)
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
  let bookOpener: HTMLElement | undefined
  let drag: { id: number; x: number; y: number; distance: number } | undefined

  function syncControls() {
    const pixel = cafe.view === 'pixel'
    const seated = cafe.visitor.kind === 'seated'
    const nearby = atSeat(cafe.visitor)
    viewport.classList.toggle('pixel', pixel)
    const pressed = String(pixel)
    if (viewSwitch.getAttribute('aria-pressed') !== pressed)
      viewSwitch.setAttribute('aria-pressed', pressed)
    write(viewLabel, pixel ? '02 / PIXEL ROOM' : '01 / FIRST PERSON')
    write(locationText, location(cafe.visitor))
    write(seatButton, seated ? 'Stand up' : 'Sit down')
    seatButton.hidden = seatButton.disabled = !nearby
    for (const [id, button] of buttons) {
      button.hidden = !inReach(cafe, id)
      const name = label(cafe.props, id)
      write(button, name)
      const marker = markers.get(id)
      if (marker && marker.title !== name) marker.title = name
      if (id === 'water') {
        const disabled = String(cafe.props.water === 'full')
        if (button.getAttribute('aria-disabled') !== disabled)
          button.setAttribute('aria-disabled', disabled)
      }
    }
    const { water, shelfBook } = cafe.props
    atlasButton.hidden = shelfBook.kind === 'shelved'
    cupState.hidden = water === 'on-bar'
    write(
      cupState,
      water === 'full'
        ? 'Full cup'
        : water === 'half'
          ? 'Half-full cup'
          : 'Empty cup',
    )
    sipButton.hidden = water === 'on-bar' || water === 'empty'
    pockets.hidden = atlasButton.hidden && cupState.hidden
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
    const target = focusedTarget()
    const reachable = target !== undefined
    const guide =
      target && !touch.matches
        ? ' · F: ' + label(cafe.props, target)
        : !seated && !nearby && !reachable
          ? ' · Walk up to an object to use it'
          : ''
    write(hint, (pixel ? retroControls : controls) + guide)
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
    const stride = side || forward ? walk(cafe, side, forward, dt) : 0
    const animating = view.draw(cafe, time, dt, stride, reduceMotion.matches)
    syncControls()

    if (keys.size || touchKeys.size || animating) {
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

  function updateReader() {
    const book = cafe.props.reading
    if (!book) return
    const page = bookPage(cafe.props)
    write(bookTitle, book)
    write(bookText, pages[book][page])
    write(pageNumber, `${page + 1} / ${pages[book].length}`)
    previousPage.setAttribute('aria-disabled', String(page === 0))
    nextPage.setAttribute(
      'aria-disabled',
      String(page === pages[book].length - 1),
    )
  }

  function openReader(opener: HTMLElement | undefined) {
    if (reader.open) return
    bookOpener = opener
    keys.clear()
    touchKeys.clear()
    updateReader()
    reader.showModal()
    closeBook.focus()
  }

  function flip(direction: -1 | 1) {
    const before = bookPage(cafe.props)
    turnPage(cafe.props, direction)
    if (before === bookPage(cafe.props)) return
    updateReader()
    if (cafe.props.reading === 'Field notes')
      view.animate('notebook', performance.now())
    requestDraw()
  }

  function focusedTarget() {
    return view.focused() ?? propIds.find((id) => inReach(cafe, id))
  }

  function interact(id: PropId, opener = buttons.get(id)) {
    if (failed || reader.open || !inReach(cafe, id)) return
    const result = useProp(cafe, id)
    if (result) {
      write(feedback, result)
      if (id === 'water' || id === 'cat') view.animate(id, performance.now())
    }
    if (cafe.props.reading) openReader(opener)
    requestDraw()
  }

  atlasButton.addEventListener('click', () => {
    if (cafe.props.shelfBook.kind !== 'carried') return
    cafe.props.reading = 'A small atlas'
    openReader(atlasButton)
  })
  sipButton.addEventListener('click', () => {
    const result = sip(cafe.props)
    if (result) write(feedback, result)
    if (cafe.props.water === 'empty') {
      const nextControl = atlasButton.hidden ? viewSwitch : atlasButton
      nextControl.focus()
    }
    requestDraw()
  })
  closeBook.addEventListener('click', () => reader.close())
  reader.addEventListener('close', () => {
    cafe.props.reading = null
    if (!failed) bookOpener?.focus()
    bookOpener = undefined
  })
  previousPage.addEventListener('click', () => flip(-1))
  nextPage.addEventListener('click', () => flip(1))
  reader.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      flip(event.key === 'ArrowLeft' ? -1 : 1)
    }
  })

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
  element('orbit-left', HTMLButtonElement).addEventListener('click', () =>
    orbit(-Math.PI / 4),
  )
  element('orbit-right', HTMLButtonElement).addEventListener('click', () =>
    orbit(Math.PI / 4),
  )

  window.addEventListener('keydown', (event) => {
    if (
      failed ||
      reader.open ||
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
      if (event.code === 'KeyF') {
        const id = focusedTarget()
        if (id) interact(id)
      }
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
    if (drag.distance < 5) {
      const id = view.pick(event)
      if (id) interact(id)
    }
    drag = undefined
  })
  view.canvas.addEventListener('lostpointercapture', (event) => {
    if (drag?.id === event.pointerId) drag = undefined
  })

  const resize = new ResizeObserver(requestDraw)
  resize.observe(viewport)
  touch.addEventListener('change', requestDraw)
  reduceMotion.addEventListener('change', requestDraw)
  dispose = () => {
    cancelAnimationFrame(frame)
    resize.disconnect()
    touch.removeEventListener('change', requestDraw)
    reduceMotion.removeEventListener('change', requestDraw)
    view.dispose()
  }
  view.draw(cafe, performance.now(), 0, 0, reduceMotion.matches)
  syncControls()
  preview.hidden = message.hidden = true
  actions.hidden = viewSwitch.disabled = false
}

void start().catch((error: unknown) => {
  if (import.meta.env.DEV) console.error('Could not open the café', error)
  showFallback()
})
