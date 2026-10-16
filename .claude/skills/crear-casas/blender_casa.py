# Pasa la casa del configurador a Blender. Claude lo manda entero con
# execute_blender_code (conector MCP for Blender), después de rellenar FOTOS
# con casa().fotos de la web. Sin GLB, coge el eurocasa-casa-*.glb más
# reciente de Descargas.
#
# Qué hace: quita la casa anterior (colección "Casa EuroCasa" y lo que puso
# este script), importa el GLB en esa colección, pone Cycles en GPU (CUDA),
# cielo físico y sol, techo a 2,9 m sobre los suelos, una luz de área en cada
# disco emisivo de los focos y una cámara por foto ("Foto N <estancia>").
import bpy, glob, math, os, mathutils

GLB = None  # ruta del .glb; None = el más reciente de Descargas
FOTOS = []  # casa().fotos tal cual: [{foto, estancia, x, y, camara: {...}}]
TECHO = 2.9  # cara de abajo del techo: suelo de 0,2 m + pared de 2,7 m

if GLB is None:
    found = glob.glob(os.path.expanduser(r"~\Downloads\eurocasa-casa-*.glb"))
    if not found:
        raise SystemExit("No hay ningún eurocasa-casa-*.glb en Descargas")
    GLB = max(found, key=os.path.getmtime)

sc = bpy.context.scene
NAME = "Casa EuroCasa"

# Fuera la casa anterior y lo que puso este script (se reconoce por "eurocasa").
old = bpy.data.collections.get(NAME)
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
       "camaras": [c.name for c in cams], "gpu": sc.cycles.device})
