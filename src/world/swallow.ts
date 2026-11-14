/**
 * The Sellbird swallow, modeled from the hero video: steel-blue back with a sheen, rust-red face
 * and throat, a dark breast band, cream belly, long scimitar wings and a deeply forked tail with
 * streamers. Built in code: a lathed body, two-jointed wings (shoulder and wrist) and a tail that
 * spreads in turns, all painted with the scene's two-tone light.
 *
 * Local axes: +Z is forward, +Y up, the left wing along +X.
 */
import * as THREE from 'three';
import { LIGHT, NOISE, U } from './shared';

const C = (hex: string) => new THREE.Color(hex);
const BLUE = C('#2f4f8f');
const BLUE_DEEP = C('#22325e');
const CREAM = C('#f2e7d6');
const RUST = C('#c4552f');
const UNDERWING = C('#b8b0a4');
const UNDERHAND = C('#6e6a6a');
const PRIMARY = C('#3a3f55');

function material(part: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...U },
    defines: { PART: String(part) },
    vertexColors: true,
    side: part === 0 ? THREE.FrontSide : THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 color2;
      varying vec3 vN;
      varying vec3 vW;
      varying vec2 vUv;
      varying vec3 vC;
      varying vec3 vC2;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vUv = uv;
        vC = color;
        vC2 = color2;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vW;
      varying vec2 vUv;
      varying vec3 vC;
      varying vec3 vC2;
      ${LIGHT}
      ${NOISE}
      void main() {
        vec3 n = normalize(vN);
        bool top = gl_FrontFacing;
        if (!top) n = -n;
        vec3 base = top ? vC : vC2;
        #if PART == 1 || PART == 2
          // feather vanes: long primaries fanning out on the hand, short secondaries on the arm
          float lines = PART == 2 ? fract(vUv.x * 9.0 - vUv.y * 5.0) : fract(vUv.x * 14.0);
          base *= 0.86 + 0.14 * smoothstep(0.0, 0.18, lines) * smoothstep(1.0, 0.82, lines);
          // pale feather edges along the trailing edge on the underside
          if (!top) base = mix(base, base * 1.12, smoothstep(0.02, 0.1, vUv.y + 0.02));
        #endif
        #if PART == 3
          if (!top) {
            // the white spots on the underside of the tail
            float spot = smoothstep(0.035, 0.02, length(vec2(abs(vUv.x) - 0.1, vUv.y - 0.2)));
            base = mix(base, vec3(0.95), spot);
          }
        #endif
        vec3 c = paint(base, n, 0.08);
        // the swallow's blue-violet sheen
        vec3 v = normalize(uCam - vW);
        float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 18.0);
        float sheen = top ? smoothstep(0.25, 0.0, length(base - vec3(0.184, 0.31, 0.56))) : 0.0;
        c += vec3(0.45, 0.62, 1.0) * spec * (0.3 + sheen * 1.1);
        c += vec3(0.2, 0.32, 0.6) * sheen * 0.25 * (dot(n, uSun) * 0.5 + 0.5);
        c += vec3(1.0, 0.92, 0.8) * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.12;
        gl_FragColor = vec4(fogIt(c, vW), 1.0);
      }`,
  });
}

function setColors(geo: THREE.BufferGeometry, f: (p: THREE.Vector3) => [THREE.Color, THREE.Color]) {
  const pos = geo.attributes.position;
  const a = new Float32Array(pos.count * 3);
  const b = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const [top, under] = f(p);
    top.toArray(a, i * 3);
    under.toArray(b, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.setAttribute('color2', new THREE.BufferAttribute(b, 3));
}

/** Lay a 2D outline (x outward, y backward) flat in the wing plane, top facing up. */
function flat(points: [number, number][]): THREE.BufferGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(shape, 6);
  g.rotateX(-Math.PI / 2);
  // a little camber: the middle of the chord rides higher
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 0.012 * Math.cos(pos.getZ(i) * 6));
  g.computeVertexNormals();
  return g;
}

/** The right-hand copy of a left-hand part: mirrored, with the winding turned so its top stays on top. */
function mirror(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const m = g.clone();
  m.scale(-1, 1, 1);
  const idx = m.index!;
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, b);
  }
  m.computeVertexNormals();
  return m;
}

function bodyGeometry(): THREE.BufferGeometry {
  const prof: [number, number][] = [
    [0.0, -0.46], [0.03, -0.44], [0.06, -0.36], [0.095, -0.24], [0.12, -0.1], [0.13, 0.02], [0.126, 0.13],
    [0.106, 0.22], [0.094, 0.27], [0.1, 0.32], [0.098, 0.37], [0.08, 0.42], [0.05, 0.455], [0.0, 0.47],
  ];
  const g = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 28);
  g.rotateX(Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    let y = pos.getY(i) * 0.9;
    if (y < 0) y *= 1.08; // a fuller belly
    if (z > 0.25) y += (z - 0.25) * 0.12; // head carried a little high
    pos.setY(i, y);
  }
  g.computeVertexNormals();
  setColors(g, (p) => {
    const r = Math.max(Math.hypot(p.x, p.y), 1e-4);
    const ny = p.y / r;
    const c = CREAM.clone().lerp(BLUE, THREE.MathUtils.smoothstep(ny, -0.35, 0.1));
    // dark breast band, rust throat and face, rust forehead
    if (p.z > 0.17 && p.z < 0.29 && ny < 0) c.lerp(BLUE_DEEP, THREE.MathUtils.smoothstep(-ny, 0.0, 0.5) * 0.9);
    if (p.z > 0.28 && ny < 0.25) c.lerp(RUST, THREE.MathUtils.smoothstep(p.z, 0.28, 0.33) * THREE.MathUtils.smoothstep(0.25 - ny, 0, 0.3));
    if (p.z > 0.41 && ny > 0.2) c.lerp(RUST, THREE.MathUtils.smoothstep(p.z, 0.41, 0.44));
    if (p.z < -0.3) c.lerp(BLUE_DEEP, 0.4);
    return [c, c];
  });
  return g;
}

function armGeometry(): THREE.BufferGeometry {
  const pts: [number, number][] = [[0, -0.1], [0.15, -0.112], [0.3, -0.1], [0.44, -0.08], [0.44, 0.07]];
  // secondaries: a scalloped trailing edge
  const n = 7;
  for (let k = 1; k <= n; k++) {
    const x = 0.44 - (k / n) * 0.44;
    const base = 0.075 + ((0.44 - x) / 0.44) * 0.07;
    pts.push([x + 0.03, base - 0.018], [x, base]);
  }
  const g = flat(pts);
  setColors(g, (p) => {
    const t = p.x / 0.44;
    const top = BLUE.clone().lerp(PRIMARY, t * 0.5);
    const under = UNDERWING.clone().lerp(UNDERHAND, THREE.MathUtils.smoothstep(-p.z, 0.0, 0.12) * 0.8);
    return [top, under];
  });
  return g;
}

function handGeometry(): THREE.BufferGeometry {
  // a swept, pointed scimitar: the leading edge curves back to the tip, primaries along the trailing edge
  const pts: [number, number][] = [[0, -0.08], [0.22, -0.065], [0.45, -0.01], [0.68, 0.09], [0.86, 0.22], [0.97, 0.33]];
  const tip: [number, number] = [0.94, 0.345];
  const wrist: [number, number] = [0, 0.075];
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = tip[0] + (wrist[0] - tip[0]) * t;
    const y = tip[1] + (wrist[1] - tip[1]) * t;
    pts.push([x + 0.02 * (1 - t), y + 0.018 * (1 - t * 0.6)]);
    if (k < n) pts.push([x - 0.035, y - 0.022]);
  }
  const g = flat(pts);
  setColors(g, (p) => {
    const t = p.x / 0.97;
    return [PRIMARY.clone().lerp(BLUE, (1 - t) * 0.6), UNDERHAND.clone().lerp(C('#5f5b5c'), t)];
  });
  return g;
}

function tailGeometry(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0.06, 0], [0.13, 0.22], [0.17, 0.38], [0.24, 0.72], [0.31, 1.02], [0.27, 0.74], [0.12, 0.4], [0, 0.31],
    [-0.12, 0.4], [-0.27, 0.74], [-0.31, 1.02], [-0.24, 0.72], [-0.17, 0.38], [-0.13, 0.22], [-0.06, 0],
  ];
  const g = flat(pts);
  setColors(g, () => [BLUE.clone().lerp(BLUE_DEEP, 0.3), C('#6c6a72')]);
  return g;
}

export interface Wing {
  shoulder: THREE.Object3D;
  wrist: THREE.Object3D;
  side: 1 | -1;
}

export class Swallow {
  root = new THREE.Group();
  body = new THREE.Group();
  wings: Wing[] = [];
  tail = new THREE.Object3D();
  private phase = 0;
  /** 0 gliding, 1 full wingbeats */
  flap = 0;
  /** 0 wings out, 1 swept back for a dive */
  sweep = 0;
  /** tail spread, 0..1 */
  spread = 0;
  onBeat: (() => void) | null = null;

  constructor() {
    this.root.add(this.body);
    const bodyMat = material(0);
    const body = new THREE.Mesh(bodyGeometry(), bodyMat);
    this.body.add(body);

    const dark = new THREE.MeshBasicMaterial({ color: '#111114' });
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.07, 8).rotateX(Math.PI / 2), dark);
    beak.position.set(0, 0.035, 0.49);
    this.body.add(beak);
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), dark);
      eye.position.set(0.058 * s, 0.07, 0.4);
      this.body.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      glint.position.set(0.069 * s, 0.078, 0.408);
      this.body.add(glint);
    }

    const arm = armGeometry();
    const hand = handGeometry();
    const armMat = material(1);
    const handMat = material(2);
    for (const side of [1, -1] as const) {
      const shoulder = new THREE.Object3D();
      shoulder.position.set(0.075 * side, 0.05, 0.06);
      const wrist = new THREE.Object3D();
      wrist.position.set(0.44 * side, 0, 0);
      shoulder.add(new THREE.Mesh(side === 1 ? arm : mirror(arm), armMat));
      wrist.add(new THREE.Mesh(side === 1 ? hand : mirror(hand), handMat));
      shoulder.add(wrist);
      this.body.add(shoulder);
      this.wings.push({ shoulder, wrist, side });
    }

    this.tail.position.set(0, 0.01, -0.4);
    this.tail.add(new THREE.Mesh(tailGeometry(), material(3)));
    this.body.add(this.tail);
    this.root.traverse((o) => (o.frustumCulled = false));
  }

  update(dt: number, pitchInput: number) {
    const freq = 4.2 + this.flap * 1.6;
    const before = Math.sin(this.phase);
    this.phase += dt * freq * Math.PI * 2;
    const s = Math.sin(this.phase);
    if (before < 0 && s >= 0 && this.flap > 0.3) this.onBeat?.();
    const a = this.flap;
    const up = Math.max(0, Math.cos(this.phase));
    for (const w of this.wings) {
      const k = w.side;
      w.shoulder.rotation.z = k * (0.1 + a * 0.95 * s - this.sweep * 0.08);
      w.shoulder.rotation.y = k * (0.12 + this.sweep * 0.5 + a * 0.12 * up);
      w.wrist.rotation.z = k * (a * 0.55 * Math.sin(this.phase - 0.8) - 0.04);
      w.wrist.rotation.y = k * (0.1 + this.sweep * 0.7 + a * 0.35 * up);
    }
    this.body.position.y = -a * 0.035 * s;
    this.tail.scale.x = 1 + this.spread * 0.7;
    this.tail.rotation.x = -pitchInput * 0.25;
  }
}
