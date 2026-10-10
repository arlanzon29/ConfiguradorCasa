import { useFrame, useThree } from '@react-three/fiber'
import { MutableRefObject, useEffect, useRef } from 'react'
import { Matrix4, Mesh, PerspectiveCamera } from 'three'
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer'
import type { Shot } from '../photos'

/** Muestras por píxel con las que la foto se da por terminada. */
export const PHOTO_SAMPLES = 200

interface Props {
  /** Lo que forma la casa: si cambia algo, se reconstruye la escena del trazador. */
  revision: unknown[]
  onProgress: (samples: number) => void
  /** Se pone a true para capturar la imagen en el siguiente fotograma. */
  saveRequest: MutableRefObject<boolean>
  onSave: (image: Blob, shot: Shot) => void
}

/**
 * Foto en calidad: mientras está montado sustituye el dibujo normal de la escena
 * por un trazado de rayos que se va afinando muestra a muestra. Al mover la
 * cámara o cambiar la casa empieza de nuevo.
 */
export default function PhotoTracer({ revision, onProgress, saveRequest, onSave }: Props) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const tracer = useRef<WebGLPathTracer | null>(null)
  const rebuild = useRef(true)
  const restart = useRef(false)
  const meshCount = useRef(-1)
  const lastView = useRef(new Matrix4())
  // Cambia con el objetivo (campo de visión) y con el tamaño de la vista.
  const lastLens = useRef(new Matrix4())
  const reported = useRef(-1)

  useEffect(() => {
    const pt = new WebGLPathTracer(gl)
    pt.bounces = 5
    // Cada fotograma traza un cuarto de la imagen, para no bloquear la página.
    pt.tiles.set(2, 2)
    pt.dynamicLowRes = true
    tracer.current = pt

    // El trazador ignora la luz ambiente: la luz difusa la da un cielo.
    const sky = new GradientEquirectTexture()
    sky.topColor.set('#8fb4dc')
    sky.bottomColor.set('#e6edf1')
    sky.update()
    const previous = { background: scene.background, environment: scene.environment }
    scene.background = sky
    scene.environment = sky
    rebuild.current = true

    return () => {
      scene.background = previous.background
      scene.environment = previous.environment
      sky.dispose()
      tracer.current = null
      // La 0.0.23 falla dentro de su propio dispose(); sin esto, salir de la foto tumba la vista.
      try {
        pt.dispose()
      } catch {
        // Lo que no llegue a liberar se queda en la tarjeta gráfica hasta recargar.
      }
    }
  }, [gl, scene])

  useEffect(() => {
    rebuild.current = true
  }, revision)

  useEffect(() => {
    restart.current = true
  }, [size])

  // Con prioridad 1, este fotograma sustituye al dibujo normal de la escena.
  useFrame(() => {
    const pt = tracer.current
    if (!pt) return
    camera.updateMatrixWorld()

    // Los suelos con textura llegan más tarde que el resto: se cuentan las mallas
    // para enterarse de que la escena ha cambiado sin que cambie la casa.
    let meshes = 0
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) meshes++
    })
    if (rebuild.current || meshes !== meshCount.current) {
      scene.updateMatrixWorld()
      pt.setScene(scene, camera)
      meshCount.current = meshes
    } else if (
      !lastView.current.equals(camera.matrixWorld) ||
      !lastLens.current.equals(camera.projectionMatrix)
    ) {
      pt.updateCamera()
    } else if (restart.current) {
      pt.reset()
    }
    rebuild.current = false
    restart.current = false
    lastView.current.copy(camera.matrixWorld)
    lastLens.current.copy(camera.projectionMatrix)

    const save = saveRequest.current
    // Para guardar hay que dibujar en este mismo fotograma: el lienzo no conserva la imagen.
    if (pt.samples < PHOTO_SAMPLES || save) pt.renderSample()

    const done = Math.min(PHOTO_SAMPLES, Math.floor(pt.samples))
    if (done !== reported.current) {
      reported.current = done
      onProgress(done)
    }

    if (save) {
      saveRequest.current = false
      // Con la imagen se guarda desde dónde se sacó, para poder volver a ese punto.
      const shot: Shot = {
        pose: {
          position: camera.position.toArray() as [number, number, number],
          yaw: camera.rotation.y,
          pitch: camera.rotation.x,
        },
        fov: camera instanceof PerspectiveCamera ? camera.fov : 0,
        width: gl.domElement.width,
        height: gl.domElement.height,
      }
      // JPEG y no PNG: el grano del trazado hace que un PNG pese varias veces más.
      gl.domElement.toBlob((blob) => blob && onSave(blob, shot), 'image/jpeg', 0.92)
    }
  }, 1)

  return null
}
