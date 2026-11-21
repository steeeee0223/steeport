import { expect, test } from '@playwright/test'

import {
  annexEdge,
  annexEntry,
  annexSize,
  buildAnnex,
  canWalkAnnex,
  cellEdges,
  cellPoint,
  coveredFloor,
  furnitureAt,
  furnitureTurns,
  partitionSize,
  starterSize,
} from '../src/annex'
import {
  type Cafe,
  canLeoWalk,
  changePosture,
  initialCafe,
  layout,
  walk,
} from '../src/cafe'
import { initialLeo, leoRoutine } from '../src/leo'
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

test('both camera modes use the built doorway and furniture collisions', () => {
  const entry = cellPoint(annexEntry)
  const start = { x: annexEdge - 0.8, z: entry.z }
  const built = buildAnnex(initialCafe.annex, 'room', annexEntry, start)
  if (!('annex' in built)) throw new Error('Expected the room to attach')
  const furnished = buildAnnex(built.annex, 'desk', annexEntry + 2, start)
  if (!('annex' in furnished)) throw new Error('Expected the desk to fit')

  for (const view of ['first-person', 'pixel'] satisfies Cafe['view'][]) {
    const visitor = {
      kind: 'walking',
      ...start,
      yaw: 0,
      pitch: 0,
    } satisfies Cafe['visitor']
    const cafe: Cafe = { ...initialCafe, visitor, view, orbit: Math.PI }
    const moveAcross = (side: number) => {
      for (let step = 0; step < 75; step++) walk(cafe, side, 0, 0.025)
    }
    moveAcross(1)
    expect(visitor.x).toBeLessThan(annexEdge)
    cafe.annex = furnished.annex
    moveAcross(1)
    expect(visitor.x).toBeGreaterThan(annexEdge + 1)
    expect(visitor.x).toBeLessThan(cellPoint(annexEntry + 2).x - 0.38)
    expect(visitor.z).toBeCloseTo(entry.z)
    moveAcross(-1)
    expect(visitor.x).toBeLessThan(annexEdge - 0.5)
  }
})

test('full-size bookshelves span four tiles and face the aisle from either side', () => {
  const visitor = { x: 0, z: 0 }
  const room = buildAnnex(initialCafe.annex, 'room', annexEntry, visitor)
  if (!('annex' in room)) throw new Error('Expected the room to attach')
  for (const row of [0, 3]) {
    const anchor = annexEntry + (row - 2) * annexSize
    const shelf = buildAnnex(room.annex, 'shelf', anchor + 3, visitor)
    if (!('annex' in shelf)) throw new Error('Expected the bookshelf to fit')
    expect(shelf.annex.furniture).toEqual([{ cell: anchor, kind: 'shelf' }])
    const placed = furnitureAt(shelf.annex, anchor)
    if (!placed) throw new Error('Expected the bookshelf')
    expect(furnitureTurns(shelf.annex, placed)).toBe(row === 0 ? 2 : 0)
    expect(canWalkAnnex(shelf.annex, cellPoint(annexEntry), 0.18)).toBe(true)
    for (let column = 0; column < starterSize; column++) {
      expect(canWalkAnnex(shelf.annex, cellPoint(anchor + column), 0.18)).toBe(
        false,
      )
    }
  }
})

test('open floors, interior walls and doors have independent traversal and roof coverage', () => {
  const visitor = { x: 0, z: 0 }
  const entrance = buildAnnex(initialCafe.annex, 'floor', annexEntry, visitor)
  if (!('annex' in entrance)) throw new Error('Expected an open entrance')
  const adjacent = buildAnnex(entrance.annex, 'floor', annexEntry + 1, visitor)
  if (!('annex' in adjacent)) throw new Error('Expected more floor')
  expect(adjacent.annex.partitions).toEqual([])
  expect(coveredFloor(adjacent.annex)).toEqual([])
  const edge = cellEdges(annexEntry)[1]
  const crossing = partitionSize(edge)
  expect(canWalkAnnex(adjacent.annex, crossing, 0.18)).toBe(true)
  const wall = buildAnnex(adjacent.annex, 'wall', edge, visitor)
  if (!('annex' in wall)) throw new Error('Expected a partition')
  expect(canWalkAnnex(wall.annex, crossing, 0.18)).toBe(false)
  const door = buildAnnex(wall.annex, 'door', edge, visitor)
  if (!('annex' in door)) throw new Error('Expected an open door')
  expect(canWalkAnnex(door.annex, crossing, 0.18)).toBe(true)
  expect(canWalkAnnex(door.annex, crossing, 0.18, new Set([edge]))).toBe(false)

  const room = buildAnnex(initialCafe.annex, 'room', annexEntry, visitor)
  if (!('annex' in room)) throw new Error('Expected an attached room')
  expect(coveredFloor(room.annex)).toEqual(room.annex.floor)
  const opened = buildAnnex(
    room.annex,
    'erase-wall',
    cellEdges(annexEntry + 3)[1],
    visitor,
  )
  if (!('annex' in opened)) throw new Error('Expected to remove a wall')
  expect(coveredFloor(opened.annex)).toEqual([])
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

test('Leo walks around furniture, lies down away from the cushion and can be pet there', () => {
  const cafe: Cafe = { ...initialCafe, leo: initialLeo() }
  const leo = leoRoutine()
  let previous = { ...cafe.leo }
  const naps: { x: number; z: number }[] = []
  for (let now = 1; now < 110000; now += 25) {
    const pose = leo.update(cafe.leo, now, 0.025, false, (point) =>
      canLeoWalk(cafe, point),
    )
    const { x, z } = cafe.leo
    if (previous.x !== x || previous.z !== z) {
      expect(canLeoWalk(cafe, cafe.leo)).toBe(true)
      previous = { ...cafe.leo }
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
  cafe.leo = { x: -2.34, y: 0, z: -2.42 }
  cafe.visitor = { kind: 'walking', x: -2.5, z: -1.85, yaw: 0, pitch: 0 }
  expect(inReach(cafe, 'cat')).toBe(false)
  cafe.crouched = true
  expect(inReach(cafe, 'cat')).toBe(true)
})
