import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The project stays close to Vite's defaults so local development remains
// predictable and easy to maintain.
export default defineConfig({
  plugins: [react()],
})
