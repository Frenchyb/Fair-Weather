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
import { surfaces } from './textures'

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
  /** Photographed grass, used for its light and dark, not its colour. */
  uGrassTex: { value: surfaces.grass.map as THREE.Texture },
}

/**
 * The season and what lies on the ground. `uCover` is a second texture over
 * the same grid as `uField`: R snow, G fallen leaves. Outside the yard, snow
 * reads as `uSnowAll` so the countryside whitens with the garden.
 * `uSeason` is the blend of spring, summer, autumn and winter.
 * `uSkyClouds` are the drifting clouds' shade (x, z, radius, strength).
 */
export const SKY_CLOUDS = 16
export const seasonUniforms = {
  uCover: { value: null as THREE.Texture | null },
  uSnowAll: { value: 0 },
  uSeason: { value: new THREE.Vector4(1, 0, 0, 0) },
  uSkyClouds: { value: Array.from({ length: SKY_CLOUDS }, () => new THREE.Vector4(0, 0, 1, 0)) },
}

/**
 * - `plain`: shade only.
 * - `wet`: paving and stones, which darken when wet and hold puddles.
 * - `lawn`: the ground under the grass: parched to lush, wet, puddles.
 * - `grass`: instanced blades that stand taller and greener, and lie over in the wind.
 */
/**
 * - `foliage`: leaves that turn in autumn and fall in winter.
 * - `evergreen`: leaves that stay, and only dull a little in winter.
 * Everything takes snow on its upward faces.
 */
export type GroundFx = 'plain' | 'wet' | 'lawn' | 'grass' | 'foliage' | 'evergreen'

const FIELD_COMMON = `
uniform sampler2D uField;
uniform vec2 uFieldMin, uFieldSize;
uniform float uTime, uGust;
uniform vec2 uWind;
uniform sampler2D uGrassTex;
uniform sampler2D uCover;
uniform float uSnowAll;
uniform vec4 uSeason;
uniform vec4 uSkyClouds[${SKY_CLOUDS}];
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
/** Snow, leaves. */
vec2 fwCover(vec2 xz) {
  vec2 uv = (xz - uFieldMin) / uFieldSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(uSnowAll, 0.0);
  return texture2D(uCover, uv).rg;
}
float fwLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
`

/** Fallen leaves, speckled over whatever is underneath. */
const LEAVES = `
  {
    float lf = fwCover(vShadeXZ).g;
    if (lf > 0.01) {
      float spot = fwNoise(vShadeXZ * 6.0) * 0.55 + fwHash(floor(vShadeXZ * 11.0)) * 0.45;
      float on = smoothstep(1.0 - lf * 0.85, 1.04 - lf * 0.85, spot);
      float hue = fwHash(floor(vShadeXZ * 11.0) + 7.0);
      vec3 leaf = hue < 0.4 ? vec3(0.62, 0.25, 0.05) : hue < 0.7 ? vec3(0.72, 0.5, 0.08) : hue < 0.85 ? vec3(0.5, 0.1, 0.04) : vec3(0.32, 0.2, 0.1);
      diffuseColor.rgb = mix(diffuseColor.rgb, leaf * 0.55, on);
    }
  }
`

/** Autumn colour and winter's bare branches, keeping the crown's own light and dark. */
const TURN = `
  {
    float lum = fwLum(diffuseColor.rgb);
    float pick = fwNoise(vShadeXZ * 0.35 + 3.0);
    vec3 fall = pick < 0.35 ? vec3(0.78, 0.3, 0.05) : pick < 0.6 ? vec3(0.8, 0.58, 0.1) : pick < 0.8 ? vec3(0.62, 0.12, 0.05) : vec3(0.45, 0.5, 0.12);
    fall *= lum / fwLum(fall) * 1.25;
    diffuseColor.rgb = mix(diffuseColor.rgb, fall, uSeason.z * (0.75 + 0.25 * pick));
    diffuseColor.rgb *= 1.0 + uSeason.x * 0.1;
    if (uSeason.w > 0.01) {
      float twig = fwNoise(vec2(vShadeXZ.x * 4.3 + vShadeH * 3.1, vShadeXZ.y * 4.3 - vShadeH * 2.7));
      if (twig < uSeason.w * 0.6) discard;
      vec3 bare = vec3(0.3, 0.24, 0.18);
      diffuseColor.rgb = mix(diffuseColor.rgb, bare * lum / fwLum(bare) * 0.9, uSeason.w);
    }
  }
`

/** Snow lies on whatever faces up. */
const SNOW = (flat: boolean) => `
  {
    float sn = fwCover(vShadeXZ).r;
    if (sn > 0.005) {
      float wob = fwNoise(vShadeXZ * 2.3 + vShadeH);
      float lie = ${flat ? '1.0' : 'smoothstep(0.2, 0.65, vShadeUp + (wob - 0.5) * 0.3)'};
      float snowy = smoothstep(0.04, 0.45, sn + (wob - 0.5) * 0.25) * lie;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.88, 0.93), snowy);
      roughnessFactor = mix(roughnessFactor, 0.75, snowy);
      metalnessFactor *= 1.0 - snowy;
    }
  }
`

const PUDDLE_LINE = (T.ground.puddleAt / T.ground.maxWet).toFixed(3)

export function shaded<M extends THREE.Material>(material: M, fx: GroundFx = 'plain'): M {
  material.customProgramCacheKey = () => `fw-${fx}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadeUniforms, fieldUniforms, seasonUniforms)
    let vs = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vShadeXZ;
        varying float vShadeUp, vShadeH;
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
        // Snow buries the grass; winter flattens it a little.
        transformed.y *= (1.0 - 0.9 * smoothstep(0.05, 0.6, fwCover(rootXZ).r)) * (1.0 - 0.3 * uSeason.w);
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
        vec4 shadeW = modelMatrix * shadeWorld;
        vShadeXZ = shadeW.xz;
        vShadeH = shadeW.y;
        vShadeUp = dot(normalize(transformedNormal), normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));`,
    )

    let fs = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
        varying vec2 vShadeXZ;
        varying float vShadeUp, vShadeH;
        uniform vec2 uCloud;
        uniform float uRadius, uSoft, uDark, uStorm;
        ${FIELD_COMMON}
        ${fx === 'grass' ? 'varying float vGreen, vTip, vLaid;' : ''}`,
    )
    if (fx === 'lawn') {
      fs = fs
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec4 fld = fwField(vShadeXZ);
          float n = fwNoise(vShadeXZ * 0.9) * 0.6 + fwNoise(vShadeXZ * 3.1) * 0.4;
          vec3 parched = mix(vec3(0.10, 0.085, 0.035), vec3(0.15, 0.125, 0.055), n);
          vec3 lush = mix(vec3(0.05, 0.12, 0.025), vec3(0.085, 0.17, 0.04), n);
          lush = mix(lush, vec3(0.1, 0.12, 0.03), uSeason.z * 0.5);
          lush = mix(lush, vec3(0.075, 0.085, 0.045), uSeason.w * 0.7);
          lush *= 1.0 + uSeason.x * 0.12;
          float g = smoothstep(0.0, 1.0, fld.r + (n - 0.5) * 0.25);
          diffuseColor.rgb = mix(parched, lush, g);
          vec3 photo = texture2D(uGrassTex, vShadeXZ / 2.6).rgb;
          // Normalised by the photo's own average, so it adds detail, not a cast.
          diffuseColor.rgb *= clamp(dot(photo, vec3(0.3, 0.55, 0.15)) / 0.24, 0.45, 1.7);
          float wetness = smoothstep(0.0, 0.35, fld.g);
          diffuseColor.rgb *= mix(1.0, 0.55, wetness);
          float hollow = fwNoise(vShadeXZ * 0.7 + 17.0);
          float puddle = smoothstep(${PUDDLE_LINE} - 0.02, ${PUDDLE_LINE} + 0.06, fld.g + (hollow - 0.55) * 0.25);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.04, 0.05), puddle * 0.7);
          ${LEAVES}`,
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
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.09, 0.1), puddle * 0.7);
          ${LEAVES}`,
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
          vec3 parched = vec3(0.24, 0.20, 0.08);
          vec3 lush = vec3(0.10, 0.25, 0.04);
          lush = mix(lush, vec3(0.22, 0.22, 0.06), uSeason.z * 0.5);
          lush = mix(lush, vec3(0.16, 0.16, 0.08), uSeason.w * 0.7);
          lush *= 1.0 + uSeason.x * 0.1;
          vec3 blade = mix(parched, lush, smoothstep(0.0, 1.0, vGreen));
          blade *= mix(0.55, 1.15, vTip);
          // Laid-over grass catches the light along its length, like a mown stripe.
          blade = mix(blade, blade * 1.45 + vec3(0.03, 0.04, 0.0), clamp(vLaid * 1.2, 0.0, 0.6));
          diffuseColor.rgb *= blade;`,
        )
    } else if (fx === 'foliage') {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${TURN}`)
    } else if (fx === 'evergreen') {
      fs = fs.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= 1.0 - uSeason.w * 0.2;`,
      )
    }
    fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${SNOW(fx === 'lawn' || fx === 'grass')}`)
    shader.fragmentShader = fs.replace(
      '#include <dithering_fragment>',
      `float shadeCover = 1.0 - smoothstep(uRadius - uSoft * 0.5, uRadius + uSoft * 0.5,
          distance(vShadeXZ, uCloud));
        gl_FragColor.rgb *= mix(1.0, uDark, shadeCover);
        float skyLit = 1.0;
        for (int i = 0; i < ${SKY_CLOUDS}; i++) {
          vec4 sc = uSkyClouds[i];
          skyLit = min(skyLit, 1.0 - (1.0 - smoothstep(sc.z * 0.6, sc.z, distance(vShadeXZ, sc.xy))) * sc.w);
        }
        gl_FragColor.rgb *= skyLit;
        gl_FragColor.rgb *= 1.0 - uStorm * (1.0 - smoothstep(${T.storm.radius.toFixed(1)}, ${(T.storm.radius + T.storm.softEdge * 2).toFixed(1)}, distance(vShadeXZ, uCloud))) * 0.35;
        #include <dithering_fragment>`,
    )
  }
  return material
}
