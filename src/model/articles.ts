// Códigos de artículo de lo que no es catálogo: partidas de la casa que cuestan
// y no se eligen de una lista (el módulo, las paredes, el rodapié...). Lo del
// catálogo lleva su `code` en su propia línea (furniture.ts, openings.ts,
// finishes.ts, vinyls.ts).
//
// Sirven para asociar la casa a una base de costes que vive **fuera de la web**
// (carpeta `comercial/`). La web no sabe de precios, solo de códigos.
//
// Los códigos son provisionales, a falta de los de la empresa: se cambian aquí.

export const ARTICLES = {
  /** Módulo de fábrica (la pieza que sale de fábrica). */
  shell: 'MOD-FABRICA',
  /** Solera de un módulo, por metro cuadrado. */
  slab: 'SOL-BASE',
  /** Terreno de la parcela, por metro cuadrado (el acabado lleva su propio código). */
  ground: 'TER-BASE',
  /** Pared exterior, por metro lineal. */
  wallExterior: 'PAR-EXTERIOR',
  /** Pared compartida entre estancias, por metro lineal. */
  wallShared: 'PAR-COMPARTIDA',
  /** Suelo, por metro cuadrado (el acabado lleva su propio código). */
  floor: 'SUE-BASE',
  /** Techo, por metro cuadrado (el acabado lleva su propio código). */
  ceiling: 'TEC-BASE',
  /** Rodapié, por metro lineal. */
  skirting: 'ROD-BASE',
  /** Foco de techo, por unidad. */
  light: 'ILU-FOCO',
  /** Tablero, por unidad. */
  board: 'PIE-TABLERO',
  /** Espejo, por unidad. */
  mirror: 'PIE-ESPEJO',
  // Los interruptores y enchufes llevan su código en su tipo (mechanisms.ts).
} as const

export type ArticleKey = keyof typeof ARTICLES
