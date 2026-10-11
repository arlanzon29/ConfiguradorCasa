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
 * PRUEBA. Filtro de ruido para la foto en calidad, guiado por la geometría.
 *
 * La imagen trazada se divide entre el color propio de cada superficie (su
 * textura, sin luz), de modo que queda solo la luz que le llega; esa luz se
 * suaviza entre píxeles vecinos que están en la misma superficie (misma
 * orientación y mismo plano) y con una luz parecida, y al final se vuelve a
 * multiplicar por el color. Así las vetas y los bordes no se emborronan.
 */

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

  float lum(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }
`

export class PhotoDenoiser {
  private gl: WebGLRenderer
  private albedo = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 })
  private geometry = new WebGLRenderTarget(1, 1, {
    type: FloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  })
  private ping = new WebGLRenderTarget(1, 1, {
    type: FloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  })
  private pong = this.ping.clone()
  private albedoCache = new Map<Material, MeshBasicMaterial>()
  private geometryCache = new Map<Material, ShaderMaterial>()
  private quad = new FullScreenQuad()

  /** Paso 0: deja solo la luz y mide cuánto varía alrededor de cada píxel. */
  private prepare = new ShaderMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTraced: { value: null as Texture | null },
      uAlbedo: { value: null as Texture | null },
      uGeometry: { value: null as Texture | null },
      uInverseProjection: { value: new Matrix4() },
      uTexel: { value: new Vector2() },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTraced;
      uniform sampler2D uAlbedo;
      uniform vec2 uTexel;
      varying vec2 vUv;
      ${GEOMETRY_WEIGHT}

      vec3 light(vec2 uv) {
        return texture2D(uTraced, uv).rgb / max(texture2D(uAlbedo, uv).rgb, vec3(0.02));
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
  })

  /** Pasos 1 a N: suavizado con huecos cada vez mayores (à-trous). */
  private blur = new ShaderMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uLight: { value: null as Texture | null },
      uGeometry: { value: null as Texture | null },
      uInverseProjection: { value: new Matrix4() },
      uTexel: { value: new Vector2() },
      uStep: { value: 1 },
      uSigmaLight: { value: 4 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D uLight;
      uniform vec2 uTexel;
      uniform float uStep;
      uniform float uSigmaLight;
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
        float sigma = uSigmaLight * sqrt(c.a) + 1e-3;
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
  })

  /** Último paso: vuelve a poner el color de cada superficie y lo saca al lienzo. */
  private compose = new ShaderMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTraced: { value: null as Texture | null },
      uLight: { value: null as Texture | null },
      uAlbedo: { value: null as Texture | null },
      uStrength: { value: 1 },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTraced;
      uniform sampler2D uLight;
      uniform sampler2D uAlbedo;
      uniform float uStrength;
      varying vec2 vUv;

      void main() {
        vec3 traced = texture2D(uTraced, vUv).rgb;
        vec3 clean = texture2D(uLight, vUv).rgb * max(texture2D(uAlbedo, vUv).rgb, vec3(0.02));
        gl_FragColor = vec4(mix(traced, clean, uStrength), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })

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
        uniforms: { map: { value: null as Texture | null }, cut: { value: 0 } },
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
          varying vec3 vNormal;
          varying float vDepth;
          varying vec2 vUv;
          void main() {
            if (cut > 0.0 && texture2D(map, vUv).a < cut) discard;
            vec3 n = normalize(vNormal);
            gl_FragColor = vec4(gl_FrontFacing ? n : -n, vDepth);
          }
        `,
      })
      this.geometryCache.set(source, material)
    }
    material.uniforms.map.value = source.map
    material.uniforms.cut.value = source.map ? source.alphaTest : 0
    return material
  }

  /**
   * Dibuja en el lienzo la imagen trazada ya filtrada. `strength` va de 0 (tal
   * como salió) a 1 (filtro entero); `passes` es cuántas veces se suaviza.
   */
  render(scene: Scene, camera: Camera, traced: Texture, strength: number, passes = 5) {
    const gl = this.gl
    const size = gl.getDrawingBufferSize(new Vector2())
    for (const target of [this.albedo, this.geometry, this.ping, this.pong]) {
      target.setSize(size.x, size.y)
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

    const texel = new Vector2(1 / size.x, 1 / size.y)
    for (const material of [this.prepare, this.blur]) {
      material.uniforms.uGeometry.value = this.geometry.texture
      material.uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse)
      material.uniforms.uTexel.value.copy(texel)
    }

    this.prepare.uniforms.uTraced.value = traced
    this.prepare.uniforms.uAlbedo.value = this.albedo.texture
    this.quad.material = this.prepare
    gl.setRenderTarget(this.ping)
    this.quad.render(gl)

    let from = this.ping
    let to = this.pong
    this.quad.material = this.blur
    for (let i = 0; i < passes; i++) {
      this.blur.uniforms.uLight.value = from.texture
      this.blur.uniforms.uStep.value = 2 ** i
      gl.setRenderTarget(to)
      this.quad.render(gl)
      ;[from, to] = [to, from]
    }

    this.compose.uniforms.uTraced.value = traced
    this.compose.uniforms.uLight.value = from.texture
    this.compose.uniforms.uAlbedo.value = this.albedo.texture
    this.compose.uniforms.uStrength.value = strength
    this.quad.material = this.compose
    gl.setRenderTarget(null)
    this.quad.render(gl)
    gl.setRenderTarget(previous.target)
  }

  dispose() {
    for (const target of [this.albedo, this.geometry, this.ping, this.pong]) target.dispose()
    for (const material of this.albedoCache.values()) material.dispose()
    for (const material of this.geometryCache.values()) material.dispose()
    this.prepare.dispose()
    this.blur.dispose()
    this.compose.dispose()
    this.quad.dispose()
  }
}
