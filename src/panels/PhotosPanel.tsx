import { useEffect, useState } from 'react'
import { Photo, downloadPhoto, lensName, photoDate, usePhotos } from '../photos'

/** Dirección temporal para pintar la imagen de una foto; se libera al dejar de usarla. */
export function usePhotoUrl(photo: Photo | undefined) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!photo) return setUrl('')
    const created = URL.createObjectURL(photo.image)
    setUrl(created)
    return () => URL.revokeObjectURL(created)
  }, [photo])
  return url
}

function Thumb({ photo, index, current }: { photo: Photo; index: number; current: boolean }) {
  const open = usePhotos((s) => s.open)
  const url = usePhotoUrl(photo)
  return (
    <button
      className={current ? 'photo-thumb active' : 'photo-thumb'}
      title={`Foto ${index + 1} · ${photoDate(photo)} · ${lensName(photo.fov)}`}
      onClick={() => open(photo.id)}
    >
      {url && <img src={url} alt={`Foto ${index + 1}`} />}
    </button>
  )
}

export default function PhotosPanel() {
  const photos = usePhotos((s) => s.photos)
  const currentId = usePhotos((s) => s.currentId)
  const error = usePhotos((s) => s.error)
  const step = usePhotos((s) => s.step)
  const open = usePhotos((s) => s.open)
  const remove = usePhotos((s) => s.remove)
  // Borrar una foto no tiene vuelta atrás: se confirma en la propia página.
  const [confirming, setConfirming] = useState(false)
  useEffect(() => setConfirming(false), [currentId])

  const index = photos.findIndex((p) => p.id === currentId)
  const current = photos[index]

  return (
    <>
      <section>
        <h2>Fotos ({photos.length})</h2>
        {error && <p className="notice">{error}</p>}
        {photos.length === 0 ? (
          <p className="muted">
            Aún no hay fotos. En la vista 3D pulsa «Foto en calidad» y, cuando te guste,
            «Guardar foto».
          </p>
        ) : (
          <>
            <div className="photo-nav">
              <button onClick={() => step(-1)}>‹ Anterior</button>
              <span>{current ? `${index + 1} / ${photos.length}` : `– / ${photos.length}`}</span>
              <button onClick={() => step(1)}>Siguiente ›</button>
            </div>
            <div className="photo-grid">
              {photos.map((p, i) => (
                <Thumb key={p.id} photo={p} index={i} current={p.id === currentId} />
              ))}
            </div>
            <p className="hint">
              Al pasar a una foto, la cámara va a donde se sacó. Pincha una para verla grande.
            </p>
          </>
        )}
      </section>

      {current && (
        <section>
          <h2>Foto {index + 1}</h2>
          <p>
            {photoDate(current)} · {lensName(current.fov)} · {current.width} × {current.height} px
          </p>
          <div className="actions">
            <button onClick={() => open(current.id)}>Ver</button>
            <button onClick={() => downloadPhoto(current)}>Descargar</button>
            {confirming ? (
              <div className="confirm">
                <p>Se borrará esta foto. ¿Continuar?</p>
                <button className="danger" onClick={() => void remove(current.id)}>
                  Sí, eliminar
                </button>
                <button onClick={() => setConfirming(false)}>Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)}>Eliminar</button>
            )}
          </div>
        </section>
      )}
    </>
  )
}
