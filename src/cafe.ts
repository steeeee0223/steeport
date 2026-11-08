import layout from '../scene/layout.json' with { type: 'json' }
import { type Props, initialProps } from './props'
import { type Point, type Visitor, position } from './visitor'

export { layout }

export interface Cafe {
  visitor: Visitor
  props: Props
  view: 'first-person' | 'pixel'
  orbit: number
  pixelZoom: boolean
}

export const initialCafe: Cafe = {
  visitor: { kind: 'seated', yaw: layout.seat.yaw, pitch: layout.seat.pitch },
  props: initialProps(),
  view: 'first-person',
  orbit: -0.98,
  pixelZoom: false,
}

const bodyRadius = 0.18
const furniture = [
  layout.windowDesk,
  ...layout.windowChairs,
  ...layout.benchSeats,
  ...layout.smallTables,
  layout.communal,
  ...layout.communalChairs,
  layout.bar,
  layout.backBar,
  layout.shelf,
  layout.plant,
  { ...layout.props.cat, width: 0.68, depth: 0.55 },
]

function canWalk({ x, z }: Point) {
  return (
    Math.abs(x) < layout.room.width / 2 - bodyRadius &&
    Math.abs(z) < layout.room.depth / 2 - bodyRadius &&
    furniture.every((rect) => {
      const dx = Math.max(Math.abs(x - rect.x) - rect.width / 2, 0)
      const dz = Math.max(Math.abs(z - rect.z) - rect.depth / 2, 0)
      return Math.hypot(dx, dz) >= bodyRadius
    })
  )
}

export function walk(cafe: Cafe, side: number, forward: number, dt: number) {
  const visitor = cafe.visitor
  if (visitor.kind !== 'walking') return 0
  const basis = cafe.view === 'pixel' ? Math.PI - cafe.orbit : visitor.yaw
  const stride = (2.18 * dt) / Math.max(1, Math.hypot(side, forward))
  const dx = (Math.cos(basis) * side - Math.sin(basis) * forward) * stride
  const dz = (-Math.sin(basis) * side - Math.cos(basis) * forward) * stride
  const oldX = visitor.x
  const oldZ = visitor.z

  if (canWalk({ x: visitor.x + dx, z: visitor.z })) visitor.x += dx
  if (canWalk({ x: visitor.x, z: visitor.z + dz })) visitor.z += dz
  if (cafe.view === 'pixel' && (oldX !== visitor.x || oldZ !== visitor.z)) {
    visitor.yaw = Math.atan2(oldX - visitor.x, oldZ - visitor.z)
  }
  return Math.hypot(visitor.x - oldX, visitor.z - oldZ)
}

export function atSeat(visitor: Visitor) {
  return (
    visitor.kind === 'seated' ||
    Math.hypot(visitor.x - layout.seat.x, visitor.z - layout.seat.z) < 0.88
  )
}

export function changePosture(cafe: Cafe) {
  const visitor = cafe.visitor
  if (visitor.kind === 'seated') {
    cafe.visitor = {
      kind: 'walking',
      x: layout.stand.x,
      z: layout.stand.z,
      yaw: visitor.yaw,
      pitch: 0,
    }
  } else if (atSeat(visitor)) {
    cafe.visitor = {
      kind: 'seated',
      yaw: layout.seat.yaw,
      pitch: layout.seat.pitch,
    }
  }
}

export function location(visitor: Visitor) {
  const { x, z } = position(visitor)
  if (visitor.kind === 'seated') return 'Window seat'
  if (z < -2.55 && x > layout.entry.left - 0.22) return 'By the entrance'
  if (z < -1.82 && x < 2.2) return 'By the window'
  if (x < -1.1 && z > 2.02) return 'By the bookshelf'
  if (z > 2.18) return 'Rear aisle'
  if (x > 1.4 && z > -2.35) return 'At the bar'
  if (x < -2.1 && z < 2.05) return 'Wall tables'
  return 'Communal table'
}
