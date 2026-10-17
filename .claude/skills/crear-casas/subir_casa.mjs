// Sube un archivo de plano (.json) a Supabase Storage y da la dirección para
// abrirlo en la web (…/?url=…) y su QR. Lo usa Claude; la web no sabe nada de
// Supabase: solo carga una casa desde una dirección.
//
//   node .claude/skills/crear-casas/subir_casa.mjs <plano.json> [nombre] [qr.png]
//
// - nombre: el del archivo en el bucket, sin ".json" (por defecto "demo").
//   Con el mismo nombre se sobrescribe y la dirección no cambia.
// - qr.png: dónde dejar el QR (por defecto, junto al plano, <plano>-qr.png).
//
// Lee la dirección del proyecto y la clave secreta de `supabase.local.json`, en
// la raíz del proyecto y fuera de git:
//   { "url": "https://xxxx.supabase.co", "clave": "…", "bucket": "casas" }
// El bucket es público: descargar es libre; subir, solo con la clave secreta.

import { readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'

const WEB = 'https://arlanzon29.github.io/ConfiguradorCasa/'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const [planPath, name = 'demo', qrArg] = process.argv.slice(2)
if (!planPath) {
  console.error('Falta el plano: node subir_casa.mjs <plano.json> [nombre] [qr.png]')
  process.exit(1)
}
if (!/^[A-Za-z0-9_-]+$/.test(name)) {
  console.error('El nombre solo puede llevar letras sin acentos, números, "-" y "_".')
  process.exit(1)
}

let config
try {
  config = JSON.parse(readFileSync(join(root, 'supabase.local.json'), 'utf8'))
} catch {
  console.error('No se puede leer supabase.local.json en la raíz del proyecto.')
  process.exit(1)
}
const base = String(config.url ?? '').replace(/\/+$/, '')
const key = String(config.clave ?? '')
const bucket = String(config.bucket ?? 'casas')
if (!base || !key) {
  console.error('A supabase.local.json le falta "url" o "clave".')
  process.exit(1)
}

const text = readFileSync(planPath, 'utf8')
try {
  JSON.parse(text)
} catch {
  console.error('El plano no es un JSON válido.')
  process.exit(1)
}

const object = `${bucket}/${name}.json`
const headers = {
  apikey: key,
  'content-type': 'application/json',
  // Sobrescribe si ya existe, y que nadie lo guarde en caché: al volver a subir
  // con el mismo nombre, la web tiene que leer la versión nueva.
  'x-upsert': 'true',
  'cache-control': 'max-age=0',
}
// Las claves antiguas (service_role) son un JWT y van también como Bearer.
if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`

const upload = await fetch(`${base}/storage/v1/object/${object}`, { method: 'POST', headers, body: text })
if (!upload.ok) {
  console.error(`Supabase no ha aceptado la subida (${upload.status}): ${await upload.text()}`)
  process.exit(1)
}

// Comprobar que se lee como la leerá la web: sin clave y desde otro origen (CORS).
const publicUrl = `${base}/storage/v1/object/public/${object}`
const check = await fetch(publicUrl, { headers: { origin: 'https://arlanzon29.github.io' } })
const same = check.ok && (await check.text()) === text
const cors = check.headers.get('access-control-allow-origin')

const param = /[?&#]/.test(publicUrl) ? encodeURIComponent(publicUrl) : publicUrl
const webUrl = `${WEB}?url=${param}`
const qrPath = qrArg ?? join(dirname(planPath), `${basename(planPath, '.json')}-qr.png`)
await QRCode.toFile(qrPath, webUrl, { width: 512, margin: 2 })

console.log(
  JSON.stringify(
    {
      subido: `${object} (${Buffer.byteLength(text)} bytes)`,
      archivo: publicUrl,
      web: webUrl,
      qr: qrPath,
      seLeeIgual: same,
      cors: cors ?? 'sin cabecera: la web no podrá leerlo',
    },
    null,
    2,
  ),
)
