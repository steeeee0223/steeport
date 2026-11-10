import catalog from 'virtual:books'

import { type Book } from './props'

export const books = catalog

const slots: Book[] = ['notebook', 'shelf', 'journal']
export const screenBooks = slots.filter((slot) => books[slot])

export function isBookSlot(id: string): id is Book {
  return id === 'notebook' || id === 'shelf' || id === 'journal'
}
