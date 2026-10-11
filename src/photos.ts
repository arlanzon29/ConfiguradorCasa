import { create } from 'zustand'
import type { PlanPhoto } from './model/planFile'
import { CameraPose, LENSES, useHouse } from './store'

// Fotos en calidad guardadas. Pesan demasiado para localStorage (que además
// comparten con el plano), así que van a IndexedDB; aquí está también la lista
// en memoria que usa la interfaz.

/** Desde dónde y cómo se sacó una foto: sirve para volver a colocar la cámara igual. */
export interface Shot {
  pose: CameraPose
  /** Campo de visión vertical, en grados (el objetivo elegido). */
  fov: number
  width: number
  height: number
  /** Si la imagen se guardó con el filtro de ruido: al repetirla sale filtrada de entrada. */
  filtered?: boolean
}

export interface Photo extends Shot {
  id: string
  /** Momento en que se guardó, en milisegundos. */
  takenAt: number
  /** Si se ha repetido, cuándo se sacó la imagen que tiene ahora. El orden lo sigue dando `takenAt`. */
  retakenAt?: number
  image: Blob
}

const DB = 'eurocasa'
const STORE = 'photos'

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Ejecuta `work` sobre el almacén de fotos y espera a que la transacción termine. */
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
) {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = work(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request ? request.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

const byDate = (a: Photo, b: Photo) => a.takenAt - b.takenAt

// Otras ventanas (p. ej. la vista 3D aparte) avisan por aquí de que la lista ha cambiado.
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('eurocasa-photos') : null

interface PhotosState {
  /** Por orden de antigüedad. */
  photos: Photo[]
  /** Foto sobre la que se está: la resaltada en el panel y la que enseña el visor. */
  currentId: string | null
  /** Si el visor a pantalla completa está abierto. */
  viewing: boolean
  /** Foto que se está repitiendo: la vista 3D la traza de nuevo y la sustituye. */
  retakeId: string | null
  /** Mensaje si IndexedDB falla (modo privado, disco lleno…); '' si todo va bien. */
  error: string
  reload: () => Promise<void>
  add: (image: Blob, shot: Shot) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Lleva la cámara a la foto `id` y pide a la vista 3D que la saque otra vez. */
  retake: (id: string) => void
  cancelRetake: () => void
  /** Cambia la imagen de la foto `id` por la recién sacada; conserva su sitio en la lista. */
  replace: (id: string, image: Blob, shot: Shot) => Promise<void>
  /** Sustituye todas las fotos: al cargar un plano o empezar uno nuevo. */
  replaceAll: (photos: Photo[]) => Promise<void>
  /** Pasa a la foto `id` y lleva la cámara a donde se sacó, con su objetivo. */
  goTo: (id: string) => void
  /** Avanza (+1) o retrocede (-1) por las fotos, dando la vuelta al llegar al final. */
  step: (delta: number) => void
  open: (id: string) => void
  close: () => void
}

export const usePhotos = create<PhotosState>()((set, get) => {
  /** Hace un cambio en IndexedDB, relee la lista y avisa a las demás ventanas. */
  const write = async (work: (store: IDBObjectStore) => void) => {
    try {
      await withStore('readwrite', work)
      channel?.postMessage('changed')
    } catch {
      set({ error: 'No se han podido guardar las fotos en este navegador.' })
    }
    await get().reload()
  }

  return {
    photos: [],
    currentId: null,
    viewing: false,
    retakeId: null,
    error: '',

    reload: async () => {
      try {
        const photos = ((await withStore<Photo[]>('readonly', (s) => s.getAll())) ?? []).sort(byDate)
        const { currentId, retakeId } = get()
        const kept = photos.some((p) => p.id === currentId)
        set({
          photos,
          currentId: kept ? currentId : null,
          retakeId: photos.some((p) => p.id === retakeId) ? retakeId : null,
          viewing: kept && get().viewing,
          error: '',
        })
      } catch {
        set({ error: 'No se han podido leer las fotos de este navegador.' })
      }
    },

    add: async (image, shot) => {
      const photo: Photo = { id: crypto.randomUUID(), takenAt: Date.now(), image, ...shot }
      await write((s) => void s.put(photo))
      if (get().photos.some((p) => p.id === photo.id)) set({ currentId: photo.id })
    },

    remove: (id) => write((s) => void s.delete(id)),

    retake: (id) => {
      get().goTo(id)
      if (get().currentId === id) set({ retakeId: id, viewing: false })
    },
    cancelRetake: () => set({ retakeId: null }),

    replace: async (id, image, shot) => {
      const old = get().photos.find((p) => p.id === id)
      set({ retakeId: null })
      // Si la han borrado mientras tanto (otra ventana), se guarda como nueva.
      if (!old) return get().add(image, shot)
      await write((s) => void s.put({ ...old, ...shot, image, retakenAt: Date.now() }))
    },

    replaceAll: (photos) =>
      write((s) => {
        s.clear()
        photos.forEach((p) => s.put(p))
      }),

    goTo: (id) => {
      const photo = get().photos.find((p) => p.id === id)
      if (!photo) return
      // Irse a otra foto a mitad de una repetición la cancela: la cámara ya no está en su sitio.
      set({ currentId: id, retakeId: get().retakeId === id ? id : null })
      const house = useHouse.getState()
      house.flyCamera(photo.pose)
      house.setCameraFov(photo.fov)
    },

    step: (delta) => {
      const { photos, currentId, goTo } = get()
      if (photos.length === 0) return
      const index = photos.findIndex((p) => p.id === currentId)
      // Sin foto actual, "siguiente" empieza por la primera y "anterior" por la última.
      const next = index < 0 ? (delta > 0 ? 0 : photos.length - 1) : index + delta
      goTo(photos[(next + photos.length) % photos.length].id)
    },

    open: (id) => {
      get().goTo(id)
      if (get().currentId === id) set({ viewing: true })
    },
    close: () => set({ viewing: false }),
  }
})

void usePhotos.getState().reload()
channel?.addEventListener('message', () => void usePhotos.getState().reload())

/** Nombre del objetivo con el que se sacó la foto. */
export const lensName = (fov: number) => LENSES.find((l) => l.fov === fov)?.name ?? `${fov}°`

/** Momento en que se sacó la imagen que tiene la foto. */
const shotAt = (photo: Photo) => photo.retakenAt ?? photo.takenAt

export const photoDate = (photo: Photo) =>
  new Date(shotAt(photo)).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

export function downloadPhoto(photo: Photo) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(photo.image)
  const stamp = new Date(shotAt(photo)).toISOString().slice(0, 16).replace(/[:T]/g, '-')
  link.download = `eurocasa-foto-${stamp}.jpg`
  link.click()
  URL.revokeObjectURL(link.href)
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

/** Las fotos tal como van dentro del archivo de plano: la imagen, como texto. */
export const exportPhotos = () =>
  Promise.all(
    usePhotos.getState().photos.map(
      async ({ image, ...rest }): Promise<PlanPhoto> => ({ ...rest, data: await toDataUrl(image) }),
    ),
  )

/** Convierte las fotos de un archivo de plano en fotos guardables. */
export const importPhotos = (photos: PlanPhoto[]) =>
  Promise.all(
    photos.map(
      async ({ data, ...rest }): Promise<Photo> => ({
        ...rest,
        image: await (await fetch(data)).blob(),
      }),
    ),
  )
