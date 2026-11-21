import {
  type Annex,
  type BuildCamera,
  type BuildPreview,
  type BuildTool,
  type QuarterTurn,
  annexEntry,
  annexSize,
  canAttachRoom,
  cellEdges,
  cellPoint,
  crossedFloorCells,
  crossedWallEdges,
  entryEdge,
  furnitureAt,
  furnitureProposal,
  furnitureTurns,
  furnitureTypes,
  isBuildTool,
  isEdgeTool,
  isFurniture,
  loadAnnex,
  pointCell,
  prepareBuild,
  saveAnnex,
  turnFurniture,
} from './annex'
import { type AnnexFixture } from './annex-visuals'
import { books, isBookSlot, screenBooks } from './books'
import {
  type Cafe,
  advanceJump,
  annexSeat,
  atSeat,
  canKeepVisitor,
  changePosture,
  initialCafe,
  location,
  toggleAnnexDoor,
  walk,
} from './cafe'
import { cafeMusic } from './cafe-music'
import { controlPrompts } from './control-prompts'
import {
  type Book,
  type Placeable,
  type PropId,
  bookPage,
  doorLabel,
  inReach,
  label,
  lampLabel,
  lampMessage,
  propIds,
  putDown,
  sip,
  turnPage,
  useProp,
} from './props'
import './reader.css'
import './style.css'
import { type Point, type Seat, position } from './visitor'

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
const controlsButton = element('show-controls', HTMLButtonElement)
const controlsDialog = element('controls-dialog', HTMLDialogElement)
const controlsTitle = element('controls-title', HTMLHeadingElement)
const musicButton = element('music', HTMLButtonElement)
const viewSwitch = element('view-switch', HTMLButtonElement)
const buildToggle = element('build-mode', HTMLButtonElement)
const buildHud = element('build-hud', HTMLElement)
const buildFeedback = element('build-feedback', HTMLElement)
const buildCameraControls = element('build-camera', HTMLElement)
const buildCatalog = element('build-tools', HTMLElement)
const undoBuild = element('undo-build', HTMLButtonElement)
const doneBuilding = element('done-building', HTMLButtonElement)
const rotationControls = element('furniture-rotation', HTMLElement)
const turnItemLeft = element('turn-item-left', HTMLButtonElement)
const turnItemRight = element('turn-item-right', HTMLButtonElement)
const itemAngle = element('item-angle', HTMLElement)
const categories = buildHud.querySelectorAll<HTMLButtonElement>(
  '[data-build-category]',
)
const cameraButtons =
  buildCameraControls.querySelectorAll<HTMLButtonElement>('[data-camera]')
const floorHint = 'Drag over the grid to lay floor tiles.'
const wallBrushHint =
  'Drag along grid edges to place walls. Press R to cycle edges with the keyboard.'
const wallHint = 'Pick a grid edge. Press R to cycle edges with the keyboard.'
const eraseFloorHint = 'Drag across floor tiles to remove them.'
const toolHints: Partial<Record<BuildTool, string>> = {
  floor: floorHint,
  'erase-floor': eraseFloorHint,
  wall: wallBrushHint,
  door: wallHint,
  'erase-wall': wallHint,
  shelf: 'Choose a clear row of four floor tiles for the bookshelf.',
  remove: 'Select a piece of furniture to remove.',
  rotate: 'Select furniture to apply the previewed rotation.',
}
const structureTools = {
  floor: { label: 'Floor', icon: 'grid-2x2' },
  wall: { label: 'Wall', icon: 'brick-wall' },
  door: { label: 'Door', icon: 'door-open' },
  'erase-floor': { label: 'Erase floor', icon: 'eraser' },
  'erase-wall': { label: 'Erase wall or door', icon: 'eraser' },
  room: { label: 'Attach room', icon: 'square-dashed-plus' },
}
const catalog = {
  ...structureTools,
  ...furnitureTypes,
  remove: { label: 'Remove', icon: 'eraser' },
  rotate: { label: 'Rotate item', icon: 'rotate-cw' },
}
const buildShortcuts: readonly BuildTool[] = [
  'floor',
  'door',
  'shelf',
  'desk',
  'lamp',
  'remove',
]
const cameraShortcuts = new Map([
  ['KeyQ', 'left'],
  ['KeyE', 'right'],
  ['Minus', 'out'],
  ['NumpadSubtract', 'out'],
  ['Equal', 'in'],
  ['NumpadAdd', 'in'],
  ['Home', 'reset'],
  ['Digit7', 'pan'],
])
const buildTools = new Map<string, HTMLButtonElement>()
for (const [tool, item] of Object.entries(catalog)) {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = item.label
  button.setAttribute('aria-label', item.label)
  const shortcut = buildShortcuts.findIndex((key) => key === tool) + 1
  if (shortcut) button.setAttribute('aria-keyshortcuts', String(shortcut))
  const icon = document.createElement('i')
  icon.dataset.lucide = item.icon
  icon.setAttribute('aria-hidden', 'true')
  const label = document.createElement('span')
  label.textContent =
    tool === 'remove'
      ? 'Remove item'
      : tool === 'erase-wall'
        ? 'Erase edge'
        : item.label
  button.append(icon, label)
  buildTools.set(tool, button)
  buildCatalog.append(button)
}
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
  buildHud.hidden = buildCameraControls.hidden = true
  if (reader.open) reader.close()
  if (controlsDialog.open) controlsDialog.close()
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
  cafe.annex = loadAnnex()
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
  const fixtureActions: {
    button: HTMLButtonElement
    fixture?: AnnexFixture
  }[] = []
  const keys = new Set<string>()
  let shiftHeld = false
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
  let building:
    | {
        previousView: Cafe['view']
        tool: BuildTool
        cell: number
        edge: number
        side: number
        turns?: QuarterTurn
        camera: BuildCamera
        pan: boolean
      }
    | undefined
  type Builder = NonNullable<typeof building>
  let cachedBuildSelection:
    | {
        annex: Annex
        turns?: QuarterTurn
        visitorKind: Cafe['visitor']['kind']
        seat?: Seat
        point: Point
        closedDoors: number[]
        selection: NonNullable<BuildPreview['selection']>
      }
    | undefined
  let buildGesture:
    | {
        kind: 'paint'
        tool: 'floor' | 'erase-floor' | 'wall'
        id: number
        before: Annex
        last?: Point
        count: number
        message: string
      }
    | { kind: 'pan' | 'place'; id: number; pointer: PointerEvent }
    | undefined
  const buildTouches = new Map<number, PointerEvent>()
  let pinching = false
  const buildHistory: Annex[] = []
  const sceneLabel = view.canvas.getAttribute('aria-label') ?? 'Café view'

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

  controlsButton.addEventListener('click', () => {
    closeSettings()
    keys.clear()
    touchKeys.clear()
    drag = undefined
    controlsDialog.showModal()
    controlsTitle.focus({ preventScroll: true })
    syncControls()
    requestDraw()
  })
  controlsDialog.addEventListener('close', () =>
    settingsToggle.focus({ preventScroll: true }),
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
    cafe.jumpTime = undefined
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
    const watching = cafe.screenFocus?.kind === 'television'
    prompts.reset()
    prompts.show(viewSwitch, building ? undefined : 'KeyV')
    prompts.show(
      musicButton,
      'KeyM',
      watching ? 'Television sound' : 'Lo-fi music',
    )
    const focused = cafe.screenFocus !== undefined
    const walking = cafe.visitor.kind === 'walking'
    const touchShortcuts = touch.matches && !focused && !building
    orbitControls.hidden = !touchShortcuts
    zoomPixel.hidden = !touchShortcuts || cafe.view !== 'pixel'
    crouchButton.hidden =
      !touchShortcuts || !walking || cafe.jumpTime !== undefined
    crouchButton.setAttribute('aria-pressed', String(Boolean(cafe.crouched)))
    crouchButton.setAttribute(
      'aria-label',
      cafe.crouched ? 'Stand upright' : 'Crouch',
    )
    if (building) {
      write(viewLabel, '03 / BUILD MODE')
      write(locationText, 'Reading room')
      return
    }
    const pixel = cafe.view === 'pixel'
    const seated = cafe.visitor.kind === 'seated'
    const readingLaptop = cafe.screenFocus?.kind === 'laptop'
    const exploring = !focused && placing === undefined
    const availableProps = new Set(exploring ? propIds.filter(canUseProp) : [])
    const nearbyFixtures = exploring ? view.nearbyAnnex(cafe) : []
    const { water, shelfBook } = cafe.props
    const shelfLabel =
      shelfBook.kind === 'shelved'
        ? 'book'
        : (books[shelfBook.book]?.label ?? 'book')
    touchPad.hidden = !touch.matches || seated || focused

    prompts.show(
      seatButton,
      !focused &&
        (atSeat(cafe) ||
          nearbyFixtures.some(({ fixture }) => fixture.kind === 'seat'))
        ? 'KeyC'
        : undefined,
      seated ? 'Stand up' : 'Sit down',
    )
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
    const nearbyObjects = nearbyFixtures.filter(
      ({ fixture }) => fixture.kind !== 'seat',
    )
    let focusedObject = target === undefined
    for (const [index, { fixture, facing }] of nearbyObjects.entries()) {
      let action = fixtureActions[index]
      if (!action) {
        const button = document.createElement('button')
        button.type = 'button'
        const slot: (typeof fixtureActions)[number] = { button, fixture }
        prompts.add(button, () => {
          if (slot.fixture) interactAnnex(slot.fixture)
        })
        propActions.append(button)
        fixtureActions.push(slot)
        action = slot
      }
      action.fixture = fixture
      const useF = facing && focusedObject
      const code = useF
        ? 'KeyF'
        : alternative <= 9
          ? `Digit${alternative++}`
          : undefined
      if (useF) focusedObject = false
      const name =
        fixture.kind === 'door'
          ? doorLabel(!cafe.closedAnnexDoors.has(fixture.target))
          : lampLabel(cafe.litAnnexLamps.has(fixture.target))
      prompts.show(action.button, code, name)
    }
    for (const action of fixtureActions.slice(nearbyObjects.length)) {
      action.fixture = undefined
      prompts.show(action.button)
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
    const exploring =
      !building && !cafe.screenFocus && !controlsDialog.open && !reader.open
    cafe.running = exploring && !cafe.crouched && shiftHeld
    advanceJump(cafe, dt)
    const stride =
      exploring && (side || forward) ? walk(cafe, side, forward, dt) : 0
    const preview = buildPreview()
    viewport.classList.toggle('pixel', cafe.view === 'pixel')
    const { moving, wakeAt } = view.draw(
      cafe,
      time,
      dt,
      stride,
      reduceMotion.matches,
      preview,
    )
    syncControls()

    if (
      (exploring && (side || forward)) ||
      cafe.jumpTime !== undefined ||
      moving
    ) {
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

  function interactAnnex(fixture: AnnexFixture) {
    if (
      failed ||
      building ||
      controlsDialog.open ||
      reader.open ||
      cafe.screenFocus ||
      placing ||
      !view.canUseAnnex(cafe, fixture)
    )
      return
    const { kind, target } = fixture
    if (kind === 'seat') {
      const item = furnitureAt(cafe.annex, target)
      const seat = item && annexSeat(cafe.annex, item)
      if (seat) toggleSeat(seat)
      return
    }
    if (kind === 'door') report(toggleAnnexDoor(cafe, target))
    else {
      const on = !cafe.litAnnexLamps.delete(target)
      if (on) cafe.litAnnexLamps.add(target)
      report(lampMessage(on))
    }
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
  function toggleSeat(target?: Parameters<typeof changePosture>[1]) {
    if (failed || cafe.screenFocus || cafe.jumpTime !== undefined) return
    if (target === undefined && !atSeat(cafe)) {
      const nearby = view
        .nearbyAnnex(cafe)
        .find(({ fixture }) => fixture.kind === 'seat')
      if (nearby) return interactAnnex(nearby.fixture)
    }
    keys.clear()
    touchKeys.clear()
    cafe.crouched = false
    changePosture(cafe, target)
    if (cafe.visitor.kind === 'walking')
      view.canvas.focus({ preventScroll: true })
    requestDraw()
  }

  function toggleCrouch() {
    if (
      cafe.visitor.kind !== 'walking' ||
      cafe.screenFocus ||
      building ||
      cafe.jumpTime !== undefined
    )
      return
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

  crouchButton.addEventListener('click', toggleCrouch)
  prompts.add(laptopFocusButton, toggleLaptopFocus)

  function canRotateItem(builder: Builder) {
    return (
      !builder.pan && (isFurniture(builder.tool) || builder.tool === 'rotate')
    )
  }

  function syncBuilder() {
    const category =
      building && Object.hasOwn(structureTools, building.tool)
        ? 'structure'
        : 'furniture'
    const pan = building?.pan ?? false
    undoBuild.disabled = buildHistory.length === 0
    rotationControls.hidden = !building || !canRotateItem(building)
    viewport.classList.toggle('panning', pan)
    for (const button of cameraButtons) {
      if (button.dataset.camera === 'pan')
        button.setAttribute('aria-pressed', String(pan))
    }
    for (const button of categories)
      button.setAttribute(
        'aria-pressed',
        String(category === button.dataset.buildCategory),
      )
    buildCatalog.setAttribute(
      'aria-label',
      category === 'structure' ? 'Structure tools' : 'Furniture tools',
    )
    for (const [tool, button] of buildTools) {
      button.hidden =
        Object.hasOwn(structureTools, tool) !== (category === 'structure')
      if (tool === 'room') button.disabled = !canAttachRoom(cafe.annex)
      else button.setAttribute('aria-pressed', String(building?.tool === tool))
    }
  }

  function selectedBuildTarget(builder: Builder) {
    return isEdgeTool(builder.tool) ? builder.edge : builder.cell
  }

  function buildPreview(): BuildPreview | undefined {
    if (!building) return
    const { camera, pan, tool, turns } = building
    if (pan || buildGesture?.kind === 'pan' || pinching) return { camera }
    const target = selectedBuildTarget(building)
    const { annex, visitor, closedAnnexDoors } = cafe
    const { x, z } = position(visitor)
    const seat = visitor.kind === 'seated' ? visitor.seat : undefined
    const cached = cachedBuildSelection
    if (
      cached?.annex === annex &&
      cached.selection.tool === tool &&
      cached.selection.target === target &&
      cached.turns === turns &&
      cached.visitorKind === visitor.kind &&
      cached.seat === seat &&
      cached.point.x === x &&
      cached.point.z === z &&
      cached.closedDoors.length === closedAnnexDoors.size &&
      cached.closedDoors.every((edge) => closedAnnexDoors.has(edge))
    )
      return { camera, selection: cached.selection }

    const proposal = prepareBuild(annex, tool, target, turns)
    if (canRotateItem(building)) {
      const item = proposal.furniture?.item
      const angle = item ? furnitureTurns(annex, item) : (turns ?? 3)
      write(itemAngle, `${((4 - angle) % 4) * 90}°`)
    }
    const alreadyPainted =
      tool === 'floor'
        ? annex.floor.includes(target)
        : tool === 'wall' &&
          annex.partitions.some(
            ({ edge, kind }) => edge === target && kind === 'wall',
          )
    const selection = {
      tool,
      target,
      furniture: proposal.furniture,
      valid: alreadyPainted || 'annex' in checkBuild(proposal),
    }
    cachedBuildSelection = {
      annex,
      turns,
      visitorKind: visitor.kind,
      seat,
      point: { x, z },
      closedDoors: [...closedAnnexDoors],
      selection,
    }
    return { camera, selection }
  }

  function setBuildCell(cell: number) {
    if (!building) return
    building.cell = cell
    building.edge = cellEdges(cell)[building.side] ?? entryEdge
  }

  function setBuildTarget(tool: BuildTool, target: number) {
    if (!building) return
    if (isEdgeTool(tool)) building.edge = target
    else setBuildCell(target)
  }

  function clearBuildTouches() {
    buildTouches.clear()
    pinching = false
  }

  function setBuilding(open: boolean) {
    closeSettings()
    cachedBuildSelection = undefined
    if (open) {
      leaveScreen()
      cafe.jumpTime = undefined
      placing = undefined
      viewport.classList.remove('placing')
      cupState.hidden = true
      report('')
      building = {
        previousView: cafe.view,
        tool: cafe.annex.pendingShelves > 0 ? 'shelf' : 'floor',
        cell: annexEntry,
        edge: entryEdge,
        side: 0,
        camera: view.initialBuildCamera(),
        pan: false,
      }
      const visitorCell = pointCell(position(cafe.visitor))
      if (visitorCell !== undefined) {
        setBuildCell(visitorCell)
        building.camera = { ...building.camera, center: cellPoint(visitorCell) }
      }
      cafe.view = 'pixel'
      write(
        buildFeedback,
        cafe.annex.pendingShelves > 0
          ? 'Saved bookshelf to place. Choose a clear row of four floor tiles.'
          : floorHint,
      )
      view.canvas.tabIndex = 0
      view.canvas.setAttribute(
        'aria-label',
        'Build plot. Use arrow keys to select a tile, R to pick an edge, then press Enter.',
      )
    } else if (building) {
      finishBuildGesture()
      clearBuildTouches()
      cafe.view = building.previousView
      building = undefined
      view.canvas.tabIndex = -1
      view.canvas.setAttribute('aria-label', sceneLabel)
    }
    buildHud.hidden = buildCameraControls.hidden = !open
    hud.hidden = open
    viewport.classList.toggle('building', open)
    buildToggle.setAttribute('aria-pressed', String(open))
    keys.clear()
    touchKeys.clear()
    drag = undefined
    syncBuilder()
    syncControls()
    if (open) view.canvas.focus({ preventScroll: true })
    else settingsToggle.focus({ preventScroll: true })
    requestDraw()
  }

  function storeBuild(next: Annex, message: string) {
    cafe.annex = next
    for (const edge of cafe.closedAnnexDoors)
      if (
        !next.partitions.some(
          (part) => part.kind === 'door' && part.edge === edge,
        )
      )
        cafe.closedAnnexDoors.delete(edge)
    for (const cell of cafe.litAnnexLamps)
      if (furnitureAt(next, cell)?.kind !== 'lamp')
        cafe.litAnnexLamps.delete(cell)
    write(
      buildFeedback,
      saveAnnex(next)
        ? message
        : message + ' This browser could not save your changes.',
    )
    syncBuilder()
    requestDraw()
  }

  function checkBuild(
    proposal: ReturnType<typeof prepareBuild>,
  ): ReturnType<typeof proposal.apply> {
    const result = proposal.apply(position(cafe.visitor))
    if ('annex' in result && !canKeepVisitor(cafe, result.annex))
      return { message: 'Move your visitor clear of this tile first.' }
    return result
  }

  function useBuildTool(tool: BuildTool | 'room', target: number) {
    if (!building) return
    const result = checkBuild(
      prepareBuild(cafe.annex, tool, target, building.turns),
    )
    if (!('annex' in result)) {
      write(buildFeedback, result.message)
      return
    }
    buildHistory.push(cafe.annex)
    storeBuild(result.annex, result.message)
  }

  function paintBuild(event: PointerEvent) {
    if (!building || buildGesture?.kind !== 'paint') return
    const hit = view.buildGround(building.camera, event)
    if (!hit) {
      buildGesture.last = undefined
      return
    }
    const gesture = buildGesture
    const targets =
      gesture.tool === 'wall'
        ? crossedWallEdges(gesture.last, hit)
        : crossedFloorCells(gesture.last, hit)
    gesture.last = hit
    for (const target of targets) {
      setBuildTarget(gesture.tool, target)
      if (
        gesture.tool !== 'wall' &&
        cafe.annex.floor.includes(target) === (gesture.tool === 'floor')
      )
        continue
      const result = checkBuild(
        prepareBuild(cafe.annex, gesture.tool, target, building.turns),
      )
      if ('annex' in result) {
        cafe.annex = result.annex
        gesture.count++
        gesture.message = result.message
      } else if (gesture.count === 0) {
        gesture.message = result.message
      }
    }
    requestDraw()
  }

  function finishBuildGesture() {
    const gesture = buildGesture
    buildGesture = undefined
    if (!gesture) return
    if (view.canvas.hasPointerCapture(gesture.id))
      view.canvas.releasePointerCapture(gesture.id)
    if (gesture.kind === 'paint') {
      if (gesture.count === 0) {
        write(buildFeedback, gesture.message)
      } else {
        buildHistory.push(gesture.before)
        const summary =
          gesture.tool === 'wall'
            ? ' wall segments placed.'
            : gesture.tool === 'floor'
              ? ' floor tiles placed.'
              : ' floor tiles removed.'
        storeBuild(
          cafe.annex,
          gesture.count === 1 ? gesture.message : gesture.count + summary,
        )
      }
    }
    requestDraw()
  }

  function chooseBuildTool(tool: BuildTool) {
    if (!building) return
    finishBuildGesture()
    building.tool = tool
    building.turns = undefined
    building.pan = false
    const hint =
      toolHints[tool] ??
      'Select floor space for the ' + catalog[tool].label.toLowerCase() + '.'
    write(buildFeedback, hint)
    syncBuilder()
    requestDraw()
  }

  function rotateBuildItem(direction: -1 | 1) {
    if (!building || !canRotateItem(building)) return
    finishBuildGesture()
    const { tool, cell, turns } = building
    const preview =
      isFurniture(tool) &&
      furnitureProposal(cafe.annex, tool, cell, turns)?.item
    const current = preview ? furnitureTurns(cafe.annex, preview) : (turns ?? 0)
    building.turns = turnFurniture(current, direction)
    requestDraw()
  }

  turnItemLeft.addEventListener('click', () => rotateBuildItem(1))
  turnItemRight.addEventListener('click', () => rotateBuildItem(-1))

  function useBuildCamera(action: string) {
    if (!building) return
    finishBuildGesture()
    const camera = building.camera
    switch (action) {
      case 'pan':
        building.pan = !building.pan
        write(
          buildFeedback,
          building.pan
            ? 'Drag to move the camera.'
            : catalog[building.tool].label + ' selected.',
        )
        break
      case 'left':
      case 'right':
        building.camera = {
          ...camera,
          orbit:
            (camera.orbit + ((action === 'left' ? -1 : 1) * Math.PI) / 4) %
            (2 * Math.PI),
        }
        break
      case 'out':
      case 'in':
        building.camera = view.zoomBuild(
          camera,
          action === 'in' ? 1.35 : 1 / 1.35,
        )
        break
      case 'reset':
        building.camera = view.initialBuildCamera()
        setBuildCell(annexEntry)
        break
    }
    syncBuilder()
    requestDraw()
  }

  buildToggle.addEventListener('click', () => setBuilding(!building))
  doneBuilding.addEventListener('click', () => setBuilding(false))
  for (const button of cameraButtons)
    button.addEventListener('click', () =>
      useBuildCamera(button.dataset.camera ?? ''),
    )
  for (const button of categories)
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-pressed') !== 'true')
        chooseBuildTool(
          button.dataset.buildCategory === 'structure' ? 'floor' : 'shelf',
        )
    })
  undoBuild.addEventListener('click', () => {
    finishBuildGesture()
    const previous = buildHistory.at(-1)
    if (!previous) return
    if (!canKeepVisitor(cafe, previous)) {
      write(
        buildFeedback,
        'Move your visitor clear before undoing this change.',
      )
      return
    }
    buildHistory.pop()
    storeBuild(previous, 'Undid the last building change.')
    if (undoBuild.disabled) view.canvas.focus({ preventScroll: true })
  })
  for (const [tool, button] of buildTools)
    button.addEventListener('click', () => {
      if (tool === 'room') {
        finishBuildGesture()
        useBuildTool('room', annexEntry)
        view.canvas.focus({ preventScroll: true })
      } else if (isBuildTool(tool)) chooseBuildTool(tool)
    })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Node)) return
    if (
      settingsToggle.contains(target) ||
      settingsMenu.contains(target) ||
      controlsDialog.contains(target)
    )
      return
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
  orbitLeft.addEventListener('click', () => turnCamera(-1))
  orbitRight.addEventListener('click', () => turnCamera(1))
  zoomPixel.addEventListener('click', toggleZoom)

  function toggleZoom() {
    cafe.pixelZoom = !cafe.pixelZoom
    zoomPixel.setAttribute('aria-pressed', String(cafe.pixelZoom))
    zoomPixel.setAttribute(
      'aria-label',
      cafe.pixelZoom ? 'Zoom out' : 'Zoom in',
    )
    requestDraw()
  }

  function moveBuildCursor(
    builder: Builder,
    {
      column,
      row,
      left,
      up,
    }: { column: number; row: number; left: number; up: number },
  ) {
    const rotation =
      (Math.round((builder.camera.orbit - Math.PI / 4) / (Math.PI / 2)) *
        Math.PI) /
      2
    const dx = Math.round(left * Math.cos(rotation) - up * Math.sin(rotation))
    const dz = Math.round(up * Math.cos(rotation) + left * Math.sin(rotation))
    setBuildCell(
      Math.max(0, Math.min(annexSize - 1, row + dz)) * annexSize +
        Math.max(0, Math.min(annexSize - 1, column + dx)),
    )
    const next = cellPoint(builder.cell)
    builder.camera = builder.pan
      ? { ...builder.camera, center: next }
      : view.revealBuildPoint(builder.camera, next)
    requestDraw()
  }

  function buildKeyDown(event: KeyboardEvent, building: Builder) {
    const digit = /^Digit([1-9])$/.exec(event.code)?.[1]
    const tool = digit && buildShortcuts[Number(digit) - 1]
    const cameraAction = cameraShortcuts.get(event.code)
    if (tool || cameraAction) {
      event.preventDefault()
      if (tool) chooseBuildTool(tool)
      else if (cameraAction && (!event.repeat || cameraAction !== 'pan'))
        useBuildCamera(cameraAction)
      view.canvas.focus({ preventScroll: true })
    } else if (
      canRotateItem(building) &&
      (event.code === 'Comma' || event.code === 'Period')
    ) {
      event.preventDefault()
      if (!event.repeat) rotateBuildItem(event.code === 'Comma' ? 1 : -1)
      view.canvas.focus({ preventScroll: true })
    } else if (event.code === 'Escape') {
      event.preventDefault()
      setBuilding(false)
    } else if (event.target === view.canvas) {
      const column = building.cell % annexSize
      const row = Math.floor(building.cell / annexSize)
      const left =
        Number(event.code === 'ArrowLeft') - Number(event.code === 'ArrowRight')
      const up =
        Number(event.code === 'ArrowUp') - Number(event.code === 'ArrowDown')
      if (left || up) {
        event.preventDefault()
        finishBuildGesture()
        moveBuildCursor(building, { column, row, left, up })
      } else if (event.code === 'KeyR' && isEdgeTool(building.tool)) {
        event.preventDefault()
        building.side = (building.side + 1) % 4
        setBuildCell(building.cell)
        requestDraw()
      } else if (
        (event.code === 'Enter' || event.code === 'Space') &&
        !building.pan
      ) {
        event.preventDefault()
        if (!event.repeat) {
          finishBuildGesture()
          useBuildTool(building.tool, selectedBuildTarget(building))
        }
      }
    }
  }

  window.addEventListener('keydown', (event) => {
    if (controlsDialog.open) return
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
      (event.target instanceof HTMLElement &&
        event.target.closest(
          'a, summary, input, textarea, select, [contenteditable]',
        ))
    )
      return
    if (building && event.code !== 'KeyM') {
      if (!event.shiftKey || event.code === 'Equal')
        buildKeyDown(event, building)
      return
    }
    const walking = cafe.visitor.kind === 'walking' && !cafe.screenFocus
    if (event.key === 'Shift' || movementKeys.has(event.code))
      shiftHeld = event.shiftKey
    if (movementKeys.has(event.code) && walking) {
      event.preventDefault()
      if (!keys.has(event.code)) view.canvas.focus({ preventScroll: true })
      keys.add(event.code)
      requestDraw()
    } else if (
      event.code === 'Space' &&
      walking &&
      !placing &&
      !(
        event.target instanceof HTMLButtonElement &&
        event.target.matches(':focus-visible')
      )
    ) {
      event.preventDefault()
      if (!event.repeat && !cafe.crouched && cafe.jumpTime === undefined) {
        cafe.jumpTime = 0
        requestDraw()
      }
    } else if (!event.repeat && !event.shiftKey) {
      if (
        !cafe.screenFocus &&
        (event.code === 'KeyQ' || event.code === 'KeyE')
      ) {
        turnCamera(event.code === 'KeyQ' ? -1 : 1)
      } else if (
        !cafe.screenFocus &&
        cafe.view === 'pixel' &&
        event.code === 'KeyZ'
      ) {
        toggleZoom()
      } else if (event.code === 'KeyX' && walking) {
        toggleCrouch()
      } else if (prompts.activate(event.code)) {
        event.preventDefault()
        syncControls()
        return
      } else {
        return
      }
      event.preventDefault()
      view.canvas.focus({ preventScroll: true })
      syncControls()
    }
  })
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code)
    if (event.key === 'Shift') shiftHeld = event.shiftKey
  })
  window.addEventListener('blur', () => {
    finishBuildGesture()
    clearBuildTouches()
    keys.clear()
    shiftHeld = false
    touchKeys.clear()
    drag = undefined
  })
  document.addEventListener('visibilitychange', () => {
    if (failed) return
    view.television.setActive(!document.hidden)
    if (document.hidden) {
      finishBuildGesture()
      clearBuildTouches()
      keys.clear()
      shiftHeld = false
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

  function touchPair() {
    const [first, second] = buildTouches.values()
    if (!first || !second) return
    return {
      midpoint: {
        clientX: (first.clientX + second.clientX) / 2,
        clientY: (first.clientY + second.clientY) / 2,
      },
      distance: Math.hypot(
        first.clientX - second.clientX,
        first.clientY - second.clientY,
      ),
    }
  }

  view.canvas.addEventListener('contextmenu', (event) => {
    if (building) event.preventDefault()
  })
  view.canvas.addEventListener(
    'wheel',
    (event) => {
      if (!building || !event.deltaY) return
      event.preventDefault()
      if (buildGesture || pinching) return
      const delta = event.deltaY * (event.deltaMode ? 16 : 1)
      building.camera = view.zoomBuild(
        building.camera,
        Math.exp(-delta * 0.003),
        event,
      )
      requestDraw()
    },
    { passive: false },
  )
  function beginBuildPointer(event: PointerEvent, building: Builder) {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
    if (event.pointerType === 'touch') {
      buildTouches.set(event.pointerId, event)
      view.canvas.setPointerCapture(event.pointerId)
      if (buildTouches.size > 1) {
        if (buildGesture?.kind === 'paint') cafe.annex = buildGesture.before
        buildGesture = undefined
        pinching = true
        requestDraw()
      }
      if (pinching) return
    }
    if (buildGesture) return
    if (event.button !== 0) event.preventDefault()
    view.canvas.setPointerCapture(event.pointerId)
    if (building.pan || event.button !== 0) {
      buildGesture = { kind: 'pan', id: event.pointerId, pointer: event }
      requestDraw()
    } else if (
      building.tool === 'floor' ||
      building.tool === 'erase-floor' ||
      building.tool === 'wall'
    ) {
      buildGesture = {
        kind: 'paint',
        tool: building.tool,
        id: event.pointerId,
        before: cafe.annex,
        count: 0,
        message:
          building.tool === 'floor'
            ? floorHint
            : building.tool === 'wall'
              ? wallBrushHint
              : 'Select a floor tile to remove.',
      }
      paintBuild(event)
    } else {
      buildGesture = { kind: 'place', id: event.pointerId, pointer: event }
    }
  }

  view.canvas.addEventListener('pointerdown', (event) => {
    if (building) return beginBuildPointer(event, building)
    if (event.button !== 0 || drag) return
    view.canvas.setPointerCapture(event.pointerId)
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      distance: 0,
    }
  })
  function moveBuildPointer(event: PointerEvent, building: Builder) {
    if (buildTouches.has(event.pointerId)) {
      const before = touchPair()
      buildTouches.set(event.pointerId, event)
      const after = touchPair()
      if (before && after && before.distance > 1 && after.distance > 1) {
        const zoomed = view.zoomBuild(
          building.camera,
          after.distance / before.distance,
          before.midpoint,
        )
        building.camera = view.panBuild(zoomed, before.midpoint, after.midpoint)
        requestDraw()
      }
    }
    if (pinching || (buildGesture && buildGesture.id !== event.pointerId))
      return
    if (buildGesture?.kind === 'pan') {
      building.camera = view.panBuild(
        building.camera,
        buildGesture.pointer,
        event,
      )
      setBuildCell(pointCell(building.camera.center) ?? annexEntry)
      buildGesture.pointer = event
      requestDraw()
    } else if (buildGesture?.kind === 'paint') {
      paintBuild(event)
    } else if (!building.pan) {
      const target = view.pickBuildTarget(building.camera, event, building.tool)
      if (target !== undefined) {
        setBuildTarget(building.tool, target)
        requestDraw()
      }
    }
  }

  view.canvas.addEventListener('pointermove', (event) => {
    if (building) return moveBuildPointer(event, building)
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
  function endBuildPointer(event: PointerEvent, building: Builder) {
    buildTouches.delete(event.pointerId)
    if (pinching) {
      if (!buildTouches.size) pinching = false
      requestDraw()
      return
    }
    if (buildGesture?.id !== event.pointerId) return
    if (buildGesture.kind === 'paint') paintBuild(event)
    if (
      buildGesture.kind === 'place' &&
      Math.hypot(
        event.clientX - buildGesture.pointer.clientX,
        event.clientY - buildGesture.pointer.clientY,
      ) < 8
    ) {
      const target = view.pickBuildTarget(building.camera, event, building.tool)
      if (target !== undefined) {
        setBuildTarget(building.tool, target)
        useBuildTool(building.tool, target)
        requestDraw()
      }
    }
    finishBuildGesture()
  }

  view.canvas.addEventListener('pointerup', (event) => {
    if (building) return endBuildPointer(event, building)
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
        if (typeof id === 'object') interactAnnex(id)
        else if (id === 'laptop' && cafe.props.laptopOpen) toggleLaptopFocus()
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
  for (const end of ['pointercancel', 'lostpointercapture'])
    view.canvas.addEventListener(end, (event) => {
      if (!(event instanceof PointerEvent)) return
      if (buildTouches.delete(event.pointerId) && !buildTouches.size) {
        pinching = false
        requestDraw()
      }
      if (buildGesture?.id === event.pointerId) finishBuildGesture()
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
