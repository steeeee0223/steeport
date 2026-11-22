import layout from '../scene/layout.json' with { type: 'json' }
import { type Visitor, position } from './visitor'

type ShelfSlot = 'shelf' | 'journal'
export type Book = 'notebook' | ShelfSlot

export interface Placement {
  x: number
  y: number
  z: number
}
export type Placeable = 'cup' | 'atlas'
type CarriedOrPlaced = { kind: 'carried' } | { kind: 'placed'; spot: Placement }

export interface Props {
  laptopOpen: boolean
  notebook: 'closed' | number
  shelfBook:
    { kind: 'shelved' } | (CarriedOrPlaced & { book: ShelfSlot; page: number })
  water:
    | { kind: 'on-bar' }
    | (CarriedOrPlaced & { level: 'full' | 'half' | 'empty' })
  doorOpen: boolean
  lampOn: boolean
  pluggedIn: boolean
  reading: Book | null
}

interface PropContext {
  visitor: Visitor
  crouched?: boolean
  leo: Placement
  props: Props
}

export function initialProps(): Props {
  return {
    laptopOpen: false,
    notebook: 'closed',
    shelfBook: { kind: 'shelved' },
    water: { kind: 'on-bar' },
    doorOpen: false,
    lampOn: true,
    pluggedIn: false,
    reading: null,
  }
}

export type PropId = keyof typeof layout.props | Placeable
export const propIds: PropId[] = [
  'laptop',
  'television',
  'notebook',
  'charger',
  'shelf',
  'journal',
  'water',
  'cat',
  'door',
  'lamp',
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

export function petHand(props: Props): -1 | 1 | undefined {
  if (props.water.kind !== 'carried') return 1
  if (props.shelfBook.kind === 'carried' || props.reading === 'notebook')
    return undefined
  return -1
}

export function inReach(cafe: PropContext, id: PropId) {
  const { visitor } = cafe
  if (id === 'cup' || id === 'atlas') {
    const spot = placed(cafe.props, id)
    return spot !== undefined && canReachSurface(cafe, spot)
  }
  if (id === 'cat') {
    const reach = 0.64 + Math.min(cafe.leo.y, 0.13) * 0.38
    return (
      Boolean(cafe.crouched) &&
      visitor.kind === 'walking' &&
      Math.hypot(visitor.x - cafe.leo.x, visitor.z - cafe.leo.z) < reach
    )
  }
  if (id === 'water' && cafe.props.water.kind === 'placed') return false
  if (id === 'shelf' || id === 'journal') {
    const held = cafe.props.shelfBook
    if (held.kind === 'placed' || (held.kind === 'carried' && held.book !== id))
      return false
  }
  const prop = layout.props[id]
  if (visitor.kind === 'seated') {
    const { x, z } = position(visitor)
    return prop.zone === 'window' && Math.hypot(x - prop.x, z - prop.z) <= 1.12
  }
  if (id === 'door' && visitor.z < prop.z)
    return Math.hypot(visitor.x - prop.x, visitor.z - prop.z) <= prop.reach
  const { x, z } = prop.approach
  return Math.hypot(visitor.x - x, visitor.z - z) <= prop.reach
}

export function label(state: Props, id: PropId, bookName: string) {
  switch (id) {
    case 'laptop':
      return state.laptopOpen ? 'Close laptop' : 'Open laptop'
    case 'television':
      return 'Watch film'
    case 'notebook':
      return 'Read ' + bookName
    case 'charger':
      return state.pluggedIn ? 'Unplug charger' : 'Plug in charger'
    case 'shelf':
    case 'journal':
      return (
        (state.shelfBook.kind === 'carried' ? 'Return ' : 'Take ') + bookName
      )
    case 'water':
      return state.water.kind === 'carried' && state.water.level === 'full'
        ? 'Cup is full'
        : 'Fill cup'
    case 'cat':
      return 'Pet Leo'
    case 'door':
      return doorLabel(state.doorOpen)
    case 'lamp':
      return lampLabel(state.lampOn)
    case 'cup':
      return 'Pick up cup'
    case 'atlas':
      return 'Pick up ' + bookName
  }
}

export function useProp(cafe: PropContext, id: Exclude<PropId, 'television'>) {
  if (!inReach(cafe, id)) return
  const state = cafe.props
  switch (id) {
    case 'laptop':
      state.laptopOpen = !state.laptopOpen
      return state.laptopOpen ? 'The laptop is open.' : 'The laptop is closed.'
    case 'notebook':
      if (state.notebook === 'closed') state.notebook = 0
      state.reading = 'notebook'
      return
    case 'charger':
      state.pluggedIn = !state.pluggedIn
      return state.pluggedIn
        ? 'The laptop is charging.'
        : 'The charger is unplugged.'
    case 'shelf':
    case 'journal':
      if (state.shelfBook.kind === 'shelved') {
        const book = id
        state.shelfBook = { kind: 'carried', book, page: 0 }
        return 'You took the book.'
      }
      state.shelfBook = { kind: 'shelved' }
      return 'You returned the book.'
    case 'water':
      if (state.water.kind === 'carried' && state.water.level === 'full') return
      state.water = { kind: 'carried', level: 'full' }
      return 'You filled the cup.'
    case 'cat':
      return 'Leo leans into your hand.'
    case 'door':
      if (
        state.doorOpen &&
        Math.abs(position(cafe.visitor).z - layout.props.door.z) <= 0.18
      )
        return 'Step clear of the doorway first.'
      state.doorOpen = !state.doorOpen
      return doorMessage(state.doorOpen)
    case 'lamp':
      state.lampOn = !state.lampOn
      return lampMessage(state.lampOn)
    case 'cup':
      if (state.water.kind !== 'placed') return
      state.water = { kind: 'carried', level: state.water.level }
      return 'You picked up the cup.'
    case 'atlas':
      if (state.shelfBook.kind !== 'placed') return
      state.shelfBook = { ...state.shelfBook, kind: 'carried' }
      return 'You picked up the book.'
  }
}

export function doorLabel(open: boolean) {
  return open ? 'Close door' : 'Open door'
}

export function doorMessage(open: boolean) {
  return open ? 'You opened the door.' : 'You closed the door.'
}

export function lampLabel(on: boolean) {
  return on ? 'Turn off floor lamp' : 'Turn on floor lamp'
}

export function lampMessage(on: boolean) {
  return on ? 'You turned on the floor lamp.' : 'You turned off the floor lamp.'
}

export function putDown(cafe: PropContext, item: Placeable, spot: Placement) {
  if (!canReachSurface(cafe, spot)) return
  const { props } = cafe
  if (item === 'cup' && props.water.kind === 'carried') {
    props.water = { kind: 'placed', spot, level: props.water.level }
    return 'You put down the cup.'
  }
  if (item === 'atlas' && props.shelfBook.kind === 'carried') {
    props.shelfBook = { ...props.shelfBook, kind: 'placed', spot }
    return 'You put down the book.'
  }
}

export function bookPage(state: Props) {
  if (state.reading === 'notebook' && state.notebook !== 'closed')
    return state.notebook
  if (
    state.shelfBook.kind === 'carried' &&
    state.reading === state.shelfBook.book
  )
    return state.shelfBook.page
  return 0
}

export function turnPage(state: Props, direction: -1 | 1, pageCount: number) {
  const book = state.reading
  if (!book) return
  const next = bookPage(state) + direction
  if (next < 0 || next >= pageCount) return
  if (book === 'notebook') state.notebook = next
  if (state.shelfBook.kind === 'carried' && book === state.shelfBook.book)
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
