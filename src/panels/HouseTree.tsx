import { useMemo, useState } from 'react'
import { PlacedModule, formatMeters } from '../model/house'
import {
  furnitureName,
  lightName,
  roomName,
  shellName,
  wallName,
} from '../model/names'
import { deriveWalls, wallOf } from '../model/walls'
import { usePhotos } from '../photos'
import { useHouse } from '../store'

// Panel izquierdo: la casa como un árbol. Casa → módulos → estancias, y en cada
// estancia una carpeta con sus paredes, otra con su mobiliario y otra con sus luces. Elegir una línea es lo mismo que pinchar la cosa en el
// plano; sus datos salen en el panel derecho. El árbol solo enseña y elige: el
// orden y de quién cuelga cada cosa los manda la casa.

interface RowProps {
  level: number
  label: string
  detail?: string
  active?: boolean
  /** Con hijos: true abierta, false cerrada. Sin hijos, nada. */
  open?: boolean
  onToggle?: () => void
  onPick: () => void
}

function Row({ level, label, detail, active, open, onToggle, onPick }: RowProps) {
  return (
    <div className={active ? 'tree-row active' : 'tree-row'} style={{ paddingLeft: level * 14 }}>
      {open === undefined ? (
        <span className="tree-twist" />
      ) : (
        <button
          className="tree-twist"
          aria-label={open ? 'Plegar' : 'Desplegar'}
          onClick={onToggle}
        >
          {open ? '▾' : '▸'}
        </button>
      )}
      <button className="tree-label" onClick={onPick}>
        {label}
        {detail && <span className="muted"> · {detail}</span>}
      </button>
    </div>
  )
}

export default function HouseTree() {
  const mode = useHouse((s) => s.mode)
  const shells = useHouse((s) => s.shells)
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const openings = useHouse((s) => s.openings)
  const furniture = useHouse((s) => s.furniture)
  const selectedShellId = useHouse((s) => s.selectedShellId)
  const selectedId = useHouse((s) => s.selectedId)
  const selectedWall = useHouse((s) => s.selectedWall)
  const selectedOpeningId = useHouse((s) => s.selectedOpeningId)
  const selectedFurnitureId = useHouse((s) => s.selectedFurnitureId)
  const selectedLightId = useHouse((s) => s.selectedLightId)
  const pick = useHouse((s) => s.pick)
  const photoCount = usePhotos((s) => s.photos.length)
  // Estancias y carpetas abiertas o cerradas a mano; las demás se abren solas si tienen lo elegido.
  const [opened, setOpened] = useState<Record<string, boolean>>({})

  const walls = useMemo(() => deriveWalls(modules, joints), [modules, joints])
  // Un hueco elegido marca su pared.
  const opening = openings.find((o) => o.id === selectedOpeningId)
  const wallKey = selectedWall ?? (opening && wallOf(opening, modules, walls)?.key)

  const roomOf = (f: (typeof furniture)[number]) => modules.find((m) => m.id === f.roomId)
  const loose = furniture.filter((f) => !roomOf(f))
  const furnitureRow = (f: (typeof furniture)[number], level: number) => (
    <Row
      key={f.id}
      level={level}
      label={furnitureName(f)}
      active={f.id === selectedFurnitureId}
      onPick={() => pick('options', { selectedFurnitureId: f.id })}
    />
  )

  const roomRows = (room: PlacedModule, level: number) => {
    const own = walls.filter((w) => w.moduleId === room.id)
    const items = furniture.filter((f) => roomOf(f) === room)
    const holdsWall = own.some((w) => w.key === wallKey)
    const holdsItem = items.some((f) => f.id === selectedFurnitureId)
    const lights = room.lights ?? []
    const holdsLight = lights.some((l) => l.id === selectedLightId)
    const open = opened[room.id] ?? (room.id === selectedId || holdsWall || holdsItem)
    // Una carpeta: su línea, que solo pliega y despliega, y si está abierta lo que tiene.
    const folder = (name: string, count: number, holds: boolean, rows: () => React.ReactNode) => {
      const key = `${room.id}:${name}`
      const shown = opened[key] ?? holds
      const toggle = () => setOpened({ ...opened, [key]: !shown })
      return (
        <>
          <Row
            level={level + 1}
            label={name}
            detail={String(count)}
            open={shown}
            onToggle={toggle}
            onPick={toggle}
          />
          {shown && rows()}
        </>
      )
    }
    return (
      <div key={room.id}>
        <Row
          level={level}
          label={roomName(modules, room.id)}
          detail={`${formatMeters(room.width)} × ${formatMeters(room.depth)} m`}
          active={room.id === selectedId && mode === 'modules' && !holdsLight}
          open={open}
          onToggle={() => setOpened({ ...opened, [room.id]: !open })}
          onPick={() => pick('modules', { selectedId: room.id })}
        />
        {open &&
          folder('Paredes', own.length, holdsWall, () =>
            own.map((w) => {
            // Un lado partido en varios tramos los numera, si no tienen nombre propio.
            const same = own.filter((o) => o.side === w.side)
            const number = same.length > 1 && !w.name ? ` ${same.indexOf(w) + 1}` : ''
            return (
              <Row
                key={w.key}
                level={level + 2}
                label={`${wallName(w)}${number}`}
                detail={w.otherId ? `con la ${roomName(modules, w.otherId)}` : undefined}
                active={w.key === wallKey}
                onPick={() => pick('walls', { selectedWall: w.key })}
              />
            )
            }),
          )}
        {open &&
          folder('Mobiliario', items.length, holdsItem, () =>
            items.map((f) => furnitureRow(f, level + 2)),
          )}
        {open &&
          folder('Luces', lights.length, holdsLight, () =>
            lights.map((l) => (
              <Row
                key={l.id}
                level={level + 2}
                label={lightName(room, l)}
                active={l.id === selectedLightId}
                onPick={() => pick('modules', { selectedId: room.id, selectedLightId: l.id })}
              />
            )),
          )}
      </div>
    )
  }

  const housed = (room: PlacedModule) => shells.some((sh) => sh.id === room.shellId)

  return (
    <nav className="tree" aria-label="La casa">
      <Row
        level={0}
        label="Casa"
        active={mode === 'shells' && !selectedShellId}
        onPick={() => pick('shells')}
      />
      {shells.map((sh) => (
        <div key={sh.id}>
          <Row
            level={1}
            label={shellName(shells, sh)}
            detail={`${formatMeters(sh.width)} × ${formatMeters(sh.depth)} m`}
            active={sh.id === selectedShellId}
            onPick={() => pick('shells', { selectedShellId: sh.id })}
          />
          {modules.filter((m) => m.shellId === sh.id).map((m) => roomRows(m, 2))}
        </div>
      ))}
      {/* Planos antiguos sin módulos, y muebles que no están en ninguna estancia. */}
      {modules.filter((m) => !housed(m)).map((m) => roomRows(m, 1))}
      {loose.map((f) => furnitureRow(f, 1))}
      <Row
        level={0}
        label="Fotos"
        detail={String(photoCount)}
        active={mode === 'photos'}
        onPick={() => pick('photos')}
      />
    </nav>
  )
}
