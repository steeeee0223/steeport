import { type Page, expect, test } from '@playwright/test'

import {
  frameHash,
  journalTitle,
  journalUrl,
  leoTitle,
  openCafe,
  pauseAmbientFilm,
  pixelButton,
  settingsButton,
  switchView,
  view,
  walkUntil,
} from './cafe-fixtures'

test.use({ reducedMotion: 'reduce' })

async function turnVisitor(page: Page, key: 'KeyQ' | 'KeyE', steps: number) {
  for (let step = 0; step < steps; step++) await page.keyboard.press(key)
}

test('lo-fi loads after opt-in and can be muted and resumed from the HUD', async ({
  page,
}) => {
  const downloads: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/afternoon-loop.m4a'))
      downloads.push(request.url())
  })
  await openCafe(page)
  const settings = settingsButton(page)
  const music = page.locator('#music')
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(settings).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#settings-menu button')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Lo-fi music' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pixel view' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(music).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(music).toBeHidden()
  await expect(settings).toBeFocused()
  await expect(music).toHaveAttribute('aria-pressed', 'false')
  expect(downloads).toHaveLength(0)
  await page.keyboard.press('m')
  await expect(music).toHaveAttribute('aria-pressed', 'true')
  await expect(music).not.toHaveAttribute('aria-busy', 'true')
  expect(downloads).toHaveLength(1)
  await settings.click()
  await music.click()
  await expect(settings).toHaveAttribute('aria-expanded', 'false')
  await expect(music).toHaveAttribute('aria-pressed', 'false')
  await settings.click()
  await music.click()
  await expect(music).toHaveAttribute('aria-pressed', 'true')
  await expect(music).not.toHaveAttribute('aria-busy', 'true')
  expect(downloads).toHaveLength(1)
  await page.getByRole('button', { name: 'Read ' + journalTitle }).click()
  await expect(page.getByRole('dialog', { name: journalTitle })).toBeVisible()
  await page.keyboard.press('m')
  await expect(music).toHaveAttribute('aria-pressed', 'false')
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
    position: { x: bounds.width * 0.48, y: bounds.height * 0.66 },
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
  const notes = page.getByRole('button', { name: 'Read ' + journalTitle })
  await notes.focus()
  await page.keyboard.press('Enter')
  const reader = page.getByRole('dialog', { name: journalTitle })
  await expect(reader).toBeVisible()
  await expect(reader.getByRole('button', { name: 'Close book' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(reader.getByText(/掀開筆電後切換視角/)).toBeVisible()
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
  await expect(reader.getByText(/掀開筆電後切換視角/)).toBeVisible()
  const passage = reader.getByText(/掀開筆電後切換視角/)
  await passage.click()
  await expect(reader).toBeVisible()
  const pageBounds = await passage.boundingBox()
  if (!pageBounds) throw new Error('The book page is offscreen')
  await page.mouse.move(pageBounds.x + 8, pageBounds.y + 8)
  await page.mouse.down()
  await page.mouse.move(2, 2, { steps: 6 })
  await page.mouse.up()
  await expect(reader).toBeVisible()
  await reader.getByRole('button', { name: 'Previous page' }).click()
  const sharePage = await page.context().newPage()
  await sharePage.goto(journalUrl)
  const sections = sharePage.locator('article > section')
  const chapterCount = await sections.count()
  expect(chapterCount).toBeGreaterThan(3)
  for (let index = 0; index < chapterCount; index++) {
    const section = sections.nth(index)
    await expect(
      reader.getByRole('link', { name: 'Open shareable page' }),
    ).toHaveAttribute(
      'href',
      journalUrl + '#' + (await section.getAttribute('id')),
    )
    await expect(reader.locator('#book-page h3')).toHaveText(
      await section.locator('h2').innerText(),
    )
    await expect(
      reader.getByText(`${index + 1} / ${chapterCount}`),
    ).toBeVisible()
    const image = reader.locator('#book-page img')
    await expect(image).toHaveAttribute(
      'src',
      (await section.locator('img').getAttribute('src')) ?? '',
    )
    await expect
      .poll(() =>
        image.evaluate(
          (img) => img instanceof HTMLImageElement && img.naturalWidth,
        ),
      )
      .toBeGreaterThan(0)
    if (index < chapterCount - 1)
      await reader.getByRole('button', { name: 'Next page' }).click()
  }
  await expect(reader.getByRole('button', { name: 'Next page' })).toBeDisabled()
  await sharePage.close()
  await page.mouse.click(2, 2)
  await expect(reader).toBeHidden()
  await expect(notes).toBeFocused()
  await page.getByRole('button', { name: 'Unplug charger' }).click()
  await switchView(page, false)
  await expect(
    page.getByRole('button', { name: 'Plug in charger' }),
  ).toBeVisible()
})

test('uses the visitor facing for desk actions in both camera modes', async ({
  page,
}) => {
  await openCafe(page)
  await page.getByRole('button', { name: 'Open laptop' }).click()
  const laptop = page.getByRole('button', { name: 'Close laptop' })
  const focus = page.getByRole('button', { name: 'Look at laptop' })
  const charger = page.getByRole('button', { name: 'Plug in charger' })
  const notes = page.getByRole('button', { name: 'Read ' + journalTitle })
  const stand = page.getByRole('button', { name: 'Stand up' })
  const turns = page.getByRole('group', { name: 'Camera controls' })
  const left = turns.getByRole('button', { name: 'Rotate camera left' })
  const right = turns.getByRole('button', { name: 'Rotate camera right' })
  await expect(left.locator('svg')).toBeVisible()
  await expect(right.locator('svg')).toBeVisible()

  for (const action of [laptop, focus, charger, notes])
    await expect(action).toBeVisible()
  await right.click()
  await turnVisitor(page, 'KeyE', 7)

  for (const pixel of [false, true]) {
    if (pixel) {
      await switchView(page, true)
      await left.click()
      await right.click()
    }
    for (const action of [laptop, focus, charger, notes])
      await expect(action).toBeHidden()
    await expect(stand).toBeVisible()
    for (const key of ['KeyF', 'Digit1', 'Digit2', 'KeyT'])
      await page.keyboard.press(key)
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Back to the café' }),
    ).toBeHidden()
  }

  await switchView(page, false)
  await turnVisitor(page, 'KeyQ', 8)
  await switchView(page, true)
  await right.click()
  for (const action of [laptop, focus, charger, notes])
    await expect(action).toBeVisible()
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
  await turnVisitor(page, 'KeyE', 4)
  const fill = page.getByRole('button', { name: 'Fill cup' })
  await walkUntil(page, 'KeyD', () => expect(fill).toBeVisible())
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

  await walkUntil(page, 'KeyD', () =>
    expect(page.locator('#location-text')).toHaveText('Rear aisle'),
  )
  await turnVisitor(page, 'KeyE', 4)
  const pet = page.getByRole('button', { name: 'Pet Leo' })
  await expect(pet).toBeHidden()
  await page.keyboard.press('KeyX')
  const takeLeo = page.getByRole('button', { name: 'Take ' + leoTitle })
  await walkUntil(page, 'KeyD', () => expect(takeLeo).toBeVisible())
  await takeLeo.click()
  await turnVisitor(page, 'KeyE', 4)
  await walkUntil(page, 'KeyW', () => expect(pet).toBeVisible())
  await pet.click()
  await expect(page.locator('#feedback')).toHaveText(
    'Leo leans into your hand.',
  )
  await switchView(page, true)
  await expect(pet).toBeVisible()
  await page.screenshot({
    path: info.outputPath('pixel-carrying-leo-book-and-water.png'),
  })
  await pet.click()
  await page.keyboard.press('KeyR')
  const leo = page.getByRole('dialog', { name: leoTitle, exact: true })
  await leo.getByRole('button', { name: 'Next page' }).click()
  await expect(leo.getByRole('heading', { name: '建模參考' })).toBeVisible()
  const comparison = leo.getByRole('listitem').filter({
    hasText: '後方 · 臀寬與站距',
  })
  const caption = comparison.getByText('後方 · 臀寬與站距', { exact: true })
  const original = comparison.getByRole('img', {
    name: '後方的原圖',
    exact: true,
  })
  const depth = comparison.getByRole('img', {
    name: '後方的深度圖',
    exact: true,
  })
  const desktop = { width: 1280, height: 720 }
  for (const viewport of [desktop, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    await comparison.scrollIntoViewIfNeeded()
    const [originalBox, depthBox, captionBox] = await Promise.all([
      original.boundingBox(),
      depth.boundingBox(),
      caption.boundingBox(),
    ])
    if (!originalBox || !depthBox || !captionBox)
      throw new Error('The comparison images and caption must be visible')
    expect(depthBox.x).toBeGreaterThan(originalBox.x + originalBox.width)
    expect(depthBox.y).toBeCloseTo(originalBox.y)
    expect(captionBox.y).toBeGreaterThan(depthBox.y + depthBox.height)
    await leo.screenshot({
      path: info.outputPath(`leo-comparisons-${viewport.width}.png`),
    })
  }
  await page.setViewportSize(desktop)
  await leo.getByRole('button', { name: 'Close book' }).click()
  await switchView(page, false)
  await page.getByRole('button', { name: 'Read ' + leoTitle }).click()
  await expect(leo.getByText('2 / 2')).toBeVisible()
  await page.keyboard.press('Escape')
  await turnVisitor(page, 'KeyQ', 4)
  const returnLeo = page.getByRole('button', { name: 'Return ' + leoTitle })
  if (!(await returnLeo.isVisible()))
    await walkUntil(page, 'KeyA', () => expect(returnLeo).toBeVisible())
  await switchView(page, true)
  await returnLeo.click()
  await expect(
    page.getByRole('button', { name: 'Read ' + leoTitle }),
  ).toBeHidden()
  await page.getByRole('button', { name: 'Take journal' }).click()
  await page.getByRole('button', { name: 'Read journal' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Trail journal' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Return journal' }).click()
  await takeLeo.click()
  await expect(
    page.getByRole('button', { name: 'Read ' + leoTitle }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Sip water' }).click()
  await expect(page.getByText('Empty cup', { exact: true })).toBeVisible()
})

test('places the cup and Leo book on the window desk and picks them back up', async ({
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
  await turnVisitor(page, 'KeyE', 4)
  await page.getByRole('button', { name: 'Fill cup' }).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Sip water' }).click()
  await turnVisitor(page, 'KeyQ', 4)
  await go('KeyS', 300)
  await go('KeyA', 2400)
  await turnVisitor(page, 'KeyE', 8)
  await page.getByRole('button', { name: 'Take ' + leoTitle }).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Read ' + leoTitle }).click()
  const reader = page.getByRole('dialog', { name: leoTitle, exact: true })
  await reader.getByRole('button', { name: 'Next page' }).click()
  await reader.getByRole('button', { name: 'Close book' }).click()
  await turnVisitor(page, 'KeyQ', 8)
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
  await page.getByRole('button', { name: 'Put down ' + leoTitle }).click()
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
    position: { x: canvas.width * 0.82, y: canvas.height * 0.66 },
  })
  await page.clock.runFor(64)
  await expect(
    page.getByRole('button', { name: 'Pick up ' + leoTitle }),
  ).toBeVisible()
  await view(page).screenshot({ path: info.outputPath('placed-at-window.png') })
  await switchView(page, true)
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Pick up cup' }).click()
  await page.clock.runFor(64)
  await expect(page.getByText('Half-full cup', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pick up ' + leoTitle }).click()
  await page.clock.runFor(64)
  await page.getByRole('button', { name: 'Read ' + leoTitle }).click()
  await expect(reader.getByText('2 / 2')).toBeVisible()
})

test('home fills the viewport and can focus the laptop from both camera modes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 940 })
  await openCafe(page)
  await pauseAmbientFilm(page)
  expect(await view(page).boundingBox()).toMatchObject({
    x: 0,
    y: 0,
    width: 1440,
    height: 940,
  })
  await page.getByRole('button', { name: 'Open laptop' }).click()
  const open = await frameHash(page)
  await view(page).click({ position: { x: 690, y: 484 } })
  await expect(
    page.getByRole('button', { name: 'Back to the café' }),
  ).toBeVisible()
  const shelfIndex = await frameHash(page)
  expect(shelfIndex).not.toBe(open)
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
  await expect(page.getByRole('link', { name: 'Scene study' })).toHaveCount(0)
})
