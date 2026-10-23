/**
 * Photographic surfaces from Poly Haven (CC0): grass, raked soil, stone
 * paving, planks, roof tiles, plaster and bark, plus a real sky to light the garden with. They load in the
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
import woodDiff from '../assets/brown_planks_05_diff_512.jpg'
import woodNor from '../assets/brown_planks_05_nor_gl_512.jpg'
import roofDiff from '../assets/clay_roof_tiles_02_diff_512.jpg'
import roofNor from '../assets/clay_roof_tiles_02_nor_gl_512.jpg'
import plasterDiff from '../assets/beige_wall_001_diff_512.jpg'
import plasterNor from '../assets/beige_wall_001_nor_gl_512.jpg'
import barkDiff from '../assets/bark_brown_02_diff_512.jpg'
import barkNor from '../assets/bark_brown_02_nor_gl_512.jpg'
import { T } from '../tuning'

const loader = new THREE.TextureLoader()

function tex(url: string, colour: boolean, repeat = 1) {
  const t = loader.load(url)
  t.repeat.setScalar(repeat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  return t
}

export const surfaces = {
  grass: { map: tex(grassDiff, true), normal: tex(grassNor, false) },
  dirt: { map: tex(dirtDiff, true), normal: tex(dirtNor, false) },
  stone: { map: tex(stoneDiff, true), normal: tex(stoneNor, false), rough: tex(stoneRough, false) },
  // These four are laid on in metres (see `metricUV`), so the repeat is tiles per metre.
  wood: { map: tex(woodDiff, true, 1 / T.look.tile.wood), normal: tex(woodNor, false, 1 / T.look.tile.wood) },
  roof: { map: tex(roofDiff, true, 1 / T.look.tile.roof), normal: tex(roofNor, false, 1 / T.look.tile.roof) },
  plaster: { map: tex(plasterDiff, true, 1 / T.look.tile.plaster), normal: tex(plasterNor, false, 1 / T.look.tile.plaster) },
  bark: { map: tex(barkDiff, true), normal: tex(barkNor, false) },
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
