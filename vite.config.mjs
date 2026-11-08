import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      name: 'cafe-study-page',
      apply: 'build',
      async writeBundle({ dir }) {
        const output = resolve(dir ?? 'dist')
        const lab = resolve(output, 'lab')
        await mkdir(lab, { recursive: true })
        await copyFile(
          resolve(output, 'index.html'),
          resolve(lab, 'index.html'),
        )
      },
    },
  ],
})
