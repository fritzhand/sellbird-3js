/**
 * What every painted surface shares: the sun, the haze, the clock, the camera, and the GLSL for
 * noise, fog and the soft two-tone light that gives the scene its gouache look.
 */
import * as THREE from 'three';

export const SUN = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();

export const U = {
  uTime: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uSun: { value: SUN },
  uSunColor: { value: new THREE.Color('#fff0d6') },
  uShade: { value: new THREE.Color('#c4cde2') },
  uFogColor: { value: new THREE.Color('#d9e7f1') },
  uFogDensity: { value: 1 / 820 },
};

export const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

export const LIGHT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uShade;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCam;
// a painter's light: a lit side and a cool shadow side, with a soft, slightly banded turn between them
vec3 paint(vec3 base, vec3 n, float soft) {
  float l = dot(n, uSun) * 0.5 + 0.5;
  float band = smoothstep(0.42 - soft, 0.58 + soft, l);
  band = mix(band, floor(l * 4.0 + 0.5) / 4.0, 0.18);
  vec3 lit = base * uSunColor * 1.08;
  vec3 shadow = base * uShade * 0.9;
  vec3 c = mix(shadow, lit, band);
  // sky bounce from above, warm bounce from below
  c += base * vec3(0.10, 0.13, 0.18) * max(n.y, 0.0);
  c += base * vec3(0.08, 0.05, 0.02) * max(-n.y, 0.0);
  return c;
}
vec3 fogIt(vec3 c, vec3 wp) {
  float d = length(wp - uCam);
  float f = 1.0 - exp(-pow(d * uFogDensity, 1.5));
  // the haze is warmer toward the sun
  vec3 dir = normalize(wp - uCam);
  vec3 fc = mix(uFogColor, vec3(0.98, 0.9, 0.8), pow(max(dot(dir, uSun), 0.0), 4.0) * 0.45);
  return mix(c, fc, clamp(f, 0.0, 1.0));
}
`;

/** Wraps an instance's home position into the tile around the camera, so the world never ends. */
export const WRAP = /* glsl */ `
vec3 wrapAround(vec3 c, float tile) {
  vec2 rel = c.xz - uCam.xz;
  rel = mod(rel + tile * 0.5, tile) - tile * 0.5;
  return vec3(uCam.x + rel.x, c.y, uCam.z + rel.y);
}
`;

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
