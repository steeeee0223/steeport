import { expect, test } from '@playwright/test'

import {
  type Cafe,
  canMisoWalk,
  changePosture,
  initialCafe,
  layout,
  walk,
} from '../src/cafe'
import { initialMiso, misoRoutine } from '../src/miso'
import { inReach } from '../src/props'

test('the two camera modes share the table collisions and both side aisles', () => {
  for (const view of ['first-person', 'pixel'] satisfies Cafe['view'][]) {
    const cafe: Cafe = {
      ...initialCafe,
      view,
      orbit: Math.PI,
      visitor: {
        kind: 'walking',
        x: layout.communal.x,
        z: -2,
        yaw: 0,
        pitch: 0,
      },
    }
    const visitor = cafe.visitor
    if (visitor.kind !== 'walking')
      throw new Error('Expected a walking visitor')
    const steps = (side: number, forward: number, count: number) => {
      for (let step = 0; step < count; step++) walk(cafe, side, forward, 0.025)
    }

    steps(0, -1, 40)
    expect(visitor.z).toBeLessThan(-1.68)
    expect(visitor.z).toBeGreaterThan(-1.78)
    steps(1, 0, 45)
    expect(visitor.x).toBeGreaterThan(2)
    steps(0, -1, 80)
    expect(visitor.z).toBeGreaterThan(2.5)
    steps(-1, 0, 83)
    expect(visitor.x).toBeLessThan(-2.2)
    steps(0, 1, 82)
    expect(visitor.z).toBeLessThan(-1.85)
  }
})

test('slides a freestanding chair and seats visitors away from the window', () => {
  const chair = layout.windowChairs[1]
  if (!chair) throw new Error('Expected the middle window chair')
  const cafe: Cafe = {
    ...initialCafe,
    visitor: {
      kind: 'walking',
      x: chair.x,
      z: chair.z + 0.62,
      yaw: 0,
      pitch: 0,
    },
  }
  for (let step = 0; step < 15; step++) walk(cafe, 0, 1, 0.02)
  expect(cafe.chairPositions?.[1]?.z).toBeLessThan(chair.z - 0.03)
  const seat = layout.communalChairs[0]
  if (!seat) throw new Error('Expected a communal chair')
  cafe.visitor = {
    kind: 'walking',
    x: seat.x - 0.55,
    z: seat.z,
    yaw: 0,
    pitch: 0,
  }
  changePosture(cafe)
  expect(cafe.visitor).toMatchObject({
    kind: 'seated',
    seat: { kind: 'communal', x: seat.x },
  })
  changePosture(cafe)
  expect(cafe.visitor).toMatchObject({ kind: 'walking' })
})

test('Miso walks around furniture, lies down away from the cushion and can be pet there', () => {
  const cafe: Cafe = { ...initialCafe, miso: initialMiso() }
  const miso = misoRoutine()
  let previous = { ...cafe.miso }
  const naps: { x: number; z: number }[] = []
  for (let now = 1; now < 110000; now += 25) {
    const pose = miso.update(cafe.miso, now, 0.025, false, (point) =>
      canMisoWalk(cafe, point),
    )
    const { x, z } = cafe.miso
    if (previous.x !== x || previous.z !== z) {
      expect(canMisoWalk(cafe, cafe.miso)).toBe(true)
      previous = { ...cafe.miso }
    }
    if (
      !pose.moving &&
      !naps.some((spot) => Math.hypot(x - spot.x, z - spot.z) < 0.05)
    )
      naps.push({ x, z })
  }
  expect(naps).toHaveLength(4)
  for (const [x, z] of [
    [-3.53, 2.19],
    [-2.34, -2.42],
    [3.05, -2.8],
    [0.44, 2.63],
  ] as const)
    expect(
      naps.some((spot) => Math.hypot(x - spot.x, z - spot.z) < 0.025),
    ).toBe(true)
  cafe.miso = { x: -2.34, y: 0, z: -2.42 }
  cafe.visitor = { kind: 'walking', x: -2.5, z: -1.85, yaw: 0, pitch: 0 }
  expect(inReach(cafe, 'cat')).toBe(false)
  cafe.crouched = true
  expect(inReach(cafe, 'cat')).toBe(true)
})
