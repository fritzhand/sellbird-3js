/**
 * All the sound is synthesized: wind that rises with speed, soft wingbeats, a swallow's twitter for
 * every email (higher with each one in a row), a chime for a reply, a buzz for spam, and a slow
 * pentatonic music box underneath. Nothing to download.
 */
let ctx: AudioContext | null = null;
let master: GainNode;
let sfx: GainNode;
let music: GainNode;
let wind: GainNode;
let windFilter: BiquadFilterNode;
let muted = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;

try {
  muted = localStorage.getItem('sb-muted') === '1';
} catch {
  /* private mode */
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.03 * 8;
    d[i] = last;
  }
  return b;
}

export function unlock() {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.gain.value = 0.8;
  sfx.connect(master);
  music = ctx.createGain();
  music.gain.value = 0.22;
  // a little echo for the music box
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.38;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  music.connect(master);
  music.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(master);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 4);
  src.loop = true;
  windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 500;
  windFilter.Q.value = 0.7;
  wind = ctx.createGain();
  wind.gain.value = 0;
  src.connect(windFilter).connect(wind).connect(master);
  src.start();
  startMusic();
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('sb-muted', m ? '1' : '0');
  } catch {
    /* private mode */
  }
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

export function setWind(speed: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const k = Math.min(1, Math.max(0, (speed - 10) / 32));
  wind.gain.setTargetAtTime(0.05 + k * 0.22, t, 0.2);
  windFilter.frequency.setTargetAtTime(350 + k * 900, t, 0.2);
}

function tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number, to?: number, out: AudioNode = sfx) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export function wingbeat() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.12);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  src.connect(f).connect(g).connect(sfx);
  src.start(t);
}

/** A swallow's twitter: two quick chirps, pitched up with the combo. */
export function chirp(combo: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const up = Math.pow(2, Math.min(combo, 12) / 12);
  tone(2300 * up, t, 0.07, 'sine', 0.22, 3400 * up);
  tone(2900 * up, t + 0.075, 0.08, 'sine', 0.18, 2100 * up);
}

export function reply() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.07, 0.35, 'triangle', 0.16));
}

export function spam() {
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(140, t, 0.35, 'sawtooth', 0.18, 70);
  tone(147, t, 0.35, 'square', 0.08, 72);
}

export function startChime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.6, 'sine', 0.16));
}

export function endChime() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [784, 659, 523, 392].forEach((f, i) => tone(f, t + i * 0.16, 0.9, 'sine', 0.15));
}

export function tick() {
  if (!ctx) return;
  tone(1320, ctx.currentTime, 0.06, 'square', 0.05);
}

function startMusic() {
  if (musicTimer || !ctx) return;
  // D major pentatonic, wandering slowly
  const scale = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880];
  let i = 4;
  let beat = 0;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    beat++;
    const t = ctx.currentTime + 0.02;
    if (Math.random() < 0.72) {
      i = Math.max(0, Math.min(scale.length - 1, i + Math.floor(Math.random() * 5) - 2));
      tone(scale[i], t, 1.4, 'sine', 0.14, undefined, music);
      tone(scale[i] * 2, t, 0.5, 'sine', 0.03, undefined, music);
    }
    if (beat % 8 === 0) {
      tone(scale[0] / 2, t, 3.2, 'triangle', 0.09, undefined, music);
      tone(scale[2] / 2, t, 3.2, 'sine', 0.05, undefined, music);
    }
  }, 420);
}
