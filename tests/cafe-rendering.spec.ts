import { type Page, expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'

import {
  journalTitle,
  leoTitle,
  openCafe,
  pauseAmbientFilm,
  pixelButton,
  settingsButton,
  switchView,
  view,
} from './cafe-fixtures'

test.use({ reducedMotion: 'reduce' })

test('loads both camera modes without native gzip decompression', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'DecompressionStream', { value: undefined })
  })
  await openCafe(page)
  await switchView(page, true)
  await expect(
    page.getByRole('button', { name: 'Read ' + journalTitle }),
  ).toBeVisible()
})

test('the book and stills remain reachable if the room model fails', async ({
  page,
}) => {
  await page.route('**/cafe.glbz', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText(
    'interactive room is unavailable',
  )
  await expect(pixelButton(page)).toBeDisabled()
  await expect(settingsButton(page)).toBeHidden()
  await expect(page.locator('#preview')).toBeVisible()
  const journal = page.getByRole('button', { name: journalTitle })
  await journal.click()
  const reader = page.getByRole('dialog', { name: journalTitle })
  await expect(
    reader.getByRole('heading', { name: '從一張平面圖開始' }),
  ).toBeVisible()
  await reader.getByRole('button', { name: 'Next page' }).click()
  await expect(
    reader.getByRole('heading', { name: '同一間店，兩種看法' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(journal).toBeFocused()
  const standing = page.getByRole('link', { name: 'Standing Blender still' })
  await expect(standing).toBeVisible()
  await standing.click()
  await expect(page).toHaveURL(/\/studies\/standing-turn\.jpg$/)
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
    await page.goto('/?street=' + variant)
    await streetAsset
    await expect(settingsButton(page)).toBeVisible()
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
  await pauseAmbientFilm(page)
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

test.describe('pixel visitor animation', () => {
  test.use({ reducedMotion: 'no-preference' })

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 940 })
    const start = new Date('2026-01-01T12:00:00Z')
    await page.clock.install({ time: start })
    await page.clock.pauseAt(new Date(start.getTime() + 1000))
    await openCafe(page)
    await pauseAmbientFilm(page)
  })

  async function pose(page: Page, path: string) {
    const bounds = await view(page).boundingBox()
    if (!bounds) throw new Error('Café canvas is offscreen')
    return createHash('sha256')
      .update(
        await page.screenshot({
          path,
          clip: {
            x: bounds.x + bounds.width / 2 - 150,
            y: bounds.y + bounds.height / 2 - 145,
            width: 300,
            height: 340,
          },
        }),
      )
      .digest('hex')
  }

  test('shows the seated, walking and crouching poses', async ({
    page,
  }, info) => {
    await switchView(page, true)
    await page.clock.runFor(32)
    await page.getByRole('button', { name: 'Zoom in' }).click()
    for (let turn = 0; turn < 3; turn++) await page.keyboard.press('KeyE')
    await page.clock.runFor(32)
    await pose(page, info.outputPath('seated.png'))

    await page.keyboard.press('KeyC')
    await page.clock.runFor(550)
    await page.keyboard.down('KeyS')
    await page.clock.runFor(240)
    const walking = await pose(page, info.outputPath('walking.png'))
    await page.clock.runFor(160)
    expect(await pose(page, info.outputPath('next-step.png'))).not.toBe(walking)
    await page.keyboard.up('KeyS')
    await page.keyboard.press('KeyE')
    await page.clock.runFor(550)
    const upright = await pose(page, info.outputPath('upright.png'))
    await page.keyboard.press('KeyX')
    await page.clock.runFor(550)
    expect(await pose(page, info.outputPath('crouching.png'))).not.toBe(upright)
  })

  test('shows the cup lift, sip and book pickup', async ({ page }, info) => {
    async function go(key: string, duration: number) {
      await page.keyboard.down(key)
      await page.clock.runFor(duration)
      await page.keyboard.up(key)
    }

    await page.keyboard.press('KeyC')
    await go('KeyD', 1930)
    await go('KeyS', 1740)
    await switchView(page, true)
    await page.clock.runFor(32)
    await page.getByRole('button', { name: 'Zoom in' }).click()
    await page.keyboard.press('KeyE')
    await go('KeyA', 48)
    await page.getByRole('button', { name: 'Fill cup' }).click()
    await page.clock.runFor(810)
    const lifting = await pose(page, info.outputPath('lifting-cup.png'))
    await page.clock.runFor(480)
    const holding = await pose(page, info.outputPath('holding-cup.png'))
    expect(holding).not.toBe(lifting)
    await page.getByRole('button', { name: 'Sip water' }).click()
    await page.clock.runFor(300)
    expect(await pose(page, info.outputPath('sipping.png'))).not.toBe(holding)
    await page.clock.runFor(480)
    await expect(page.getByText('Half-full cup', { exact: true })).toBeVisible()

    await go('KeyW', 300)
    await go('KeyD', 2400)
    await go('KeyW', 48)
    await page.keyboard.press('KeyE')
    await page.getByRole('button', { name: 'Take ' + leoTitle }).click()
    await page.clock.runFor(176)
    const reaching = await pose(page, info.outputPath('taking-book.png'))
    await page.clock.runFor(440)
    expect(await pose(page, info.outputPath('holding-both.png'))).not.toBe(
      reaching,
    )
    await expect(
      page.getByRole('button', { name: 'Read ' + leoTitle }),
    ).toBeVisible()
  })
})
