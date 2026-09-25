// Browser side of the offline pipeline: build a FormaKit room exactly as the
// site does, export it as GLB for Blender/Cycles, and rasterise a depth map
// (used by the parallax room viewer) from the same camera.
import './globals.js';
import '../../../js/room-kit.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const THREE = globalThis.THREE;
const Kit = globalThis.FormaKit;
const textureCache = {};

function depthMaterial(near, far) {
  // Normalised disparity (1/z): near = white, far = black.
  return new THREE.ShaderMaterial({
    uniforms: { near: { value: near }, far: { value: far } },
    vertexShader: 'varying float vZ; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float near; uniform float far; varying float vZ; void main(){ float d = clamp((1.0/vZ - 1.0/far) / (1.0/near - 1.0/far), 0.0, 1.0); gl_FragColor = vec4(vec3(d), 1.0); }',
    side: THREE.DoubleSide,
  });
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

window.exportJob = async function exportJob(job) {
  const M = Kit.buildMaterials({ textureSize: job.textureSize || 1024, palette: job.palette, textureCache });
  const room = Kit.createRoom(job.room, M, Object.assign({ frontWall: true }, job.options));
  const lighting = Object.assign({}, room.lighting, job.lighting || {});
  lighting.lampIntensity = lighting.lampIntensity ?? 4;
  lighting.lampSoftIntensity = lighting.lampSoftIntensity ?? 1.6;
  M.light.emissiveIntensity = lighting.lampIntensity;
  M.lightSoft.emissiveIntensity = lighting.lampSoftIntensity;

  const scene = new THREE.Scene();
  scene.add(room.root);
  scene.updateMatrixWorld(true);
  const camera = Object.assign({}, room.cameras[job.camera], job.cameraOverride || {});

  const glb = await new GLTFExporter().parseAsync(scene, { binary: true, maxTextureSize: 2048 });
  const out = { glb: toBase64(glb), camera, lighting };

  if (job.depth) {
    const W = job.width, H = job.height;
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H);
    const cam = new THREE.PerspectiveCamera();
    cam.near = 0.05;
    cam.far = 200;
    Kit.applyCamera(cam, camera, W, H);
    scene.background = new THREE.Color(0x000000);
    scene.overrideMaterial = depthMaterial(job.depth.near || 0.8, job.depth.far || 14);
    renderer.render(scene, cam);
    const dw = job.depth.width || 800, dh = Math.round(dw * H / W);
    const c = document.createElement('canvas');
    c.width = dw;
    c.height = dh;
    const ctx = c.getContext('2d');
    ctx.filter = `blur(${job.depth.blur ?? 3}px)`;
    ctx.drawImage(renderer.domElement, 0, 0, dw, dh);
    out.depth = c.toDataURL('image/png');
    renderer.dispose();
  }
  return out;
};
window.exporterReady = true;

// Encode every procedural texture (and normal map) for the live site.
// Large-scale surfaces keep 1024px; fine repeating textures drop to 512px.
window.exportTextures = function exportTextures() {
  const full = new Set(['planks', 'wood', 'marble', 'travTiles', 'planks-normal', 'wood-normal', 'travTiles-normal']);
  return Kit.generateTextureSet(1024).map(({ name, canvas }) => {
    const size = full.has(name) ? 1024 : 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, size, size);
    return { name, url: c.toDataURL('image/webp', name.endsWith('-normal') ? 0.9 : 0.82) };
  });
};
