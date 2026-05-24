import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DEFAULT_DEV_HOST = '127.0.0.1'
const DEFAULT_DEV_PORT = 3737

const parsedDevPort = Number.parseInt(process.env.MOLE_DEV_PORT ?? `${DEFAULT_DEV_PORT}`, 10)
const devPort = Number.isNaN(parsedDevPort) ? DEFAULT_DEV_PORT : parsedDevPort
const devHost = process.env.MOLE_DEV_HOST ?? DEFAULT_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/')
          if (!normalized.includes('node_modules')) return
          if (normalized.includes('/react/') || normalized.includes('/react-dom/')) return 'vendor-react'
          if (normalized.includes('/@radix-ui/')) return 'vendor-radix'
          if (normalized.includes('/lucide-react/')) return 'vendor-icons'
          return 'vendor'
        },
      },
    },
  },
  server: {
    host: devHost,
    port: devPort,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
