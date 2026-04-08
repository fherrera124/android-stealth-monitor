import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      input: './frontend/index.html'
    },
    outDir: './nginx/public',
    emptyOutDir: true,
    publicDir: false
  }
})