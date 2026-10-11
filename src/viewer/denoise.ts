import {
  Camera,
  Color,
  FloatType,
  HalfFloatType,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NoBlending,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

/**
 * Filtro de ruido para la foto en calidad, guiado por la geometría.
 *
 * La imagen trazada se divide entre el color propio de cada superficie (su
 * textura, sin luz), de modo que queda solo la luz que le llega; esa luz se
 * suaviza entre píxeles vecinos que están en la misma superficie (misma
 * orientación y mismo plano) y con una luz parecida, y al final se vuelve a
 * multiplicar por el color. Así las vetas y los bordes no se emborronan.
 *
 * Todo se calcula al doble de resolución que la foto y se reduce al final: en
 * un borde cada mitad de píxel toma la luz de su superficie y el contorno queda
 * suavizado. A la resolución de la foto los bordes salían en escalera.
 */

/** Cuántas veces la resolución de la foto, por lado, y el tope por lado en píxeles. */
const SCALE = 2
const MAX_SIDE = 4096
/** Pasadas de suavizado; cada una alcanza el doble de lejos que la anterior. */
const PASSES = 5

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/** Lo común a los pasos del filtro: leer la geometría y pesar a un vecino. */
const GEOMETRY_WEIGHT = /* glsl */ `
  uniform sampler2D uGeometry;
  uniform mat4 uInverseProjection;

  vec3 viewPosition(vec2 uv, float depth) {
    vec4 far = uInverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = far.xyz / far.w;
    return dir * (depth / -dir.z);
  }

  // 1 si el vecino está en la misma superficie que el centro, 0 si no.
  float geometryWeight(vec4 g, vec3 p, vec2 uv2) {
    vec4 g2 = texture2D(uGeometry, uv2);
    if (g2.w <= 0.0) return 0.0;
    float wn = pow(max(dot(g.xyz, g2.xyz), 0.0), 64.0);
    vec3 p2 = viewPosition(uv2, g2.w);
    float wz = exp(-abs(dot(g.xyz, p2 - p)) / (0.004 + 0.001 * g.w));
    return wn * wz;
  }

  // "luminance" ya es una función de three.js.
  float lum(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }
`

const pass = (uniforms: ShaderMaterial['uniforms'], fragmentShader: string) =>
  new ShaderMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    uniforms,
    vertexShader: QUAD_VERTEX,
    fragmentShader,
  })

export class PhotoDenoiser {
  private gl: WebGLRenderer
  private albedo = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
  // La profundidad necesita la precisión entera: con media, a unos metros ya
  // baila medio centímetro y las superficies no se reconocen.
  private geometry = new WebGLRenderTarget(1, 1, {
    type: FloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  })
  private ping = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
  private pong = new WebGLRenderTarget(1, 1, { type: HalfFloatType })
  private albedoCache = new Map<Material, MeshBasicMaterial>()
  private geometryCache = new Map<Material, ShaderMaterial>()
  private quad = new FullScreenQuad()

  /** Paso 0: deja solo la luz y mide cuánto varía alrededor de cada punto. */
  private prepare = pass(
    {
      uTraced: { value: null },
      uAlbedo: { value: null },
      uGeometry: { value: null },
      uInverseProjection: { value: new Matrix4() },
      uTexel: { value: new Vector2() },
    },
    /* glsl */ `
      uniform sampler2D uTraced;
      uniform sampler2D uAlbedo;
      uniform vec2 uTexel;
      varying vec2 vUv;
      ${GEOMETRY_WEIGHT}

      vec3 light(vec2 uv) {
        vec3 l = texture2D(uTraced, uv).rgb / max(texture2D(uAlbedo, uv).rgb, vec3(0.02));
        return min(l, vec3(1000.0));
      }

      void main() {
        vec3 c = light(vUv);
        vec4 g = texture2D(uGeometry, vUv);
        if (g.w <= 0.0) {
          gl_FragColor = vec4(c, 0.0);
          return;
        }
        vec3 p = viewPosition(vUv, g.w);
        float sum = 0.0;
        float sum2 = 0.0;
        float total = 0.0;
        for (int dx = -3; dx <= 3; dx++) {
          for (int dy = -3; dy <= 3; dy++) {
            vec2 uv2 = vUv + vec2(float(dx), float(dy)) * uTexel;
            float w = geometryWeight(g, p, uv2);
            float l = lum(light(uv2));
            sum += l * w;
            sum2 += l * l * w;
            total += w;
          }
        }
        float mean = sum / max(total, 1e-4);
        gl_FragColor = vec4(c, max(0.0, sum2 / max(total, 1e-4) - mean * mean));
      }
    `,
  )

  /** Pasos de suavizado, con huecos cada vez mayores entre los vecinos (à-trous). */
  private blur = pass(
    {
      uLight: { value: null },
      uGeometry: { value: null },
      uInverseProjection: { value: new Matrix4() },
      uTexel: { value: new Vector2() },
      uStep: { value: 1 },
    },
    /* glsl */ `
      uniform sampler2D uLight;
      uniform vec2 uTexel;
      uniform float uStep;
      varying vec2 vUv;
      ${GEOMETRY_WEIGHT}

      void main() {
        vec4 c = texture2D(uLight, vUv);
        vec4 g = texture2D(uGeometry, vUv);
        if (g.w <= 0.0) {
          gl_FragColor = c;
          return;
        }
        vec3 p = viewPosition(vUv, g.w);
        float lc = lum(c.rgb);
        // Una diferencia de luz mayor que el ruido medido es una sombra: no se mezcla.
        float sigma = 4.0 * sqrt(c.a) + 1e-3;
        float kernel[3];
        kernel[0] = 0.375;
        kernel[1] = 0.25;
        kernel[2] = 0.0625;

        vec3 sum = c.rgb * kernel[0] * kernel[0];
        float variance = c.a * kernel[0] * kernel[0] * kernel[0] * kernel[0];
        float total = kernel[0] * kernel[0];
        for (int dx = -2; dx <= 2; dx++) {
          for (int dy = -2; dy <= 2; dy++) {
            if (dx == 0 && dy == 0) continue;
            vec2 uv2 = vUv + vec2(float(dx), float(dy)) * uStep * uTexel;
            if (uv2.x < 0.0 || uv2.x > 1.0 || uv2.y < 0.0 || uv2.y > 1.0) continue;
            vec4 c2 = texture2D(uLight, uv2);
            float wl = exp(-abs(lc - lum(c2.rgb)) / sigma);
            float k = kernel[dx < 0 ? -dx : dx] * kernel[dy < 0 ? -dy : dy];
            float w = k * wl * geometryWeight(g, p, uv2);
            sum += c2.rgb * w;
            variance += c2.a * w * w;
            total += w;
          }
        }
        gl_FragColor = vec4(sum / total, variance / (total * total));
      }
    `,
  )

  /** Vuelve a poner a la luz el color de cada superficie. */
  private tint = pass(
    { uLight: { value: null }, uAlbedo: { value: null } },
    /* glsl */ `
      uniform sampler2D uLight;
      uniform sampler2D uAlbedo;
      varying vec2 vUv;

      void main() {
        vec3 albedo = max(texture2D(uAlbedo, vUv).rgb, vec3(0.02));
        gl_FragColor = vec4(texture2D(uLight, vUv).rgb * albedo, 1.0);
      }
    `,
  )

  /** Último paso: reduce al tamaño de la foto y la saca al lienzo. */
  private compose = pass(
    { uClean: { value: null } },
    /* glsl */ `
      uniform sampler2D uClean;
      varying vec2 vUv;

      void main() {
        gl_FragColor = vec4(texture2D(uClean, vUv).rgb, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  )

  constructor(gl: WebGLRenderer) {
    this.gl = gl
  }

  private albedoOf(source: MeshStandardMaterial) {
    let material = this.albedoCache.get(source)
    if (!material) {
      material = new MeshBasicMaterial({ side: source.side })
      this.albedoCache.set(source, material)
    }
    material.color.copy(source.color)
    material.map = source.map
    material.vertexColors = source.vertexColors
    material.alphaTest = source.alphaTest
    return material
  }

  private geometryOf(source: MeshStandardMaterial) {
    let material = this.geometryCache.get(source)
    if (!material) {
      material = new ShaderMaterial({
        side: source.side,
        uniforms: { map: { value: null }, cut: { value: 0 }, mirror: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying float vDepth;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalMatrix * normal;
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D map;
          uniform float cut;
          uniform float mirror;
          varying vec3 vNormal;
          varying float vDepth;
          varying vec2 vUv;
          void main() {
            if (cut > 0.0 && texture2D(map, vUv).a < cut) discard;
            vec3 n = normalize(vNormal);
            // Sin profundidad el filtro deja el punto como salió del trazado, igual que el cielo.
            gl_FragColor = vec4(gl_FrontFacing ? n : -n, mirror > 0.0 ? 0.0 : vDepth);
          }
        `,
      })
      this.geometryCache.set(source, material)
    }
    material.uniforms.map.value = source.map
    material.uniforms.cut.value = source.map ? source.alphaTest : 0
    // Un espejo (metal pulido) no se filtra: lo que refleja no es una superficie
    // lisa, y suavizarlo como tal lo emborronaba.
    material.uniforms.mirror.value = source.metalness > 0.9 && source.roughness < 0.1 ? 1 : 0
    return material
  }

  /** Dibuja en el lienzo la imagen trazada (`traced`, la de esa escena y cámara) ya filtrada. */
  render(scene: Scene, camera: Camera, traced: Texture) {
    const gl = this.gl
    const photo = gl.getDrawingBufferSize(new Vector2())
    const scale = Math.max(1, Math.min(SCALE, MAX_SIDE / Math.max(photo.x, photo.y)))
    for (const target of [this.albedo, this.geometry, this.ping, this.pong]) {
      target.setSize(Math.round(photo.x * scale), Math.round(photo.y * scale))
    }

    // Las dos imágenes de guía: se dibuja la escena con otros materiales. Lo
    // translúcido (cristales) se esconde, para que la guía sea lo que hay detrás.
    const meshes: { mesh: Mesh; material: Material | Material[]; visible: boolean }[] = []
    scene.traverse((o) => {
      const mesh = o as Mesh
      if (mesh.isMesh) meshes.push({ mesh, material: mesh.material, visible: mesh.visible })
    })
    const previous = {
      target: gl.getRenderTarget(),
      background: scene.background,
      color: gl.getClearColor(new Color()),
      alpha: gl.getClearAlpha(),
    }
    scene.background = null
    const guide = (
      target: WebGLRenderTarget,
      clear: number,
      alpha: number,
      swap: (m: MeshStandardMaterial) => Material,
    ) => {
      for (const { mesh, material } of meshes) {
        const source = material as MeshStandardMaterial
        if (Array.isArray(material) || source.transparent || source.opacity < 1) {
          mesh.visible = false
        } else {
          mesh.material = swap(source)
        }
      }
      gl.setRenderTarget(target)
      gl.setClearColor(clear, alpha)
      gl.clear()
      gl.render(scene, camera)
    }
    guide(this.albedo, 0xffffff, 1, (m) => this.albedoOf(m))
    guide(this.geometry, 0x000000, 0, (m) => this.geometryOf(m))
    for (const { mesh, material, visible } of meshes) {
      mesh.material = material
      mesh.visible = visible
    }
    scene.background = previous.background
    gl.setClearColor(previous.color, previous.alpha)

    // Los vecinos se toman a pasos de un píxel de la foto, que es el grano del ruido.
    for (const material of [this.prepare, this.blur]) {
      material.uniforms.uGeometry.value = this.geometry.texture
      material.uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse)
      material.uniforms.uTexel.value.set(1 / photo.x, 1 / photo.y)
    }
    const draw = (material: ShaderMaterial, target: WebGLRenderTarget | null) => {
      this.quad.material = material
      gl.setRenderTarget(target)
      this.quad.render(gl)
    }

    this.prepare.uniforms.uTraced.value = traced
    this.prepare.uniforms.uAlbedo.value = this.albedo.texture
    draw(this.prepare, this.ping)

    let from = this.ping
    let to = this.pong
    for (let i = 0; i < PASSES; i++) {
      this.blur.uniforms.uLight.value = from.texture
      this.blur.uniforms.uStep.value = 2 ** i
      draw(this.blur, to)
      ;[from, to] = [to, from]
    }

    this.tint.uniforms.uLight.value = from.texture
    this.tint.uniforms.uAlbedo.value = this.albedo.texture
    draw(this.tint, to)

    this.compose.uniforms.uClean.value = to.texture
    draw(this.compose, null)
    gl.setRenderTarget(previous.target)
  }

  dispose() {
    for (const target of [this.albedo, this.geometry, this.ping, this.pong]) target.dispose()
    for (const material of this.albedoCache.values()) material.dispose()
    for (const material of this.geometryCache.values()) material.dispose()
    for (const material of [this.prepare, this.blur, this.tint, this.compose]) material.dispose()
    this.quad.dispose()
  }
}
