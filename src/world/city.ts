/**
 * The city far below: limestone blocks with zinc mansard roofs and terracotta chimney pots, street
 * trees, parks, a river and the odd domed landmark. One tile of 20 x 20 blocks, wrapped round the
 * camera so it never runs out.
 */
import * as THREE from 'three';
import { LIGHT, NOISE, U, WRAP, rng } from './shared';

export const BLOCK = 75; // 60 m of buildings, 15 m of street
const LOT = 60;
const N = 20;
export const CITY_TILE = BLOCK * N;
const HALF = CITY_TILE / 2;

/** 0 buildings, 1 park, 2 river, 3 square with a dome */
const KIND = new Uint8Array(N * N);
const RIVER_ROW = 6;

interface Part {
  center: THREE.Vector3;
  m: THREE.Matrix4;
  tint: number;
}

function partsMesh(geo: THREE.BufferGeometry, parts: Part[], material: THREE.ShaderMaterial) {
  const centers = new Float32Array(parts.length * 3);
  const tints = new Float32Array(parts.length);
  parts.forEach((p, i) => {
    p.center.toArray(centers, i * 3);
    tints[i] = p.tint;
  });
  geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1));
  const mesh = new THREE.InstancedMesh(geo, material, parts.length);
  parts.forEach((p, i) => mesh.setMatrixAt(i, p.m));
  mesh.frustumCulled = false;
  return mesh;
}

const VERT = /* glsl */ `
  uniform vec3 uCam;
  uniform float uTile;
  uniform float uTime;
  attribute vec3 aCenter;
  attribute float aTint;
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vL;
  varying float vTint;
  varying float vH;
  ${WRAP}
  ${NOISE}
  void main() {
    vec3 c = wrapAround(aCenter, uTile);
    vec3 p = position;
    #ifdef LUMPY
    p *= 1.0 + (vnoise3(position * 2.5 + aCenter * 0.1) - 0.5) * 0.35;
    #endif
    vec4 local = instanceMatrix * vec4(p, 1.0);
    vL = local.xyz;
    vW = c + local.xyz;
    vN = normalize(mat3(instanceMatrix) * normal);
    vTint = aTint;
    vH = instanceMatrix[1][1];
    gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
  }`;

function mat(frag: string, defines: Record<string, string> = {}) {
  return new THREE.ShaderMaterial({ uniforms: { ...U, uTile: { value: CITY_TILE } }, defines, vertexShader: VERT, fragmentShader: frag });
}

const HEAD = /* glsl */ `
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vW;
  varying vec3 vL;
  varying float vTint;
  varying float vH;
  ${LIGHT}
  ${NOISE}
`;

const WALLS = mat(/* glsl */ `
  ${HEAD}
  void main() {
    vec3 n = normalize(vN);
    vec3 stone = mix(vec3(0.93, 0.87, 0.76), vec3(0.89, 0.82, 0.70), vTint);
    vec3 c = stone;
    if (abs(n.y) < 0.5) {
      float u = abs(n.x) > 0.5 ? vW.z : vW.x;
      float y = vL.y;
      float col = fract(u / 3.0);
      float row = fract(y / 3.2);
      bool win = col > 0.3 && col < 0.7 && row > 0.28 && row < 0.86 && y > 4.2 && y < vH - 0.6;
      if (win) c = mix(vec3(0.33, 0.38, 0.47), vec3(0.62, 0.72, 0.84), smoothstep(0.86, 0.28, row) * 0.5);
      // wrought-iron balconies on the second and top floors
      float bal = step(abs(y - 7.3), 0.25) + step(abs(y - (vH - 3.4)), 0.25);
      if (bal > 0.0 && col > 0.2 && col < 0.8) c = vec3(0.17, 0.18, 0.2);
      // shops at street level
      if (y < 4.0) c = mix(stone * 0.8, vec3(0.30, 0.33, 0.38), step(0.18, col) * step(col, 0.82) * step(0.6, y) * step(y, 3.4));
      // a cornice under the roof
      if (y > vH - 0.5) c = stone * 1.05;
      c *= 0.9 + 0.1 * smoothstep(0.0, 6.0, y);
    }
    c *= 0.95 + vnoise(vW.xz * 0.3 + vW.y) * 0.1;
    gl_FragColor = vec4(fogIt(paint(c, n, 0.06), vW), 1.0);
  }`);

const ROOFS = mat(/* glsl */ `
  ${HEAD}
  void main() {
    vec3 n = normalize(vN);
    vec3 zinc = mix(vec3(0.50, 0.56, 0.65), vec3(0.44, 0.48, 0.56), vTint);
    // standing seams
    float seam = smoothstep(0.92, 1.0, fract((abs(n.x) > abs(n.z) ? vW.z : vW.x) * 1.4));
    vec3 c = zinc * (1.0 - seam * 0.12);
    // dormer windows on the slopes
    if (n.y < 0.9 && n.y > 0.1) {
      float u = fract((abs(n.x) > abs(n.z) ? vW.z : vW.x) / 3.0);
      if (u > 0.35 && u < 0.65 && fract(vL.y / 4.4) < 0.5) c = vec3(0.86, 0.82, 0.74);
    }
    gl_FragColor = vec4(fogIt(paint(c, n, 0.04), vW), 1.0);
  }`);

const CHIMNEYS = mat(/* glsl */ `
  ${HEAD}
  void main() {
    vec3 n = normalize(vN);
    vec3 c = mix(vec3(0.78, 0.45, 0.32), vec3(0.85, 0.78, 0.66), step(0.5, vTint));
    if (vL.y > vH * 0.85) c = vec3(0.72, 0.38, 0.26);
    gl_FragColor = vec4(fogIt(paint(c, n, 0.05), vW), 1.0);
  }`);

const TREES = mat(
  /* glsl */ `
  ${HEAD}
  void main() {
    vec3 n = normalize(vN);
    float leaf = vnoise3(vW * 0.7);
    vec3 c = mix(vec3(0.36, 0.52, 0.27), vec3(0.52, 0.64, 0.30), vTint * 0.6 + leaf * 0.5);
    float l = dot(n, uSun) * 0.5 + 0.5 + (leaf - 0.5) * 0.5;
    vec3 col = mix(c * vec3(0.55, 0.68, 0.8), c * vec3(1.15, 1.08, 0.9), smoothstep(0.4, 0.65, l));
    gl_FragColor = vec4(fogIt(col, vW), 1.0);
  }`,
  { LUMPY: '' },
);

const DOMES = mat(/* glsl */ `
  ${HEAD}
  void main() {
    vec3 n = normalize(vN);
    float rib = smoothstep(0.9, 1.0, fract(atan(vL.x, vL.z) * 3.82));
    vec3 c = mix(vec3(0.45, 0.50, 0.58), vec3(0.85, 0.7, 0.36), rib);
    if (vTint > 0.5) c = vec3(0.92, 0.86, 0.74);
    gl_FragColor = vec4(fogIt(paint(c, n, 0.05), vW), 1.0);
  }`);

const GROUND = new THREE.ShaderMaterial({
  uniforms: { ...U, uKinds: { value: null as THREE.DataTexture | null }, uHalf: { value: HALF } },
  vertexShader: /* glsl */ `
    varying vec3 vW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uKinds;
    uniform float uHalf;
    uniform float uTime;
    varying vec3 vW;
    ${LIGHT}
    ${NOISE}
    void main() {
      vec2 t = mod(vW.xz + uHalf, uHalf * 2.0);
      vec2 cell = floor(t / ${BLOCK.toFixed(1)});
      vec2 inBlock = mod(t, ${BLOCK.toFixed(1)});
      float kind = texture2D(uKinds, (cell + 0.5) / ${N.toFixed(1)}).r * 255.0;
      bool lot = inBlock.x < ${LOT.toFixed(1)} && inBlock.y < ${LOT.toFixed(1)};
      vec3 c;
      float n = vnoise(vW.xz * 0.15);
      if (kind > 1.5 && kind < 2.5) {
        // the river, with quays along both banks
        float z = inBlock.y;
        bool quay = z < 6.0 || z > ${(BLOCK - 6).toFixed(1)};
        float glint = pow(vnoise(vW.xz * vec2(0.12, 0.6) + vec2(uTime * 0.3, 0.0)), 6.0);
        c = quay ? vec3(0.83, 0.78, 0.68) : mix(vec3(0.42, 0.58, 0.66), vec3(0.6, 0.74, 0.8), n) + glint * 0.6;
      } else if (!lot) {
        // streets with pale pavements
        vec2 e = min(abs(inBlock - ${LOT.toFixed(1)}), abs(inBlock - ${BLOCK.toFixed(1)}));
        bool walk = min(inBlock.x < ${LOT.toFixed(1)} ? 99.0 : e.x, inBlock.y < ${LOT.toFixed(1)} ? 99.0 : e.y) < 3.0;
        c = walk ? vec3(0.82, 0.79, 0.73) : vec3(0.55, 0.57, 0.6) + n * 0.05;
      } else if (kind > 0.5 && kind < 1.5) {
        // a park: lawns and gravel paths
        vec2 q = abs(inBlock - 30.0);
        bool path = abs(q.x - q.y) < 2.0 || q.x < 1.6 || q.y < 1.6;
        c = path ? vec3(0.86, 0.8, 0.66) : mix(vec3(0.47, 0.62, 0.33), vec3(0.58, 0.7, 0.38), n);
      } else {
        // courtyards and squares: pale paving
        c = mix(vec3(0.80, 0.75, 0.66), vec3(0.86, 0.82, 0.74), n);
      }
      gl_FragColor = vec4(fogIt(paint(c, vec3(0, 1, 0), 0.1), vW), 1.0);
    }`,
});

export function makeCity(): THREE.Group {
  const r = rng(11);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const v = r();
      KIND[j * N + i] = j === RIVER_ROW ? 2 : v < 0.09 ? 1 : v < 0.115 ? 3 : 0;
    }
  const kinds = new THREE.DataTexture(KIND, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  kinds.needsUpdate = true;
  GROUND.uniforms.uKinds.value = kinds;

  const walls: Part[] = [];
  const roofs: Part[] = [];
  const chimneys: Part[] = [];
  const trees: Part[] = [];
  const domes: Part[] = [];
  const q = new THREE.Quaternion();
  const box = (center: THREE.Vector3, x: number, y: number, z: number, w: number, h: number, d: number, tint: number, list: Part[]) =>
    list.push({ center, m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d)), tint });

  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const kind = KIND[j * N + i];
      const x0 = -HALF + i * BLOCK;
      const z0 = -HALF + j * BLOCK;
      if (kind === 2) {
        // plane trees along the quays
        for (let x = 4; x < BLOCK; x += 9)
          for (const z of [3, BLOCK - 3]) {
            const s = 3.6 + r() * 1.4;
            const c = new THREE.Vector3(x0 + x, 0, z0 + z);
            box(c, 0, 5.5, 0, s, s * 1.1, s, r(), trees);
          }
        continue;
      }
      if (kind === 1 || kind === 3) {
        const count = kind === 1 ? 26 : 10;
        for (let k = 0; k < count; k++) {
          const s = 3.5 + r() * 2.5;
          const c = new THREE.Vector3(x0 + 5 + r() * (LOT - 10), 0, z0 + 5 + r() * (LOT - 10));
          if (kind === 3 && Math.hypot(c.x - x0 - 30, c.z - z0 - 30) < 20) continue;
          box(c, 0, s * 1.2, 0, s, s * 1.1, s, r(), trees);
        }
        if (kind === 3) {
          const c = new THREE.Vector3(x0 + 30, 0, z0 + 30);
          // a church front with a drum and a ribbed dome rising behind it
          box(c, 0, 0, 0, 34, 17, 24, 0.2, walls);
          domes.push({ center: c, m: new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), q, new THREE.Vector3(9, 27, 9)), tint: 1 });
          domes.push({ center: c, m: new THREE.Matrix4().compose(new THREE.Vector3(0, 27, 0), q, new THREE.Vector3(9.6, 10, 9.6)), tint: 0 });
        }
        continue;
      }
      // buildings round the block's edge, courtyard in the middle
      for (let side = 0; side < 4; side++) {
        let s = 0;
        while (s < LOT - 4) {
          const w = Math.min(LOT - s, 9 + r() * 7);
          const d = 11 + r() * 4;
          const h = 15 + Math.floor(r() * 4) * 3.2;
          const roofH = 3.5 + r() * 1.5;
          const along = s + w / 2;
          let cx: number, cz: number, sx: number, sz: number;
          if (side === 0) [cx, cz, sx, sz] = [along, d / 2, w, d];
          else if (side === 1) [cx, cz, sx, sz] = [LOT - d / 2, along, d, w];
          else if (side === 2) [cx, cz, sx, sz] = [LOT - along, LOT - d / 2, w, d];
          else [cx, cz, sx, sz] = [d / 2, LOT - along, d, w];
          const c = new THREE.Vector3(x0 + cx, 0, z0 + cz);
          const tint = r();
          box(c, 0, 0, 0, sx, h, sz, tint, walls);
          box(c, 0, h, 0, sx, roofH, sz, r(), roofs);
          const pots = 1 + Math.floor(r() * 3);
          for (let k = 0; k < pots; k++) {
            const ox = (r() - 0.5) * sx * 0.7;
            const oz = (r() - 0.5) * sz * 0.7;
            box(c, ox, h + roofH * 0.4, oz, 1.2 + r() * 1.4, roofH * 0.6 + 1.6, 0.9, r(), chimneys);
          }
          s += w;
        }
      }
      // street trees along one side
      if (r() < 0.5)
        for (let x = 5; x < LOT; x += 10) {
          const s = 3 + r();
          box(new THREE.Vector3(x0 + x, 0, z0 + LOT + 4), 0, 5, 0, s, s * 1.1, s, r(), trees);
        }
    }

  const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofGeo = new THREE.CylinderGeometry(0.42, 0.7071, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  roofGeo.computeVertexNormals();
  const domeGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const drumGeo = new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0);

  const g = new THREE.Group();
  g.add(partsMesh(unitBox.clone(), walls, WALLS));
  g.add(partsMesh(roofGeo, roofs, ROOFS));
  g.add(partsMesh(unitBox.clone(), chimneys, CHIMNEYS));
  g.add(partsMesh(new THREE.IcosahedronGeometry(1, 2), trees, TREES));
  const drums = domes.filter((d) => d.tint === 1);
  const caps = domes.filter((d) => d.tint === 0);
  g.add(partsMesh(drumGeo, drums, DOMES));
  g.add(partsMesh(domeGeo, caps, DOMES));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), GROUND);
  ground.frustumCulled = false;
  ground.name = 'ground';
  g.add(ground);
  return g;
}
