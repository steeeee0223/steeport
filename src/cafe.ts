import layout from '../scene/layout.json' with { type: 'json' }
import { type Props, initialProps } from './props'
import { type Point, type Seat, type Visitor, position } from './visitor'

export { layout }

export interface Cafe {
  visitor: Visitor
  props: Props
  view: 'first-person' | 'pixel'
  orbit: number
  pixelZoom: boolean
  crouched?: boolean
  laptopFocus?: boolean
  chairPositions?: Point[]
}

export const initialCafe: Cafe = {
  visitor: { kind: 'seated', yaw: layout.seat.yaw, pitch: layout.seat.pitch },
  props: initialProps(),
  view: 'first-person',
  orbit: -Math.PI / 4,
  pixelZoom: false,
}

const bodyRadius = 0.18
const chairs = [...layout.windowChairs, ...layout.communalChairs]
const fixedFurniture = [
  layout.windowDesk,
  ...layout.benchSeats,
  ...layout.smallTables,
  layout.communal,
  layout.bar,
  layout.backBar,
  layout.shelf,
  layout.plant,
  { ...layout.props.cat, width: 0.68, depth: 0.55 },
]

type Footprint = Point & { width: number; depth: number }

function clears(point: Point, rect: Footprint, radius = bodyRadius) {
  const dx = Math.max(Math.abs(point.x - rect.x) - rect.width / 2, 0)
  const dz = Math.max(Math.abs(point.z - rect.z) - rect.depth / 2, 0)
  return Math.hypot(dx, dz) >= radius
}

function insideRoom({ x, z }: Point, radius = bodyRadius) {
  return (
    Math.abs(x) < layout.room.width / 2 - radius &&
    Math.abs(z) < layout.room.depth / 2 - radius
  )
}

function clearsFixed(point: Point, radius = bodyRadius) {
  return (
    insideRoom(point, radius) &&
    fixedFurniture.every((rect) => clears(point, rect, radius))
  )
}

function chairLayout(cafe: Cafe) {
  if (!cafe.chairPositions) return chairs
  return chairs.map((chair, index) => ({
    ...chair,
    ...cafe.chairPositions?.[index],
  }))
}

function tryStep(cafe: Cafe, target: Point, offset: Point) {
  if (!clearsFixed(target)) return false
  const positions = chairLayout(cafe)
  const blocked = positions.findIndex((chair) => !clears(target, chair))
  if (blocked < 0) return true
  const chair = positions[blocked]
  if (!chair || (!offset.x && !offset.z)) return false
  const moved = { x: chair.x + offset.x * 1.02, z: chair.z + offset.z * 1.02 }
  const start = chairs[blocked]
  if (
    !start ||
    Math.hypot(start.x - moved.x, start.z - moved.z) > 0.32 ||
    !clearsFixed(moved, 0.18) ||
    !clears(target, { ...chair, ...moved }) ||
    !positions.every(
      (other, index) => index === blocked || clears(moved, other, 0.25),
    )
  )
    return false
  cafe.chairPositions = positions.map(({ x, z }, index) =>
    index === blocked ? moved : { x, z },
  )
  return true
}

export function walk(cafe: Cafe, side: number, forward: number, dt: number) {
  const visitor = cafe.visitor
  if (visitor.kind !== 'walking') return 0
  const basis = cafe.view === 'pixel' ? Math.PI - cafe.orbit : visitor.yaw
  const stride =
    ((cafe.crouched ? 1.35 : 2.18) * dt) /
    Math.max(1, Math.hypot(side, forward))
  const dx = (Math.cos(basis) * side - Math.sin(basis) * forward) * stride
  const dz = (-Math.sin(basis) * side - Math.cos(basis) * forward) * stride
  const oldX = visitor.x
  const oldZ = visitor.z

  if (tryStep(cafe, { x: visitor.x + dx, z: visitor.z }, { x: dx, z: 0 }))
    visitor.x += dx
  if (tryStep(cafe, { x: visitor.x, z: visitor.z + dz }, { x: 0, z: dz }))
    visitor.z += dz
  if (cafe.view === 'pixel' && (oldX !== visitor.x || oldZ !== visitor.z)) {
    visitor.yaw = Math.atan2(oldX - visitor.x, oldZ - visitor.z)
  }
  return Math.hypot(visitor.x - oldX, visitor.z - oldZ)
}

function seatOptions(cafe: Cafe): Seat[] {
  return [
    ...chairLayout(cafe).map(({ x, z, yaw }, index): Seat => ({
      x,
      z: index === 1 ? z - 0.04 : z,
      yaw: (yaw * Math.PI) / 180,
      kind: index < layout.windowChairs.length ? 'window' : 'communal',
    })),
    ...layout.benchSeats.map(({ x, z }): Seat => ({
      x,
      z,
      yaw: -Math.PI / 2,
      kind: 'bench',
    })),
  ]
}

function reachableSeat(cafe: Cafe, chairIndex?: number) {
  const { x, z } = position(cafe.visitor)
  const options = seatOptions(cafe)
  const distance = (seat: Seat) => Math.hypot(x - seat.x, z - seat.z)
  const seat =
    chairIndex === undefined
      ? options.sort((a, b) => distance(a) - distance(b))[0]
      : options[chairIndex]
  return seat && distance(seat) < 0.88 ? seat : undefined
}

export function atSeat(cafe: Cafe) {
  return cafe.visitor.kind === 'seated' || reachableSeat(cafe) !== undefined
}

export function changePosture(cafe: Cafe, chairIndex?: number) {
  const visitor = cafe.visitor
  if (visitor.kind === 'seated') {
    const seat = visitor.seat ?? { ...layout.seat, kind: 'window' }
    const standing =
      seat.kind === 'bench'
        ? { x: seat.x + 0.49, z: seat.z }
        : {
            x: seat.x + Math.sin(seat.yaw) * 0.5,
            z: seat.z + Math.cos(seat.yaw) * 0.5,
          }
    const positions = chairLayout(cafe)
    const candidates = [
      standing,
      ...(seat.kind === 'bench'
        ? [
            { x: seat.x + 0.54, z: seat.z - 0.61 },
            { x: seat.x + 0.54, z: seat.z + 0.61 },
          ]
        : []),
      {
        x: seat.x + Math.cos(seat.yaw) * 0.57,
        z: seat.z - Math.sin(seat.yaw) * 0.57,
      },
      {
        x: seat.x - Math.cos(seat.yaw) * 0.57,
        z: seat.z + Math.sin(seat.yaw) * 0.57,
      },
    ]
    const clear = candidates.find(
      (point) =>
        clearsFixed(point) && positions.every((chair) => clears(point, chair)),
    )
    if (!clear) return
    cafe.visitor = { kind: 'walking', ...clear, yaw: visitor.yaw, pitch: 0 }
  } else {
    const seat = reachableSeat(cafe, chairIndex)
    if (seat)
      cafe.visitor = {
        kind: 'seated',
        seat,
        yaw: seat.yaw,
        pitch: layout.seat.pitch,
      }
  }
}

export function location(visitor: Visitor) {
  const { x, z } = position(visitor)
  if (visitor.kind === 'seated') {
    if (visitor.seat?.kind === 'communal') return 'Communal table'
    if (visitor.seat?.kind === 'bench') return 'Wall seat'
    return 'Window seat'
  }
  if (z < -2.55 && x > layout.entry.left - 0.22) return 'By the entrance'
  if (z < -1.82 && x < 2.2) return 'By the window'
  if (x < -1.1 && z > 2.02) return 'By the bookshelf'
  if (z > 2.18) return 'Rear aisle'
  if (x > 1.4 && z > -2.35) return 'At the bar'
  if (x < -2.1 && z < 2.05) return 'Wall tables'
  return 'Communal table'
}
