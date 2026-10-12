import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Versión visible en la web: número del paquete, commit y hora de compilación.
// Sirve para saber, sobre todo en las Quest, qué compilación se está ejecutando
// (el navegador de las gafas guarda en caché y no siempre recarga).
function appVersion() {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  let commit = process.env.GITHUB_SHA?.slice(0, 7)
  if (!commit) {
    try {
      // `safe.directory`: en el disco D: git no reconoce al dueño de la carpeta.
      commit = execSync(`git -c safe.directory="${process.cwd()}" rev-parse --short HEAD`, {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim()
    } catch {
      commit = 'sin-git'
    }
  }
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return `v${pkg.version} · ${commit} · ${when} UTC`
}

export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la web publicada en GitHub Pages cuelga de /ConfiguradorCasa/.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
})
