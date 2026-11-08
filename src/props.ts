import layout from '../scene/layout.json' with { type: 'json' }
import { type Visitor, position } from './visitor'

type Book = 'Field notes' | 'A small atlas'
type Page = 0 | 1 | 2
export interface Placement {
  x: number
  y: number
  z: number
}
export type Placeable = 'cup' | 'atlas'
type CarriedOrPlaced = { kind: 'carried' } | { kind: 'placed'; spot: Placement }

const titles: Record<Placeable, string> = { cup: 'cup', atlas: 'atlas' }
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
  shelfBook: { kind: 'shelved' } | (CarriedOrPlaced & { page: Page })
  water:
    | { kind: 'on-bar' }
    | (CarriedOrPlaced & { level: 'full' | 'half' | 'empty' })
  doorOpen: boolean
  pluggedIn: boolean
  cat: 'resting' | 'petted'
  reading: Book | null
}

interface PropContext {
  visitor: Visitor
  props: Props
}

export function initialProps(): Props {
  return {
    laptopOpen: false,
    notebook: 'closed',
    shelfBook: { kind: 'shelved' },
    water: { kind: 'on-bar' },
    doorOpen: false,
    pluggedIn: false,
    cat: 'resting',
    reading: null,
  }
}

export type PropId = keyof typeof layout.props | Placeable
export const propIds: PropId[] = [
  'laptop',
  'notebook',
  'charger',
  'shelf',
  'water',
  'cat',
  'door',
  'cup',
  'atlas',
]

export function placed(props: Props, item: Placeable) {
  const state = item === 'cup' ? props.water : props.shelfBook
  return state.kind === 'placed' ? state.spot : undefined
}

export function canReachSurface(cafe: PropContext, spot: Placement) {
  const { x, z } = position(cafe.visitor)
  const seated = cafe.visitor.kind === 'seated'
  return (
    spot.y <= (seated ? 1.13 : 1.78) &&
    Math.hypot(x - spot.x, z - spot.z) <= (seated ? 1.12 : 1.28)
  )
}

export function inReach(cafe: PropContext, id: PropId) {
  const { visitor } = cafe
  if (id === 'cup' || id === 'atlas') {
    const spot = placed(cafe.props, id)
    return spot !== undefined && canReachSurface(cafe, spot)
  }
  if (id === 'water' && cafe.props.water.kind === 'placed') return false
  if (id === 'shelf' && cafe.props.shelfBook.kind === 'placed') return false
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
      return state.water.kind === 'carried' && state.water.level === 'full'
        ? 'Cup is full'
        : 'Fill cup'
    case 'cat':
      return 'Pet Miso'
    case 'door':
      return state.doorOpen ? 'Close door' : 'Open door'
    case 'cup':
    case 'atlas':
      return 'Pick up ' + titles[id]
  }
}

export function useProp(cafe: PropContext, id: PropId) {
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
      if (state.water.kind === 'carried' && state.water.level === 'full') return
      state.water = { kind: 'carried', level: 'full' }
      return 'You filled the cup.'
    case 'cat':
      state.cat = 'petted'
      return 'Miso leans into your hand.'
    case 'door':
      state.doorOpen = !state.doorOpen
      return state.doorOpen ? 'You opened the door.' : 'You closed the door.'
    case 'cup':
      if (state.water.kind !== 'placed') return
      state.water = { kind: 'carried', level: state.water.level }
      return 'You picked up the cup.'
    case 'atlas':
      if (state.shelfBook.kind !== 'placed') return
      state.shelfBook = { kind: 'carried', page: state.shelfBook.page }
      return 'You picked up the atlas.'
  }
}

export function putDown(cafe: PropContext, item: Placeable, spot: Placement) {
  if (!canReachSurface(cafe, spot)) return
  const { props } = cafe
  if (item === 'cup' && props.water.kind === 'carried') {
    props.water = { kind: 'placed', spot, level: props.water.level }
    return 'You put down the cup.'
  }
  if (item === 'atlas' && props.shelfBook.kind === 'carried') {
    props.shelfBook = { kind: 'placed', spot, page: props.shelfBook.page }
    return 'You put down the atlas.'
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
  const water = state.water
  if (water.kind !== 'carried') return
  if (water.level === 'full') {
    water.level = 'half'
    return 'You took a sip. The cup is half full.'
  }
  if (water.level === 'half') {
    water.level = 'empty'
    return 'You finished the water.'
  }
}
