# Configurador EuroCasa

Web para configurar casas prefabricadas: el cliente define la casa en un plano 2D,
la ve en 3D y elige acabados y mobiliario. Se construye **poco a poco**, función a
función, a petición del usuario (que escribe en español).

Estado: prototipo funcional sin backend. Todo vive en el navegador.

## Cómo arrancar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build
```

- Vista 3D sola (para otra ventana): `http://localhost:5173/?vista=3d`
- Comprobación mínima tras cualquier cambio: `npx tsc --noEmit`. No hay tests ni linter.
- Node del equipo: 20.11.1. Por eso **Vite 6** y `@vitejs/plugin-react` 4: Vite 7
  y 8 y el plugin 5 y 6 exigen Node 20.19 o 22.12. Para subirlos hay que
  actualizar Node antes.
- Repositorio **git** desde el 2026-10-10, rama `main`. Remoto `origin`:
  `https://github.com/arlanzon29/ConfiguradorCasa`, que es **público** (el usuario
  lo sabe; las fotos de `fotos/` son públicas). Fuera de git: `node_modules`, `dist` y
  `.claude/settings.local.json`.
- El disco `D:` no guarda dueños de carpeta y git exige autorizarla una vez:
  `git config --global --add safe.directory D:/IA/ConfiguradorEuroCasa`.

## Stack

React 19 + TypeScript 7 + Vite 6. Estado con **zustand** 5 (`persist` en `localStorage`).
3D con **three.js** 0.186 vía `@react-three/fiber` v9, y foto en calidad con
`three-gpu-pathtracer` 0.0.27. El plano 2D es **SVG** puro, con el `viewBox` en metros.

## Conceptos del dominio (lo más importante)

Tres niveles, de fuera a dentro:

1. **Módulo de fábrica** (`Shell`): la pieza que sale de fábrica y fija el contorno
   de la casa. **Máximo 13 × 4,20 m** en cualquiera de las dos orientaciones, y
   **hasta 2** por casa, unidos por un lado, en línea o en L. Dato real del usuario.
2. **Estancia** (`PlacedModule`, en el código "module" por razones históricas): un
   rectángulo dentro de un módulo. No puede salirse de su módulo ni solaparse con otra.
3. **Paredes**: **no se guardan, se deducen** de los bordes de las estancias
   (`deriveWalls` en `walls.ts`). Cada lado de una estancia se parte en tramos:
   - *exterior*: no toca a otra estancia. Usa grosor/estado del lado de su estancia.
   - *compartido*: toca a otra estancia y es **una sola pared de las dos**, centrada
     en la línea de unión. Sus ajustes van por pareja de estancias (`joints`).

Ojo con los nombres: en la interfaz "Módulos" = `shells`; "Estancias" = `modules`.

Otros elementos:

- **Huecos** (`Opening`, puertas y ventanas): anclados a un lado de una estancia
  (`moduleId`, `side`, `offset`). En qué pared caen se deduce; uno puesto en una
  pared compartida da paso entre las dos estancias. Al cambiar las estancias se
  reencajan (`refitOpenings`) y el que ya no cabe se pierde.
- **Carpintería** de los huecos: no se guarda, se deduce de cada hueco y su pared
  (`joineryParts` en `viewer/joinery.ts`). Puerta abatible (hasta 1,2 m de ancho,
  `swingDoor`): cerco, tapajuntas por las dos caras, hoja y manilla. Ventana:
  cerco y hojas acristaladas (una por cada 0,7 m de ancho). Corredera: cerco y
  dos hojas de cristal solapadas. De cada puerta abatible se guarda en el hueco
  hacia dónde abre (`swing`: `in` hacia su estancia, `out` al otro lado), en qué
  canto gira (`hinge`: `start` el extremo oeste o norte, `end` el otro) y si se ve
  cerrada en 3D (`closed`; si no, abierta a 90° como en el plano). Cerco y hojas
  llevan el **acabado** del hueco (`Opening.finish`, por defecto blanco).
- **Acabado** (`Finish` en `finishes.ts`): un solo concepto, un texto que es un
  color liso (`#rrggbb`) o el `id` de un material del catálogo (`MATERIALS`, los
  acabados con textura). `resolveFinish` da su color y su textura; `FinishPicker`
  (`FinishesPanel.tsx`) lo elige: materiales arriba, colores debajo. Hoy lo usa
  la carpintería. Suelos y paredes guardan ya valores compatibles (el suelo el
  `id` de su material, la pared su color) pero siguen con sus selectores de antes.
- **Acabados**: suelo por estancia (catálogo con textura) y color de pared por
  estancia o por lado (`wallColor`, `sideColors`). Solo se ven en 3D.
- **Vinilo** (`Vinyl` en `vinyls.ts`): una imagen con fondo transparente pegada
  a la cara de una pared que da a una estancia. Es **superficie, no geometría**
  (distinción del usuario: un espejo sí es geometría): no tiene grosor. Se guarda
  en su estancia por lado (`PlacedModule.vinyls`), varios por pared, con `x`
  (desde la esquina izquierda de la cara, mirándola desde dentro), `y` (desde el
  suelo), ancho, alto y giro (`rotation`, grados en sentido horario alrededor de
  su centro). **Colocarlo bien es cosa del usuario** (lo dijo él): no se impide
  que pise un hueco u otro vinilo, y así vale también para un efecto sobre una
  ventana. Las imágenes salen de un catálogo (`VINYLS`); el cliente
  no sube las suyas, de momento. Solo se ve en 3D y en la foto.
- **Espejo** (`Mirror` en `mirrors.ts`): una pieza fina colgada de la cara de
  una pared que da a una estancia. Es **geometría** (2 cm de grueso), no como el
  vinilo, pero se guarda y se coloca igual: en su estancia por lado
  (`PlacedModule.mirrors`), con `x`, `y`, ancho y alto, sin giro, y sin impedir
  que pise un hueco, un vinilo u otro espejo. En 3D son **dos piezas**
  (distinción del usuario): el **cuerpo**, una caja oscura a la que más adelante
  se le podrá añadir un marco, y la **superficie reflectante**, un plano aparte
  sobre su cara de delante (`mirrorParts` y `MirrorPiece` en `View3D.tsx`). El
  reflejo de verdad solo sale en la foto en calidad; en la vista normal la
  superficie es un panel claro. De momento es una **prueba**.
- **Rodapié** (`Skirting`): alto y color **por pared**, guardados donde el grosor:
  por lado de estancia en las exteriores (`PlacedModule.skirting`) y por pareja en
  las compartidas (`joints`). Por defecto 7 cm y blanco; alto 0 = sin rodapié. La
  tira no se guarda: se deduce de las paredes (`skirtingParts` en `View3D.tsx`).
  Solo se ve en 3D y en la foto.
- **Mobiliario** (`FurnitureItem`): piezas de catálogo por familias, con centro y
  giro en pasos de 90°. Parte trasera hacia el norte con giro 0.

Unidades: todo en **metros**. Plano: x hacia la derecha, y hacia abajo; "norte" es
arriba. En 3D el plano (x, y) pasa a (x, z) con la parcela centrada en el origen.

## Estructura

```
src/
  main.tsx, App.tsx, App.css     arranque, pestañas de modo, selector de vista
  store.ts                       estado global y TODAS las acciones (zustand)
  photos.ts                      fotos en calidad guardadas (IndexedDB) y su estado
  model/                         lógica pura, sin React
    house.ts        parcela, rejilla, estancias, módulos de fábrica, encaje
    walls.ts        paredes deducidas, encaje de huecos en paredes
    openings.ts     tipos y catálogo de puertas/ventanas
    finishes.ts     catálogo de suelos, colores de pared
    vinyls.ts       vinilos: catálogo y dónde cae cada uno en su pared
    mirrors.ts      espejos: la pieza y sus medidas por defecto
    furniture.ts    catálogo de mobiliario por familias
    planFile.ts     formato del archivo de plano (guardar/cargar)
  editor/
    Editor2D.tsx    plano SVG: dibujo y todos los arrastres
    SizeForm.tsx    formulario de dos medidas reutilizable
  panels/           un panel izquierdo por modo + PropertiesPanel (el derecho)
                    + PlanFileButtons + PhotoViewer
  viewer/
    View3D.tsx      escena 3D, cámara en primera persona, paredes y suelos
    joinery.ts      carpintería de puertas y ventanas, como cajas
    Furniture3D.tsx muebles como composición de cajas
    PhotoTracer.tsx foto en calidad por trazado de rayos
    denoise.ts      filtro de ruido de la foto, guiado por la geometría
public/texturas/suelos/          imágenes de suelo
public/texturas/vinilos/         dibujos de los vinilos (SVG con fondo transparente)
planos/                          planos guardados a mano (copias de seguridad)
fotos/                           fotos de referencia que pasa el usuario (exteriores e interiores)
```

## Constantes clave (`model/house.ts`)

| Constante | Valor | Nota |
|---|---|---|
| `PLOT` | 28 × 20 m | Caben dos módulos en línea (26 m) y en L (17,2 m) |
| `GRID` | 0,2 m | Rejilla visible y paso de arrastre. 13 × 4,2 = 65 × 21 cuadros |
| `SHELL_MAX_LONG/SHORT`, `MAX_SHELLS` | 13 / 4,2 / 2 | Límite de fabricación |
| `WALL_HEIGHT` | 2,7 m | Inventado; pendiente de confirmar |
| `DEFAULT_WALL_THICKNESS` | 0,15 m | Exterior. Compartida: 0,10 m (`walls.ts`) |
| `MIN_SIZE` | 1 m | Lado mínimo de estancia o módulo |
| `DEFAULT_SKIRTING_HEIGHT/COLOR`, `MAX_SKIRTING_HEIGHT` | 0,07 m / blanco / 0,30 m | Rodapié. Sobresale 1,2 cm (`SKIRTING_DEPTH` en `View3D.tsx`) |

Huecos y muebles se ajustan a 5 cm, más fino que la rejilla.

## Interfaz

**Modos** (pestañas del panel izquierdo; el modo decide qué se selecciona en el plano
y qué muestra el panel). `Mode` en `store.ts`:

| Modo | Pestaña | Qué se hace |
|---|---|---|
| `shells` | Módulos | Añadir (horizontal/vertical), mover, redimensionar, girar, eliminar módulos de fábrica. Se ve toda la parcela |
| `modules` | Estancias | Añadir, mover, estirar (8 tiradores), girar, eliminar estancias |
| `walls` | Paredes | Seleccionar pared: grosor, rodapié (alto y color) y quitar/poner. Colocar, deslizar, centrar y redimensionar puertas y ventanas; distancia al extremo de la pared y altura de la ventana |
| `finishes` | Acabados | Clic en el centro de una estancia: suelo y color de todas sus paredes. Clic junto a un lado: color de esa pared y sus vinilos (pegar del catálogo, y casillas con barra deslizante para la distancia a la izquierda y al suelo, ancho, alto y giro; "Mantener la proporción" y "Eliminar"), y debajo sus espejos ("Añadir espejo" y las mismas casillas, sin giro) |
| `options` | Opciones | Mobiliario por familias (Salón, Comedor, Dormitorio): colocar, mover, girar, pegar a pared. Icono de imán para activar o no el imantado a paredes |
| `photos` | Fotos | Fotos en calidad guardadas: miniaturas, Anterior/Siguiente (la cámara va a donde se sacó cada una, con su objetivo), pinchar para verla grande, descargar, repetir (la saca otra vez desde el mismo sitio y sustituye a la anterior) y eliminar. En el plano, un icono numerado por foto donde se sacó; pincharlo lleva la cámara allí |

Fuera del modo `shells`, el plano hace zoom para encuadrar los módulos.

**Dos paneles.** El izquierdo tiene lo que se **añade** en cada modo (catálogos y
herramientas). El derecho, **Propiedades** (`PropertiesPanel.tsx`), los datos de lo
seleccionado en casillas que se escriben a mano, más sus botones (girar, eliminar,
centrar, pegar a la pared). Cada casilla se aplica sola con Intro o al salir de
ella; `Esc` la deja como estaba; lo que no cabe se rechaza con un aviso debajo.

| Seleccionado | Casillas |
|---|---|
| Módulo | distancia al borde izquierdo y superior de la parcela; ancho y fondo |
| Estancia | distancia al borde izquierdo y superior de su módulo (de la parcela si no hay módulos); ancho y fondo |
| Pared | grosor (cm); alto del rodapié (cm) y su color |
| Puerta o ventana | distancia a cada extremo de su pared; ancho y alto; altura desde el suelo (ventanas). En puertas abatibles, botones "Abrir hacia el otro lado", "Girar desde el otro canto" y "Cerrar / Abrir la puerta en 3D". Debajo, el acabado de su carpintería (material o color) y "Aplicar a todas las puertas y ventanas" |
| Mueble | distancia de cada borde del mueble a las cuatro paredes de su estancia (a los bordes de la parcela si está fuera) |

El derecho solo existe en los modos Módulos, Estancias, Paredes y Opciones
(`PROPERTY_HINTS`). Los dos se **pliegan** con el botón `‹` / `›` de su cabecera y
queda una tira de 32 px para volver a sacarlos; se recuerda en `localStorage`
(clave `eurocasa-paneles`).

**Vistas** (botones sobre el lienzo): Plano 2D, Vista 3D, Plano + 3D (lado a lado),
y "3D en otra ventana". En el plano, un marcador naranja muestra la cámara 3D y se
puede arrastrar (posición) y orientar (tirador del cono).

**Vista 3D**: cámara en primera persona. Arrastrar el ratón gira la vista; WASD y la
rueda desplazan. "Bajar a pie" fija la altura de ojos (1,6 m) y movimiento horizontal.
Sin techo (lo pidió el usuario). Las paredes no proyectan sombra; los muebles sí.
No hay colisiones: se atraviesan paredes. Arriba a la izquierda de la vista:
- **Foto en calidad**: imagen por trazado de rayos de lo que ve la cámara, con
  techo y luz de techo solo durante la foto. Aviso "Generando la foto…" hasta la
  primera muestra, contador hasta 200, "Guardar foto" (la manda a Fotos y vuelve a
  la vista normal) y "Volver". Al llegar a 200 **pregunta "¿Guardar la foto?"**
  en un recuadro abajo, con "Guardar en Fotos" y "No guardar" (vuelve a la vista
  normal sin guardarla); si se mueve la cámara, la foto empieza otra vez y la
  pregunta se quita. Al repetir una foto no pregunta: sustituye sola.
- **Muestras**: 50, 100 o 200 (`PHOTO_SAMPLES` y `photoSamples` en `store.ts`),
  botones junto al objetivo; donde arriba dice 200 es el número elegido. Se
  guarda en `localStorage` y se sincroniza entre ventanas. Se puede cambiar a
  mitad de foto: si se sube, sigue trazando.
- **Filtro de ruido**: con la foto terminada, el recuadro de guardar trae
  "Sin filtro / Con filtro". Primero se traza, luego se filtra, y se ve el
  cambio al momento; **se guarda solo la que se esté viendo** (decisión del
  usuario). Cada foto nueva empieza sin filtro.
- **Objetivo** (campo de visión): Normal 45°, Angular 60°, Gran angular 75°
  (`LENSES` y `cameraFov` en `store.ts`). Vale para la vista y para la foto, se
  guarda en `localStorage` y se sincroniza entre ventanas. Las estancias son
  pequeñas y con el normal solo se ve una esquina.

**Arriba del panel**: Nuevo plano (crea un módulo vacío de 13 × 4,2 en (0, 0) y abre
el modo Módulos), Guardar plano y Cargar plano (archivo `.json`).

Teclas: `R` gira lo seleccionado, `Supr` lo borra, `Esc` cancela la herramienta.

## Decisiones de diseño que hay que respetar

- **Las paredes son de la casa, no de cada estancia.** No volver a paredes dobles
  entre estancias. Selección por `Wall.key` (`ext:<id>:<lado>:<n>` o `joint:<a>|<b>`).
- **Los huecos se reencajan desde una copia durante el arrastre** (`dragOpenings`,
  `beginDrag`/`endDrag`), para que pasar junto a otra estancia no los destruya.
- **Imanes**: estancias y módulos se imantan a bordes de módulos y de otras
  estancias (`snapEdge`/`snapSpan` en `Editor2D`); los muebles, a la cara interior
  de las paredes de su estancia (`magnetize` en `store.ts`). El de los muebles se
  apaga con el icono de imán del panel Opciones (`furnitureMagnet`, se guarda en
  `localStorage`, no en el archivo de plano); "Pegar a la pared" funciona igual.
- **El panel derecho no aparece y desaparece con la selección**: está siempre en
  sus modos, aunque vacío. Si saliera al hacer clic, el plano cambiaría de tamaño a
  mitad de un arrastre.
- **Las medidas escritas a mano no pasan por el imán** (`placeFurniture`, frente a
  `moveFurniture` que sí): si no, escribir 0,10 m a una pared lo pegaría a 0. Los
  límites de un mueble los da `furnitureBox` (`store.ts`): caras interiores de las
  paredes de su estancia.
- **Giro = 90° horario**, y arrastra todo lo que cuelga: lados (`n→e→s→w→n`),
  huecos (`rotateOpening`), colores, muebles. `rotateShell` gira el módulo con sus
  estancias; cuatro giros devuelven el estado inicial.
- **Confirmaciones dentro de la página**, nunca `window.confirm`/`alert`: el
  navegador integrado de la app de escritorio los bloquea y el botón "no hace nada".
- **Sincronización entre ventanas** por el evento `storage` de `localStorage`
  (final de `store.ts`). Solo mismo navegador y mismo equipo. La cámara se guarda
  al soltar ratón/tecla, no por fotograma; `View3D` se suscribe a cambios externos.
- **Planos antiguos sin módulos** (`shells: []`) siguen funcionando sin límite: la
  restricción solo aplica si hay algún módulo. El formato de archivo tolera que
  falten `shells` y `furniture`.
- **Fotos** (`photos.ts`): se guardan en **IndexedDB** (base `eurocasa`, almacén
  `photos`), no en `localStorage`, que es pequeño y lo comparte el plano. Cada foto
  lleva la imagen (JPEG al 92 %, unos 300 KB; en PNG pesaban 2 MB), la pose de la
  cámara, el objetivo y el tamaño. Son **de la casa**: "Guardar plano" las mete
  dentro del `.json` como `data:` URL (campo `photos`), "Cargar plano" y "Nuevo
  plano" sustituyen las que hubiera. Las ventanas se avisan por `BroadcastChannel`.
  El visor (`PhotoViewer`) cuelga de `App` y se maneja con flechas y `Esc`.
- **Repetir una foto** (`retake`, `retakeId` y `replace` en `photos.ts`): el panel
  solo marca qué foto se repite; quien la traza es `View3D`, que al ver
  `retakeId` entra en modo foto, guarda sola al llegar a 200 muestras y llama a
  `replace`. La foto conserva `id` y `takenAt` (que da el orden y el número) y
  apunta la fecha nueva en `retakenAt`, que es la que se enseña. Si solo está el
  plano a la vista, `App` pasa a Plano + 3D; volver a Plano 2D, ir a otra foto o
  "Cancelar" la cancelan y la foto anterior queda como estaba. Se guarda la pose
  real de la cámara: si el usuario la mueve a mitad, la foto queda reencuadrada.
  La vista 3D enseña además su propio botón **"Repetir foto N"** cuando la cámara
  está en el sitio y con el objetivo de una foto guardada (`hereIndex` en
  `View3D.tsx`, comparando poses con tolerancia): así sale también en la ventana
  `?vista=3d`, que no tiene panel pero recibe la pose al pasar a la foto en la otra.
- **Filtro de ruido de la foto** (`PhotoDenoiser` en `viewer/denoise.ts`): no
  emborrona la imagen, trabaja sobre la luz. Divide la foto trazada entre el
  color propio de cada superficie (la escena dibujada sin luz), suaviza lo que
  queda solo entre puntos de la misma superficie (misma orientación y mismo
  plano, sacados de otra pasada de la escena) y con luz parecida, y vuelve a
  multiplicar por el color: por eso no toca las vetas ni las sombras. Se
  calcula **al doble de resolución** y se reduce al final; a la de la foto los
  bordes salían en escalera. Lo translúcido (cristales) se esconde al dibujar
  las guías. Lo aplica `PhotoTracer` sobre la foto terminada; la foto guarda
  `filtered` y al repetirla se le vuelve a aplicar.
- **Vuelo de la cámara** (`flyCamera` en `store.ts`): al pasar a una foto la cámara
  no salta, se mueve desde donde está. Se anima `cameraPose` en el propio estado,
  no en la vista 3D, para que también se mueva el marcador del plano y las demás
  ventanas. Durante el vuelo sí se escribe por fotograma. Cualquier
  `setCameraPose` (o ratón, rueda y WASD en la vista 3D) lo corta; con la pestaña
  oculta va directa. El objetivo cambia de golpe al empezar.
- **Texturas a escala real**: cada suelo declara los metros que cubre su imagen
  (`size`); la repetición se calcula por estancia.

## Cómo ampliar catálogos

- **Vinilo**: imagen con fondo transparente (SVG con `width` y `height`, o PNG)
  en `public/texturas/vinilos/` + una línea en `VINYLS` (`vinyls.ts`) con las
  medidas en metros con las que se coloca.
- **Suelo**: imagen repetible (~1024 px) en `public/texturas/suelos/` + una línea en
  `FLOORS` (`finishes.ts`) con `name`, `color`, `texture`, `size` en metros.
- **Color de pared**: una línea en `WALL_COLORS`.
- **Puerta/ventana**: una línea en `OPENING_CATALOG` (`openings.ts`).
- **Mueble**: una línea en `FURNITURE` (`furniture.ts`) con su `family` y `shape`.
  Una forma nueva necesita su caso en `boxes()` de `Furniture3D.tsx` y, si acaso,
  en `FurnitureSymbol` de `Editor2D.tsx`.
- **Familia**: una entrada en `FAMILIES`; la pestaña aparece sola.

## Valores inventados, pendientes de datos reales de EuroCasa

Medidas de puertas y ventanas y de su carpintería (cerco de 3 cm, tapajuntas de
7 cm, hoja de 4 cm, perfiles de ventana de 5 cm; constantes de `joinery.ts`), alféizar (0,9 m), altura de pared, grosores, alto
(7 cm) y saliente (1,2 cm) del rodapié, catálogo
de estancias (3×3, 3×6, 3×9), colores de pared, medidas y formas de los muebles, y
que la textura "Madera de pino" cubre 2 × 2 m (supuesto, sin confirmar).

## Limitaciones conocidas

- Donde se tocan **dos módulos de fábrica** se dibuja una pared compartida única; en
  la realidad hay dos (una por módulo). El usuario confirmó el 2026-10-11 que
  deben ser dos; sin hacer.
- Los tramos exteriores de un mismo lado comparten grosor, estado y rodapié.
- Rodapié: en una pared compartida es el mismo en las dos caras. No rodea los
  cantos de las puertas ni se corta detrás de los muebles. Probado en el servidor
  aparte en la vista 3D normal (por defecto, y cambiando alto y color de una
  pared); sin probar a la vista el corte en una puerta, una pared compartida, el
  giro ni la foto en calidad.
- Espejos: son una prueba. El **filtro de ruido emborrona lo reflejado**: trata
  el espejo como una superficie lisa y suaviza la imagen que hay dentro (sin
  filtro el reflejo sale nítido, con su grano). Sin decidir qué hacer. Medidas
  inventadas (2 cm de grueso; 0,5 × 1,5 m a 0,3 m del suelo al colgarlo). Sin
  marco. Al encoger la estancia no se reencajan, como los vinilos. En el plano
  son una raya azul, sin arrastre. Probado en el servidor aparte: añadirlo desde
  el panel, la vista normal y una foto a 50 muestras con y sin filtro, en una
  pared compartida. Sin probar: las casillas, eliminar, el giro de estancia o
  módulo, dos espejos enfrentados, ni guardar y cargar un plano con espejos.
- Vinilos en la foto: la lámina toma el color de pared de su estancia; si un
  tramo de esa cara tuviera otro grosor, la lámina va a la profundidad del
  centro de su recuadro. Su imagen pasa por la textura de 1024 px del trazador:
  en una lámina muy ancha el dibujo pierde nitidez.
- Vinilos: los seis del catálogo son dibujos de prueba hechos aquí, a falta de
  los de EuroCasa. Un hueco no los recorta y pueden pisarse entre sí: es a
  propósito. Los límites de posición y medida son los del vinilo sin girar, así
  que girado puede asomar por el borde de la pared. Al encoger la
  estancia no se reencajan: el que deja de caber sigue ahí, salido de su pared.
  En una pared con tramos de distinto grosor, los límites son los de la cara más
  metida. En el plano son solo una raya morada, sin arrastre: se colocan con las
  casillas. Sin probar el giro de estancia o de módulo con vinilos.
- Acabados: el concepto único (color o material) solo está puesto en la
  carpintería. El suelo no admite todavía un color liso y las paredes no admiten
  material: sus caras van coloreadas por vértice (`WallBox`) y una textura pide
  rehacer esa malla. En la carpintería el acabado es uno por hueco (cerco y hojas
  iguales, las dos caras iguales); la manilla y el cristal son fijos. El único
  material del catálogo es "Madera de pino". Probado a la vista en el servidor
  aparte con clics simulados (material, color y "aplicar a todas"); sin probar en
  la foto en calidad.
- Carpintería: la puerta abierta no choca con nada (muebles,
  otra puerta, la pared de al lado). La corredera no elige hacia dónde desliza y
  las ventanas no eligen hojas ni sentido de apertura, ni llevan persiana ni
  vierteaguas. El plano 2D no dibuja el cerco. Probado a la vista en el servidor
  aparte (plano, vista 3D y los dos botones de apertura); sin probar la foto en
  calidad ni el giro de estancia o módulo con puertas. El botón "Cerrar / Abrir
  la puerta en 3D" está probado con un clic simulado (cambia el dato y el rótulo)
  y la puerta cerrada se vio en 3D puesta en los datos.
- Muebles: sin colisiones entre sí ni con huecos; no siguen a la estancia al
  redimensionarla o girarla sola (sí al mover la estancia o girar/mover el módulo).
- Un módulo sin estancias no se ve en 3D (suelo y paredes salen de las estancias).
- Fachada sin configurar (color fijo): dependerá del aislante y el revestimiento.
- "Guardar/Cargar plano" no se ha probado pulsando los botones (sí el formato,
  también con fotos dentro).
- Fotos: sin probar pulsando "Descargar" ni "Eliminar" con su confirmación. La
  primera foto en un equipo tarda alrededor de un minuto en arrancar. Cargar un
  plano sin fotos vacía la galería.
- Repetir una foto: sale con el tamaño que tenga la vista 3D en ese momento, no
  con el de la original; para que salga igual hay que repetirla desde la misma
  vista (p. ej. la ventana de "3D en otra ventana") con el botón "Repetir foto N"
  de la propia vista. No pide confirmación (se puede cancelar mientras traza).
  El "Repetir" del panel Fotos usa la vista 3D de su misma ventana. Probado en un servidor aparte con una casa de dos estancias
  (sustituye, conserva sitio, pose y objetivo; cancelar no toca la foto); allí la
  pestaña no dibujaba sola y hubo que forzar los fotogramas, y al volver a montar
  la vista 3D el trazador tardó otra vez cerca de un minuto en arrancar.
- Filtro de ruido: probado en el servidor aparte en una sola escena (una
  estancia con sofá, mesa, ventanas y vinilos), a 50 y a 200 muestras, guardando
  y repitiendo una foto filtrada. Sin probar con brillos, con el sol dando de
  lleno en el suelo, en una pantalla de mucha resolución (por encima de 2048 px
  de lado el cálculo ya no va al doble) ni en una gráfica con poca memoria:
  usa unos 200 MB mientras dura la foto. Lo que se ve tras un cristal se filtra
  como si el cristal no estuviera. La foto original no se conserva al guardar
  la filtrada. Una foto repetida sale con las muestras elegidas en ese momento,
  no con las que tuvo.
- El cono de la cámara en el plano 2D no cambia con el objetivo elegido.
- Panel Propiedades: probado en el servidor aparte con eventos simulados (la
  pestaña estaba oculta), no con ratón y teclado reales, y sin captura de cómo
  queda a la vista. Mover una estancia escribiendo la medida reencaja los huecos
  sin copia de arrastre: el que deja de caber se pierde. Las distancias de un hueco
  son al extremo del tramo de pared (la línea del borde de la estancia), no a la
  cara interior de la pared perpendicular. El giro de un mueble se ve pero no se
  escribe. En Acabados y Fotos no hay panel derecho.

## Pendiente / ideas habladas con el usuario

Los temas que el usuario pide apuntar para más adelante van en `docs/PENDIENTES.md`
(ruido de la foto, iluminación, paisajes, techo, piezas de pared, muebles de
medida variable, exterior…).

- **Tabiques dentro de una estancia** (p. ej. para un armario empotrado). El usuario
  lo ve necesario; no está empezado.
- **Módulos, contestado por el usuario (2026-10-11), sin llevar al código:**
  13 × 4,20 son medidas **exteriores**; puede haber módulos **menores**; pueden
  ser **más de dos** (hoy `MAX_SHELLS` = 2); puede haber módulos **sin
  estancias**, por ejemplo un porche (hoy un módulo vacío no se ve en 3D); y en
  la unión de dos módulos van **dos paredes**, una por módulo (hoy se dibuja una
  compartida). Sigue sin contestar la altura máxima por transporte.
- **Destino visual**: una foto de referencia de cocina fotorrealista. Se habló de un
  camino (techo e iluminación, materiales con relieve, marcos y rodapiés, modelos
  GLB reales, cocina como conjunto, etiquetas sobre el 3D) y de alternativas fuera
  del tiempo real (render bajo demanda, motor de juego). **Nada decidido ni
  empezado**: el usuario paró el paso del techo para hablarlo antes.
- **Foto en calidad bajo demanda**: **aceptada por el usuario** (2026-10-10), ya no
  es una prueba. Botón "Foto en calidad" sobre la vista 3D: trazado
  de rayos en la GPU con `three-gpu-pathtracer` 0.0.23 sobre la misma escena
  (`viewer/PhotoTracer.tsx`), 200 muestras, se reinicia al mover la cámara, y
  "Guardar foto" la manda a la pestaña Fotos. Mientras dura la foto se añaden un techo y un
  panel de luz de 0,6 m por estancia (provisionales, en `View3D.tsx`) y un cielo
  en degradado. Resultado de la prueba en `docs/pruebas/`. Lo aprendido:
  - Empezó con la 0.0.23 (la última que admitía three 0.169). Desde el 2026-10-10
    va con la **0.0.27**, que exige three ≥ 0.185 y three-mesh-bvh ≥ 0.9.15.
  - Con la 0.0.23 **no admitía mallas con varios materiales** (descolocaba los de
    toda la escena) y al mezclar mallas esperaba el atributo `color` con 4
    componentes. Por eso las paredes llevan el color de cada cara en los vértices
    (`WallBox`). Con la 0.0.27 no se ha vuelto a probar lo contrario: se mantiene.
  - El `dispose()` de la 0.0.23 lanzaba una excepción; sigue envuelto en `try`.
  - La primera foto en un equipo tarda alrededor de un minuto en arrancar
    (compilación del sombreador). Con la 0.0.23 la página se quedaba parada unos
    40 s; con la 0.0.27, en la prueba, no hubo parón. Las siguientes, menos de
    un segundo.
  - Pendiente de hablar: luces como elemento que coloca el usuario, exterior tras
    las ventanas (ahora solo cielo), reducción de ruido, y qué hacer en móviles.
- Posibles: colisiones a pie, hojas y marcos de puerta, precio por m², más familias
  de mobiliario (cocina, baño), acabados por familia de mueble.

## Registro de cambios

Se anota aquí cada cosa que se hace, la más reciente arriba.

- **2026-10-11** · **Prueba de espejos** (tema 6 de pendientes; el usuario pidió
  probar con una caja alargada y fina colocada en una pared, como un acabado, y
  precisó que la superficie reflectante debe ser otra cosa que la geometría,
  por si luego lleva marco). Nuevo `model/mirrors.ts`, campo `mirrors` en
  `PlacedModule` (gira con la estancia y el módulo), `addMirror`, `patchMirror`
  y `removeMirror` en `store.ts`, `MirrorsSection.tsx` bajo los vinilos en
  Acabados (`Slide` se exporta de `VinylsSection.tsx`), `mirrorParts` y
  `MirrorPiece` en `View3D.tsx` (cuerpo y superficie como dos mallas) y una raya
  por espejo en el plano. `vinylPlacement` acepta ya cualquier pieza con `x` y
  `width`. El archivo de plano no cambia de versión. Resultado: con la librería
  actual el trazador **refleja bien** sin más trabajo (el usuario lo ve bien);
  el **filtro de ruido emborrona el reflejo**.

- **2026-10-11** · El usuario prueba el **filtro de ruido** de la foto y lo da por
  bueno (tema 1 de pendientes): hecho.

- **2026-10-11** · **Filtro de ruido y número de muestras** en la foto en calidad
  (tema 1 de pendientes; lo pidió el usuario tras ver la prueba: primero la
  foto, luego el filtro, elegir, y quedarse con una sola; y muestras a elegir
  entre 50, 100 y 200). `viewer/denoise.ts` pasa a la aplicación con los bordes
  corregidos (cálculo al doble de resolución); `goal` y `filter` en
  `PhotoTracer`; "Sin filtro / Con filtro" en el recuadro de guardar y botones
  de muestras en `View3D.tsx`; `PHOTO_SAMPLES` y `photoSamples` en `store.ts`
  (la constante deja de estar en `PhotoTracer.tsx`); `filtered` en `Shot`. El
  archivo de plano no cambia de versión. Probado en el servidor aparte: a 50
  muestras con filtro la pared queda tan lisa como a 200 (grano 0,18 frente a
  7,4 sin filtro) en la cuarta parte de tiempo. Imágenes en
  `docs/pruebas/ruido/` (`comparacion-filtro-corregido.jpg`).

- **2026-10-11** · **Prueba del ruido de la foto** (tema 1 de pendientes; la pidió
  el usuario). Cuatro versiones de la misma vista en `docs/pruebas/ruido/`, con
  el código del filtro probado (`denoise.ts`) al lado; la aplicación no cambia.
  El filtro guiado por la geometría quita el grano y respeta las vetas, pero
  deja los bordes en escalera; agrandar la luz del techo no mejora nada.
  Detalle en `docs/PENDIENTES.md`. La casa del servidor de pruebas (5183) tiene
  ahora sofá, mesa, mesilla, una corredera, una ventana y una puerta más.

- **2026-10-11** · El usuario da por bueno el tema de los **vinilos** (tema 5 de
  pendientes): hecho.

- **2026-10-11** · Vinilos en la **foto en calidad**: el usuario veía un recuadro
  más claro alrededor de cada uno. El trazador no ilumina igual la pared vista a
  través de la parte transparente de un plano. Ahora, solo durante la foto, los
  vinilos de cada cara de pared se pintan en **una lámina opaca** del color de
  la pared (`vinylSheets` en `vinyls.ts`, `VinylSheetPlane` en `View3D.tsx`),
  transparente únicamente donde la pared tiene un hueco, y a 0,5 mm de la pared
  (`SHEET_GAP`): a 3 mm salía una línea oscura en dos bordes. La vista normal
  sigue con un plano translúcido por vinilo. Probado en el servidor aparte con
  vinilos en tres paredes, uno girado y uno sobre una ventana.

- **2026-10-11** · Vinilos: **giro** y **barras deslizantes** (lo pidió el
  usuario). Campo `rotation` en `Vinyl`; en `VinylsSection.tsx`, `Slide` (casilla
  más barra) para posición, medidas y giro, y la casilla "Mantener la proporción"
  en lugar del botón "Proporción original". Probado en el servidor aparte: girar
  30° y cambiar el ancho con la barra, con el alto siguiéndolo.

- **2026-10-11** · **Vinilos** en las paredes (tema 5 de pendientes; el usuario
  pidió probar con uno infantil, definido por x, y, ancho y alto, en Acabados y
  solo de catálogo). Nuevo `model/vinyls.ts` (`Vinyl`, `VINYLS`, `wallFace`,
  `vinylPlacement`, `vinylProblem`), campo `vinyls` en `PlacedModule` (gira con
  la estancia y el módulo), `addVinyl`, `patchVinyl` y `removeVinyl` en
  `store.ts`, `VinylsSection.tsx` dentro del panel Acabados, `vinylParts` y
  `VinylPlane` en `View3D.tsx`, y una raya por vinilo en el plano. Seis dibujos
  de prueba en `public/texturas/vinilos/`. `Field` y `Fields` salen de
  `PropertiesPanel.tsx` a `panels/Field.tsx` para usarlos en los dos paneles. El
  archivo de plano no cambia de versión. En la foto en calidad el vinilo va
  recortado (`alphaTest`) y no translúcido: con `transparent` el trazador dejaba
  un recuadro más oscuro en la pared. Probado en el servidor aparte: vista 3D,
  pegar uno desde el panel, mover con la casilla, rechazo de una medida que se
  sale, y la foto en calidad.

- **2026-10-11** · Repaso de los temas pendientes con el usuario. Contestó las
  dudas de los módulos (medidas exteriores, puede haber menores y más de dos,
  módulos sin estancias como un porche, y dos paredes en la unión): anotado en
  "Pendiente", sin tocar código. Siguiente tema a hablar: las piezas de pared.

- **2026-10-10** · La foto en calidad **pregunta si se guarda** al terminar (lo
  pidió el usuario): recuadro `.photo-ask` en `View3D.tsx` con "Guardar en Fotos"
  y "No guardar". Probado en el servidor aparte: sale al llegar a 200 muestras y
  "Guardar en Fotos" la guarda y vuelve a la vista normal; "No guardar" sin
  pulsar. De paso, primera foto trazada con carpintería (una puerta con textura)
  sin errores, aunque sin ver la imagen: la captura de la pestaña no respondió.

- **2026-10-10** · **Acabado de puertas y ventanas**: color o material, como un
  mismo concepto (lo pidió el usuario así, y que salga debajo en Propiedades).
  `Finish`, `MATERIALS`, `resolveFinish` y `DEFAULT_JOINERY_FINISH` en
  `finishes.ts`; campo `finish` en `Opening`; `setOpeningFinish` en `store.ts`
  (con `null`, a todos los huecos); `FinishPicker` en `FinishesPanel.tsx`, puesto
  al final de `OpeningProperties` con el botón "Aplicar a todas las puertas y
  ventanas" (añadido mío); `JoineryBox` y `TexturedBox` en `View3D.tsx`, con la
  textura a escala real y la veta a lo largo de las piezas altas. Suelos y
  paredes no se han tocado: queda por decidir con el usuario si pasan al mismo
  selector.

- **2026-10-10** · **Puertas y ventanas con carpintería** (tema 16 de pendientes;
  el usuario pidió la puerta y la jamba, y elegir hacia qué lado abre y desde qué
  punto gira). Nuevo `viewer/joinery.ts` (`joineryParts`): cerco, tapajuntas, hoja
  y manilla en las puertas; cerco y hojas con cristal en ventanas y correderas.
  El cristal sale de ahí y ya no de `wallParts`. En `openings.ts`, campos `swing`,
  `hinge` y `closed`, `swingDoor`, `swingSign` y `MAX_SWING_DOOR` (antes en
  `Editor2D.tsx`); `rotateOpening` cambia el canto al girar. `setDoor` en
  `store.ts`, tres botones en `OpeningProperties`, y el símbolo del plano se
  voltea según apertura y canto. El archivo de plano no cambia de versión: las
  puertas anteriores abren como se dibujaban (hacia su estancia, bisagras al
  inicio). Añadido yo, sin pedirlo: poder ver la puerta cerrada en 3D.

- **2026-10-10** · Anotado en `docs/PENDIENTES.md` el tema 16: puertas y ventanas.
  Estaba solo a medias (las ventanas dentro del tema 14 y una línea de "posibles").
  El usuario lo concretó: faltan la hoja y la jamba, y poder elegir hacia qué lado
  abre cada puerta y desde qué canto gira.

- **2026-10-10** · Botón **"Repetir foto N"** en la propia vista 3D, junto a
  "Foto en calidad", cuando la cámara está donde se sacó una foto. Lo pidió el
  usuario para repetirla desde la ventana `?vista=3d` y que salga con el mismo
  tamaño. Probado en el servidor aparte en esa ventana: sustituyó la foto y
  salió a 1280 × 720, el tamaño de la ventana.

- **2026-10-10** · **Repetir una foto** (tema 15 de pendientes). Botón "Repetir"
  en la foto seleccionada del panel Fotos: la cámara vuela a su sitio con su
  objetivo, la vista 3D la traza hasta 200 muestras y sustituye a la anterior,
  que conserva su número. El usuario eligió sustituir y foto a foto. `retake`,
  `cancelRetake`, `replace` y `retakenAt` en `photos.ts`; arranque y guardado
  automáticos en `View3D.tsx`; `App.tsx` abre Plano + 3D si hace falta. Nueva
  entrada `pruebas2` (puerto 5184) en `.claude/launch.json`, porque el 5183 lo
  tenía ocupado otra conversación.

- **2026-10-10** · **Rodapié** configurable por pared (tema 14 de pendientes; lo
  pidió el usuario así: por pared, en centímetros y con color, por defecto 7 y
  blanco). `Skirting` y `skirtingOf` en `house.ts`, campo `skirting` en
  `PlacedModule`, `JointSettings` y `Wall`; `setWallSkirting` en `store.ts` (por
  `patchWall`, y gira con la estancia y el módulo); `skirtingParts` y sus mallas
  en `View3D.tsx`; casilla y colores en `WallProperties` (`ColorPicker` se
  exporta de `FinishesPanel.tsx`). El archivo de plano no cambia de versión: los
  planos anteriores salen con el rodapié por defecto.

- **2026-10-10** · Los dos paneles laterales se pueden **plegar** (botón `‹` / `›`
  en la cabecera; `togglePanel` y `readHiddenPanels` en `App.tsx`, estilos
  `.panel-head`, `.panel-toggle`, `.sidebar.collapsed`). Las columnas de `.app` las
  pone ahora `App.tsx` en línea. Lo pidió el usuario.
- **2026-10-10** · Nuevo **panel derecho Propiedades** (`PropertiesPanel.tsx`): el
  usuario quiere ver los números y poder cambiarlos. Posición y medidas de módulo,
  estancia, pared, hueco y mueble en casillas editables (`Field`). En `store.ts`,
  `placeFurniture` (colocar sin imán) y `furnitureBox` (límites de un mueble). Los
  apartados "Selección" de los paneles izquierdos (Módulos, Estancias, Paredes,
  Opciones) se han quitado: todo eso está ahora a la derecha.
- **2026-10-10** · Anotado en `docs/PENDIENTES.md` el tema 15: poder repetir una foto.

- **2026-10-10** · Versiones, paso 4: TypeScript 5.9 → 7.0.2. Solo afecta a la
  comprobación de tipos, que pasa sin cambios, igual que la compilación. Queda sin
  actualizar únicamente Vite (6 → 8) y su plugin de React (4 → 6), por Node.
- **2026-10-10** · Versiones, paso 3: zustand 4 → 5.0.15 y Vite 5 → 6.4.4 (la
  más nueva que admite Node 20.11.1; `npm audit` queda en 0 avisos). Sin tocar
  código. Probado: carga del plano guardado, las seis pestañas, guardado en
  `localStorage`, relectura al escribir otra ventana, imán, Fotos, vista 3D y foto.
- **2026-10-10** · Versiones, paso 2: React 18 → 19.3 y `@react-three/fiber` 8 →
  9.8 (la 9 exige React 19), con sus tipos. Sin tocar código. npm 10.4 no resolvía
  el cambio sobre la instalación anterior: hubo que borrar `node_modules` y
  `package-lock.json` y reinstalar. Probado en el servidor aparte: las seis
  pestañas, mover y girar un mueble, vista 3D, foto y guardado, panel y visor de
  Fotos. Sin probar: arrastres con el ratón (la pestaña de pruebas estaba oculta).
- **2026-10-10** · Versiones, paso 1 (lo que más pedía el usuario): three.js
  0.169 → 0.186.1, `three-gpu-pathtracer` 0.0.23 → 0.0.27, `three-mesh-bvh` →
  0.9.16, `@react-three/fiber` 8.17 → 8.18, y fuera `@react-three/drei`, que no se
  usaba. Sin tocar código. Probado en el servidor aparte: vista normal, dos fotos
  (una viendo otra estancia por la puerta), guardar foto, vuelta a la vista
  normal, pestaña Fotos y compilación.
- **2026-10-10** · El proyecto pasa a ser un repositorio git (rama `main`) con un
  primer commit de todo lo que había, subido al GitHub del usuario (`origin`,
  público). Desde ahora, commit y push después de cada cambio.
- **2026-10-10** · Carpeta `fotos/` con tres fotos de referencia de exteriores que
  pasó el usuario (casa de teja y fachada roja; casa más sencilla, blanca; y la
  "Gran Villa" con porche de madera, que le parece espectacular) y una de
  interior (dormitorio pequeño con literas en L y armario a medida).
- **2026-10-10** · Nuevo `docs/PENDIENTES.md` con los temas que el usuario pide
  solo anotar. Empezó con tres (ruido de la foto, iluminación, paisajes tras las
  ventanas) y va por once: techo, vinilos, espejos, interruptores, ornamentación,
  armarios y encimera variables, y definir el exterior.
- **2026-10-10** · Iconos de las fotos en el plano 2D, solo en el modo Fotos: un
  círculo azul numerado por foto, donde se sacó, con una punta hacia donde miraba;
  naranja el de la foto actual. Pincharlo lleva la cámara a esa foto (`.photo-marker`
  en `Editor2D.tsx`). El usuario los echaba en falta.
- **2026-10-10** · Al pasar a una foto la cámara **vuela** desde donde está (1,2 s,
  giro por el camino corto) en vez de saltar: `flyCamera` en `store.ts`, que anima
  `cameraPose` y se corta en cuanto el usuario mueve la cámara
  (`stopCameraFlight`). Y al pulsar "Guardar foto" la vista **vuelve sola al modo
  normal**, con un aviso de 4 s "Foto guardada en Fotos"; antes seguía trazando.
- **2026-10-10** · Nueva pestaña **Fotos**. "Guardar foto" ya no descarga: guarda
  la foto en IndexedDB con posición, giro y objetivo de la cámara (`photos.ts`).
  Panel `PhotosPanel` (miniaturas, Anterior/Siguiente, ver, descargar, eliminar con
  confirmación) y visor `PhotoViewer`. Las fotos van dentro del `.json` del plano
  (`PlanPhoto`, `parsePhotos` en `planFile.ts`); cargar o empezar plano las
  sustituye. Formato de imagen: JPEG en vez de PNG.
- **2026-10-10** · La foto en calidad deja de ser una prueba (lo dijo el usuario):
  el botón pasa a llamarse "Foto en calidad".
- **2026-10-10** · Selector de objetivo en la vista 3D con tres posiciones: Normal
  45°, Angular 60°, Gran angular 75° (`LENSES`, `cameraFov` en `store.ts`; botones
  `.lens-toggle` en `View3D.tsx`). La foto se reinicia al cambiarlo.
- **2026-10-10** · Aviso "Generando la foto…" centrado sobre la vista 3D desde que
  se pulsa el botón hasta la primera muestra; luego se quita y queda el contador
  (`waiting` en `View3D.tsx`, estilo `.photo-wait`). Lo pidió el usuario porque el
  arranque tarda.
- **2026-10-10** · Prueba de foto en calidad: instalado `three-gpu-pathtracer`
  0.0.23 (y `xatlas-web`, que exige como dependencia), nuevo `PhotoTracer.tsx`,
  botón y techo/luz provisionales en `View3D.tsx`, estilos `.view3d-wrap` /
  `.photo-bar`. Las paredes pasan de seis materiales a colores por vértice
  (`WallBox`); en la vista normal se ven igual. Imágenes en `docs/pruebas/`.
- **2026-10-10** · Mirada la compatibilidad de `three-gpu-pathtracer` para la foto
  en calidad (solo requisitos de npm; nada instalado). Resultado en "Pendiente".
- **2026-10-10** · Marcador de la cámara en el plano 2D a la mitad de tamaño
  (`scale(0.5)` en `CameraMarker`, `Editor2D.tsx`). Al usuario le parecía muy grande.
- **2026-10-10** · Icono de imán en el panel Opciones para activar o no el imantado
  de los muebles a las paredes (`furnitureMagnet` en `store.ts`, botón en
  `OptionsPanel.tsx`, estilos `.section-head` / `.icon-toggle` en `App.css`).
- **2026-10-10** · Entrada `pruebas` en `.claude/launch.json`: servidor en el puerto
  5183, otro origen y por tanto otro `localStorage`, para verificar sin tocar el
  plano del usuario.

## Forma de trabajar con el usuario

- **Anotar según se hace.** Cada cambio se apunta en el "Registro de cambios" de
  este documento en el mismo turno, sin esperar a que lo pida.
- **Commit y push después de cada cambio** (orden del usuario, 2026-10-10), sin
  preguntar cada vez. Mensajes en español.

- **No programar sin una orden clara.** Si comenta u opina ("yo creo que…", "vamos a
  hablar", "vamos a estudiar"), se conversa y se espera. Con la orden dada, avanzar.
- **No hacer pruebas que cambien su plano.** Trabaja en vivo en el navegador
  integrado sobre `localhost:5173`, cuyo `localStorage` (clave `eurocasa-house`)
  comparten todas las pestañas. Verificar con `tsc`, lecturas y capturas; para
  pruebas destructivas usar otro origen o decir qué no se probó.
- Copia de su plano anterior a los módulos: `planos/plano-anterior-sin-modulos.json`.
