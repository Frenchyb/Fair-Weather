/**
 * The cloud's shade, painted onto every material that sits on the ground.
 *
 * It is drawn from the same radius and soft edge the simulation uses for light,
 * so the shadow you see is exactly the shade the plants feel. A real shadow
 * map would fall off to one side with the sun's angle and mislead the eye.
 */
import * as THREE from 'three'
import { T } from '../tuning'

export const shadeUniforms = {
  uCloud: { value: new THREE.Vector2() },
  uRadius: { value: T.cloud.size.reference },
  uSoft: { value: T.cloud.softEdge },
  uDark: { value: T.render.shadeDarkness },
}

export function shaded<M extends THREE.Material>(material: M): M {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shadeUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vShadeXZ;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 shadeWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          shadeWorld = instanceMatrix * shadeWorld;
        #endif
        vShadeXZ = (modelMatrix * shadeWorld).xz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vShadeXZ;
        uniform vec2 uCloud;
        uniform float uRadius, uSoft, uDark;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `float shadeCover = 1.0 - smoothstep(uRadius - uSoft * 0.5, uRadius + uSoft * 0.5,
          distance(vShadeXZ, uCloud));
        gl_FragColor.rgb *= mix(1.0, uDark, shadeCover);
        #include <dithering_fragment>`,
      )
  }
  return material
}
