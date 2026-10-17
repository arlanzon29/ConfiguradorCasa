# Pasa la casa del configurador a Blender. Claude lo manda entero con
# execute_blender_code (conector MCP for Blender), después de rellenar FOTOS
# con casa().fotos de la web. Sin GLB, coge el que dejó blender_receptor.py
# y, si no hay, el eurocasa-casa-*.glb más reciente de Descargas.
#
# Qué hace: quita la casa anterior (colección "Casa EuroCasa" y lo que puso
# este script), importa el GLB en esa colección, pone Cycles en GPU (CUDA),
# cielo físico y sol, techo a 2,9 m sobre los suelos, una luz de área en cada
# disco emisivo de los focos y una cámara por foto ("Foto N <estancia>").
import bpy, glob, math, os, mathutils

GLB = None  # ruta del .glb; None = el más reciente de Descargas
FOTOS = []  # casa().fotos tal cual: [{foto, estancia, x, y, camara: {...}}]
TECHO = 2.9  # cara de abajo del techo: suelo de 0,2 m + pared de 2,7 m

import tempfile
recibido = os.path.join(tempfile.gettempdir(), "eurocasa-casa.glb")  # de blender_receptor.py
if GLB is None and os.path.exists(recibido):
    GLB = recibido
if GLB is None:
    found = glob.glob(os.path.expanduser(r"~\Downloads\eurocasa-casa-*.glb"))
    if not found:
        raise SystemExit("No hay ningún eurocasa-casa-*.glb en Descargas")
    GLB = max(found, key=os.path.getmtime)

sc = bpy.context.scene
NAME = "Casa EuroCasa"

# Fuera la casa anterior y lo que puso este script (se reconoce por "eurocasa").
for viejo in (NAME, "Paisaje"):
    old = bpy.data.collections.get(viejo)
    if old:
        for o in list(old.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(old)
for o in list(bpy.data.objects):
    if o.get("eurocasa") or o.name in ("Cube", "Light", "Camera"):
        bpy.data.objects.remove(o, do_unlink=True)

col = bpy.data.collections.new(NAME)
sc.collection.children.link(col)
layer = bpy.context.view_layer
layer.active_layer_collection = layer.layer_collection.children[NAME]
bpy.ops.import_scene.gltf(filepath=GLB)
bpy.ops.object.select_all(action="DESELECT")


def tag(o):
    o["eurocasa"] = True
    sc.collection.objects.link(o)
    return o


# Render: Cycles en GPU con CUDA (OptiX falla en el equipo del usuario).
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "CUDA"
    prefs.refresh_devices()
    for d in prefs.devices:
        d.use = d.type == "CUDA"
    sc.cycles.device = "GPU"
except TypeError:
    sc.cycles.device = "CPU"
sc.cycles.samples = 100
sc.cycles.use_denoising = True
sc.cycles.denoiser = "OPENIMAGEDENOISE"
sc.view_settings.view_transform = "AgX"

# Cielo físico y sol.
w = sc.world or bpy.data.worlds.new("World")
sc.world = w
w.use_nodes = True
nt = w.node_tree
for n in list(nt.nodes):
    if n.type != "OUTPUT_WORLD":
        nt.nodes.remove(n)
out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
sky = nt.nodes.new("ShaderNodeTexSky")
bg = nt.nodes.new("ShaderNodeBackground")
sky.sun_elevation = math.radians(35)
sky.sun_rotation = math.radians(140)
bg.inputs[1].default_value = 1.0
nt.links.new(sky.outputs[0], bg.inputs[0])
nt.links.new(bg.outputs[0], out.inputs[0])
sun = tag(bpy.data.objects.new("Sol", bpy.data.lights.new("Sol", "SUN")))
sun.data.energy = 3
sun.data.angle = math.radians(1)
sun.rotation_euler = (math.radians(55), 0, math.radians(140))


def box(o):
    return [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]


# Techo: un tablero sobre el rectángulo que cubren los suelos (mallas finas
# apoyadas en z = 0, sin contar el césped de la parcela, que es plano).
floors = [
    box(o)
    for o in col.all_objects
    if o.type == "MESH" and 0.01 < o.dimensions.z < 0.25 and min(o.dimensions.x, o.dimensions.y) > 0.9
    and abs(min(v.z for v in box(o))) < 0.01
]
pts = [v for b in floors for v in b]
x0, x1 = min(v.x for v in pts), max(v.x for v in pts)
y0, y1 = min(v.y for v in pts), max(v.y for v in pts)
mesh = bpy.data.meshes.new("Techo")
roof = tag(bpy.data.objects.new("Techo", mesh))
bpy.context.view_layer.objects.active = roof
import bmesh
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1)
bm.to_mesh(mesh)
bm.free()
roof.location = ((x0 + x1) / 2, (y0 + y1) / 2, TECHO + 0.025)
roof.scale = (x1 - x0 + 0.3, y1 - y0 + 0.3, 0.05)
mat = bpy.data.materials.new("Techo")
mat.use_nodes = True
next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (0.9, 0.9, 0.88, 1)
mesh.materials.append(mat)

# Una luz en cada foco: los discos pequeños con material emisivo claro.
lights = 0
for o in list(col.all_objects):
    if o.type != "MESH" or max(o.dimensions) > 0.2:
        continue
    for m in o.data.materials:
        b = m and m.use_nodes and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b and b.inputs["Emission Strength"].default_value > 0 and max(b.inputs["Emission Color"].default_value[:3]) > 0.5:
            lights += 1
            ld = bpy.data.lights.new(f"Foco {lights}", "AREA")
            ld.shape = "DISK"
            ld.size = 0.12
            ld.energy = 60
            ld.color = (1, 0.9, 0.78)
            lo = tag(bpy.data.objects.new(f"Foco {lights}", ld))
            p = o.matrix_world.translation
            lo.location = (p.x, p.y, p.z - 0.02)
            break

# La web deja el metal de los muebles detallados a medias (sin entorno, el
# acero puro le sale negro) y así llega en el GLB: aquí vuelve a ser metal.
for m in bpy.data.materials:
    if m.name.startswith("Acero") and m.use_nodes:
        b = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b:
            b.inputs["Metallic"].default_value = 1.0

# Carpintería (puertas y ventanas): la web nombra cada pieza "Carpintería <rol>"
# (Cerco, Tapajuntas, Hoja, Perfil, Junquillo, Cristal, Manilla).
# - Cristal de verdad, que deja pasar el sol (para las sombras es transparente).
# - Cantos algo redondeados en todo lo demás, y las manillas, de metal.
def vidrio():
    m = bpy.data.materials.get("Vidrio ventana")
    if m:
        return m
    m = bpy.data.materials.new("Vidrio ventana")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    glass = nt.nodes.new("ShaderNodeBsdfGlass")
    glass.inputs["Roughness"].default_value = 0.0
    glass.inputs["IOR"].default_value = 1.5
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    path = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    # Rayos de sombra y difusos lo atraviesan (si no, el cristal apaga el sol);
    # lo que mira la cámara ve el reflejo del vidrio.
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "MAXIMUM"
    nt.links.new(path.outputs["Is Shadow Ray"], add.inputs[0])
    nt.links.new(path.outputs["Is Diffuse Ray"], add.inputs[1])
    nt.links.new(add.outputs[0], mix.inputs["Fac"])
    nt.links.new(glass.outputs[0], mix.inputs[1])
    nt.links.new(clear.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m

carp = 0
for o in col.all_objects:
    if o.type != "MESH" or not o.name.startswith("Carpintería"):
        continue
    carp += 1
    if o.name.startswith("Carpintería Cristal"):
        o.data.materials.clear()
        o.data.materials.append(vidrio())
        continue
    b = o.modifiers.new("Bisel", "BEVEL")
    b.width = 0.002 if o.name.startswith(("Carpintería Junquillo", "Carpintería Manilla")) else 0.004
    b.segments = 2
    b.limit_method = "ANGLE"
    if o.name.startswith("Carpintería Manilla"):
        for m in o.data.materials:
            bsdf = m and m.use_nodes and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf:
                bsdf.inputs["Metallic"].default_value = 1.0
                bsdf.inputs["Roughness"].default_value = 0.25

# Paisaje fuera de la parcela: césped hasta el horizonte, árboles y arbustos
# (sin descargas: todo con primitivas y ruido). La parcela va de (0, 0) a
# (28, -20); los árboles quedan fuera, a partir de unos metros.
PAISAJE = True
if PAISAJE:
    import random
    rnd = random.Random(7)
    pais = bpy.data.collections.new("Paisaje")
    sc.collection.children.link(pais)

    def material(nombre, color, rough=0.8, ruido=0.0):
        m = bpy.data.materials.get(nombre) or bpy.data.materials.new(nombre)
        m.use_nodes = True
        nt = m.node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        b.inputs["Roughness"].default_value = rough
        if ruido:
            tc = nt.nodes.new("ShaderNodeTexCoord")
            nz = nt.nodes.new("ShaderNodeTexNoise")
            nz.inputs["Scale"].default_value = ruido
            nz.inputs["Detail"].default_value = 6
            ramp = nt.nodes.new("ShaderNodeValToRGB")
            ramp.color_ramp.elements[0].color = (color[0] * 0.6, color[1] * 0.6, color[2] * 0.6, 1)
            ramp.color_ramp.elements[1].color = (*color, 1)
            nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
            nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
            nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
            bp = nt.nodes.new("ShaderNodeBump")
            bp.inputs["Strength"].default_value = 0.3
            nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
            nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
        else:
            b.inputs["Base Color"].default_value = (*color, 1)
        return m

    cesped = material("Césped campo", (0.10, 0.22, 0.05), 0.9, ruido=0.4)
    tronco = material("Tronco", (0.13, 0.08, 0.05), 0.9)
    copas = [material(f"Copa {i}", c, 0.85, ruido=3.0)
             for i, c in enumerate([(0.06, 0.16, 0.04), (0.09, 0.2, 0.05), (0.12, 0.22, 0.06)])]

    me = bpy.data.meshes.new("Campo")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200)
    bm.to_mesh(me)
    bm.free()
    campo = bpy.data.objects.new("Campo", me)
    pais.objects.link(campo)
    campo.location = (14, -10, -0.02)
    me.materials.append(cesped)

    def arbol(x, y, s):
        bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.12 * s, depth=2.2 * s, location=(x, y, 1.1 * s))
        t = bpy.context.active_object
        t.data.materials.append(tronco)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.6 * s, location=(x, y, 3.0 * s))
        c = bpy.context.active_object
        c.scale = (1, 1, 1.15)
        c.data.materials.append(rnd.choice(copas))
        d = c.modifiers.new("Bulto", "DISPLACE")
        tex = bpy.data.textures.get("Ruido copa") or bpy.data.textures.new("Ruido copa", "CLOUDS")
        tex.noise_scale = 0.6
        d.texture = tex
        d.strength = 0.6 * s
        for p in c.data.polygons:
            p.use_smooth = True
        for o in (t, c):
            for cc in o.users_collection:
                cc.objects.unlink(o)
            pais.objects.link(o)

    def arbusto(x, y, s):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.6 * s, location=(x, y, 0.35 * s))
        c = bpy.context.active_object
        c.scale = (1.3, 1, 0.7)
        c.data.materials.append(rnd.choice(copas))
        for p in c.data.polygons:
            p.use_smooth = True
        for cc in c.users_collection:
            cc.objects.unlink(c)
        pais.objects.link(c)

    def fuera(x, y, margen):
        return not (-margen < x < 28 + margen and -20 - margen < y < margen)

    puestos = 0
    while puestos < 70:
        x, y = rnd.uniform(-60, 88), rnd.uniform(-80, 60)
        if fuera(x, y, 4):
            arbol(x, y, rnd.uniform(0.8, 1.6))
            puestos += 1
    puestos = 0
    while puestos < 40:
        x, y = rnd.uniform(-20, 48), rnd.uniform(-40, 20)
        if fuera(x, y, 1.5):
            arbusto(x, y, rnd.uniform(0.7, 1.5))
            puestos += 1
    bpy.ops.object.select_all(action="DESELECT")

# Una cámara por foto de la web: plano (x, y) -> Blender (x, -y).
cams = []
for f in FOTOS:
    c = f["camara"]
    name = f"Foto {f['foto']}" + (f" {f['estancia']}" if f.get("estancia") else "")
    cd = bpy.data.cameras.new(name)
    cd.sensor_fit = "VERTICAL"
    cd.angle_y = math.radians(c["objetivo"])
    co = tag(bpy.data.objects.new(name, cd))
    co.location = (f["x"], -f["y"], c["altura"])
    co.rotation_euler = (math.pi / 2 + c["cabeceo"], 0, c["giro"])
    co["resolucion"] = [c["ancho"], c["alto"]]
    cams.append(co)
if cams:
    sc.camera = cams[0]
    sc.render.resolution_x, sc.render.resolution_y = cams[0]["resolucion"]

print({"glb": os.path.basename(GLB), "techo": [round(x1 - x0, 2), round(y1 - y0, 2)], "focos": lights,
       "carpinteria": carp,
       "camaras": [c.name for c in cams], "gpu": sc.cycles.device})
