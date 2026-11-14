/**
 * The emails: paper envelopes drifting through the sky in trails. Most are worth a point; gold
 * "replies" are worth five and dart away from you; red spam costs you and knocks you about.
 */
import * as THREE from 'three';
import { U } from '../world/shared';

export type Kind = 'mail' | 'reply' | 'spam';
export const POINTS: Record<Kind, number> = { mail: 1, reply: 5, spam: -5 };

export interface Email {
  kind: Kind;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: number;
  seed: number;
  alive: boolean;
  /** seconds since eaten, for the gulp animation */
  gone: number;
}

function envelopeTexture(kind: Kind): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 168;
  const g = c.getContext('2d')!;
  const paper = kind === 'spam' ? '#c9483b' : kind === 'reply' ? '#f4d27a' : '#fbf6ec';
  const line = kind === 'spam' ? '#6e1d17' : kind === 'reply' ? '#9a6b14' : '#2d6c8f';
  g.fillStyle = paper;
  g.fillRect(0, 0, 256, 168);
  if (kind === 'mail') {
    // airmail stripes round the edge, in Sellbird blue and a warm red
    for (let i = -2; i < 40; i++) {
      g.fillStyle = i % 2 ? '#2d6c8f' : '#c8553d';
      g.save();
      g.beginPath();
      g.rect(0, 0, 256, 168);
      g.rect(12, 12, 232, 144);
      g.clip('evenodd');
      g.translate(i * 18, 0);
      g.rotate(0.6);
      g.fillRect(0, -40, 9, 400);
      g.restore();
    }
  }
  // the flap
  g.strokeStyle = line;
  g.lineWidth = 5;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(16, 18);
  g.lineTo(128, 96);
  g.lineTo(240, 18);
  g.stroke();
  g.globalAlpha = 0.5;
  g.beginPath();
  g.moveTo(16, 152);
  g.lineTo(100, 92);
  g.moveTo(240, 152);
  g.lineTo(156, 92);
  g.stroke();
  g.globalAlpha = 1;
  // the seal
  g.fillStyle = kind === 'spam' ? '#2a0d0a' : kind === 'reply' ? '#b8402c' : '#244b62';
  g.beginPath();
  g.arc(128, 96, 15, 0, Math.PI * 2);
  g.fill();
  if (kind === 'spam') {
    g.fillStyle = '#ffe3dc';
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('SPAM', 128, 150);
  }
  if (kind === 'reply') {
    g.fillStyle = '#5b3c06';
    g.font = 'bold 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('RE:', 128, 150);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

const MAX = 90;

export class Emails {
  group = new THREE.Group();
  list: Email[] = [];
  private meshes: Record<Kind, THREE.InstancedMesh>;
  private glow: THREE.Points;
  private glowPos = new Float32Array(MAX * 3);
  private glowCol = new Float32Array(MAX * 3);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();

  constructor() {
    const geo = new THREE.BoxGeometry(2.8, 1.85, 0.06);
    const make = (kind: Kind) => {
      const tex = envelopeTexture(kind);
      const edge = new THREE.MeshLambertMaterial({ color: kind === 'spam' ? '#a33a2f' : kind === 'reply' ? '#e2b956' : '#efe7d8' });
      const face = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35, emissiveMap: tex });
      const mesh = new THREE.InstancedMesh(geo, [edge, edge, edge, edge, face, face], MAX);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = { mail: make('mail'), reply: make('reply'), spam: make('spam') };
    const light = new THREE.DirectionalLight('#fff0d6', 2.2);
    light.position.copy(U.uSun.value).multiplyScalar(10);
    this.group.add(light, new THREE.HemisphereLight('#cfe3f5', '#e8d9bf', 1.4));

    // a soft halo round each envelope, so you can spot them from far off
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(this.glowCol, 3));
    this.glow = new THREE.Points(
      pg,
      new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 } },
        vertexShader: /* glsl */ `
          uniform float uScale;
          varying vec3 vC;
          void main() {
            vC = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = clamp(uScale * 4.0 / -mv.z, 4.0, 90.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vC;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.0, d);
            gl_FragColor = vec4(vC, a * a * 0.55);
          }`,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glow.frustumCulled = false;
    this.group.add(this.glow);
  }

  clear() {
    this.list = [];
  }

  /** A trail of envelopes somewhere ahead: a gentle arc you can sweep through in one pass. */
  spawnTrail(from: THREE.Vector3, heading: number, rand: () => number, spamChance: number) {
    const ang = heading + (rand() - 0.5) * 2.0;
    const dist = 110 + rand() * 170;
    const start = new THREE.Vector3(from.x + Math.sin(ang) * dist, THREE.MathUtils.clamp(from.y + (rand() - 0.5) * 50, 42, 130), from.z + Math.cos(ang) * dist);
    const dir = rand() * Math.PI * 2;
    const bend = (rand() - 0.5) * 0.25;
    const climb = (rand() - 0.5) * 0.25;
    const n = 5 + Math.floor(rand() * 5);
    const spamAt = rand() < spamChance ? Math.floor(rand() * n) : -1;
    const replyAt = rand() < 0.22 ? n - 1 : -1;
    const p = start.clone();
    let d = dir;
    for (let i = 0; i < n; i++) {
      const kind: Kind = i === spamAt ? 'spam' : i === replyAt ? 'reply' : 'mail';
      this.list.push({ kind, pos: p.clone(), vel: new THREE.Vector3(), spin: rand() * 6, seed: rand() * 100, alive: true, gone: 0 });
      d += bend;
      p.x += Math.sin(d) * 8;
      p.z += Math.cos(d) * 8;
      p.y = THREE.MathUtils.clamp(p.y + climb * 8, 38, 135);
    }
  }

  update(dt: number, t: number, bird: THREE.Vector3) {
    const counts: Record<Kind, number> = { mail: 0, reply: 0, spam: 0 };
    let gi = 0;
    for (const em of this.list) {
      if (!em.alive) {
        em.gone += dt;
        if (em.gone > 0.25) continue;
      }
      // replies flee when you get close
      if (em.alive && em.kind === 'reply') {
        const away = em.pos.clone().sub(bird);
        const d = away.length();
        if (d < 26) em.vel.addScaledVector(away.normalize(), (26 - d) * 0.9 * dt);
        em.vel.multiplyScalar(1 - dt * 0.8);
        em.vel.y *= 0.9;
        em.pos.addScaledVector(em.vel, dt);
      }
      const bob = Math.sin(t * 1.3 + em.seed) * 0.35;
      const mesh = this.meshes[em.kind];
      const scale = em.alive ? 1 : Math.max(0.01, 1 - em.gone * 4);
      this.e.set(Math.sin(t * 0.9 + em.seed) * 0.35, t * 0.7 + em.spin, Math.sin(t * 1.1 + em.seed * 2) * 0.25);
      this.q.setFromEuler(this.e);
      this.s.setScalar(scale * (em.kind === 'reply' ? 1.15 : 1));
      const pos = em.alive ? em.pos.clone().setY(em.pos.y + bob) : em.pos.clone().lerp(bird, Math.min(1, em.gone * 4));
      this.m.compose(pos, this.q, this.s);
      mesh.setMatrixAt(counts[em.kind]++, this.m);
      if (em.alive && gi < MAX) {
        pos.toArray(this.glowPos, gi * 3);
        const col = em.kind === 'spam' ? [1, 0.35, 0.3] : em.kind === 'reply' ? [1, 0.8, 0.35] : [1, 0.95, 0.85];
        this.glowCol.set(col, gi * 3);
        gi++;
      }
    }
    for (const k of Object.keys(this.meshes) as Kind[]) {
      this.meshes[k].count = Math.min(counts[k], MAX);
      this.meshes[k].instanceMatrix.needsUpdate = true;
    }
    this.glow.geometry.setDrawRange(0, gi);
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.glow.geometry.attributes.color.needsUpdate = true;
    this.list = this.list.filter((em) => em.alive || em.gone < 0.25);
  }

  get alive() {
    return this.list.filter((e) => e.alive);
  }
}
