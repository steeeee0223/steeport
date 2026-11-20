import { expect, test } from '@playwright/test'

import { journalTitle, journalUrl, leoTitle, openCafe } from './cafe-fixtures'

test.use({ reducedMotion: 'reduce' })

test('a shared chapter loads without JavaScript on a narrow screen', async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const page = await context.newPage()
    const baseURL = String(info.project.use.baseURL)
    const response = await page.goto(baseURL + journalUrl + '#03-window-study')
    expect(response?.ok()).toBe(true)
    await expect(
      page.getByRole('heading', { level: 1, name: journalTitle }),
    ).toBeVisible()
    const chapter = page.locator('[id="03-window-study"]')
    await expect(
      chapter.getByRole('heading', { name: '窗外的街有多深' }),
    ).toBeVisible()
    await expect(chapter.getByRole('img')).toBeVisible()
    await page.getByRole('link', { name: 'Books' }).click()
    await expect(
      page.getByRole('link', { name: journalTitle }),
    ).toHaveAttribute('href', journalUrl)
    await expect(page.getByRole('link', { name: 'A small atlas' })).toHaveCount(
      0,
    )
    await page.getByRole('link', { name: leoTitle, exact: true }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: leoTitle, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('img', { name: '後方的原圖', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('img', { name: '後方的深度圖', exact: true }),
    ).toBeVisible()
  } finally {
    await context.close()
  }
})

test('the reader turns a sheet in both directions and restores focus on Escape', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1440, height: 940 })
  await openCafe(page)
  const notes = page.getByRole('button', { name: 'Read ' + journalTitle })
  await notes.click()
  const reader = page.getByRole('dialog', { name: journalTitle })
  await expect
    .poll(async () => (await reader.boundingBox())?.width)
    .toBeCloseTo(1440 * 0.8)
  const sheet = reader.locator('#book-turn')
  const pageText = reader.locator('#book-page')
  const turningText = sheet.locator('#turning-text')
  const first = await pageText.locator('h3').innerText()
  await expect(pageText.getByRole('img')).toBeVisible()
  await reader.screenshot({
    path: info.outputPath('development-journal-desktop.png'),
  })
  await page.keyboard.press('ArrowRight')
  await expect(turningText.locator('h3')).toHaveText(first)
  await sheet.evaluate((element) => {
    const [turn] = element.getAnimations()
    if (!turn) throw new Error('The page has no turn animation')
    turn.pause()
    turn.currentTime = 190
  })
  await reader.screenshot({ path: info.outputPath('turning-page.png') })
  await sheet.evaluate((element) => element.getAnimations()[0]?.finish())
  await expect(sheet).toBeHidden()
  await expect(pageText).toContainText('同一間店，兩種看法')
  await page.keyboard.press('ArrowLeft')
  await expect(turningText.locator('h3')).toHaveText(first)
  await page.keyboard.press('Escape')
  await expect(reader).toBeHidden()
  await expect(notes).toBeFocused()
  await notes.click()
  await expect(pageText.locator('h3')).toHaveText(first)
  await expect(sheet).toBeHidden()
})
