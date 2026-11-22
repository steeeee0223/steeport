import { type Page, expect, test } from '@playwright/test'

import { frameHash, openCafe, pauseAmbientFilm, view } from './cafe-fixtures'

test.use({ reducedMotion: 'reduce' })

async function step(page: Page, key: string, duration: number) {
  await page.keyboard.down(key)
  await page.clock.runFor(duration)
  await page.keyboard.up(key)
}

async function expectClearMonitor(page: Page, checkDesk = false) {
  const canvas = await view(page).screenshot({
    scale: 'css',
    style: '#workshop { opacity: 0 !important; }',
  })
  const { monitor, deskRed } = await page.evaluate(async (png) => {
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(png), (byte) => byte.charCodeAt(0))], {
        type: 'image/png',
      }),
    )
    const canvas = new OffscreenCanvas(image.width, image.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not sample the rendered monitor')
    context.drawImage(image, 0, 0)
    image.close()
    const pixel = (x: number, y: number) =>
      Array.from(
        context.getImageData(canvas.width * x, canvas.height * y, 1, 1).data,
      )
    // Sample the terminal's charcoal background away from its text and chrome.
    const monitor = [0.49, 0.53, 0.56].flatMap((y) =>
      [0.33, 0.5, 0.67].map((x) => pixel(x, y)),
    )
    return { monitor, deskRed: pixel(0.59, 0.707)[0] ?? 0 }
  }, canvas.toString('base64'))
  expect(monitor).toEqual(Array.from({ length: 9 }, () => [24, 24, 30, 255]))
  if (checkDesk)
    expect(deskRed, 'the chair must not obscure the desk').toBeGreaterThan(180)
}

async function walkToStudioEntry(page: Page) {
  await page.setViewportSize({ width: 1440, height: 940 })
  await page.clock.install()
  await openCafe(page)
  await pauseAmbientFilm(page)
  const location = page.locator('#location-text')
  const openDoor = page.getByRole('button', { name: 'Open door' })

  await page.keyboard.press('KeyC')
  await step(page, 'KeyD', 1700)
  await step(page, 'KeyW', 455)
  await step(page, 'KeyD', 800)
  await expect(location).toHaveText('By the entrance')
  await step(page, 'KeyW', 440)
  await expect(location).toHaveText('By the entrance')
  await openDoor.click()
  await step(page, 'KeyW', 470)
  await expect(location).toHaveText('Street')

  await step(page, 'KeyA', 5860)
  for (let turn = 0; turn < 8; turn++) await page.keyboard.press('KeyQ')
  await step(page, 'KeyS', 550)
  await page.clock.runFor(48)
  return location
}

async function walkToWorkshop(page: Page, streetCapture?: string) {
  const location = await walkToStudioEntry(page)
  if (streetCapture) await page.screenshot({ path: streetCapture })
  await step(page, 'KeyW', 600)
  const entry = page.getByRole('button', { name: 'Enter door code' })
  await expect(entry).toBeVisible()
  await entry.click()
  const keypad = page.getByRole('dialog', { name: 'Studio access' })
  await keypad.getByLabel('Four-digit code').fill('0842')
  await keypad.getByRole('button', { name: 'Unlock' }).click()
  await expect(keypad).toBeHidden()
  await page.clock.runFor(48)
  await step(page, 'KeyW', 1310)
  await expect(location).toHaveText('Hacker studio')
  await step(page, 'KeyD', 530)
  await step(page, 'KeyW', 500)
  const workstation = page.getByRole('button', { name: 'Use workstation' })
  await expect(workstation).toBeVisible()
  return { location, workstation }
}

test('keeps the studio locked until the correct code and rolls a seated chair', async ({
  page,
}, info) => {
  const location = await walkToStudioEntry(page)
  await step(page, 'KeyW', 1300)
  await expect(location).toHaveText('Street')
  await step(page, 'KeyS', 265)
  await page.keyboard.press('KeyF')
  const keypad = page.getByRole('dialog', { name: 'Studio access' })
  const code = keypad.getByLabel('Four-digit code')
  await expect(code).toBeFocused()
  await page.screenshot({ path: info.outputPath('studio-keypad.png') })
  await code.fill('1111')
  await code.press('Enter')
  await expect(keypad.getByRole('status')).toHaveText(
    'Access denied. Try again.',
  )
  await page.keyboard.press('Escape')
  await step(page, 'KeyW', 440)
  await expect(location).toHaveText('Street')
  await step(page, 'KeyS', 265)
  await page.getByRole('button', { name: 'Enter door code' }).click()
  for (const digit of ['0', '8', '4', '2'])
    await keypad.getByRole('button', { name: digit, exact: true }).click()
  await keypad.getByRole('button', { name: 'Unlock' }).click()
  await expect(keypad).toBeHidden()
  await page.clock.runFor(80)
  await page.screenshot({ path: info.outputPath('studio-door-open.png') })
  await step(page, 'KeyW', 1380)
  await expect(location).toHaveText('Hacker studio')
  await step(page, 'KeyD', 530)
  await step(page, 'KeyW', 500)

  await page.keyboard.press('KeyC')
  const stand = page.getByRole('button', { name: 'Stand up' })
  await expect(stand).toBeVisible()
  const seated = await frameHash(page, info.outputPath('studio-seated.png'))
  await step(page, 'ArrowLeft', 400)
  const left = await frameHash(page)
  expect(left).not.toEqual(seated)
  await step(page, 'KeyD', 550)
  expect(await frameHash(page)).not.toEqual(left)
  const beforeBack = await frameHash(page)
  await step(page, 'KeyS', 475)
  const back = await frameHash(page)
  expect(back).not.toEqual(beforeBack)
  await step(page, 'ArrowUp', 500)
  expect(await frameHash(page)).not.toEqual(back)
  await expect(stand).toBeVisible()
  await expect(location).toHaveText('Hacker studio')

  await page.keyboard.press('KeyC')
  await step(page, 'KeyA', 710)
  await step(page, 'KeyS', 935)
  const exit = page.getByRole('button', { name: 'Open studio door' })
  await expect(exit).toBeVisible()
  await exit.click()
  await step(page, 'KeyS', 1830)
  await expect(location).toHaveText('Street')
  await step(page, 'KeyW', 1050)
  await expect(location).toHaveText('Street')
  await expect(
    page.getByRole('button', { name: 'Enter door code' }),
  ).toBeVisible()
})

test('opens and closes the repair bench safe from the aisle', async ({
  page,
}, info) => {
  await walkToWorkshop(page)
  await step(page, 'KeyS', 445)
  for (let turn = 0; turn < 4; turn++) await page.keyboard.press('KeyE')
  await page.mouse.move(750, 440)
  await page.mouse.down()
  await page.mouse.move(750, 566, { steps: 4 })
  await page.mouse.up()
  await page.clock.runFor(64)

  const open = page.getByRole('button', { name: 'Open safe', exact: true })
  const close = page.getByRole('button', { name: 'Close safe', exact: true })
  await expect(open).toBeVisible()
  const closed = await frameHash(page, info.outputPath('safe-closed.png'))
  await page.keyboard.press('KeyF')
  await expect(close).toBeVisible()
  await page.clock.runFor(80)
  const opened = await frameHash(page, info.outputPath('safe-open.png'))
  expect(opened).not.toEqual(closed)
  await close.click()
  await expect(open).toBeVisible()
  await page.clock.runFor(80)
  expect(await frameHash(page)).not.toEqual(opened)
})

test('walks from the café to the studio and compares a request before and after the patch', async ({
  page,
}, info) => {
  const { location, workstation } = await walkToWorkshop(
    page,
    info.outputPath('street-entrance.png'),
  )
  await page.screenshot({ path: info.outputPath('workstation-idle.png') })
  const terminal = page.getByRole('dialog', { name: '駭客工作室終端機' })
  await view(page).click({ position: { x: 830, y: 596 } })
  await expect(terminal).toBeVisible()
  await terminal.getByRole('button', { name: '關閉終端機' }).click()
  await expect(workstation).toBeFocused()
  await page.keyboard.press('KeyF')
  await page.clock.runFor(48)

  const transcript = terminal.locator('pre')
  const input = terminal.getByRole('textbox', { name: '輸入演示指令' })
  await expect(terminal).toHaveClass(/projected/)
  await expect(terminal.locator('canvas[content="drawable"]')).toHaveCount(1)
  await expect(transcript).toContainText('CVE 選單')
  await expect(transcript).toContainText('[1] CVE-2026-21589')
  await expect(input).toBeFocused()
  await input.click()
  await page.screenshot({ path: info.outputPath('terminal-menu.png') })
  const menuFrame = await frameHash(page)
  await page.keyboard.type('use 1')
  await page.clock.runFor(48)
  expect(await frameHash(page)).not.toEqual(menuFrame)
  await page.keyboard.press('Enter')
  await expect(transcript).toContainText('lab request --target')

  await page.keyboard.press('2')
  await expect(input).toHaveValue('2')
  await input.fill('')
  await terminal.getByRole('button', { name: /目標電腦/ }).click()
  await expect(transcript).toContainText('DOCS-01')
  await page.clock.runFor(48)
  await page.screenshot({ path: info.outputPath('target-monitor.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(terminal).toHaveCSS('opacity', '1')
  await expect(terminal).toBeInViewport({ ratio: 1 })
  await expect(transcript).toContainText('DOCS-01')
  await page.clock.runFor(48)
  await expectClearMonitor(page)
  await page.screenshot({ path: info.outputPath('target-monitor-narrow.png') })
  await terminal.getByRole('button', { name: /事件記錄/ }).click()
  await expect(transcript).toContainText('等待請求')
  await terminal.getByRole('button', { name: /目標電腦/ }).click()
  await expect(transcript).toContainText('DOCS-01')
  // At this width the camera is behind the chair, in line with the desk.
  await page.setViewportSize({ width: 480, height: 844 })
  await page.clock.runFor(48)
  await expectClearMonitor(page, true)
  await page.setViewportSize({ width: 1440, height: 940 })
  await expect(terminal).toHaveCSS('opacity', '0')
  await expect(transcript).toContainText('DOCS-01')
  await page.clock.runFor(48)
  await expectClearMonitor(page)

  await page.keyboard.press('1')
  async function command(value: string) {
    await input.fill(value)
    await page.keyboard.press('Enter')
  }
  await command('lab request --target UNKNOWN --payload INTERNAL')
  await expect(transcript).toContainText('找不到這台主機')
  await command('lab request --target DOCS-01 --payload PUBLIC')
  await expect(transcript).toContainText('營業時間')
  const request = 'lab request --target DOCS-01 --payload INTERNAL'
  await command(request)
  await expect(transcript).toContainText('測試環境備忘錄')
  await page.clock.runFor(48)
  await page.screenshot({ path: info.outputPath('terminal-response.png') })
  await page.keyboard.press('ArrowUp')
  await expect(input).toHaveValue(request)
  await input.fill('')

  await page.keyboard.press('Escape')
  await page.keyboard.press('3')
  await expect(transcript).toContainText(
    '訪客讀到了原本僅供員工查看的內部文件。',
  )
  await page.clock.runFor(48)
  await page.screenshot({ path: info.outputPath('portrait-monitor.png') })
  await page.keyboard.press('1')
  await command('patch')
  await command('retry')
  await expect(transcript).toContainText('拒絕存取')
  await command('reset')
  await expect(transcript).toContainText('演示已重設')
  await page.keyboard.press('ArrowUp')
  await expect(input).toHaveValue('')

  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(terminal).toBeHidden()
  await expect(workstation).toBeFocused()
  await expect(location).toHaveText('Hacker studio')
})

test('uses the visible HTML terminal when native canvas painting is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(
      CanvasRenderingContext2D.prototype,
      'drawElementImage',
      { value: undefined },
    )
  })
  const { workstation } = await walkToWorkshop(page)
  await workstation.click()
  const terminal = page.getByRole('dialog', { name: '駭客工作室終端機' })
  const input = terminal.getByRole('textbox', { name: '輸入演示指令' })
  await expect(terminal).toBeVisible()
  await expect(terminal.locator('canvas')).toHaveCount(0)
  await input.fill('use 1')
  await input.press('Enter')
  await expect(terminal.locator('pre')).toContainText('lab request --target')
  await terminal.getByRole('button', { name: '關閉終端機' }).click()
  await expect(terminal).toBeHidden()
  await expect(workstation).toBeFocused()
})

test('opens the text terminal and swipes to the target on a touch viewport when 3D fails', async ({
  browser,
}) => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  try {
    await page.route('**/cafe.glbz', (route) => route.abort())
    await page.goto('/')
    await page.getByRole('button', { name: 'Open hacker studio demo' }).tap()
    const terminal = page.getByRole('dialog', { name: '駭客工作室終端機' })
    const input = terminal.getByRole('textbox')
    const transcript = terminal.locator('pre')
    await input.fill('use 1')
    await input.press('Enter')
    await expect(transcript).toContainText('lab request --target')
    const bounds = await terminal.boundingBox()
    if (!bounds) throw new Error('Fallback terminal is offscreen')
    const client = await page.context().newCDPSession(page)
    const x = bounds.x + 260
    const y = bounds.y + 55
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    })
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - 120, y }],
    })
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect(transcript).toContainText('DOCS-01')
    await client.detach()
    await page.keyboard.press('1')
    await input.fill('lab request --target DOCS-01 --payload PUBLIC')
    await input.press('Enter')
    await expect(transcript).toContainText('營業時間')
  } finally {
    await page.close()
  }
})
