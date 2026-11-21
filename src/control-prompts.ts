import {
  Armchair,
  BrickWall,
  Check,
  DoorOpen,
  Eraser,
  Grid2x2,
  Hand,
  type IconNode,
  LampFloor,
  LibraryBig,
  LocateFixed,
  PlantPot,
  RotateCcw,
  RotateCw,
  Settings,
  Sofa,
  SquareDashedPlus,
  Table2,
  Undo2,
  ZoomIn,
  ZoomOut,
  createIcons,
} from 'lucide'

const Desk: IconNode = [['path', { d: 'M2 8h20M4 8v12m16-12v12M4 12h16' }]]

export function controlPrompts() {
  createIcons({
    icons: {
      Armchair,
      BrickWall,
      Check,
      Desk,
      DoorOpen,
      Eraser,
      Grid2x2,
      Hand,
      LampFloor,
      LibraryBig,
      LocateFixed,
      PlantPot,
      RotateCcw,
      RotateCw,
      Settings,
      Sofa,
      SquareDashedPlus,
      Table2,
      Undo2,
      ZoomIn,
      ZoomOut,
    },
  })
  const parts = new Map<
    HTMLButtonElement,
    { keycap: HTMLElement; label: HTMLSpanElement }
  >()
  const active = new Map<string, HTMLButtonElement>()

  function add(button: HTMLButtonElement, run: () => void) {
    const keycap = document.createElement('kbd')
    keycap.className = 'action-key'
    keycap.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    if (button.childElementCount) label.append(...button.childNodes)
    else label.textContent = button.textContent?.trim() ?? ''
    button.replaceChildren(keycap, label)
    button.classList.add('action-prompt')
    button.addEventListener('click', run)
    parts.set(button, { keycap, label })
  }

  function show(button: HTMLButtonElement, code?: string, text?: string) {
    const prompt = parts.get(button)
    if (!prompt) return
    const hidden = !code
    if (button.hidden !== hidden) button.hidden = hidden
    if (!code) return
    const key = code.replace(/^(Key|Digit)/, '')
    const keycap = key === 'Escape' ? 'Esc' : key
    if (prompt.keycap.textContent !== keycap) prompt.keycap.textContent = keycap
    if (text !== undefined && prompt.label.textContent !== text)
      prompt.label.textContent = text
    if (button.getAttribute('aria-keyshortcuts') !== key)
      button.setAttribute('aria-keyshortcuts', key)
    active.set(code, button)
  }

  function activate(code: string) {
    const button = active.get(code)
    if (!button || button.hidden || button.disabled) return false
    button.click()
    return true
  }

  return { add, show, activate, reset: () => active.clear() }
}
