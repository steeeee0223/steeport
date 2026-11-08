import layout from '../scene/layout.json' with { type: 'json' }
import { type Cafe } from './cafe'

type Book = 'Field notes' | 'A small atlas'
type Page = 0 | 1 | 2
export const pages = {
  'Field notes': [
    '01. A long table runs through the middle of the room. At this hour the light reaches the first two chairs.',
    '02. Across the road, the shopkeeper has pulled the striped awning down to shade the fruit.',
    '03. The quietest seat is the middle one at the window. Leave it as you found it.',
  ],
  'A small atlas': [
    '01. Follow the water past the warehouses until the pavement gives way to stone.',
    '02. Take the stairs behind the market. From the landing, you can see where the roofs turn red.',
    '03. On the way back, stop at the café. The window catches the last of the afternoon.',
  ],
} satisfies Record<Book, [string, string, string]>

export interface Props {
  laptopOpen: boolean
  notebook: 'closed' | Page
  shelfBook: { kind: 'shelved' } | { kind: 'carried'; page: Page }
  water: 'on-bar' | 'full' | 'half' | 'empty'
  pluggedIn: boolean
  cat: 'resting' | 'petted'
  reading: Book | null
}

export function initialProps(): Props {
  return {
    laptopOpen: false,
    notebook: 'closed',
    shelfBook: { kind: 'shelved' },
    water: 'on-bar',
    pluggedIn: false,
    cat: 'resting',
    reading: null,
  }
}

export type PropId = keyof typeof layout.props
export const propIds: PropId[] = [
  'laptop',
  'notebook',
  'charger',
  'shelf',
  'water',
  'cat',
]

export function inReach(cafe: Cafe, id: PropId) {
  const { visitor } = cafe
  const prop = layout.props[id]
  if (visitor.kind === 'seated') return prop.zone === 'window'
  const { x, z } = prop.approach
  return Math.hypot(visitor.x - x, visitor.z - z) <= prop.reach
}

export function label(state: Props, id: PropId) {
  switch (id) {
    case 'laptop':
      return state.laptopOpen ? 'Close laptop' : 'Open laptop'
    case 'notebook':
      return 'Read field notes'
    case 'charger':
      return state.pluggedIn ? 'Unplug charger' : 'Plug in charger'
    case 'shelf':
      return state.shelfBook.kind === 'carried' ? 'Return atlas' : 'Take atlas'
    case 'water':
      return state.water === 'full' ? 'Cup is full' : 'Fill cup'
    case 'cat':
      return 'Pet Miso'
  }
}

export function useProp(cafe: Cafe, id: PropId) {
  if (!inReach(cafe, id)) return
  const state = cafe.props
  switch (id) {
    case 'laptop':
      state.laptopOpen = !state.laptopOpen
      return state.laptopOpen ? 'The laptop is open.' : 'The laptop is closed.'
    case 'notebook':
      if (state.notebook === 'closed') state.notebook = 0
      state.reading = 'Field notes'
      return
    case 'charger':
      state.pluggedIn = !state.pluggedIn
      return state.pluggedIn
        ? 'The laptop is charging.'
        : 'The charger is unplugged.'
    case 'shelf':
      if (state.shelfBook.kind === 'shelved') {
        state.shelfBook = { kind: 'carried', page: 0 }
        return 'You took A small atlas.'
      }
      state.shelfBook = { kind: 'shelved' }
      return 'You put the atlas back.'
    case 'water':
      if (state.water === 'full') return
      state.water = 'full'
      return 'You filled the cup.'
    case 'cat':
      state.cat = 'petted'
      return 'Miso leans into your hand.'
  }
}

export function bookPage(state: Props): Page {
  if (state.reading === 'Field notes' && state.notebook !== 'closed')
    return state.notebook
  if (state.reading === 'A small atlas' && state.shelfBook.kind === 'carried')
    return state.shelfBook.page
  return 0
}

export function turnPage(state: Props, direction: -1 | 1) {
  const next = bookPage(state) + direction
  if (next !== 0 && next !== 1 && next !== 2) return
  if (state.reading === 'Field notes') state.notebook = next
  if (state.reading === 'A small atlas' && state.shelfBook.kind === 'carried')
    state.shelfBook.page = next
}

export function sip(state: Props) {
  if (state.water === 'full') {
    state.water = 'half'
    return 'You took a sip. The cup is half full.'
  }
  if (state.water === 'half') {
    state.water = 'empty'
    return 'You finished the water.'
  }
}
