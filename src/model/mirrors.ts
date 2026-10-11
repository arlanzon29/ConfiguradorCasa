// Un espejo es una pieza fina colgada de la cara de una pared que da a una
// estancia. A diferencia del vinilo, es geometría: tiene grosor. Se guarda y se
// mide igual que él (vinyls.ts): en su estancia, por lado, con `x` desde la
// esquina izquierda de la cara vista desde dentro e `y` desde el suelo, hasta
// su esquina inferior izquierda.

export interface Mirror {
  id: string
  x: number
  y: number
  width: number
  height: number
}

// Grosor de la pieza y medidas con las que se cuelga uno nuevo, en metros. Inventadas.
export const MIRROR_THICKNESS = 0.02
export const DEFAULT_MIRROR = { width: 0.5, height: 1.5, y: 0.3 }
