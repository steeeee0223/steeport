import { type Locator, type Page, expect, test } from '@playwright/test'

import { type Cafe, initialCafe, layout, walk } from '../src/cafe'

const pixelButton = (page: Page) =>
  page.getByRole('button', { name: 'Pixel view' })
const view = (page: Page) => page.getByRole('img', { name: /Café view/ })

async function openCafe(page: Page) {
  await page.goto('/')
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
  await walkUntil(page, 'KeyA', () => expect(sit).toBeEnabled())
  await sit.click()

  const closed = await view(page).screenshot()
  await page.getByRole('button', { name: 'Open laptop' }).click()
  const closeLaptop = page.getByRole('button', { name: 'Close laptop' })
  await expect(closeLaptop).toHaveAttribute('aria-pressed', 'true')
  const opened = await view(page).screenshot()
  expect(opened).not.toEqual(closed)
  await page.screenshot({ path: info.outputPath('desktop-laptop-open.png') })
  await switchView(page, true)
  await expect(closeLaptop).toHaveAttribute('aria-pressed', 'true')
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
      expect(sit).toBeEnabled(),
    )
    await sit.tap()
    await page.getByRole('button', { name: 'Open laptop' }).tap()
    await switchView(page, true)
    await expect(
      page.getByRole('button', { name: 'Close laptop' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: info.outputPath('phone-pixel-window.png') })
  })
})

test('the stills remain reachable if the room model fails', async ({
  page,
}) => {
  await page.route('**/cafe.glb', (route) => route.abort())
  await page.goto('/')
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
