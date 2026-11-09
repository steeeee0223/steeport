import { MathUtils, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'

import { type Cafe, layout } from './cafe'
import { type PropId, placed } from './props'
import { position } from './visitor'

export function propVisuals(node: (name: string) => Object3D) {
  const hinge = node('LaptopHinge')
  const cover = node('NotebookCover')
  const leftPages = node('NotebookLeft')
  const turningPage = node('NotebookPage')
  const shelfAtlas = node('ShelfAtlas')
  const journal = shelfAtlas.clone()
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
  const atlasTilt = carriedAtlas.rotation.x
  const targets: Record<PropId, Object3D> = {
    laptop: node('Laptop'),
    notebook: node('Notebook'),
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
  let pageTurn: { direction: -1 | 1; start: number } | undefined

  function update(cafe: Cafe, now: number, dt: number, reduce: boolean) {
    let moving = false
    function settle(from: number, to: number) {
      if (reduce || Math.abs(from - to) < 0.004) return to
      moving = true
      return MathUtils.damp(from, to, 15, dt || 1 / 60)
    }

    const { props } = cafe
    door.rotation.y = settle(door.rotation.y, props.doorOpen ? 1.68 : 0)
    hinge.rotation.x = settle(hinge.rotation.x, props.laptopOpen ? -1.85 : 0)
    const notebookOpen = props.notebook !== 'closed'
    cover.rotation.z = settle(cover.rotation.z, notebookOpen ? Math.PI : 0)
    leftPages.visible = cover.rotation.z > 2.8
    turningPage.visible = false
    if (pageTurn) {
      const progress = MathUtils.clamp((now - pageTurn.start) / 480, 0, 1)
      if (reduce || progress === 1) pageTurn = undefined
      else {
        moving = true
        turningPage.visible = leftPages.visible
        const eased = MathUtils.smoothstep(progress, 0, 1)
        const angle = pageTurn.direction === 1 ? eased : 1 - eased
        turningPage.rotation.z = MathUtils.lerp(0.04, Math.PI - 0.04, angle)
      }
    }

    plugged.visible = indicator.visible = props.pluggedIn
    loose.visible = !props.pluggedIn

    const book = props.shelfBook
    const usingJournal =
      book.kind !== 'shelved' && book.book === 'Trail journal'
    shelfAtlas.visible = book.kind === 'shelved' || usingJournal
    journal.visible = !usingJournal
    carriedAtlas.visible = !shelfAtlas.visible
    carriedJournal.visible = usingJournal
    const atlasSpot = placed(props, 'atlas')
    for (const object of [carriedAtlas, carriedJournal]) {
      if (atlasSpot) {
        if (object.parent !== placedItems) placedItems.add(object)
        object.position.set(atlasSpot.x, atlasSpot.y + 0.03, atlasSpot.z)
        object.rotation.x = Math.PI / 2
      } else {
        if (object.parent !== carried) carried.add(object)
        object.position.copy(atlasInHand)
        object.rotation.x = atlasTilt
      }
    }
    const water = props.water
    const pouring = (now - pourStart) / pourDuration
    const pour =
      !reduce && water.kind === 'carried' && pouring < 1
        ? Math.sin(Math.PI * Math.max(0, pouring))
        : 0
    if (pour > 0) moving = true
    carafe.rotation.z = pour * 1.31
    carafe.position.copy(carafeAtRest)
    carafe.position.x += pour * 0.22
    carafe.position.y += pour * 0.14
    carafe.position.z += pour * 0.21
    const parent = stream.parent
    stream.visible = barFill.visible = pour > 0.76
    if (stream.visible && parent) {
      const fill = MathUtils.smoothstep(pouring, 0.27, 0.73)
      barFill.position.y = MathUtils.lerp(0.022, 0.079, fill)
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
    barCup.visible =
      water.kind === 'on-bar' || (water.kind === 'carried' && pour > 0.08)
    carriedCup.visible = !barCup.visible
    cupWater.visible = water.kind !== 'on-bar' && water.level !== 'empty'
    cupWater.position.y =
      water.kind !== 'on-bar' && water.level === 'full' ? 0.079 : 0.048
    if (cupSpot) {
      if (carriedCup.parent !== placedItems) placedItems.add(carriedCup)
      carriedCup.position.set(cupSpot.x, cupSpot.y, cupSpot.z)
    } else {
      if (carriedCup.parent !== carried) carried.add(carriedCup)
      carriedCup.position.copy(cupInHand)
    }

    const p = position(cafe.visitor)
    const yaw = cafe.visitor.yaw
    const pixel = cafe.view === 'pixel'
    const seated = cafe.visitor.kind === 'seated'
    const distance = pixel ? 0.26 : 0.45
    carried.visible =
      props.shelfBook.kind === 'carried' || water.kind === 'carried'
    carried.position.set(
      p.x - Math.sin(yaw) * distance,
      seated ? (pixel ? 0.69 : 0.91) : pixel ? 0.83 : 1.28,
      p.z - Math.cos(yaw) * distance,
    )
    carried.rotation.y = yaw
    return moving
  }

  return {
    targets,
    carriedJournal,
    carried,
    doorAngle: () => door.rotation.y,
    update,
    pour: (now: number) => {
      pourStart = now
    },
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
