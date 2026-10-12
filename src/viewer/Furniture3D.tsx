import { FurnitureItem, FurnitureType, furnitureType } from '../model/furniture'

const WOOD = '#b08d62'
const FABRIC = '#8fa3b0'
const LINEN = '#f4f1ea'
const WHITE = '#ecebe6'

interface Box {
  /** Centro de la caja. El mueble tiene su centro en x/z = 0 y apoya en y = 0. */
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

/** Cajas que componen un mueble; su parte trasera queda hacia -z. */
function boxes({ shape, width: w, depth: d, height: h }: FurnitureType): Box[] {
  const leg = 0.05
  const legs = (top: number, color: string): Box[] =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => ({
        position: [sx * (w / 2 - leg), top / 2, sz * (d / 2 - leg)] as [number, number, number],
        size: [leg, top, leg] as [number, number, number],
        color,
      })),
    )

  switch (shape) {
    case 'table': {
      const top = 0.04
      return [{ position: [0, h - top / 2, 0], size: [w, top, d], color: WOOD }, ...legs(h - top, WOOD)]
    }
    case 'chair': {
      const seat = 0.45
      return [
        { position: [0, seat - 0.02, 0], size: [w, 0.04, d], color: WOOD },
        { position: [0, (seat + h) / 2, -d / 2 + 0.02], size: [w, h - seat, 0.04], color: WOOD },
        ...legs(seat - 0.04, WOOD),
      ]
    }
    case 'bed': {
      const base = h * 0.55
      const head = 0.06
      return [
        { position: [0, base / 2, 0], size: [w, base, d], color: WOOD },
        { position: [0, base + (h - base) / 2, head / 2], size: [w - 0.06, h - base, d - head - 0.04], color: LINEN },
        { position: [0, 0.5, -d / 2 + head / 2], size: [w, 1, head], color: WOOD },
        { position: [0, h + 0.05, -d / 2 + head + 0.25], size: [w - 0.3, 0.1, 0.4], color: WHITE },
      ]
    }
    case 'sofa': {
      const seat = 0.42
      const arm = 0.15
      const back = 0.2
      return [
        { position: [0, seat / 2, back / 2], size: [w - 2 * arm, seat, d - back], color: FABRIC },
        { position: [0, h / 2, -d / 2 + back / 2], size: [w, h, back], color: FABRIC },
        { position: [-w / 2 + arm / 2, 0.3, back / 2], size: [arm, 0.6, d - back], color: FABRIC },
        { position: [w / 2 - arm / 2, 0.3, back / 2], size: [arm, 0.6, d - back], color: FABRIC },
      ]
    }
    case 'appliance': {
      // Electrodoméstico de encastre: cuerpo blanco con el frente (+z) algo más oscuro y un tirador.
      const front = 0.02
      return [
        { position: [0, h / 2, -front / 2], size: [w, h, d - front], color: WHITE },
        { position: [0, h / 2, d / 2 - front / 2], size: [w - 0.02, h - 0.02, front], color: '#c9ccd0' },
        { position: [0, h - 0.1, d / 2 + 0.01], size: [w * 0.6, 0.025, 0.02], color: '#8a8d92' },
      ]
    }
    case 'tv': {
      // Pantalla fina sobre un pie corto; la pantalla mira hacia delante (+z).
      const base = 0.04
      const screen = 0.04
      return [
        { position: [0, base / 2, 0], size: [w * 0.4, base, d], color: '#2b2b2e' },
        { position: [0, (base + h) / 2, -d / 2 + screen / 2 + 0.05], size: [w, h - base, screen], color: '#17171a' },
      ]
    }
    case 'wardrobe': {
      const gap = 0.01
      return [
        { position: [0, h / 2, -gap], size: [w, h, d - 2 * gap], color: WHITE },
        // Dos puertas ligeramente separadas, para que se lea como armario.
        { position: [-w / 4, h / 2, d / 2 - gap], size: [w / 2 - gap, h - 0.04, 2 * gap], color: WOOD },
        { position: [w / 4, h / 2, d / 2 - gap], size: [w / 2 - gap, h - 0.04, 2 * gap], color: WOOD },
      ]
    }
  }
}

interface Props {
  item: FurnitureItem
  /** Altura del suelo sobre el que apoya. */
  floorY: number
  selected: boolean
}

export default function Furniture3D({ item, floorY, selected }: Props) {
  const type = furnitureType(item.typeId)
  if (!type) return null
  return (
    // En el plano el giro es horario con y hacia abajo; en 3D eso es un giro negativo sobre y.
    <group position={[item.x, floorY, item.y]} rotation-y={(-item.rotation * Math.PI) / 180}>
      {boxes(type).map((box, i) => (
        <mesh key={i} position={box.position} castShadow receiveShadow>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color={box.color} emissive={selected ? '#d9480f' : '#000000'} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  )
}
