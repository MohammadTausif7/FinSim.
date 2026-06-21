import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The project is deliberately close to Vite's defaults. Fewer custom build rules
// make the first increment easier for all four team members to run and maintain.
export default defineConfig({
  plugins: [react()],
})
