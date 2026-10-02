/**
 * Shader patches shared by everything that sits on the ground.
 *
 * The cloud's shade is painted from the same radius and soft edge the
 * simulation uses for light, so the shadow you see is exactly the shade the
 * plants feel. A real shadow map would fall off to one side with the sun's
 * angle and mislead the eye.
 *
 * The lawn's memory of the weather (how green, how wet, which way the grass
 * is laid over) arrives as a small texture, `fieldUniforms.uField`, that
 * `GroundView` refreshes from the simulation's grid every frame.
 */
import * as THREE from 'three'
import { T } from '../tuning'

export const shadeUniforms = {
  uCloud: { value: new THREE.Vector2() },
  uRadius: { value: T.cloud.size.reference },
  uSoft: { value: T.cloud.softEdge },
  uDark: { value: T.render.shadeDarkness },
  /** A storm's wide, faint shade, on top of the cloud's own. */
  uStorm: { value: 0 },
}

export const fieldUniforms = {
  uField: { value: null as THREE.Texture | null },
  uFieldMin: { value: new THREE.Vector2(T.yard.x0, T.yard.z0) },
  uFieldSize: { value: new THREE.Vector2(1, 1) },
  uTime: { value: 0 },
  /** How hard the wind is blowing everywhere, 0 calm to 1 storm. */
  uGust: { value: 0 },
  uWind: { value: new THREE.Vector2(1, 0) },
}

/**
 * - `plain`: shade only.
 * - `wet`: paving and stones, which darken when wet and hold puddles.
 * - `lawn`: the ground under the grass: parched to lush, wet, puddles.
 * - `grass`: instanced blades that stand taller and greener, and lie over in the wind.
 */
export type GroundFx = 'plain' | 'wet' | 'lawn' | 'grass'

const FIELD_COMMON = `
uniform sampler2D uField;
uniform vec2 uFieldMin, uFieldSize;
uniform float uTime, uGust;
uniform vec2 uWind;
float fwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fwNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fwHash(i), fwHash(i + vec2(1, 0)), u.x), mix(fwHash(i + vec2(0, 1)), fwHash(i + vec2(1, 1)), u.x), u.y);
}
/** green, wet (0..1 of max), bend x, bend z. Outside the yard: lush, dry, upright. */
vec4 fwField(vec2 xz) {
  vec2 uv = (xz - uFieldMin) / uFieldSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.8, 0.0, 0.0, 0.0);
  vec4 f = texture2D(uField, uv);
  return vec4(f.r, f.g, f.b * 2.0 - 1.0, f.a * 2.0 - 1.0);
}
`

const PUDDLE_LINE = (T.ground.puddleAt / T.ground.maxWet).toFixed(3)

export function shaded<M extends THREE.Material>(material: M, fx: GroundFx = 'plain'): M {
  material.customProgramCacheKey = () => `fw-${fx}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadeUniforms)
    if (fx !== 'plain') Object.assign(shader.uniforms, fieldUniforms)
    let vs = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vShadeXZ;
        ${fx === 'grass' ? FIELD_COMMON + 'varying float vGreen, vTip, vLaid;' : ''}`,
      )
    if (fx === 'grass') {
      // Each blade samples the lawn at its root: greener grass is taller, and
      // laid-over grass leans along its bend, plus a breeze that never stops.
      vs = vs.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 rootXZ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        vec4 fld = fwField(rootXZ);
        vGreen = fld.r;
        vTip = clamp(position.y / 0.32, 0.0, 1.0);
        float h = vTip * vTip;
        transformed.y *= mix(0.45, 1.0, fld.r);
        vec2 bend = fld.ba;
        vLaid = length(bend);
        float sway = sin(uTime * 1.7 + rootXZ.x * 0.45 + rootXZ.y * 0.3) * (0.05 + 0.25 * uGust);
        vec2 lean = bend * 0.22 + uWind * (sway + 0.12 * uGust);
        // Lean is in world space; undo the blade's own rotation.
        mat3 r = mat3(instanceMatrix);
        vec3 local = transpose(r) * vec3(lean.x, 0.0, lean.y) / max(0.001, length(r[0]));
        transformed += local * h;
        transformed.y -= vLaid * 0.12 * h;`,
      )
    }
    shader.vertexShader = vs.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
        vec4 shadeWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          shadeWorld = instanceMatrix * shadeWorld;
        #endif
        vShadeXZ = (modelMatrix * shadeWorld).xz;`,
    )

    let fs = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
        varying vec2 vShadeXZ;
        uniform vec2 uCloud;
        uniform float uRadius, uSoft, uDark, uStorm;
        ${fx !== 'plain' ? FIELD_COMMON : ''}
        ${fx === 'grass' ? 'varying float vGreen, vTip, vLaid;' : ''}`,
    )
    if (fx === 'lawn') {
      fs = fs
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec4 fld = fwField(vShadeXZ);
          float n = fwNoise(vShadeXZ * 0.9) * 0.6 + fwNoise(vShadeXZ * 3.1) * 0.4;
          vec3 parched = mix(vec3(0.42, 0.33, 0.17), vec3(0.55, 0.45, 0.25), n);
          vec3 lush = mix(vec3(0.10, 0.22, 0.05), vec3(0.16, 0.30, 0.07), n);
          float g = smoothstep(0.0, 1.0, fld.r + (n - 0.5) * 0.25);
          diffuseColor.rgb = mix(parched, lush, g);
          float wetness = smoothstep(0.0, 0.35, fld.g);
          diffuseColor.rgb *= mix(1.0, 0.55, wetness);
          float hollow = fwNoise(vShadeXZ * 0.7 + 17.0);
          float puddle = smoothstep(${PUDDLE_LINE} - 0.02, ${PUDDLE_LINE} + 0.06, fld.g + (hollow - 0.55) * 0.25);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.07), puddle * 0.85);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.55, wetness);
          roughnessFactor = mix(roughnessFactor, 0.04, puddle);`,
        )
    } else if (fx === 'wet') {
      fs = fs
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float wetness = smoothstep(0.0, 0.35, fwField(vShadeXZ).g);
          float hollow = fwNoise(vShadeXZ * 0.9 + 5.0);
          float puddle = smoothstep(${PUDDLE_LINE} - 0.02, ${PUDDLE_LINE} + 0.06, fwField(vShadeXZ).g + (hollow - 0.55) * 0.3);
          diffuseColor.rgb *= mix(1.0, 0.6, wetness);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.09, 0.1), puddle * 0.7);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.3, wetness);
          roughnessFactor = mix(roughnessFactor, 0.05, puddle);`,
        )
    } else if (fx === 'grass') {
      fs = fs
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec3 parched = vec3(0.55, 0.45, 0.24);
          vec3 lush = vec3(0.17, 0.36, 0.08);
          vec3 blade = mix(parched, lush, smoothstep(0.0, 1.0, vGreen));
          blade *= mix(0.55, 1.15, vTip);
          // Laid-over grass catches the light along its length, like a mown stripe.
          blade = mix(blade, blade * 1.45 + vec3(0.03, 0.04, 0.0), clamp(vLaid * 1.2, 0.0, 0.6));
          diffuseColor.rgb *= blade;`,
        )
    }
    shader.fragmentShader = fs.replace(
      '#include <dithering_fragment>',
      `float shadeCover = 1.0 - smoothstep(uRadius - uSoft * 0.5, uRadius + uSoft * 0.5,
          distance(vShadeXZ, uCloud));
        gl_FragColor.rgb *= mix(1.0, uDark, shadeCover);
        gl_FragColor.rgb *= 1.0 - uStorm * (1.0 - smoothstep(${T.storm.radius.toFixed(1)}, ${(T.storm.radius + T.storm.softEdge * 2).toFixed(1)}, distance(vShadeXZ, uCloud))) * 0.35;
        #include <dithering_fragment>`,
    )
  }
  return material
}
