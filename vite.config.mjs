import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

import { booksPlugin } from './scripts/books.mjs'

export default defineConfig({
  plugins: [booksPlugin()],
  build: {
    rolldownOptions: {
      input: [
        fileURLToPath(new URL('./index.html', import.meta.url)),
        fileURLToPath(new URL('./models/leo/index.html', import.meta.url)),
        fileURLToPath(
          new URL('./models/cat-archives/index.html', import.meta.url),
        ),
      ],
    },
  },
})
