# Modelos de Blender

Originales editables de los muebles detallados. Cada uno tiene dos archivos:

- aquí, el `.blend` para trabajarlo (con bisel y suavizado sin aplicar, el
  grano de la tela y la madera, y su escena de estudio: suelo, pared, luces y
  cámara);
- en `public/modelos/`, el `.glb` exportado que usa la web con "Muebles
  detallados" (campo `model` del catálogo en `src/model/furniture.ts`).

Al cambiar un modelo: abrir el `.blend`, retocar, y volver a exportar solo las
piezas del mueble (sin suelo, pared, luces ni cámara) a su `.glb` con
"Apply Modifiers". Debe apoyar en el suelo, centrado, con la espalda hacia +Y
de Blender (que en la web es el norte) y con las medidas del catálogo.

Las partes que el cliente puede cambiar de color necesitan **un material
propio con nombre fijo** en el `.blend`: la web los busca por ese nombre
(`material` de cada parte en `parts`, `src/model/furniture.ts`). No cambiar
esos nombres sin cambiar también el catálogo.

| Mueble | Original | Para la web | Medidas | Materiales que cambian de color |
|---|---|---|---|---|
| Sofá (`sofa`) | `sofa.blend` (escena "Sofá") | `public/modelos/sofa.glb` | 2 × 0,9 × 0,8 m | "Tela sofá", "Cojín izquierdo", "Cojín derecho" |
| Frigorífico (`frigorifico`) | `frigorifico.blend` | `public/modelos/frigorifico.glb` | 0,6 × 0,6 × 2,1 m | — |
| Frigorífico pequeño (`frigorifico-pequeno`) | `frigorifico-pequeno.blend` | `public/modelos/frigorifico-pequeno.glb` | 0,6 × 0,6 × 1,8 m | — |
| Lavadora (`lavadora`) | `lavadora.blend` | `public/modelos/lavadora.glb` | 0,6 × 0,6 × 0,82 m | — |
| Lavadora pequeña (`lavadora-pequena`) | `lavadora-pequena.blend` | `public/modelos/lavadora-pequena.glb` | 0,45 × 0,6 × 0,8 m | — |
| Lavavajillas (`lavavajillas`) | `lavavajillas.blend` | `public/modelos/lavavajillas.glb` | 0,6 × 0,6 × 0,82 m | — |
| Lavavajillas pequeño (`lavavajillas-pequeno`) | `lavavajillas-pequeno.blend` | `public/modelos/lavavajillas-pequeno.glb` | 0,45 × 0,6 × 0,8 m | — |
| Horno (`horno`) | `horno.blend` | `public/modelos/horno.glb` | 0,6 × 0,6 × 0,82 m | — |
| Vitrocerámica (`vitroceramica`) | `vitroceramica.blend` | `public/modelos/vitroceramica.glb` | 0,5 × 0,5 × 0,02 m | — |
| Fregadero (`fregadero`) | `fregadero.blend` | `public/modelos/fregadero.glb` | 0,4 × 0,45 × 0,35 m (con el grifo) | — |
| Armario pequeño de cocina (`armario-cocina`) | `armario-cocina.blend` | `public/modelos/armario-cocina.glb` | 0,45 × 0,6 × 0,8 m | — |
| Mesa con armarios (`mesa-armarios`) | `mesa-armarios.blend` | `public/modelos/mesa-armarios.glb` | 1,2 × 0,6 × 0,8 m | — |
| Taburete (`taburete`) | `taburete.blend` | `public/modelos/taburete.glb` | 0,35 × 0,35 × 0,65 m | "Asiento taburete" |

| Mesa de comedor (`mesa-comedor`) | `mesa-comedor.blend` | `public/modelos/mesa-comedor.glb` | 1,6 × 0,9 × 0,75 m | — |
| Mesa de centro (`mesa-centro`) | `mesa-centro.blend` | `public/modelos/mesa-centro.glb` | 1,1 × 0,6 × 0,4 m | — |
| Silla (`silla`) | `silla.blend` | `public/modelos/silla.glb` | 0,45 × 0,45 × 0,9 m | — |
| Televisión (`television`) | `television.blend` | `public/modelos/television.glb` | 1,2 × 0,25 × 0,75 m | — |
| Mesilla (`mesilla`) | `mesilla.blend` | `public/modelos/mesilla.glb` | 0,45 × 0,4 × 0,5 m | — |
| Cama individual (`cama-individual`) | `cama-individual.blend` | `public/modelos/cama-individual.glb` | 0,9 × 2 m; cabecero a 1 m | — |
| Cama doble (`cama-doble`) | `cama-doble.blend` | `public/modelos/cama-doble.glb` | 1,6 × 2 m; cabecero a 1 m | — |
| Armario medio (`armario-medio`) | `armario-medio.blend` | `public/modelos/armario-medio.glb` | 0,9 × 0,6 × 2,2 m | — |
| Armario (`armario`) | `armario.blend` | `public/modelos/armario.glb` | 1,8 × 0,6 × 2,2 m | — |

**Nunca dos caras en el mismo plano** (z-fighting: la web y Blender no
saben cuál pintar y parpadean, como pasó con la rejilla del frigorífico y
los zócalos). Una pieza pegada sobre otra (zócalo, rejilla, pantalla,
teclas) va al menos 3 mm por delante de la cara que tiene detrás.

**El alto es el del modelo**, no el del catálogo: la web ajusta ancho y fondo
a las medidas del catálogo pero deja el alto como viene (la cama mide 0,5 en
el catálogo y su cabecero sube a 1 m). Modelar siempre en metros reales.

Vitrocerámica y fregadero se modelan apoyados en z = 0 (la altura sobre la
encimera la pone la web, `lift` del catálogo o `altura` del mueble).

**Un `.blend` por mueble**, no todos juntos (lo pidió el usuario). Cada uno
lleva solo su escena, ya centrada.

**Al exportar un `.glb`**, el exportador de Blender mete **todas las escenas
del archivo** si no se le dice otra cosa (salió un lavadora.glb de 5 MB con
la casa y el sofá dentro). Exportar con `use_active_scene=True`, desde una
escena que solo tenga ese mueble, y comprobar que pesa lo esperado (decenas o
pocos cientos de KB).

En la web el metal se deja a medias (`metalness` ≤ 0,5 en `Furniture3D.tsx`):
sin entorno que reflejar, el acero puro sale negro.
