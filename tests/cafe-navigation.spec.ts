import { type Locator, type Page, expect, test } from '@playwright/test'

import {
  frameHash,
  journalTitle,
  openCafe,
  pauseAmbientFilm,
  pixelButton,
  switchView,
  view,
  walkUntil,
} from './cafe-fixtures'

test.use({ reducedMotion: 'reduce' })

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

test('walks to the bar and back, keeping pose and laptop state through camera changes', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  await openCafe(page)
  await pauseAmbientFilm(page)
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
  await page.keyboard.press('KeyZ')
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible()
  await page.keyboard.press('KeyZ')
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
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

  for (let toggle = 0; toggle < 3; toggle++) await page.keyboard.press('KeyV')
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
    await pauseAmbientFilm(page)
    const camera = page.getByRole('group', { name: 'Camera controls' })
    await expect(camera.getByRole('button')).toHaveCount(2)
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
    await page.getByRole('button', { name: 'Read ' + journalTitle }).tap()
    const reader = page.getByRole('dialog', { name: journalTitle })
    await reader.getByRole('button', { name: 'Next page' }).tap()
    await expect(reader.locator('#page-number')).toHaveText(/^2 \/ \d+$/)
    await reader.screenshot({
      path: info.outputPath('development-journal-phone.png'),
    })
    await page.touchscreen.tap(2, 2)
    await expect(reader).toBeHidden()
    await page.screenshot({ path: info.outputPath('phone-pixel-window.png') })
    const wide = await frameHash(page)
    const zoomIn = camera.getByRole('button', { name: 'Zoom in' })
    const zoomOut = camera.getByRole('button', { name: 'Zoom out' })
    await expect(camera.getByRole('button')).toHaveCount(3)
    await expect(zoomIn.locator('.lucide-zoom-in')).toBeVisible()
    await expect(zoomIn.locator('.lucide-zoom-out')).toBeHidden()
    await zoomIn.tap()
    await expect.poll(() => frameHash(page)).not.toEqual(wide)
    await expect(zoomOut.locator('.lucide-zoom-out')).toBeVisible()
    await expect(zoomOut.locator('.lucide-zoom-in')).toBeHidden()
    await page.screenshot({ path: info.outputPath('phone-pixel-close.png') })
    await zoomOut.tap()
    await expect.poll(() => frameHash(page)).toEqual(wide)
  })
})

test('sits back down and opens the entrance from both views', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  await openCafe(page)
  await pauseAmbientFilm(page)

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
  await switchView(page, true)
  await page.clock.runFor(64)
  await expect(close).toBeVisible()
  await close.click()
  await page.clock.runFor(64)
  await switchView(page, false)
  await page.clock.runFor(64)
  await expect(page.locator('#feedback')).toHaveText('You closed the door.')
  expect(await frameHash(page, info.outputPath('door-restored.png'))).toEqual(
    shut,
  )
})
