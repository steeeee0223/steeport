import { type Locator, type Page, expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

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

test.use({ reducedMotion: 'reduce' })

const pixelButton = (page: Page) =>
  page.getByRole('button', { name: 'Pixel view' })
const view = (page: Page) => page.getByRole('img', { name: /Café view/ })
const frameHash = async (page: Page, path?: string) =>
  createHash('sha256')
    .update(
      await view(page).screenshot({
        path,
        style: '.room-status { visibility: hidden; }',
      }),
    )
    .digest('hex')

async function openCafe(page: Page) {
  await page.goto('/lab/')
  await expect(pixelButton(page)).toBeEnabled()
  await expect(view(page)).toBeVisible()
}

async function switchView(page: Page, pixel: boolean) {
  await pixelButton(page).click()
  await expect(pixelButton(page)).toHaveAttribute('aria-pressed', String(pixel))
}

test('loads both camera modes without native gzip decompression', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'DecompressionStream', { value: undefined })
  })
  await openCafe(page)
  await switchView(page, true)
  await expect(
    page.getByRole('button', { name: 'Read field notes' }),
  ).toBeVisible()
})

async function walkUntil(page: Page, key: string, check: () => Promise<void>) {
  await page.keyboard.down(key)
  try {
    await check()
  } finally {
    await page.keyboard.up(key)
  }
}

async function holdTouch(
  page: Page,
  control: Locator,
  check: () => Promise<void>,
) {
  const client = await page.context().newCDPSession(page)
  await control.scrollIntoViewIfNeeded()
  const bounds = await control.boundingBox()
  if (!bounds) throw new Error('Touch control is offscreen')
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      ],
    })
    await check()
  } finally {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await client.detach()
  }
}

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

test('lo-fi loads after opt-in and can be muted and resumed from the HUD', async ({
  page,
}) => {
  const downloads: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/afternoon-loop.m4a'))
      downloads.push(request.url())
  })
  await openCafe(page)
  const music = page.getByRole('button', { name: 'Lo-fi music' })
  await expect(music).toHaveAttribute('aria-pressed', 'false')
  expect(downloads).toHaveLength(0)
  await page.keyboard.press('m')
  await expect(music).toHaveAttribute('aria-pressed', 'true')
  await expect(music).not.toHaveAttribute('aria-busy', 'true')
  expect(downloads).toHaveLength(1)
  await music.click()
  await expect(music).toHaveAttribute('aria-pressed', 'false')
  await music.click()
  await expect(music).toHaveAttribute('aria-pressed', 'true')
  await expect(music).not.toHaveAttribute('aria-busy', 'true')
  expect(downloads).toHaveLength(1)
  await page.getByRole('button', { name: 'Read field notes' }).click()
  await expect(page.getByRole('dialog', { name: 'Field notes' })).toBeVisible()
  await page.keyboard.press('m')
  await expect(music).toHaveAttribute('aria-pressed', 'false')
})

test('walks to the bar and back, keeping pose and laptop state through camera changes', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  await openCafe(page)
  await page.screenshot({ path: info.outputPath('desktop-seated.png') })

  await page.getByRole('button', { name: 'Stand up' }).click()
  await walkUntil(page, 'KeyD', () =>
    expect(page.locator('#location-text')).toHaveText('At the bar'),
  )
  const frame = await view(page).boundingBox()
  if (!frame) throw new Error('Café canvas is offscreen')
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
  async function dragLook(dx: number) {
    await page.mouse.move(center.x, center.y)
    await page.mouse.down()
    await page.mouse.move(center.x + dx, center.y)
    await page.mouse.up()
  }
  const lookingAtWindow = await frameHash(page)
  await dragLook(80)
  await expect.poll(() => frameHash(page)).not.toEqual(lookingAtWindow)
  const atBar = await frameHash(page)

  await switchView(page, true)
  await expect(page.locator('#location-text')).toHaveText('At the bar')
  const beforeOrbit = await frameHash(page)
  await page.screenshot({ path: info.outputPath('desktop-pixel-at-bar.png') })
  await page.getByRole('button', { name: 'Rotate camera right' }).click()
  await expect.poll(() => frameHash(page)).not.toEqual(beforeOrbit)
  await expect(page.locator('#location-text')).toHaveText('At the bar')
  await page.screenshot({ path: info.outputPath('desktop-orbit-at-bar.png') })
  await switchView(page, false)
  await expect.poll(() => frameHash(page)).toEqual(atBar)

  await dragLook(-80)
  await expect.poll(() => frameHash(page)).toEqual(lookingAtWindow)
  const sit = page.getByRole('button', { name: 'Sit down' })
  await walkUntil(page, 'KeyA', () =>
    expect(page.getByRole('button', { name: 'Open laptop' })).toBeVisible(),
  )
  await sit.click()

  const closed = await frameHash(page)
  await page.getByRole('button', { name: 'Open laptop' }).click()
  const closeLaptop = page.getByRole('button', { name: 'Close laptop' })
  await expect(closeLaptop).toBeVisible()
  const opened = await frameHash(page)
  expect(opened).not.toEqual(closed)
  await page.screenshot({ path: info.outputPath('desktop-laptop-open.png') })
  await switchView(page, true)
  await expect(closeLaptop).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stand up' })).toBeEnabled()

  await pixelButton(page).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement))
      throw new Error('Missing view toggle')
    button.click()
    button.click()
    button.click()
  })
  await expect(pixelButton(page)).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => frameHash(page)).toEqual(opened)
  await closeLaptop.click()
  await expect(page.getByRole('button', { name: 'Open laptop' })).toBeEnabled()
  await expect.poll(() => frameHash(page)).toEqual(closed)
})

test.describe('touch viewport', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  })

  test('moves with touch, switches while a direction is held, and orbits separately', async ({
    page,
  }, info) => {
    await openCafe(page)
    await page.screenshot({ path: info.outputPath('phone-seated.png') })
    await page.getByRole('button', { name: 'Stand up' }).tap()
    await holdTouch(
      page,
      page.getByRole('button', { name: 'Move right' }),
      async () => {
        await expect(page.locator('#location-text')).toHaveText('At the bar')
        await switchView(page, true)
      },
    )
    const atBar = await frameHash(page)
    await expect(page.locator('#location-text')).toHaveText('At the bar')
    await page.getByRole('button', { name: 'Rotate camera left' }).tap()
    await expect.poll(() => frameHash(page)).not.toEqual(atBar)
    await page.screenshot({ path: info.outputPath('phone-pixel-bar.png') })

    await switchView(page, false)
    const sit = page.getByRole('button', { name: 'Sit down' })
    await holdTouch(
      page,
      page.getByRole('button', { name: 'Move left' }),
      async () => {
        await expect(
          page.getByRole('button', { name: 'Open laptop' }),
        ).toBeVisible()
        await expect(sit).toBeVisible()
      },
    )
    await expect(sit).toBeVisible()
    await sit.tap()
    await page.getByRole('button', { name: 'Open laptop' }).tap()
    await switchView(page, true)
    await expect(
      page.getByRole('button', { name: 'Close laptop' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Plug in charger' }).tap()
    await expect(
      page.getByRole('button', { name: 'Unplug charger' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Read field notes' }).tap()
    const reader = page.getByRole('dialog', { name: 'Field notes' })
    await reader.getByRole('button', { name: 'Next page' }).tap()
    await expect(reader.getByText('2 / 3')).toBeVisible()
    await page.touchscreen.tap(2, 2)
    await expect(reader).toBeHidden()
    await page.screenshot({ path: info.outputPath('phone-pixel-window.png') })
    const wide = await frameHash(page)
    await page.getByRole('button', { name: 'Zoom in' }).tap()
    await expect.poll(() => frameHash(page)).not.toEqual(wide)
    await page.screenshot({ path: info.outputPath('phone-pixel-close.png') })
    await page.getByRole('button', { name: 'Zoom out' }).tap()
    await expect.poll(() => frameHash(page)).toEqual(wide)
  })
})

test('the stills remain reachable if the room model fails', async ({
  page,
}) => {
  await page.route('**/cafe.glbz', (route) => route.abort())
  await page.goto('/lab/')
  await expect(page.getByRole('status')).toContainText(
    'interactive room is unavailable',
  )
  await expect(pixelButton(page)).toBeDisabled()
  await expect(page.locator('#preview')).toBeVisible()
  await page.getByText('Study notes').click()
  const standing = page.getByRole('link', { name: 'Standing Blender still' })
  await expect(standing).toBeVisible()
  await standing.click()
  await expect(page).toHaveURL(/\/studies\/standing-turn\.jpg$/)
})

test('handles the window props by direct click, keyboard and toolbar', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  await openCafe(page)
  await expect(page.locator('.prop-marker')).toHaveCount(0)
  const bounds = await view(page).boundingBox()
  if (!bounds) throw new Error('Café canvas is offscreen')
  await view(page).click({
    position: { x: bounds.width * 0.48, y: bounds.height * 0.77 },
  })
  await expect(page.getByRole('button', { name: 'Close laptop' })).toBeVisible()
  await page.getByRole('button', { name: 'Look at laptop' }).click()
  await expect(
    page.getByRole('button', { name: 'Back to the café' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Close laptop' }).click()
  await expect(page.getByRole('button', { name: 'Open laptop' })).toBeVisible()
  await page.keyboard.press('KeyF')
  await expect(page.getByRole('button', { name: 'Close laptop' })).toBeVisible()
  const charger = page.getByRole('button', { name: 'Plug in charger' })
  const chargerKey = await charger.getAttribute('aria-keyshortcuts')
  expect(chargerKey).toMatch(/^[1-9]$/)
  if (!chargerKey) throw new Error('The charger is missing a shortcut')
  await page.keyboard.press(chargerKey)
  await expect(page.locator('#feedback')).toHaveText('The laptop is charging.')
  const notes = page.getByRole('button', { name: 'Read field notes' })
  await notes.focus()
  await page.keyboard.press('Enter')
  const reader = page.getByRole('dialog', { name: 'Field notes' })
  await expect(reader).toBeVisible()
  await expect(reader.getByRole('button', { name: 'Close book' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(reader.getByText(/striped awning/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(reader).toBeHidden()
  await expect(notes).toBeFocused()
  await page.screenshot({ path: info.outputPath('window-props.png') })

  await switchView(page, true)
  await expect(
    page.getByRole('button', { name: 'Unplug charger' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close laptop' })).toBeVisible()
  await notes.click()
  await expect(reader.getByText(/striped awning/)).toBeVisible()
  const passage = reader.getByText(/striped awning/)
  await passage.click()
  await expect(reader).toBeVisible()
  const pageBounds = await passage.boundingBox()
  if (!pageBounds) throw new Error('The book page is offscreen')
  await page.mouse.move(pageBounds.x + 8, pageBounds.y + 8)
  await page.mouse.down()
  await page.mouse.move(2, 2, { steps: 6 })
  await page.mouse.up()
  await expect(reader).toBeVisible()
  await reader.getByRole('button', { name: 'Next page' }).click()
  await expect(reader.getByText('3 / 3')).toBeVisible()
  await page.mouse.click(2, 2)
  await expect(reader).toBeHidden()
  await expect(notes).toBeFocused()
  await page.getByRole('button', { name: 'Unplug charger' }).click()
  await switchView(page, false)
  await expect(
    page.getByRole('button', { name: 'Plug in charger' }),
  ).toBeVisible()
})

test('fills, reads, pets and carries items through both views', async ({
  page,
}, info) => {
  await openCafe(page)
  await expect(page.getByRole('button', { name: 'Fill cup' })).toBeHidden()
  await page.keyboard.press('KeyC')
  await walkUntil(page, 'KeyD', () =>
    expect(page.locator('#location-text')).toHaveText('At the bar'),
  )
  await page.keyboard.down('KeyD')
  await page.waitForTimeout(760)
  await page.keyboard.up('KeyD')
  const fill = page.getByRole('button', { name: 'Fill cup' })
  await walkUntil(page, 'KeyS', () => expect(fill).toBeVisible())
  await fill.click()
  await expect(page.getByText('Full cup', { exact: true })).toBeVisible()
  await switchView(page, true)
  await expect(page.getByText('Full cup', { exact: true })).toBeVisible()
  await page.keyboard.press('KeyH')
  await expect(page.getByText('Half-full cup', { exact: true })).toBeVisible()
  await fill.click()
  await page.getByRole('button', { name: 'Sip water' }).click()
  await switchView(page, false)
  await expect(page.getByText('Half-full cup', { exact: true })).toBeVisible()

  await walkUntil(page, 'KeyS', () =>
    expect(page.locator('#location-text')).toHaveText('Rear aisle'),
  )
  const pet = page.getByRole('button', { name: 'Pet Miso' })
  await expect(pet).toBeHidden()
  await page.keyboard.press('KeyX')
  await walkUntil(page, 'KeyA', () => expect(pet).toBeVisible())
  await page.getByRole('button', { name: 'Take atlas' }).click()
  await pet.click()
  await expect(page.locator('#feedback')).toHaveText(
    'Miso leans into your hand.',
  )
  await switchView(page, true)
  await expect(pet).toBeVisible()
  await page.screenshot({
    path: info.outputPath('pixel-carrying-atlas-and-water.png'),
  })
  await pet.click()
  await page.keyboard.press('KeyR')
  const atlas = page.getByRole('dialog', { name: 'A small atlas' })
  await atlas.getByRole('button', { name: 'Next page' }).click()
  await expect(atlas.getByText(/stairs behind the market/)).toBeVisible()
  await atlas.getByRole('button', { name: 'Close book' }).click()
  await switchView(page, false)
  await page.getByRole('button', { name: 'Read atlas' }).click()
  await expect(atlas.getByText('2 / 3')).toBeVisible()
  await page.keyboard.press('Escape')
  await switchView(page, true)
  await page.getByRole('button', { name: 'Return atlas' }).click()
  await expect(page.getByRole('button', { name: 'Read atlas' })).toBeHidden()
  await page.getByRole('button', { name: 'Take journal' }).click()
  await page.getByRole('button', { name: 'Read journal' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Trail journal' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Return journal' }).click()
  await page.getByRole('button', { name: 'Take atlas' }).click()
  await expect(page.getByRole('button', { name: 'Read atlas' })).toBeVisible()
  await page.getByRole('button', { name: 'Sip water' }).click()
  await expect(page.getByText('Empty cup', { exact: true })).toBeVisible()
})

test('sits back down and opens the entrance from both views', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  await openCafe(page)

  const stand = page.getByRole('button', { name: 'Stand up' })
  const sit = page.getByRole('button', { name: 'Sit down' })
  await stand.click()
  await page.clock.runFor(64)
  await expect(sit).toBeVisible()
  await sit.click()
  await page.clock.runFor(64)
  await expect(stand).toBeVisible()
  await page.keyboard.press('KeyC')
  for (const [key, duration] of [
    ['KeyD', 1700],
    ['KeyW', 455],
    ['KeyD', 800],
  ] as const) {
    await page.keyboard.down(key)
    await page.clock.runFor(duration)
    await page.keyboard.up(key)
  }
  const open = page.getByRole('button', { name: 'Open door' })
  await expect(open).toBeVisible()
  await expect(page.locator('#location-text')).toHaveText('By the entrance')
  const shut = await frameHash(page, info.outputPath('door-shut.png'))
  await open.click()
  await page.clock.runFor(64)
  const close = page.getByRole('button', { name: 'Close door' })
  await expect(close).toBeVisible()
  const opened = await frameHash(page, info.outputPath('door-open.png'))
  expect(opened).not.toEqual(shut)
  await pixelButton(page).click()
  await page.clock.runFor(64)
  await expect(close).toBeVisible()
  await close.click()
  await page.clock.runFor(64)
  await pixelButton(page).click()
  await page.clock.runFor(64)
  await expect(page.locator('#feedback')).toHaveText('You closed the door.')
  expect(await frameHash(page, info.outputPath('door-restored.png'))).toEqual(
    shut,
  )
})

test('places the cup and atlas on the window desk and picks them back up', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  await openCafe(page)
  await page.keyboard.press('KeyC')
  async function go(key: string, duration: number) {
    await page.keyboard.down(key)
    await page.clock.runFor(duration)
    await page.keyboard.up(key)
  }
  await go('KeyD', 1930)
  await go('KeyS', 1740)
  await page.getByRole('button', { name: 'Fill cup' }).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Sip water' }).click()
  await go('KeyS', 300)
  await go('KeyA', 2400)
  await page.getByRole('button', { name: 'Take atlas' }).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Read atlas' }).click()
  const reader = page.getByRole('dialog', { name: 'A small atlas' })
  await reader.getByRole('button', { name: 'Next page' }).click()
  await reader.getByRole('button', { name: 'Close book' }).click()
  await go('KeyW', 2200)
  await go('KeyD', 465)
  await page.getByRole('button', { name: 'Sit down' }).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Put down cup' }).click()
  await page.clock.runFor(64)
  const place = page.getByRole('button', { name: 'Place here' })
  await expect(place).toHaveAttribute('aria-keyshortcuts', 'F')
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toHaveAttribute('aria-keyshortcuts', 'Escape')
  await expect(page.getByRole('button', { name: 'Put down cup' })).toBeHidden()
  await page.keyboard.press('KeyF')
  await page.clock.runFor(64)
  await expect(place).toBeHidden()
  await expect(page.getByRole('button', { name: 'Pick up cup' })).toBeVisible()
  await page.getByRole('button', { name: 'Put down atlas' }).click()
  await page.clock.runFor(64)
  const canvas = await view(page).boundingBox()
  if (!canvas) throw new Error('Café canvas is offscreen')
  await view(page).click({
    position: { x: canvas.width * 0.55, y: canvas.height * 0.17 },
  })
  await expect(
    page.getByText('Choose a clear surface within reach.'),
  ).toBeVisible()
  await view(page).click({
    position: { x: canvas.width * 0.89, y: canvas.height * 0.835 },
  })
  await page.clock.runFor(64)
  await expect(
    page.getByRole('button', { name: 'Pick up atlas' }),
  ).toBeVisible()
  await view(page).screenshot({ path: info.outputPath('placed-at-window.png') })
  await pixelButton(page).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Pick up cup' }).click()
  await page.clock.runFor(64)
  await expect(page.getByText('Half-full cup', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pick up atlas' }).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Read atlas' }).click()
  await expect(reader.getByText('2 / 3')).toBeVisible()
})

test('compares both streets at the same three camera poses', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  for (const variant of ['geometry', 'depth']) {
    const streetAsset = page.waitForResponse(
      (response) =>
        response.ok() &&
        response
          .url()
          .endsWith(
            variant === 'depth' ? '/street-depth.glbz' : '/street.glbz',
          ),
    )
    await page.goto('/lab/?street=' + variant)
    await streetAsset
    await expect(pixelButton(page)).toBeEnabled()
    await expect(view(page)).toBeVisible()
    const clip = await view(page).boundingBox()
    if (!clip) throw new Error('Café canvas is offscreen')
    await page.clock.runFor(64)
    await page.screenshot({
      clip,
      path: info.outputPath(variant + '-seated.png'),
    })
    await page.keyboard.press('KeyC')
    await page.clock.runFor(64)
    await page.screenshot({
      clip,
      path: info.outputPath(variant + '-standing.png'),
    })
    await page.keyboard.down('KeyD')
    await page.clock.runFor(1312)
    await page.keyboard.up('KeyD')
    await page.clock.runFor(64)
    await page.screenshot({
      clip,
      path: info.outputPath(variant + '-aisle.png'),
    })
  }
})

test('resizes while loading and animates a prop when motion is enabled', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.route('**/cafe.glbz', async (route) => {
    await page.setViewportSize({ width: 820, height: 700 })
    await route.continue()
  })
  await openCafe(page)
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  const before = await view(page).screenshot()
  await page.getByRole('button', { name: 'Open laptop' }).dispatchEvent('click')
  await page.clock.runFor(35)
  const moving = await view(page).screenshot()
  await page.clock.runFor(700)
  const open = await view(page).screenshot({
    path: info.outputPath('laptop-settled.png'),
  })
  expect(moving).not.toEqual(before)
  expect(open).not.toEqual(moving)
  await expect(page.getByRole('button', { name: 'Close laptop' })).toBeVisible()
})

test('the reader turns a sheet in both directions and restores focus on Escape', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1440, height: 940 })
  await openCafe(page)
  const notes = page.getByRole('button', { name: 'Read field notes' })
  await notes.click()
  const reader = page.getByRole('dialog', { name: 'Field notes' })
  await expect
    .poll(async () => (await reader.boundingBox())?.width)
    .toBeCloseTo(1440 * 0.8)
  const sheet = reader.locator('#book-turn')
  const pageText = reader.locator('#book-page')
  const turningText = sheet.locator('#turning-text')
  const first = await pageText.innerText()
  await page.keyboard.press('ArrowRight')
  await expect(turningText).toHaveText(first)
  await sheet.evaluate((element) => {
    const [turn] = element.getAnimations()
    if (!turn) throw new Error('The page has no turn animation')
    turn.pause()
    turn.currentTime = 190
  })
  await reader.screenshot({ path: info.outputPath('turning-page.png') })
  await sheet.evaluate((element) => element.getAnimations()[0]?.finish())
  await expect(sheet).toBeHidden()
  await expect(pageText).toContainText('striped awning')
  await page.keyboard.press('ArrowLeft')
  await expect(turningText).toHaveText(first)
  await page.keyboard.press('Escape')
  await expect(reader).toBeHidden()
  await expect(notes).toBeFocused()
  await notes.click()
  await expect(pageText).toHaveText(first)
  await expect(sheet).toBeHidden()
})

test('home fills the viewport and can focus the laptop before opening the study', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  await page.goto('/')
  await expect(pixelButton(page)).toBeEnabled()
  expect(await view(page).boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: 1440,
    height: 940,
  })
  await page.getByRole('button', { name: 'Open laptop' }).click()
  const open = await view(page).screenshot()
  await view(page).click({ position: { x: 690, y: 484 } })
  await expect(
    page.getByRole('button', { name: 'Back to the café' }),
  ).toBeVisible()
  const shelfIndex = await frameHash(page)
  expect(shelfIndex).not.toBe(createHash('sha256').update(open).digest('hex'))
  await view(page).click({ position: { x: 600, y: 648 } })
  await expect(
    page.getByRole('button', { name: 'Trail journal' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => frameHash(page)).not.toBe(shelfIndex)
  const indexButton = page.getByRole('button', { name: 'Shelf index' })
  await indexButton.click()
  await expect(indexButton).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(500, 360)
  await page.mouse.down()
  await page.mouse.move(80, 220, { steps: 8 })
  await page.mouse.up()
  await expect(
    page.getByRole('button', { name: 'Back to the café' }),
  ).toBeVisible()
  await view(page).click({ position: { x: 80, y: 220 } })
  await expect(
    page.getByRole('button', { name: 'Look at laptop' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close laptop' })).toBeVisible()
  await switchView(page, true)
  await page.getByRole('button', { name: 'Look at laptop' }).click()
  await view(page).click({ position: { x: 80, y: 220 } })
  await expect(pixelButton(page)).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Scene study' }).click()
  await expect(page).toHaveURL(/\/lab\/$/)
  await expect(page.getByText('Study notes')).toBeVisible()
})
