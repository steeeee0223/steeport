import layout from '../scene/layout.json' with { type: 'json' }
import { type Point } from './visitor'

export const annexSize = 16
export const starterSize = 4
const starterRow = 4
export const annexEdge = layout.room.width / 2
export const starterFront = layout.room.depth / 2 - 3.1
export const annexFront = starterFront - starterRow
export const annexEntry = annexSize * (starterRow + 2)
const doorwayCenter = starterFront + 2.5
const doorwayWidth = layout.entry.right - layout.entry.left
export const doorway = {
  near: doorwayCenter - doorwayWidth / 2,
  far: doorwayCenter + doorwayWidth / 2,
  height: 2.36,
}
export const cafeDoorLength = doorwayWidth - 0.1
const partitionThickness = 0.1
const edgesPerAxis = annexSize * (annexSize + 1)
export const entryEdge = (starterRow + 2) * (annexSize + 1)
export const annexCells = Array.from(
  { length: annexSize * annexSize },
  (_, index) => index,
)
const starterCells = Array.from(
  { length: starterSize * starterSize },
  (_, index) => starterCell(index),
)

function starterCell(index: number) {
  return (
    (starterRow + Math.floor(index / starterSize)) * annexSize +
    (index % starterSize)
  )
}

export const furnitureTypes = {
  shelf: {
    label: 'Bookshelf',
    model: 'Bookcase',
    icon: 'library-big',
    width: layout.shelf.width,
    depth: layout.shelf.depth,
  },
  desk: {
    label: 'Desk',
    model: 'Wall_table',
    icon: 'desk',
    width: 0.76,
    depth: 0.64,
  },
  lamp: {
    label: 'Floor lamp',
    model: 'Banquette_floor_lamp',
    icon: 'lamp-floor',
    width: 0.47,
    depth: 0.47,
  },
  sofa: {
    label: 'Sofa',
    model: 'Oak_and_wool_banquette',
    icon: 'sofa',
    width: 0.64,
    depth: 1,
  },
  chair: {
    label: 'Chair',
    model: 'Chair',
    icon: 'armchair',
    width: 0.52,
    depth: 0.43,
  },
  table: {
    label: 'Communal table',
    model: 'Communal_table',
    icon: 'table-2',
    width: layout.communal.width,
    depth: layout.communal.depth,
  },
  plant: {
    label: 'Potted plant',
    model: 'Rear_floor_plant',
    icon: 'plant-pot',
    width: 0.9,
    depth: 1.32,
  },
}
export type Furniture = keyof typeof furnitureTypes
export type EdgeTool = 'wall' | 'door' | 'erase-wall'
export type BuildTool =
  'floor' | 'erase-floor' | 'remove' | 'rotate' | EdgeTool | Furniture
export interface BuildCamera {
  center: Point
  orbit: number
  zoom: number
}
export interface BuildPreview {
  camera: BuildCamera
  selection?: {
    target: number
    tool: BuildTool
    valid: boolean
    furniture?: FurnitureProposal
  }
}
export type QuarterTurn = 0 | 1 | 2 | 3

export interface PlacedFurniture {
  cell: number
  kind: Furniture
  turns?: QuarterTurn
}
interface FurnitureProposal {
  item: PlacedFurniture
  original?: PlacedFurniture
}
interface Partition {
  edge: number
  kind: 'wall' | 'door'
}
export interface Annex {
  floor: readonly number[]
  partitions: readonly Partition[]
  furniture: readonly PlacedFurniture[]
  pendingShelves: number
}

export const emptyAnnex: Annex = {
  floor: [],
  partitions: [],
  furniture: [],
  pendingShelves: 0,
}
const storageKey = 'steeport.annex'

export function cellPoint(cell: number): Point {
  return {
    x: annexEdge + (cell % annexSize) + 0.5,
    z: annexFront + Math.floor(cell / annexSize) + 0.5,
  }
}

export function cellEdges(cell: number) {
  const col = cell % annexSize
  const row = Math.floor(cell / annexSize)
  const west = row * (annexSize + 1) + col
  const north = edgesPerAxis + row * annexSize + col
  return [west, west + 1, north, north + annexSize] as const
}

function edgeGeometry(edge: number) {
  const axis = edge < edgesPerAxis ? 'x' : 'z'
  const line = axis === 'x' ? edge : edge - edgesPerAxis
  const stride = axis === 'x' ? annexSize + 1 : annexSize
  const x = annexEdge + (line % stride) + (axis === 'z' ? 0.5 : 0)
  const z = annexFront + Math.floor(line / stride) + (axis === 'x' ? 0.5 : 0)
  return { x, z, axis }
}

export function edgeNeighbors(edge: number) {
  const { x, z, axis } = edgeGeometry(edge)
  const dx = axis === 'x' ? 0.5 : 0
  const dz = axis === 'z' ? 0.5 : 0
  return [
    pointCell({ x: x - dx, z: z - dz }),
    pointCell({ x: x + dx, z: z + dz }),
  ] as const
}

export function edgeAt(point: Point) {
  const cell = edgeCell(point)
  if (cell === undefined) return
  return cellEdges(cell).reduce((closest, edge) => {
    const distance = (id: number) => {
      const { x, z, axis } = edgeGeometry(id)
      return axis === 'x' ? Math.abs(point.x - x) : Math.abs(point.z - z)
    }
    return distance(edge) < distance(closest) ? edge : closest
  })
}

function edgeCell(point: Point) {
  const x = point.x - annexEdge
  const z = point.z - annexFront
  // A ray aimed at an outer edge can land on either side due to rounding.
  const tolerance = 1e-8
  if (
    x < -tolerance ||
    x > annexSize + tolerance ||
    z < -tolerance ||
    z > annexSize + tolerance
  )
    return
  const column = Math.max(0, Math.min(annexSize - 1, Math.floor(x)))
  const row = Math.max(0, Math.min(annexSize - 1, Math.floor(z)))
  return row * annexSize + column
}

export function cafeEntryOpen(annex: Annex) {
  return annex.floor.includes(annexEntry)
}

function cafeWallEdge(edge: number) {
  const { x, z, axis } = edgeGeometry(edge)
  return axis === 'x' && x === annexEdge && z + 0.5 <= layout.room.depth / 2
}

export function partitionSize(edge: number) {
  const { x, z, axis } = edgeGeometry(edge)
  if (edge === entryEdge)
    return { x, z, axis, width: partitionThickness, depth: doorwayWidth }
  const start =
    axis === 'x' && x === annexEdge
      ? Math.max(z - 0.5, layout.room.depth / 2)
      : z - 0.5
  return {
    x,
    z: axis === 'x' ? (start + z + 0.5) / 2 : z,
    axis,
    width: axis === 'x' ? partitionThickness : 1,
    depth: axis === 'x' ? z + 0.5 - start : partitionThickness,
  }
}

export function isEdgeTool(tool: string): tool is EdgeTool {
  return tool === 'wall' || tool === 'door' || tool === 'erase-wall'
}

function furnitureDimensions(kind: Furniture, turns = 0) {
  const item = furnitureTypes[kind]
  return turns % 2 === 1 ? { width: item.depth, depth: item.width } : item
}

export function buildSpan(tool: BuildTool, turns = 0) {
  if (!isFurniture(tool)) return { columns: 1, rows: 1 }
  const { width, depth } = furnitureDimensions(tool, turns)
  return { columns: Math.ceil(width), rows: Math.ceil(depth) }
}

export function buildAnchor(
  annex: Annex,
  tool: BuildTool,
  cell: number,
  turns = 0,
) {
  const { columns, rows } = buildSpan(tool, turns)
  if (columns === 1 && rows === 1) return cell
  const column = cell % annexSize
  const row = Math.floor(cell / annexSize)
  const rightmost = Math.min(column, annexSize - columns)
  const bottom = Math.min(row, annexSize - rows)
  for (let z = bottom; z >= Math.max(0, row - rows + 1); z--) {
    for (let x = rightmost; x >= Math.max(0, column - columns + 1); x--) {
      const anchor = z * annexSize + x
      if (
        tilesAt(anchor, columns, rows).every((tile) =>
          annex.floor.includes(tile),
        )
      )
        return anchor
    }
  }
  return bottom * annexSize + rightmost
}

export function buildCenter(tool: BuildTool, cell: number, turns = 0): Point {
  const { x, z } = cellPoint(cell)
  const { columns, rows } = buildSpan(tool, turns)
  return { x: x + (columns - 1) / 2, z: z + (rows - 1) / 2 }
}

function tilesAt(cell: number, columns: number, rows: number) {
  return Array.from(
    { length: columns * rows },
    (_, offset) =>
      cell + Math.floor(offset / columns) * annexSize + (offset % columns),
  )
}

function occupiedCells({ cell, kind, turns }: PlacedFurniture) {
  const { columns, rows } = buildSpan(kind, turns)
  return tilesAt(cell, columns, rows)
}

export function furnitureAt(annex: Annex, cell: number) {
  return annex.furniture.find((item) => occupiedCells(item).includes(cell))
}

function shelfFacesPositiveZ(annex: Annex, cell: number) {
  const row = occupiedCells({ cell, kind: 'shelf' })
  const occupied = annex.furniture.flatMap(occupiedCells)
  const open = (tile: number, edge: number) =>
    annex.floor.includes(tile) &&
    !occupied.includes(tile) &&
    !annex.partitions.some(
      (partition) => partition.edge === edge && partition.kind === 'wall',
    )
  const negativeZAisleOpen = row.some((tile) =>
    open(tile - annexSize, cellEdges(tile)[2]),
  )
  return (
    !negativeZAisleOpen &&
    row.some((tile) => open(tile + annexSize, cellEdges(tile)[3]))
  )
}

export function furnitureTurns(
  annex: Annex,
  { cell, kind, turns }: PlacedFurniture,
) {
  return turns ?? (kind === 'shelf' && shelfFacesPositiveZ(annex, cell) ? 2 : 0)
}

export function turnFurniture(
  turns: QuarterTurn,
  direction: number,
): QuarterTurn {
  const next = (turns + direction + 4) % 4
  return next === 1 || next === 2 || next === 3 ? next : 0
}

export function furnitureProposal(
  annex: Annex,
  tool: BuildTool,
  cell: number,
  turns: QuarterTurn | undefined,
): FurnitureProposal | undefined {
  if (tool === 'remove' || tool === 'rotate') {
    const original = furnitureAt(annex, cell)
    if (!original) return
    if (tool === 'remove') return { item: original }
    const next = turnFurniture(furnitureTurns(annex, original), turns ?? 3)
    return {
      original,
      item: {
        ...original,
        cell: buildAnchor(annex, original.kind, cell, next),
        turns: next,
      },
    }
  }
  if (isFurniture(tool))
    return {
      item: { cell: buildAnchor(annex, tool, cell, turns), kind: tool, turns },
    }
}

export function pointCell(point: Point) {
  return gridIndex(point, floorGrid)
}

type BuildGrid = Point & { size: number }

const floorGrid: BuildGrid = { x: annexEdge, z: annexFront, size: annexSize }
const cornerGrid: BuildGrid = {
  x: annexEdge - 0.5,
  z: annexFront - 0.5,
  size: annexSize + 1,
}

function gridIndex(point: Point, grid: BuildGrid) {
  const column = Math.floor(point.x - grid.x)
  const row = Math.floor(point.z - grid.z)
  if (column >= 0 && column < grid.size && row >= 0 && row < grid.size)
    return row * grid.size + column
}

export function crossedFloorCells(from: Point | undefined, to: Point) {
  return crossedGridCells(floorGrid, from, to)
}

export function crossedWallEdges(from: Point | undefined, to: Point) {
  if (!from || edgeCell(from) === undefined) {
    const edge = edgeAt(to)
    return edge === undefined ? [] : [edge]
  }
  if (edgeCell(to) === undefined) return []

  const [start, ...corners] = crossedGridCells(cornerGrid, from, to)
  if (start === undefined) return []
  const edges: number[] = []
  let previous = start
  for (const corner of corners) {
    const first = Math.min(previous, corner)
    const row = Math.floor(first / cornerGrid.size)
    const sameRow =
      row === Math.floor(Math.max(previous, corner) / cornerGrid.size)
    edges.push(
      sameRow
        ? edgesPerAxis + row * annexSize + (first % cornerGrid.size)
        : first,
    )
    previous = corner
  }
  return edges
}

function crossedGridCells(grid: BuildGrid, from: Point | undefined, to: Point) {
  const end = gridIndex(to, grid)
  if (end === undefined) return []
  if (!from) return [end]
  const start = gridIndex(from, grid)
  if (start === undefined || start === end) return [end]

  let column = start % grid.size
  let row = Math.floor(start / grid.size)
  const endColumn = end % grid.size
  const endRow = Math.floor(end / grid.size)
  const dx = to.x - from.x
  const dz = to.z - from.z
  const stepX = Math.sign(dx)
  const stepZ = Math.sign(dz)
  const intervalX = 1 / Math.abs(dx)
  const intervalZ = 1 / Math.abs(dz)
  let nextX = dx ? (grid.x + column + Number(dx > 0) - from.x) / dx : Infinity
  let nextZ = dz ? (grid.z + row + Number(dz > 0) - from.z) / dz : Infinity
  const cells = [start]
  while (column !== endColumn || row !== endRow) {
    if (row === endRow || (column !== endColumn && nextX <= nextZ)) {
      column += stepX
      nextX += intervalX
    } else {
      row += stepZ
      nextZ += intervalZ
    }
    cells.push(row * grid.size + column)
  }
  return cells
}

function flood(
  open: Set<number>,
  start: number,
  barriers: ReadonlySet<number>,
) {
  const visited = [start]
  open.delete(start)
  for (const cell of visited) {
    for (const edge of cellEdges(cell)) {
      if (barriers.has(edge)) continue
      for (const next of edgeNeighbors(edge)) {
        if (next !== undefined && open.delete(next)) visited.push(next)
      }
    }
  }
}

function roomCount(open: Set<number>, barriers: ReadonlySet<number>) {
  let count = 0
  for (const cell of open) {
    flood(open, cell, barriers)
    count++
  }
  return count
}

function perimeter(floor: readonly number[]): Partition[] {
  return floor.flatMap((cell) =>
    cellEdges(cell).flatMap((edge): Partition[] =>
      cafeWallEdge(edge) ||
      edgeNeighbors(edge).every(
        (neighbor) => neighbor !== undefined && floor.includes(neighbor),
      )
        ? []
        : [{ edge, kind: 'wall' }],
    ),
  )
}

export function coveredFloor(annex: Annex) {
  const barriers = new Set(annex.partitions.map(({ edge }) => edge))
  const inside = new Set(annexCells)
  for (const cell of inside) {
    const exposed = cellEdges(cell).some(
      (edge) =>
        !barriers.has(edge) &&
        !cafeWallEdge(edge) &&
        edgeNeighbors(edge).includes(undefined),
    )
    if (exposed) flood(inside, cell, barriers)
  }
  return annex.floor.filter((cell) => inside.has(cell))
}

export function isBuildTool(value: string): value is BuildTool {
  return (
    value === 'floor' ||
    value === 'erase-floor' ||
    isEdgeTool(value) ||
    value === 'remove' ||
    value === 'rotate' ||
    isFurniture(value)
  )
}

export function canAttachRoom(annex: Annex) {
  return annex.floor.length === 0 && annex.partitions.length === 0
}

export function isFurniture(value: unknown): value is Furniture {
  return typeof value === 'string' && Object.hasOwn(furnitureTypes, value)
}

export function buildAnnex(
  annex: Annex,
  tool: BuildTool | 'room',
  cell: number,
  visitor: Point,
  turns?: QuarterTurn,
) {
  return prepareBuild(annex, tool, cell, turns).apply(visitor)
}

export function prepareBuild(
  annex: Annex,
  tool: BuildTool | 'room',
  cell: number,
  turns?: QuarterTurn,
) {
  const furniture =
    tool === 'room' ? undefined : furnitureProposal(annex, tool, cell, turns)
  return {
    furniture,
    apply: (visitor: Point) =>
      applyBuild(annex, { tool, cell, turns, furniture }, visitor),
  }
}

function applyBuild(
  annex: Annex,
  {
    tool,
    cell,
    turns,
    furniture,
  }: {
    tool: BuildTool | 'room'
    cell: number
    turns?: QuarterTurn
    furniture?: FurnitureProposal
  },
  visitor: Point,
): { annex: Annex; message: string } | { message: string } {
  if (tool === 'remove') {
    const item = furniture?.item
    if (!item) return { message: 'Select a piece of furniture to remove.' }
    return {
      annex: {
        ...annex,
        furniture: annex.furniture.filter((placed) => placed !== item),
      },
      message: furnitureTypes[item.kind].label + ' removed.',
    }
  }
  if (tool === 'room') {
    return canAttachRoom(annex)
      ? {
          annex: {
            ...emptyAnnex,
            floor: starterCells,
            partitions: perimeter(starterCells),
          },
          message:
            'Room attached. Choose a row of four floor tiles for the bookshelf.',
        }
      : { message: 'Undo the floor tiles before attaching a ready-made room.' }
  }
  if (isEdgeTool(tool)) return editPartition(annex, tool, cell)
  if (tool === 'floor') {
    if (annex.floor.includes(cell))
      return { message: 'That tile already has a floor.' }
    return {
      annex: { ...annex, floor: [...annex.floor, cell] },
      message:
        cell === annexEntry
          ? 'Floor placed. The café passage is open.'
          : 'Floor placed.',
    }
  }
  if (tool === 'erase-floor') {
    if (!annex.floor.includes(cell))
      return { message: 'Select a floor tile to remove.' }
    if (furnitureAt(annex, cell))
      return { message: 'Remove the furniture on this tile first.' }
    return {
      annex: { ...annex, floor: annex.floor.filter((tile) => tile !== cell) },
      message: 'Floor removed.',
    }
  }
  if (!furniture) return { message: 'Select a piece of furniture to rotate.' }
  const { original, item } = furniture
  if (original && turns === 0) return { message: 'Choose a different angle.' }
  const placement = placeFurniture(annex, item, pointCell(visitor), original)
  if ('annex' in placement && tool === 'shelf' && annex.pendingShelves > 0) {
    return {
      ...placement,
      annex: { ...placement.annex, pendingShelves: annex.pendingShelves - 1 },
    }
  }
  return placement
}

function editPartition(annex: Annex, tool: EdgeTool, edge: number) {
  const current = annex.partitions.find((partition) => partition.edge === edge)
  if (tool === 'erase-wall') {
    if (!current) return { message: 'Select a wall or door to remove.' }
    return {
      annex: {
        ...annex,
        partitions: annex.partitions.filter(
          (partition) => partition !== current,
        ),
      },
      message: current.kind === 'wall' ? 'Wall removed.' : 'Door removed.',
    }
  }
  if (current?.kind === tool)
    return { message: 'That edge already has a ' + tool + '.' }
  if (edge !== entryEdge && cafeWallEdge(edge))
    return { message: 'The café already has a wall on this edge.' }
  const adjacent = edgeNeighbors(edge)
  if (
    annex.furniture.some((item) => {
      const occupied = occupiedCells(item)
      return adjacent.every(
        (tile) => tile !== undefined && occupied.includes(tile),
      )
    })
  )
    return { message: 'Move the furniture across this edge first.' }
  return {
    annex: {
      ...annex,
      partitions: [
        ...annex.partitions.filter((partition) => partition !== current),
        { edge, kind: tool },
      ],
    },
    message: tool === 'wall' ? 'Wall placed.' : 'Door installed.',
  }
}

function placeFurniture(
  annex: Annex,
  item: PlacedFurniture,
  visitorCell?: number,
  replacing?: PlacedFurniture,
): { annex: Annex; message: string } | { message: string } {
  const { columns, rows } = buildSpan(item.kind, item.turns)
  const tiles = tilesAt(item.cell, columns, rows)
  if (
    (item.cell % annexSize) + columns > annexSize ||
    Math.floor(item.cell / annexSize) + rows > annexSize ||
    tiles.some((tile) => !annex.floor.includes(tile))
  )
    return {
      message:
        item.kind === 'shelf'
          ? 'The bookshelf needs a complete row of four floor tiles.'
          : columns * rows === 1
            ? 'Place a floor tile here first.'
            : `${furnitureTypes[item.kind].label} needs ${columns} × ${rows} floor tiles.`,
    }
  if (tiles.includes(annexEntry)) return { message: 'Keep the doorway clear.' }
  const open = new Set(annex.floor)
  for (const placed of annex.furniture)
    if (placed !== replacing)
      for (const tile of occupiedCells(placed)) open.delete(tile)
  if (tiles.some((tile) => !open.has(tile) || tile === visitorCell))
    return { message: 'That tile is occupied.' }
  if (
    annex.partitions.some(({ edge }) =>
      edgeNeighbors(edge).every(
        (tile) => tile !== undefined && tiles.includes(tile),
      ),
    )
  )
    return { message: 'The furniture would cross a wall or door.' }
  const barriers = new Set(
    annex.partitions
      .filter(({ kind }) => kind === 'wall')
      .map(({ edge }) => edge),
  )
  const before = new Set(open)
  if (replacing)
    for (const tile of occupiedCells(replacing)) before.delete(tile)
  for (const tile of tiles) open.delete(tile)
  if (roomCount(open, barriers) > roomCount(before, barriers))
    return { message: 'That would block the walkway.' }
  return {
    annex: {
      ...annex,
      furniture: replacing
        ? annex.furniture.map((placed) =>
            placed === replacing ? item : placed,
          )
        : [...annex.furniture, item],
    },
    message:
      furnitureTypes[item.kind].label + (replacing ? ' rotated.' : ' placed.'),
  }
}

export function canWalkAnnex(
  annex: Annex,
  point: Point,
  radius: number,
  closedDoors?: ReadonlySet<number>,
) {
  if (point.x < annexEdge - radius) return false
  if (
    Math.abs(point.x - annexEdge) < radius &&
    (!cafeEntryOpen(annex) ||
      point.z < doorway.near + radius ||
      point.z > doorway.far - radius)
  )
    return false
  for (const { edge, kind } of annex.partitions) {
    if (kind === 'wall') {
      const wall = partitionSize(edge)
      if (clips(point, wall, wall.width, wall.depth, radius)) return false
    } else if (doorClips(edge, !closedDoors?.has(edge), point, radius))
      return false
  }

  const minX = Math.max(annexEdge, point.x - radius)
  const minZ = point.z - radius
  for (
    let x = Math.floor(minX - annexEdge);
    x <= Math.floor(point.x + radius - annexEdge);
    x++
  ) {
    for (
      let z = Math.floor(minZ - annexFront);
      z <= Math.floor(point.z + radius - annexFront);
      z++
    ) {
      const center = { x: annexEdge + x + 0.5, z: annexFront + z + 0.5 }
      const cell = pointCell(center)
      if (
        (cell === undefined || !annex.floor.includes(cell)) &&
        clips(point, center, 1, 1, radius)
      )
        return false
    }
  }
  return annex.furniture.every(({ cell, kind, turns }) => {
    const { width, depth } = furnitureDimensions(kind, turns)
    const center = buildCenter(kind, cell, turns)
    return !clips(point, center, width, depth, radius)
  })
}

export function annexDoor(edge: number) {
  const { x, z, axis, width, depth } = partitionSize(edge)
  const acrossZ = axis === 'x'
  const length = (acrossZ ? depth : width) - 0.1
  return {
    length,
    pivot: {
      x: x - (acrossZ ? 0 : length / 2),
      z: z - (acrossZ ? length / 2 : 0),
    },
    shut: acrossZ ? -Math.PI / 2 : 0,
    swing: acrossZ ? Math.PI / 2 : -Math.PI / 2,
  }
}

export function doorClips(
  edge: number,
  open: boolean,
  point: Point,
  radius: number,
) {
  const { pivot, length, shut, swing } = annexDoor(edge)
  const alongX = shut + (open ? swing : 0) === 0
  const center = {
    x: pivot.x + (alongX ? length / 2 : 0),
    z: pivot.z + (alongX ? 0 : length / 2),
  }
  return clips(
    point,
    center,
    alongX ? length : 0.13,
    alongX ? 0.13 : length,
    radius,
  )
}

function clips(
  point: Point,
  center: Point,
  width: number,
  depth: number,
  radius: number,
) {
  const dx = Math.max(0, Math.abs(center.x - point.x) - width / 2)
  const dz = Math.max(0, Math.abs(center.z - point.z) - depth / 2)
  return Math.hypot(dx, dz) < radius
}

type SaveVersion = 1 | 2 | 3 | 4 | 5

function isSaveVersion(value: unknown): value is SaveVersion {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

function readAnnex(value: unknown): Annex {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    !isSaveVersion(value.version) ||
    !('floor' in value) ||
    !Array.isArray(value.floor) ||
    !('furniture' in value) ||
    !Array.isArray(value.furniture)
  )
    return emptyAnnex

  const version = value.version
  const size = version < 4 ? starterSize : annexSize
  const remap = version < 4 ? starterCell : (cell: number) => cell
  const floor = value.floor
    .filter(isCell)
    .filter((cell) => cell >= 0 && cell < size * size)
    .map(remap)
  const floorSet = new Set(floor)
  if (floor.length !== value.floor.length || floor.length !== floorSet.size)
    return emptyAnnex
  const furniture = restoreFurniture(value.furniture, {
    version,
    size,
    remap,
    floor: floorSet,
  })
  if (!furniture) return emptyAnnex

  const partitions =
    version === 5
      ? readPartitions('partitions' in value ? value.partitions : undefined)
      : perimeter(floor)
  if (!partitions) return emptyAnnex
  if (version < 5 && 'door' in value && value.door === true)
    partitions.push({ edge: entryEdge, kind: 'door' })

  const pendingShelves =
    version >= 3 && 'pendingShelves' in value ? value.pendingShelves : 0
  if (
    typeof pendingShelves !== 'number' ||
    !Number.isInteger(pendingShelves) ||
    pendingShelves < 0 ||
    pendingShelves > annexCells.length
  )
    return emptyAnnex

  const annex = { floor, partitions, furniture, pendingShelves }
  return version < 3 ? upgradeShelves(annex) : annex
}

function readPartitions(value: unknown) {
  if (!Array.isArray(value)) return []
  const partitions = value.filter(isPartition)
  if (
    partitions.length === value.length &&
    partitions.length === new Set(partitions.map(({ edge }) => edge)).size
  )
    return partitions
}

function restoreFurniture(
  saved: readonly unknown[],
  {
    version,
    size,
    remap,
    floor,
  }: {
    version: SaveVersion
    size: number
    remap: (cell: number) => number
    floor: ReadonlySet<number>
  },
) {
  const furniture: PlacedFurniture[] = []
  const occupied = new Set<number>()
  for (const item of saved) {
    if (!isPlacedFurniture(item)) return
    const { cell, kind, turns } = item
    const span = buildSpan(kind, turns)
    const columns = kind === 'shelf' && version < 3 ? version : span.columns
    if (
      cell < 0 ||
      cell >= size * size ||
      (cell % size) + columns > size ||
      Math.floor(cell / size) + span.rows > size
    )
      return
    const anchor = remap(cell)
    for (const tile of tilesAt(anchor, columns, span.rows)) {
      if (tile === annexEntry || !floor.has(tile) || occupied.has(tile)) return
      occupied.add(tile)
    }
    furniture.push({ cell: anchor, kind, turns })
  }
  return furniture
}

export function loadAnnex(): Annex {
  try {
    return readAnnex(JSON.parse(localStorage.getItem(storageKey) ?? 'null'))
  } catch {
    return emptyAnnex
  }
}

function upgradeShelves(annex: Annex): Annex {
  let upgraded: Annex = {
    ...annex,
    furniture: annex.furniture.filter(({ kind }) => kind !== 'shelf'),
  }
  for (const { kind, cell } of annex.furniture) {
    if (kind !== 'shelf') continue
    const origin = cellPoint(cell)
    const distance = (anchor: number) => {
      const center = buildCenter(kind, anchor)
      return Math.abs(center.x - origin.x) + Math.abs(center.z - origin.z)
    }
    const candidates = [
      ...new Set(annex.floor.map((tile) => buildAnchor(annex, kind, tile))),
    ].sort((a, b) => distance(a) - distance(b))
    let placed = false
    for (const anchor of candidates) {
      const placement = placeFurniture(upgraded, { kind, cell: anchor })
      if (!('annex' in placement)) continue
      upgraded = placement.annex
      placed = true
      break
    }
    if (!placed)
      upgraded = { ...upgraded, pendingShelves: upgraded.pendingShelves + 1 }
  }
  return upgraded
}

function isCell(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isPlacedFurniture(value: unknown): value is PlacedFurniture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'cell' in value &&
    isCell(value.cell) &&
    'kind' in value &&
    isFurniture(value.kind) &&
    (!('turns' in value) ||
      value.turns === 0 ||
      value.turns === 1 ||
      value.turns === 2 ||
      value.turns === 3)
  )
}

function isPartition(value: unknown): value is Partition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'edge' in value &&
    isCell(value.edge) &&
    value.edge >= 0 &&
    value.edge < edgesPerAxis * 2 &&
    (value.edge === entryEdge || !cafeWallEdge(value.edge)) &&
    'kind' in value &&
    (value.kind === 'wall' || value.kind === 'door')
  )
}

export function saveAnnex(annex: Annex) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 5, ...annex }))
    return true
  } catch {
    return false
  }
}
