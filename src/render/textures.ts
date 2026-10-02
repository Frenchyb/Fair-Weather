/**
 * Photographic surfaces from Poly Haven (CC0): grass, raked soil and stone
 * paving, plus a real sky to light the garden with. They load in the
 * background; until they arrive everything draws in plain colour.
 */
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import grassDiff from '../assets/leafy_grass_diff_1k.jpg'
import grassNor from '../assets/leafy_grass_nor_gl_1k.jpg'
import dirtDiff from '../assets/raked_dirt_diff_1k.jpg'
import dirtNor from '../assets/raked_dirt_nor_gl_1k.jpg'
import skyHdr from '../assets/kloofendal_48d_partly_cloudy_puresky_1k.hdr'
import stoneDiff from '../assets/stone_tiles_02_diff_1k.jpg'
import stoneNor from '../assets/stone_tiles_02_nor_gl_1k.jpg'
import stoneRough from '../assets/stone_tiles_02_rough_512.jpg'

const loader = new THREE.TextureLoader()

function tex(url: string, colour: boolean) {
  const t = loader.load(url)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  return t
}

export const surfaces = {
  grass: { map: tex(grassDiff, true), normal: tex(grassNor, false) },
  dirt: { map: tex(dirtDiff, true), normal: tex(dirtNor, false) },
  stone: { map: tex(stoneDiff, true), normal: tex(stoneNor, false), rough: tex(stoneRough, false) },
}

/** The real sky, prefiltered for lighting. Calls back once it has loaded. */
export function loadSkyLight(renderer: THREE.WebGLRenderer, done: (env: THREE.Texture) => void) {
  new HDRLoader().load(skyHdr, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping
    const pm = new THREE.PMREMGenerator(renderer)
    done(pm.fromEquirectangular(hdr).texture)
    hdr.dispose()
    pm.dispose()
  })
}
