// Funciones para manejar la casa sin pasar por la interfaz: las llama Claude
// desde la página (`window.eurocasa`). Es una prueba del uso "comercial desde
// Claude": pocas funciones, con parámetros en el idioma del comercial, que
// devuelven lo creado o el motivo por el que no se ha podido.

import { PLOT, PlacedModule, Shell, Side, WALL_HEIGHT, fits, roundSize, sideLength, validSize } from './model/house'
import { MECHANISMS, MECHANISM_HEIGHT, mechanismSize, mechanismType } from './model/mechanisms'
import { wallFace } from './model/vinyls'
import { BASE_FLOOR, MATERIALS, WALL_COLORS, floorOf, interiorFinish } from './model/finishes'
import { FURNITURE, FurnitureItem, Rotation, furnitureType, liftOf, partChoices } from './model/furniture'
import { furnitureName, houseName, pieceName, roomName, shellName } from './model/names'
import { OPPOSITE, Opening, openingCode, swingDoor, validOpeningSize, wallLine } from './model/openings'
import { deriveWalls, wallOf } from './model/walls'
import { Plan, parsePhotos, parsePlan, serializePlan } from './model/planFile'
import { exportPhotos, importPhotos, replaceImage, usePhotos } from './photos'
import { redo, undo } from './history'
import { CameraPose, GLB_EVENT, GlbRequest, PHOTO_EVENT, PHOTO_SAMPLES, furnitureBox, useHouse } from './store'

type Fallo = { error: string }

const state = () => useHouse.getState()

/** Busca por nombre (sin distinguir mayúsculas) o por id. */
const findShell = (ref?: string) => {
  const { shells } = state()
  if (!ref) return shells[0]
  const key = ref.trim().toLowerCase()
  return shells.find((s) => s.id === ref || shellName(shells, s).toLowerCase() === key)
}
const findRoom = (ref: string) => {
  const { modules } = state()
  const key = ref.trim().toLowerCase()
  return modules.find((m) => m.id === ref || roomName(modules, m.id).toLowerCase() === key)
}

/** La estancia que contiene ese punto del plano. */
const roomAt = (x: number, y: number) =>
  state().modules.find(
    (m) => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.depth,
  )

/**
 * De qué estancia es una foto: la que tiene la cámara un metro por delante (una
 * foto sacada desde el umbral de la puerta es de la estancia a la que mira) y,
 * si ahí no hay ninguna, la que la contiene.
 */
function photoRoom(pose: CameraPose) {
  const x = pose.position[0] + PLOT.width / 2
  const y = pose.position[2] + PLOT.depth / 2
  // El giro 0 mira al norte y crece hacia el oeste.
  return roomAt(x - Math.sin(pose.yaw), y - Math.cos(pose.yaw)) ?? roomAt(x, y)
}

/** Una estancia tal como se cuenta: posición desde la esquina de su módulo. */
function describeRoom(m: PlacedModule, shell?: Shell) {
  const { modules } = state()
  return {
    id: m.id,
    nombre: roomName(modules, m.id),
    x: roundSize(m.x - (shell?.x ?? 0)),
    y: roundSize(m.y - (shell?.y ?? 0)),
    ancho: m.width,
    fondo: m.depth,
    suelo: floorOf(m) ?? 'sin acabado',
    paredes: describeWalls(m).paredes,
  }
}

/** La casa en forma de árbol: módulos y, dentro, sus estancias. */
function casa() {
  const { shells, modules } = state()
  return {
    nombre: houseName(state().houseName),
    modulos: shells.map((s) => ({
      id: s.id,
      nombre: shellName(shells, s),
      x: s.x,
      y: s.y,
      ancho: s.width,
      fondo: s.depth,
      estancias: modules.filter((m) => m.shellId === s.id).map((m) => describeRoom(m, s)),
    })),
    estanciasSueltas: modules.filter((m) => !m.shellId).map((m) => describeRoom(m)),
    huecos: state().openings.map(describeOpening),
    muebles: state().furniture.map(describeFurniture),
    mecanismos: describeMechanisms(),
    tableros: describeBoards(),
    // Las fotos guardadas: desde dónde se sacó cada una, en coordenadas del plano.
    fotos: usePhotos.getState().photos.map((p, i) => {
      const x = roundSize(p.pose.position[0] + PLOT.width / 2)
      const y = roundSize(p.pose.position[2] + PLOT.depth / 2)
      const room = photoRoom(p.pose)
      // La cámara entera (para copiarla en Blender): altura de ojos, giro y
      // cabeceo en radianes como `CameraPose`, objetivo vertical y tamaño.
      const camara = {
        altura: p.pose.position[1],
        giro: p.pose.yaw,
        cabeceo: p.pose.pitch,
        objetivo: p.fov,
        ancho: p.width,
        alto: p.height,
      }
      return { foto: i + 1, ...(room && { estancia: roomName(modules, room.id) }), x, y, camara }
    }),
  }
}

/** Borra el plano y sus fotos y deja un módulo vacío del tamaño máximo. */
function nuevoPlano() {
  usePhotos.getState().replaceAll([])
  state().newPlan()
  return casa()
}

/** Pone nombre a la casa; vacío, vuelve a llamarse "Casa". */
function nombrarCasa(nombre: string) {
  if (typeof nombre !== 'string') return { error: 'El nombre tiene que ser un texto.' } as Fallo
  state().rename('house', '', nombre)
  return casa()
}

/** Cambia las medidas de un módulo (por defecto, el primero). */
function medirModulo(p: { modulo?: string; ancho: number; fondo: number }) {
  const shell = findShell(p.modulo)
  if (!shell) return { error: `No hay ningún módulo "${p.modulo ?? ''}".` } as Fallo
  const error = state().resizeShell(shell.id, p.ancho, p.fondo)
  return error ? ({ error } as Fallo) : casa()
}

/**
 * Crea una estancia. Con `x` e `y` (desde la esquina de su módulo) va a ese
 * sitio; sin ellos, al primer hueco libre de la casa.
 */
function crearEstancia(p: {
  nombre?: string
  ancho: number
  fondo: number
  x?: number
  y?: number
  modulo?: string
}) {
  if (!validSize(p.ancho, p.fondo)) return { error: 'Medidas no válidas para una estancia.' } as Fallo
  const shell = findShell(p.modulo)
  if (p.modulo && !shell) return { error: `No hay ningún módulo "${p.modulo}".` } as Fallo
  const placed = p.x !== undefined && p.y !== undefined
  if (placed) {
    const { modules, shells } = state()
    const spot = {
      x: (shell?.x ?? 0) + p.x!,
      y: (shell?.y ?? 0) + p.y!,
      width: p.ancho,
      depth: p.fondo,
    }
    if (!fits(spot, modules, shells)) {
      return { error: 'Ahí no cabe: se sale de su módulo o pisa otra estancia.' } as Fallo
    }
  }
  if (!state().addModule(p.ancho, p.fondo)) return { error: 'No queda sitio para esa estancia.' } as Fallo
  const id = state().selectedId!
  if (placed) {
    state().resizeModule(id, p.ancho, p.fondo, (shell?.x ?? 0) + p.x!, (shell?.y ?? 0) + p.y!)
  }
  if (p.nombre) state().rename('room', id, p.nombre)
  const room = state().modules.find((m) => m.id === id)!
  return describeRoom(room, state().shells.find((s) => s.id === room.shellId))
}

/** Quita una estancia, por nombre o id. */
function eliminarEstancia(p: { estancia: string }) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  state().removeModule(room.id)
  return casa()
}

const TIPOS = { puerta: 'door', corredera: 'sliding', ventana: 'window' } as const
const LADOS: Record<string, Side> = { norte: 'n', sur: 's', este: 'e', oeste: 'w' }
const lado = (side: Side) => Object.keys(LADOS).find((k) => LADOS[k] === side)!
// Con giro 0 la parte trasera de un mueble mira al norte; cada giro, 90° en sentido horario.
const BACKS: Record<Rotation, Side> = { 0: 'n', 90: 'e', 180: 's', 270: 'w' }

/** Lo que se puede ajustar de un hueco; medidas en metros, `altura` sobre el suelo. */
interface Ajustes {
  ancho?: number
  alto?: number
  altura?: number
  /** Nombre de la estancia hacia la que abre la puerta, o "fuera". */
  abreHacia?: string
  /** Si la puerta abatible se ve cerrada en 3D y en la foto (si no, abierta a 90°). */
  cerrada?: boolean
}

/** Un hueco tal como se cuenta: anclado a un lado de su estancia. */
function describeOpening(o: Opening) {
  const { modules, joints } = state()
  const wall = wallOf(o, modules, deriveWalls(modules, joints))
  const otherId = wall?.shared ? (wall.moduleId === o.moduleId ? wall.otherId : wall.moduleId) : undefined
  return {
    id: o.id,
    codigo: openingCode(o),
    tipo: o.kind === 'window' ? 'ventana' : swingDoor(o) ? 'puerta' : 'corredera',
    estancia: roomName(modules, o.moduleId),
    lado: lado(o.side),
    ...(otherId && { con: roomName(modules, otherId) }),
    desde: o.offset,
    ancho: o.width,
    alto: o.height,
    altura: o.sill,
    ...(swingDoor(o) && {
      abreHacia: o.swing !== 'out' ? roomName(modules, o.moduleId) : otherId ? roomName(modules, otherId) : 'fuera',
      cerrada: !!o.closed,
    }),
  }
}

/**
 * Pone una puerta, una corredera o una ventana en la pared de un lado de una
 * estancia. Con `con`, en el tramo que comparte con esa otra estancia. Con
 * `posicion` (metros desde el extremo oeste o norte del lado hasta el centro
 * del hueco) va ahí; sin ella, centrado en el tramo más largo. Admite además
 * los ajustes de `cambiarHueco`.
 */
function ponerHueco(
  p: {
    tipo: keyof typeof TIPOS
    estancia: string
    lado: string
    con?: string
    posicion?: number
  } & Ajustes,
) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  const side = LADOS[p.lado]
  if (!side || !TIPOS[p.tipo]) return { error: 'Tipo o lado desconocido.' } as Fallo
  const other = p.con ? findRoom(p.con) : undefined
  if (p.con && !other) return { error: `No hay ninguna estancia "${p.con}".` } as Fallo

  const { modules, joints } = state()
  const line = wallLine(room, side)
  const at = p.posicion === undefined ? undefined : line.start + p.posicion
  // Los tramos de ese lado: los que salen de la estancia y los de la vecina que dan a ella.
  const wall = deriveWalls(modules, joints)
    .filter(
      (w) =>
        ((w.moduleId === room.id && w.side === side) ||
          (w.otherId === room.id && w.side === OPPOSITE[side])) &&
        (!other || w.moduleId === other.id || w.otherId === other.id) &&
        (at === undefined || (at >= w.from && at <= w.to)),
    )
    .sort((a, b) => b.to - b.from - (a.to - a.from))[0]
  if (!wall) return { error: 'No hay pared ahí.' } as Fallo
  if (!state().addOpening(TIPOS[p.tipo], wall.key, at ?? (wall.from + wall.to) / 2)) {
    return { error: 'No cabe en esa pared, o pisa otro hueco.' } as Fallo
  }
  const id = state().selectedOpeningId!
  const { ancho, alto, altura, abreHacia, cerrada } = p
  if ([ancho, alto, altura, abreHacia, cerrada].some((v) => v !== undefined)) {
    const changed = cambiarHueco({ hueco: id, ancho, alto, altura, abreHacia, cerrada })
    if ('error' in changed) {
      state().removeOpening(id)
      return changed
    }
  }
  return describeOpening(state().openings.find((o) => o.id === id)!)
}

/**
 * Cambia un hueco ya puesto (`hueco` es su id): medidas, altura sobre el suelo
 * y, en una puerta abatible, hacia qué estancia abre ("fuera" en una exterior).
 * Al cambiar el ancho conserva su centro. Con `posicion` lo mueve a lo largo de
 * su pared: metros desde el extremo oeste o norte del lado de su estancia (la
 * `estancia` y el `lado` que da `casa()`) hasta el centro del hueco.
 */
function cambiarHueco(p: { hueco: string; posicion?: number } & Ajustes) {
  const find = () => state().openings.find((o) => o.id === p.hueco)
  const before = find()
  if (!before) return { error: `No hay ningún hueco "${p.hueco}".` } as Fallo
  const { modules, joints } = state()

  let swing: Opening['swing']
  if (p.abreHacia !== undefined) {
    if (!swingDoor(before)) return { error: 'Solo una puerta abatible abre hacia un lado.' } as Fallo
    const wall = wallOf(before, modules, deriveWalls(modules, joints))
    const otherId = wall?.shared
      ? wall.moduleId === before.moduleId
        ? wall.otherId
        : wall.moduleId
      : undefined
    const target = p.abreHacia === 'fuera' ? undefined : findRoom(p.abreHacia)
    if (target?.id === before.moduleId) swing = 'in'
    else if (target ? target.id === otherId : !otherId) swing = 'out'
    else return { error: `Esa puerta no da a "${p.abreHacia}".` } as Fallo
  }

  const width = p.ancho ?? before.width
  const height = p.alto ?? before.height
  const sill = p.altura ?? before.sill
  if (!validOpeningSize({ width, height, sill })) return { error: 'Medidas no válidas para un hueco.' } as Fallo
  // Bajar el alto antes de subir la altura, o al revés: el orden que quepa en la pared.
  const resize = () => state().resizeOpening(p.hueco, width, height)
  const resized = resize()
  state().setOpeningSill(p.hueco, sill)
  if (!resized && !resize()) {
    state().setOpeningSill(p.hueco, before.sill)
    return { error: 'Con esas medidas no cabe en su pared, o pisa otro hueco.' } as Fallo
  }
  if (width !== before.width) {
    const start = wallLine(modules.find((m) => m.id === before.moduleId)!, before.side).start
    state().moveOpening(p.hueco, start + before.offset + (before.width - width) / 2)
  }
  if (p.posicion !== undefined) {
    const start = wallLine(modules.find((m) => m.id === before.moduleId)!, before.side).start
    const from = start + p.posicion - width / 2
    state().moveOpening(p.hueco, from)
    // Si ahí no cabe entero (la pared lo arrima a otro sitio) o pisa otro hueco, vuelve a donde estaba.
    if (Math.abs(start + find()!.offset - from) > 0.01) {
      state().moveOpening(p.hueco, start + before.offset + (before.width - width) / 2)
      return { error: 'En esa posición no cabe, o pisa otro hueco; no se ha movido.' } as Fallo
    }
  }
  if (swing) state().setDoor(p.hueco, { swing })
  if (p.cerrada !== undefined) {
    if (!swingDoor(before)) return { error: 'Solo una puerta abatible se ve abierta o cerrada.' } as Fallo
    state().setDoor(p.hueco, { closed: p.cerrada })
  }
  return describeOpening(find()!)
}

/** Quita un hueco, por su id. */
function quitarHueco(p: { hueco: string }) {
  if (!state().openings.some((o) => o.id === p.hueco)) {
    return { error: `No hay ningún hueco "${p.hueco}".` } as Fallo
  }
  state().removeOpening(p.hueco)
  return casa()
}

/** Un mueble tal como se cuenta: su centro, desde la esquina de su estancia. */
function describeFurniture(f: FurnitureItem) {
  const { modules } = state()
  const room = modules.find((m) => m.id === f.roomId)
  return {
    id: f.id,
    codigo: furnitureType(f.typeId)?.code,
    mueble: f.typeId,
    nombre: furnitureName(f),
    ...(room && { estancia: roomName(modules, room.id) }),
    x: roundSize(f.x - (room?.x ?? 0)),
    y: roundSize(f.y - (room?.y ?? 0)),
    // Hacia dónde mira su parte trasera (cabecero, respaldo, fondo del armario).
    espalda: lado(BACKS[f.rotation]),
    // Metros sobre el suelo; 0 si apoya en él.
    altura: liftOf(f),
    // Los colores de sus partes, si las tiene (tapicería, cojines…).
    ...(furnitureType(f.typeId)?.parts && {
      colores: Object.fromEntries(partChoices(f).map((c) => [c.part.id, c.option.id])),
    }),
  }
}

/**
 * El catálogo de muebles, con sus medidas: `fondo` es de la espalda al frente.
 * `colores`: lo que se puede cambiar de color y entre qué opciones (la primera,
 * la de por defecto).
 */
const catalogoMuebles = () =>
  FURNITURE.map((t) => ({
    mueble: t.id,
    codigo: t.code,
    nombre: t.name,
    ancho: t.width,
    fondo: t.depth,
    alto: t.height,
    ...(t.parts && { colores: Object.fromEntries(t.parts.map((p) => [p.id, p.options.map((o) => o.id)])) }),
  }))

/**
 * Pone un mueble del catálogo en una estancia. Con `pared` va de espaldas a la
 * pared de ese lado, a ras, y `posicion` son los metros desde el extremo oeste
 * o norte del lado hasta el centro del mueble (sin ella, centrado). Sin
 * `pared` va suelto: su centro en (`x`, `y`) desde la esquina de la estancia
 * (sin ellos, en el centro de ella) y de espaldas a `espalda` (por defecto, al
 * norte).
 */
function ponerMueble(p: {
  mueble: string
  estancia: string
  pared?: string
  posicion?: number
  x?: number
  y?: number
  espalda?: string
  altura?: number
}) {
  const key = p.mueble.trim().toLowerCase()
  const type = FURNITURE.find((t) => t.id === key || t.name.toLowerCase() === key)
  if (!type) return { error: `No hay ningún mueble "${p.mueble}" en el catálogo.` } as Fallo
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  const side = p.pared === undefined ? undefined : LADOS[p.pared]
  const back = side ?? LADOS[p.espalda ?? 'norte']
  if ((p.pared !== undefined && !side) || !back) return { error: 'Lado desconocido.' } as Fallo

  state().addFurniture(type.id, room.x + room.width / 2, room.y + room.depth / 2)
  const id = state().selectedFurnitureId!
  const find = () => state().furniture.find((f) => f.id === id)!
  while (BACKS[find().rotation] !== back) state().rotateFurniture(id)

  // Las caras interiores de las paredes de la estancia, con el mueble ya girado.
  const box = furnitureBox(find(), state().modules, state().joints)!
  if (box.east - box.west < box.halfX * 2 || box.south - box.north < box.halfY * 2) {
    state().removeFurniture(id)
    return { error: 'Ese mueble no cabe en esa estancia en esa postura.' } as Fallo
  }
  if (side) {
    const horizontal = side === 'n' || side === 's'
    const [low, high, half] = horizontal
      ? [box.west + box.halfX, box.east - box.halfX, box.halfY]
      : [box.north + box.halfY, box.south - box.halfY, box.halfX]
    const wanted =
      p.posicion === undefined ? (low + high) / 2 : wallLine(room, side).start + p.posicion
    const along = Math.min(Math.max(wanted, low), high)
    const across = { n: box.north + half, s: box.south - half, w: box.west + half, e: box.east - half }[side]
    state().placeFurniture(id, horizontal ? along : across, horizontal ? across : along)
  } else if (p.x !== undefined && p.y !== undefined) {
    const [x, y] = [room.x + p.x, room.y + p.y]
    // Un milímetro de holgura, por los decimales.
    if (
      x < box.west + box.halfX - 0.001 ||
      x > box.east - box.halfX + 0.001 ||
      y < box.north + box.halfY - 0.001 ||
      y > box.south - box.halfY + 0.001
    ) {
      state().removeFurniture(id)
      return { error: 'Ahí se sale de la estancia o se mete en una pared.' } as Fallo
    }
    state().placeFurniture(id, x, y)
  }
  if (p.altura !== undefined) {
    const error = elevar(id, p.altura)
    if (error) {
      state().removeFurniture(id)
      return { error } as Fallo
    }
  }
  return describeFurniture(find())
}

/** Pone un mueble a esa altura sobre el suelo; devuelve el motivo si no puede. */
function elevar(id: string, altura: number) {
  const item = state().furniture.find((f) => f.id === id)!
  const type = furnitureType(item.typeId)!
  const max = WALL_HEIGHT - type.height
  if (!(altura >= 0) || altura > max + 0.001) return `La altura tiene que estar entre 0 y ${roundSize(max)} m.`
  state().setFurnitureElevation(id, altura)
  return ''
}

/**
 * Cambia un mueble que ya está puesto: `altura`, metros sobre el suelo (0
 * apoya en él; 0,5 sobre una mesilla), y `colores`, parte → opción (p. ej.
 * `{ 'cojin-izquierdo': 'rojo' }`), solo de lo que dice `catalogoMuebles`.
 */
function cambiarMueble(p: { mueble: string; altura?: number; colores?: Record<string, string> }) {
  const item = state().furniture.find((f) => f.id === p.mueble)
  if (!item) {
    return { error: `No hay ningún mueble "${p.mueble}".` } as Fallo
  }
  const parts = furnitureType(item.typeId)?.parts ?? []
  for (const [part, option] of Object.entries(p.colores ?? {})) {
    const found = parts.find((x) => x.id === part)
    if (!found) {
      const allowed = parts.map((x) => x.id).join(', ')
      return { error: allowed ? `"${part}" no se puede cambiar; sí: ${allowed}.` : 'A este mueble no se le puede cambiar el color.' } as Fallo
    }
    if (!found.options.some((o) => o.id === option)) {
      return { error: `${found.name}: "${option}" no está; sí: ${found.options.map((o) => o.id).join(', ')}.` } as Fallo
    }
  }
  for (const [part, option] of Object.entries(p.colores ?? {})) state().setFurnitureColor(p.mueble, part, option)
  if (p.altura !== undefined) {
    const error = elevar(p.mueble, p.altura)
    if (error) return { error } as Fallo
  }
  return describeFurniture(state().furniture.find((f) => f.id === p.mueble)!)
}

/** Deshace el último cambio del plano (como Ctrl+Z). Las fotos no se deshacen. */
function deshacer() {
  return undo() ? casa() : ({ error: 'No hay nada que deshacer.' } as Fallo)
}

/** Repite lo último que se deshizo (como Ctrl+Y). */
function rehacer() {
  return redo() ? casa() : ({ error: 'No hay nada que rehacer.' } as Fallo)
}

/** Quita un mueble, por su id. */
function quitarMueble(p: { mueble: string }) {
  if (!state().furniture.some((f) => f.id === p.mueble)) {
    return { error: `No hay ningún mueble "${p.mueble}".` } as Fallo
  }
  state().removeFurniture(p.mueble)
  return casa()
}

/** Todos los tableros de la casa, tal como se cuentan. */
function describeBoards() {
  const { modules, joints } = state()
  const walls = deriveWalls(modules, joints)
  return modules.flatMap((room) =>
    (Object.keys(LADOS) as string[]).flatMap((name) => {
      const side = LADOS[name]
      const { left } = wallFace(room, side, walls)
      return (room.boards?.[side] ?? []).map((b) => {
        const centre = b.x + b.width / 2
        const posicion = side === 'n' || side === 'e' ? left + centre : sideLength(room, side) - left - centre
        return {
          id: b.id,
          nombre: pieceName(room, 'board', side, b.id),
          estancia: roomName(modules, room.id),
          lado: name,
          posicion: roundSize(posicion),
          altura: roundSize(b.y),
          ancho: roundSize(b.width),
          alto: roundSize(b.height),
          fondo: roundSize(b.depth),
          acabado: b.finish,
        }
      })
    }),
  )
}

/**
 * Pone un tablero en la cara interior de la pared de ese `lado`. `posicion`:
 * metros desde el extremo oeste (norte y sur) o norte (este y oeste) del lado
 * hasta su **centro**; sin ella, centrado. `altura`: del suelo a su borde
 * **inferior**. `ancho` es a lo largo de la pared, `alto` en vertical y `fondo`
 * lo que sale de ella; el grueso es la menor de las tres (una encimera: 1,65 de
 * ancho, 0,04 de alto y 0,6 de fondo). `acabado`: nombre o id de un material o
 * color, o `#rrggbb`.
 */
function ponerTablero(p: {
  estancia: string
  lado: string
  ancho: number
  alto: number
  fondo: number
  posicion?: number
  altura?: number
  acabado?: string
}) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  const side = LADOS[p.lado]
  if (!side) return { error: 'Lado desconocido.' } as Fallo
  const finish = p.acabado === undefined ? undefined : findFinish(p.acabado)
  if (p.acabado !== undefined && !finish) return { error: `No hay ningún acabado "${p.acabado}".` } as Fallo
  const { modules, joints } = state()
  const { left, length } = wallFace(room, side, deriveWalls(modules, joints))
  const along = p.posicion ?? sideLength(room, side) / 2
  const centre = side === 'n' || side === 'e' ? along - left : sideLength(room, side) - left - along
  const x = roundSize(centre - p.ancho / 2)
  if (x < -1e-6 || x + p.ancho > length + 1e-6) return { error: 'Se sale de la pared por un lado.' } as Fallo

  const id = state().addBoard(room.id, side)
  if (!id) return { error: 'No se ha podido poner el tablero.' } as Fallo
  const problem = state().patchBoard(room.id, side, id, {
    x: Math.max(0, x),
    y: p.altura ?? 0,
    width: p.ancho,
    height: p.alto,
    depth: p.fondo,
    ...(finish && { finish }),
  })
  if (problem) {
    state().removeBoard(room.id, side, id)
    return { error: problem } as Fallo
  }
  return describeBoards().find((b) => b.id === id)!
}

/** Quita un tablero, por su id (los da `casa().tableros`). */
function quitarTablero(p: { tablero: string }) {
  for (const room of state().modules) {
    for (const side of Object.values(LADOS)) {
      if (room.boards?.[side]?.some((b) => b.id === p.tablero)) {
        state().removeBoard(room.id, side, p.tablero)
        return casa()
      }
    }
  }
  return { error: `No hay ningún tablero "${p.tablero}".` } as Fallo
}

/** Todos los interruptores y enchufes de la casa, tal como se cuentan. */
function describeMechanisms() {
  const { modules, joints } = state()
  const walls = deriveWalls(modules, joints)
  return modules.flatMap((room) =>
    (Object.keys(LADOS) as string[]).flatMap((name) =>
      (room.mechanisms?.[LADOS[name]] ?? []).flatMap((m) => {
        const type = mechanismType(m.typeId)
        if (!type) return []
        const side = LADOS[name]
        const { width, height } = mechanismSize(type)
        const { left } = wallFace(room, side, walls)
        // La cara se mide desde su izquierda mirando la pared desde dentro; el lado, desde el oeste o el norte.
        const centre = m.x + width / 2
        const posicion =
          side === 'n' || side === 'e'
            ? left + centre
            : sideLength(room, side) - left - centre
        return [
          {
            id: m.id,
            codigo: type.code,
            tipo: type.id,
            nombre: pieceName(room, 'mechanism', side, m.id),
            estancia: roomName(modules, room.id),
            lado: name,
            posicion: roundSize(posicion),
            // Metros del suelo al centro de la placa.
            altura: roundSize(m.y + height / 2),
          },
        ]
      }),
    ),
  )
}

/** El catálogo de interruptores y enchufes, con la altura a la que se ponen (al centro). */
const catalogoMecanismos = () =>
  MECHANISMS.map((t) => ({
    tipo: t.id,
    codigo: t.code,
    nombre: t.name,
    ancho: mechanismSize(t).width,
    altura: roundSize(t.y + MECHANISM_HEIGHT / 2),
  }))

/**
 * Pone un interruptor o un enchufe del catálogo en la cara interior de la pared
 * de un lado de una estancia. `posicion`: metros desde el extremo oeste (lados
 * norte y sur) o norte (este y oeste) del lado hasta el **centro** de la placa
 * (sin ella, centrado). `altura`: metros del suelo al centro (por defecto, la
 * del catálogo: 1,1 m el interruptor y 0,3 m el enchufe). Solo se ve: no
 * enciende nada. No impide que pise un hueco u otra pieza.
 */
function ponerMecanismo(p: {
  tipo: string
  estancia: string
  lado: string
  posicion?: number
  altura?: number
}) {
  const key = p.tipo.trim().toLowerCase()
  const type = MECHANISMS.find((t) => t.id === key || t.name.toLowerCase() === key)
  if (!type) return { error: `No hay ningún interruptor o enchufe "${p.tipo}" en el catálogo.` } as Fallo
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  const side = LADOS[p.lado]
  if (!side) return { error: 'Lado desconocido.' } as Fallo

  const id = state().addMechanism(room.id, side, type.id)
  if (!id) return { error: 'No cabe en esa pared.' } as Fallo
  if (p.posicion !== undefined || p.altura !== undefined) {
    const { modules, joints } = state()
    const { left } = wallFace(room, side, deriveWalls(modules, joints))
    const { width, height } = mechanismSize(type)
    const patch: { x?: number; y?: number } = {}
    if (p.posicion !== undefined) {
      const centre =
        side === 'n' || side === 'e' ? p.posicion - left : sideLength(room, side) - left - p.posicion
      patch.x = roundSize(centre - width / 2)
    }
    if (p.altura !== undefined) patch.y = roundSize(p.altura - height / 2)
    const error = state().patchMechanism(room.id, side, id, patch)
    if (error) {
      state().removeMechanism(room.id, side, id)
      return { error } as Fallo
    }
  }
  return describeMechanisms().find((m) => m.id === id)!
}

/** Quita un interruptor o enchufe, por su id (los da `casa().mecanismos`). */
function quitarMecanismo(p: { mecanismo: string }) {
  const { modules } = state()
  for (const room of modules) {
    for (const side of Object.values(LADOS)) {
      if (room.mechanisms?.[side]?.some((m) => m.id === p.mecanismo)) {
        state().removeMechanism(room.id, side, p.mecanismo)
        return casa()
      }
    }
  }
  return { error: `No hay ningún interruptor ni enchufe "${p.mecanismo}".` } as Fallo
}

/** Los acabados que hay: materiales (con textura) y colores de la paleta. */
const catalogoAcabados = () => ({
  materiales: MATERIALS.map((m) => ({ acabado: m.id, codigo: m.code, nombre: m.name })),
  colores: WALL_COLORS.map((c) => ({ acabado: c.color, codigo: c.code, nombre: c.name })),
})

/** Un acabado dicho por su nombre, su id o un color `#rrggbb`; undefined si no existe. */
function findFinish(ref: string) {
  const key = ref.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(key)) return key
  return (
    MATERIALS.find((m) => m.id === key || m.name.toLowerCase() === key)?.id ??
    WALL_COLORS.find((c) => c.name.toLowerCase() === key)?.color
  )
}

/**
 * Pone el suelo de una estancia: un material o un color del catálogo (por
 * nombre o id), un color `#rrggbb`, o "sin acabado". Con `girado` se dice si la
 * veta va girada 90°.
 */
function ponerSuelo(p: { estancia: string; acabado: string; girado?: boolean }) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  const none = p.acabado.trim().toLowerCase() === 'sin acabado'
  const finish = none ? BASE_FLOOR.id : findFinish(p.acabado)
  if (!finish) return { error: `No hay ningún acabado "${p.acabado}".` } as Fallo
  state().setFloor(room.id, finish)
  if (p.girado !== undefined && !!room.floorTurned !== p.girado) state().turnFloor(room.id)
  return { estancia: roomName(state().modules, room.id), suelo: none ? 'sin acabado' : finish }
}

/**
 * Pinta por dentro las paredes de una estancia con un color o un material (por
 * nombre o id, o `#rrggbb`). Con `lado`, solo la de ese lado; sin él, todas, y
 * se pierden los colores propios que tuviera alguna.
 */
function pintarParedes(p: { estancia: string; acabado: string; lado?: string }) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  const side = p.lado === undefined ? undefined : LADOS[p.lado]
  if (p.lado !== undefined && !side) return { error: 'Lado desconocido.' } as Fallo
  const finish = findFinish(p.acabado)
  if (!finish) return { error: `No hay ningún acabado "${p.acabado}".` } as Fallo
  state().setWallColor(room.id, finish, side)
  return describeWalls(state().modules.find((m) => m.id === room.id)!)
}

/** El acabado de las cuatro caras interiores de una estancia. */
function describeWalls(m: PlacedModule) {
  const paredes = Object.fromEntries(
    Object.entries(LADOS).map(([name, side]) => [name, interiorFinish(m, side)]),
  )
  return { estancia: roomName(state().modules, m.id), paredes }
}

// Altura de los ojos y distancia a la pared de detrás, en metros.
const EYES = 1.6
const BACK_OFF = 0.5
const ESQUINAS: Record<string, { north: boolean; west: boolean }> = {
  noroeste: { north: true, west: true },
  noreste: { north: true, west: false },
  suroeste: { north: false, west: true },
  sureste: { north: false, west: false },
}

/**
 * Lleva la cámara de la vista 3D a una estancia, de pie y mirando hacia
 * `mirando` (norte, sur, este, oeste) desde la pared de enfrente, centrada.
 * Sin nada, va a donde se sacó la última foto guardada en esa estancia, con su
 * objetivo; si no hay ninguna, mira a lo largo del lado más largo. Con `desde`
 * (noroeste, noreste, suroeste, sureste) se pone en esa esquina y mira en
 * diagonal al centro.
 */
function llevarCamara(p: { estancia: string; mirando?: string; desde?: string }) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  if (p.desde !== undefined) {
    // Desde una esquina, mirando en diagonal al centro de la estancia: la vista que más abarca.
    const corner = ESQUINAS[p.desde]
    if (!corner) return { error: 'Esquina desconocida: noroeste, noreste, suroeste o sureste.' } as Fallo
    const x = corner.west ? room.x + BACK_OFF : room.x + room.width - BACK_OFF
    const y = corner.north ? room.y + BACK_OFF : room.y + room.depth - BACK_OFF
    state().flyCamera({
      position: [x - PLOT.width / 2, EYES, y - PLOT.depth / 2],
      yaw: Math.atan2(x - (room.x + room.width / 2), y - (room.y + room.depth / 2)),
      pitch: 0,
    })
    return { estancia: roomName(state().modules, room.id), desde: p.desde }
  }
  if (p.mirando === undefined) {
    // Sin decir desde dónde, vale la vista de una foto guardada en esa estancia: la más reciente.
    const { photos, goTo } = usePhotos.getState()
    const at = photos.map((f) => photoRoom(f.pose)?.id).lastIndexOf(room.id)
    if (at >= 0) {
      goTo(photos[at].id)
      return { estancia: roomName(state().modules, room.id), foto: at + 1 }
    }
  }
  const side = p.mirando === undefined ? (room.width >= room.depth ? 'e' : 's') : LADOS[p.mirando]
  if (!side) return { error: 'Lado desconocido.' } as Fallo
  // De espaldas a la pared contraria a la que se mira.
  const x = side === 'e' ? room.x + BACK_OFF : side === 'w' ? room.x + room.width - BACK_OFF : room.x + room.width / 2
  const y = side === 's' ? room.y + BACK_OFF : side === 'n' ? room.y + room.depth - BACK_OFF : room.y + room.depth / 2
  state().flyCamera({
    // La escena tiene la parcela centrada en el origen; el giro 0 mira al norte y crece hacia el oeste.
    position: [x - PLOT.width / 2, EYES, y - PLOT.depth / 2],
    yaw: { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 }[side],
    pitch: 0,
  })
  return { estancia: roomName(state().modules, room.id), mirando: lado(side) }
}

/**
 * Empieza una foto en calidad de lo que ve la cámara, con `muestras` (50, 100
 * o 200) si se dicen. Hace falta la vista 3D abierta. Al terminar, la propia
 * página pregunta si se guarda: eso lo decide quien la mira.
 */
function hacerFoto(p: { muestras?: number } = {}) {
  if (!document.querySelector('.view3d-wrap')) {
    return { error: 'La vista 3D no está abierta: hay que pasar a "Vista 3D" o "Plano + 3D".' } as Fallo
  }
  if (p.muestras !== undefined) {
    if (!PHOTO_SAMPLES.includes(p.muestras)) {
      return { error: `Las muestras son ${PHOTO_SAMPLES.join(', ')}.` } as Fallo
    }
    state().setPhotoSamples(p.muestras)
  }
  window.dispatchEvent(new Event(PHOTO_EVENT))
  return { foto: 'empezada', muestras: state().photoSamples }
}

/**
 * Descarga la casa como `.glb` (lo mismo que el botón "Descargar GLB" de la vista
 * 3D) para llevarla a Blender. Hace falta la vista 3D abierta. Con `enviarA`
 * (p. ej. `http://localhost:8765`, el receptor que abre Claude en Blender) no
 * descarga: manda el archivo por POST a esa dirección y espera la respuesta.
 */
function descargarGlb(p: { enviarA?: string } = {}) {
  if (!document.querySelector('.view3d-wrap')) {
    return Promise.resolve({ error: 'La vista 3D no está abierta: hay que pasar a "Vista 3D" o "Plano + 3D".' } as Fallo)
  }
  return new Promise<{ glb: string; kb: number } | Fallo>((resolve) => {
    const detail: GlbRequest = {
      sendTo: p.enviarA,
      done: (r) =>
        resolve(r.ok ? { glb: p.enviarA ? 'enviado' : 'descargado', kb: Math.round(r.bytes / 1024) } : { error: r.error }),
    }
    window.dispatchEvent(new CustomEvent(GLB_EVENT, { detail }))
  })
}

/**
 * Abre el visor con una foto guardada: la de ese número (`foto`, como en
 * `casa().fotos`) o la última de una `estancia`. La cámara va a donde se sacó.
 */
function verFoto(p: { foto?: number; estancia?: string }) {
  const { photos, open } = usePhotos.getState()
  let at = (p.foto ?? 0) - 1
  if (p.foto === undefined) {
    const room = p.estancia === undefined ? undefined : findRoom(p.estancia)
    if (!room) return { error: `No hay ninguna estancia "${p.estancia ?? ''}".` } as Fallo
    at = photos.map((f) => photoRoom(f.pose)?.id).lastIndexOf(room.id)
    if (at < 0) return { error: 'Esa estancia no tiene ninguna foto guardada.' } as Fallo
  }
  if (!photos[at]) return { error: `No hay ninguna foto ${p.foto}.` } as Fallo
  open(photos[at].id)
  return { foto: at + 1, de: photos.length }
}

/**
 * Cambia la imagen de una foto guardada por otra (p. ej. un render de
 * Blender hecho desde su misma cámara). `imagen` es una dirección que la página
 * pueda leer (`data:` o una ruta del propio servidor). Se guarda en JPEG al
 * 92 %, como las demás; la foto conserva número, cámara y objetivo. No se puede
 * deshacer: la imagen anterior se pierde.
 */
async function cambiarImagenFoto(p: { foto: number; imagen: string }) {
  const old = usePhotos.getState().photos[p.foto - 1]
  if (!old) return { error: `No hay ninguna foto ${p.foto}.` } as Fallo
  let file: Blob
  try {
    file = await (await fetch(p.imagen)).blob()
  } catch {
    return { error: 'No se ha podido leer esa imagen.' } as Fallo
  }
  const r = await replaceImage(old.id, file)
  if ('error' in r) return r as Fallo
  return { foto: p.foto, ancho: r.width, alto: r.height, kb: Math.round(r.bytes / 1024) }
}

/**
 * Devuelve la casa como el texto de un archivo de plano (el mismo que "Guardar
 * plano"), para que Claude lo guarde en la carpeta `comercial/`. Sin fotos, que
 * pesan; con `fotos: true`, dentro del texto.
 */
async function bajarCasa(p: { fotos?: boolean } = {}) {
  return serializePlan(state(), p.fotos ? await exportPhotos() : [])
}

/**
 * Sustituye la casa por la de un archivo de plano (su texto). Si no es un plano
 * de este configurador, no toca nada y dice por qué.
 */
async function subirCasa(texto: string) {
  const plan: Plan | null = parsePlan(texto)
  if (!plan) return { error: 'Ese texto no es un plano de este configurador.' } as Fallo
  const photos = await importPhotos(parsePhotos(texto))
  state().loadPlan(plan)
  await usePhotos.getState().replaceAll(photos)
  return casa()
}

const eurocasa = {
  bajarCasa,
  subirCasa,
  verFoto,
  cambiarImagenFoto,
  hacerFoto,
  descargarGlb,
  llevarCamara,
  catalogoAcabados,
  ponerSuelo,
  pintarParedes,
  catalogoMuebles,
  ponerMueble,
  quitarMueble,
  cambiarMueble,
  ponerTablero,
  quitarTablero,
  deshacer,
  rehacer,
  catalogoMecanismos,
  ponerMecanismo,
  quitarMecanismo,
  casa,
  nuevoPlano,
  nombrarCasa,
  medirModulo,
  crearEstancia,
  eliminarEstancia,
  ponerHueco,
  cambiarHueco,
  quitarHueco,
}

declare global {
  interface Window {
    eurocasa: typeof eurocasa
  }
}

window.eurocasa = eurocasa
