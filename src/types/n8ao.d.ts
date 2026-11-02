declare module 'n8ao' {
  import type { Camera, Scene, WebGLRenderer, WebGLRenderTarget } from 'three'
  import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: {
      aoRadius: number
      distanceFalloff: number
      intensity: number
      halfRes: boolean
      gammaCorrection: boolean
      aoSamples: number
      denoiseSamples: number
      denoiseRadius: number
      color: import('three').Color
    }
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void
    setSize(width: number, height: number): void
    render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void
  }
}
