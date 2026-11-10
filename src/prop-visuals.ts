import {
  Euler,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'

import { type BookPose, bookMotion, bookTransform } from './book-motion'
import { books } from './books'
import { type Cafe, layout } from './cafe'
import { type PropId, placed } from './props'
import { position } from './visitor'

export function propVisuals(node: (name: string) => Object3D) {
  const hinge = node('LaptopHinge')
  const notebook = node('Notebook')
  notebook.visible = Boolean(books.notebook)
  const notebookAtRest = bookTransform(notebook)
  const notebookMotion = bookMotion(notebook)
  const cover = node('NotebookCover')
  const leftPages = node('NotebookLeft')
  const turningPage = node('NotebookPage')
  const shelfAtlas = node('ShelfAtlas')
  const journal = shelfAtlas.clone()
  const hasAtlas = Boolean(books.shelf)
  const hasJournal = Boolean(books.journal)
  shelfAtlas.visible = hasAtlas
  journal.visible = hasJournal
  const journalSpot = layout.props.journal
  journal.position.set(journalSpot.x, journalSpot.y, journalSpot.z)
  journal.rotation.y = 0.19
  journal.scale.set(0.94, 1.03, 0.9)
  shelfAtlas.parent?.add(journal)
  const carried = node('Carried')
  const carriedAtlas = node('CarriedAtlas')
  const carriedCup = node('CarriedCup')
  const carriedJournal = carriedAtlas.clone()
  carried.add(carriedJournal)
  for (const book of [shelfAtlas, journal]) {
    const pages = book.getObjectByName('ShelfAtlasLeft')
    if (pages) pages.visible = false
  }
  for (const book of [journal, carriedJournal]) {
    book.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const original: unknown = object.material
      if (
        original instanceof MeshStandardMaterial &&
        original.name.startsWith('Book cloth')
      ) {
        const cover = original.clone()
        cover.color.set('#4c6864')
        object.material = cover
      }
    })
  }
  const barCup = node('BarCup')
  const cupWater = node('CupWater')
  const barFill = cupWater.clone()
  barCup.add(barFill)
  const carafe = node('Carafe')
  const stream = node('PourStream')
  const carafeAtRest = carafe.position.clone()
  const spout = new Vector3()
  const pourEnd = new Vector3()
  const streamAxis = new Vector3(0, 1, 0)
  const loose = node('CableLoose')
  const plugged = node('CablePlugged')
  const indicator = node('Charge_indicator')
  const door = node('EntryDoor')
  const placedItems = new Object3D()
  carried.parent?.add(placedItems)
  const cupInHand = carriedCup.position.clone()
  const atlasInHand = carriedAtlas.position.clone()
  const shelfExit = new Vector3(0, 0, -0.27)
  const flyingBooks = new Set<Object3D>()
  function shelfBook(shelf: Object3D, mover: Object3D) {
    const rest = bookTransform(shelf)
    placedItems.add(mover)
    mover.position.copy(rest.position)
    mover.quaternion.copy(rest.rotation)
    mover.scale.copy(rest.scale)
    mover.visible = false
    const cover = mover.getObjectByName('CarriedAtlasCover')
    const flyleaf = mover.getObjectByName('CarriedAtlasLeft')
    const move = bookMotion(mover, shelfExit)
    return function update(
      pose: BookPose,
      target: ReturnType<typeof bookTransform>,
      now: number,
      reduce: boolean,
    ) {
      if (mover.parent === carried && pose === 'held') return false
      if (mover.parent !== placedItems) placedItems.attach(mover)
      const { openness, moving } = move(
        pose,
        pose === 'rest' ? rest : target,
        now,
        reduce,
      )
      shelf.visible = pose === 'rest' && !moving
      mover.visible = !shelf.visible
      if (moving) flyingBooks.add(mover)
      else flyingBooks.delete(mover)
      if (cover) cover.rotation.y = 2.95 * openness
      if (flyleaf) {
        flyleaf.rotation.y = 2.72 * MathUtils.smoothstep(openness, 0.15, 1)
        flyleaf.visible = openness > 0.18
      }
      if (pose === 'held' && !moving) carried.attach(mover)
      return moving
    }
  }
  const updateAtlas = shelfBook(shelfAtlas, carriedAtlas)
  const updateJournal = shelfBook(journal, carriedJournal)
  const readingPose = bookTransform()
  const bookDestination = bookTransform()
  const bookRotation = new Euler(0, 0, 0, 'YXZ')
  const targets: Record<PropId, Object3D> = {
    laptop: node('Laptop'),
    notebook,
    charger: node('Charger'),
    shelf: node('Bookcase'),
    journal,
    water: node('WaterStation'),
    cat: node('Miso'),
    door,
    cup: carriedCup,
    atlas: carriedAtlas,
  }

  const pourDuration = 740
  let pourStart = -Infinity
  let sipStart = -Infinity
  let cupTransfer: { from: Vector3; start: number } | undefined
  let previousCupSpot: ReturnType<typeof placed>
  const cupOrigin = new Vector3()
  const cupDestination = new Vector3()
  const leftGrip = new Vector3()
  const rightGrip = new Vector3()
  let holdingBook = false
  let holdingCup = false
  let pageTurn: { direction: -1 | 1; start: number } | undefined

  function update(
    cafe: Cafe,
    now: number,
    dt: number,
    reduce: boolean,
    avatar: { carry: number; sip: number; yaw: number } | null,
  ) {
    let moving = false
    function settle(from: number, to: number) {
      if (reduce || Math.abs(from - to) < 0.004) return to
      moving = true
      return MathUtils.damp(from, to, 15, dt || 1 / 60)
    }

    const { props } = cafe
    door.rotation.y = settle(door.rotation.y, props.doorOpen ? 1.68 : 0)
    hinge.rotation.x = settle(hinge.rotation.x, props.laptopOpen ? -1.85 : 0)
    const p = position(cafe.visitor)
    const { pitch } = cafe.visitor
    const yaw = avatar?.yaw ?? cafe.visitor.yaw
    const pixel = avatar !== null
    const seated = cafe.visitor.kind === 'seated'
    const distance = pixel ? 0.26 : 0.45
    carried.visible =
      props.shelfBook.kind === 'carried' || props.water.kind === 'carried'
    carried.position.set(
      p.x - Math.sin(yaw) * distance,
      avatar?.carry ?? (seated ? 0.91 : 1.28),
      p.z - Math.cos(yaw) * distance,
    )
    carried.rotation.y = yaw

    const readingDistance = pixel ? 0.36 : 0.64
    const readingHeight = avatar
      ? avatar.carry + 0.13
      : (seated ? layout.seat.eye : layout.stand.eye) -
        (cafe.crouched ? 0.72 : 0) +
        Math.sin(pitch) * readingDistance -
        0.045
    readingPose.position.set(
      p.x - Math.sin(yaw) * readingDistance,
      readingHeight,
      p.z - Math.cos(yaw) * readingDistance,
    )
    readingPose.rotation.setFromEuler(
      bookRotation.set(pixel ? 0.85 : Math.PI / 2 + pitch - 0.2, yaw, 0),
    )
    const readingNotebook = props.reading === 'notebook'
    const notebookPose = notebookMotion(
      readingNotebook ? 'reading' : 'rest',
      readingNotebook ? readingPose : notebookAtRest,
      now,
      reduce,
    )
    moving ||= notebookPose.moving
    cover.rotation.z = Math.PI * notebookPose.openness
    leftPages.visible = notebookPose.openness > 0.22
    leftPages.rotation.z =
      Math.PI * (MathUtils.smoothstep(notebookPose.openness, 0.14, 1) - 1)
    turningPage.visible = false
    if (pageTurn) {
      const progress = MathUtils.clamp((now - pageTurn.start) / 480, 0, 1)
      if (reduce || progress === 1) pageTurn = undefined
      else {
        moving = true
        turningPage.visible = notebookPose.openness > 0.9
        const eased = MathUtils.smoothstep(progress, 0, 1)
        const angle = pageTurn.direction === 1 ? eased : 1 - eased
        turningPage.rotation.z = MathUtils.lerp(0.04, Math.PI - 0.04, angle)
      }
    }

    plugged.visible = indicator.visible = props.pluggedIn
    loose.visible = !props.pluggedIn

    const book = props.shelfBook
    let shelfPose: BookPose = 'rest'
    if (book.kind === 'placed') {
      shelfPose = 'placed'
      const { x, y, z } = book.spot
      bookDestination.position.set(x, y + 0.028, z)
      bookDestination.rotation.setFromEuler(bookRotation.set(Math.PI / 2, 0, 0))
    } else if (book.kind === 'carried' && props.reading === book.book) {
      shelfPose = 'reading'
      bookDestination.position.copy(readingPose.position)
      bookDestination.position.x -= 0.065 * Math.cos(yaw)
      bookDestination.position.z += 0.065 * Math.sin(yaw)
      bookDestination.rotation.setFromEuler(
        bookRotation.set(pixel ? 0.86 : 0.22 + pitch, yaw + Math.PI, 0),
      )
    } else if (book.kind === 'carried') {
      shelfPose = 'held'
      bookDestination.position
        .copy(atlasInHand)
        .applyQuaternion(carried.quaternion)
        .add(carried.position)
      bookDestination.rotation.setFromEuler(
        bookRotation.set(0.5, yaw + Math.PI, -0.1),
      )
    }
    const atlasPose =
      book.kind !== 'shelved' && book.book === 'shelf' ? shelfPose : 'rest'
    const journalPose =
      book.kind !== 'shelved' && book.book === 'journal' ? shelfPose : 'rest'
    const atlasMoving =
      hasAtlas && updateAtlas(atlasPose, bookDestination, now, reduce)
    const journalMoving =
      hasJournal && updateJournal(journalPose, bookDestination, now, reduce)
    moving ||= atlasMoving || journalMoving
    const activeBook =
      atlasPose === 'held' || atlasPose === 'reading' || atlasMoving
        ? carriedAtlas
        : journalPose === 'held' || journalPose === 'reading' || journalMoving
          ? carriedJournal
          : undefined
    holdingBook = pixel && (readingNotebook || activeBook !== undefined)
    if (pixel && readingNotebook) {
      notebook.localToWorld(leftGrip.set(-0.15, -0.018, 0.12))
    } else if (pixel && activeBook) {
      activeBook.localToWorld(leftGrip.set(0.04, -0.09, 0.025))
    }
    const water = props.water
    const pouring = (now - pourStart) / pourDuration
    const pour =
      !reduce && water.kind === 'carried' && pouring < 1
        ? Math.sin(Math.PI * Math.max(0, pouring))
        : 0
    const atCounter = avatar
      ? pouring >= 0 && pouring < 0.9 && !reduce
      : pour > 0.08
    if (water.kind === 'carried' && pouring >= 0 && pouring < 1 && !reduce)
      moving = true
    carafe.rotation.z = pour * 1.31
    carafe.position.copy(carafeAtRest)
    carafe.position.x += pour * 0.22
    carafe.position.y += pour * 0.14
    carafe.position.z += pour * 0.21
    const parent = stream.parent
    stream.visible = pour > 0.76
    barFill.visible =
      stream.visible ||
      (pixel && atCounter && water.kind === 'carried' && pouring > 0.27)
    if (barFill.visible) {
      const fill = MathUtils.smoothstep(pouring, 0.27, 0.73)
      barFill.position.y = MathUtils.lerp(0.022, 0.079, fill)
    }
    if (stream.visible && parent) {
      parent.worldToLocal(carafe.localToWorld(spout.set(-0.043, 0.338, 0)))
      parent.worldToLocal(
        barCup.localToWorld(pourEnd.set(0, barFill.position.y + 0.001, 0)),
      )
      stream.position.copy(spout).lerp(pourEnd, 0.5)
      const direction = spout.sub(pourEnd)
      stream.scale.set(0.32, direction.length() / 0.21, 0.32)
      stream.quaternion.setFromUnitVectors(streamAxis, direction.normalize())
    }
    const cupSpot = placed(props, 'cup')
    if (avatar && !reduce && previousCupSpot && water.kind === 'carried') {
      cupTransfer = {
        from: new Vector3(
          previousCupSpot.x,
          previousCupSpot.y,
          previousCupSpot.z,
        ),
        start: now,
      }
    }
    previousCupSpot = cupSpot
    if (reduce || water.kind !== 'carried') cupTransfer = undefined
    barCup.visible =
      water.kind === 'on-bar' || (water.kind === 'carried' && atCounter)
    carriedCup.visible = water.kind !== 'on-bar' && !barCup.visible
    cupWater.visible = water.kind !== 'on-bar' && water.level !== 'empty'
    cupWater.position.y =
      water.kind !== 'on-bar' && water.level === 'full' ? 0.079 : 0.048
    if (cupSpot) {
      if (carriedCup.parent !== placedItems) placedItems.add(carriedCup)
      carriedCup.position.set(cupSpot.x, cupSpot.y, cupSpot.z)
    } else {
      if (carriedCup.parent !== carried) carried.add(carriedCup)
      carriedCup.position.copy(cupInHand)
      if (avatar && water.kind === 'carried' && !reduce) {
        if (cupTransfer && now >= cupTransfer.start) {
          const progress = MathUtils.smoothstep(now - cupTransfer.start, 0, 320)
          cupDestination.copy(cupInHand)
          carried.worldToLocal(cupOrigin.copy(cupTransfer.from))
          carriedCup.position.lerpVectors(cupOrigin, cupDestination, progress)
          carriedCup.position.y += 0.18 * progress * (1 - progress)
          if (progress < 1) moving = true
          else cupTransfer = undefined
        }
        const elapsed = now - sipStart
        const sip =
          MathUtils.smoothstep(elapsed, 0, 220) *
          (1 - MathUtils.smoothstep(elapsed, 390, 680))
        if (elapsed < 680 && !atCounter) {
          moving = true
          carriedCup.position.lerp(
            cupDestination.set(0.085, avatar.sip - carried.position.y, 0.074),
            sip,
          )
        }
      }
    }

    holdingCup = pixel && water.kind === 'carried'
    if (holdingCup) {
      const grip = atCounter ? barCup : carriedCup
      if (atCounter) {
        // Offset the grip toward the visitor rather than into the counter.
        grip.getWorldPosition(rightGrip)
        const angle = Math.atan2(p.x - rightGrip.x, p.z - rightGrip.z)
        rightGrip.x += Math.sin(angle) * 0.074
        rightGrip.z += Math.cos(angle) * 0.074
        rightGrip.y += 0.048
      } else {
        grip.localToWorld(rightGrip.set(0.074, 0.048, 0.005))
      }
    }

    return moving
  }

  return {
    targets,
    carriedJournal,
    carried,
    flyingBooks,
    doorAngle: () => door.rotation.y,
    notebookShadowPose: () => [notebook.position.y, cover.rotation.z].join(),
    update,
    pour: (now: number) => {
      pourStart = now
      cupTransfer = {
        from: barCup.getWorldPosition(new Vector3()),
        start: now + pourDuration * 0.9,
      }
    },
    sip: (now: number) => {
      sipStart = now
    },
    leftGrip: () => (holdingBook ? leftGrip : undefined),
    rightGrip: () => (holdingCup ? rightGrip : undefined),
    turnNotebook: (direction: -1 | 1, start: number) => {
      pageTurn = { direction, start }
    },
    dynamic: [
      ...Object.values(targets).filter(
        (target) => target !== targets.shelf && target !== door,
      ),
      shelfAtlas,
      carriedJournal,
      carried,
    ],
  }
}
