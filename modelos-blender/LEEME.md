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
