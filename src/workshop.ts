import { htmlInCanvas } from './html-in-canvas'
import { workshopDemo } from './workshop-demo'
import { type WorkshopMonitor, workshopMonitorIds } from './workshop-layout'

function element<T extends HTMLElement>(
  id: string,
  kind: abstract new () => T,
): T {
  const node = document.getElementById(id)
  if (!(node instanceof kind)) throw new Error('Missing workshop element ' + id)
  return node
}

export function workshopConsole() {
  const dialog = element('workshop', HTMLDialogElement)
  const heading = element('workshop-heading', HTMLElement)
  const transcript = element('workshop-transcript', HTMLElement)
  const form = element('workshop-form', HTMLFormElement)
  const input = element('workshop-input', HTMLInputElement)
  const terminalWindow = element('workshop-window', HTMLElement)
  const close = element('workshop-close', HTMLButtonElement)
  const tabs = [
    ...terminalWindow.querySelectorAll<HTMLButtonElement>(
      '.terminal-nav button',
    ),
  ]
  const canvas = document.createElement('canvas')
  const projectionViewport = matchMedia(
    '(min-width: 650px) and (pointer: fine)',
  )
  const history: string[] = []
  let historyIndex = 0
  let draft = ''
  const demo = workshopDemo(() => {
    historyIndex = 0
    history.length = 0
  })
  let monitor: WorkshopMonitor = 0
  let opener: HTMLElement | undefined
  let controls:
    | {
        monitor: (monitor: WorkshopMonitor) => void
        paint: (monitor: WorkshopMonitor, canvas: HTMLCanvasElement) => void
        close: () => void
      }
    | undefined
  let renderedRows = ''
  const capture = htmlInCanvas(canvas, terminalWindow, () => {
    if (dialog.open) controls?.paint(monitor, canvas)
  })

  function refresh() {
    const screen = demo.screens()[monitor]
    if (heading.textContent !== screen.title) heading.textContent = screen.title
    const signature = JSON.stringify(screen.rows)
    if (renderedRows === signature) return
    renderedRows = signature
    const lines = document.createDocumentFragment()
    for (const [index, row] of screen.rows.entries()) {
      if (index > 0) lines.append('\n')
      const line = document.createElement('span')
      line.textContent = row.text
      if (row.style) line.dataset.tone = row.style
      lines.append(line)
    }
    transcript.replaceChildren(lines)
    transcript.scrollTop = transcript.scrollHeight
  }

  function setProjected(projected: boolean) {
    if (dialog.classList.contains('projected') === projected) return
    const focused = document.activeElement
    dialog.classList.toggle('projected', projected)
    if (projected) {
      dialog.append(canvas)
      canvas.append(terminalWindow)
    } else {
      dialog.append(terminalWindow)
      canvas.remove()
      dialog.removeAttribute('style')
    }
    if (focused instanceof HTMLElement && terminalWindow.contains(focused))
      focused.focus({ preventScroll: true })
  }

  function positionAt(bounds?: DOMRect) {
    if (!dialog.open || !controls) return
    if (
      !capture ||
      !bounds ||
      bounds.width < 300 ||
      bounds.height < 180 ||
      !projectionViewport.matches
    ) {
      setProjected(false)
      return
    }
    const wasProjected = dialog.classList.contains('projected')
    setProjected(true)
    const { x, y, width, height } = bounds
    dialog.style.left = `${x}px`
    dialog.style.top = `${y}px`
    dialog.style.width = `${width}px`
    dialog.style.height = `${height}px`
    const density = Math.min(devicePixelRatio, 1.65)
    const pixelsWide = Math.ceil(width * density)
    const pixelsHigh = Math.ceil(height * density)
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
      canvas.width = pixelsWide
      canvas.height = pixelsHigh
      capture.requestPaint()
    } else if (!wasProjected) capture.requestPaint()
  }

  function selectMonitor(next: WorkshopMonitor) {
    monitor = next
    form.hidden = next !== 0
    for (const [index, tab] of tabs.entries())
      tab.setAttribute('aria-pressed', String(index === next))
    controls?.monitor(next)
    if (next === 0) input.focus({ preventScroll: true })
    else dialog.focus({ preventScroll: true })
    refresh()
  }

  function swipeMonitor(dx: number, dy: number) {
    if (!(Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy))) return false
    const direction = dx < 0 ? 1 : -1
    const next =
      workshopMonitorIds[
        (monitor + direction + workshopMonitorIds.length) %
          workshopMonitorIds.length
      ]
    if (next !== undefined) selectMonitor(next)
    return true
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const command = input.value.trim()
    if (!command) return
    if (history.at(-1) !== command) history.push(command)
    if (history.length > 30) history.shift()
    historyIndex = history.length
    draft = input.value = ''
    demo.submit(command)
    refresh()
  })

  close.addEventListener('click', () => dialog.close())
  for (const [index, id] of workshopMonitorIds.entries())
    tabs[index]?.addEventListener('click', () => selectMonitor(id))

  dialog.addEventListener('keydown', (event) => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey)
      return
    if (event.key === 'Escape') {
      event.preventDefault()
      if (event.target === input) {
        dialog.focus({ preventScroll: true })
      } else dialog.close()
      return
    }
    if (event.target === input) {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      event.preventDefault()
      if (historyIndex === history.length) draft = input.value
      historyIndex = Math.max(
        0,
        Math.min(
          history.length,
          historyIndex + (event.key === 'ArrowUp' ? -1 : 1),
        ),
      )
      input.value = history[historyIndex] ?? draft
      input.setSelectionRange(input.value.length, input.value.length)
    } else if (
      event.key === 'Enter' &&
      monitor === 0 &&
      !(event.target instanceof HTMLButtonElement)
    ) {
      event.preventDefault()
      input.focus({ preventScroll: true })
    } else if (/^[1-3]$/.test(event.key)) {
      const next = workshopMonitorIds[Number(event.key) - 1]
      if (next !== undefined) {
        event.preventDefault()
        selectMonitor(next)
      }
    }
  })

  let touchStart: { x: number; y: number } | undefined
  dialog.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch')
      touchStart = { x: event.clientX, y: event.clientY }
  })
  dialog.addEventListener('pointerup', (event) => {
    const start = touchStart
    touchStart = undefined
    if (!start || event.pointerType !== 'touch') return
    swipeMonitor(event.clientX - start.x, event.clientY - start.y)
  })
  dialog.addEventListener('pointercancel', () => {
    touchStart = undefined
  })
  dialog.addEventListener('click', (event) => {
    if (controls || event.target !== dialog) return
    const rect = dialog.getBoundingClientRect()
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close()
  })
  dialog.addEventListener('close', () => {
    if (dialog.open) return
    setProjected(false)
    controls?.close()
    controls = undefined
    if (opener?.isConnected && !opener.hidden)
      opener.focus({ preventScroll: true })
    opener = undefined
    refresh()
  })

  return {
    get open() {
      return dialog.open
    },
    show(from: HTMLElement, options?: typeof controls) {
      if (dialog.open) return
      setProjected(false)
      opener = from
      controls = options
      if (options) dialog.show()
      else dialog.showModal()
      selectMonitor(0)
    },
    selectMonitor,
    swipeMonitor,
    positionAt,
    dismiss() {
      if (dialog.open) dialog.close()
    },
  }
}
