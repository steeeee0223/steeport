import layout from '../scene/layout.json' with { type: 'json' }
import { type Point } from './visitor'

const home = layout.props.cat

export function initialMiso() {
  return { x: home.x, y: home.y, z: home.z }
}

type Miso = ReturnType<typeof initialMiso>
interface Stop extends Point {
  rest?: number
}
const stops: Record<string, Stop> = {
  bed: { ...home, rest: 15000 },
  step: { x: -2.96, z: home.z },
  westBack: { x: -2.5, z: 2.23 },
  westFront: { x: -2.5, z: -1.84 },
  window: { x: -2.34, z: -2.42, rest: 11000 },
  eastFront: { x: 2.11, z: -1.84 },
  entrance: { x: 3.05, z: -2.8, rest: 8500 },
  eastBack: { x: 2.11, z: 2.23 },
  rear: { x: 0.44, z: 2.63, rest: 9500 },
}
const links = [
  ['bed', 'step', 'westBack', 'westFront', 'eastFront', 'eastBack', 'westBack'],
  ['westFront', 'window'],
  ['eastFront', 'entrance'],
  ['eastBack', 'rear', 'westBack'],
]
const destinations = ['window', 'entrance', 'rear', 'bed']

type Phase =
  | { kind: 'rest'; until: number }
  | { kind: 'rise'; at: number; path: string[] }
  | { kind: 'walk'; path: string[] }
  | { kind: 'settle'; at: number }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
const ease = (p: number) => {
  const t = Math.max(0, Math.min(p, 1))
  return t * t * (3 - 2 * t)
}

export function misoRoutine() {
  let phase: Phase = { kind: 'rest', until: 0 }
  let last = 'bed'
  let next = 0
  let heading = (Math.PI * 2) / 15
  let upright = 0
  let stride = 0
  let gait = 0
  let speed = 0
  let blockedSince = 0
  let petAt = -Infinity

  function update(
    miso: Miso,
    now: number,
    dt: number,
    reduce: boolean,
    clear: (point: Point) => boolean,
  ) {
    if (phase.kind === 'rest' && !phase.until) phase.until = now + 6500
    const petTime = Math.min(1, (now - petAt) / 850)
    if (reduce) {
      upright = stride = speed = 0
      if (phase.kind !== 'rest') phase = { kind: 'rest', until: now + 6500 }
    } else {
      switch (phase.kind) {
        case 'rest': {
          upright = stride = 0
          if (now < phase.until || petTime < 1) break
          const target = destinations[next % destinations.length]
          const path = target && route(last, target, clear)
          if (!path || !path.length) {
            next++
            phase.until = now + 1900
            break
          }
          const previous = stops[last]
          if (previous && distance(miso, previous) > 0.02) {
            if (!clearSegment(miso, previous, clear)) {
              phase.until = now + 1900
              break
            }
            path.unshift(last)
          }
          phase = { kind: 'rise', at: now, path }
          break
        }
        case 'rise': {
          upright = ease((now - phase.at) / 890)
          if (upright < 1) break
          phase = { kind: 'walk', path: phase.path }
          break
        }
        case 'walk': {
          if (petTime < 1) {
            speed = 0
            stride *= Math.exp(-10 * dt)
            break
          }
          const [name] = phase.path
          const target = name && stops[name]
          if (!target) {
            phase = { kind: 'settle', at: now }
            break
          }
          const gap = distance(miso, target)
          if (gap < 0.012) {
            last = name
            phase.path.shift()
            if (!phase.path.length) {
              if (name === destinations[next % destinations.length]) next++
              phase = { kind: 'settle', at: now }
            }
            break
          }
          const angle = Math.atan2(miso.z - target.z, target.x - miso.x)
          const turn = Math.atan2(
            Math.sin(angle - heading),
            Math.cos(angle - heading),
          )
          const pivot = Math.sign(turn) * Math.min(Math.abs(turn), dt * 4.2)
          heading += pivot
          const goalSpeed =
            0.58 * ease(gap / 0.24) * ease(1 - Math.abs(turn) / 1.5)
          speed += (Math.max(0.09, goalSpeed) - speed) * (1 - Math.exp(-7 * dt))
          const step = Math.min(gap, Math.abs(turn) > 0.65 ? 0 : speed * dt)
          const point = {
            x: miso.x + ((target.x - miso.x) * step) / gap,
            z: miso.z + ((target.z - miso.z) * step) / gap,
          }
          if (!clear(point)) {
            blockedSince ||= now
            if (now - blockedSince > 750) {
              phase.path = [last]
              if (name === last) phase = { kind: 'settle', at: now }
              blockedSince = 0
            }
          } else {
            blockedSince = 0
            Object.assign(miso, point)
            gait += (step + Math.abs(pivot) * 0.13) / 0.29
          }
          stride +=
            ((!blockedSince && step > 0
              ? Math.min(1, speed / 0.37)
              : Math.abs(pivot) > 0.004
                ? 0.35
                : 0) -
              stride) *
            (1 - Math.exp(-10 * dt))
          const onBed = Math.abs(miso.z - home.z) < 0.06
          miso.y = onBed
            ? home.y * ease((0.48 - Math.abs(miso.x - home.x)) / 0.22)
            : 0
          break
        }
        case 'settle': {
          upright = 1 - ease((now - phase.at) / 1020)
          stride *= Math.exp(-10 * dt)
          speed = 0
          if (!upright)
            phase = { kind: 'rest', until: now + (stops[last]?.rest ?? 4500) }
          break
        }
      }
    }
    const pet = reduce || petTime === 1 ? 0 : Math.sin(Math.PI * petTime)
    const moving = !reduce && (phase.kind !== 'rest' || petTime < 1)
    return {
      heading,
      upright,
      stride,
      gait,
      pet,
      moving,
      wakeAt: !reduce && phase.kind === 'rest' ? phase.until : Infinity,
    }
  }

  return {
    update,
    pet: (now: number) => {
      petAt = now
    },
  }
}

function clearSegment(a: Point, b: Point, clear: (point: Point) => boolean) {
  const steps = Math.ceil(distance(a, b) / 0.13)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    if (!clear({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }))
      return false
  }
  return true
}

function route(from: string, to: string, clear: (point: Point) => boolean) {
  const queue = [[from]]
  const visited = new Set([from])
  for (const path of queue) {
    const last = path.at(-1)
    if (last === to) return path.slice(1)
    const a = last && stops[last]
    if (!a) continue
    for (const link of links) {
      for (const [index, name] of link.entries()) {
        if (name !== last) continue
        for (const other of [link[index - 1], link[index + 1]]) {
          const b = other && stops[other]
          if (!other || !b || visited.has(other)) continue
          if (!clearSegment(a, b, clear)) continue
          visited.add(other)
          queue.push([...path, other])
        }
      }
    }
  }
}
