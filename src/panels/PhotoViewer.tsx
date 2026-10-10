import { useEffect } from 'react'
import { downloadPhoto, lensName, photoDate, usePhotos } from '../photos'
import { usePhotoUrl } from './PhotosPanel'

/** Visor a pantalla completa de la foto actual, con paso a la anterior y la siguiente. */
export default function PhotoViewer() {
  const photos = usePhotos((s) => s.photos)
  const currentId = usePhotos((s) => s.currentId)
  const viewing = usePhotos((s) => s.viewing)
  const step = usePhotos((s) => s.step)
  const close = usePhotos((s) => s.close)

  const index = photos.findIndex((p) => p.id === currentId)
  const photo = viewing ? photos[index] : undefined
  const url = usePhotoUrl(photo)

  useEffect(() => {
    if (!viewing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, close, step])

  if (!photo) return null
  return (
    <div className="photo-viewer" onClick={close}>
      {/* Los clics en la barra y en la foto no cierran el visor; fuera de ellas, sí. */}
      <div className="photo-viewer-bar" onClick={(e) => e.stopPropagation()}>
        <span>
          Foto {index + 1} de {photos.length} · {photoDate(photo)} · {lensName(photo.fov)}
        </span>
        <button onClick={() => step(-1)}>‹ Anterior</button>
        <button onClick={() => step(1)}>Siguiente ›</button>
        <button onClick={() => downloadPhoto(photo)}>Descargar</button>
        <button onClick={close}>Cerrar (Esc)</button>
      </div>
      {url && <img src={url} alt={`Foto ${index + 1}`} onClick={(e) => e.stopPropagation()} />}
    </div>
  )
}
