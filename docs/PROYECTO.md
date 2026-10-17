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
- **Publicada en GitHub Pages** (de verdad desde el 2026-10-12, ejecución 25):
  `https://arlanzon29.github.io/ConfiguradorCasa/`. La compila y publica sola
  `.github/workflows/pages.yml` cada vez que algo entra en `main`; tarda
  menos de un minuto. Las 24 ejecuciones anteriores fallaron al publicar
  porque Pages no estaba activado en el repositorio (Settings → Pages →
  Source: "GitHub Actions"); lo activó el usuario. Por eso
  `base: './'` en `vite.config.ts` y las rutas de imágenes **sin barra
  inicial** (`texturas/...`, no `/texturas/...`): la web cuelga de una
  subcarpeta. El plano y las fotos de cada visitante se quedan en su
  navegador, como en local.
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
`three-gpu-pathtracer` 0.0.27. VR con `@react-three/xr` 6 (WebXR). El plano 2D es **SVG** puro, con el `viewBox` en metros.

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

**De quién es cada cosa se guarda, no se deduce** (desde el 2026-10-11). En
memoria las listas siguen planas (`shells`, `modules`, `openings`,
`furniture`), pero cada cosa apunta a su padre: la estancia a su módulo
(`PlacedModule.shellId`), el mueble a su estancia (`FurnitureItem.roomId`) y
el hueco a la suya (`Opening.moduleId`, como siempre). Lo mantienen
`withShells` (dentro de `setModules`) y `housed` en `store.ts`; la geometría
solo se consulta al mover algo o al abrir un plano de antes (`withParents`).
Las paredes siguen deducidas.

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
  cerrada en 3D (`closed`; si no, abierta a 90° como en el plano). La hoja se
  monta siempre cerrada y lleva el eje de sus bisagras (`leaf` en
  `JoineryPart`); la vista 3D la gira hasta abierta o cerrada, poco a poco. Cerco y hojas
  llevan el **acabado** del hueco (`Opening.finish`, por defecto blanco).
- **Acabado** (`Finish` en `finishes.ts`): un solo concepto, un texto que es un
  color liso (`#rrggbb`) o el `id` de un material del catálogo (`MATERIALS`, los
  acabados con textura). `resolveFinish` da su color y su textura; `FinishPicker`
  (`FinishesPanel.tsx`) lo elige: materiales arriba, colores debajo. Lo usan la
  carpintería, el suelo (`floor`; `floorOf` lo lee, y `base` es sin acabado) y
  las paredes (`wallColor` y `sideColors`, que pese al nombre guardan un
  acabado; `interiorFinish`). Una pared con material lleva su textura en una
  lámina a 0,5 mm de la cara (`WallSkin` en `View3D.tsx`), porque la caja va
  coloreada por vértice.
- **Techo** (2026-10-12): por estancia, acabado (`ceiling`, por defecto
  blanco) y si lo lleva (`noCeiling`). **Solo existe en la foto en calidad**;
  la vista normal sigue sin techo. `Ceiling` en `View3D.tsx`, `setCeiling` en
  `store.ts`, apartado "Techo" en `RoomFinishes`.
- **Acabados**: suelo por estancia y pared por estancia o por lado
  (`wallColor`, `sideColors`), los dos con `FinishPicker`. Solo se ven en 3D.
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
- **Tablero** (`Board` en `boards.ts`): la primera **primitiva**, una caja
  anclada a la cara de una pared que da a una estancia. Se guarda y se coloca
  como el espejo (`PlacedModule.boards`, por lado, con `x`, `y`, ancho y alto) y
  además tiene **fondo** (`depth`, lo que sale de la pared, hasta el fondo de la
  estancia) y **acabado** (`finish`, color o material). La **postura** no se
  guarda: se deduce de cuál de las tres medidas es el grueso, la menor
  (`boardPose`): contra la pared, de canto (de pie, saliendo de la pared) o
  balda (tumbado). Cambiar de postura intercambia el grueso con la medida que
  ocupaba ese sitio (`posedBoard`). No se impide que pise nada. En 3D es una
  caja (`boardParts` y `BoardBox` en `View3D.tsx`).
- **Interruptores y enchufes** (`Mechanism` en `mechanisms.ts`): una placa
  de 8 × 8 cm (16 × 8 la doble) y 1,2 cm de grueso pegada a la cara de una
  pared que da a una estancia. **Solo se ven**: no encienden nada (lo decidió el
  usuario). Se guardan en su estancia por lado (`PlacedModule.mechanisms`),
  con `typeId`, `x` (desde la esquina izquierda de la cara, mirándola desde
  dentro) e `y` (del suelo a su borde inferior); el ancho y alto los da el
  tipo. Cinco tipos de catálogo (`MECHANISMS`): interruptor, interruptor
  doble, conmutador (1,1 m al centro) y enchufe, enchufe doble (0,3 m). Cada
  tipo lleva su código de artículo. No se impide que pisen un hueco u otra
  pieza. En 3D son cajas lisas con su detalle (`mechanismParts` y
  `MechanismPiece` en `View3D.tsx`); en el plano, una raya corta roja.
- **Luz de estancia** (`RoomLight` en `lights.ts`): un **foco de techo**. Se
  guarda en su estancia (`PlacedModule.lights`, una lista, no por lado) con `x`
  desde el borde oeste e `y` desde el borde norte de la estancia, **potencia**
  (`power`, en % de la normal, de 10 a 300), **tono** (`tone`: cálida, neutra
  o fría) y, si se quiere, un **color de emisión** propio (`color`) que manda
  sobre el tono; elegir un tono lo quita (`lightColor`). Se mueve y gira con la estancia (`turnLights`). **Solo alumbra en la
  foto en calidad** (un panel de luz de 12 cm mirando abajo); en la vista
  normal se ve la pieza, un disco a la altura del techo. **Toda estancia nueva
  nace con un foco** en el centro del techo (lo pidió el usuario), al 100 %,
  que alumbra lo mismo que el panel provisional que hubo antes. **Ya no hay
  luces provisionales** (el usuario pidió quitarlas, y dejar el sol): una
  estancia sin focos solo recibe en la foto la luz del sol y del cielo por sus
  ventanas. Las estancias de planos anteriores a los focos reciben el suyo al
  abrirse (`firstLight` en `withParents`); la que tiene la lista vacía porque
  se los quitaron se queda sin ninguno.
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
  main.tsx, App.tsx, App.css     arranque, los dos paneles, selector de vista
  store.ts                       estado global y TODAS las acciones (zustand)
  photos.ts                      fotos en calidad guardadas (IndexedDB) y su estado
  api.ts                         funciones para manejar la casa sin la interfaz (`window.eurocasa`)
  model/                         lógica pura, sin React
    house.ts        parcela, rejilla, estancias, módulos de fábrica, encaje
    walls.ts        paredes deducidas, encaje de huecos en paredes
    openings.ts     tipos y catálogo de puertas/ventanas
    finishes.ts     catálogo de suelos, colores de pared
    vinyls.ts       vinilos: catálogo y dónde cae cada uno en su pared
    mirrors.ts      espejos: la pieza y sus medidas por defecto
    boards.ts       tableros: la pieza, sus posturas y sus límites
    lights.ts       luces de estancia: el foco de techo, tonos y límites
    mechanisms.ts   interruptores y enchufes: catálogo, medidas y alturas
    furniture.ts    catálogo de mobiliario por familias
    planFile.ts     formato del archivo de plano (guardar/cargar)
  editor/
    Editor2D.tsx    plano SVG: dibujo y todos los arrastres
    SizeForm.tsx    formulario de dos medidas reutilizable
  panels/           HouseTree (el árbol, a la izquierda), PropertiesPanel (a la
                    derecha, que reúne los apartados de cada cosa), PlanFileButtons
                    y PhotoViewer
  viewer/
    View3D.tsx      escena 3D, cámara en primera persona, paredes y suelos
    joinery.ts      carpintería de puertas y ventanas, como cajas
    Furniture3D.tsx muebles como composición de cajas
    PhotoTracer.tsx foto en calidad por trazado de rayos
    denoise.ts      filtro de ruido de la foto, guiado por la geometría
public/texturas/suelos/          imágenes de suelo
public/texturas/vinilos/         dibujos de los vinilos (SVG con fondo transparente)
.claude/skills/crear-casas/      skill que enseña a Claude a montar casas con las funciones de `api.ts`
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

**No hay pestañas** (desde el 2026-10-11). A la izquierda, el **árbol de la casa**
(`HouseTree.tsx`); a la derecha, **Propiedades** (`PropertiesPanel.tsx`), que
está siempre. La regla: se elige una cosa, en el árbol o pinchándola en el
plano, y a la derecha salen **solo las propiedades de eso** (lo dijo el
usuario): arriba su **nombre**, luego sus datos y, si contiene otras cosas, lo
que se le puede añadir.

**Todo tiene nombre** (lo pidió el usuario): la primera casilla de cualquier
cosa es "Nombre" (`NameField` en `Field.tsx`) y se puede cambiar. Se guarda en
`name` de cada objeto; el de una pared, donde su grosor (`wallNames` por lado
de estancia, o `name` en `joints`). Sin nombre propio vale el de por defecto
(`model/names.ts`: "Módulo 1", "Estancia 2", "Pared norte", "Foco 1", el del
catálogo en un mueble, "Puerta" o "Ventana"); dejar la casilla vacía vuelve a
él. La acción es `rename` en `store.ts`.

**El árbol** solo enseña y elige; no se reordena ni se mueve nada de rama.

```
Casa
├─ Módulo 1 · 13 × 4,2 m
│  ├─ Estancia 1 · 3 × 3 m        (se pliega; se abre sola si tiene lo elegido)
│  │  ├─ Paredes · 4              (carpeta)
│  │  │  ├─ Pared norte           (se pliega; dentro, cinco carpetas)
│  │  │  └─ Pared este · con la Estancia 2
│  │  │     ├─ Puertas · 1
│  │  │     │  └─ Puerta · 0,9 m
│  │  │     ├─ Ventanas · 0
│  │  │     ├─ Vinilos · 1
│  │  │     │  └─ Luna
│  │  │     ├─ Espejos · 1
│  │  │     │  └─ Espejo 1 · cara de la Estancia 2
│  │  │     ├─ Tableros · 0
│  │  │     └─ Instalación · 1
│  │  │        └─ Enchufe 1
│  │  ├─ Mobiliario · 1           (carpeta)
│  │  │  └─ Sofá
│  │  └─ Luces · 2                (carpeta)
│  │     ├─ Foco 1
│  │     └─ Foco 2
│  └─ Estancia 2 · 6 × 3 m
└─ Fotos · 3
```

- Dentro de cada estancia, **tres carpetas** (las pidió el usuario): "Paredes",
  "Mobiliario" y "Luces", con su cuenta. Al elegir un foco (`selectedLightId` en
  `store.ts`), Propiedades enseña solo el foco (`LightProperties`) y su
  círculo se resalta en el plano. Solo pliegan y despliegan; cerradas de
  entrada, se abren solas si tienen lo elegido.
- **Cada pared cuelga de una sola estancia** (decisión del usuario): la que da
  `deriveWalls` en `Wall.moduleId`; en una compartida, la del norte u oeste. Un
  lado partido en varios tramos los numera ("Pared norte 1", "Pared norte 2").
- **Cada mueble es de una estancia** (decisión del usuario): la que guarda en
  `roomId`. Al arrastrarlo hasta otra cambia de rama; no se puede sacar de
  todas (se queda en el borde de la suya) ni colocar uno nuevo fuera de una
  estancia. Solo sale suelto bajo "Casa" el de un plano antiguo que ya estaba
  fuera.
- **Puertas y ventanas cuelgan de su pared** en el árbol (lo pidió el usuario),
  en el orden en que están a lo largo de ella (`openingsOf`); la pared con
  algo dentro se pliega. Debajo van sus **vinilos, espejos, tableros y
  interruptores o enchufes** (`pieces` en `HouseTree.tsx`): los de la cara que da a su estancia y, en una
  compartida, los de la otra cara, con el rótulo "cara de la Estancia N". La
  pieza elegida está en `selectedPiece` (`store.ts`) y Propiedades enseña solo
  la suya; en la pared quedan los apartados para añadirlas. Dentro de cada pared hay **seis carpetas** (las pidió el usuario, para que
  el "+" sepa qué hacer): Puertas, Ventanas, Vinilos, Espejos, Tableros e
  Instalación (`WALL_GROUPS`, `wallFolder`; esta última, con interruptores y
  enchufes). El "+" de cada una añade lo suyo: directo si
  solo hay una clase (ventana, espejo, tablero) y con una lista si hay varias
  (puerta o corredera; los vinilos; los cinco tipos de la instalación). La pared no lleva "+". El "+" pone las
  piezas en la cara de su estancia; para la otra cara de una
  compartida hay que elegirla en Propiedades de la pared.
- Estancias de planos antiguos sin módulos cuelgan directamente de "Casa".

**Qué sale en Propiedades** según lo elegido:

| Elegido | Arriba (datos) | Debajo (añadir y acabados) |
|---|---|---|
| Casa | — | Añadir módulo horizontal o vertical. Se ve toda la parcela |
| Módulo | distancia al borde izquierdo y superior de la parcela; ancho y fondo; girar, eliminar | Añadir estancia (catálogo y medida personalizada) y el resumen |
| Estancia | distancia al borde de su módulo; ancho y fondo; girar, eliminar | Suelo, techo (si lo lleva en la foto y su acabado), acabado de todas sus paredes, "Añadir luz" (foco de techo) y el catálogo de **mobiliario** con el icono de imán |
| Foco | distancia a la izquierda y arriba, "Centrar en la estancia", potencia (%), tono, color de emisión, eliminar | — |
| Pared | grosor (cm); rodapié (alto y color); quitar/poner | Añadir hueco (puerta, corredera, ventana); en una compartida, de qué estancia es **la cara** que se viste; color de esa cara, y añadir vinilo, espejo o tablero |
| Vinilo, espejo o tablero | posición, medidas y lo propio de cada uno (giro y proporción; postura, fondo y acabado), eliminar | — |
| Interruptor o enchufe | código, distancia a la izquierda y al suelo, eliminar | — |
| Puerta o ventana | distancia a cada extremo de su pared; ancho y alto; altura (ventanas); en abatibles, hacia dónde abre, canto y cerrar/abrir en 3D; acabado de la carpintería y "Aplicar a todas" | — |
| Mueble | distancia de cada borde a las cuatro paredes de su estancia; pegar a la pared, "Centrar en la estancia" (entre las caras interiores de sus paredes), girar, eliminar | El catálogo de mobiliario |
| Fotos | — | Las fotos guardadas: miniaturas, Anterior/Siguiente, ver, descargar, repetir, eliminar. En el plano, un icono numerado por foto |

Cada casilla se aplica sola con Intro o al salir de ella; `Esc` la deja como
estaba; lo que no cabe se rechaza con un aviso debajo.

**Clics en el plano** (`Editor2D.tsx`): sobre un hueco, un mueble o un foco, lo elige y
lo arrastra; a menos de 35 cm de una pared (`WALL_NEAR`), elige la pared; en
el centro de una estancia, la elige, y **solo ya elegida se arrastra** (el
primer clic elige, el segundo mueve). Los tiradores para estirarla son solo los
ocho círculos, no el lado entero. Los módulos se eligen en el árbol; con "Casa"
o un módulo elegido, el plano enseña toda la parcela y los módulos se arrastran.
Con algo del catálogo por colocar, el clic lo coloca.

Por dentro sigue habiendo un `mode` en `store.ts` (`shells`, `modules`,
`walls`, `options`, `photos`): es la clase de cosa elegida, lo fija `pick` y
ya no lo elige el usuario. El plano dibuja vinilos, espejos y tableros con una
pared elegida, y los focos con una estancia elegida.

Los dos paneles se **pliegan** con el botón `‹` / `›` de su cabecera y queda una
tira de 32 px para volver a sacarlos; se recuerda en `localStorage` (clave
`eurocasa-paneles`).

**Vistas** (botones sobre el lienzo): Plano 2D, Vista 3D, Plano + 3D (lado a lado),
y "3D en otra ventana". En el plano, un marcador naranja muestra la cámara 3D y se
puede arrastrar (posición) y orientar (tirador del cono).

**Qué se ve en el plano** (lo pidió el usuario, sobre todo para quitar el
mobiliario): botones "Ver en el plano" a la derecha de los botones de vista,
con el plano a la vista: Mobiliario, Cámara y Rejilla (`PLAN_LAYERS` y
`planLayers` en `store.ts`). Solo afecta al plano 2D, no a la vista 3D ni a la
foto. Con el mobiliario oculto se sigue dibujando el mueble elegido (desde el
árbol o recién colocado), para poder moverlo. Se guarda en `localStorage`, no
en el archivo de plano.

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
  pregunta se quita. Al repetir una foto pregunta igual, con "¿Sustituir la
  foto anterior?", "Sustituir la foto" y "No sustituir" (la anterior queda como
  estaba).
- **Muestras**: 50, 100 o 200 (`PHOTO_SAMPLES` y `photoSamples` en `store.ts`),
  botones junto al objetivo; **por defecto 100** (`DEFAULT_PHOTO_SAMPLES`, lo pidió
  el usuario el 2026-10-12); donde arriba dice 200 es el número elegido. Se
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

**Realidad virtual** (2026-10-12, `VRRig` en `View3D.tsx`): botón **"Entrar en
VR"** junto a "Foto en calidad". WebXR con `@react-three/xr` 6; pensado para las
**Meta Quest 3** del usuario, en el navegador de las gafas y con la web
publicada (HTTPS). Entras donde estaba la cámara y mirando hacia donde miraba,
con la altura de ojos que da el visor. Con los mandos: stick izquierdo
camina (2 m/s) hacia donde miras y stick derecho gira a saltos de 30° **sobre
tu cabeza**, sin desplazarte. Los sticks los lee `VRRig` a mano, no con
`useXRControllerLocomotion`: la librería giraba alrededor del origen del
espacio (no de la cabeza) y repetía el último empujón al girar, y en AR
desplazaba el mundo con ese empujón viejo. **B o Y (el botón de
arriba de cada mando) sale de la VR**; los primeros 10 s hay un cartel delante
de los ojos que lo dice. Sin paneles. Cada mando lleva un **rayo**
(`VRController`): al apuntar a una puerta abatible su hoja se resalta en
naranja y sale un cartel junto al punto del rayo, "Gatillo: abrir la puerta"
o "Gatillo: cerrar la puerta", y el rayo y su punto pasan de blanco a
**naranja** (`actionable`, por `userData.vrAction`: así se ve que ahí hay
algo que hacer); el **gatillo** la abre o la cierra y la hoja
gira en medio segundo (`DoorLeaf`). Cambia el mismo dato que el botón de
Propiedades (`closed`), así que se guarda en la casa. En VR la casa entera
para el rayo (`pointerEvents` en el grupo `casa`), para no coger una puerta
detrás de una pared. **Puntos de salto** (teletransporte, para quien se marea
caminando; el stick sigue igual): círculos blancos en el suelo, uno por
estancia (lo más cerca del centro sin pisar un mueble) y uno a cada lado de
cada puerta, a 0,6 m de la pared. No se guardan, se deducen
(`teleportPoints` en `viewer/teleport.ts`). Apuntando a uno se pone naranja,
sale "Gatillo: ir aquí" y el gatillo te lleva, mirando hacia donde mirabas
(`TeleportMarker`, `teleportRequest` en `VRRig`). Apuntar, resaltar y el
cartel son comunes a puertas y puntos (`useAim`, `AimLabel`). Al salir, la cámara y el marcador del plano quedan donde
dejaste la cabeza. En VR se apaga la cámara de ratón y teclado
(`DesktopControls`). La foto en calidad no existe en VR. En localhost, si el
navegador no tiene WebXR, la librería emula unas Quest 3 (solo desarrollo).

**Realidad aumentada** (2026-10-12, `ARTable` en `View3D.tsx`): botón **"Maqueta
AR"**, para las Quest 3 (`immersive-ar`, con el paso de cámara). La casa sale
como una **maqueta a 1:20 sobre una mesa translúcida**, centrada en su mesa y
sin el césped de la parcela, a 0,8 m delante de ti y a 0,75 m del suelo. Se
maneja como la bandeja de la prueba `D:\IA\Macedonia\games\sala-ar`
(ahí lo tenía resuelto el usuario): **gatillo o botón lateral (agarre)
mantenidos**, la mesa sigue al mando (justo debajo) y gira hacia donde apunta,
aunque esté lejos (el usuario esperaba que el botón lateral la colocara);
**los dos mandos a la vez** (gatillo o lateral en ambos): la distancia entre
ellos **agranda o reduce** la maqueta (de 1:100 a 1:1) y girar las manos la
gira, con la mesa entre las dos manos;
**stick izquierdo**, la mueve en horizontal según hacia dónde miras
(adelante la acerca, atrás la aleja: al revés que al caminar, lo pidió el
usuario al probarlo; `AR_MOVE_SPEED`, 0,5 m/s); **stick
derecho** a izquierda o derecha, la gira poco a poco, y adelante o atrás la
agranda o la reduce (`AR_ZOOM_SPEED`, de 1:100 a 1:1); **A o X**,
cambia entre maqueta y tamaño real (1:1); **B o Y** sale. Las **puertas** se
abren y cierran como en la VR, con el rayo y el gatillo: un gatillo apretado
apuntando a una puerta es para ella y no mueve la mesa (`aimingHands`, por
mano); el botón lateral la mueve siempre. El cartel va a la mitad de tamaño
en la maqueta. Sin puntos de salto en AR. Sin sombras ni fondo.
Solo con mandos: las manos (pellizco) no están.

**Arriba del panel izquierdo**: Nuevo plano (crea un módulo vacío de 13 × 4,2 en (0, 0) y abre
el modo Módulos), Guardar plano y Cargar plano (archivo `.json`).

Teclas: `R` gira lo seleccionado, `Supr` lo borra, `Esc` cancela la herramienta,
`Ctrl+Z` deshace y `Ctrl+Y` (o `Ctrl+Mayús+Z`) rehace.

## Decisiones de diseño que hay que respetar

- **Tres maneras de usar la aplicación** (lo dijo el usuario el 2026-10-12):
  un usuario final, un comercial, y un comercial **desde Claude**. Para la
  tercera, **Claude maneja el navegador**: abre la web y llama a las funciones
  de `src/api.ts` (`window.eurocasa`) dentro de la página, guiado por la skill
  `crear-casas`. **No hay servidor** ni se cuenta con él: quedan fuera, por
  ahora, un conector (MCP), que exigiría llevar la casa a un servidor, y un
  chat de Claude dentro de la web. También está descartado montar la casa
  cargando un `.json` de golpe. Cada elemento nuevo lleva su función y su
  parte de la skill en el mismo cambio. Consecuencias: Claude solo recibe
  texto de la página (una foto se enseña en el visor, no en la conversación),
  y cada comercial tiene su casa en su navegador.

- **Se guarda el `.blend` de cada modelo hecho en Blender** (lo decidió el
  usuario el 2026-10-17, por si hay que retocarlo): el original editable en
  `modelos-blender/` y el `.glb` para la web en `public/modelos/`, los dos en
  el mismo cambio. Cómo se exporta, en `modelos-blender/LEEME.md`.

- **Esto no es un programa de modelado 3D** (lo dijo el usuario el 2026-10-11,
  al empezar con los tableros). Se añaden primitivas poco a poco y con las
  opciones justas; antes de dar más libertad a una pieza, hablarlo con él.

- **Las paredes son de la casa, no de cada estancia.** No volver a paredes dobles
  entre estancias. Selección por `Wall.key` (`ext:<id>:<lado>:<n>` o `joint:<a>|<b>`).
- **Los huecos se reencajan desde una copia durante el arrastre** (`dragOpenings`,
  `beginDrag`/`endDrag`), para que pasar junto a otra estancia no los destruya.
- **Imanes**: estancias y módulos se imantan a bordes de módulos y de otras
  estancias (`snapEdge`/`snapSpan` en `Editor2D`); los muebles, a la cara interior
  de las paredes de su estancia (`magnetize` en `store.ts`). El de los muebles se
  apaga con el icono de imán del panel Opciones (`furnitureMagnet`, se guarda en
  `localStorage`, no en el archivo de plano); "Pegar a la pared" funciona igual.
- **Fácil antes que flexible** (lo dijo el usuario el 2026-10-11, al rehacer la
  interfaz): se acepta no poder hacerlo todo a cambio de que las cosas se
  encuentren. El modelo es el de Unity: jerarquía a la izquierda, inspector a
  la derecha. Lo usará un comercial con el cliente delante, y conviene que el
  cliente pueda manejarlo solo.
- **El panel derecho no aparece y desaparece con la selección**: está siempre,
  aunque vacío. Si saliera al hacer clic, el plano cambiaría de tamaño a
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
  restricción solo aplica si hay algún módulo.
- **El archivo de plano tiene la forma del árbol** (`planFile.ts`, versión 2; lo
  pidió el usuario): `shells`, cada uno con sus `rooms` dentro; cada estancia
  con sus `openings` y su `furniture` dentro (y, como ya estaban, sus luces,
  vinilos, espejos y tableros). Fuera quedan `rooms` (estancias sin módulo),
  `furniture` (muebles sin estancia), `joints` (cada pared compartida es de
  dos estancias) y `photos`. Dentro de su padre no se repite la referencia a
  él: `serializePlan` la quita y `flatten` la repone al leer. **La versión 1**
  (listas planas) se sigue leyendo, también sin `shells` ni `furniture`. El
  guardado automático del navegador (`localStorage`) sigue plano.
- **Fotos** (`photos.ts`): se guardan en **IndexedDB** (base `eurocasa`, almacén
  `photos`), no en `localStorage`, que es pequeño y lo comparte el plano. Cada foto
  lleva la imagen (JPEG al 92 %, unos 300 KB; en PNG pesaban 2 MB), la pose de la
  cámara, el objetivo y el tamaño. Son **de la casa**: "Guardar plano" las mete
  dentro del `.json` como `data:` URL (campo `photos`), "Cargar plano" y "Nuevo
  plano" sustituyen las que hubiera. Las ventanas se avisan por `BroadcastChannel`.
  El visor (`PhotoViewer`) cuelga de `App` y se maneja con flechas y `Esc`.
- **Repetir una foto** (`retake`, `retakeId` y `replace` en `photos.ts`): el panel
  solo marca qué foto se repite; quien la traza es `View3D`, que al ver
  `retakeId` entra en modo foto y, terminada, enseña el recuadro de guardar con
  el filtro como lo tenía la original; "Sustituir la foto" llama a `replace`.
  No sustituye sola: el usuario quiere ver el resultado antes (2026-10-11). La foto conserva `id` y `takenAt` (que da el orden y el número) y
  apunta la fecha nueva en `retakenAt`, que es la que se enseña. Si solo está el
  plano a la vista, `App` pasa a Plano + 3D; volver a Plano 2D, ir a otra foto o
  "Cancelar" la cancelan y la foto anterior queda como estaba. Se guarda la pose
  real de la cámara: si el usuario la mueve a mitad, la foto queda reencuadrada.
  La vista 3D enseña además sus propios botones **"Ver foto N"** (abre el
  visor) y **"Repetir foto N"** cuando la cámara
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
  `FLOORS` (`finishes.ts`) con `name`, `color`, `texture` (sin barra inicial),
  `size` en metros.
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
- Luces: valores inventados (foco de 12 cm; al 100 % alumbra como el panel
  provisional, `LIGHT_INTENSITY` en `View3D.tsx`; se separa 20 cm del
  borde de la estancia, sin descontar el grosor de las paredes). No hay
  encendido y apagado, ni luz en la vista normal. Al encoger la estancia no se reencajan. El foco es pequeño y
  da más grano que el panel: a 50 muestras se nota sin filtro. Probado en el
  servidor aparte (5184) en una estancia de 3 × 3 vacía: añadir dos focos,
  cambiar el tono, el círculo en el plano, el disco en la vista normal y una
  foto a 50 muestras con y sin filtro. Sin probar: las casillas y barras,
  "Eliminar", el giro de estancia o módulo, estancias con y sin focos en la
  misma foto, ni guardar y cargar un plano con luces.
- Interfaz de árbol: en el plano, vinilos, espejos y tableros no se eligen
  pinchando (solo desde el árbol) ni se resalta el elegido. Tras añadir una
  estancia hay que volver a elegir el módulo para añadir otra. Vinilos, espejos
  y tableros son del lado entero de su estancia: si el lado tiene varios tramos
  de pared, todos enseñan la misma lista. El marcador de la cámara tapa los
  clics de lo que tiene debajo. Los nombres por defecto llevan número, que
  cambia si se borra una cosa anterior. Probado en el servidor aparte (5184) con un
  módulo y dos estancias: el árbol, añadir estancias desde el módulo, elegir
  una pared exterior y la compartida pinchando en el plano, colocar una puerta
  y un sofá. Sin probar: arrastrar estancia, módulo, hueco y mueble con el
  ratón, estirar con los tiradores, las teclas, Fotos, plegar ramas, ni un
  plano antiguo sin módulos con muebles.
- Interruptores y enchufes: medidas y alturas inventadas (placa de 8 × 8 cm,
  1,2 cm de grueso; interruptor a 1,1 m y enchufe a 0,3 m al centro), códigos
  también. Solo se ven; el dato "qué foco gobierna" no existe. No chocan con
  huecos, muebles ni otras piezas, no se arrastran en el plano y al encoger la
  estancia no se reencajan. No hay regulador, USB, TV ni timbre. Probado en el
  servidor aparte (5185): ponerlos por funciones en las cuatro paredes con
  sus errores, verlos en 3D (un enchufe doble, un interruptor), el árbol con
  la carpeta Instalación y su "+", el panel del elegido, guardar y leer el
  plano, y girar el módulo (cuatro giros devuelven el estado). Sin probar: las
  casillas y barras con el teclado, "Eliminar", la foto en calidad ni el giro
  de una estancia suelta (se comprobó el del módulo).
- Tableros: medidas inventadas (1 × 1 m y 2 cm de grueso al colocarlo, apoyado
  en el suelo; mínimo 5 mm en cualquier medida). No chocan con muebles, huecos
  ni otras piezas, y al encoger la estancia no se reencajan. El fondo máximo es
  el de la estancia sin descontar paredes. No hay arrastre en el plano. Probado en el servidor
  aparte: añadir uno, las tres posturas en el plano y en la vista 3D con
  "Madera de pino". Sin probar: las casillas y barras, el color liso,
  "Eliminar", el giro de estancia o módulo, la foto en calidad, ni guardar y
  cargar un plano con tableros.
- Espejos: son una prueba. El **filtro de ruido no toca lo reflejado** (decisión
  del usuario): dentro del espejo la foto filtrada conserva el grano del
  trazado, que con pocas muestras contrasta con el resto, ya liso. `denoise.ts`
  reconoce el espejo por su material (metal pulido: `metalness` > 0,9 y
  `roughness` < 0,1) y lo deja sin profundidad en la guía, como el cielo. Medidas
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
- Acabados: en una pared con material, el vinilo de la foto (lámina opaca)
  toma el color de muestra del material, no su textura; los cantos de la pared
  en los huecos siguen lisos. Suelos y paredes con material sin probar a la
  vista ni en la foto (solo `tsc` y compilación). En la carpintería el acabado es uno por hueco (cerco y hojas
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
- Muebles: sin colisiones entre sí ni con huecos. Siguen a su estancia al
  moverla y al girarla (sola o con su módulo); al estirarla se quedan donde
  estaban, y el que quedaría fuera se lleva al borde y no vuelve si se
  ensancha otra vez. El límite al arrastrar es el rectángulo de la estancia,
  sin descontar paredes, salvo con el imán puesto.
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
  de la propia vista. La pregunta de sustituir, al terminar de repetir, está
  sin probar a la vista (solo `tsc`).
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
- VR: **no probado en unas gafas reales**; solo en el emulador de Quest 3 de
  la librería, en el servidor aparte (5185): se entra, el origen se coloca donde
  estaba la cámara con su giro, y al salir la cámara queda en la cabeza (mover
  la cabeza 1 m en el emulador la movió 1 m en el plano). Sin probar: los
  sticks (caminar y girar), los mandos y las manos, abrir y cerrar puertas
  con el rayo (ni siquiera en el emulador), el rendimiento y la
  comodidad (sin viñeta al andar, puede marear), ni que la web publicada ofrezca
  la sesión en las Quest. No hay colisiones: se atraviesan las paredes. El
  empaquetado incluye el emulador (unos 6 MB en trozos que solo se descargan en
  localhost) porque la librería lo trae dentro. Sale en la consola de
  desarrollo el aviso "Multiple instances of Three.js", que es del emulador.
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
  "Guardar foto" la manda a la pestaña Fotos. Mientras dura la foto se añade un techo
  (provisional, en `View3D.tsx`) y un cielo en degradado; el panel de luz de
  0,6 m por estancia que hubo al principio se quitó al llegar los focos. Resultado de la prueba en `docs/pruebas/`. Lo aprendido:
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

- **2026-10-17** · **AR: el stick izquierdo, al revés** (el usuario lo probó
  en las Quest: "se mueve al revés"). Invertido entero: adelante acerca la
  maqueta, atrás la aleja, y los lados también cambian. **Sin probar**.

- **2026-10-17** · **AR: el stick izquierdo mueve la maqueta** (el usuario:
  "el stick izquierdo rota, ¿podría mover la maqueta?"). En `ARTable`, el
  izquierdo la desplaza en horizontal según hacia dónde miras, a 0,5 m/s; el
  derecho se queda con girar y agrandar. Los dos sticks hacían lo mismo
  antes. **Sin probar**: solo `tsc` y la compilación.

- **2026-10-17** · **Girar en VR ya no desplaza, y el stick acerca la
  maqueta AR** (el usuario probó en las Quest: al girar en VR se desplazaba
  hasta salir de la casa; en AR el stick derecho "solo la aleja"; los puntos
  de salto le parecen bien puestos y se quedan). La librería
  (`useXRControllerLocomotion`) giraba el origen del espacio alrededor de sí
  mismo, no de la cabeza, y reutilizaba el último vector de movimiento al
  girar. Ahora `VRRig` lee los sticks: el izquierdo camina hacia donde
  miras y el derecho gira el origen alrededor de la cabeza. En AR, stick
  adelante o atrás agranda o reduce la maqueta (el usuario lo esperaba así);
  que "solo la alejara" lo atribuyo, sin comprobarlo, al empujón viejo de la
  librería. **Sin probar**: solo `tsc` y la compilación.

- **2026-10-17** · **Teletransporte en VR y puertas en la maqueta AR** (el
  usuario: "teletransporte, para gente que se marea", con el movimiento
  libre de siempre y "unos puntos en el suelo", y "haz todo", que incluía
  las puertas en AR). Puntos de salto automáticos, uno por estancia y a cada
  lado de cada puerta (`viewer/teleport.ts`), que se usan como las puertas:
  rayo, naranja, "Gatillo: ir aquí". En AR, rayo y puertas con el gatillo,
  sin que esa pulsación mueva la mesa. Puertas y puntos comparten `useAim` y
  `AimLabel`. El usuario apuntó a mitad: "igual es mejor poderlos poner en
  el plano"; queda por decidir si se añaden puntos puestos a mano. **Sin
  probar**: solo `tsc` y la compilación. Supuesto: tras saltar a un punto
  de fuera, los pies quedan en el césped, y si se vuelve a entrar con el
  stick se va 20 cm por debajo del suelo de la casa (no hay alturas al
  caminar).

- **2026-10-17** · **El rayo de la VR se pone naranja sobre una puerta** (el
  usuario probó lo de las puertas: "va bien"; pidió que el color del rayo
  indique que hay una opción). Blanco y tenue normalmente; naranja e intenso,
  rayo y punto, al apuntar a algo marcado con `userData.vrAction` (hoy, las
  hojas de puerta). Color `VR_ACTIVE_COLOR`, el mismo del resalte. Sin
  probar: solo `tsc` y la compilación.

- **2026-10-17** · **Abrir y cerrar puertas en VR apuntando** (el usuario:
  "apuntar y que salga qué botón hay que pulsar"; la opción de coger la
  manilla queda para después). Rayo en cada mando (`VRController`, solo en
  VR, no en AR); al apuntar a una puerta abatible se resalta la hoja y sale
  el cartel "Gatillo: abrir / cerrar la puerta"; el gatillo cambia `closed`
  (`setDoor`) y la hoja gira 90° en medio segundo. Para poder girarla,
  `joineryParts` monta la hoja siempre cerrada con su eje (`DoorLeafAxis`) y
  `DoorLeaf` en `View3D.tsx` la gira; durante la foto en calidad va directa.
  El cartel de entrada de la VR añade "Apunta a una puerta y pulsa el
  gatillo". El botón "Cerrar / Abrir la puerta en 3D" de Propiedades ahora
  también la anima. **Sin probar** (lo prueba el usuario en las Quest): solo
  `tsc` y la compilación.

- **2026-10-17** · **Fuera el parpadeo de los modelos detallados** (el
  usuario: en el frigorífico y el lavavajillas, la tira negra de abajo se
  ponía blanca y parpadeaba). Era z-fighting: la rejilla del frigorífico y el
  zócalo del lavavajillas tenían la cara delantera en el mismo plano que el
  cuerpo. Adelantadas 4 mm, y lo mismo en los zócalos de los dos armarios de
  dormitorio, que tenían el mismo fallo. Revisando todos los modelos con un
  guion (caras paralelas a menos de 1,5 mm), dos más con riesgo: la pantalla
  de la tele (a 3 mm del marco) y las teclas de la vitro (más gruesas). Los
  ocho `.glb` y `.blend` vueltos a guardar. Regla en `modelos-blender/LEEME.md`.
  Sin verlo en la web: el usuario estaba usando la pestaña de pruebas.

- **2026-10-17** · **La vista 3D arranca siempre en "Sencillos"** (el
  usuario: "por defecto quiero el 3d en modo sencillo"). Ya era el valor de
  partida, pero se guardaba en el navegador y volvía "Detallados" si se dejó
  así. Ahora `detailedFurniture` no se guarda (`partialize` de `store.ts`) y
  `merge` no lo toma de lo guardado: al abrir, "Sencillos"; al releer por un
  cambio de otra ventana, se queda como estaba. Consecuencia: la ventana
  `?vista=3d` no copia la elección de la otra. Solo `tsc`: al ir a probarlo
  el usuario estaba usando la pestaña del entorno de pruebas.

- **2026-10-17** · **Fuera las rayas verticales de las paredes en Blender**
  (el usuario: se veían líneas verticales en las ventanas, "parece un
  problema del modelo"). Venían del solape de 2 mm de dintel y antepecho con
  los tramos de al lado (`JOINT_OVERLAP`, puesto para la web): en esos 2 mm
  había dos caras en el mismo plano y Cycles pintaba una raya de suelo a
  techo en cada lado del hueco. Ahora dintel y antepecho se meten medio
  milímetro por cada cara (`JOINT_RECESS` en `wallParts`, `View3D.tsx`).
  Probado: el mismo render del dormitorio ya sin rayas, y en la web la
  ventana sin la raya fina de antes.

- **2026-10-17** · **Ventanas y puertas mejores, y paisaje en Blender** (el
  usuario: "haz todo" de las tres opciones). En la web (`joinery.ts`): cada
  pieza lleva su `role` (Cerco, Tapajuntas, Hoja, Perfil, Junquillo,
  Cristal, Manilla) y la malla se llama "Carpintería <rol>" (`JoineryBox`,
  `TexturedBox`), y así llega al GLB; **junquillos** alrededor del cristal
  por las dos caras de cada hoja; **manilla de ventana** (cremona) por
  dentro, en el perfil de cierre de la primera hoja (la cara de dentro sale
  del lado del hueco, `inside`); **escudo** cuadrado en las manillas de
  puerta; el metal de la carpintería a 0,5 (salía negro). En Blender
  (`blender_casa.py`): cristal de verdad (vidrio con reflejo; transparente
  para las sombras, para que siga entrando el sol), bisel en las demás
  piezas y manillas metálicas; y **paisaje** (`PAISAJE`): césped de 200 m,
  70 árboles y 40 arbustos de primitivas con ruido, fuera de la parcela,
  siempre los mismos (semilla fija). Las ventanas siguen saliendo de cada
  hueco, sin modelo fijo. Probado: la ventana del dormitorio de "Test 2" en
  la web (junquillos y cremona) y en Blender (234 piezas tratadas, árboles
  por la ventana, 19,3 s). Trampa: PowerShell leía el guion sin UTF-8 y la
  "í" de "Carpintería" llegaba rota (anotado en la skill). Sin probar: una
  puerta de cerca, la corredera, la foto en calidad de la web con los
  junquillos, ni el paisaje visto desde fuera.

- **2026-10-17** · **El resto de muebles, detallados** (el usuario: "hazme
  el resto de muebles… camas, sillas, armarios, televisiones"). Nueve
  modelos más de Claude en Blender (escena "Salón y dormitorio"): mesa de
  comedor (faldón y patas cónicas), mesa de centro (con balda), silla
  (cojín, respaldo de dos travesaños, patas traseras que suben), televisión
  (marco fino y pie central), mesilla (cajón, hueco y patas), camas doble e
  individual (bastidor con patas, colchón, edredón beige, embozo, una o dos
  almohadas y cabecero tapizado a 1 m) y armarios (dos puertas de madera
  con tiradores largos, zócalo). Con ellos, **los 22 muebles del catálogo
  tienen modelo detallado**. Un `.glb` (12-294 KB) y un `.blend` por
  mueble. Cambio en `Furniture3D.tsx`: el modelo se ajusta al ancho y fondo
  del catálogo pero **conserva su alto** (antes lo estiraba al del
  catálogo, y la cama, de 0,5 m en el catálogo, habría aplastado el
  cabecero); la caja de líneas del elegido toma ese alto. Visto en el
  estudio de Blender y la cama doble en la web del entorno de pruebas
  (5185). Sin ver en la web: mesas, sillas, tele, mesilla, cama individual
  y armarios (solo en Blender), ni un render de la casa con ellos. En
  "Test 2" la cama doble cuelga del Baño 1 (está a caballo de las dos
  estancias): es del ejemplo, no se ha tocado.

- **2026-10-17** · **Color del asiento del taburete** (el usuario: blanco,
  rojo, azul y rosa). Parte `asiento` del taburete (material "Asiento
  taburete" del modelo), y campo `boxColor` en `FurniturePart`: el color de
  las cajas de "Sencillos" que hacen de esa parte, para teñirlas también (la
  tapicería del sofá lo usa ahora en lugar de buscar 'tapiceria' a mano). El
  aviso de Propiedades nombra solo las partes que no se ven en "Sencillos".
  Probado en el entorno de pruebas (5185): un taburete rojo y otro rosa por
  funciones, el rechazo de "verde" y la vista 3D.

- **2026-10-17** · **Taburete detallado rehecho** (el usuario: "el taburete
  no es correcto"). Las patas asomaban fuera del asiento, iban inclinadas al
  revés (abiertas arriba), eran más gruesas abajo y el aro no las tocaba.
  Ahora salen de debajo del asiento (a 9,5 cm del centro), se abren hacia el
  suelo (14 cm), son más finas abajo y el aro pasa por ellas a 0,25 m.
  `taburete.glb` y `taburete.blend` vueltos a guardar; visto de cerca en
  Blender.

- **2026-10-17** · **Toda la cocina detallada** (el usuario: "hazme todo",
  tras quedar en cajas horno, vitro, fregadero, armario pequeño, mesa con
  armarios y taburete). Seis modelos más de Claude en Blender, con la misma
  forma que tenían las cajas: horno (panel negro con mandos y pantalla,
  ventana oscura, tirador), vitro (cristal negro con cuatro fuegos de aros y
  teclas), fregadero (marco de acero, cubeta cepillada, grifo de cuello
  curvo), armario pequeño (puertas de madera con tiradores), mesa con
  armarios (puerta en el extremo -x con su tirador, paño fijo, tablero de
  madera, zócalo) y taburete (asiento tapizado, patas abiertas y aro).
  `.glb` de 16 a 254 KB y su `.blend` cada uno; `model` en el catálogo.
  Probado en el entorno de pruebas (5185): la cocina de "Test 2" con todo
  detallado en la web y la misma vista en Blender (100 muestras, 20,8 s).
  El usuario dice que la web va bien con los modelos detallados. El armario
  de dormitorio y el medio siguen en cajas (la misma forma, otro tipo).

- **2026-10-17** · **Frigoríficos, lavadoras y lavavajillas detallados** (el
  usuario: "podemos hacer el frigorífico, la lavadora y lavavajillas"; los vio
  en un render de estudio, pidió el lavavajillas blanco en vez de gris y le
  parecieron "muy chulos"). Seis modelos hechos por Claude en Blender, uno
  por tipo y no uno estirado (en la lavadora pequeña el ojo de buey saldría
  ovalado): `public/modelos/<id>.glb` (43-134 KB) y su
  `modelos-blender/<id>.blend` cada uno, **separados** (el usuario: "no
  todos juntos"). `model` en sus seis líneas del catálogo. Sin partes de
  color. En la web, el metal de los modelos detallados se deja en 0,5:
  los tiradores de acero salían negros. Probado en el entorno de pruebas
  (5185) en la cocina de "Test 2": frigorífico, lavadora y lavavajillas
  pequeño con "Detallados". Después, la misma cocina en Blender (GLB
  directo desde 5185 y render a 100 muestras en 18,6 s): salen bien. El
  metal a medias de la web viajaba en el GLB; `blender_casa.py` devuelve a
  metal del todo los materiales "Acero…". Sin probar: el horno (sigue en
  cajas) ni la foto en calidad de la web. Trampa anotada en
  `modelos-blender/LEEME.md`: el exportador mete todas las escenas del
  archivo si no se usa `use_active_scene`.

- **2026-10-17** · **Los colores del sofá llegan a Blender**: el sofá que
  configuró el usuario en el entorno de pruebas (azul, cojín izquierdo
  blanco, derecho rojo), enviado directo con `enviarA` y renderizado a 100
  muestras en 15,3 s con la cámara de la vista. Los tres colores llegan; el
  rojo sale más claro, casi salmón, por el sol y el brillo de la tela.

- **2026-10-17** · **El mueble detallado elegido ya no se tiñe** (el usuario:
  el sofá azul se veía rosa al abrir sus propiedades; era el naranja del
  resalte sobre el azul). En `DetailedModel` (`Furniture3D.tsx`) el elegido
  se marca con una caja de líneas naranjas a su alrededor y conserva sus
  colores; los muebles de cajas siguen tiñéndose como antes. Probado en el
  entorno de pruebas (5185): el sofá azul elegido sigue azul. Si se exporta
  el GLB con el sofá elegido, la caja de líneas va dentro.

- **2026-10-17** · **Colores por partes de un mueble, prueba con el sofá**
  (el usuario: elegir el color del sofá entre azul, blanco y rosa, y cada
  cojín por separado en azul, blanco y rojo; antes pidió que se guarde qué se
  puede cambiar de cada mueble). `parts` y `FurniturePart` en el catálogo
  (`furniture.ts`, con `partChoices`), `colors` en `FurnitureItem`,
  `setFurnitureColor` en `store.ts`, botones por parte en Propiedades del
  mueble (`.part-choices`), y `Furniture3D` pinta cada material del modelo
  por su nombre; en las cajas, solo la tapicería. En el `.blend` y el `.glb`
  del sofá, cada cojín decorativo tiene ya su material ("Cojín izquierdo",
  "Cojín derecho"). `catalogoMuebles` da los `colores` posibles,
  `cambiarMueble` admite `colores` y `casa().muebles` los devuelve. Colores
  de la prueba, míos. Probado en el entorno de pruebas (5185): las tres
  partes por funciones, los dos rechazos (parte que no se puede cambiar,
  color que no está), la vista 3D (rosa, rojo y azul) y un clic en
  "Blanco". Sin probar: en Blender, guardar y cargar el plano, deshacer, ni
  la foto en calidad. El color no cambia el código de artículo.

- **2026-10-17** · **Original del sofá guardado**: `modelos-blender/sofa.blend`
  (solo la escena "Sofá", 80 KB, en el repositorio público, como propuse),
  con `modelos-blender/LEEME.md`: cada mueble detallado lleva su `.blend`
  editable ahí y su `.glb` para la web en `public/modelos/`. Comprobado que
  el archivo se lee (la escena, 19 objetos y 5 materiales).

- **2026-10-17** · **Decidido por el usuario: Blender es muy superior a la
  web en el render, la web es muy buena para lo que es, y se deja como
  está.** Anotado en la skill `crear-casas`, con lo que se puede hacer con
  Blender desde `localhost` y desde GitHub Pages.

- **2026-10-17** · **Sofá detallado (alta) en la web, sin perder el sencillo**
  (el usuario: "vamos a poner el sofá high en la web… pero no perdemos el
  sofá low"; antes se habló de tener dos modelos por mueble, uno ligero para
  la web y otro detallado). Sofá modelado por Claude en Blender (escena
  "Sofá": cojines sueltos, cantos redondeados, patas de roble, dos cojines
  beige), exportado a `public/modelos/sofa.glb` (430 KB, 28.000 triángulos).
  Campo `model` en `FurnitureType` (solo el sofá lo tiene),
  `detailedFurniture` en `store.ts` (se guarda en el navegador, por defecto
  apagado) y botones **"Sencillos / Detallados"** en la barra de la vista 3D.
  `Furniture3D` carga el modelo con `GLTFLoader`, lo ajusta a las medidas del
  catálogo y lo resalta al elegirlo; mientras descarga, las cajas. Probado en
  el entorno de pruebas (5185) con "Test 2": se ve en la vista 3D y en la
  **foto en calidad** (100 muestras). En la foto la tela sale más gris y con
  un borde claro (el brillo aterciopelado), sin ajustar. Después, la misma
  vista en Blender: GLB enviado directo desde 5185 (`enviarA`, 4,5 MB, ya
  con el sofá detallado dentro), `blender_casa.py` con la cámara de la vista
  (no de una foto guardada) y render a 100 muestras en 15,7 s; la tela sale
  azulada como en la escena "Sofá". Sin probar: VR, AR ni el rendimiento
  con muchos.

- **2026-10-17** · **Las fotos se despliegan en el árbol** (lo pidió el
  usuario: para subir una imagen tenía que abrir la foto en el visor y
  salir con Esc). "Fotos" lleva flecha y, dentro, "Foto N" con su fecha;
  elegir una lleva la cámara a su sitio (`goTo`) y deja sus botones en
  Propiedades, sin abrir el visor. En `HouseTree.tsx`. Probado por el usuario en GitHub
  Pages: **funciona** (yo no pude: una ventana emergente abierta en el
  navegador de la app paraba los scripts).

- **2026-10-17** · El usuario probó "Subir imagen" en GitHub Pages con los
  renders de Blender: **funciona**. Receta completa ("renderizar las fotos
  de la web con Blender") anotada en la skill `crear-casas`.

- **2026-10-17** · **Botón "Subir imagen"** en la foto elegida del panel
  Fotos (lo pidió el usuario: desde GitHub Pages la página no puede leer
  archivos del equipo, así que los renders de Blender se suben a mano).
  Cambia la imagen por la que se elija, en JPEG al 92 %, y conserva número,
  cámara y objetivo; `replaceImage` en `photos.ts`, que usa también
  `cambiarImagenFoto`. Renders de las dos fotos de la casa del usuario en
  Blender (salón 17,8 s, dormitorio 31,7 s, a 100 muestras) dejados en
  Descargas como `eurocasa-casa-2026-10-17_foto1.jpg` y `_foto2.jpg` (la
  casa no tiene nombre: se usa el del GLB). Solo `tsc`: en la web local no
  había fotos para ver el botón.

- **2026-10-16** · **GLB directo a Blender, sin descarga** (lo pidió el
  usuario, también desde GitHub Pages). `descargarGlb({ enviarA })` manda el
  `.glb` por POST a esa dirección (`GlbRequest` en `store.ts`, `GlbExport` en
  `View3D.tsx`; el botón sigue descargando), y
  `.claude/skills/crear-casas/blender_receptor.py` abre dentro de Blender un
  receptor de un solo uso en `127.0.0.1:8765` (con las cabeceras de CORS y
  de red privada) que lo deja en la carpeta temporal, de donde lo coge
  `blender_casa.py`. Probado desde `localhost:5173`: 4 MB recibidos sin
  pantalla. **Desde la web publicada el navegador de la app lo bloquea**
  (`ERR_BLOCKED_BY_CLIENT`, con un envío de prueba); en Chrome sin probar,
  puede pedir permiso de red local. Si falla, queda la descarga.

- **2026-10-16** · **Receta "pasar la casa a Blender"** en la skill
  `crear-casas` (lo pidió el usuario: llevar el GLB directo a Blender), con el
  guion `.claude/skills/crear-casas/blender_casa.py`, que Claude rellena con
  `casa().fotos` y manda por el conector: quita la casa anterior, importa el
  GLB más reciente de Descargas en la colección "Casa EuroCasa" y pone
  Cycles en CUDA, cielo y sol, techo, luces de los focos y una cámara por
  foto. Sin cambios en la web. Probado con la casa del usuario: 5 focos, techo
  de 13 × 4,2 m y las dos cámaras, vista la del dormitorio. La descarga del
  GLB desde el navegador de la app se quedó en `.tmp` (esperando a aceptarla):
  se probó con el GLB que ya había bajado el usuario.

- **2026-10-16** · **`cambiarImagenFoto`** en `window.eurocasa` (lo pidió el
  usuario, para meter en la web el render de Blender en lugar de la foto
  trazada): cambia la imagen de una foto guardada por otra leída de una
  dirección (`data:` o ruta del servidor), en JPEG al 92 %, y conserva número,
  cámara y objetivo. `casa().fotos` devuelve ahora también la `camara`
  (altura, giro, cabeceo, objetivo, ancho y alto), con la receta para
  copiarla en Blender en la skill `crear-casas`. Antes se hizo a mano con la
  foto 2 del salón en el navegador de la app (5173). Renders: 18,8 s en GPU
  (CUDA) frente a 172,9 s en CPU, misma calidad; OptiX falla al cargar su
  núcleo (driver de NVIDIA, supuesto) y se queda CUDA. Probado: `casa().fotos`
  con la cámara y los dos rechazos (foto que no existe, imagen que no se
  lee); la sustitución buena solo con el código a mano de antes.

- **2026-10-16** · **Primer render en Blender** (al usuario le ha quedado
  "muy bien"). Sobre el GLB importado, Claude puso por el conector: Cycles,
  cielo físico y sol, techo sobre la casa, una luz de área en cada disco
  emisivo de los focos y una cámara por cada foto guardada en la web (leídas
  del IndexedDB del navegador). Paso de la pose de la web a Blender:
  posición (x + 14, −(z + 10), y), giro (90° + pitch, 0, yaw), objetivo como
  ángulo vertical. Foto 2 del salón a 100 muestras. De paso, las
  preferencias de Blender pasan a OptiX (RTX 3060); antes renderizaba en la
  CPU. Nada en el código.

- **2026-10-16** · **Conector de Blender** (lo pidió el usuario, para renderizar
  la casa en Blender). Blender 5.2.2 LTS (quitó la 3.0), `uv` 0.13.1 en
  `C:\Users\arlan\.local\bin`, addon "MCP for Blender" (antes BlenderMCP, de
  la comunidad) instalado con `uvx mcp-for-blender install-addon`, y el
  servidor en `.mcp.json` del proyecto, **fuera de git** (lleva rutas de este
  equipo). Python fijado a 3.12 y sin descargas: uv fallaba al crear el enlace
  de carpeta de la versión menor en `AppData\Roaming\uv\python`. **Conexión
  probada** (2026-10-16): Claude ve Blender 5.2.2 y el addon al día
  (protocolo 13). Bibliotecas de modelos y generadores 3D apagados.

- **2026-10-16** · **Descargar la casa como GLB** (el usuario: "podemos crear
  la función de descargar glb?", para llevarla a Blender y renderizar mejor;
  después preguntó si Unity lo abre: sí, con el paquete glTFast o UnityGLTF).
  Botón **"Descargar GLB"** en la barra de la vista 3D y función
  `descargarGlb()` en `window.eurocasa` (evento `GLB_EVENT` de `store.ts`);
  `GlbExport` en `View3D.tsx` exporta con `GLTFExporter` lo que cuelga del
  grupo `casa` (metros, plano (x, y) como (x, z), esquina de la parcela en el
  origen; incluye el césped de la parcela). Los focos van como **discos
  emisivos, sin luz**: la luz la pone Blender. No lleva techo ni cámara, y lo
  elegido sale con su color de resalte. Es de una sola dirección. Probado en
  el servidor aparte (5185): casa con salón, puerta, suelo de pino y sofá, GLB
  válido de 1,3 MB con 36 nodos y la textura. **Sin abrirlo aún en Blender ni
  en Unity.** En la skill `crear-casas`.

- **2026-10-12** · **Dos casas de ejemplo públicas, "Test 1" y "Test 2"** (el
  usuario: "podemos poner esta casa dentro de los ejemplos públicos, que se
  pueda escoger entre el test 1 y este test 2"). `public/ejemplos/ejemplo2.json`
  sale del plano que el usuario bajó de la web (`eurocasa-plano-2026-10-12.json`
  de Descargas: el Salón de 6,6 × 4,2 con la cocina, el desayunador en L y
  los taburetes, dos dormitorios y dos baños), **sin las dos fotos** (el
  repositorio es público; como el primero). `PlanFileButtons.tsx`: el botón
  "Cargar ejemplo" pasa a "Cargar ejemplo:" con dos botones, "Test 1" y
  "Test 2" (`EXAMPLES`: para añadir otro, su archivo y una línea). Compila y
  `dist` lleva los dos archivos; **sin probar los botones a la vista**
  (había una ventana emergente abierta que bloqueaba el navegador).

- **2026-10-12** · **Foto en calidad con 100 muestras por defecto** (el
  usuario: "las fotos de calidad por defecto con 100"): `DEFAULT_PHOTO_SAMPLES`
  en `store.ts` en lugar de la mayor de las tres. Quien ya tenga guardado otro
  número en el navegador lo conserva; el cambio vale para planos nuevos y
  navegadores sin ajuste. Se sigue pudiendo elegir 50, 100 o 200.

- **2026-10-12** · **Fregadero y vitro en la casa de la web publicada** (el
  usuario: "me falta el fregadero y la vitro"): fregadero sobre el armario
  (`x` 5,12) y vitro sobre el lavavajillas (`x` 4,59), los dos a `altura`
  0,84 (cara de arriba de la encimera) y centrados en su fondo (`y` 0,45), a
  8 cm entre ellos. El fregadero queda bajo la ventana norte. Visto en 3D.

- **2026-10-12** · **Correcciones de la casa de la web publicada** (el
  usuario: "aplica todas las correcciones"): hilera de la cocina sin solapes
  (lavavajillas `x` 4,59, armario 5,12, lavadora 5,65, frigorífico 6,25; la
  hilera entera cabía justo, con 5 mm de aire entre las piezas); armario
  elevado 2 cm (`altura` 0,02) para que su tapa llegue a los 0,82 de los
  electrodomésticos normales; tapa de pino a 4,28 con 0,82 de alto; encimera
  de 1,68 m a 0,82 m (de la tapa al frigorífico); tele sobre la mesa de
  centro (`altura` 0,4) y de cara a la estancia; mesa de centro y tele 30
  cm al oeste; desayunador pegado a la tapa (`x` 3,97) y taburetes a 3,45.
  Hecho con las funciones, en el navegador de la app (web publicada, versión
  `3ffd96a`). Los muebles movidos se han quitado y vuelto a poner: cambian
  de `id`.

- **2026-10-12** · **Desayunador y dos taburetes en la casa de la web
  publicada** (el usuario: "ahora estoy en la casa de GitHub, me revisas
  las posiciones y tamaños y me pones el armario desayunador con dos
  taburetes"). En la casa del Salón de 6,6 × 4,2 m de la web publicada
  (versión `3ffd96a`): la mesa con armarios en L al oeste de la hilera
  (`x` 4,04, `y` 0,75, `espalda: 'oeste'`) y dos taburetes en su cara oeste
  (`x` 3,52, `y` 0,95 y 1,3). Hecho con las funciones, sin tocar el resto.
  Revisión de lo que había: lavavajillas, armario y lavadora se pisan 2,5
  cm; el armario ahora mide 0,8 y los otros 0,82; la encimera está a 0,81 m
  (1 cm metida en los electrodomésticos); la tele mira a la pared norte y
  está en el suelo, dentro de la mesa de centro. **Sin corregir**: pendiente
  de que el usuario diga.

- **2026-10-12** · **Tirador vertical y taburetes** (el usuario: "el tirador en
  vertical" y "hace falta crear unos taburetes"): el tirador de la mesa con
  armarios pasa a una barra vertical junto al canto de la puerta; nuevo mueble
  `taburete` (forma `stool`: asiento redondo, cuatro patas y travesaños), 0,35
  × 0,35 × 0,65 m, familia Cocina, código provisional `MOB-TABURETE`; `Box`
  de `Furniture3D.tsx` admite `flat` (disco horizontal). Probado en el
  entorno de pruebas (5185) con dos junto al desayunador, y quitados después.
  Medidas inventadas.

- **2026-10-12** · **Desayunador: puerta hacia la cocina y de menos de media
  mesa** (el usuario: "la puerta mira hacia la cocina, pero solo puede ser de
  menos de mitad de armario para que se pueda abrir"): la forma
  `cabinet-table` lleva ahora **una sola puerta de 0,5 m en el extremo -x** y
  un paño fijo en el resto (antes una al medio, de 0,56). En la L, mirando la
  mesa hacia la cocina (`espalda: 'oeste'`), ese extremo cae al sur, el libre.
  Anotado en `crear-cocinas`. Visto en 3D. Cambia la mesa con armarios del
  catálogo para todas las casas.

- **2026-10-12** · **Puerta del desayunador en la otra cara** (el usuario: "el
  tirador está mal, hay que ponerlo en la otra puerta" y, al preguntarle
  cuál, "solo hay una puerta"): lo entendí como que la puerta, que es una
  sola, tiene que ir por la otra cara. El desayunador gira 180°
  (`espalda: 'este'`): ahora puerta y tirador miran hacia el salón, fuera de
  la L. Entorno de pruebas (5185); anotado en `crear-cocinas`. Visto en 3D.
  Lectura mía: si no era eso, queda por aclarar.

- **2026-10-12** · **Desayunador en L** (el usuario: "se pone formando una
  L"): en la cocina de prueba (5185) la mesa con armarios va perpendicular a
  la hilera, en el extremo del armario, saliendo de la pared norte hacia el
  sur, con las puertas hacia el lado de trabajo (este; lo supuse). Anotado en
  `crear-cocinas`. Visto en 3D. Su tablero (0,8) queda 2 cm por debajo de la
  encimera (0,82).

- **2026-10-12** · **El "armario desayunador" es la mesa con armarios**
  (el usuario preguntó si estaba creado y contestó "esa mesa con
  armarios"): no hay pieza nueva; anotado en `crear-cocinas`. Sin voladizo ni
  taburetes, y de 0,8 m de alto.

- **2026-10-12** · **Encimera recortada a 1,35 m** (el usuario preguntó si
  la había ajustado: no, solo lo había propuesto): vuelta a 1,35 × 0,02 × 0,6
  m a 0,80, a ras del armario por la izquierda y del frigorífico por la
  derecha, sin sobresalir. Entorno de pruebas (5185).

- **2026-10-12** · **Skill `crear-cocinas` reescrito** (el usuario: "así podría
  quedar, anota en el skill cómo hemos trabajado") y **tapa lateral
  quitada** ("quita este último tablón"). El skill pasa a tener: cómo hemos
  trabajado (un paso cada vez, frases cortas, preguntar con opciones si hay
  varias lecturas, rehacer sin miedo, enseñar siempre, entorno de pruebas),
  las piezas, las reglas decididas por el usuario, la receta completa de la
  cocina de prueba, las trampas que nos hemos encontrado y lo pendiente. En el
  entorno de pruebas (5185) queda sin la tapa de pino; la encimera se queda
  con 1,36 m, unos 1,5 cm salida por la izquierda del armario.

- **2026-10-12** · **La encimera, encima de la tapa** (el usuario: "la
  encimera que quede encima del tablón"): la tapa lateral baja a 0,80 m y la
  encimera, de 1,36 m, empieza en ella y llega justo al frigorífico, así que
  la cubre. Entorno de pruebas (5185); anotado en `crear-cocinas`. Visto en
  3D.

- **2026-10-12** · **Tapa lateral en vez del bloque** (el usuario: "la tapa al
  otro lado", y tras preguntarle, "la 1, y quita el bloque macizo"): en la
  cocina de prueba (5185) se quita el bloque de pino que tapaba el armario y
  se pone una **tapa de canto** de 0,02 × 0,82 × 0,6 m a la izquierda del
  armario, para cerrar el costado a la vista. Anotado en `crear-cocinas`.
  Visto en 3D desde la esquina suroeste.

- **2026-10-12** · **Armario tapado con un tablón de madera** (el usuario:
  "tapamos el armario con un tablón de madera"): en la cocina de prueba
  (5185), un tablero de pino de 0,45 × 0,8 × 0,61 m en la pared norte,
  sobre el armario. Bloque macizo, porque un tablero no puede quedar paralelo
  a la pared a 0,6 m; el armario queda oculto debajo. Anotado como paso 5 en
  `crear-cocinas`. Visto en 3D (la veta sale vertical).

- **2026-10-12** · **Fregadero sobre el armario y vitro a su lado** (el
  usuario: "el fregadero encima del armario pero separado de la pared", "y
  la vitro al lado pero no pegado"): el fregadero vuelve a su sitio sobre el
  armario, y la vitro queda a 10 cm a su derecha; los dos separados de la
  pared (centrados en el fondo de la encimera). Anula el centrado a lo
  ancho del paso anterior. Entorno de pruebas (5185); anotado en
  `crear-cocinas`. Visto en 3D.

- **2026-10-12** · **Fregadero y vitro centrados también en el fondo** (el
  usuario: "no centrado en el otro eje"): los dos a la `y` del centro de la
  encimera (0,45 m en la prueba), no pegados a la pared. Entorno de pruebas
  (5185); anotado en `crear-cocinas`. Visto en 3D.

- **2026-10-12** · **Fregadero y vitro centrados y separados** (el usuario:
  "separa un poco más la vitro y céntralos en la encimera"): 12 cm entre el
  fregadero y la vitro, y el conjunto centrado en la encimera (16,5 cm de
  sobra a cada lado). Entorno de pruebas (5185); anotado en `crear-cocinas`.
  La separación de 12 cm la elegí yo; interpreté "centrarlos" como a lo
  ancho de la encimera, no en el fondo (siguen contra la pared).

- **2026-10-12** · **Paso 4 de la cocina de prueba** (el usuario: "ponemos
  encima del armario el fregadero, del lavavajillas la vitro"): el fregadero
  sobre el armario y la vitrocerámica sobre el lavavajillas pequeño, los dos
  encima de la encimera, a 0,82 m. Entorno de pruebas (5185); anotado en
  `crear-cocinas`. La vitro (0,5) sobresale 2,5 cm del lavavajillas (0,45) y
  toca al fregadero. Visto en 3D.

- **2026-10-12** · **Encimera corregida de posición** (el usuario: "la
  encimera está desplazada a la derecha"): al rehacerla más fina reutilicé la
  `posicion` devuelta, ya redondeada, y la corrí 2 cm a la derecha, hasta
  meterse en el frigorífico. Vuelta a colocar con el centro calculado desde
  los muebles (2,575 m): queda a menos de medio centímetro de los de
  abajo y a ras del frigorífico. Regla anotada en `crear-cocinas`. El
  redondeo de `posicion` al centímetro en `ponerTablero` sigue ahí.

- **2026-10-12** · **Encimera más fina** (el usuario: "la encimera es menos
  gruesa"): de 4 a **2 cm** de grueso, a 0,80 m (cara de arriba a 0,82).
  Rehecha con `quitarTablero` y `ponerTablero` en el entorno de pruebas
  (5185); anotado en `crear-cocinas`.

- **2026-10-12** · **Encimera de la cocina de prueba** (el usuario: "pon la
  encimera que es un tablón de la pared, me lo pones de gris perla"): tablero
  de granito gris perla, 1,35 × 0,04 × 0,6 m a 0,80 m, sobre el armario, el
  lavavajillas y la lavadora, llegando al frigorífico. Con `ponerTablero`
  en el entorno de pruebas (5185); anotado como paso 3 en `crear-cocinas`.
  Visto en 3D.

- **2026-10-12** · **El armario, al otro lado** (el usuario: "el armario va
  al otro lado"): en la cocina de prueba (5185) la hilera queda de izquierda a
  derecha como armario, lavavajillas pequeño, lavadora pequeña y
  frigorífico; antes el armario estaba junto al frigorífico. Interpreté "el
  otro lado" como el extremo izquierdo de la hilera. Anotado en
  `crear-cocinas`. Visto en 3D.

- **2026-10-12** · **Armario de cocina a 80 cm de alto** (el usuario: "hay
  que dejarlo con 80, para poner luego una encimera encima"): el
  `armario-cocina` pasa de 0,82 a 0,80, como el lavavajillas y la lavadora
  pequeños, para que la encimera apoye a ras. Anotado en `crear-cocinas`.

- **2026-10-12** · **Lavavajillas y lavadora pequeños: 45 de ancho × 60 de
  fondo** (el usuario preguntó si tenían 60 de fondo y lo confirmó: yo los
  había puesto de 60 de ancho y 45 de fondo, al revés). `lavavajillas-pequeno`
  y `lavadora-pequena` pasan a 0,45 × 0,6 × 0,8 m. La hilera de la cocina de
  prueba (5185) se rehízo y queda toda a 0,6 de fondo, sin escalón. Hay que
  tenerlo en cuenta en lo anterior de este registro, donde figuran 60 × 45.

- **2026-10-12** · **Paso 2 de la cocina de prueba** (el usuario: "vamos a
  poner un lavavajillas pequeño, una lavadora pequeña y un armario
  pequeño"). En el entorno de pruebas (5185): armario de 45 cm junto al
  frigorífico, lavadora pequeña y lavavajillas pequeño a su izquierda, contra
  la pared norte. Anotado en el skill `crear-cocinas`. Los frentes de los
  pequeños (0,45 de fondo) quedan 15 cm por detrás del armario. Visto en 3D.

- **2026-10-12** · **Cerrar la puerta por funciones** (el usuario: "cierra la
  puerta que no veo", en la casa de la cocina): `cerrada` en `ponerHueco` y
  `cambiarHueco` (pone `closed`, lo del botón "Cerrar la puerta en 3D");
  `casa().huecos` lo devuelve como `cerrada` en las puertas abatibles; en
  la skill `crear-casas`. Probado en el servidor aparte (5185): la puerta
  del salón sale cerrada en la vista 3D. El plano 2D la dibuja siempre
  abierta.

- **2026-10-12** · **Skill `crear-cocinas`** (lo pidió el usuario: hacer la
  cocina poco a poco y que el skill vaya mejorando). Nuevo
  `.claude/skills/crear-cocinas/SKILL.md`, aparte de `crear-casas`: las
  piezas de la familia Cocina con sus medidas, las reglas decididas
  (marcadas "usuario" o provisionales), una receta para una hilera en la
  pared norte y los límites de hoy. En el entorno de pruebas (5185) se
  **limpió** la casa de la cocina: queda el salón de 4 × 3 m con solo la
  puerta y la ventana, y se empezó por el frigorífico pequeño de 1,80 m en
  la esquina noreste (paso 1, a petición del usuario).

- **2026-10-12** · **Tableros por funciones y cocina nueva en el entorno de
  pruebas** (el usuario: "empezamos de nuevo otra casa para crear una
  habitación y preparar la cocina", y "preparas las funciones"). En
  `window.eurocasa`: `ponerTablero` (estancia, lado, ancho, alto, fondo,
  posición del centro, altura del borde inferior y acabado) y
  `quitarTablero`; `casa()` devuelve los `tableros`; en la skill
  `crear-casas`. Con ellas se montó en el servidor aparte (5185) una casa
  nueva, `Salón` de 4 × 3 m con puerta al sur y ventana al norte, y la cocina
  contra la pared norte: lavavajillas, armario pequeño, lavadora y
  frigorífico seguidos desde el este, la **encimera** (tablero de granito
  gris perla de 0,04 a 0,82 m, 0,6 de fondo, sobre las tres primeras
  piezas) y la vitro encima a 0,86 m. Visto en 3D. **Sin hacer**: el
  tablero que tape los frentes (queda por confirmar con el usuario qué
  quería; un tablero siempre cuelga de una pared, no puede quedar a 0,6 m
  de ella paralelo a ella), el fregadero en esa casa y el archivo en
  `comercial/`.

- **2026-10-12** · **Deshacer y rehacer** (lo pidió el usuario tras mover una
  estancia por error y perder los huecos: "hazme el deshacer con Ctrl+Z").
  Nuevo `src/history.ts`: vigila las listas de la casa (`modules`,
  `shells`, `openings`, `joints`, `furniture`) y guarda la anterior en
  una pila de hasta 100 pasos; los cambios seguidos (menos de 0,5 s, o un
  arrastre entero) cuentan como uno. **Ctrl+Z** deshace, **Ctrl+Y** o
  **Ctrl+Mayús+Z** rehace (no con el foco en una casilla: ahí vale el
  deshacer del navegador), y hay botones **Deshacer** y **Rehacer** arriba
  del panel izquierdo. En `window.eurocasa`, `deshacer()` y `rehacer()`.
  Lo que escribe otra ventana no cuenta como paso (`historyGate` en
  `store.ts`). **No cubre** las fotos (IndexedDB), la cámara ni las opciones
  de vista: "Nuevo plano" y "Cargar plano" se deshacen en la casa, pero las
  fotos que borraron no vuelven. La pila se pierde al recargar la página.
  Probado en el servidor aparte (5185): quitar un hueco y deshacer lo
  devuelve, un segundo paso quita el sofá, rehacer, el tope ("No hay nada que
  deshacer") y las teclas Ctrl+Z, Ctrl+Y y Ctrl+Mayús+Z. Sin probar con el
  ratón: arrastrar una estancia y deshacer.

- **2026-10-12** · **Mesa con armarios: una sola puerta al medio** (el
  usuario: "solo puede haber una puerta al medio"; luego "me falta el
  tirador": el tirador pasó de vertical a un lado a una barra horizontal
  centrada arriba, como la del lavavajillas, porque quedaba tapado). Dos paños fijos a los
  lados y una puerta centrada con el tirador a su derecha; el plano ya no la
  dibuja con la raya central. Su otra queja, "la puerta está en el otro
  lado", la entiendo así: la puerta va en la cara delantera (con giro 0, al
  sur; su espalda al norte, como el resto de muebles) y en su cocina esa
  cara queda de espaldas a la cámara; **se arregla girándola 180°** (R o
  "Girar 90°" dos veces). Sin tocar la convención del catálogo. Por
  confirmar con el usuario. Visto en 3D en el servidor aparte (5185).

- **2026-10-12** · **Mesa con armarios** (lo pidió el usuario: 120 × 60 y 80
  de alto, con armarios). Forma `cabinet-table`, tipo `mesa-armarios`,
  familia **Cocina** (decisión mía: venía de montar la cocina), código
  provisional `MOB-MESA-ARMARIOS`: tablero de madera de 4 cm, zócalo oscuro,
  cuerpo blanco y **dos puertas** con tirador al frente. El plano la dibuja
  con la raya central, como el armario. **Interpretación mía**: "tenga
  armarios" como un mueble bajo cerrado, no una mesa con cajoneras a los
  lados; sin cajones ni estantes. Visto en 3D en el servidor aparte (5185).

- **2026-10-12** · **Fregadero** en la familia Cocina (lo pidió el usuario:
  "primero hazme el fregadero"; el resto se habló en el chat). Forma `sink`,
  tipo `fregadero`, 80 × 50 cm de un seno, código provisional
  `MOB-FREGADERO`: marco bajo de acero (2 cm), cubeta como una placa más
  oscura y grifo detrás. **Sin profundidad** (el usuario: "lo mejor es no
  hacerlo profundo"): se apoya sobre la encimera y no necesita agujero en el
  tablón; el hueco en el tablero queda descartado por ahora. Medidas mías (el
  usuario no las dijo): 40 × 45 cm de ancho y fondo, una sola pila (antes 80 × 50 y luego 50 × 45: "más pequeño, es una sola pila"), sin escurridor. Se coloca con su
  base a 0,9 m (`lift`); con la casilla de altura se pone a la del tablón.
  Visto en 3D en el servidor aparte (5185).

- **2026-10-12** · **WASD más lento** (el usuario: iba muy rápido):
  `MOVE_SPEED` de 10 a 4 m/s (volando) y `WALK_SPEED` de 4 a 1,5 m/s (a pie)
  en `View3D.tsx`. La rueda (1,5 m por paso) y el giro con el ratón no se
  han tocado. Valores míos, sin probar con el teclado: si siguen rápidos o
  lentos, se ajustan ahí.

- **2026-10-12** · **Asas separadas en los frigoríficos** (lo pidió el
  usuario): el asa del frío cruzaba la junta y entraba en la puerta del
  congelador. Ahora cada puerta lleva la suya, entera dentro de su puerta y
  con holgura entre las dos. Visto en 3D en el servidor aparte (5185).

- **2026-10-12** · **Ojo de buey redondo y horno** (lo pidió el usuario: la
  parte negra de la lavadora parecía un horno, y un horno con las medidas del
  lavavajillas). `Box` de `Furniture3D.tsx` admite `round` (un disco, con el
  eje a lo largo de z): la lavadora lleva un aro cromado y el cristal oscuro,
  redondos. Forma nueva `oven` y tipo `horno`, 60 × 60 × 82 cm (las del
  lavavajillas **normal**; el pequeño no tiene horno), código provisional
  `MOB-HORNO`: panel de mandos con tres mandos redondos, tirador y ventana.
  Visto en el servidor aparte (5185) en 3D, junto a la lavadora y el
  lavavajillas. El plano 2D los dibuja como una caja.

- **2026-10-12** · **Altura de un mueble sobre el suelo** (opción A, elegida
  por el usuario, para poner la tele sobre una mesilla). Campo `elevation` en
  `FurnitureItem` y `liftOf` en `furniture.ts` (la del mueble, y si no la de
  su tipo, `lift`); `setFurnitureElevation` en `store.ts`; casilla "Altura:
  Sobre el suelo (m)" en Propiedades del mueble, entre 0 y la altura de pared
  menos la del mueble; `Furniture3D` la usa. En `window.eurocasa`:
  `cambiarMueble({ mueble, altura })`, `altura` en `ponerMueble` y `casa()`
  la devuelve; su parte en la skill `crear-casas`. **No hay apoyo
  automático**: la altura la escribe quien coloca, y si se mueve el mueble de
  debajo, el de encima se queda donde estaba. El archivo de plano no cambia
  de versión (el campo viaja con el mueble). Probado en el servidor aparte
  (5185): la tele a 0,5 m sobre una mesilla en 3D y el rechazo de 2,5 m.
  Sin probar: la casilla con el teclado, ni la foto en calidad. La tele sigue
  llevando su pie; no he hecho una "sin pie".

- **2026-10-12** · **Armario pequeño de cocina corregido**: 45 de ancho × 60
  de fondo × **82** de alto, como el lavavajillas (el usuario lo confirmó; el
  45 × 45 era ancho y alto, y el alto es 82). Sigue sin verse a la vista.

- **2026-10-12** · **Armario pequeño de cocina** (el usuario: "de 60 de
  profundo y 45x45, para ponerlo al lado del lavavajillas"): `armario-cocina`,
  familia Cocina, 45 cm de ancho × 60 de fondo × 45 de alto, código
  provisional `MOB-ARMARIO-COCINA`, forma `wardrobe` (dos puertas). **El
  "45 × 45" lo entendí como ancho y alto: por confirmar.** Solo `tsc`; sin
  verlo a la vista.

- **2026-10-12** · **Congelador arriba** en los frigoríficos (el usuario: "el
  congelado pequeño va en la parte superior"). Forma `fridge`: congelador
  arriba, un 25 % del alto, y el frío debajo; los tiradores se ajustan.
  Visto en el servidor aparte (5185) en 3D.

- **2026-10-12** · **Frigorífico con dos puertas y lavadoras** (lo pidió el
  usuario: la puerta lateral con dos partes, frío y congelador, y una
  lavadora con los tamaños del lavavajillas). Forma nueva `fridge`: dos
  puertas, arriba el frío y abajo el congelador (un 32 % del alto), con
  bisagras a la izquierda y tiradores verticales a la derecha (**supuesto**:
  no dijo de qué lado; "puerta lateral" lo entendí así). Forma `washer` y dos
  tipos, `lavadora` 60 × 60 × 82 y `lavadora-pequena` 60 × 45 × 80, códigos
  provisionales `MOB-LAVADORA` y `MOB-LAVADORA-PEQUENA`. Probado en el
  servidor aparte (5185) en 3D. Sin probar la foto en calidad. Aviso: los
  frigoríficos ya estaban en la pestaña **Cocina** del catálogo, que no es
  la que sale abierta (la primera es Salón).

- **2026-10-12** · **Vitrocerámica más fina** (el usuario: "no tan alta, que
  sea fina y negra"): grueso de 5 a 2 cm y aros más oscuros. Lo interpreté
  como el grueso de la pieza; la altura de colocación (`lift`, 0,9 m) no se
  ha tocado. Con ella elegida se ve rojiza (es el resalte de selección).
  Visto sin elegir en el servidor aparte (5185): negra y fina.

- **2026-10-12** · **Vitrocerámica de 4 fuegos** en la familia Cocina (lo
  pidió el usuario: 50 × 50). Forma nueva `hob` (placa negra con cuatro
  aros; en el plano, cuatro círculos) y campo opcional **`lift`** en
  `FurnitureType`: altura sobre el suelo a la que va colocada. La vitro lleva
  `lift` 0,9 m y 5 cm de grueso (medidas inventadas), código provisional
  `MOB-VITROCERAMICA`. **Sin encimera debajo queda flotando** a 0,9 m: la
  encimera (tema 10 de pendientes) no existe todavía. Probado en el servidor
  aparte (5185): colocada contra la pared norte, a 0,9 m, en 3D y en el
  plano. Sin probar: foto en calidad y el límite al arrastrar con `lift`.

- **2026-10-12** · **Granito gris perla** como material y **frigoríficos
  corregidos**. El usuario confirmó las alturas: normal 210 cm, pequeño
  180 cm (estaban al revés). Y pasó una textura, `gris_perla.jpg`, para ver
  cómo queda: copiada a `public/texturas/suelos/gris-perla.jpg` y añadida a
  `FLOORS` (`finishes.ts`) como `gris-perla`, "Granito gris perla", código
  provisional `ACA-MAT-GRIS-PERLA`; al ser textura, sale en todos los
  selectores de acabado (suelo, paredes, techo, carpintería, tableros). Cubre
  1,3 × 0,69 m (la imagen entera; **supuesto**, sin dato real). Probada en
  el suelo de una cocina en el servidor aparte (5185), en la vista 3D. Sin
  probar: en paredes, en un tablero y en la foto en calidad.

- **2026-10-12** · **Frigoríficos** en la familia Cocina (lo pidió el
  usuario con sus medidas): `frigorifico` 60 × 60 × 180 cm y
  `frigorifico-pequeno` 60 × 60 × **210** cm, tal como los dijo (el
  "pequeño" resulta más alto que el normal: **por confirmar con el
  usuario**). Forma `appliance`, códigos provisionales `MOB-FRIGORIFICO` y
  `MOB-FRIGORIFICO-PEQUENO`. Probado con `ponerMueble` en el servidor
  aparte (5185); sin verlos en 3D.

- **2026-10-12** · **Lavavajillas** y familia **Cocina** en el catálogo de
  mobiliario (lo pidió el usuario con sus medidas): `lavavajillas` 60 × 60 ×
  82 cm y `lavavajillas-pequeno` 60 × 45 × 80 cm (ancho × fondo × alto), de
  forma nueva `appliance` (cuerpo blanco, frente gris y tirador). Códigos
  provisionales `MOB-LAVAVAJILLAS` y `MOB-LAVAVAJILLAS-PEQUENO`. La familia
  Cocina sale sola como pestaña del catálogo. Probado en el servidor aparte
  (5185): los dos se colocan contra la pared norte con `ponerMueble`; sin
  verlos a la vista en 3D.

- **2026-10-12** · **Televisión** en el catálogo de mobiliario (lo pidió el
  usuario: "hace falta poder poner una tele"). Forma nueva `tv` en
  `furniture.ts` y `boxes()` de `Furniture3D.tsx`: pantalla fina sobre un pie
  corto, 1,2 × 0,25 × 0,75 m, familia salón, código provisional
  `MOB-TELEVISION`. **Es una tele de pie** (sobre el suelo, que se puede
  llevar contra la pared); colgada de la pared o sobre un mueble no existe
  todavía, porque los muebles no tienen altura propia. Probado en el servidor
  aparte (5185): se coloca por `ponerMueble` contra la pared norte y sale en
  el árbol y en la vista 3D (elegida, resaltada); sin ver la pantalla de
  frente. Medidas inventadas.

- **2026-10-12** · **Armario medio** en el catálogo de mobiliario (lo pidió el
  usuario: un armario que sea la mitad del actual): `armario-medio`, 0,9 × 0,6
  × 2,2 m, familia dormitorio, código provisional `MOB-ARMARIO-MEDIO`. El
  armario de 1,8 m se queda como estaba. Solo `tsc`; sin verlo a la vista.

- **2026-10-12** · **Anotado en `docs/PENDIENTES.md` (tema 18)**: dentro de
  "Casa" en el árbol debe haber una carpeta "Módulos" con su "+" para añadir
  un módulo nuevo; y dentro de cada módulo, una carpeta "Estancias" con su
  "+" para añadir una estancia. Solo anotado; sin tocar código.

- **2026-10-12** · **AR: escalar con los dos mandos** (el usuario: lo de la
  maqueta lejos y la que no funcionaba era un problema de caché de las Quest,
  no del código; pidió poder ampliarla y reducirla con los dos mandos).
  `ARTable` en `View3D.tsx`: con gatillo o lateral en los dos, la distancia
  entre los mandos fija la escala (de 1:100, `AR_MIN_SCALE`, a 1:1), el giro
  de las manos gira la maqueta y la mesa queda entre las dos manos. A o X
  alterna entre 1:20 y 1:1 (con una escala intermedia, según esté por encima
  o por debajo de 1:2). **Sin probar**, ni en el emulador: el usuario lo prueba
  en las Quest.

- **2026-10-12** · **Versión visible** (el usuario no sabía si la AR no
  funcionaba por la versión que cargaban las Quest). `__APP_VERSION__`
  (`vite.config.ts`, declarada en `src/version.d.ts`): "v0.1.0 · commit ·
  fecha UTC", con el commit de `GITHUB_SHA` en la publicación o de `git` en
  local. Sale bajo el título del panel izquierdo (`.app-version`) y como última
  línea del cartel de la VR y la AR. Para comprobar una compilación: el commit
  de la versión debe ser el último de `main` en GitHub.

- **2026-10-12** · **AR: maqueta lejos y botón lateral** (el usuario probó la
  AR en las Quest: la maqueta "sale lejísimos" y el botón lateral debía
  colocarla). Causa de lo primero: el origen de la sesión conservaba la
  posición de una sesión de VR o de la cámara de la vista normal; ahora se
  pone a cero al entrar en AR. Y el botón lateral coloca la mesa igual que el
  gatillo, aunque esté lejos (antes solo la cogía con la mano encima). Sin
  probar en gafas; en el emulador la mesa nace delante de la cabeza.

- **2026-10-12** · **Realidad aumentada** (la segunda visualización; el usuario
  quería situar la mesa y su ángulo con un agarrador, y remitió a su prueba
  `D:\IA\Macedonia\games\sala-ar`, que leí y adapté). Botón "Maqueta AR" (antes "Entrar en AR", a petición del
  usuario);
  `ARTable` en `View3D.tsx` con gatillo, agarre, stick y A/X; el fondo, la
  parcela y las sombras se quitan en AR; `VRRig` recibe `ar` y no toca la
  cámara de la vista normal ni camina. Probado en el emulador de Quest 3
  (el servidor aparte, 5185): la mesa nace delante de la cabeza, el gatillo
  la lleva debajo del mando y A cambia la escala. **Sin probar en gafas**: el
  paso de cámara, el agarre y el stick, ni el giro hacia donde apunta (el
  emulador apuntaba siempre al norte).

- **2026-10-12** · **Salir de la VR** (el usuario probó la VR en las Quest, "va
  bien", pero no podía salir). B o Y sale de la sesión (`gamepad.buttons[5]` de
  los mandos, en `VRRig`), y un cartel de 10 s dice cómo. Probado en el
  emulador de Quest 3 (el botón B cierra la sesión); sin probar en gafas, ni
  el aspecto del cartel. Las Quest también salen con el botón de Meta.

- **2026-10-12** · **Realidad virtual** (primera de las dos visualizaciones
  nuevas que quiere el usuario, VR y AR; empezó por VR y la plataforma es la
  Meta Quest 3). Botón "Entrar en VR" en la vista 3D; `@react-three/xr`
  6.6.31 (compatible con three 0.186, fiber 9 y Node 20); `VRRig`,
  `DesktopControls` y `xrStore` en `View3D.tsx`. Caminar con el stick,
  giro a saltos, entrada y salida en la pose de la cámara. Solo ver. **Sin
  probar en gafas**: ver limitaciones. Falta la **AR** (paso de cámara de las
  Quest 3, `immersive-ar`), hablada y sin empezar.

- **2026-10-12** · **Casa de ejemplo y botón "Cargar ejemplo"** (lo pidió el
  usuario: la casa de Daniel como ejemplo ya hecho que cualquiera pueda
  cargar). El archivo viaja con la web: `public/ejemplos/ejemplo1.json` (8 KB,
  **sin fotos**: el usuario pidió quitarlas; el primer commit las llevaba y
  siguen en el historial de git; el usuario lo copió a mano y **va al
  repositorio público**).
  No lleva datos personales dentro; el nombre de Daniel solo está en
  `comercial/`, que sigue fuera de git. Botón "Cargar ejemplo" bajo "Cargar
  plano" en `PlanFileButtons.tsx`: pide la ruta relativa `ejemplos/ejemplo1.json`
  (vale en GitHub Pages) y, si hay casa, pregunta antes de sustituirla. Para
  cambiar el ejemplo, sustituir ese archivo. Probado en el servidor aparte
  (5185): carga la casa (3 estancias, 6 huecos, 12 muebles, 3 mecanismos y 5
  fotos) y la pregunta de sustituir. Sin probar en la web publicada.

- **2026-10-12** · **"Ver foto N" en la vista 3D** (lo pidió el usuario: la
  vista ya detectaba que la cámara estaba en el sitio de una foto y ofrecía
  repetirla, pero no verla). Botón junto a "Repetir foto N" en `View3D.tsx`
  que abre el visor (`open` de `photos.ts`). Probado en el servidor aparte
  (5185), en la ventana `?vista=3d`: la cámara a una foto, el botón y el
  visor con la foto 5. Sin probar con el ratón en el botón (el clic se hizo
  por código) ni en Plano + 3D.

- **2026-10-12** · **Casa de Daniel actualizada en `comercial/`** con dos
  enchufes (0,3 m, detrás de las mesillas) y un interruptor (0,8 m, junto a
  la cama, a la derecha de quien se tumba) en la pared este de la Habitación
  Infantil; todo por funciones, en el servidor aparte (5185). Primera vez que
  se guarda con la foto 4 repetida por el usuario. **Regla del usuario: al
  guardar, lo del navegador es lo bueno**, fotos incluidas; anotada en la
  skill `crear-casas`.

- **2026-10-12** · **Interruptores y enchufes** (tema 7 de pendientes; el
  usuario decidió: solo se ven, y entran también los enchufes). Nuevo
  `model/mechanisms.ts` (cinco tipos de catálogo con su código, medidas y
  alturas inventadas), campo `mechanisms` en `PlacedModule` (gira con la
  estancia y el módulo), `addMechanism`, `patchMechanism` y `removeMechanism`
  en `store.ts`, `MechanismsSection.tsx`, carpeta "Instalación" en cada pared
  del árbol (con "+" y lista de tipos), `mechanismParts` y `MechanismPiece` en
  `View3D.tsx` y una raya por pieza en el plano. En `window.eurocasa`:
  `catalogoMecanismos`, `ponerMecanismo` y `quitarMecanismo`, y `casa()` da los
  `mecanismos`; su parte en la skill `crear-casas`. El archivo de plano no
  cambia de versión. Entrada `pruebas3` (puerto 5185) en `.claude/launch.json`,
  porque el 5183 y el 5184 los tenían ocupados otras conversaciones.

- **2026-10-12** · **Código de artículo en cada elemento** (lo pidió el
  usuario: el coste **no estará en la web**, sino en la carpeta `comercial/`,
  y cada elemento necesita un código para asociarse a esa base de costes).
  Campo `code` en los tipos de catálogo (`FurnitureType`, `OpeningType`,
  `FloorFinish`, `WALL_COLORS`, `VinylType`), `openingCode` y `finishCode`
  para lo que se coloca, y `model/articles.ts` con los de lo que no es
  catálogo (módulo, pared exterior y compartida, suelo, techo, rodapié, foco,
  tablero, espejo). `window.eurocasa` los devuelve como `codigo`. **Los
  códigos los inventé yo** (el usuario lo pidió así) y son provisionales.
  **Propiedades enseña el código** de lo elegido (`ArticleCode` en
  `Field.tsx`, justo bajo el nombre; solo se lee): módulo, estancia (suelo y
  techo), pared (y rodapié), hueco (y acabado), mueble, foco, vinilo, espejo y
  tablero (y acabado). Probado en el servidor aparte (5184): catálogos y casa
  de Daniel con sus códigos, y el panel del sofá, de una estancia y de una
  pared exterior. Sin probar a la vista: hueco, foco, vinilo, espejo y
  tablero (`tsc` sí). **Sin hacer**: la medición de la casa (cantidades por
  código) y la tabla de costes en `comercial/`.

- **2026-10-12** · **Casa de Daniel Rodriguez Martinez guardada en
  `comercial/`**, con sus 5 fotos dentro (2,7 MB). Se dio cuenta de que la
  primera versión iba sin fotos (`bajarCasa` las deja fuera por defecto) y el
  usuario pidió guardarla con ellas; **por defecto se guarda con fotos**.
  Con tanto texto no sirve escribirlo a mano: un receptor local de un solo
  uso recibe un POST de la página y escribe el archivo (descrito en la skill
  `crear-casas`). Comprobado: JSON válido, versión 2, 3 estancias y 5 fotos.
  Abrir la casa desde el archivo (sin fotos) funcionó en el servidor aparte
  (5184). Abrirla con las 5 fotos también funcionó (el archivo se sirvió
  con un servidor local de un solo uso y la página lo leyó con `fetch`; 2,7 MB
  en una sola llamada a `subirCasa`).

- **2026-10-12** · **Casas guardadas en `comercial/`** (lo pidió el usuario:
  una carpeta en su disco con las casas de los comerciales, fuera de GitHub,
  y que Claude pueda subir y bajar casas). `bajarCasa` (devuelve el texto del
  plano, sin fotos salvo `fotos: true`) y `subirCasa(texto)` en
  `window.eurocasa`; la carpeta está en `.gitignore`. El puente lo hace
  Claude: lee o escribe el `.json` en el disco y lo pasa por la página (la
  skill `crear-casas` lo explica). Probado en el servidor aparte (5184):
  bajar una casa (salón, puerta, sofá; 1,2 KB), vaciar y subirla de nuevo
  sin diferencias, y el rechazo de un texto que no es un plano. Sin
  probar: con fotos (`fotos: true`) ni leyendo un archivo real de
  `comercial/`.

- **2026-10-12** · **Cierre de la sesión del uso "desde Claude".** El usuario
  guardó la foto del salón en la web publicada y la pidió en la
  conversación: `verFoto` abre el visor y se le manda una **captura** (la
  página solo devuelve texto; el original, con "Descargar"). Visto: la foto
  toma el tamaño de la vista 3D, y con Plano + 3D en una ventana estrecha
  sale vertical y pequeña; para una foto apaisada, "Vista 3D" sola o "3D en
  otra ventana". Queda así `window.eurocasa`, con 17 funciones, todas en la
  skill `crear-casas`: `casa`, `nuevoPlano`, `medirModulo`, `crearEstancia`,
  `eliminarEstancia`, `ponerHueco`, `cambiarHueco`, `quitarHueco`,
  `catalogoMuebles`, `ponerMueble`, `quitarMueble`, `catalogoAcabados`,
  `ponerSuelo`, `pintarParedes`, `llevarCamara`, `hacerFoto` y `verFoto`.
  **Sin función todavía**: mover o cambiar de medida una estancia, mover o
  girar un mueble, segundo módulo, luces, techo, acabado de la carpintería,
  rodapié, vinilos, espejos y tableros, guardar una foto y elegir su filtro
  u objetivo, y guardar o cargar el plano. **Pendiente**: probarlo con la
  extensión de Chrome, una versión de la skill para comerciales, el criterio
  de diseño de EuroCasa en lugar del mío, y muebles de baño y cocina en el
  catálogo.

- **2026-10-12** · **Casa de prueba montada en la web publicada** (lo pidió
  el usuario), con el navegador integrado de la app de escritorio: 28
  llamadas a `window.eurocasa` en 15 ms y sin ningún error (módulo de
  12 × 4 m, tres estancias, ocho huecos, nueve muebles, suelos y paredes), y
  la cámara llevada a una esquina del salón, con captura del plano y de la
  vista 3D. De paso quedaron probados los ajustes dentro de `ponerHueco`
  (`ancho`, `alto`, `altura`, `abreHacia`). Después, **foto en calidad en la
  web publicada** con `hacerFoto`: las 200 muestras en menos de 30 s, y al
  terminar sale la pregunta de guardar. Visto de paso: con Plano + 3D en una
  ventana estrecha, los botones de muestras de la barra de la foto se salen
  de la vista 3D y pisan el panel Propiedades. Sin probar ahí: la extensión
  de Chrome.

- **2026-10-12** · **La web ya está publicada.** El usuario activó Pages y un
  commit vacío lanzó la publicación, que esta vez terminó bien. Comprobado en
  la dirección pública: carga la aplicación, con el plano vacío, y
  `window.eurocasa` tiene las 17 funciones. Sin probar ahí: montar una casa,
  la foto en calidad y la extensión de Chrome.

- **2026-10-12** · **La web no está publicada**: al ir a probar las funciones
  contra GitHub Pages, la dirección da "página no encontrada". La compilación
  pasa y el paso `deploy-pages` falla con "Ensure GitHub Pages has been
  enabled" en todas las ejecuciones. Corregido lo que decía este documento
  ("Publicada en GitHub Pages"); el código no cambia. Falta que el usuario
  active Pages en el repositorio.

- **2026-10-12** · **Decidido por el usuario: sin servidor, Claude maneja el
  navegador.** Anotado en "Decisiones de diseño". Pendiente de comprobar: que
  funcione igual con la extensión de Chrome sobre la web publicada (todo lo
  de hoy se hizo con el navegador integrado de la app de escritorio y el
  servidor local), y preparar una versión de la skill para comerciales, sin
  las notas de desarrollo (`localhost`, servidor de pruebas).

- **2026-10-12** · **Ver una foto guardada por funciones** (el usuario pidió
  la foto asociada a la vista del salón): `verFoto` (por número o por
  estancia) en `window.eurocasa`, que abre el visor, con su parte en la skill
  `crear-casas`. De paso, **el visor sale también en la ventana `?vista=3d`**
  (`PhotoViewer` en la rama de `App.tsx` de la vista sola), donde no estaba.
  Probado en el servidor aparte (5183), en esa ventana: la foto 2, del salón,
  y los rechazos de una estancia sin foto y de un número que no existe. Sin
  probar: los botones del visor en esa ventana.

- **2026-10-12** · **Ir a una estancia usa la vista de su foto guardada** (lo
  pidió el usuario). `llevarCamara` sin `mirando` ni `desde` va a la última
  foto de esa estancia, con su objetivo (`goTo` de `photos.ts`); si no hay,
  como antes. Una foto es de la estancia que la cámara tiene un metro por
  delante (`photoRoom` en `api.ts`), no de la que la contiene: la del usuario
  estaba sacada desde el umbral de la puerta, 6 cm dentro del salón, y con la
  primera regla se la daba al salón. `casa()` devuelve también las `fotos`.
  En la skill `crear-casas`. Probado en el servidor aparte (5183): la
  habitación va a su foto y el salón, sin foto, a la vista recta. Sin probar:
  varias fotos en una misma estancia.

- **2026-10-12** · **Cámara desde una esquina**: `llevarCamara` admite
  `desde` (noroeste, noreste, suroeste, sureste) y mira en diagonal al centro
  de la estancia. El usuario no se hacía idea de la habitación con las vistas
  rectas (no se veía el armario, o tapaba media imagen). En la skill
  `crear-casas`, cómo elegir la esquina. Probado en el servidor aparte
  (5183), con capturas: desde el noroeste y el noreste de la habitación, y el
  rechazo de una esquina que no existe.

- **2026-10-12** · **Foto en calidad por funciones** (el usuario pidió una
  foto de la habitación de la casa de prueba): `hacerFoto` (con `muestras`,
  si se quiere) en `window.eurocasa`, con su parte en la skill
  `crear-casas`. El modo foto es estado propio de `View3D`, así que la
  función lanza un evento de `window` (`PHOTO_EVENT` en `store.ts`) y
  `View3D` lo escucha y hace lo mismo que el botón. **No guarda**: la
  pregunta de guardar sigue siendo de quien mira la página. Probado en el
  servidor aparte (5183), en la ventana `?vista=3d`: la foto arranca, y el
  rechazo de unas muestras que no existen. Sin probar: el aviso de que la
  vista 3D no está abierta.

- **2026-10-12** · **Cámara por funciones** (el usuario preguntó si sabría
  llevarla al baño): `llevarCamara` (estancia y, si se quiere, `mirando`) en
  `window.eurocasa`, con su parte en la skill `crear-casas`. Usa el vuelo de
  `flyCamera`, deja la cámara de pie a 1,6 m y a 0,5 m de la pared de detrás.
  Probado en el servidor aparte (5183): al baño, mirando al este, con captura
  de la vista 3D y del marcador en el plano. Sin probar: `mirando` dicho a
  mano, y las otras tres direcciones.

- **2026-10-12** · **Paredes por funciones** (el usuario pidió pintar de
  arena las paredes del salón de la casa de prueba): `pintarParedes`
  (estancia, acabado y, si se quiere, `lado`) en `window.eurocasa`, con su
  parte en la skill `crear-casas`; `casa()` da las `paredes` de cada
  estancia. Probado en el servidor aparte (5183): las cuatro del salón en
  arena, vistas en 3D, y los rechazos de un color y de un lado que no existen.
  Antes, el suelo del baño en gris perla, con `ponerSuelo` y un color por su
  nombre. Sin probar: `lado`, y una pared con material.

- **2026-10-12** · **Suelos por funciones** (el usuario pidió madera de pino
  en el salón y la habitación de la casa de prueba): `ponerSuelo` (estancia,
  acabado por nombre, id o color, y `girado`) y `catalogoAcabados` en
  `window.eurocasa`, con su parte en la skill `crear-casas`; `casa()` da el
  `suelo` de cada estancia. Probado en el servidor aparte (5183): el pino en
  las dos estancias, visto en 3D en el salón, y el rechazo de un acabado que
  no existe. Sin probar: un color, "sin acabado" y `girado`.

- **2026-10-12** · **Descartado por el usuario**: que Claude monte la casa
  escribiendo el `.json` del plano y cargándolo de golpe, y también la
  variante que propuse (una función `montar(casa)` con la casa entera). Se
  sigue con funciones sueltas y la skill.

- **2026-10-12** · **Skill `crear-casas` probada por el usuario en una sesión
  nueva**: con un solo prompt (módulo de 12 × 4 m, salón, habitación y baño,
  ocho huecos y nueve muebles) la casa se montó en **34 segundos**, y le
  parece bien. El dato es suyo; el resultado no lo he visto yo.

- **2026-10-12** · **Muebles sueltos por funciones** (el usuario pidió
  amueblar el salón de la casa de prueba: mesa de comedor en el centro con
  cuatro sillas, sofá y mesilla). `ponerMueble` admite ahora `x`, `y` (el
  centro del mueble, desde la esquina de su estancia) y `espalda` (hacia
  dónde mira su parte trasera), para lo que no va contra una pared; en la
  skill, cómo colocar sillas alrededor de una mesa. Probado en el servidor
  aparte (5183), con captura del plano: la mesa en el centro, las cuatro
  sillas con el respaldo hacia fuera, el sofá y la mesilla contra la pared
  oeste, y el rechazo de una silla fuera de la estancia. Sin probar:
  `espalda` este y oeste en un mueble suelto.

- **2026-10-12** · **Mover y quitar huecos por funciones** (el usuario pidió
  la función para correr la puerta de la habitación y hacer sitio a un
  armario): `cambiarHueco` admite `posicion` (metros hasta el centro del
  hueco, a lo largo del lado de su estancia) y hay `quitarHueco`; las dos, en
  la skill `crear-casas`. Si en la posición pedida no cabe entero, no se
  mueve y lo dice. Probado en el servidor aparte (5183): la puerta corrida
  hacia la fachada, y dos rechazos (una posición en el tramo de otra pared y
  otra pegada a la esquina). Sin probar: `quitarHueco`, y mover un hueco a la
  vez que se cambia su ancho.

- **2026-10-12** · **Muebles por funciones** (el usuario pidió una cama de
  matrimonio en la habitación de la casa de prueba): `catalogoMuebles`,
  `ponerMueble` y `quitarMueble` en `window.eurocasa`, y su parte en la skill
  `crear-casas`. `ponerMueble` recibe el mueble (id o nombre), la estancia y,
  si se quiere, la `pared` contra la que va de espaldas, a ras de su cara
  interior, y la `posicion` a lo largo de ella; `casa()` devuelve también los
  `muebles`. Probado en el servidor aparte (5183): la cama doble contra la
  pared sur de una habitación de 4,4 × 2,4 m, quitarla y ponerla contra la
  este (donde la quiso el usuario, enfrente de la puerta), y el rechazo de una
  cama que no cabe en el baño. Sin probar: un mueble sin `pared`, las paredes
  norte y oeste, y `posicion` fuera de la pared.

- **2026-10-12** · **Skill `crear-casas`** y función **`cambiarHueco`**. El
  usuario fijó la forma de trabajar el uso "desde Claude": ir creando
  funciones para cada elemento y, a la vez, preparar la skill que enseña a
  usarlas. La skill está en `.claude/skills/crear-casas/SKILL.md`: dónde se
  trabaja, las funciones, cómo tratar con el comercial (preguntar si la
  petición tiene varias lecturas, no añadir estancias sin pedirlo, decir qué
  se ha decidido) y un criterio de diseño **provisional, puesto por Claude**,
  a falta del de EuroCasa. `cambiarHueco` cambia ancho, alto y altura de un
  hueco y hacia qué estancia abre una puerta (`abreHacia`, por nombre, o
  "fuera"); `ponerHueco` admite lo mismo, y `casa()` devuelve también los
  `huecos`. Probado en el servidor aparte (5183): las puertas de habitación y
  baño pasan a abrir hacia dentro, la ventana del baño queda en 0,6 × 0,6 m a
  1,5 m conservando su centro, y los rechazos (una puerta que no da a esa
  estancia, medidas que no caben en el alto de pared). Sin probar: los
  ajustes dentro de `ponerHueco`, y la skill usada desde una sesión nueva.

- **2026-10-12** · Sexta función en `window.eurocasa`: **`ponerHueco`** (el
  usuario pidió puertas y ventanas en la casa de prueba; hacerlo con una
  función y no por la interfaz lo decidí yo). Recibe `tipo` (puerta,
  corredera o ventana), `estancia`, `lado` (norte, sur, este, oeste) y, si se
  quiere, `con` (la estancia vecina, para la pared compartida) y `posicion`
  (metros desde el extremo oeste o norte del lado hasta el centro del hueco;
  sin ella, centrado). Probado en el servidor aparte (5183) en una casa de
  12 × 4 con salón, habitación y baño: ocho huecos, dos de ellos en paredes
  compartidas, y los rechazos de uno que pisa a otro y de una estancia que no
  existe. Sin funciones todavía: medidas del hueco, hacia dónde abre una
  puerta, mover o cambiar de medida una estancia, muebles y segundo módulo.

- **2026-10-12** · **Funciones para manejar la casa sin la interfaz**, primera
  prueba del uso "comercial desde Claude". El usuario dijo que la aplicación
  se usará de tres maneras: usuario final, comercial y comercial desde Claude.
  Nuevo `src/api.ts`, que deja en `window.eurocasa` cinco funciones: `casa()`
  (lee el árbol), `nuevoPlano()`, `medirModulo`, `crearEstancia` (nombre,
  ancho, fondo y, si se quiere, `x` e `y` desde la esquina de su módulo) y
  `eliminarEstancia`. Devuelven lo creado o `{ error }` con el motivo; a los
  módulos y estancias se les llama por nombre o por id. Están también en la
  web publicada. Probado en el servidor aparte (5183): la misma casa de 10 × 4
  con salón, dos dormitorios y baño, que por la interfaz fueron unas diez
  tandas de clics, sale con seis llamadas en 5 ms, y una estancia que no cabe
  se rechaza con su motivo. Sin probar: `eliminarEstancia`, `crearEstancia`
  sin posición, y un segundo módulo. Hablado y sin hacer: el conector (MCP)
  para un comercial en Claude, y una skill que sepa diseñar casas.

- **2026-10-12** · **Los focos se arrastran en el plano** (el usuario no podía
  moverlos). Pinchar uno lo elige y lo arrastra, en pasos de 5 cm y sin salir
  del techo de su estancia (a 20 cm del borde, `LIGHT_MARGIN`). Se dibujan
  **por encima de los muebles**, como el techo: en el plano del usuario dos de
  los tres focos tenían una cama debajo y no se podían pinchar. Se agarran de
  un círculo invisible de 20 cm de radio (`light-hit`), mayor que el dibujado.
  En `Editor2D.tsx`, arrastre `light` con `patchLight`. Probado con el ratón
  en el plano del usuario (con su permiso): arrastrar un foco con una cama
  debajo, el tope en la esquina, y devolverlo con "Centrar en la estancia".
  Sin probar: que un foco encima de un mueble pequeño no estorbe para
  agarrar el mueble.

- **2026-10-12** · **Elegir qué se ve en el plano** (lo pidió el usuario, sobre
  todo para quitar el mobiliario): botones Mobiliario, Cámara y Rejilla junto
  a los botones de vista. `PLAN_LAYERS`, `planLayers` y `setPlanLayer` en
  `store.ts`; `.plan-layers` en `App.tsx` y `App.css`; `Editor2D.tsx` las
  consulta. Las tres capas las elegí yo; el usuario solo nombró el mobiliario.
  Empezaron como casillas; el usuario prefirió botones (marcado = se ve).
  Probado pulsando las casillas por código, en el servidor aparte y en el
  plano del usuario (con su permiso): mobiliario y rejilla se quitan y
  vuelven, el mueble elegido sigue a la vista y la elección se guarda. Sin
  probar: la casilla Cámara con el marcador a la vista (no lo había en
  ninguno de los dos planos), ni nada con el ratón.

- **2026-10-12** · **Publicación en GitHub Pages** (lo pidió el usuario):
  `.github/workflows/pages.yml`, `base: './'` y rutas de texturas relativas.
  Probado sirviendo `dist` bajo `/ConfiguradorCasa/` en la nube: carga, se
  ven las texturas de suelo y paredes. Sin probar la foto en calidad
  publicada.

- **2026-10-12** · **Fuera las rayas finas** en las juntas de las paredes (se
  veían sobre todo junto a puertas y ventanas): las caras de las juntas se
  veían de canto. Ahora llevan, por mitades, el color de las caras largas de
  su lado (`faces` admite un par en `WallPart`), y dintel y antepecho se meten
  2 mm en los tramos de al lado (`JOINT_OVERLAP`). Comprobado con capturas en
  la nube, con paredes lisas y de madera.

- **2026-10-12** · **Techo configurable** (tema 4; el usuario aceptó mi
  propuesta): por estancia, con casilla para quitarlo de la foto y acabado
  (color o material). Probado en la nube: el panel con una estancia de techo
  de madera. Sin probar: una foto en calidad con techo de color, de madera o
  sin techo.

- **2026-10-12** · **Mismo acabado en suelos y paredes** (tema 16; lo pidió el
  usuario, que descartó el resto del tema). El suelo admite color liso y las
  paredes material, con el selector de la carpintería (`FinishPicker`).
  `interiorFinish`, `floorOf` y `BASE_FLOOR` en `finishes.ts` (fuera
  `floorFinish`); `WallSkin` y `WallSkinPlane` en `View3D.tsx`; botón "Quitar
  el acabado" del suelo. El archivo de plano no cambia. Primer cambio hecho
  desde una sesión en la nube, en la rama `claude/practical-bell-86xdxp`.

- **2026-10-11** · **Carpetas dentro de cada pared** (lo pidió el usuario: así
  el "+" sabe qué hacer): Puertas, Ventanas, Vinilos, Espejos y Tableros, cada
  una con su cuenta y su "+". La pared pierde el suyo y sale plegada. De paso,
  los rótulos con nombre de estancia dicen "con Dormitorio" y no "con la
  Dormitorio". Probado en el servidor aparte pulsando los "+" por código: una
  ventana y un espejo añadidos y elegidos, y la lista de Puertas con sus dos
  opciones. Sin probar: el "+" de Vinilos y de Tableros, ni nada con el ratón.

- **2026-10-11** · **Vinilos, espejos y tableros en el árbol**, bajo su pared
  (lo pidió el usuario), con nombre editable como todo lo demás (`name` en
  `Vinyl`, `Mirror` y `Board`; `pieceName` y `piecesOf` en `names.ts`).
  `selectedPiece` en `store.ts`; `VinylsSection`, `MirrorsSection` y
  `BoardsSection` reciben `chosenId`: sin él enseñan lo que se añade, con él
  solo las propiedades de esa pieza, y pierden su lista numerada. El "+" de la
  pared ofrece además espejo, tablero y los vinilos. Probado en el servidor
  aparte con una pared compartida: un vinilo, un tablero y un espejo en la
  otra cara salen bajo ella, y el tablero elegido enseña solo lo suyo. Sin
  probar: añadirlos con el "+" del árbol, renombrarlos y eliminarlos.

- **2026-10-11** · **Puertas y ventanas en el árbol**, bajo su pared (lo pidió
  el usuario), con su nombre y su ancho. Elegir una enseña sus propiedades.

- **2026-10-11** · **"+" en el árbol** (el usuario no encontraba cómo crear una
  luz): en la carpeta Luces añade un foco; en Mobiliario abre la lista de
  muebles por familias y el elegido sale en el centro de la estancia; en cada
  pared abre puerta, corredera y ventana y el hueco sale centrado en ella
  (`tree-add` y `tree-menu` en `HouseTree.tsx`). La carpeta Paredes no lleva
  "+": las paredes no se añaden, salen de las estancias. Y **fuera las luces
  provisionales** del techo en la foto (lo pidió el usuario; el sol y el cielo
  se quedan): las estancias de antes reciben un foco al abrir el plano.
  Probado en el servidor aparte: el "+" de Luces y la lista de Mobiliario. Sin
  probar: añadir un mueble y un hueco desde el árbol, y una foto sin panel.

- **2026-10-11** · Botón **"Centrar en la estancia"** en el foco y en el mueble
  (el usuario lo pidió para lo que se sitúa con izquierda y arriba), y **color
  de emisión** del foco (campo `color`, con un selector libre bajo el tono).
  Probado en el servidor aparte: centrar un foco con el botón, y el panel con
  un color propio. Sin probar: el centrado del mueble y el color en una foto.

- **2026-10-11** · Tres cosas pedidas por el usuario. **Propiedades enseña
  solo lo elegido**: al elegir un foco sale solo el foco (`LightProperties`);
  en la estancia queda "Añadir luz" (`AddLight`). **Todo tiene nombre**: casilla
  "Nombre" la primera en módulo, estancia, pared, hueco, mueble y foco
  (`NameField`, `rename`, `model/names.ts`, campo `name` y `wallNames`), y el
  árbol los usa. **Cada estancia nueva nace con un foco** en el centro
  (`addModule`); para que se vea como antes, el 100 % de un foco pasa a
  alumbrar lo que el panel provisional (`LIGHT_INTENSITY` 250 → 750). Probado
  en el servidor aparte llamando a las acciones: estancia nueva con su foco,
  renombrar módulo, estancia, foco, una pared exterior y una compartida, y el
  panel de un foco elegido. Sin probar: escribir en la casilla Nombre con el
  teclado, y una foto con la potencia nueva.

- **2026-10-11** · Carpeta **"Luces"** en cada estancia del árbol, con una
  línea por foco (lo pidió el usuario). El foco elegido pasa de ser cosa del
  panel a estar en el estado (`selectedLightId`), para que árbol, panel y plano
  marquen el mismo.

- **2026-10-11** · **Los datos siguen al árbol** (lo propuso el usuario al ver
  que el árbol enseñaba la casa más ordenada de lo que estaba guardada; eligió
  la versión ligera, padre explícito). `shellId` en la estancia y `roomId` en
  el mueble; `withShells`, `housed`, `intoRoom` y `withParents` en
  `store.ts`, que sustituyen a las comprobaciones por geometría (`inside`,
  `contains`) en mover, girar y borrar módulos y estancias; `merge` en el
  guardado del navegador para completar lo de antes. De paso: los muebles
  giran con su estancia, no se pueden sacar de ella ni colocar fuera de una.
  Y **el `.json` pasa a la versión 2, anidado** como el árbol (lo pidió a
  mitad); la versión 1 se sigue leyendo. Probado en el servidor aparte
  llamando a las acciones: cambio de estancia de un mueble, sacarlo fuera,
  girar la estancia una y cuatro veces, moverla, colocar fuera, guardar y
  leer la versión 2 sin diferencias, y abrir `plano-anterior-sin-modulos.json`
  (3 estancias, 5 muebles, todos con su estancia). Sin probar con el ratón ni
  pulsando Guardar y Cargar.

- **2026-10-11** · En el árbol, cada estancia lleva una **carpeta "Paredes" y
  otra "Mobiliario"** (lo pidió el usuario), en `HouseTree.tsx`. Probado en el
  servidor aparte: al elegir un sofá en el plano se abre su carpeta.

- **2026-10-11** · **Interfaz rehecha: árbol de la casa e inspector**, paso 1
  (el usuario: cuesta encontrar dónde están las cosas; propuso la jerarquía de
  Unity y decidió que cada pared cuelga de una sola estancia, que los muebles
  son de una estancia y que prima lo fácil sobre lo flexible). Fuera las ocho
  pestañas. Nuevo `HouseTree.tsx`; `PropertiesPanel` está siempre y reúne los
  apartados según lo elegido (`WallFaces` para las caras de una pared); `pick`
  y `furnitureInside` en `store.ts`, y `Mode` se queda en cinco valores
  internos; `clickPlan` y `WALL_NEAR` en `Editor2D.tsx`, con el primer clic
  que solo elige la estancia y tiradores reducidos a los círculos.
  `FinishesPanel` se parte en `RoomFinishes` y `FaceFinishes`;
  `PiecesPanel.tsx` y `LightsPanel.tsx` pasan a `BoardsSection.tsx` y
  `LightsSection.tsx`. La pestaña Luces, hecha horas antes, desaparece: los
  focos están en su estancia. El archivo de plano no cambia.

- **2026-10-11** · **Luces de estancia** y pestaña **Luces** (tema 2 de
  pendientes; el usuario pidió empezar por las luces de la estancia). Primer
  tipo: el foco de techo, con posición, potencia y tono. Nuevo
  `model/lights.ts`, campo `lights` en `PlacedModule` (gira con la estancia y
  el módulo), `addLight`, `patchLight` y `removeLight` en `store.ts`, modo
  `lights` y `LightsPanel.tsx` (luego `LightsSection.tsx`, sin modo), el disco y su `rectAreaLight` en `View3D.tsx`,
  y un círculo por foco en el plano. El archivo de plano no cambia de versión.
  Decisión mía, por confirmar con el usuario: la estancia sin focos sigue con
  el panel provisional, para que los planos y fotos de antes no salgan a
  oscuras.

- **2026-10-11** · Al **repetir una foto ya no sustituye sola**: al terminar
  sale el mismo recuadro que en una foto nueva, con "Sin filtro / Con filtro",
  "Sustituir la foto" y "No sustituir" (lo pidió el usuario: no podía ver el
  resultado ni elegir el filtro). En `View3D.tsx`, fuera el guardado automático
  de `onProgress`. Sin probar a la vista.

- **2026-10-11** · **Tableros** y pestaña **Piezas** (el usuario quiere colocar
  más geometría, como un cabecero; pidió empezar por primitivas, un tablero
  anclado a la pared, en pestaña aparte y con lo mínimo, y después poder
  ponerlo también de canto y como balda con un selector). Nuevo
  `model/boards.ts`, campo `boards` en `PlacedModule` (gira con la estancia y
  el módulo), `addBoard`, `patchBoard` (con postura) y `removeBoard` en
  `store.ts`, modo `pieces` y `PiecesPanel.tsx`, `boardParts` y `BoardBox` en
  `View3D.tsx`, y un rectángulo por tablero en el plano. El archivo de plano no
  cambia de versión. A mitad, el usuario avisó de que no quiere un programa de
  modelado 3D: anotado en las decisiones de diseño.

- **2026-10-11** · El **filtro de ruido deja el espejo sin filtrar** (lo decidió
  el usuario al ver que emborronaba el reflejo). En `denoise.ts`, la guía de
  geometría escribe profundidad 0 en los materiales de metal pulido (uniforme
  `mirror`), y el filtro deja esos puntos como salieron del trazado. Probado en
  el servidor aparte a 50 muestras: el reflejo queda nítido y con grano, el
  resto de la foto filtrado como antes.

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
