import layout from '../scene/layout.json' with { type: 'json' }

export interface Point {
  x: number
  z: number
}

interface Look {
  yaw: number
  pitch: number
}

export type Visitor =
  ({ kind: 'seated' } & Look) | ({ kind: 'walking' } & Point & Look)

export function position(visitor: Visitor): Point {
  return visitor.kind === 'seated' ? layout.seat : visitor
}
