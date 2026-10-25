/**
 * The final colour grade, applied after tone mapping, in display space: a
 * gentle S-curve, a little extra colour, warm light and cool shade, haze
 * lifting the blacks, and a soft vignette. Each weather and time of day has
 * its own grade, blended by the scene every frame, so a rainy afternoon is
 * cool and quiet and a summer evening is golden.
 */
import * as THREE from 'three'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

export type Grade = {
  /** Above 1, richer colour; below 1, greyer. */
  saturation: number
  /** S-curve strength around mid-grey. */
  contrast: number
  /** Multiplier on the brightest tones (the colour of the light). */
  highlights: THREE.Color
  /** Added to the darkest tones (the colour of shade and haze). */
  shadows: THREE.Color
  /** How far the corners darken. */
  vignette: number
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1 },
    uContrast: { value: 0 },
    uHigh: { value: new THREE.Color(1, 1, 1) },
    uLow: { value: new THREE.Color(0, 0, 0) },
    uVignette: { value: 0 },
    uAspect: { value: 1 },
    uSeed: { value: 0 },
    /** 1 for the greyscale debug view: values only. */
    uGrey: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation, uContrast, uVignette, uAspect, uSeed, uGrey;
    uniform vec3 uHigh, uLow;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Colour: lift what is muted more than what is already strong.
      float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(vec3(l), c, mix(uSaturation, 1.0, chroma * 0.6));
      // Light and shade: tint by brightness, keeping mid-tones near neutral.
      float hi = smoothstep(0.35, 1.0, l);
      c *= mix(vec3(1.0), uHigh, hi);
      c += uLow * (1.0 - smoothstep(0.0, 0.55, l));
      // A soft S-curve.
      vec3 s = c * c * (3.0 - 2.0 * c);
      c = mix(c, s, uContrast);
      // Vignette, round rather than stretched to the screen.
      vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(v) * 1.25);
      // A trace of dither, so the sky's gradients do not band.
      c += (hash(vUv * 731.0) - 0.5) / 255.0;
      c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uGrey);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }`,
}

export class GradePass extends ShaderPass {
  constructor() {
    super(GradeShader)
  }

  set(g: Grade, aspect: number) {
    const u = this.uniforms
    u.uSaturation.value = g.saturation
    u.uContrast.value = g.contrast
    ;(u.uHigh.value as THREE.Color).copy(g.highlights)
    ;(u.uLow.value as THREE.Color).copy(g.shadows)
    u.uVignette.value = g.vignette
    u.uAspect.value = aspect
    u.uSeed.value = (u.uSeed.value + 0.618) % 1
  }
}

/** A fresh grade to blend into. */
export function grade(): Grade {
  return { saturation: 1, contrast: 0, highlights: new THREE.Color(1, 1, 1), shadows: new THREE.Color(0, 0, 0), vignette: 0 }
}

/** `into = into + (g - into) * k`, field by field. */
export function blendGrade(into: Grade, g: Grade, k: number) {
  into.saturation += (g.saturation - into.saturation) * k
  into.contrast += (g.contrast - into.contrast) * k
  into.highlights.lerp(g.highlights, k)
  into.shadows.lerp(g.shadows, k)
  into.vignette += (g.vignette - into.vignette) * k
  return into
}
