/**
 * Sellbird Sky. Fly the swallow, eat the emails. A round is 90 seconds.
 */
import * as THREE from 'three';
import './styles.css';
import * as sound from './audio/sound';
import { Emails, POINTS, type Email } from './game/emails';
import { Flight } from './game/flight';
import { bindInput, input, readInput, stick } from './game/input';
import { Painterly } from './render/painterly';
import { makeCity } from './world/city';
import { U, rng } from './world/shared';
import { makeClouds, makeSkyDome } from './world/sky';
import { Swallow } from './world/swallow';

THREE.ColorManagement.enabled = false;

const ROUND = Number(new URLSearchParams(location.search).get('secs')) || 90;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const touchDevice = matchMedia('(pointer: coarse)').matches;

// --- renderer and scene
const canvas = $<HTMLCanvasElement>('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 4000);
const sky = makeSkyDome();
const city = makeCity();
const ground = city.getObjectByName('ground')!;
scene.add(sky, makeClouds(), city);
const bird = new Swallow();
bird.root.scale.setScalar(1.7);
scene.add(bird.root);
const emails = new Emails();
scene.add(emails.group);
const post = new Painterly();

// quality tiers, stepped down automatically when frames run slow
const TIERS = [
  { dpr: Math.min(devicePixelRatio, 1.5), radius: 3, paint: true },
  { dpr: 1, radius: 3, paint: true },
  { dpr: 0.8, radius: 2, paint: true },
  { dpr: 0.75, radius: 0, paint: false },
];
let tier = params.has('quality') ? Number(params.get('quality')) : touchDevice ? 1 : 0;
function resize() {
  const t = TIERS[Math.min(tier, TIERS.length - 1)];
  const w = innerWidth;
  const h = innerHeight;
  renderer.setPixelRatio(t.dpr);
  renderer.setSize(w, h, false);
  post.enabled = t.paint && !params.has('raw');
  post.setSize(Math.floor(w * t.dpr), Math.floor(h * t.dpr), t.radius);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 74 : 62;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// --- game state
type Mode = 'title' | 'play' | 'over';
let mode: Mode = 'title';
const flight = new Flight();
const rand = rng(Date.now() & 0xffff);
let score = 0;
let left = ROUND;
let combo = 0;
let lastEat = -10;
let bestStreak = 0;
let replies = 0;
let spams = 0;
let shake = 0;
let best = 0;
try {
  best = Number(localStorage.getItem('sb-best') ?? 0);
} catch {
  /* private mode */
}

const hud = $('hud');
const scoreEl = $('score');
const comboEl = $('combo');
const timeEl = $('time');
const breathEl = $('breath');
const pops = $('pops');
const stickEl = $('stick');
const flapBtn = $('flap');
const muteBtn = $('mute');

$('how').innerHTML = touchDevice
  ? 'Drag anywhere to steer · hold <b>Flap</b> for speed'
  : 'Steer with the mouse or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · hold click or <kbd>Space</kbd> to flap';
bindInput(canvas, flapBtn);

const drawMute = () => (muteBtn.textContent = sound.isMuted() ? '🔇' : '🔊');
drawMute();
muteBtn.addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.isMuted());
  drawMute();
});
bird.onBeat = () => mode === 'play' && sound.wingbeat();

function start() {
  sound.unlock();
  sound.startChime();
  mode = 'play';
  score = combo = replies = spams = bestStreak = 0;
  left = ROUND;
  lastEat = -10;
  emails.clear();
  $('title').hidden = true;
  $('over').hidden = true;
  hud.hidden = false;
  flapBtn.hidden = !touchDevice;
  scoreEl.textContent = '0';
  comboEl.textContent = '';
  perf.reset();
}
function finish() {
  mode = 'over';
  sound.endChime();
  hud.hidden = true;
  flapBtn.hidden = true;
  stickEl.hidden = true;
  if (score > best) {
    best = score;
    try {
      localStorage.setItem('sb-best', String(best));
    } catch {
      /* private mode */
    }
  }
  $('final').textContent = String(score);
  $('best').textContent = String(best);
  $('replies').textContent = String(replies);
  $('streak').textContent = String(bestStreak);
  $('spams').textContent = String(spams);
  $('over').hidden = false;
}
$('start').addEventListener('click', start);
$('again').addEventListener('click', start);
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && mode !== 'play') start();
});

// --- eating
const head = new THREE.Vector3();
const projected = new THREE.Vector3();
function pop(at: THREE.Vector3, text: string, cls: string) {
  projected.copy(at).project(camera);
  if (projected.z > 1) return;
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  el.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
  el.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight}px`;
  pops.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function eat(em: Email, now: number) {
  em.alive = false;
  em.gone = 0;
  if (em.kind === 'spam') {
    score = Math.max(0, score + POINTS.spam);
    combo = 0;
    spams++;
    flight.stun = 0.7;
    flight.speed *= 0.6;
    shake = 0.6;
    sound.spam();
    pop(em.pos, `${POINTS.spam}`, 'is-spam');
  } else {
    combo = now - lastEat < 2.2 ? combo + 1 : 1;
    lastEat = now;
    bestStreak = Math.max(bestStreak, combo);
    const mult = 1 + Math.floor(combo / 5);
    const pts = POINTS[em.kind] * mult;
    score += pts;
    if (em.kind === 'reply') {
      replies++;
      sound.reply();
    } else sound.chirp(combo);
    pop(em.pos, `+${pts}`, em.kind === 'reply' ? 'is-reply' : '');
  }
  scoreEl.textContent = String(score);
}

// --- frame-time watch for the quality tiers
const perf = {
  acc: 0,
  frames: 0,
  wait: 2,
  reset() {
    this.acc = this.frames = 0;
    this.wait = 2;
  },
  sample(dt: number) {
    if (params.has('quality') || tier >= TIERS.length - 1) return;
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    this.acc += dt;
    this.frames++;
    if (this.acc > 2.5) {
      const ms = (this.acc / this.frames) * 1000;
      if (ms > 24) {
        tier++;
        resize();
      }
      this.reset();
    }
  },
};

// --- the loop
const clock = new THREE.Clock();
let t = 0;
let lastTick = 0;
const camPos = new THREE.Vector3(0, 74, -10);
const look = new THREE.Vector3();
const back = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  U.uTime.value = t;
  perf.sample(dt);

  // steering: you in play, an autopilot on the title and results screens
  let ix: number, iy: number, boost: boolean;
  if (mode === 'play') {
    readInput();
    ({ x: ix, y: iy, boost } = input);
  } else {
    ix = Math.sin(t * 0.23) * 0.38 + Math.sin(t * 0.61) * 0.12;
    iy = THREE.MathUtils.clamp((78 - flight.pos.y) / 20, -0.5, 0.5);
    boost = Math.sin(t * 0.4) > 0.75;
  }
  flight.step(dt, ix, iy, boost);

  // the bird's body language
  bird.root.position.copy(flight.pos);
  bird.root.quaternion.copy(flight.quat);
  const glideBurst = (t % 2.6) < 0.75 ? 0.55 : 0;
  const flapTarget = flight.flapping ? 1 : Math.max(glideBurst, iy > 0.35 ? 0.75 : 0);
  bird.flap = THREE.MathUtils.damp(bird.flap, flapTarget, 7, dt);
  bird.sweep = THREE.MathUtils.damp(bird.sweep, THREE.MathUtils.clamp((flight.speed - 24) / 14 + Math.max(0, -flight.pitch - 0.25) * 1.5, 0, 1), 4, dt);
  bird.spread = THREE.MathUtils.damp(bird.spread, Math.min(1, Math.abs(ix) * 0.8 + Math.max(0, iy) * 0.6), 6, dt);
  bird.update(dt, iy);

  // emails: keep the sky stocked ahead, let the ones far behind go
  if (emails.alive.length < 46) emails.spawnTrail(flight.pos, flight.yaw, rand, mode === 'play' ? 0.25 + (1 - left / ROUND) * 0.3 : 0.2);
  for (const em of emails.list) if (em.alive && em.pos.distanceTo(flight.pos) > 400) (em.alive = false), (em.gone = 1);
  head.copy(flight.forward).multiplyScalar(1.2).add(flight.pos);
  if (mode === 'play')
    for (const em of emails.list) if (em.alive && em.pos.distanceTo(head) < (em.kind === 'spam' ? 2.6 : 3.6)) eat(em, t);
  emails.update(dt, t, head);

  // camera: behind and a little above in play, a slow orbit on the title screen
  if (mode === 'play') {
    back.set(-Math.sin(flight.yaw), 0, -Math.cos(flight.yaw)).multiplyScalar(6.6);
    const want = back.add(flight.pos).setY(flight.pos.y + 2.3 - flight.pitch * 3);
    camPos.lerp(want, 1 - Math.exp(-dt * 5));
  } else {
    // circle the bird slowly, from the side and a little below, the way the hero video sees it
    const a = flight.yaw + Math.PI * 0.5 + Math.sin(t * 0.09) * 1.2;
    camPos.set(Math.sin(a) * 7.5, -1.2 + Math.sin(t * 0.21) * 1.4, Math.cos(a) * 7.5).add(flight.pos);
  }
  camera.position.copy(camPos);
  if (shake > 0) {
    shake -= dt;
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
  look.copy(flight.forward).multiplyScalar(mode === 'play' ? 7 : 0).add(flight.pos);
  // on the title card the bird sits in the upper half, clear of the card
  look.y += mode === 'play' ? 0.8 : -2.4;
  camera.lookAt(look);
  if (mode === 'play') camera.rotateZ(-flight.roll * 0.12);
  const fov = (innerWidth / innerHeight < 0.8 ? 74 : 62) + (mode === 'play' ? Math.max(0, flight.speed - 18) * 0.45 : 0);
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = THREE.MathUtils.damp(camera.fov, fov, 3, dt);
    camera.updateProjectionMatrix();
  }
  U.uCam.value.copy(camera.position);
  sky.position.copy(camera.position);
  ground.position.set(camera.position.x, 0, camera.position.z);
  sound.setWind(mode === 'play' ? flight.speed : 12);

  // the round
  if (mode === 'play') {
    left -= dt;
    const shown = Math.max(0, Math.ceil(left));
    timeEl.textContent = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, '0')}`;
    timeEl.classList.toggle('is-low', left < 10);
    if (left < 5.5 && Math.ceil(left) !== lastTick) {
      lastTick = Math.ceil(left);
      sound.tick();
    }
    if (t - lastEat > 2.2 && combo > 0) combo = 0;
    comboEl.textContent = combo >= 5 ? `×${1 + Math.floor(combo / 5)} streak · ${combo}` : combo >= 2 ? `${combo} in a row` : '';
    breathEl.style.transform = `scaleX(${flight.breath})`;
    const s = stick();
    stickEl.hidden = !s;
    if (s) {
      stickEl.style.left = `${s.ox}px`;
      stickEl.style.top = `${s.oy}px`;
      (stickEl.firstElementChild as HTMLElement).style.transform = `translate(${s.x * 37}px, ${s.y * 37}px)`;
    }
    if (left <= 0) finish();
  }

  post.render(renderer, scene, camera, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

Object.assign(window, { sellbird: { flight, emails, bird, camera, start, get mode() { return mode; } } });
