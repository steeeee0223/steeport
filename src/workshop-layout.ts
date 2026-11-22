import layout from '../scene/layout.json' with { type: 'json' }
import type { Point } from './visitor'

export const streetFront = -layout.room.depth / 2
export const workshopBounds = {
  left: -11.6,
  right: -5.78,
  front: streetFront,
  back: 1.75,
}
export const workshopDoor = { left: -9.28, right: -7.92 }
export const workshopHinge = {
  x: workshopDoor.right - 0.063,
  z: streetFront - 0.12,
}
export const workshopDoorWidth = workshopHinge.x - workshopDoor.left - 0.063
export const workshopDoorCode = '0842'

export function workshopDoorDistance({ x, z }: Point) {
  return Math.hypot(
    x - (workshopDoor.left + workshopDoor.right) / 2,
    z - streetFront,
  )
}
export const workshopBench = layout.workshopBench
export const workshopDesks = layout.workshopDesks
export const workshopChairs = [
  { x: -10.12, z: -0.13, width: 0.8, depth: 0.7 },
  { x: -7.38, z: -0.13, width: 0.8, depth: 0.7 },
] as const
export const workshopChairTravel = { side: 0.53, back: 0.64, forward: 0.18 }
export const workshopMonitors = [
  { x: -10.04, y: 1.23, z: 0.84 },
  { x: -7.88, y: 1.23, z: 0.84 },
  { x: -6.88, y: 1.23, z: 0.84 },
] as const
export const workshopMonitorIds = [0, 1, 2] as const
export type WorkshopMonitor = (typeof workshopMonitorIds)[number]

export function insideWorkshop({ x, z }: Point) {
  const { left, right, front, back } = workshopBounds
  return x > left && x < right && z >= front && z < back
}

export function onStreet({ x, z }: Point) {
  return x > -12.1 && x < 5.52 && z >= -6.72 && z < streetFront
}

export function nearWorkbench({ x, z }: Point, seat: Point) {
  return (
    insideWorkshop({ x, z }) &&
    z < 0.31 &&
    Math.hypot(x - seat.x, z - seat.z) < 0.86
  )
}
