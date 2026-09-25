// Builds assets/vendor/three.bundle.min.js: a classic-script build of Three.js
// plus the few addons the site uses, exposed as window.THREE. A classic script
// (not an ES module) keeps the site working when index.html is opened straight
// from disk (file://), where browsers block module imports.
//
//   npx esbuild src/three-vendor.js --bundle --minify --format=iife \
//     --outfile=../../assets/vendor/three.bundle.min.js
import * as CORE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

globalThis.THREE = Object.assign({}, CORE, {
  RoundedBoxGeometry, mergeGeometries, EffectComposer, RenderPass, GTAOPass, OutputPass,
});
