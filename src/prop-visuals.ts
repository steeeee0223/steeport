import { MathUtils, type Object3D } from 'three'

import { type Cafe, position } from './cafe'
import { type PropId } from './props'

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
  const targets: Record<PropId, Object3D> = {
    laptop: node('Laptop'),
    notebook: node('Notebook'),
    charger: node('Charger'),
    shelf: node('Bookcase'),
    water: node('WaterStation'),
    cat: node('Miso'),
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
    const pour = pulse('water')
    carafe.rotation.z = pour * 0.96
    stream.visible = pour > 0.76
    barCup.visible = props.water === 'on-bar' || pour > 0.08
    carriedCup.visible = props.water !== 'on-bar' && !barCup.visible
    cupWater.visible = props.water === 'full' || props.water === 'half'
    cupWater.position.y = props.water === 'full' ? 0.079 : 0.048

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
    carried.visible = carriedAtlas.visible || carriedCup.visible
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
    update,
    animate: (id: TimedProp, now: number) => eventStart.set(id, now),
    dynamic: [
      ...Object.values(targets).filter((target) => target !== targets.shelf),
      shelfAtlas,
      carried,
    ],
  }
}
