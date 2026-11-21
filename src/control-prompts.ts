import {
  Armchair,
  ArrowDownToLine,
  ArrowUpToLine,
  BrickWall,
  Check,
  DoorOpen,
  Eraser,
  Grid2x2,
  Hammer,
  Hand,
  type IconNode,
  Keyboard,
  LampFloor,
  LibraryBig,
  LocateFixed,
  Music,
  PlantPot,
  RotateCcw,
  RotateCw,
  Settings,
  Sofa,
  SquareDashedPlus,
  Table2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
  createIcons,
} from 'lucide'

const Desk: IconNode = [['path', { d: 'M2 8h20M4 8v12m16-12v12M4 12h16' }]]

export function controlPrompts() {
  createIcons({
    icons: {
      ArrowDownToLine,
      ArrowUpToLine,
      Armchair,
      BrickWall,
      Check,
      Desk,
      DoorOpen,
      Eraser,
      Grid2x2,
      Hammer,
      Hand,
      Keyboard,
      LampFloor,
      LibraryBig,
      LocateFixed,
      Music,
      PlantPot,
      RotateCcw,
      RotateCw,
      Settings,
      Sofa,
      SquareDashedPlus,
      Table2,
      Undo2,
      X,
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
    button.addEventListener('click', run)
    const menuKey = button.querySelector<HTMLElement>('.action-key')
    const menuLabel = button.querySelector<HTMLSpanElement>('.action-label')
    if (menuKey && menuLabel) {
      parts.set(button, { keycap: menuKey, label: menuLabel })
      return
    }

    const keycap = document.createElement('kbd')
    keycap.className = 'action-key'
    keycap.setAttribute('aria-hidden', 'true')
    const label = document.createElement('span')
    if (button.childElementCount) label.append(...button.childNodes)
    else label.textContent = button.textContent?.trim() ?? ''
    button.replaceChildren(keycap, label)
    button.classList.add('action-prompt')
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
