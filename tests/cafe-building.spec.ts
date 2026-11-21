import { expect, test } from '@playwright/test'

import {
  annexEntry,
  annexSize,
  cellEdges,
  entryEdge,
  starterSize,
} from '../src/annex'
import { openCafe, settingsButton, switchView, view } from './cafe-fixtures'

test.use({ reducedMotion: 'reduce' })

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

function buildScale({ width, height }: Bounds) {
  return height / (2 * Math.max(3.5, (3.2 * height) / width))
}

function doorwayRowTile(
  bounds: Bounds,
  column: number,
  panX = 0,
  orbit = Math.PI / 4,
  zoom = 1,
  rowOffset = 0,
) {
  const scale = buildScale(bounds) * zoom
  const focusX = (bounds.width < bounds.height ? 1.75 : 0.7) + panX
  const dx = column + 0.5 - focusX
  const dz = 0.5 + rowOffset
  return {
    x:
      bounds.x +
      bounds.width / 2 -
      (Math.cos(orbit) * dx + Math.sin(orbit) * dz) * scale,
    y:
      bounds.y +
      bounds.height / 2 +
      ((Math.sin(orbit) * dx - Math.cos(orbit) * dz) / Math.sqrt(3) +
        0.92 * Math.sqrt(2 / 3)) *
        scale,
  }
}

test('builds a connected room, keeps its walkway clear and restores it on reload', async ({
  page,
}, info) => {
  await openCafe(page)
  const toggle = page.locator('#build-mode')
  const plot = page.getByRole('img', { name: /^Build plot/ })
  const feedback = page.locator('#build-feedback')
  await settingsButton(page).click()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(plot).toBeFocused()
  await plot.press('Enter')
  await expect(feedback).toContainText('The café passage is open')
  await plot.press('ArrowDown')
  await plot.press('Enter')
  for (let column = 1; column < 4; column++) {
    await plot.press('ArrowLeft')
    await plot.press('Enter')
  }
  await plot.press('ArrowDown')
  await plot.press('Enter')
  await plot.press('Home')
  await page.getByRole('button', { name: 'Furniture', exact: true }).click()
  await plot.press('ArrowDown')
  await plot.press('Enter')
  await expect(feedback).toContainText('block the walkway')
  await plot.press('ArrowUp')
  await plot.press('ArrowUp')
  await plot.press('Enter')
  await expect(feedback).toHaveText(
    'The bookshelf needs a complete row of four floor tiles.',
  )
  await page.keyboard.press('1')
  await plot.press('Enter')
  for (let column = 1; column < 4; column++) {
    await plot.press('ArrowLeft')
    await plot.press('Enter')
  }
  await page.keyboard.press('3')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Bookshelf placed.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(feedback).toHaveText('Undid the last building change.')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Bookshelf placed.')
  await page.keyboard.press('1')
  await plot.press('ArrowDown')
  await plot.press('ArrowRight')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Floor placed.')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('#view-label')).toHaveText('01 / FIRST PERSON')
  await expect(settingsButton(page)).toBeFocused()
  await switchView(page, true)
  await view(page).screenshot({ path: info.outputPath('reading-room.png') })

  await page.reload()
  await expect(settingsButton(page)).toBeVisible()
  await settingsButton(page).click()
  await toggle.click()
  await expect(page.getByRole('button', { name: 'Attach room' })).toBeDisabled()
  await page.getByRole('button', { name: 'Furniture', exact: true }).click()
  await page.keyboard.press('4')
  await plot.press('ArrowUp')
  await plot.press('Enter')
  await expect(feedback).toHaveText('That tile is occupied.')
  await plot.press('ArrowLeft')
  await plot.press('ArrowLeft')
  await plot.press('ArrowLeft')
  await plot.press('Enter')
  await expect(feedback).toHaveText('That tile is occupied.')
  const remove = page.getByRole('button', { name: 'Remove', exact: true })
  await remove.click()
  await plot.press('Enter')
  await expect(feedback).toHaveText('Bookshelf removed.')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Select a piece of furniture to remove.')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(feedback).toHaveText('Undid the last building change.')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Bookshelf removed.')
  await page.keyboard.press('Escape')
  await expect(view(page)).toBeVisible()
  await expect(settingsButton(page)).toBeFocused()

  await page.reload()
  await expect(settingsButton(page)).toBeVisible()
  await settingsButton(page).click()
  await toggle.click()
  await page.keyboard.press('4')
  await plot.press('ArrowUp')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Desk placed.')
})

test('expands a saved two-tile bookshelf to a full row', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'steeport.annex',
      JSON.stringify({
        version: 2,
        floor: Array.from({ length: 16 }, (_, cell) => cell),
        door: true,
        furniture: [{ kind: 'shelf', cell: 6 }],
      }),
    )
  })
  await openCafe(page)
  await settingsButton(page).click()
  await page.locator('#build-mode').click()
  await page.keyboard.press('4')
  const plot = page.getByRole('img', { name: /^Build plot/ })
  await plot.press('ArrowDown')
  await plot.press('ArrowDown')
  await plot.press('Enter')
  await expect(page.locator('#build-feedback')).toHaveText(
    'That tile is occupied.',
  )
  await plot.press('ArrowLeft')
  await plot.press('ArrowLeft')
  await plot.press('ArrowLeft')
  await plot.press('Enter')
  await expect(page.locator('#build-feedback')).toHaveText(
    'That tile is occupied.',
  )
})

test('preserves a saved bookshelf until the room has enough floor to place it', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('steeport.annex')) return
    localStorage.setItem(
      'steeport.annex',
      JSON.stringify({
        version: 1,
        floor: [8, 9],
        door: true,
        furniture: [{ cell: 9, kind: 'shelf' }],
      }),
    )
  })
  await openCafe(page)
  await settingsButton(page).click()
  await page.locator('#build-mode').click()
  await expect(page.locator('#build-feedback')).toContainText(
    'Saved bookshelf to place',
  )
  await page.keyboard.press('1')
  const plot = page.getByRole('img', { name: /^Build plot/ })
  await plot.press('ArrowUp')
  await plot.press('Enter')
  for (let column = 1; column < 4; column++) {
    await plot.press('ArrowLeft')
    await plot.press('Enter')
  }
  await page.reload()
  await expect(settingsButton(page)).toBeVisible()
  await settingsButton(page).click()
  await page.locator('#build-mode').click()
  await expect(page.locator('#build-feedback')).toContainText(
    'Saved bookshelf to place',
  )
  await plot.press('ArrowUp')
  await plot.press('Enter')
  await expect(page.locator('#build-feedback')).toHaveText('Bookshelf placed.')
  await page.reload()
  await expect(settingsButton(page)).toBeVisible()
  await settingsButton(page).click()
  await page.locator('#build-mode').click()
  await expect(page.locator('#build-feedback')).toHaveText(
    'Drag over the grid to lay floor tiles.',
  )
})

test('pans and drag-paints beyond the starter room, with one undo per stroke', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('steeport.annex')) return
    localStorage.setItem(
      'steeport.annex',
      JSON.stringify({
        version: 3,
        floor: Array.from({ length: 16 }, (_, cell) => cell),
        door: true,
        furniture: [{ cell: 0, kind: 'shelf' }],
        pendingShelves: 0,
      }),
    )
  })
  await openCafe(page)
  await settingsButton(page).click()
  await page.getByRole('button', { name: 'Build mode', exact: true }).click()
  const plot = page.getByRole('img', { name: /^Build plot/ })
  await expect(
    page.getByRole('group', { name: 'Build camera' }).locator('svg'),
  ).toHaveCount(6)
  await page.keyboard.press('7')
  await expect(page.getByRole('button', { name: 'Pan view' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const bounds = await plot.boundingBox()
  if (!bounds) throw new Error('Expected the plot to be visible')
  const scale = buildScale(bounds)
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const panX = 4
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(
    x + (panX / Math.SQRT2) * scale,
    y - (panX / Math.sqrt(6)) * scale,
  )
  await page.mouse.up()
  await page.keyboard.press('1')
  await expect(
    page.getByRole('button', { name: 'Floor', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')

  const start = doorwayRowTile(bounds, starterSize - 1, panX)
  const end = doorwayRowTile(bounds, 8, panX)
  const stroke = async () => {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y)
    await page.mouse.up()
    await expect(page.locator('#build-feedback')).toHaveText(
      '5 floor tiles placed.',
    )
  }
  await stroke()
  await page.screenshot({ path: info.outputPath('expanded-build-plot.png') })
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await undo.click()
  await expect(undo).toBeDisabled()
  await stroke()
  await page.reload()
  const stored = await page.evaluate(() =>
    localStorage.getItem('steeport.annex'),
  )
  expect(JSON.parse(stored ?? 'null')).toMatchObject({
    version: 5,
    floor: expect.arrayContaining(
      Array.from({ length: 9 }, (_, column) => annexEntry + column),
    ),
    partitions: expect.arrayContaining([{ edge: entryEdge, kind: 'door' }]),
    furniture: [{ cell: annexEntry - 2 * annexSize, kind: 'shelf' }],
  })
  await settingsButton(page).click()
  await page.getByRole('button', { name: 'Build mode', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Attach room' })).toBeDisabled()
  await page.keyboard.press('4')
  for (let column = 0; column < 8; column++) await plot.press('ArrowLeft')
  await plot.press('Enter')
  await expect(page.locator('#build-feedback')).toHaveText('Desk placed.')
})

test('drag-builds a continuous wall around a corner and undoes both runs at once', async ({
  page,
}, info) => {
  await openCafe(page)
  await settingsButton(page).click()
  await page.getByRole('button', { name: 'Build mode', exact: true }).click()
  await page.getByRole('button', { name: 'Wall', exact: true }).click()
  const plot = page.getByRole('img', { name: /^Build plot/ })
  const bounds = await plot.boundingBox()
  if (!bounds) throw new Error('Expected the plot to be visible')
  const at = (column: number, rowOffset: number) =>
    doorwayRowTile(bounds, column, 0, Math.PI / 4, 1, rowOffset)
  const start = at(-0.3, -0.43)
  const corner = at(3.45, -0.43)
  const end = at(3.45, 1.2)
  const stroke = async () => {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(corner.x, corner.y)
    await page.mouse.move(end.x, end.y)
    await page.mouse.up()
    await expect(page.locator('#build-feedback')).toHaveText(
      '6 wall segments placed.',
    )
  }
  await stroke()
  await plot.screenshot({ path: info.outputPath('drag-built-wall.png') })
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await undo.click()
  await expect(undo).toBeDisabled()
  await stroke()
  await page.reload()
  const stored = await page.evaluate(() =>
    localStorage.getItem('steeport.annex'),
  )
  expect(JSON.parse(stored ?? 'null')).toMatchObject({
    floor: [],
    partitions: [
      ...Array.from(
        { length: 4 },
        (_, column) => cellEdges(annexEntry + column)[2],
      ),
      cellEdges(annexEntry + 3)[1],
      cellEdges(annexEntry + annexSize + 3)[1],
    ].map((edge) => ({ edge, kind: 'wall' })),
  })
})

test('uses the rotated, zoomed camera to place and edit a partition independently of the floor', async ({
  page,
}, info) => {
  await openCafe(page)
  await settingsButton(page).click()
  await page.getByRole('button', { name: 'Build mode', exact: true }).click()
  const plot = page.getByRole('img', { name: /^Build plot/ })
  const feedback = page.locator('#build-feedback')
  await page.getByRole('button', { name: 'Rotate right', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const bounds = await plot.boundingBox()
  if (!bounds) throw new Error('Expected the plot to be visible')
  const ground = doorwayRowTile(bounds, 0, 0, Math.PI / 2, 1.35)
  const wall = doorwayRowTile(bounds, 0.45, 0, Math.PI / 2, 1.35)
  await page.getByRole('button', { name: 'Wall', exact: true }).click()
  await page.mouse.click(wall.x, wall.y)
  await expect(feedback).toHaveText('Wall placed.')
  await page.getByRole('button', { name: 'Floor', exact: true }).click()
  await page.mouse.click(ground.x, ground.y)
  await expect(feedback).toContainText('The café passage is open')
  const far = doorwayRowTile(bounds, 1, 0, Math.PI / 2, 1.35)
  await page.mouse.click(far.x, far.y)
  await expect(feedback).toHaveText('Floor placed.')
  await page.screenshot({ path: info.outputPath('build-partition.png') })
  await page.getByRole('button', { name: 'Door', exact: true }).click()
  await page.mouse.click(wall.x, wall.y)
  await expect(feedback).toHaveText('Door installed.')
  const saved = async (): Promise<unknown> =>
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem('steeport.annex'))) ??
        'null',
    )
  expect(await saved()).toMatchObject({
    floor: [annexEntry, annexEntry + 1],
    partitions: [{ edge: cellEdges(annexEntry)[1], kind: 'door' }],
  })
  await page
    .getByRole('button', { name: 'Erase wall or door', exact: true })
    .click()
  await plot.press('Home')
  await plot.press('r')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Door removed.')
  expect(await saved()).toMatchObject({
    floor: [annexEntry, annexEntry + 1],
    partitions: [],
  })
  await page.getByRole('button', { name: 'Furniture', exact: true }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  const center = doorwayRowTile(bounds, 0)
  await page.mouse.move(center.x, center.y)
  const previousView = await plot.screenshot()
  await page.mouse.wheel(0, -240)
  expect((await plot.screenshot()).equals(previousView)).toBe(false)
  const zoomed = await plot.screenshot()
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(center.x + 95, center.y - 65)
  await page.mouse.up({ button: 'right' })
  expect((await plot.screenshot()).equals(zoomed)).toBe(false)
  expect(await saved()).toMatchObject({
    floor: [annexEntry, annexEntry + 1],
    partitions: [],
  })
})

test('the furniture catalog places café seating and a full-size table in an open room', async ({
  page,
}, info) => {
  await openCafe(page)
  await settingsButton(page).click()
  await page.getByRole('button', { name: 'Build mode', exact: true }).click()
  const plot = page.getByRole('img', { name: /^Build plot/ })
  const feedback = page.locator('#build-feedback')
  await page.getByRole('button', { name: 'Attach room', exact: true }).click()
  await page.getByRole('button', { name: 'Furniture', exact: true }).click()
  const furniture = page.getByRole('group', { name: 'Furniture tools' })
  await expect(
    furniture.getByRole('button', { name: 'Potted plant', exact: true }),
  ).toBeVisible()
  for (const [name, keys] of [
    ['Sofa', ['ArrowDown', 'ArrowDown']],
    ['Chair', ['ArrowLeft']],
    ['Communal table', ['ArrowLeft', 'ArrowLeft']],
  ] as const) {
    await furniture.getByRole('button', { name, exact: true }).click()
    await plot.press('Home')
    for (const key of keys) await plot.press(key)
    await plot.press('Enter')
    await expect(feedback).toHaveText(name + ' placed.')
  }
  await page.screenshot({
    path: info.outputPath('build-furniture-catalog.png'),
  })
  const saved = await page.evaluate(() =>
    localStorage.getItem('steeport.annex'),
  )
  expect(JSON.parse(saved ?? 'null')).toMatchObject({
    furniture: [{ kind: 'sofa' }, { kind: 'chair' }, { kind: 'table' }],
    partitions: expect.not.arrayContaining([
      expect.objectContaining({ kind: 'door' }),
    ]),
  })
})

test.describe('touch building', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  })

  test('drags to lay the first floor and connect several tiles on touch', async ({
    page,
  }) => {
    await openCafe(page)
    await settingsButton(page).tap()
    await page.getByRole('button', { name: 'Build mode', exact: true }).tap()
    const plot = page.getByRole('img', { name: /^Build plot/ })
    const bounds = await plot.boundingBox()
    if (!bounds) throw new Error('Expected the plot to be visible')
    const start = doorwayRowTile(bounds, 0)
    const end = doorwayRowTile(bounds, 4)
    const input = await page.context().newCDPSession(page)
    const initial = await plot.screenshot()
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { ...start, id: 1 },
        { ...start, x: start.x + 60, id: 2 },
      ],
    })
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { ...start, x: start.x - 20, id: 1 },
        { ...start, x: start.x + 85, id: 2 },
      ],
    })
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    expect((await plot.screenshot()).equals(initial)).toBe(false)
    expect(
      await page.evaluate(() => localStorage.getItem('steeport.annex')),
    ).toBeNull()
    await page.getByRole('button', { name: 'Reset camera', exact: true }).tap()
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [start],
    })
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [end],
    })
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect(page.locator('#build-feedback')).toHaveText(
      '5 floor tiles placed.',
    )
    const stored = await page.evaluate(() =>
      localStorage.getItem('steeport.annex'),
    )
    expect(JSON.parse(stored ?? 'null')).toMatchObject({
      floor: Array.from({ length: 5 }, (_, column) => annexEntry + column),
      partitions: [],
    })
  })

  test('places several wall segments with one touch drag', async ({ page }) => {
    await openCafe(page)
    await settingsButton(page).tap()
    await page.getByRole('button', { name: 'Build mode', exact: true }).tap()
    await page.getByRole('button', { name: 'Wall', exact: true }).tap()
    const bounds = await page
      .getByRole('img', { name: /^Build plot/ })
      .boundingBox()
    if (!bounds) throw new Error('Expected the plot to be visible')
    const start = doorwayRowTile(bounds, -0.25, 0, Math.PI / 4, 1, -0.43)
    const end = doorwayRowTile(bounds, 3.25, 0, Math.PI / 4, 1, -0.43)
    const input = await page.context().newCDPSession(page)
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [start],
    })
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [end],
    })
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect(page.locator('#build-feedback')).toHaveText(
      '4 wall segments placed.',
    )
    const stored = await page.evaluate(() =>
      localStorage.getItem('steeport.annex'),
    )
    expect(JSON.parse(stored ?? 'null')).toMatchObject({
      floor: [],
      partitions: Array.from({ length: 4 }, (_, column) => ({
        edge: cellEdges(annexEntry + column)[2],
        kind: 'wall',
      })),
    })
  })

  test('places and removes furniture by touch in the pixel view', async ({
    page,
  }, info) => {
    await openCafe(page)
    await switchView(page, true)
    await settingsButton(page).tap()
    await page.getByRole('button', { name: 'Build mode', exact: true }).tap()
    await page.getByRole('button', { name: 'Attach room' }).tap()
    await page.getByRole('button', { name: 'Furniture', exact: true }).tap()
    const plot = page.getByRole('img', { name: /^Build plot/ })
    const bounds = await plot.boundingBox()
    if (!bounds) throw new Error('Expected the plot to be visible')
    await plot.tap({
      position: { x: bounds.width * 0.4, y: bounds.height / 2 },
    })
    await expect(page.locator('#build-feedback')).toHaveText(
      'Bookshelf placed.',
    )
    await page.screenshot({ path: info.outputPath('touch-build-mode.png') })
    await page.getByRole('button', { name: 'Remove', exact: true }).tap()
    await plot.tap({
      position: { x: bounds.width * 0.33, y: bounds.height * 0.42 },
    })
    await expect(page.locator('#build-feedback')).toHaveText(
      'Bookshelf removed.',
    )
    await page.getByRole('button', { name: 'Done', exact: true }).tap()
    await expect(page.locator('#view-label')).toHaveText('02 / PIXEL ROOM')
  })
})

test('rotates a bookshelf before placement and an existing chair after placement', async ({
  page,
}) => {
  await openCafe(page)
  await settingsButton(page).click()
  await page.getByRole('button', { name: 'Build mode', exact: true }).click()
  await page.getByRole('button', { name: 'Attach room' }).click()
  await page.getByRole('button', { name: 'Furniture', exact: true }).click()
  const plot = page.getByRole('img', { name: /^Build plot/ })
  const feedback = page.locator('#build-feedback')
  const angle = page.locator('#item-angle')
  const stored = async (): Promise<unknown> =>
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem('steeport.annex'))) ??
        'null',
    )

  await plot.press('Period')
  await expect(angle).toHaveText('90°')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Keep the doorway clear.')
  for (let i = 0; i < 3; i++) await plot.press('ArrowLeft')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Bookshelf placed.')
  await page.getByRole('button', { name: 'Chair', exact: true }).click()
  await plot.press('ArrowRight')
  await plot.press('Enter')
  await expect(feedback).toHaveText('Chair placed.')
  await page.getByRole('button', { name: 'Rotate item', exact: true }).click()
  await page
    .getByRole('button', { name: 'Rotate item counterclockwise' })
    .click()
  await plot.press('Enter')
  await expect(feedback).toHaveText('Chair rotated.')
  const shelf = {
    cell: annexEntry - 2 * annexSize + 3,
    kind: 'shelf',
    turns: 3,
  }
  const chair = { cell: annexEntry + 2, kind: 'chair' }
  const furniture = [shelf, { ...chair, turns: 1 }]
  expect(await stored()).toMatchObject({ furniture })
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await stored()).toHaveProperty('furniture', [shelf, chair])
  await plot.press('Enter')
  await expect(feedback).toHaveText('Chair rotated.')
  expect(await stored()).toMatchObject({ furniture })
  await page.reload()
  await settingsButton(page).click()
  await page.getByRole('button', { name: 'Build mode', exact: true }).click()
  await page.keyboard.press('4')
  for (let i = 0; i < 3; i++) await plot.press('ArrowLeft')
  await plot.press('ArrowUp')
  await plot.press('Enter')
  await expect(feedback).toHaveText('That tile is occupied.')

  await plot.press('Home')
  await page.getByRole('button', { name: 'Rotate item', exact: true }).click()
  await plot.press('ArrowLeft')
  await plot.press('ArrowLeft')
  await expect(angle).toBeVisible()
  await expect(angle).toHaveText('0°')
})
