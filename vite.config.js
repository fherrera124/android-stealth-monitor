import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: './server/frontend/index.html'
    },
    outDir: './public',
    emptyOutDir: true
  }
})