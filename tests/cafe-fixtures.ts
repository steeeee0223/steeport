import { type Page, expect } from '@playwright/test'
import { createHash } from 'node:crypto'

export const journalTitle = 'Steeport 開發日誌'
export const journalUrl = '/books/steeport-devlog/'
export const leoTitle = '雷歐'

export const settingsButton = (page: Page) =>
  page.getByRole('button', { name: 'Settings' })
export const pixelButton = (page: Page) => page.locator('#view-switch')
export const view = (page: Page) => page.getByRole('img', { name: /Café view/ })
export const frameHash = async (page: Page, path?: string) =>
  createHash('sha256')
    .update(
      await view(page).screenshot({
        path,
        style:
          '.masthead, .heading, .room-hud, .room-status { visibility: hidden; }',
      }),
    )
    .digest('hex')

export async function openCafe(page: Page) {
  await page.goto('/')
  await expect(settingsButton(page)).toBeVisible()
  await expect(view(page)).toBeVisible()
}

export async function switchView(page: Page, pixel: boolean) {
  await settingsButton(page).click()
  await pixelButton(page).click()
  await expect(pixelButton(page)).toHaveAttribute('aria-pressed', String(pixel))
}

export async function walkUntil(
  page: Page,
  key: string,
  check: () => Promise<void>,
) {
  await page.keyboard.down(key)
  try {
    await check()
  } finally {
    await page.keyboard.up(key)
  }
}

export async function pauseAmbientFilm(page: Page) {
  await page.locator('video').evaluate(async (video) => {
    if (!(video instanceof HTMLVideoElement))
      throw new Error('Expected the café television video')
    await video.play()
    video.pause()
  })
}
