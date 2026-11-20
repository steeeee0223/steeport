import { books, isBookSlot, screenBooks } from './books'
import {
  type Cafe,
  atSeat,
  changePosture,
  initialCafe,
  location,
  walk,
} from './cafe'
import { cafeMusic } from './cafe-music'
import { controlPrompts } from './control-prompts'
import {
  type Book,
  type Placeable,
  type PropId,
  bookPage,
  inReach,
  label,
  propIds,
  putDown,
  sip,
  turnPage,
  useProp,
} from './props'
import './reader.css'
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
const preview = element('preview', HTMLImageElement)
const sceneNotice = element('scene-notice', HTMLElement)
const fallbackActions = element('fallback-actions', HTMLElement)
const fallbackBook = element('fallback-book', HTMLButtonElement)
const message = element('scene-message', HTMLElement)
const settingsToggle = element('settings-toggle', HTMLButtonElement)
const settingsMenu = element('settings-menu', HTMLElement)
const musicButton = element('music', HTMLButtonElement)
const viewSwitch = element('view-switch', HTMLButtonElement)
const crouchButton = element('crouch', HTMLButtonElement)
const laptopFocusButton = element('laptop-focus', HTMLButtonElement)
const screenControls = element('screen-controls', HTMLElement)
const seatButton = element('seat', HTMLButtonElement)
const hud = element('room-hud', HTMLElement)
const touchPad = element('touch-pad', HTMLElement)
const orbitControls = element('orbit-controls', HTMLElement)
const orbitLeft = element('orbit-left', HTMLButtonElement)
const orbitRight = element('orbit-right', HTMLButtonElement)
const zoomPixel = element('zoom-pixel', HTMLButtonElement)
const viewLabel = element('view-label', HTMLElement)
const locationText = element('location-text', HTMLElement)
const touch = matchMedia('(any-pointer: coarse)')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
const feedback = element('feedback', HTMLElement)
const propActions = element('prop-actions', HTMLElement)
const cupState = element('cup-state', HTMLElement)
const sipButton = element('sip', HTMLButtonElement)
const atlasButton = element('read-atlas', HTMLButtonElement)
const placeButtons = {
  cup: element('place-cup', HTMLButtonElement),
  atlas: element('place-atlas', HTMLButtonElement),
}
const confirmPlacement = element('confirm-placement', HTMLButtonElement)
const cancelPlacement = element('cancel-placement', HTMLButtonElement)
const televisionControls = element('television-controls', HTMLElement)
const leaveTelevisionButton = element('leave-television', HTMLButtonElement)
const pauseFilmButton = element('pause-film', HTMLButtonElement)
const nextFilmButton = element('next-film', HTMLButtonElement)
const reader = element('reader', HTMLDialogElement)
const bookTitle = element('book-title', HTMLElement)
const bookText = element('book-page', HTMLElement)
const bookTurn = element('book-turn', HTMLElement)
const turningText = element('turning-text', HTMLElement)
const turningTitle = element('turning-title', HTMLElement)
const pageNumber = element('page-number', HTMLElement)
const previousPage = element('previous-page', HTMLButtonElement)
const nextPage = element('next-page', HTMLButtonElement)
const shareBook = element('share-book', HTMLAnchorElement)
const closeBook = element('close-book', HTMLButtonElement)
const cafe = initialCafe

let failed = false
let dispose: (() => void) | undefined
let bookOpener: HTMLElement | undefined
let pageTurn: { animation: Animation; direction: -1 | 1 } | undefined
let updateReadingScene: ((direction?: -1 | 1) => void) | undefined

function write(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value
}

function showFallback() {
  failed = true
  preview.hidden = false
  hud.hidden = cupState.hidden = true
  if (reader.open) reader.close()
  televisionControls.hidden = true
  dispose?.()
  settingsToggle.hidden = settingsMenu.hidden = true
  settingsToggle.setAttribute('aria-expanded', 'false')
  viewSwitch.disabled = true
  viewport.querySelector('canvas')?.remove()
  viewLabel.textContent = '01 / BLENDER STUDY'
  locationText.textContent = 'Window seat'
  sceneNotice.hidden = fallbackActions.hidden = false
  message.textContent = 'The interactive room is unavailable.'
  feedback.textContent = ''
}

function renderEntry(entry: HTMLElement, book: Book, page: number) {
  const chapter = books[book]?.chapters[page]
  if (!chapter) return
  const body = document.createElement('div')
  // The build renders Markdown with raw HTML disabled.
  body.innerHTML = chapter.html
  const children: Node[] = []
  if (chapter.date) {
    const date = document.createElement('time')
    date.dateTime = chapter.date
    date.textContent = chapter.date.replaceAll('-', '.')
    children.push(date)
  }
  if (chapter.title) {
    const heading = document.createElement('h3')
    heading.textContent = chapter.title
    children.push(heading)
  }
  entry.replaceChildren(...children, body)
  entry.toggleAttribute(
    'data-illustrated',
    Boolean(children.length || body.querySelector('figure')),
  )
  entry.scrollTop = 0
}

function updateReader(visiblePage = bookPage(cafe.props)) {
  const slot = cafe.props.reading
  const book = slot && books[slot]
  if (!book) return
  const page = bookPage(cafe.props)
  reader.dataset.binding = slot
  write(bookTitle, book.title)
  reader.lang = book.language
  renderEntry(bookText, slot, visiblePage)
  const chapter = book.chapters[page]
  shareBook.href = chapter ? `${book.url}#${chapter.id}` : book.url
  write(pageNumber, `${page + 1} / ${book.chapters.length}`)
  previousPage.setAttribute('aria-disabled', String(page === 0))
  nextPage.setAttribute(
    'aria-disabled',
    String(page === book.chapters.length - 1),
  )
}

function openReader(opener: HTMLElement | undefined) {
  if (reader.open) return
  bookOpener = opener
  updateReader()
  reader.showModal()
  closeBook.focus()
  updateReadingScene?.()
}

function flip(direction: -1 | 1) {
  const book = cafe.props.reading
  if (!book) return
  const content = books[book]
  if (!content) return
  const before = bookPage(cafe.props)
  if (!content.chapters[before + direction]) return
  stopPageTurn()
  const scrollTop = bookText.scrollTop
  turnPage(cafe.props, direction, content.chapters.length)
  const after = bookPage(cafe.props)
  const animate = !reduceMotion.matches
  updateReader(animate && direction === -1 ? before : after)
  if (animate) {
    renderEntry(turningText, book, direction === 1 ? before : after)
    write(turningTitle, content.title)
    bookTurn.hidden = false
    if (direction === 1) turningText.scrollTop = scrollTop
    else bookText.scrollTop = scrollTop
    const rest = 'rotateY(0deg)'
    const lifted = 'rotateY(var(--book-angle))'
    const swing = direction === 1 ? [rest, lifted] : [lifted, rest]
    const animation = bookTurn.animate(
      swing.map((transform) => ({ transform })),
      {
        duration: 520,
        easing: 'cubic-bezier(0.44, 0.07, 0.24, 1)',
        fill: 'both',
      },
    )
    pageTurn = { animation, direction }
    animation.onfinish = () => {
      if (pageTurn?.animation === animation) stopPageTurn()
    }
  }
  updateReadingScene?.(direction)
}

function stopPageTurn() {
  if (!pageTurn) return
  const { animation, direction } = pageTurn
  bookTurn.hidden = true
  animation.cancel()
  pageTurn = undefined
  if (reader.open && direction === -1) updateReader()
}

closeBook.addEventListener('click', () => reader.close())
function outsideBook(event: MouseEvent) {
  if (event.target !== reader) return false
  const bounds = reader.getBoundingClientRect()
  return (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
}
let backdropPress = false
reader.addEventListener('pointerdown', (event) => {
  if (event.button === 0 && event.isPrimary) backdropPress = outsideBook(event)
})
reader.addEventListener('pointercancel', () => (backdropPress = false))
reader.addEventListener('click', (event) => {
  if (event.detail > 0 && backdropPress && outsideBook(event)) reader.close()
  backdropPress = false
})
reader.addEventListener('close', () => {
  if (reader.open) return
  stopPageTurn()
  cafe.props.reading = null
  bookOpener?.focus()
  bookOpener = undefined
  updateReadingScene?.()
})
previousPage.addEventListener('click', () => flip(-1))
nextPage.addEventListener('click', () => flip(1))
reader.addEventListener('keydown', (event) => {
  if (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
  ) {
    event.preventDefault()
    if (!event.repeat) flip(event.key === 'ArrowLeft' ? -1 : 1)
  }
})
reduceMotion.addEventListener('change', () => {
  if (reduceMotion.matches) stopPageTurn()
})

fallbackBook.hidden = !books.notebook
fallbackBook.textContent = books.notebook?.title ?? ''
fallbackBook.lang = books.notebook?.language ?? 'en'
fallbackBook.addEventListener('click', () => {
  cafe.props.reading = 'notebook'
  openReader(fallbackBook)
})

async function start() {
  const { loadView } = await import('./view')
  const prompts = controlPrompts()
  const buttons = new Map<PropId, HTMLButtonElement>()
  for (const id of propIds) {
    const button = document.createElement('button')
    button.type = 'button'
    prompts.add(button, () => interact(id, button))
    propActions.append(button)
    buttons.set(id, button)
  }
  const view = await loadView(viewport, showFallback, requestDraw)
  if (failed) return
  const screenButtons = new Map<Book | null, HTMLButtonElement>()
  for (const title of [null, ...screenBooks]) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = title ? (books[title]?.title ?? '') : 'Shelf index'
    prompts.add(button, () => {
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
  let wake: number | undefined
  let previousTime = 0
  let placing: Placeable | undefined
  let televisionOpener: HTMLElement | undefined
  let feedbackTimer: number | undefined
  let drag: { id: number; x: number; y: number; distance: number } | undefined

  function report(value: string) {
    write(feedback, value)
    window.clearTimeout(feedbackTimer)
    if (value)
      feedbackTimer = window.setTimeout(() => write(feedback, ''), 2400)
  }

  function showSettings(open: boolean) {
    settingsMenu.hidden = !open
    settingsToggle.setAttribute('aria-expanded', String(open))
  }

  function closeSettings() {
    if (settingsMenu.hidden) return
    showSettings(false)
    settingsToggle.focus({ preventScroll: true })
  }

  settingsToggle.addEventListener('click', () =>
    showSettings(settingsMenu.hasAttribute('hidden')),
  )

  const music = cafeMusic(
    (state) => {
      musicButton.setAttribute('aria-pressed', String(state !== 'off'))
      if (state === 'loading') musicButton.setAttribute('aria-busy', 'true')
      else musicButton.removeAttribute('aria-busy')
      musicButton.title =
        state === 'off' ? 'Play lo-fi music (M)' : 'Mute lo-fi music (M)'
    },
    () => report('The music is unavailable.'),
  )
  prompts.add(musicButton, () => {
    closeSettings()
    if (cafe.screenFocus?.kind === 'television')
      setFilmSound(!view.television.isAudible())
    else void music.toggle()
  })

  function setFilmSound(audible: boolean) {
    view.television.setAudible(audible)
    musicButton.setAttribute('aria-pressed', String(audible))
    musicButton.title = audible ? 'Mute (M)' : 'Unmute (M)'
  }

  function focusScreen(kind: NonNullable<Cafe['screenFocus']>['kind']) {
    cafe.screenFocus = { kind, returnView: cafe.view }
    cafe.view = 'first-person'
    keys.clear()
    touchKeys.clear()
    drag = undefined
  }

  function watchFilm(opener: HTMLElement | undefined) {
    focusScreen('television')
    televisionOpener = opener
    music.stop()
    setFilmSound(true)
    syncControls()
    leaveTelevisionButton.focus({ preventScroll: true })
    requestDraw()
  }

  function leaveScreen() {
    const focus = cafe.screenFocus
    if (!focus) return
    cafe.screenFocus = undefined
    cafe.view = focus.returnView
    if (focus.kind === 'television') {
      view.television.returnToAmbient()
      musicButton.setAttribute('aria-pressed', 'false')
      musicButton.title = 'Play lo-fi music (M)'
      syncControls()
      televisionOpener?.focus({ preventScroll: true })
      televisionOpener = undefined
    }
    requestDraw()
  }
  prompts.add(leaveTelevisionButton, leaveScreen)
  prompts.add(pauseFilmButton, () => view.television.togglePlayback())
  prompts.add(nextFilmButton, view.television.nextFilm)

  function syncControls() {
    const pixel = cafe.view === 'pixel'
    const seated = cafe.visitor.kind === 'seated'
    const watching = cafe.screenFocus?.kind === 'television'
    const readingLaptop = cafe.screenFocus?.kind === 'laptop'
    const focused = cafe.screenFocus !== undefined
    const exploring = !focused && placing === undefined
    const availableProps = new Set(exploring ? propIds.filter(canUseProp) : [])
    const { water, shelfBook } = cafe.props
    const shelfLabel =
      shelfBook.kind === 'shelved'
        ? 'book'
        : (books[shelfBook.book]?.label ?? 'book')
    prompts.reset()
    prompts.show(viewSwitch, 'KeyV')
    prompts.show(
      musicButton,
      'KeyM',
      watching ? 'Television sound' : 'Lo-fi music',
    )
    prompts.show(orbitLeft, focused ? undefined : 'KeyQ')
    prompts.show(orbitRight, focused ? undefined : 'KeyE')
    prompts.show(zoomPixel, !focused && pixel ? 'KeyZ' : undefined)
    orbitControls.hidden = focused
    touchPad.hidden = !touch.matches || seated || focused

    prompts.show(
      seatButton,
      !focused && atSeat(cafe) ? 'KeyC' : undefined,
      seated ? 'Stand up' : 'Sit down',
    )
    prompts.show(
      crouchButton,
      !focused && !seated ? 'KeyX' : undefined,
      cafe.crouched ? 'Stand upright' : 'Crouch',
    )
    crouchButton.setAttribute('aria-pressed', String(Boolean(cafe.crouched)))
    prompts.show(
      laptopFocusButton,
      readingLaptop
        ? 'Escape'
        : cafe.props.laptopOpen && availableProps.has('laptop')
          ? 'KeyT'
          : undefined,
      readingLaptop ? 'Back to the café' : 'Look at laptop',
    )

    televisionControls.hidden = !watching
    prompts.show(leaveTelevisionButton, watching ? 'Escape' : undefined)
    prompts.show(
      pauseFilmButton,
      watching ? 'Space' : undefined,
      view.television.video.paused ? 'Play film' : 'Pause film',
    )
    prompts.show(nextFilmButton, watching ? 'KeyN' : undefined)
    screenControls.hidden = !readingLaptop
    const selected = readingLaptop ? view.screenSelection() : null
    let screenKey = 1
    for (const [book, button] of screenButtons) {
      prompts.show(button, readingLaptop ? `Digit${screenKey++}` : undefined)
      const pressed = String(book === selected)
      if (button.getAttribute('aria-pressed') !== pressed)
        button.setAttribute('aria-pressed', pressed)
    }

    viewport.classList.toggle('placing', placing !== undefined)
    const pressed = String(pixel)
    if (viewSwitch.getAttribute('aria-pressed') !== pressed)
      viewSwitch.setAttribute('aria-pressed', pressed)
    write(viewLabel, pixel ? '02 / PIXEL ROOM' : '01 / FIRST PERSON')
    write(locationText, location(cafe.visitor))
    const target = view.focused(cafe, availableProps)
    let alternative = 1
    for (const [id, button] of buttons) {
      const bookName = isBookSlot(id)
        ? books[id]?.label
        : id === 'atlas'
          ? shelfLabel
          : undefined
      const name = label(cafe.props, id, bookName ?? 'book')
      const usable = availableProps.has(id)
      const key = id === target ? 'KeyF' : `Digit${alternative}`
      prompts.show(button, usable ? key : undefined, name)
      if (usable && id !== target) alternative++
    }
    const carriesBook = exploring && shelfBook.kind === 'carried'
    const carriesCup = exploring && water.kind === 'carried'
    prompts.show(
      atlasButton,
      carriesBook ? 'KeyR' : undefined,
      'Read ' + shelfLabel,
    )
    prompts.show(
      placeButtons.atlas,
      carriesBook ? 'KeyB' : undefined,
      'Put down ' + shelfLabel,
    )
    prompts.show(placeButtons.cup, carriesCup ? 'KeyG' : undefined)
    prompts.show(
      sipButton,
      carriesCup && water.level !== 'empty' ? 'KeyH' : undefined,
    )
    prompts.show(confirmPlacement, placing ? 'KeyF' : undefined)
    prompts.show(cancelPlacement, placing ? 'Escape' : undefined)
    cupState.hidden = focused || water.kind !== 'carried'
    write(
      cupState,
      water.kind === 'carried' && water.level === 'full'
        ? 'Full cup'
        : water.kind === 'carried' && water.level === 'half'
          ? 'Half-full cup'
          : 'Empty cup',
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
    window.clearTimeout(wake)
    if (!frame && !failed && !document.hidden)
      frame = requestAnimationFrame(draw)
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
      !cafe.screenFocus && (side || forward) ? walk(cafe, side, forward, dt) : 0
    viewport.classList.toggle('pixel', cafe.view === 'pixel')
    const { moving, wakeAt } = view.draw(
      cafe,
      time,
      dt,
      stride,
      reduceMotion.matches,
    )
    syncControls()

    if (keys.size || touchKeys.size || moving) {
      previousTime = time
      requestDraw()
    } else {
      previousTime = 0
      if (Number.isFinite(wakeAt))
        wake = window.setTimeout(
          requestDraw,
          Math.max(1, wakeAt - performance.now()),
        )
    }
  }

  function orbit(radians: number) {
    if (cafe.view !== 'pixel') return
    cafe.orbit = (cafe.orbit + radians) % (Math.PI * 2)
    requestDraw()
  }

  function openSceneReader(opener: HTMLElement | undefined) {
    keys.clear()
    touchKeys.clear()
    openReader(opener)
  }

  function canUseProp(id: PropId) {
    const water = cafe.props.water
    return (
      (!isBookSlot(id) || books[id] !== undefined) &&
      inReach(cafe, id) &&
      !(id === 'water' && water.kind === 'carried' && water.level === 'full') &&
      view.canSee(cafe, id)
    )
  }

  function interact(id: PropId, opener = buttons.get(id)) {
    if (failed || reader.open || cafe.screenFocus || placing || !canUseProp(id))
      return
    if (id === 'television') {
      watchFilm(opener)
      return
    }
    const result = useProp(cafe, id)
    if (result) {
      placing = undefined
      report(result)
      if (id === 'water' || id === 'cat') view.animate(id, performance.now())
    }
    if (cafe.props.reading) openSceneReader(opener)
    requestDraw()
  }

  prompts.add(atlasButton, () => {
    if (cafe.props.shelfBook.kind !== 'carried') return
    cafe.props.reading = cafe.props.shelfBook.book
    openSceneReader(atlasButton)
  })
  prompts.add(sipButton, () => {
    const result = sip(cafe.props)
    if (result) {
      report(result)
      view.sip(performance.now())
    }
    if (
      cafe.props.water.kind === 'carried' &&
      cafe.props.water.level === 'empty'
    )
      placeButtons.cup.focus()
    requestDraw()
  })
  for (const item of ['cup', 'atlas'] as const) {
    prompts.add(placeButtons[item], () => {
      placing = item
      report('')
      syncControls()
      confirmPlacement.focus({ preventScroll: true })
      requestDraw()
    })
  }
  prompts.add(confirmPlacement, () => place())
  prompts.add(cancelPlacement, () => {
    const item = placing
    if (!item) return
    placing = undefined
    report('')
    syncControls()
    placeButtons[item].focus({ preventScroll: true })
    requestDraw()
  })
  function place(event?: PointerEvent) {
    if (!placing) return
    const spot = view.findPlacement(cafe, placing, event)
    const result = spot && putDown(cafe, placing, spot)
    if (result) {
      const pickup = buttons.get(placing)
      placing = undefined
      syncControls()
      pickup?.focus({ preventScroll: true })
    }
    report(result ?? 'Choose a clear surface within reach.')
    requestDraw()
  }
  function toggleSeat(chairIndex?: number) {
    if (failed || cafe.screenFocus) return
    keys.clear()
    touchKeys.clear()
    cafe.crouched = false
    changePosture(cafe, chairIndex)
    requestDraw()
  }

  function toggleCrouch() {
    if (cafe.visitor.kind === 'seated' || cafe.screenFocus) return
    cafe.crouched = !cafe.crouched
    requestDraw()
  }

  function toggleLaptopFocus() {
    if (cafe.screenFocus?.kind === 'laptop') return leaveScreen()
    if (cafe.screenFocus || !cafe.props.laptopOpen || !canUseProp('laptop'))
      return
    focusScreen('laptop')
    requestDraw()
  }

  prompts.add(crouchButton, toggleCrouch)
  prompts.add(laptopFocusButton, toggleLaptopFocus)
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Node)) return
    if (settingsToggle.contains(target) || settingsMenu.contains(target)) return
    if (!settingsMenu.hidden) showSettings(false)
    if (
      cafe.screenFocus?.kind === 'laptop' &&
      target !== view.canvas &&
      !screenControls.contains(target) &&
      !laptopFocusButton.contains(target)
    )
      leaveScreen()
  })
  prompts.add(viewSwitch, () => {
    closeSettings()
    leaveScreen()
    cafe.view = cafe.view === 'pixel' ? 'first-person' : 'pixel'
    drag = undefined
    keys.clear()
    touchKeys.clear()
    syncControls()
    requestDraw()
  })
  prompts.add(seatButton, () => toggleSeat())
  function turnCamera(direction: -1 | 1) {
    if (cafe.view === 'pixel') orbit((direction * Math.PI) / 4)
    else turn((direction * -Math.PI) / 8)
    requestDraw()
  }
  prompts.add(orbitLeft, () => turnCamera(-1))
  prompts.add(orbitRight, () => turnCamera(1))
  prompts.add(zoomPixel, () => {
    cafe.pixelZoom = !cafe.pixelZoom
    zoomPixel.setAttribute('aria-pressed', String(cafe.pixelZoom))
    zoomPixel.setAttribute(
      'aria-label',
      cafe.pixelZoom ? 'Zoom out' : 'Zoom in',
    )
    requestDraw()
  })

  window.addEventListener('keydown', (event) => {
    if (!settingsMenu.hidden && event.code === 'Escape') {
      event.preventDefault()
      closeSettings()
      return
    }
    if (
      failed ||
      (reader.open && event.code !== 'KeyM') ||
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
    if (
      movementKeys.has(event.code) &&
      !cafe.screenFocus &&
      cafe.visitor.kind === 'walking'
    ) {
      event.preventDefault()
      keys.add(event.code)
      requestDraw()
    } else if (!event.repeat && prompts.activate(event.code)) {
      event.preventDefault()
      syncControls()
    }
  })
  window.addEventListener('keyup', (event) => keys.delete(event.code))
  window.addEventListener('blur', () => {
    keys.clear()
    touchKeys.clear()
    drag = undefined
  })
  document.addEventListener('visibilitychange', () => {
    if (failed) return
    view.television.setActive(!document.hidden)
    if (document.hidden) {
      keys.clear()
      touchKeys.clear()
      drag = undefined
      cancelAnimationFrame(frame)
      window.clearTimeout(wake)
      previousTime = frame = 0
    } else {
      requestDraw()
    }
  })

  // A moving action row can cross the finger before a held direction ends.
  touchPad.addEventListener('touchend', (event) => event.preventDefault(), {
    passive: false,
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
    else if (!cafe.screenFocus) turn(-dx * 0.006, -dy * 0.006)
    requestDraw()
  })
  view.canvas.addEventListener('pointerup', (event) => {
    if (drag?.id !== event.pointerId) return
    if (drag.distance < 5) {
      if (cafe.screenFocus?.kind === 'television') {
        if (!view.useTelevision(event)) leaveScreen()
      } else if (cafe.screenFocus?.kind === 'laptop') {
        if (view.useScreen(event)) requestDraw()
        else leaveScreen()
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
  updateReadingScene = (direction) => {
    if (direction !== undefined && cafe.props.reading === 'notebook')
      view.turnNotebook(direction, performance.now())
    requestDraw()
  }
  dispose = () => {
    updateReadingScene = undefined
    cancelAnimationFrame(frame)
    window.clearTimeout(wake)
    window.clearTimeout(feedbackTimer)
    music.stop()
    resize.disconnect()
    touch.removeEventListener('change', requestDraw)
    reduceMotion.removeEventListener('change', requestDraw)
    view.dispose()
  }
  draw(performance.now())
  view.television.start()
  view.television.setActive(!document.hidden)
  preview.hidden = sceneNotice.hidden = true
  hud.hidden = settingsToggle.hidden = viewSwitch.disabled = false
}

void start().catch((error: unknown) => {
  if (import.meta.env.DEV) console.error('Could not open the café', error)
  showFallback()
})
