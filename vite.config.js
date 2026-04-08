import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: './server/frontend',
  build: {
    outDir: '../public',
    emptyOutDir: true
  }
})