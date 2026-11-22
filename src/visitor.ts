import layout from '../scene/layout.json' with { type: 'json' }

export interface Point {
  x: number
  z: number
}

export type Seat = Point & { yaw: number } & (
    | { kind: 'window' | 'communal' | 'bench' }
    | { kind: 'workshop'; station: number }
    | { kind: 'annex'; cell: number }
  )

interface Look {
  yaw: number
  pitch: number
}

export type Visitor =
  | ({ kind: 'seated'; seat?: Seat } & Look)
  | ({ kind: 'walking' } & Point & Look)

export function position(visitor: Visitor): Point {
  return visitor.kind === 'seated' ? (visitor.seat ?? layout.seat) : visitor
}
