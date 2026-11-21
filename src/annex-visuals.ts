import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  type Raycaster,
  Vector3,
} from 'three'

import layout from '../scene/layout.json' with { type: 'json' }
import {
  type Annex,
  type BuildPreview,
  type Furniture,
  annexCells,
  annexDoor,
  annexEdge,
  annexEntry,
  annexSize,
  buildAnchor,
  buildCenter,
  buildSpan,
  cafeDoorLength,
  cafeEntryOpen,
  cellPoint,
  coveredFloor,
  doorway,
  edgeNeighbors,
  entryEdge,
  furnitureTurns,
  furnitureTypes,
  isEdgeTool,
  partitionSize,
} from './annex'
import { type Cafe } from './cafe'
import { type floorLamps } from './floor-lamps'

export interface AnnexFixture {
  kind: 'door' | 'lamp' | 'seat'
  target: number
}

export function annexVisuals(
  node: (name: string) => Object3D,
  rightPanels: { plaster: Object3D; baseboard: Object3D },
  addLamp: ReturnType<typeof floorLamps>['add'],
) {
  const root = new Group()
  const room = new Group()
  const cafeWall = new Group()
  const roof = new Group()
  const selection = new Group()
  const lot = new Group()
  const pickTargets = new Map<Object3D, number>()
  const pickWalls = new Map<Object3D, number>()
  const fixtureMeshes = new Map<Object3D, AnnexFixture>()
  const fixtures = new Map<AnnexFixture, Object3D>()
  const doors = new Map<number, Object3D>()
  const lamps = new Map<number, ReturnType<typeof addLamp>>()
  const furnitureRoots = new Map<number, Object3D>()
  const ghosts = new Map<Furniture, Object3D>()
  const previewRoot = new Group()
  root.add(lot, room, cafeWall, roof, selection, previewRoot)
  const geometry = new BoxGeometry(1, 1, 1)
  const overlay = {
    plot: new MeshBasicMaterial({ color: '#8f785d' }),
    entry: new MeshBasicMaterial({ color: '#c6ab71' }),
    selection: new MeshBasicMaterial({ color: '#334f3e' }),
    wallEdge: new MeshBasicMaterial({ color: '#655242' }),
    ghost: new MeshBasicMaterial({
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  }

  const furniture = new Map(
    Object.entries(furnitureTypes).map(([kind, item]) => [
      kind,
      model(item.model),
    ]),
  )
  const door = model('EntryDoor')
  const threshold = model('Door_threshold')
  const plaster = surface(rightPanels.plaster)
  const translucentWall = plaster.clone()
  translucentWall.transparent = true
  translucentWall.opacity = 0.43
  translucentWall.depthWrite = false
  const trim = surface(rightPanels.baseboard)
  const ceiling = surface(node('Ceiling_panel'))
  const floorTiles = new Map<string, MeshStandardMaterial>()
  node('Quarry_tiles').traverse((object) => {
    if (!(object instanceof Mesh)) return
    const original = surface(object)
    if (floorTiles.has(original.name)) return
    const annexTileMaterial = original.clone()
    annexTileMaterial.aoMap = null
    floorTiles.set(original.name, annexTileMaterial)
  })
  const tileMaterials = [...floorTiles.values()]

  function model(name: string) {
    const copy = node(name).clone()
    copy.traverse((object) => {
      if (object instanceof Mesh)
        object.castShadow = object.receiveShadow = true
    })
    return copy
  }

  function surface(object: Object3D) {
    const material: unknown = object instanceof Mesh ? object.material : null
    if (!(material instanceof MeshStandardMaterial))
      throw new Error('Missing café surface for ' + object.name)
    return material
  }

  function box(
    parent: Group,
    material: MeshStandardMaterial | MeshBasicMaterial,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ) {
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.scale.set(width, height, depth)
    mesh.castShadow = material instanceof MeshStandardMaterial
    mesh.receiveShadow = mesh.castShadow
    parent.add(mesh)
    return mesh
  }

  const grid = new InstancedMesh(geometry, overlay.plot, annexCells.length - 1)
  const tileMatrix = new Matrix4().makeScale(0.93, 0.03, 0.93)
  let gridIndex = 0
  for (const cell of annexCells) {
    const { x, z } = cellPoint(cell)
    if (cell === annexEntry)
      box(lot, overlay.entry, x, -0.028, z, 0.93, 0.03, 0.93)
    else grid.setMatrixAt(gridIndex++, tileMatrix.setPosition(x, -0.028, z))
  }
  lot.add(grid)

  const cafeFront = -layout.room.depth / 2
  const cafeBack = -cafeFront
  const cafeHeight = layout.room.height
  for (const [z0, z1] of [
    [cafeFront, doorway.near],
    [doorway.far, cafeBack],
  ] as const) {
    const center = (z0 + z1) / 2
    box(
      cafeWall,
      plaster,
      annexEdge,
      cafeHeight / 2,
      center,
      0.16,
      cafeHeight,
      z1 - z0,
    )
    box(cafeWall, trim, annexEdge - 0.09, 0.07, center, 0.045, 0.14, z1 - z0)
  }
  const doorwayCenter = (doorway.near + doorway.far) / 2
  const doorwayWidth = doorway.far - doorway.near
  threshold.position.set(annexEdge, threshold.position.y, doorwayCenter)
  threshold.rotation.y = Math.PI / 2
  const headerHeight = cafeHeight - doorway.height
  box(
    cafeWall,
    plaster,
    annexEdge,
    doorway.height + headerHeight / 2,
    doorwayCenter,
    0.16,
    headerHeight,
    doorwayWidth,
  )
  for (const delta of [-0.47, 0.47]) {
    box(selection, overlay.selection, delta, 0.01, 0, 0.025, 0.012, 0.965)
    box(selection, overlay.selection, 0, 0.01, delta, 0.965, 0.012, 0.025)
  }
  const edgeSelection = box(root, overlay.selection, 0, 0.023, 0, 1, 0.025, 1)

  let furnitureMeshes: Object3D[] = []
  let partitionMeshes: Object3D[] = []
  let walls: { object: Object3D; x: number; z: number }[] = []
  let lastAnnex: Annex | undefined
  let lastMode = false
  let meshes: Object3D[] = []
  let previewGhost: Object3D | undefined
  let previewHiddenItem: Object3D | undefined

  function addFixture(object: Object3D, fixture: AnnexFixture) {
    fixtures.set(fixture, object)
    object.traverse((child) => {
      if (child instanceof Mesh) fixtureMeshes.set(child, fixture)
    })
  }

  function addDoor(
    section: Group,
    edge: number,
    material: MeshStandardMaterial,
    { x, z, width, depth, axis }: ReturnType<typeof partitionSize>,
  ) {
    const acrossX = axis === 'z'
    const opening = acrossX ? width : depth
    for (const delta of [-opening / 2, opening / 2]) {
      box(
        section,
        trim,
        x + (acrossX ? delta : 0),
        doorway.height / 2,
        z + (acrossX ? 0 : delta),
        acrossX ? 0.08 : 0.23,
        doorway.height,
        acrossX ? 0.23 : 0.08,
      )
    }
    box(
      section,
      trim,
      x,
      doorway.height,
      z,
      acrossX ? opening + 0.08 : 0.23,
      0.085,
      acrossX ? 0.23 : opening + 0.08,
    )
    if (edge !== entryEdge)
      box(
        section,
        material,
        x,
        doorway.height + headerHeight / 2,
        z,
        width,
        headerHeight,
        depth,
      )
    const leaf = door.clone()
    const sill = threshold.clone()
    const { pivot, length, shut, swing } = annexDoor(edge)
    leaf.position.set(pivot.x, 0, pivot.z)
    leaf.rotation.y = shut + swing
    leaf.scale.x *= length / cafeDoorLength
    doors.set(edge, leaf)
    addFixture(leaf, { kind: 'door', target: edge })
    sill.position.set(x, threshold.position.y, z)
    sill.rotation.y = acrossX ? 0 : Math.PI / 2
    section.add(leaf, sill)
  }

  function addPartition(
    { edge, kind }: Annex['partitions'][number],
    building: boolean,
    floor: ReadonlySet<number>,
  ) {
    const dimensions = partitionSize(edge)
    const { x, z, width, depth, axis } = dimensions
    const material = building ? translucentWall : plaster
    const section = new Group()
    room.add(section)
    if (kind === 'wall') {
      box(section, material, x, cafeHeight / 2, z, width, cafeHeight, depth)
      if (building)
        box(section, overlay.wallEdge, x, 0.011, z, width, 0.018, depth)
    } else {
      addDoor(section, edge, material, dimensions)
    }
    section.traverse((object) => {
      if (object instanceof Mesh) pickWalls.set(object, edge)
    })
    if (kind !== 'wall' || edge === entryEdge) return
    const [negative, positive] = edgeNeighbors(edge)
    const direction =
      Number(negative !== undefined && floor.has(negative)) -
      Number(positive !== undefined && floor.has(positive))
    walls.push({
      object: section,
      x: axis === 'x' ? direction : 0,
      z: axis === 'z' ? direction : 0,
    })
  }

  function rebuild(annex: Annex, building: boolean) {
    lastAnnex = annex
    lastMode = building
    room.clear()
    roof.clear()
    pickTargets.clear()
    pickWalls.clear()
    fixtureMeshes.clear()
    fixtures.clear()
    doors.clear()
    for (const lamp of lamps.values()) lamp.remove()
    lamps.clear()
    furnitureRoots.clear()
    walls = []
    const floor = new Set(annex.floor)
    for (const cell of floor) {
      const { x, z } = cellPoint(cell)
      box(
        room,
        tileMaterials[
          (cell + Math.floor(cell / annexSize)) % tileMaterials.length
        ] ?? plaster,
        x,
        -0.075,
        z,
        1,
        0.15,
        1,
      )
    }
    for (const cell of coveredFloor(annex)) {
      const { x, z } = cellPoint(cell)
      box(roof, ceiling, x, cafeHeight + 0.075, z, 1, 0.15, 1)
    }
    for (const partition of annex.partitions) {
      if (partition.edge === entryEdge && !building && !cafeEntryOpen(annex))
        continue
      addPartition(partition, building, floor)
    }
    for (const placed of annex.furniture) {
      const { cell, kind, turns } = placed
      const { x, z } = buildCenter(kind, cell, turns)
      const item = furniture.get(kind)?.clone()
      if (!item) continue
      item.position.set(x, 0, z)
      item.rotateY((furnitureTurns(annex, placed) * Math.PI) / 2)
      furnitureRoots.set(cell, item)
      item.traverse((object) => {
        if (object instanceof Mesh) pickTargets.set(object, cell)
      })
      room.add(item)
      if (kind === 'lamp') {
        lamps.set(cell, addLamp(item))
        addFixture(item, { kind: 'lamp', target: cell })
      } else if (kind === 'chair' || kind === 'sofa')
        addFixture(item, { kind: 'seat', target: cell })
    }
    furnitureMeshes = [...pickTargets.keys()]
    partitionMeshes = [...pickWalls.keys()]
    meshes = []
    for (const part of [room, cafeWall, roof])
      part.traverse((object) => {
        if (object instanceof Mesh) meshes.push(object)
      })
  }

  function getGhost(kind: Furniture) {
    const cached = ghosts.get(kind)
    if (cached) return cached
    const ghost = furniture.get(kind)?.clone()
    if (!ghost) return
    ghost.traverse((object) => {
      if (!(object instanceof Mesh)) return
      object.material = overlay.ghost
      object.castShadow = false
    })
    ghosts.set(kind, ghost)
    return ghost
  }

  function setPreviewObjects(
    ghost: Object3D | undefined,
    hiddenItem: Object3D | undefined,
  ) {
    if (previewHiddenItem !== hiddenItem) {
      if (previewHiddenItem) previewHiddenItem.visible = true
      if (hiddenItem) hiddenItem.visible = false
      previewHiddenItem = hiddenItem
    }
    if (previewGhost !== ghost) {
      previewRoot.clear()
      if (ghost) previewRoot.add(ghost)
      previewGhost = ghost
    }
  }

  function drawSelection(annex: Annex, cursor: BuildPreview['selection']) {
    const removing = cursor?.tool === 'remove'
    const editing = removing || cursor?.tool === 'rotate'
    const item = cursor?.furniture?.item
    const original = cursor?.valid ? cursor.furniture?.original : undefined
    const edge = cursor && isEdgeTool(cursor.tool)
    edgeSelection.visible = !!edge
    selection.visible = !!cursor && !edge && (!editing || item !== undefined)
    let ghost: Object3D | undefined
    if (cursor && edge) {
      const { x, z, axis } = partitionSize(cursor.target)
      edgeSelection.position.set(x, 0.023, z)
      edgeSelection.scale.set(
        axis === 'x' ? 0.14 : 1.04,
        0.025,
        axis === 'z' ? 0.14 : 1.04,
      )
    } else if (cursor) {
      const tool = item?.kind ?? cursor.tool
      const { x, z } = buildCenter(
        tool,
        item?.cell ?? buildAnchor(annex, tool, cursor.target),
        item?.turns,
      )
      selection.position.set(x, 0, z)
      const { columns, rows } = buildSpan(tool, item?.turns)
      selection.scale.set(columns, 1, rows)
      if (item && !removing) {
        ghost = getGhost(item.kind)
        if (ghost) {
          ghost.position.set(x, 0, z)
          ghost.rotation.y = (furnitureTurns(annex, item) * Math.PI) / 2
        }
      }
    }
    setPreviewObjects(ghost, original && furnitureRoots.get(original.cell))
    if (cursor) {
      overlay.selection.color.set(
        cursor.valid &&
          cursor.tool !== 'erase-floor' &&
          cursor.tool !== 'erase-wall' &&
          !removing
          ? '#334f3e'
          : '#934d3c',
      )
      overlay.ghost.color.set(cursor.valid ? '#e2d7a4' : '#d0624a')
    }
  }

  function draw(
    cafe: Cafe,
    preview: BuildPreview | undefined,
    camera: { x: number; z: number } | undefined,
    showCafeWall: boolean,
    dt: number,
    reduce: boolean,
  ) {
    const { annex } = cafe
    const building = preview !== undefined
    const changed = annex !== lastAnnex || building !== lastMode
    if (changed) rebuild(annex, building)
    lot.visible = building
    cafeWall.visible = cafeEntryOpen(annex) && showCafeWall
    roof.visible = camera === undefined
    drawSelection(annex, preview?.selection)
    for (const wall of walls)
      wall.object.visible =
        building || !camera || wall.x * camera.x + wall.z * camera.z < 0.14
    let moving = false
    let doorChanged = false
    for (const [edge, leaf] of doors) {
      const { shut, swing } = annexDoor(edge)
      const angle = shut + (cafe.closedAnnexDoors.has(edge) ? 0 : swing)
      const current = leaf.rotation.y
      const settled = changed || reduce || Math.abs(angle - current) < 0.004
      leaf.rotation.y = settled
        ? angle
        : angle + (current - angle) * Math.exp(-15 * (dt || 1 / 60))
      moving ||= !settled
      doorChanged ||= current !== leaf.rotation.y
    }
    for (const [cell, lamp] of lamps) lamp.set(cafe.litAnnexLamps.has(cell))
    return { changed, moving, doorChanged }
  }

  function pickFurniture(ray: Raycaster) {
    const hit = ray.intersectObjects(furnitureMeshes, false)[0]
    return hit && pickTargets.get(hit.object)
  }

  function pickPartition(ray: Raycaster) {
    const hit = ray.intersectObjects(partitionMeshes, false)[0]
    return hit && pickWalls.get(hit.object)
  }

  function dispose() {
    grid.dispose()
    geometry.dispose()
    translucentWall.dispose()
    for (const material of [...tileMaterials, ...Object.values(overlay)])
      material.dispose()
  }

  function fixturePoint(
    fixture: AnnexFixture,
    object: Object3D,
    point: Vector3,
  ) {
    if (fixture.kind === 'door')
      return object.localToWorld(point.set(cafeDoorLength / 2, 1.38, 0))
    const y = fixture.kind === 'lamp' ? 1.42 : 0.48
    return object.localToWorld(point.set(0, y, 0))
  }

  return {
    root,
    draw,
    pickFurniture,
    pickPartition,
    dispose,
    fixtures,
    fixturePoint,
    meshes: () => meshes,
    fixture: (mesh: Object3D) => fixtureMeshes.get(mesh),
    isPartition: (mesh: Object3D) => pickWalls.has(mesh),
  }
}
