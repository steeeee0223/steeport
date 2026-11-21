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
} from 'three'

import layout from '../scene/layout.json' with { type: 'json' }
import {
  type Annex,
  type BuildPreview,
  annexCells,
  annexEdge,
  annexEntry,
  annexSize,
  buildAnchor,
  buildCenter,
  buildSpan,
  cafeEntryOpen,
  cellPoint,
  coveredFloor,
  doorway,
  edgeNeighbors,
  entryEdge,
  furnitureAt,
  furnitureTypes,
  interiorDoor,
  isEdgeTool,
  openDoor,
  partitionSize,
  shelfFacesPositiveZ,
} from './annex'

export function annexVisuals(
  node: (name: string) => Object3D,
  rightPanels: { plaster: Object3D; baseboard: Object3D },
) {
  const root = new Group()
  const room = new Group()
  const cafeWall = new Group()
  const roof = new Group()
  const selection = new Group()
  const lot = new Group()
  const pickTargets = new Map<Object3D, number>()
  const pickWalls = new Map<Object3D, number>()
  root.add(lot, room, cafeWall, roof, selection)
  const geometry = new BoxGeometry(1, 1, 1)
  const overlay = {
    plot: new MeshBasicMaterial({ color: '#8f785d' }),
    entry: new MeshBasicMaterial({ color: '#c6ab71' }),
    selection: new MeshBasicMaterial({ color: '#334f3e' }),
    wallEdge: new MeshBasicMaterial({ color: '#655242' }),
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
    const swing = interiorDoor(edge)
    const origin = edge === entryEdge ? openDoor : swing.pivot
    leaf.position.set(origin.x, 0, origin.z)
    leaf.rotation.y = edge === entryEdge ? Math.PI / 2 : swing.rotation
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
    for (const { cell, kind } of annex.furniture) {
      const { x, z } = buildCenter(kind, cell)
      const item = furniture.get(kind)?.clone()
      if (!item) continue
      item.position.set(x, 0, z)
      if (kind === 'shelf' && shelfFacesPositiveZ(annex, cell))
        item.rotateY(Math.PI)
      item.traverse((object) => {
        if (object instanceof Mesh) pickTargets.set(object, cell)
      })
      room.add(item)
    }
    furnitureMeshes = [...pickTargets.keys()]
    partitionMeshes = [...pickWalls.keys()]
  }

  function drawSelection(annex: Annex, cursor: BuildPreview['selection']) {
    const removing = cursor?.tool === 'remove'
    const target = removing ? furnitureAt(annex, cursor.target) : undefined
    const edge = cursor && isEdgeTool(cursor.tool)
    edgeSelection.visible = !!edge
    selection.visible = !!cursor && !edge && (!removing || target !== undefined)
    if (cursor && edge) {
      const { x, z, axis } = partitionSize(cursor.target)
      edgeSelection.position.set(x, 0.023, z)
      edgeSelection.scale.set(
        axis === 'x' ? 0.14 : 1.04,
        0.025,
        axis === 'z' ? 0.14 : 1.04,
      )
    } else if (cursor) {
      const tool = target?.kind ?? cursor.tool
      const { x, z } = buildCenter(
        tool,
        target?.cell ?? buildAnchor(annex, tool, cursor.target),
      )
      selection.position.set(x, 0, z)
      const { columns, rows } = buildSpan(tool)
      selection.scale.set(columns, 1, rows)
    }
    if (cursor) {
      overlay.selection.color.set(
        cursor.valid &&
          cursor.tool !== 'erase-floor' &&
          cursor.tool !== 'erase-wall' &&
          !removing
          ? '#334f3e'
          : '#934d3c',
      )
    }
  }

  function draw(
    annex: Annex,
    preview: BuildPreview | undefined,
    camera: { x: number; z: number } | undefined,
    showCafeWall: boolean,
  ) {
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
    return changed
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

  return { root, draw, pickFurniture, pickPartition, dispose }
}
