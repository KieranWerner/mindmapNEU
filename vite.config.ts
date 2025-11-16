import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GANZ WICHTIG: Repo-Name hier eintragen
  base: '/mindmapNEU/',
})
