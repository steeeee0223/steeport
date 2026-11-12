import { expect, test } from '@playwright/test'

import { openCafe, pixelButton, switchView, view } from './cafe-fixtures'

test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 940 } })

test('watches both films and returns to the pixel room with the TV muted', async ({
  page,
}, info) => {
  const start = new Date('2026-01-01T12:00:00Z')
  await page.clock.install({ time: start })
  await page.clock.pauseAt(new Date(start.getTime() + 1000))
  await openCafe(page)
  await page.keyboard.press('KeyC')
  for (const [key, duration] of [
    ['KeyD', 1550],
    ['KeyW', 220],
  ] as const) {
    await page.keyboard.down(key)
    try {
      await page.clock.runFor(duration)
    } finally {
      await page.keyboard.up(key)
    }
  }
  await page.clock.resume()
  const watch = page.getByRole('button', { name: 'Watch film' })
  const video = page.locator('video')
  await expect(watch).toBeVisible()
  await expect(video).toHaveJSProperty('muted', true)
  await switchView(page, true)

  await watch.press('Enter')
  const controls = page.getByRole('group', { name: 'Television controls' })
  await expect(
    controls.getByRole('button', { name: 'Back to the café' }),
  ).toBeFocused()
  await expect(page.locator('#viewport')).not.toHaveClass(/\bpixel\b/)
  await expect(video).toHaveAttribute('src', /\/tokyo-2026\.mp4$/)
  await expect(video).toHaveJSProperty('paused', false)
  await expect(video).toHaveJSProperty('muted', false)

  await view(page).click({ position: { x: 720, y: 470 } })
  await expect(
    controls.getByRole('button', { name: 'Play film' }),
  ).toBeVisible()
  await expect(video).toHaveJSProperty('paused', true)
  await page.keyboard.press('Space')
  await expect(video).toHaveJSProperty('paused', false)
  await page.keyboard.press('KeyN')
  await expect(video).toHaveAttribute('src', /\/film-0523\.mp4$/)
  await expect
    .poll(() =>
      video.evaluate(
        (element) =>
          element instanceof HTMLVideoElement &&
          element.videoHeight > element.videoWidth,
      ),
    )
    .toBe(true)
  await expect(video).toHaveJSProperty('paused', false)
  await page.screenshot({
    path: info.outputPath('television-portrait-film.png'),
  })

  await page.keyboard.press('Escape')
  await expect(controls).toBeHidden()
  await expect(pixelButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(watch).toBeFocused()
  await expect(video).toHaveJSProperty('muted', true)
  await expect(video).toHaveJSProperty('paused', false)
})
