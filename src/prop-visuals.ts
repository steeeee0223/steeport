import { MathUtils, Object3D } from 'three'

import { type Cafe } from './cafe'
import { type PropId, placed } from './props'
import { position } from './visitor'

export function propVisuals(node: (name: string) => Object3D) {
  const hinge = node('LaptopHinge')
  const cover = node('NotebookCover')
  const leftPages = node('NotebookLeft')
  const turningPage = node('NotebookPage')
  const shelfAtlas = node('ShelfAtlas')
  const carried = node('Carried')
  const carriedAtlas = node('CarriedAtlas')
  const carriedCup = node('CarriedCup')
  const barCup = node('BarCup')
  const cupWater = node('CupWater')
  const carafe = node('Carafe')
  const stream = node('PourStream')
  const loose = node('CableLoose')
  const plugged = node('CablePlugged')
  const indicator = node('Charge_indicator')
  const catHead = node('MisoHead')
  const catTail = node('MisoTail')
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
    water: node('WaterStation'),
    cat: node('Miso'),
    door,
    cup: carriedCup,
    atlas: carriedAtlas,
  }

  const motionTime = { water: 740, cat: 580, notebook: 390 }
  type TimedProp = keyof typeof motionTime
  const eventStart = new Map<TimedProp, number>()

  function update(cafe: Cafe, now: number, dt: number, reduce: boolean) {
    let moving = false
    function settle(from: number, to: number) {
      if (reduce || Math.abs(from - to) < 0.004) return to
      moving = true
      return MathUtils.damp(from, to, 15, dt || 1 / 60)
    }
    function pulse(id: TimedProp) {
      const start = eventStart.get(id)
      if (reduce || start === undefined) return 0
      const progress = (now - start) / motionTime[id]
      if (progress >= 1) return 0
      moving = true
      return Math.sin(Math.PI * Math.max(0, progress))
    }

    const { props } = cafe
    door.rotation.y = settle(door.rotation.y, props.doorOpen ? 1.68 : 0)
    hinge.rotation.x = settle(hinge.rotation.x, props.laptopOpen ? -1.85 : 0)
    const notebookOpen = props.notebook !== 'closed'
    cover.rotation.z = settle(cover.rotation.z, notebookOpen ? Math.PI : 0)
    leftPages.visible = cover.rotation.z > 2.8
    const flip = pulse('notebook')
    turningPage.visible = leftPages.visible && flip > 0.02
    turningPage.rotation.z = flip * Math.PI

    plugged.visible = indicator.visible = props.pluggedIn
    loose.visible = !props.pluggedIn

    shelfAtlas.visible = props.shelfBook.kind === 'shelved'
    carriedAtlas.visible = !shelfAtlas.visible
    const atlasSpot = placed(props, 'atlas')
    if (atlasSpot) {
      if (carriedAtlas.parent !== placedItems) placedItems.add(carriedAtlas)
      carriedAtlas.position.set(atlasSpot.x, atlasSpot.y + 0.03, atlasSpot.z)
      carriedAtlas.rotation.x = Math.PI / 2
    } else {
      if (carriedAtlas.parent !== carried) carried.add(carriedAtlas)
      carriedAtlas.position.copy(atlasInHand)
      carriedAtlas.rotation.x = atlasTilt
    }
    const pour = pulse('water')
    carafe.rotation.z = pour * 0.96
    stream.visible = pour > 0.76
    const water = props.water
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

    const pet = pulse('cat')
    catHead.rotation.x = settle(
      catHead.rotation.x,
      props.cat === 'petted' ? -0.18 - pet * 0.34 : 0,
    )
    catTail.rotation.y = pet * 0.8

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
    carried,
    doorAngle: () => door.rotation.y,
    update,
    animate: (id: TimedProp, now: number) => eventStart.set(id, now),
    dynamic: [
      ...Object.values(targets).filter(
        (target) => target !== targets.shelf && target !== door,
      ),
      shelfAtlas,
      carried,
    ],
  }
}
