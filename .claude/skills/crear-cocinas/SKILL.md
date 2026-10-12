---
name: crear-cocinas
description: Montar o cambiar la cocina de una casa en el Configurador EuroCasa (electrodomésticos, armarios, encimera, fregadero, vitrocerámica, tapas de madera) con las funciones de window.eurocasa, paso a paso con el usuario. Úsala cuando pidan preparar, ampliar o cambiar una cocina, o poner un electrodoméstico, una encimera o un fregadero. Complementa a crear-casas.
---

# Crear cocinas en el Configurador EuroCasa

Esta skill es de **cocinas**. Para lo demás (dónde se trabaja, módulos,
estancias, puertas, ventanas, cámara, fotos, cómo hablar con el comercial) lee
antes **`crear-casas`**: las funciones son las mismas (`window.eurocasa`).

Se ha ido construyendo **paso a paso con el usuario**: cada vez que él decide
algo (una medida, un orden, una altura), se apunta aquí como regla, con el
porqué. Si cambias o añades una función en `src/api.ts` que toque cocinas,
actualiza este documento en el mismo cambio.

## Cómo hemos trabajado (y cómo seguir)

Así fue la sesión que dio forma a esta skill. Repítela:

1. **Un paso cada vez, a su ritmo.** El usuario dicta la cocina pieza a pieza
   ("ponemos el frigorífico pequeño", "ahora la encimera"). No montes más de lo
   que pide ni añadas piezas por tu cuenta.
2. **Lo dice en frases muy cortas** ("el armario va al otro lado", "la tapa al
   otro lado", "que quede encima del tablón"). Hazlo con la lectura más
   probable, di **cómo lo has entendido** y qué otra lectura había. Si hay
   varias con consecuencias distintas (pasó con "la tapa"), **pregunta con
   opciones numeradas** antes de tocar nada.
3. **Rehacer sin miedo.** Quitar y volver a poner una pieza es barato
   (`quitarMueble`, `quitarTablero`, y `deshacer()` por si te equivocas).
   Cuando una medida cambia (un "pequeño" resultó ser estrecho), se rehace la
   hilera entera encadenando de nuevo.
4. **Enséñalo siempre.** Tras cada paso, `llevarCamara` y una captura de la
   vista 3D: `mirando: 'norte'` para ver la hilera de frente, `desde: 'suroeste'`
   para ver el costado. La cámara vuela más de un segundo: espera unos 3 s
   antes de capturar. Lo que sale rojo, rosa o naranja es la **selección** (lo
   último que has puesto), no el color de la pieza.
5. **Entorno de pruebas, no su casa.** Se trabaja en otro puerto y otra casa
   (la 5185); su plano en vivo no se toca. El resultado se guarda aparte.
6. **Anota y sube cada paso**: esta skill, el registro de `docs/PROYECTO.md` y
   commit con push, en el mismo turno.
7. **Si el usuario "no ve" algo**, casi siempre es una versión vieja del
   navegador (recargar con Ctrl+F5 y mirar el commit de la línea de versión)
   o que la pieza queda detrás, tapada, en la cámara en que mira.

## Las piezas (familia **Cocina** del catálogo)

Medidas en metros, ancho × fondo × alto. Los códigos son provisionales.
`catalogoMuebles()` es la fuente: si discrepa con esta tabla, manda él.

| Pieza (`mueble`) | Medidas | Notas |
|---|---|---|
| `lavavajillas` | 0,6 × 0,6 × 0,82 | |
| `lavavajillas-pequeno` | 0,45 × 0,6 × 0,8 | Estrecho: 45 de ancho y 60 de fondo (usuario; antes estaba al revés) |
| `lavadora` | 0,6 × 0,6 × 0,82 | Ojo de buey redondo |
| `lavadora-pequena` | 0,45 × 0,6 × 0,8 | Igual: 45 de ancho y 60 de fondo |
| `horno` | 0,6 × 0,6 × 0,82 | Con las medidas del lavavajillas (usuario) |
| `frigorifico` | 0,6 × 0,6 × 2,1 | Congelador pequeño **arriba**, frío abajo (usuario); asas separadas; bisagras a la izquierda (supuesto) |
| `frigorifico-pequeno` | 0,6 × 0,6 × 1,8 | Igual |
| `armario-cocina` | 0,45 × 0,6 × 0,8 | Dos puertas. 80 de alto como los pequeños, para una encimera a ras (usuario) |
| `mesa-armarios` | 1,2 × 0,6 × 0,8 | Mesa de trabajo con **una sola puerta al medio**, dos paños fijos y el tirador horizontal (usuario). **Es el "armario desayunador"** (usuario: "esa mesa con armarios"); si le piden otro nombre o más alto, se cambia en el catálogo |
| `fregadero` | 0,4 × 0,45 | **Una sola pila, sin profundidad**: se apoya sobre la encimera (el usuario descartó el agujero) |
| `vitroceramica` | 0,5 × 0,5 × 0,02 | 4 fuegos, fina y negra (usuario). Lleva su altura propia (0,9 m): ponle la de la encimera |

En el catálogo hay más muebles (mesas, sofás, camas…): son de otras familias.

## Reglas de la cocina

Las decididas por el usuario van marcadas **(usuario)**; las demás son
provisionales, puestas por Claude hasta que él las confirme.

**Medidas y orden**
- **"Pequeño" es estrecho, no poco profundo** (usuario): 45 de ancho y **60 de
  fondo**. El fondo de toda la hilera es 0,6, así los frentes van a ras.
- **Las piezas de debajo de una encimera miden lo mismo** (usuario): los
  pequeños y el armario de cocina, **0,80**. Con los normales (0,82) no
  encajan: no los mezcles bajo la misma encimera.
- **El frigorífico, en el extremo de la hilera y en la esquina**, no entre
  medias (usuario, lo primero que se puso; además no tapa encimera ni ventana).
- **Orden de la hilera de prueba, de izquierda a derecha**: armario,
  lavavajillas pequeño, lavadora pequeña, frigorífico pequeño (usuario: el
  armario "al otro lado", en el extremo opuesto al frigorífico).
- **Las piezas de suelo van a ras, una al lado de otra**, de espaldas a la
  pared, encadenadas desde el frigorífico.

**Encimera y lo que lleva encima**
- **Encimera = un tablero** (usuario), no una pieza de catálogo: fina, de
  **0,02 de grueso** (usuario: "es menos gruesa"), **0,6 de fondo**, de
  `gris-perla` (la textura de granito que pasó el usuario), con su borde
  inferior a **0,80** y la cara de arriba a **0,82**.
- **La encimera va del borde del armario al frigorífico**, por encima de las
  tres piezas de debajo. (En la prueba llegó a cubrir una tapa lateral, que el
  usuario quitó; la encimera se recortó entonces de 1,36 a **1,35 m** para
  que quede a ras del armario por la izquierda y del frigorífico por la derecha.)
- **Fregadero y vitro, encima de la encimera** a `altura` 0,82, **separados de
  la pared y centrados en su fondo** (usuario; `y` la del centro de la
  encimera, 0,45 en la prueba). El fregadero **sobre el armario**; la vitro a
  su derecha **con 10 cm de aire** (usuario: "al lado pero no pegado").
  Descartado por el usuario: pegarlos entre sí y centrar el conjunto a lo
  ancho de la encimera.
- **La vitro, sobre el lavavajillas o un armario**, no sobre una lavadora, si
  hay otra opción (provisional: en la realidad va sobre el horno).

**Tapas de madera**
- **Tapa lateral: probada y quitada por el usuario.** Era un tablón de `pino`
  **de canto**, 0,02 × 0,80 × 0,6 m, a la izquierda del armario. Si vuelve a
  pedirla, se hace con `ponerTablero` de canto (`ancho: 0.02`, `alto: 0.8`,
  `fondo: 0.6`, `altura: 0`); no la pongas por tu cuenta.
- **No se puede tapar un frente con una lámina**: un tablero siempre cuelga de
  la pared. Un "tablón que tapa el armario" sale como un **bloque macizo** que
  esconde las puertas; el usuario lo descartó.

**Desayunador en L** (usuario: "se pone formando una L")
- El armario desayunador (`mesa-armarios`) **va perpendicular a la hilera, en
  el extremo del armario, formando una L**: pegado al lado del armario y
  saliendo de la pared hacia el interior de la estancia, con su lado largo (1,2)
  en el eje norte-sur. La prueba: `x` el borde izquierdo del armario menos 0,3,
  `y` la del armario más 0,3, **`espalda: 'este'`**. Con eso la **puerta y su
  tirador miran hacia fuera de la L**, hacia el salón (el usuario: "el tirador
  está mal, hay que ponerlo en la otra puerta… solo hay una puerta": quería la
  puerta en la otra cara, no dos puertas). Primero estuvo con `espalda: 'oeste'`,
  hacia el lado de trabajo, y se giró 180°.
- Su tablero queda a 0,80 y la encimera a 0,82: 2 cm de escalón. No se ha
  tocado.

**Ventana**
- **Sobre la encimera** (provisional): `altura` 1,1 m y `alto` 1,0 m.

## Receta: la cocina de prueba, de principio a fin

Pared norte, desde el frigorífico (en la esquina este) hacia el oeste. La
posición de `ponerMueble` con `pared` es en metros desde el extremo oeste del
lado hasta el **centro** de la pieza; con una de más, se arrima a la esquina.

```js
const e = window.eurocasa, estancia = 'Salón'
// Suelo, de derecha (frigorífico) a izquierda (armario), a ras y sin huecos.
const fr = e.ponerMueble({ mueble: 'frigorifico-pequeno',  estancia, pared: 'norte', posicion: 99 })
const la = e.ponerMueble({ mueble: 'lavadora-pequena',     estancia, pared: 'norte', posicion: fr.x - 0.3 - 0.225 })
const lv = e.ponerMueble({ mueble: 'lavavajillas-pequeno', estancia, pared: 'norte', posicion: la.x - 0.45 })
const ar = e.ponerMueble({ mueble: 'armario-cocina',       estancia, pared: 'norte', posicion: lv.x - 0.45 })

// Encimera: del borde del armario al frigorífico, encima de todo.
const izq = ar.x - 0.225, der = fr.x - 0.3
e.ponerTablero({ estancia, lado: 'norte', ancho: der - izq, alto: 0.02, fondo: 0.6,
                 posicion: (izq + der) / 2, altura: 0.8, acabado: 'gris-perla' })

// Encima: separados de la pared (misma y que los de abajo, el centro del fondo).
e.ponerMueble({ mueble: 'fregadero',     estancia, x: ar.x,        y: ar.y, espalda: 'norte', altura: 0.82 })
e.ponerMueble({ mueble: 'vitroceramica', estancia, x: ar.x + 0.55, y: ar.y, espalda: 'norte', altura: 0.82 })
```

(0,55 = media pila 0,2 + 10 cm de aire + media vitro 0,25.) Los anchos salen del
catálogo: si cambian, léelos de `catalogoMuebles()` en vez de escribirlos.

## Trampas que ya nos hemos encontrado

- **`posicion` va redondeada al centímetro** y `ponerTablero` la devuelve así:
  **no la reutilices** al recolocar (una encimera quedó 2 cm a la derecha y se
  metía en el frigorífico). Recalcula el centro con los bordes de los muebles.
- **Izquierda y derecha** de una cara de pared son mirándola desde dentro. En
  la pared norte la izquierda es el oeste. `x` e `y` de `ponerMueble` suelto
  son el **centro** desde la esquina de la estancia, y la `y` del fondo crece
  hacia el sur.
- **Un bloque o tablero con las mismas caras que el mueble de debajo
  parpadea** (caras coplanares): hazlo 1 cm más profundo si hace falta.
- **El plano 2D dibuja la puerta abierta** aunque la hayas cerrado con
  `cerrada: true`; en 3D sí sale cerrada.
- **Si algo "parece mayor"** (el armario de 82 frente a los pequeños de 80),
  cuenta los centímetros antes de nada: el usuario mira bien.

## Límites de hoy

- No hay agujero en los tableros: el fregadero se apoya encima, sin profundidad.
- Las piezas **no chocan**: comprueba tú que no se pisan y que cabe el fondo.
- La altura de un mueble la pone quien coloca; si mueves el de debajo, el de
  encima no lo sigue.
- Las puertas de los frigoríficos abren a la izquierda siempre (no se elige).
- Un tablero no se arrastra en el plano; se coloca con las funciones o con las
  casillas de Propiedades.

## Pendiente

- Los frentes de los electrodomésticos: el usuario quería taparlos con un
  tablón y no se resolvió; falta decidir si hace falta otra pieza (un frente
  fino delante) o si basta con las tapas laterales.
- La ventana, algo a la izquierda del centro del conjunto fregadero + vitro.
- Voladizo y barra a más altura del desayunador, taburetes, y la unión con la
  encimera (escalón de 2 cm), el horno en la hilera.
- Guardar la cocina de prueba como casa en `comercial/`.
- Los códigos de artículo y el criterio de diseño de EuroCasa, que sustituyan a
  los provisionales.
