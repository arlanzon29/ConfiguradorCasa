import { create } from 'zustand'
import { parsePhotos, parsePlan } from './model/planFile'
import { importPhotos, usePhotos } from './photos'
import { useHouse } from './store'

// Casa de una dirección: con ?url=… la página carga la casa del archivo de plano
// que haya en esa dirección, y "Recargar casa" (o un botón del mando en VR y AR)
// la vuelve a leer. La web no sabe quién sube ese archivo ni dónde (Claude lo
// sube a Supabase, pero podría ser cualquier sitio que deje leerlo desde otra
// web). No se mira sola si ha cambiado: se recarga a mano (lo decidió el usuario).
export const REMOTE_URL = new URLSearchParams(location.search).get('url')

// De qué dirección vino la casa que hay en este navegador: si se abre otra vez
// la misma, se carga sin preguntar, porque lo que se perdería ya era de ella.
const LOADED_KEY = 'eurocasa-url-cargada'

// Las casas de ejemplo, que viajan con la web (public/EjemplosCasa). Sin barra
// inicial: la web puede colgar de una subcarpeta (GitHub Pages). Para añadir
// otra: su archivo en esa carpeta y una línea aquí.
export const EXAMPLE_HOUSES = [
  { name: 'Ejemplo 1', detail: 'Salón, habitación infantil y otra estancia', url: 'EjemplosCasa/ejemplo1.json' },
  { name: 'Ejemplo 2', detail: 'Salón con cocina, dos dormitorios y dos baños', url: 'EjemplosCasa/ejemplo2.json' },
]

// Las direcciones de casas que se han abierto o añadido en este navegador, la
// última arriba ("Cargar URL", pestaña "Mis casas"). No van en el archivo de plano.
const LINKS_KEY = 'configuradorcasa-direcciones'

export interface SavedLink {
  url: string
  /** El nombre de la casa la última vez que se leyó, si tenía. */
  name?: string
  /** Cuándo se abrió o se añadió por última vez (ms). */
  at: number
}

function readLinks(): SavedLink[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '[]')
    return Array.isArray(saved)
      ? saved.filter((l): l is SavedLink => typeof l?.url === 'string' && typeof l?.at === 'number')
      : []
  } catch {
    return []
  }
}

export const useLinks = create<{ links: SavedLink[] }>()(() => ({ links: readLinks() }))

function writeLinks(links: SavedLink[]) {
  useLinks.setState({ links })
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(links))
  } catch {
    // Sin almacenamiento, la lista dura lo que la página.
  }
}

export const isExample = (url: string) => EXAMPLE_HOUSES.some((e) => e.url === url)

/** Apunta una dirección en "Mis casas" (arriba del todo); los ejemplos no. */
export function rememberLink(url: string, name?: string) {
  if (isExample(url)) return
  writeLinks([{ url, name, at: Date.now() }, ...readLinks().filter((l) => l.url !== url)])
}

export function forgetLink(url: string) {
  writeLinks(readLinks().filter((l) => l.url !== url))
}

/** La dirección completa, para enseñarla (los ejemplos se guardan relativos). */
export const absoluteUrl = (url: string) => {
  try {
    return new URL(url, location.href).href
  } catch {
    return url
  }
}

/** Abre la página con la casa de esa dirección (?url=…); la carga `RemoteHouseBar`. */
export function openUrl(url: string) {
  // Sin codificar si no hace falta: así la dirección se lee y se puede guardar en favoritos.
  const param = /[?&#\s]/.test(url) ? encodeURIComponent(url) : url
  location.assign(`${location.pathname}?url=${param}`)
}

/** Lee una dirección y dice si hay un plano (y su nombre) o por qué no se puede usar. */
export async function checkUrl(url: string): Promise<{ name?: string } | { error: string }> {
  let text: string
  try {
    new URL(url, location.href)
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return { error: `La dirección contesta con un error (${response.status}).` }
    text = await response.text()
  } catch {
    return { error: 'No se puede leer esa dirección (o no deja leerla desde otra web).' }
  }
  const plan = parsePlan(text)
  return plan ? { name: plan.houseName } : { error: 'En esa dirección no hay un plano de este configurador.' }
}

export type RemoteResult = 'updated' | 'same' | 'ask' | 'error'

interface RemoteState {
  busy: boolean
  /** Lo que salió de la última carga, para el aviso. */
  message: string
  /** La carga que espera a que se confirme (sustituiría una casa que no vino de aquí). */
  pending: (() => void) | null
  confirm: () => void
  cancel: () => void
}

export const useRemote = create<RemoteState>()((set, get) => ({
  busy: false,
  message: '',
  pending: null,
  confirm: () => {
    get().pending?.()
    set({ pending: null })
  },
  cancel: () => set({ pending: null, message: 'No se ha cargado la casa de la dirección.' }),
}))

/** Si hay algo que se perdería al sustituir la casa (el módulo vacío de partida no cuenta). */
export function hasPlan() {
  const { modules, furniture, shells } = useHouse.getState()
  return (
    modules.length > 0 ||
    furniture.length > 0 ||
    shells.length > 1 ||
    usePhotos.getState().photos.length > 0
  )
}

// El texto de la última casa cargada de la dirección: si no ha cambiado, no se toca nada.
let lastText: string | null = null

/** Lee la casa de la dirección y la pone, si ha cambiado. Devuelve qué ha pasado. */
export async function reloadRemote(): Promise<RemoteResult> {
  if (!REMOTE_URL || useRemote.getState().busy) return 'error'
  const set = (message: string) => useRemote.setState({ busy: false, message })
  useRemote.setState({ busy: true, message: 'Cargando la casa…' })
  let text: string
  try {
    // Sin caché del navegador: tiene que llegar la última versión subida.
    const response = await fetch(REMOTE_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    text = await response.text()
  } catch {
    set('No se ha podido leer la casa de la dirección.')
    return 'error'
  }
  if (text === lastText) {
    set('No hay cambios.')
    return 'same'
  }
  const plan = parsePlan(text)
  if (!plan) {
    set('En la dirección no hay un plano de este configurador.')
    return 'error'
  }
  const photos = await importPhotos(parsePhotos(text))
  const apply = () => {
    useHouse.getState().loadPlan(plan)
    void usePhotos.getState().replaceAll(photos)
    lastText = text
    rememberLink(REMOTE_URL, plan.houseName)
    try {
      localStorage.setItem(LOADED_KEY, REMOTE_URL)
    } catch {
      // Sin almacenamiento solo se vuelve a preguntar la próxima vez.
    }
    set('Casa actualizada.')
  }
  // Solo se pregunta la primera vez y si la casa de aquí no vino de esta misma dirección.
  let fromHere = false
  try {
    fromHere = localStorage.getItem(LOADED_KEY) === REMOTE_URL
  } catch {
    // Sin almacenamiento, como si no viniera de aquí.
  }
  if (lastText === null && !fromHere && hasPlan()) {
    useRemote.setState({ busy: false, message: '', pending: apply })
    return 'ask'
  }
  apply()
  return 'updated'
}
