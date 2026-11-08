import { chromium, devices } from '@playwright/test'

const url = process.argv[2] ?? 'http://127.0.0.1:4173/'
const browser = await chromium.launch({ channel: 'chrome' })
const samples = Number(process.env.CAFE_RUNS ?? 3)
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
const round = (value) => Math.round(value * 10) / 10

try {
  console.log(browser.version(), url)
  for (const [name, settings] of [
    ['desktop', { viewport: { width: 1440, height: 940 } }],
    ['phone emulation', devices['iPhone 13']],
  ]) {
    const runs = []
    for (let i = 0; i < samples; i++) {
      const context = await browser.newContext({
        ...settings,
        reducedMotion: 'no-preference',
      })
      try {
        const page = await context.newPage()
        await page.goto(url, { waitUntil: 'commit' })
        await page.locator('#view-switch:enabled').waitFor()
        const ready = await page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => {
                requestAnimationFrame((time) => resolve(time))
              })
            }),
        )
        await page.locator('#seat').click()
        const modes = []
        for (const key of ['KeyD', 'KeyA']) {
          await page.keyboard.down(key)
          const intervals = await page.evaluate(
            () =>
              new Promise((resolve) => {
                const values = []
                function sample(time) {
                  values.push(time)
                  if (time - values[0] < 1100) requestAnimationFrame(sample)
                  else
                    resolve(
                      values.slice(1).map((value, i) => value - values[i]),
                    )
                }
                requestAnimationFrame(sample)
              }),
          )
          await page.keyboard.up(key)
          const switchTime = await page.locator('#view-switch').evaluate(
            (button) =>
              new Promise((resolve) => {
                const start = performance.now()
                button.click()
                requestAnimationFrame(() => {
                  requestAnimationFrame(() =>
                    resolve(performance.now() - start),
                  )
                })
              }),
          )
          modes.push({
            p50: round(percentile(intervals, 0.5)),
            p95: round(percentile(intervals, 0.95)),
            switch: round(switchTime),
          })
        }
        const glbBytes = await page.evaluate(() =>
          performance
            .getEntriesByType('resource')
            .filter(({ name }) => name.endsWith('.glb'))
            .reduce((bytes, asset) => bytes + asset.encodedBodySize, 0),
        )
        runs.push({
          ready: round(ready),
          firstPerson: modes[0],
          pixel: modes[1],
          glbBytes,
        })
      } finally {
        await context.close()
      }
    }
    console.log(name, JSON.stringify(runs))
  }
} finally {
  await browser.close()
}
