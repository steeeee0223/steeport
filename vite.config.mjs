import { defineConfig } from 'vite'

import { booksPlugin } from './scripts/books.mjs'

export default defineConfig({
  plugins: [booksPlugin()],
})
