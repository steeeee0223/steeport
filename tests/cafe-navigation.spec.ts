import { type Locator, type Page, expect, test } from '@playwright/test'

import { annexEntry, annexSize, entryEdge } from '../src/annex'
import {
  frameHash,
  journalTitle,
  openCafe,
  openControls,
  pauseAmbientFilm,
  pixelButton,
  settingsButton,
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
  await expect(page.locator('#viewport')).toHaveClass(/\bpixel\b/)
  const beforeOrbit = await frameHash(page)
  await page.keyboard.press('KeyZ')
  await expect.poll(() => frameHash(page)).not.toEqual(beforeOrbit)
  await page.keyboard.press('KeyZ')
  await expect.poll(() => frameHash(page)).toEqual(beforeOrbit)
  await page.screenshot({ path: info.outputPath('desktop-pixel-at-bar.png') })
  await page.keyboard.press('KeyE')
  await expect.poll(() => frameHash(page)).not.toEqual(beforeOrbit)
  await expect(page.locator('#location-text')).toHaveText('At the bar')
  await page.screenshot({ path: info.outputPath('desktop-orbit-at-bar.png') })
  await switchView(page, false)
  await expect.poll(() => frameHash(page)).toEqual(atBar)

  await dragLook(-80)
  await expect.poll(() => frameHash(page)).not.toEqual(atBar)
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

test('lists fixed keyboard controls in the settings dialog and restores focus', async ({
  page,
}, info) => {
  await openCafe(page)
  await page.keyboard.press('KeyC')
  await settingsButton(page).click()
  const menu = page.getByRole('group', { name: 'Café settings' })
  await expect(menu.locator('button > svg')).toHaveCount(4)
  await expect(menu.locator('button > kbd')).toHaveText(['M', 'V'])
  await menu.screenshot({ path: info.outputPath('settings-menu.png') })
  await menu.getByRole('button', { name: 'Controls', exact: true }).click()
  const guide = page.getByRole('dialog', { name: 'Controls' })
  await guide.screenshot({ path: info.outputPath('controls-dialog.png') })
  for (const [action, keys] of [
    ['Move', ['W', 'A', 'S', 'D']],
    ['Run while moving', ['Shift']],
    ['Jump', ['Space']],
    ['Crouch or stand upright', ['X']],
    ['Sit or stand near a seat', ['C']],
    ['Turn the camera', ['Q', 'E']],
    ['Zoom in pixel view', ['Z']],
    ['Use a nearby object', ['F']],
    ['Rotate furniture in Build mode', [',', '.']],
  ] as const) {
    const row = guide.locator('dl > div').filter({
      has: page.getByText(action, { exact: true }),
    })
    await expect(row.locator('dd kbd')).toHaveText(keys)
  }
  await expect(
    guide.getByRole('button', { name: 'Crouch', exact: true }),
  ).toBeHidden()
  await expect(
    guide.getByRole('group', { name: 'Camera controls' }),
  ).toBeHidden()
  await expect(guide.getByRole('heading', { name: 'Controls' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    guide.getByRole('button', { name: 'Close', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('KeyV')
  await expect(page.locator('#view-label')).toHaveText('01 / FIRST PERSON')
  await page.keyboard.press('Escape')
  await expect(guide).toBeHidden()
  await expect(settingsButton(page)).toBeFocused()

  await switchView(page, true)
  await openControls(page)
  await expect(
    guide.getByRole('button', { name: /^Zoom (in|out)$/ }),
  ).toBeHidden()
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
    const guide = await openControls(page)
    const camera = guide.getByRole('group', { name: 'Camera controls' })
    const closeGuide = guide.getByRole('button', { name: 'Close', exact: true })
    await expect(camera.getByRole('button')).toHaveCount(2)
    await closeGuide.tap()
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
    await openControls(page)
    await guide.getByRole('button', { name: 'Crouch', exact: true }).tap()
    await guide
      .getByRole('button', { name: 'Stand upright', exact: true })
      .tap()
    await camera.getByRole('button', { name: 'Rotate camera left' }).tap()
    await closeGuide.tap()
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
    await openControls(page)
    const zoomIn = guide.getByRole('button', { name: 'Zoom in' })
    const zoomOut = guide.getByRole('button', { name: 'Zoom out' })
    await guide.screenshot({
      path: info.outputPath('phone-controls-dialog.png'),
    })
    await expect(zoomIn.locator('.lucide-zoom-in')).toBeVisible()
    await expect(zoomIn.locator('.lucide-zoom-out')).toBeHidden()
    await zoomIn.tap()
    await expect(zoomOut.locator('.lucide-zoom-out')).toBeVisible()
    await expect(zoomOut.locator('.lucide-zoom-in')).toBeHidden()
    await closeGuide.tap()
    await expect.poll(() => frameHash(page)).not.toEqual(wide)
    await page.screenshot({ path: info.outputPath('phone-pixel-close.png') })
    await openControls(page)
    await zoomOut.tap()
    await closeGuide.tap()
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

test('uses a built door, chair and floor lamp while exploring the annex', async ({
  page,
}, info) => {
  await page.addInitScript(
    ({ entry, row, edge }) => {
      localStorage.setItem(
        'steeport.annex',
        JSON.stringify({
          version: 5,
          floor: [
            entry,
            entry + 1,
            entry + 2,
            entry + row,
            entry + row + 1,
            entry + row + 2,
          ],
          partitions: [{ kind: 'door', edge }],
          furniture: [
            { kind: 'chair', cell: entry + row, turns: 3 },
            { kind: 'lamp', cell: entry + 1 },
          ],
        }),
      )
    },
    { entry: annexEntry, row: annexSize, edge: entryEdge },
  )
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  await openCafe(page)
  await pauseAmbientFilm(page)
  async function go(key: string, duration: number) {
    await page.keyboard.down(key)
    await page.clock.runFor(duration)
    await page.keyboard.up(key)
  }
  await page.keyboard.press('KeyC')
  await page.clock.runFor(64)
  await page.keyboard.down('Shift')
  await go('KeyD', 1190)
  await page.keyboard.up('Shift')
  await go('KeyS', 2250)
  await go('KeyD', 800)
  for (let turn = 0; turn < 4; turn++) await page.keyboard.press('KeyE')
  await page.clock.runFor(32)

  const closeDoor = page.getByRole('button', {
    name: 'Close door',
    exact: true,
  })
  const openDoor = page.getByRole('button', { name: 'Open door', exact: true })
  await expect(closeDoor).toBeVisible()
  await closeDoor.click()
  await page.clock.runFor(32)
  await expect(openDoor).toBeVisible()
  await go('KeyW', 550)
  await expect(page.locator('#location-text')).toHaveText('Rear aisle')
  await openDoor.click()
  await page.clock.runFor(32)
  await go('KeyW', 400)
  await expect(page.locator('#location-text')).toHaveText('Reading room')

  const lampOn = page.getByRole('button', { name: 'Turn on floor lamp' })
  const lampOff = page.getByRole('button', { name: 'Turn off floor lamp' })
  await expect(lampOn).toBeVisible()
  const dark = await frameHash(page, info.outputPath('annex-lamp-dark.png'))
  await lampOn.click()
  await page.clock.runFor(32)
  expect(await frameHash(page, info.outputPath('annex-lamp-lit.png'))).not.toBe(
    dark,
  )
  await lampOff.click()
  await page.clock.runFor(32)
  expect(
    await frameHash(page, info.outputPath('annex-lamp-dark-again.png')),
  ).toBe(dark)

  await go('KeyD', 170)
  const sit = page.getByRole('button', { name: 'Sit down' })
  await expect(sit).toBeVisible()
  await page.keyboard.press('KeyC')
  await page.clock.runFor(32)
  await expect(page.getByRole('button', { name: 'Stand up' })).toBeVisible()
  await page.keyboard.press('KeyC')
  await page.clock.runFor(32)
  await expect(sit).toBeVisible()
})

test('switches the original café floor lamp off and back on', async ({
  page,
}, info) => {
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  await openCafe(page)
  await pauseAmbientFilm(page)
  await page.keyboard.press('KeyC')
  for (const [key, duration] of [
    ['KeyA', 760],
    ['KeyS', 1660],
    ['KeyA', 700],
  ] as const) {
    await page.keyboard.down(key)
    await page.clock.runFor(duration)
    await page.keyboard.up(key)
  }
  for (let turn = 0; turn < 4; turn++) await page.keyboard.press('KeyQ')
  await page.clock.runFor(32)
  const off = page.getByRole('button', { name: 'Turn off floor lamp' })
  const on = page.getByRole('button', { name: 'Turn on floor lamp' })
  await expect(off).toBeVisible()
  const lit = await frameHash(page, info.outputPath('original-lamp-lit.png'))
  await off.click()
  await page.clock.runFor(32)
  await expect(on).toBeVisible()
  expect(
    await frameHash(page, info.outputPath('original-lamp-dark.png')),
  ).not.toBe(lit)
  await on.click()
  await page.clock.runFor(32)
  expect(
    await frameHash(page, info.outputPath('original-lamp-lit-again.png')),
  ).toBe(lit)
})
