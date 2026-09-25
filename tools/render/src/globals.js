// Expose THREE (plus the addons the kit uses) globally before room-kit.js
// evaluates, mirroring assets/vendor/three.bundle.min.js on the site.
import * as CORE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

globalThis.THREE = Object.assign({}, CORE, { RoundedBoxGeometry, mergeGeometries });
