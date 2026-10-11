import { useMemo, useRef } from 'react'
import { FurnitureItem, furnitureType, snapFurniture } from '../model/furniture'
import {
  GRID,
  MIN_SIZE,
  PLOT,
  PlacedModule,
  Rect,
  Side,
  formatMeters,
  roundSize,
  snap,
} from '../model/house'
import { Opening, swingDoor, swingSign } from '../model/openings'
import { Wall, deriveWalls, nearestWall, openingsOf, wallAcross } from '../model/walls'
import { vinylPlacement } from '../model/vinyls'
import { usePhotos } from '../photos'
import { CameraPose, useHouse } from '../store'

const MARGIN = 1
// Grosor (m) de la franja invisible que hace de tirador en cada lado.
const HANDLE = 0.5
// En modo paredes, distancia máxima (m) del clic a la pared que selecciona.
const WALL_PICK = 1
// En modo acabados, un clic a menos de esta distancia (m) de un lado elige su pared.
const SIDE_PICK = 0.8
// Los huecos se deslizan por la pared en pasos de 5 cm.
const snapOpening = (v: number) => Math.round(v * 20) / 20

type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
// Las esquinas van al final para que se pinten encima de los lados.
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

// Los bordes de los módulos de fábrica y de las demás estancias no suelen caer
// en la rejilla (un módulo mide 4,20 m), así que al arrastrar tienen prioridad
// sobre ella cuando quedan a menos de esta distancia.
const EDGE_SNAP = 0.12

/** Ajusta una coordenada al borde más cercano de `edges` o, si ninguno queda cerca, a la rejilla. */
function snapEdge(v: number, edges: number[]) {
  let best = snap(v)
  let bestDist = EDGE_SNAP
  for (const e of edges) {
    const dist = Math.abs(e - v)
    if (dist < bestDist) {
      best = e
      bestDist = dist
    }
  }
  return roundSize(best)
}

/** Como snapEdge, pero para un tramo de longitud `size`: vale que encaje cualquiera de sus dos extremos. */
function snapSpan(start: number, size: number, edges: number[]) {
  return snapEdge(start, [...edges, ...edges.map((e) => e - size)])
}

/** Bordes en x y en y de un conjunto de rectángulos. */
function edgesOf(rects: Rect[]) {
  return {
    xs: rects.flatMap((r) => [r.x, r.x + r.width]),
    ys: rects.flatMap((r) => [r.y, r.y + r.depth]),
  }
}

/**
 * Rectángulo resultante de llevar el lado o esquina `edge` de `m` hasta el
 * punto (px, py), ajustado a los bordes `xs` / `ys` o a la rejilla.
 */
function dragEdge(m: PlacedModule, edge: Edge, px: number, py: number, xs: number[], ys: number[]) {
  let { x, y, width, depth } = m
  if (edge.includes('e')) width = clamp(snapEdge(px, xs), x + MIN_SIZE, PLOT.width) - x
  if (edge.includes('s')) depth = clamp(snapEdge(py, ys), y + MIN_SIZE, PLOT.depth) - y
  if (edge.includes('w')) {
    const right = x + width
    x = clamp(snapEdge(px, xs), 0, right - MIN_SIZE)
    width = right - x
  }
  if (edge.includes('n')) {
    const bottom = y + depth
    y = clamp(snapEdge(py, ys), 0, bottom - MIN_SIZE)
    depth = bottom - y
  }
  return { x: roundSize(x), y: roundSize(y), width: roundSize(width), depth: roundSize(depth) }
}

/** Lado de `m` que queda a menos de SIDE_PICK metros del punto, o null si está hacia el centro. */
function sideNear(m: PlacedModule, px: number, py: number): Side | null {
  const distances: [Side, number][] = [
    ['n', py - m.y],
    ['s', m.y + m.depth - py],
    ['w', px - m.x],
    ['e', m.x + m.width - px],
  ]
  const [side, dist] = distances.reduce((a, b) => (b[1] < a[1] ? b : a))
  return dist <= SIDE_PICK ? side : null
}

/** Línea que marca por dentro el lado seleccionado, en coordenadas de la estancia. */
function sideMark(m: PlacedModule, side: Side) {
  const inset = 0.3
  const horizontal = side === 'n' || side === 's'
  const across = side === 'n' || side === 'w' ? inset : (horizontal ? m.depth : m.width) - inset
  return horizontal
    ? { x1: inset, y1: across, x2: m.width - inset, y2: across }
    : { x1: across, y1: inset, x2: across, y2: m.depth - inset }
}

/**
 * Transformación del "sistema de la pared" al del plano: dentro de ella, x
 * recorre la pared desde su inicio e y atraviesa su grosor (hacia el sur o el este).
 */
function wallTransform(wall: Wall) {
  const [across] = wallAcross(wall)
  return wall.horizontal
    ? `translate(${wall.from} ${across})`
    : `matrix(0 1 1 0 ${across} ${wall.from})`
}

/** Símbolo de plano de un hueco, en el sistema de su pared y con origen en su inicio. */
function OpeningSymbol({ o, t }: { o: Opening; t: number }) {
  const w = o.width
  if (o.kind === 'window') {
    return (
      <>
        <rect className="opening-frame" width={w} height={t} />
        <line className="opening-line" x1={0} y1={t / 2} x2={w} y2={t / 2} />
      </>
    )
  }
  if (swingDoor(o)) {
    return (
      <>
        <line className="opening-line" x1={0} y1={t} x2={0} y2={t + w} />
        <path className="door-swing" d={`M0 ${t + w} A${w} ${w} 0 0 0 ${w} ${t}`} />
      </>
    )
  }
  return (
    <>
      <rect className="opening-frame" width={w} height={t} />
      <line className="opening-line" x1={0} y1={t * 0.3} x2={w * 0.55} y2={t * 0.3} />
      <line className="opening-line" x1={w * 0.45} y1={t * 0.7} x2={w} y2={t * 0.7} />
    </>
  )
}

/** Símbolo de plano de un mueble, centrado en el origen y con su parte trasera hacia arriba. */
function FurnitureSymbol({ item }: { item: FurnitureItem }) {
  const type = furnitureType(item.typeId)
  if (!type) return null
  const { width: w, depth: d, shape } = type
  return (
    <>
      <rect className="furniture-body" x={-w / 2} y={-d / 2} width={w} height={d} rx={0.04} />
      {shape === 'bed' && (
        <rect className="furniture-detail" x={-w / 2 + 0.1} y={-d / 2 + 0.1} width={w - 0.2} height={0.4} rx={0.08} />
      )}
      {(shape === 'sofa' || shape === 'chair') && (
        <rect className="furniture-detail" x={-w / 2} y={-d / 2} width={w} height={d * 0.25} />
      )}
      {shape === 'wardrobe' && <line className="furniture-line" x1={0} y1={-d / 2} x2={0} y2={d / 2} />}
      {/* El rótulo se mantiene derecho aunque la pieza esté girada. */}
      {w >= 0.8 && (
        <text className="furniture-label" transform={`rotate(${-item.rotation})`}>
          {type.name}
        </text>
      )}
    </>
  )
}

/** Zona del plano que se muestra, en metros. */
interface View {
  x: number
  y: number
  width: number
  height: number
}

const FULL_VIEW: View = {
  x: -MARGIN,
  y: -MARGIN,
  width: PLOT.width + 2 * MARGIN,
  height: PLOT.depth + 2 * MARGIN,
}

// Aire (m) que se deja alrededor de los módulos al encuadrarlos.
const FIT_MARGIN = 2

/** Encuadre ajustado a los módulos de la casa. */
function fitView(shells: Rect[]): View {
  const left = Math.min(...shells.map((s) => s.x)) - FIT_MARGIN
  const top = Math.min(...shells.map((s) => s.y)) - FIT_MARGIN
  const right = Math.max(...shells.map((s) => s.x + s.width)) + FIT_MARGIN
  const bottom = Math.max(...shells.map((s) => s.y + s.depth)) + FIT_MARGIN
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Dónde se pinta la cámara 3D en el plano, y si ha habido que acercarla al borde visible. */
function cameraOnPlan(pose: CameraPose, view: View) {
  // La escena 3D tiene la parcela centrada en el origen; el plano, en su esquina.
  const px = pose.position[0] + PLOT.width / 2
  const py = pose.position[2] + PLOT.depth / 2
  const inset = 0.6
  const x = clamp(px, view.x + inset, view.x + view.width - inset)
  const y = clamp(py, view.y + inset, view.y + view.height - inset)
  return { x, y, outside: x !== px || y !== py }
}

interface CameraMarkerProps {
  pose: CameraPose
  view: View
  onMoveStart: (e: React.PointerEvent) => void
  onAimStart: (e: React.PointerEvent) => void
}

/** Posición y dirección de la cámara 3D: el punto la mueve y el tirador del cono la orienta. */
function CameraMarker({ pose, view, onMoveStart, onAimStart }: CameraMarkerProps) {
  // Si la cámara cae fuera de lo que se ve, se pinta atenuada en el borde más cercano.
  const { x, y, outside } = cameraOnPlan(pose, view)
  return (
    <g
      className={outside ? 'camera-marker outside' : 'camera-marker'}
      transform={`translate(${x} ${y}) rotate(${(-pose.yaw * 180) / Math.PI}) scale(0.5)`}
    >
      <polygon className="camera-cone" points="0,0 -2,-3.5 2,-3.5" />
      <circle className="camera-aim" cy={-3.5} r={0.3} onPointerDown={onAimStart} />
      <circle className="camera-dot" r={0.4} onPointerDown={onMoveStart} />
    </g>
  )
}

type Drag =
  | { id: string; dx: number; dy: number; edge?: undefined }
  | { id: string; edge: Edge }
  // `grab`: distancia del puntero al inicio del hueco, a lo largo de su pared.
  | { opening: string; grab: number; horizontal: boolean }
  | { furniture: string; dx: number; dy: number }
  | { shell: string; dx: number; dy: number }
  | { camera: 'move'; dx: number; dy: number }
  | { camera: 'aim' }

export default function Editor2D() {
  const cameraPose = useHouse((s) => s.cameraPose)
  const photos = usePhotos((s) => s.photos)
  const currentPhotoId = usePhotos((s) => s.currentId)
  const goToPhoto = usePhotos((s) => s.goTo)
  const modules =useHouse((s) => s.modules)
  const openings = useHouse((s) => s.openings)
  const joints = useHouse((s) => s.joints)
  const mode = useHouse((s) => s.mode)
  const tool = useHouse((s) => s.tool)
  const selectedId = useHouse((s) => s.selectedId)
  const selectedWall = useHouse((s) => s.selectedWall)
  const selectedSide = useHouse((s) => s.selectedSide)
  const shells = useHouse((s) => s.shells)
  const selectedShellId = useHouse((s) => s.selectedShellId)
  const selectShell = useHouse((s) => s.selectShell)
  const moveShell = useHouse((s) => s.moveShell)
  const furniture = useHouse((s) => s.furniture)
  const selectedFurnitureId = useHouse((s) => s.selectedFurnitureId)
  const selectFurniture = useHouse((s) => s.selectFurniture)
  const addFurniture = useHouse((s) => s.addFurniture)
  const moveFurniture = useHouse((s) => s.moveFurniture)
  const selectedOpeningId = useHouse((s) => s.selectedOpeningId)
  const select = useHouse((s) => s.select)
  const selectWall = useHouse((s) => s.selectWall)
  const selectOpening = useHouse((s) => s.selectOpening)
  const moveModule = useHouse((s) => s.moveModule)
  const resizeModule = useHouse((s) => s.resizeModule)
  const addOpening = useHouse((s) => s.addOpening)
  const moveOpening = useHouse((s) => s.moveOpening)
  const beginDrag = useHouse((s) => s.beginDrag)
  const endDrag = useHouse((s) => s.endDrag)

  const walls = useMemo(() => deriveWalls(modules, joints), [modules, joints])

  // Colocando módulos se ve toda la parcela; en los demás modos el plano se
  // encuadra en la casa, para trabajar su interior más de cerca.
  const view = useMemo(
    () => (mode === 'shells' || shells.length === 0 ? FULL_VIEW : fitView(shells)),
    [mode, shells],
  )

  const svgRef = useRef<SVGSVGElement>(null)
  // Arrastre en curso: mover una estancia (con el desfase puntero-esquina), estirar
  // un lado, deslizar un hueco por su pared, o mover / orientar la cámara 3D.
  const drag = useRef<Drag | null>(null)

  const toMeters = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }

  const startCameraDrag = (e: React.PointerEvent, cameraMode: 'move' | 'aim') => {
    if (!cameraPose) return
    e.stopPropagation()
    const p = toMeters(e)
    const shown = cameraOnPlan(cameraPose, view)
    drag.current =
      cameraMode === 'move'
        ? { camera: 'move', dx: p.x - shown.x, dy: p.y - shown.y }
        : { camera: 'aim' }
    svgRef.current!.setPointerCapture(e.pointerId)
  }

  const dragCamera = (d: Extract<Drag, { camera: string }>, p: DOMPoint) => {
    const { cameraPose: pose, setCameraPose } = useHouse.getState()
    if (!pose) return
    if (d.camera === 'move') {
      const [, height] = pose.position
      setCameraPose({
        ...pose,
        position: [p.x - d.dx - PLOT.width / 2, height, p.y - d.dy - PLOT.depth / 2],
      })
    } else {
      const shown = cameraOnPlan(pose, view)
      // yaw 0 mira hacia arriba en el plano (-y) y crece en sentido antihorario.
      setCameraPose({ ...pose, yaw: Math.atan2(shown.x - p.x, shown.y - p.y) })
    }
  }

  // En modo paredes el clic va a la pared más cercana: coloca el hueco elegido o la selecciona.
  const clickWalls = (e: React.PointerEvent) => {
    const p = toMeters(e)
    const hit = nearestWall(p.x, p.y, walls, WALL_PICK)
    if (tool) {
      if (hit) addOpening(tool, hit.wall.key, hit.along)
    } else {
      selectWall(hit ? hit.wall.key : null)
    }
  }

  // En modo opciones el clic en el plano coloca el mueble elegido, o deselecciona.
  const clickOptions = (e: React.PointerEvent) => {
    if (!tool) return selectFurniture(null)
    const p = toMeters(e)
    addFurniture(tool, snapFurniture(p.x), snapFurniture(p.y))
  }

  /** La estancia `id` y los bordes a los que se imanta: módulos y demás estancias. */
  const roomAndEdges = (id: string) => {
    const state = useHouse.getState()
    const room = state.modules.find((mod) => mod.id === id)
    if (!room) return null
    return { room, ...edgesOf([...state.shells, ...state.modules.filter((mod) => mod.id !== id)]) }
  }

  // Una línea por paso de rejilla; las que caen en metro entero se marcan más.
  const gridLines = (length: number) =>
    Array.from({ length: Math.round(length / GRID) + 1 }, (_, i) => ({
      at: roundSize(i * GRID),
      major: i % Math.round(1 / GRID) === 0,
    }))

  const handleRect = (m: PlacedModule, edge: Edge) => {
    // null = el tirador no está pegado a ningún lado en ese eje y lo ocupa entero.
    const hx = edge.includes('w') ? 0 : edge.includes('e') ? m.width : null
    const hy = edge.includes('n') ? 0 : edge.includes('s') ? m.depth : null
    return {
      x: hx === null ? 0 : hx - HANDLE / 2,
      y: hy === null ? 0 : hy - HANDLE / 2,
      width: hx === null ? m.width : HANDLE,
      height: hy === null ? m.depth : HANDLE,
    }
  }

  const renderWall = (wall: Wall) => {
    const t = wall.thickness
    const own = wall.open ? [] : openingsOf(wall, modules, walls, openings)
    // Tramos macizos: lo que queda de la pared tras quitar los huecos.
    const solids: [number, number][] = []
    let cursor = wall.from
    for (const o of own) {
      if (o.from > cursor) solids.push([cursor, o.from])
      cursor = Math.max(cursor, o.to)
    }
    if (cursor < wall.to) solids.push([cursor, wall.to])

    return (
      <g
        key={wall.key}
        className={wall.key === selectedWall ? 'wall selected' : 'wall'}
        transform={wallTransform(wall)}
      >
        {wall.open ? (
          <line className="wall-open" x1={0} y1={t / 2} x2={wall.to - wall.from} y2={t / 2} />
        ) : (
          solids.map(([from, to]) => (
            <rect
              key={from}
              className="wall-solid"
              x={from - wall.from}
              width={to - from}
              height={t}
            />
          ))
        )}
        {own.map(({ opening: o, from }) => (
          <g
            key={o.id}
            className={o.id === selectedOpeningId ? 'opening selected' : 'opening'}
            transform={`translate(${from - wall.from} 0)`}
            onPointerDown={(e) => {
              // Con un hueco por colocar, el clic sigue hasta el lienzo.
              if (mode !== 'walls' || tool) return
              e.stopPropagation()
              selectOpening(o.id)
              const p = toMeters(e)
              const grab = (wall.horizontal ? p.x : p.y) - from
              drag.current = { opening: o.id, grab, horizontal: wall.horizontal }
              svgRef.current!.setPointerCapture(e.pointerId)
            }}
          >
            <rect className="opening-hit" y={-0.2} width={o.width} height={t + 0.4} />
            {/* El símbolo abre hacia el sur o el este con las bisagras al inicio: se
                voltea según a qué lado abre la puerta y en qué canto gira. */}
            <g
              transform={`matrix(${o.hinge === 'end' ? -1 : 1} 0 0 ${swingSign(o)} ${
                o.hinge === 'end' ? o.width : 0
              } ${swingSign(o) < 0 ? t : 0})`}
            >
              <OpeningSymbol o={o} t={t} />
            </g>
          </g>
        ))}
      </g>
    )
  }

  return (
    <svg
      ref={svgRef}
      className={`editor2d mode-${mode}${tool ? ' placing' : ''}`}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      onPointerDown={(e) =>
        mode === 'walls'
          ? clickWalls(e)
          : mode === 'options'
            ? clickOptions(e)
            : mode === 'shells'
              ? selectShell(null)
              : select(null)
      }
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const p = toMeters(e)
        if ('camera' in d) {
          dragCamera(d, p)
        } else if ('shell' in d) {
          const state = useHouse.getState()
          const shell = state.shells.find((sh) => sh.id === d.shell)
          if (!shell) return
          // Se imanta a los bordes del otro módulo, para poder unirlos a ras.
          const { xs, ys } = edgesOf(state.shells.filter((sh) => sh.id !== d.shell))
          moveShell(
            d.shell,
            snapSpan(p.x - d.dx, shell.width, xs),
            snapSpan(p.y - d.dy, shell.depth, ys),
          )
        } else if ('furniture' in d) {
          moveFurniture(d.furniture, snapFurniture(p.x - d.dx), snapFurniture(p.y - d.dy))
        } else if ('opening' in d) {
          moveOpening(d.opening, snapOpening((d.horizontal ? p.x : p.y) - d.grab))
        } else if (d.edge) {
          const m = roomAndEdges(d.id)
          if (!m) return
          const r = dragEdge(m.room, d.edge, p.x, p.y, m.xs, m.ys)
          resizeModule(d.id, r.width, r.depth, r.x, r.y)
        } else {
          const m = roomAndEdges(d.id)
          if (!m) return
          moveModule(
            d.id,
            snapSpan(p.x - d.dx, m.room.width, m.xs),
            snapSpan(p.y - d.dy, m.room.depth, m.ys),
          )
        }
      }}
      onPointerUp={() => {
        drag.current = null
        endDrag()
      }}
    >
      <rect className="plot" width={PLOT.width} height={PLOT.depth} />
      {gridLines(PLOT.width).map(({ at, major }) => (
        <line
          key={`v${at}`}
          className={major ? 'grid-line major' : 'grid-line'}
          x1={at}
          y1={0}
          x2={at}
          y2={PLOT.depth}
        />
      ))}
      {gridLines(PLOT.depth).map(({ at, major }) => (
        <line
          key={`h${at}`}
          className={major ? 'grid-line major' : 'grid-line'}
          x1={0}
          y1={at}
          x2={PLOT.width}
          y2={at}
        />
      ))}

      {shells.map((sh) => (
        <g key={sh.id} className={sh.id === selectedShellId ? 'shell selected' : 'shell'}>
          <rect className="shell-outline" x={sh.x} y={sh.y} width={sh.width} height={sh.depth} />
          <text className="shell-label" x={sh.x} y={sh.y - 0.2}>
            Módulo {formatMeters(sh.width)} × {formatMeters(sh.depth)} m
          </text>
        </g>
      ))}

      {modules.map((m) => (
        <g
          key={m.id}
          className={m.id === selectedId ? 'module selected' : 'module'}
          transform={`translate(${m.x} ${m.y})`}
          onPointerDown={(e) => {
            // Las estancias se mueven en su modo; en acabados solo se seleccionan.
            if (mode !== 'modules' && mode !== 'finishes' && mode !== 'pieces') return
            e.stopPropagation()
            const p = toMeters(e)
            if (mode !== 'modules') {
              // Junto a una pared se elige esa pared; en el centro, la estancia entera.
              select(m.id, sideNear(m, p.x, p.y))
              return
            }
            select(m.id)
            beginDrag()
            drag.current = { id: m.id, dx: p.x - m.x, dy: p.y - m.y }
            svgRef.current!.setPointerCapture(e.pointerId)
          }}
        >
          <rect className="body" width={m.width} height={m.depth} />
          <text x={m.width / 2} y={m.depth / 2}>
            {formatMeters(m.width)} × {formatMeters(m.depth)} m
          </text>
          {m.id === selectedId && selectedSide && (
            <line className="side-mark" {...sideMark(m, selectedSide)} />
          )}
          {/* Vinilos: una raya pegada a su pared, a lo ancho de cada uno. */}
          {mode === 'finishes' &&
            (['n', 's', 'e', 'w'] as const).flatMap((side) =>
              (m.vinyls?.[side] ?? []).map((v) => {
                const place = vinylPlacement(m, side, v, walls)
                if (!place) return null
                const [a, b] = [place.along - v.width / 2, place.along + v.width / 2]
                // Algo separada de la cara para que no la tape el dibujo de la pared.
                const across = place.across + (side === 'n' || side === 'w' ? 0.05 : -0.05)
                return place.horizontal ? (
                  <line key={v.id} className="vinyl-mark" x1={a - m.x} x2={b - m.x} y1={across - m.y} y2={across - m.y} />
                ) : (
                  <line key={v.id} className="vinyl-mark" y1={a - m.y} y2={b - m.y} x1={across - m.x} x2={across - m.x} />
                )
              }),
            )}
          {/* Espejos: otra raya, a ras de la pared. */}
          {mode === 'finishes' &&
            (['n', 's', 'e', 'w'] as const).flatMap((side) =>
              (m.mirrors?.[side] ?? []).map((v) => {
                const place = vinylPlacement(m, side, v, walls)
                if (!place) return null
                const [a, b] = [place.along - v.width / 2, place.along + v.width / 2]
                const across = place.across + (side === 'n' || side === 'w' ? 0.02 : -0.02)
                return place.horizontal ? (
                  <line key={v.id} className="mirror-mark" x1={a - m.x} x2={b - m.x} y1={across - m.y} y2={across - m.y} />
                ) : (
                  <line key={v.id} className="mirror-mark" y1={a - m.y} y2={b - m.y} x1={across - m.x} x2={across - m.x} />
                )
              }),
            )}
          {/* Tableros: una raya tan gruesa como su fondo, desde la cara de la pared. */}
          {mode === 'pieces' &&
            (['n', 's', 'e', 'w'] as const).flatMap((side) =>
              (m.boards?.[side] ?? []).map((v) => {
                const place = vinylPlacement(m, side, v, walls, v.depth / 2)
                if (!place) return null
                const [a, b] = [place.along - v.width / 2, place.along + v.width / 2]
                const across = place.across
                return place.horizontal ? (
                  <line key={v.id} className="board-mark" strokeWidth={v.depth} x1={a - m.x} x2={b - m.x} y1={across - m.y} y2={across - m.y} />
                ) : (
                  <line key={v.id} className="board-mark" strokeWidth={v.depth} y1={a - m.y} y2={b - m.y} x1={across - m.x} x2={across - m.x} />
                )
              }),
            )}
        </g>
      ))}

      {walls.map(renderWall)}

      {furniture.map((item) => (
        <g
          key={item.id}
          className={item.id === selectedFurnitureId ? 'furniture selected' : 'furniture'}
          transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
          onPointerDown={(e) => {
            // Con un mueble por colocar, el clic sigue hasta el lienzo.
            if (mode !== 'options' || tool) return
            e.stopPropagation()
            selectFurniture(item.id)
            const p = toMeters(e)
            drag.current = { furniture: item.id, dx: p.x - item.x, dy: p.y - item.y }
            svgRef.current!.setPointerCapture(e.pointerId)
          }}
        >
          <FurnitureSymbol item={item} />
        </g>
      ))}

      {/* Tiradores de la estancia seleccionada, por encima de las paredes. */}
      {modules
        .filter((m) => mode === 'modules' && m.id === selectedId)
        .map((m) => (
          <g key={m.id} transform={`translate(${m.x} ${m.y})`}>
            {EDGES.map((edge) => {
              const h = handleRect(m, edge)
              return (
                <g key={edge} className={`handle handle-${edge}`}>
                  <rect
                    className="handle-hit"
                    {...h}
                    onPointerDown={(e) => {
                      e.stopPropagation()
                      beginDrag()
                      drag.current = { id: m.id, edge }
                      svgRef.current!.setPointerCapture(e.pointerId)
                    }}
                  />
                  <circle
                    className="handle-grip"
                    cx={h.x + h.width / 2}
                    cy={h.y + h.height / 2}
                    r={0.18}
                  />
                </g>
              )
            })}
          </g>
        ))}

      {/* En modo módulos, una capa por encima de todo recoge el clic y el arrastre. */}
      {mode === 'shells' &&
        shells.map((sh) => (
          <rect
            key={sh.id}
            className={sh.id === selectedShellId ? 'shell-hit selected' : 'shell-hit'}
            x={sh.x}
            y={sh.y}
            width={sh.width}
            height={sh.depth}
            onPointerDown={(e) => {
              e.stopPropagation()
              selectShell(sh.id)
              beginDrag()
              const p = toMeters(e)
              drag.current = { shell: sh.id, dx: p.x - sh.x, dy: p.y - sh.y }
              svgRef.current!.setPointerCapture(e.pointerId)
            }}
          />
        ))}

      {/* En modo fotos, un icono numerado por foto, donde se sacó y mirando hacia donde miraba. */}
      {mode === 'photos' &&
        photos.map((photo, i) => {
          const { x, y, outside } = cameraOnPlan(photo.pose, view)
          const classes = ['photo-marker']
          if (photo.id === currentPhotoId) classes.push('current')
          if (outside) classes.push('outside')
          return (
            <g
              key={photo.id}
              className={classes.join(' ')}
              transform={`translate(${x} ${y})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                goToPhoto(photo.id)
              }}
            >
              <title>{`Foto ${i + 1}`}</title>
              <polygon
                points="0,-0.55 -0.2,-0.2 0.2,-0.2"
                transform={`rotate(${(-photo.pose.yaw * 180) / Math.PI})`}
              />
              <circle r={0.26} />
              <text dy={0.1}>{i + 1}</text>
            </g>
          )
        })}

      {cameraPose && (
        <CameraMarker
          pose={cameraPose}
          view={view}
          onMoveStart={(e) => startCameraDrag(e, 'move')}
          onAimStart={(e) => startCameraDrag(e, 'aim')}
        />
      )}
    </svg>
  )
}
