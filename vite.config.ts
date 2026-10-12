import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la web publicada en GitHub Pages cuelga de /ConfiguradorCasa/.
  base: './',
})
