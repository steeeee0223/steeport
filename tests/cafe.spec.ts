import { type Locator, type Page, expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

import {
  type Cafe,
  changePosture,
  initialCafe,
  layout,
  walk,
} from '../src/cafe'

test.use({ reducedMotion: 'reduce' })

const pixelButton = (page: Page) =>
  page.getByRole('button', { name: 'Pixel view' })
const view = (page: Page) => page.getByRole('img', { name: /Café view/ })

async function openCafe(page: Page) {
  await page.goto('/lab/')
  await expect(pixelButton(page)).toBeEnabled()
  await expect(view(page)).toBeVisible()
}

async function switchView(page: Page, pixel: boolean) {
  await pixelButton(page).click()
  await expect(pixelButton(page)).toHaveAttribute('aria-pressed', String(pixel))
}

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
  const lookingAtWindow = await view(page).screenshot()
  await dragLook(80)
  await expect.poll(() => view(page).screenshot()).not.toEqual(lookingAtWindow)
  const atBar = await view(page).screenshot()

  await switchView(page, true)
  await expect(page.locator('#location-text')).toHaveText('At the bar')
  const beforeOrbit = await view(page).screenshot()
  await page.screenshot({ path: info.outputPath('desktop-pixel-at-bar.png') })
  await page.getByRole('button', { name: 'Rotate camera right' }).click()
  await expect.poll(() => view(page).screenshot()).not.toEqual(beforeOrbit)
  await expect(page.locator('#location-text')).toHaveText('At the bar')
  await page.screenshot({ path: info.outputPath('desktop-orbit-at-bar.png') })
  await switchView(page, false)
  expect(await view(page).screenshot()).toEqual(atBar)

  await dragLook(-80)
  await expect.poll(() => view(page).screenshot()).toEqual(lookingAtWindow)
  const sit = page.getByRole('button', { name: 'Sit down' })
  await walkUntil(page, 'KeyA', () =>
    expect(page.getByRole('button', { name: 'Open laptop' })).toBeVisible(),
  )
  await sit.click()

  const closed = await view(page).screenshot()
  await page.getByRole('button', { name: 'Open laptop' }).click()
  const closeLaptop = page.getByRole('button', { name: 'Close laptop' })
  await expect(closeLaptop).toBeVisible()
  const opened = await view(page).screenshot()
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
  expect(await view(page).screenshot()).toEqual(opened)
  await closeLaptop.click()
  await expect(page.getByRole('button', { name: 'Open laptop' })).toBeEnabled()
  expect(await view(page).screenshot()).toEqual(closed)
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
    const atBar = await view(page).screenshot()
    await expect(page.locator('#location-text')).toHaveText('At the bar')
    await page.getByRole('button', { name: 'Rotate camera left' }).tap()
    await expect.poll(() => view(page).screenshot()).not.toEqual(atBar)
    await page.screenshot({ path: info.outputPath('phone-pixel-bar.png') })

    await switchView(page, false)
    const sit = page.getByRole('button', { name: 'Sit down' })
    await holdTouch(page, page.getByRole('button', { name: 'Move left' }), () =>
      expect(page.getByRole('button', { name: 'Open laptop' })).toBeVisible(),
    )
    await sit.tap()
    await page.getByRole('button', { name: 'Open laptop' }).tap()
    await switchView(page, true)
    await expect(
      page.getByRole('button', { name: 'Close laptop' }),
    ).toBeVisible()
    await page.locator('[data-marker="charger"]').tap()
    await expect(
      page.getByRole('button', { name: 'Unplug charger' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Read field notes' }).tap()
    const reader = page.getByRole('dialog', { name: 'Field notes' })
    await reader.getByRole('button', { name: 'Next page' }).tap()
    await expect(reader.getByText('2 / 3')).toBeVisible()
    await reader.getByRole('button', { name: 'Close book' }).tap()
    await page.screenshot({ path: info.outputPath('phone-pixel-window.png') })
    const wide = await view(page).screenshot()
    await page.getByRole('button', { name: 'Zoom in' }).tap()
    await expect.poll(() => view(page).screenshot()).not.toEqual(wide)
    await page.screenshot({ path: info.outputPath('phone-pixel-close.png') })
    await page.getByRole('button', { name: 'Zoom out' }).tap()
    await expect.poll(() => view(page).screenshot()).toEqual(wide)
  })
})

test('the stills remain reachable if the room model fails', async ({
  page,
}) => {
  await page.route('**/cafe.glb', (route) => route.abort())
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

test('handles the window props by marker, keyboard and reader controls', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  await openCafe(page)
  const bounds = await view(page).boundingBox()
  if (!bounds) throw new Error('Café canvas is offscreen')
  await view(page).click({
    position: { x: bounds.width * 0.48, y: bounds.height * 0.77 },
  })
  await expect(page.getByRole('button', { name: 'Close laptop' })).toBeVisible()
  await page.locator('[data-marker="laptop"]').click()
  await expect(
    page.getByRole('button', { name: 'Back to the café' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Close laptop' }).click()
  await expect(page.getByRole('button', { name: 'Open laptop' })).toBeVisible()
  await page.keyboard.press('KeyF')
  await expect(page.getByRole('button', { name: 'Close laptop' })).toBeVisible()
  await page.getByRole('button', { name: 'Plug in charger' }).click()
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
  await reader.getByRole('button', { name: 'Next page' }).click()
  await expect(reader.getByText('3 / 3')).toBeVisible()
  await reader.getByRole('button', { name: 'Close book' }).click()
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
  await page.getByRole('button', { name: 'Sip water' }).click()
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
  await expect(page.locator('[data-marker="cat"]')).toBeVisible()
  await page.screenshot({
    path: info.outputPath('pixel-carrying-atlas-and-water.png'),
  })
  await pet.click()
  await page.getByRole('button', { name: 'Read atlas' }).click()
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
  const shut = await view(page).screenshot({
    path: info.outputPath('door-shut.png'),
  })
  await open.click()
  await page.clock.runFor(64)
  const close = page.getByRole('button', { name: 'Close door' })
  await expect(close).toBeVisible()
  const opened = await view(page).screenshot({
    path: info.outputPath('door-open.png'),
  })
  expect(opened).not.toEqual(shut)
  await pixelButton(page).click()
  await page.clock.runFor(64)
  await expect(close).toBeVisible()
  await close.click()
  await page.clock.runFor(64)
  await pixelButton(page).click()
  await page.clock.runFor(64)
  expect(await view(page).screenshot()).toEqual(shut)
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
  await page.keyboard.press('KeyF')
  await page.clock.runFor(64)
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
          .endsWith(variant === 'depth' ? '/street-depth.glb' : '/street.glb'),
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
  await page.route('**/cafe.glb', async (route) => {
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
  const frameHash = async () =>
    createHash('sha256')
      .update(await view(page).screenshot())
      .digest('hex')
  const shelfIndex = await frameHash()
  expect(shelfIndex).not.toBe(createHash('sha256').update(open).digest('hex'))
  await view(page).click({ position: { x: 600, y: 648 } })
  await expect(
    page.getByRole('button', { name: 'Trail journal' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(frameHash).not.toBe(shelfIndex)
  const indexButton = page.getByRole('button', { name: 'Shelf index' })
  await indexButton.click()
  await expect(indexButton).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', { name: 'Look at laptop' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Scene study' }).click()
  await expect(page).toHaveURL(/\/lab\/$/)
  await expect(page.getByText('Study notes')).toBeVisible()
})
