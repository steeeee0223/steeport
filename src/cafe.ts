import layout from '../scene/layout.json' with { type: 'json' }

export { layout }

interface Point {
  x: number
  z: number
}
interface Look {
  yaw: number
  pitch: number
}
export type Visitor =
  ({ kind: 'seated' } & Look) | ({ kind: 'walking' } & Point & Look)

export interface Cafe {
  visitor: Visitor
  laptopOpen: boolean
  view: 'first-person' | 'pixel'
  orbit: number
}

export const initialCafe: Cafe = {
  visitor: { kind: 'seated', yaw: layout.seat.yaw, pitch: layout.seat.pitch },
  laptopOpen: false,
  view: 'first-person',
  orbit: -0.98,
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
]

export function position(visitor: Visitor): Point {
  return visitor.kind === 'seated' ? layout.seat : visitor
}

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
  if (visitor.kind !== 'walking') return
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
}

export function atSeat(visitor: Visitor) {
  return (
    visitor.kind === 'seated' ||
    Math.hypot(visitor.x - layout.stand.x, visitor.z - layout.stand.z) < 0.53
  )
}

export function atLaptop(visitor: Visitor) {
  const p = position(visitor)
  return Math.hypot(p.x - layout.laptop.x, p.z - layout.laptop.z) < 1.14
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
  if (z < -1.82 && x < 2.2) return 'By the window'
  if (x > 1.4 && z > -2.35 && z < 2.6) return 'At the bar'
  if (x < -1.1 && z > 2.02) return 'By the bookshelf'
  if (x < -2.1 && z < 2.05) return 'Wall tables'
  return 'Communal table'
}
