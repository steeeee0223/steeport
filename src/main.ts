import { atSeat, changePosture, initialCafe, location, walk } from './cafe'
import {
  type Book,
  type Placeable,
  type PropId,
  bookPage,
  inReach,
  label,
  pages,
  propIds,
  putDown,
  screenBooks,
  shelfLabel,
  sip,
  turnPage,
  useProp,
} from './props'
import './style.css'

const studyPage = /^\/lab\/?$/.test(window.location.pathname)
document.body.classList.toggle('study-page', studyPage)
document.body.classList.toggle('immersive', !studyPage)

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
const crouchButton = element('crouch', HTMLButtonElement)
const laptopFocusButton = element('laptop-focus', HTMLButtonElement)
const screenControls = element('screen-controls', HTMLElement)
const bookLeaf = document.querySelector('.book-leaf')
const seatButton = element('seat', HTMLButtonElement)
const actions = element('actions', HTMLElement)
const touchPad = element('touch-pad', HTMLElement)
const orbitControls = element('orbit-controls', HTMLElement)
const zoomPixel = element('zoom-pixel', HTMLButtonElement)
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
const placeButtons = {
  cup: element('place-cup', HTMLButtonElement),
  atlas: element('place-atlas', HTMLButtonElement),
}
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
    journal: '▤',
    water: '◒',
    cat: '✦',
    door: '◫',
    cup: '◒',
    atlas: '▤',
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
    marker.addEventListener('click', () => {
      if (id === 'laptop' && cafe.props.laptopOpen) toggleLaptopFocus()
      else interact(id, button)
    })
    markerLayer.append(marker)
    markers.set(id, marker)
  }
  const view = await loadView(viewport, markers, showFallback)
  if (failed) return
  const screenButtons = new Map<Book | null, HTMLButtonElement>()
  for (const title of [null, ...screenBooks]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = title ?? 'Shelf index'
    button.addEventListener('click', () => {
      view.readScreen(title)
      requestDraw()
    })
    screenControls.append(button)
    screenButtons.set(title, button)
  }
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
  let viewBeforeFocus = cafe.view
  let placing: Placeable | undefined
  let drag: { id: number; x: number; y: number; distance: number } | undefined

  function syncControls() {
    const pixel = cafe.view === 'pixel'
    const seated = cafe.visitor.kind === 'seated'
    const nearby = atSeat(cafe)
    const focused = Boolean(cafe.laptopFocus)
    screenControls.hidden = !focused
    if (focused) {
      const selected = view.screenSelection()
      for (const [book, button] of screenButtons) {
        const pressed = String(book === selected)
        if (button.getAttribute('aria-pressed') !== pressed)
          button.setAttribute('aria-pressed', pressed)
      }
    }
    propActions.hidden = focused
    viewport.classList.toggle('pixel', pixel)
    viewport.classList.toggle('placing', placing !== undefined)
    const pressed = String(pixel)
    if (viewSwitch.getAttribute('aria-pressed') !== pressed)
      viewSwitch.setAttribute('aria-pressed', pressed)
    write(viewLabel, pixel ? '02 / PIXEL ROOM' : '01 / FIRST PERSON')
    write(locationText, location(cafe.visitor))
    write(seatButton, seated ? 'Stand up' : 'Sit down')
    seatButton.hidden = seatButton.disabled = !nearby || focused
    crouchButton.hidden = seated || Boolean(cafe.laptopFocus)
    crouchButton.setAttribute('aria-pressed', String(Boolean(cafe.crouched)))
    write(crouchButton, cafe.crouched ? 'Stand upright' : 'Crouch')
    laptopFocusButton.hidden =
      !cafe.props.laptopOpen || (!cafe.laptopFocus && !inReach(cafe, 'laptop'))
    write(
      laptopFocusButton,
      cafe.laptopFocus ? 'Back to the café' : 'Look at laptop',
    )
    for (const [id, button] of buttons) {
      button.hidden = !inReach(cafe, id)
      const name = label(cafe.props, id)
      write(button, name)
      const marker = markers.get(id)
      const markerName =
        id === 'laptop' && cafe.props.laptopOpen ? 'Look at laptop' : name
      if (marker && marker.title !== markerName) marker.title = markerName
      if (id === 'water') {
        const water = cafe.props.water
        const disabled = String(
          water.kind === 'carried' && water.level === 'full',
        )
        if (button.getAttribute('aria-disabled') !== disabled)
          button.setAttribute('aria-disabled', disabled)
      }
    }
    const { water, shelfBook } = cafe.props
    atlasButton.hidden = placeButtons.atlas.hidden =
      shelfBook.kind !== 'carried'
    write(atlasButton, 'Read ' + shelfLabel(cafe.props))
    cupState.hidden = placeButtons.cup.hidden = water.kind !== 'carried'
    for (const item of ['cup', 'atlas'] as const) {
      const button = placeButtons[item]
      const active = placing === item
      const pressed = String(active)
      if (button.getAttribute('aria-pressed') !== pressed)
        button.setAttribute('aria-pressed', pressed)
      const noun = item === 'atlas' ? shelfLabel(cafe.props) : 'cup'
      write(button, active ? 'Cancel placing ' + noun : 'Put down ' + noun)
    }
    write(
      cupState,
      water.kind === 'carried' && water.level === 'full'
        ? 'Full cup'
        : water.kind === 'carried' && water.level === 'half'
          ? 'Half-full cup'
          : 'Empty cup',
    )
    sipButton.hidden = water.kind !== 'carried' || water.level === 'empty'
    pockets.hidden = atlasButton.hidden && cupState.hidden
    touchPad.hidden = !touch.matches || seated
    orbitControls.hidden = !pixel

    const controls = touch.matches
      ? seated
        ? 'Drag to look'
        : 'Hold arrows to walk · Drag to look'
      : seated
        ? 'Drag or Q / E to look'
        : 'WASD to walk · Q / E to look · X to crouch'
    const target = focusedTarget()
    const reachable = target !== undefined
    const guide =
      target && !touch.matches
        ? ' · F: ' + label(cafe.props, target)
        : !seated && !nearby && !reachable
          ? ' · Walk up to an object to use it'
          : ''
    const placeHint = touch.matches
      ? 'Tap a clear surface within reach.'
      : 'Click a clear surface within reach, or press F to place near the center.'
    write(
      hint,
      placing
        ? placeHint
        : cafe.laptopFocus
          ? 'Esc to return to the room'
          : controls + guide,
    )
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
    const side =
      Number(pressed('KeyD', 'ArrowRight')) -
      Number(pressed('KeyA', 'ArrowLeft'))
    const forward =
      Number(pressed('KeyW', 'ArrowUp')) - Number(pressed('KeyS', 'ArrowDown'))
    const stride =
      !cafe.laptopFocus && (side || forward) ? walk(cafe, side, forward, dt) : 0
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
    if (!reduceMotion.matches) {
      bookLeaf?.getAnimations().forEach((animation) => animation.cancel())
      bookLeaf?.animate(
        [
          { transform: `rotateY(${direction * -72}deg)`, opacity: 0.64 },
          { transform: 'rotateY(0)', opacity: 1 },
        ],
        { duration: 360, easing: 'ease-out' },
      )
    }
    if (cafe.props.reading === 'Field notes')
      view.animate('notebook', performance.now())
    requestDraw()
  }

  function focusedTarget() {
    return view.focused() ?? propIds.find((id) => inReach(cafe, id))
  }

  function interact(id: PropId, opener = buttons.get(id)) {
    if (failed || reader.open || !inReach(cafe, id)) return
    if (id === 'laptop') cafe.laptopFocus = false
    const result = useProp(cafe, id)
    if (result) {
      placing = undefined
      write(feedback, result)
      if (id === 'water' || id === 'cat') view.animate(id, performance.now())
    }
    if (cafe.props.reading) openReader(opener)
    requestDraw()
  }

  atlasButton.addEventListener('click', () => {
    if (cafe.props.shelfBook.kind !== 'carried') return
    cafe.props.reading = cafe.props.shelfBook.book
    openReader(atlasButton)
  })
  sipButton.addEventListener('click', () => {
    const result = sip(cafe.props)
    if (result) write(feedback, result)
    if (
      cafe.props.water.kind === 'carried' &&
      cafe.props.water.level === 'empty'
    )
      placeButtons.cup.focus()
    requestDraw()
  })
  for (const item of ['cup', 'atlas'] as const) {
    placeButtons[item].addEventListener('click', () => {
      placing = placing === item ? undefined : item
      write(feedback, '')
      requestDraw()
    })
  }
  function place(event?: PointerEvent) {
    if (!placing) return
    const spot = view.findPlacement(cafe, placing, event)
    const result = spot && putDown(cafe, placing, spot)
    if (result) {
      const pickup = buttons.get(placing)
      if (pickup) {
        pickup.hidden = false
        write(pickup, label(cafe.props, placing))
        pickup.focus()
      }
      placing = undefined
    }
    write(feedback, result ?? 'Choose a clear surface within reach.')
    requestDraw()
  }
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

  function toggleSeat(chairIndex?: number) {
    if (failed) return
    keys.clear()
    touchKeys.clear()
    cafe.crouched = false
    cafe.laptopFocus = false
    changePosture(cafe, chairIndex)
    requestDraw()
  }

  function toggleCrouch() {
    if (cafe.visitor.kind === 'seated' || cafe.laptopFocus) return
    cafe.crouched = !cafe.crouched
    requestDraw()
  }

  function toggleLaptopFocus() {
    if (
      !cafe.laptopFocus &&
      (!cafe.props.laptopOpen || !inReach(cafe, 'laptop'))
    )
      return
    if (cafe.laptopFocus) {
      cafe.laptopFocus = false
      cafe.view = viewBeforeFocus
    } else {
      viewBeforeFocus = cafe.view
      cafe.laptopFocus = true
      cafe.view = 'first-person'
    }
    keys.clear()
    touchKeys.clear()
    requestDraw()
  }

  crouchButton.addEventListener('click', toggleCrouch)
  laptopFocusButton.addEventListener('click', toggleLaptopFocus)
  viewSwitch.addEventListener('click', () => {
    cafe.laptopFocus = false
    cafe.view = cafe.view === 'pixel' ? 'first-person' : 'pixel'
    drag = undefined
    keys.clear()
    touchKeys.clear()
    requestDraw()
  })
  seatButton.addEventListener('click', () => toggleSeat())
  element('orbit-left', HTMLButtonElement).addEventListener('click', () =>
    orbit(-Math.PI / 4),
  )
  element('orbit-right', HTMLButtonElement).addEventListener('click', () =>
    orbit(Math.PI / 4),
  )
  zoomPixel.addEventListener('click', () => {
    cafe.pixelZoom = !cafe.pixelZoom
    zoomPixel.setAttribute('aria-pressed', String(cafe.pixelZoom))
    zoomPixel.setAttribute(
      'aria-label',
      cafe.pixelZoom ? 'Zoom out' : 'Zoom in',
    )
    write(zoomPixel, cafe.pixelZoom ? '−' : '+')
    requestDraw()
  })

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
      if (
        (event.code === 'KeyQ' || event.code === 'KeyE') &&
        !cafe.laptopFocus
      ) {
        const direction = event.code === 'KeyQ' ? -1 : 1
        if (cafe.view === 'pixel') orbit((direction * Math.PI) / 4)
        else turn((direction * -Math.PI) / 8)
        requestDraw()
      }
      if (event.code === 'KeyX') toggleCrouch()
      if (event.code === 'Escape' && cafe.laptopFocus) toggleLaptopFocus()
      if (event.code === 'KeyF') {
        if (placing) place()
        else {
          const id = focusedTarget()
          if (id) interact(id)
        }
      }
      if (event.code === 'Escape' && placing) {
        placing = undefined
        write(feedback, '')
        requestDraw()
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
    else if (!cafe.laptopFocus) turn(-dx * 0.006, -dy * 0.006)
    requestDraw()
  })
  view.canvas.addEventListener('pointerup', (event) => {
    if (drag?.id !== event.pointerId) return
    if (drag.distance < 5) {
      if (cafe.laptopFocus) {
        view.useScreen(event)
        requestDraw()
      } else if (placing) place(event)
      else {
        const id = view.pick(event)
        if (id === 'laptop' && cafe.props.laptopOpen) toggleLaptopFocus()
        else if (id) interact(id)
        else {
          const chair = view.pickChair(event)
          if (chair !== undefined && cafe.visitor.kind === 'walking')
            toggleSeat(chair)
        }
      }
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
