/**
 * The sky: a painted dome (deep blue overhead, pale at the horizon, a warm glow round the sun and a
 * line of cream cumulus along the horizon), plus big 3D clouds you can fly through.
 */
import * as THREE from 'three';
import { LIGHT, NOISE, U, WRAP, rng } from './shared';

export function makeSkyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uZenith: { value: new THREE.Color('#2c86d0') },
      uMid: { value: new THREE.Color('#6fb2e6') },
      uHorizon: { value: new THREE.Color('#d9e7f1') },
      uCloud: { value: new THREE.Color('#fff1dc') },
      uCloudShade: { value: new THREE.Color('#b9c8de') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSun;
      uniform vec3 uZenith, uMid, uHorizon, uCloud, uCloudShade;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, h));
        col = mix(col, uZenith, smoothstep(0.18, 0.85, h));
        float s = max(dot(d, uSun), 0.0);
        col = mix(col, vec3(1.0, 0.93, 0.82), pow(s, 5.0) * 0.45 * (1.0 - smoothstep(0.0, 0.6, h)));
        col += vec3(1.0, 0.92, 0.78) * (pow(s, 60.0) * 0.35 + smoothstep(0.9996, 0.9998, s) * 0.7);

        // the cumulus line along the horizon, flat-bottomed with billowing tops
        float az = atan(d.x, d.z);
        float drift = uTime * 0.004;
        float top = 0.035 + 0.16 * pow(fbm(vec2(az * 2.2 + drift, 3.1)), 1.6) * 1.6;
        float edge = fbm(vec2(az * 14.0 + drift * 4.0, h * 22.0)) * 0.035;
        float inside = smoothstep(top + edge, top + edge - 0.012, h) * smoothstep(-0.01, 0.02, h);
        float billow = fbm(vec2(az * 9.0 + drift * 3.0, h * 30.0 - 4.0));
        float lit = smoothstep(0.25, 0.85, (h / max(top, 0.01)) * 0.7 + billow * 0.6 + pow(s, 2.0) * 0.3);
        vec3 cloud = mix(uCloudShade, uCloud, lit);
        col = mix(col, cloud, inside * 0.96);

        // high wisps
        float wisp = fbm(vec2(az * 3.0 - drift, h * 6.0)) * smoothstep(0.25, 0.6, h) * smoothstep(0.95, 0.6, h);
        col = mix(col, vec3(0.97, 0.97, 1.0), smoothstep(0.45, 0.75, wisp) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

export const CLOUD_TILE = 2600;

/** Clusters of lumpy, two-tone puffs: cream on top, blue-grey bellies. They fade as you fly into them. */
export function makeClouds(): THREE.InstancedMesh {
  const r = rng(7);
  const puffs: { center: THREE.Vector3; m: THREE.Matrix4 }[] = [];
  const clouds = 46;
  for (let c = 0; c < clouds; c++) {
    const center = new THREE.Vector3((r() - 0.5) * CLOUD_TILE, 80 + r() * 90, (r() - 0.5) * CLOUD_TILE);
    const big = 0.6 + r() * 0.9;
    const n = 7 + Math.floor(r() * 9);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const rad = r() * 34 * big;
      const s = (12 + r() * 16) * big * (1 - rad / (60 * big));
      const y = s * 0.35 + r() * 10 * big - (rad / (34 * big)) * 6;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad * 0.7),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)),
        new THREE.Vector3(s * 1.15, s * 0.82, s),
      );
      puffs.push({ center, m });
    }
  }
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const centers = new Float32Array(puffs.length * 3);
  puffs.forEach((p, i) => p.center.toArray(centers, i * 3));
  geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uTile: { value: CLOUD_TILE } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uTile;
      uniform vec3 uCam;
      attribute vec3 aCenter;
      varying vec3 vN;
      varying vec3 vW;
      varying float vBase;
      ${NOISE}
      ${WRAP}
      void main() {
        vec3 c = wrapAround(aCenter, uTile);
        float lump = vnoise3(position * 2.2 + aCenter * 0.01 + uTime * 0.02) * 0.22 + vnoise3(position * 5.0) * 0.06;
        vec4 local = instanceMatrix * vec4(position * (1.0 + lump), 1.0);
        vW = c + local.xyz;
        vW.y = max(vW.y, c.y - 6.0); // flat bellies
        vBase = c.y;
        vN = normalize(mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vW;
      varying float vBase;
      ${LIGHT}
      ${NOISE}
      void main() {
        float d = length(vW - uCam);
        // fly-through: dissolve with a dither as the camera gets close
        float keep = smoothstep(14.0, 46.0, d);
        if (hash12(floor(gl_FragCoord.xy)) > keep) discard;
        vec3 n = normalize(vN);
        float l = dot(n, uSun) * 0.5 + 0.5;
        l += (vnoise3(vW * 0.08) - 0.5) * 0.25;
        vec3 lit = vec3(1.0, 0.95, 0.86);
        vec3 shade = vec3(0.71, 0.78, 0.89);
        vec3 c = mix(shade, lit, smoothstep(0.38, 0.62, l));
        c = mix(c, vec3(0.64, 0.71, 0.84), smoothstep(10.0, -4.0, vW.y - vBase) * 0.6);
        // rim of light round the edge facing the sun
        float rim = pow(1.0 - abs(dot(n, normalize(uCam - vW))), 3.0);
        c += vec3(1.0, 0.9, 0.75) * rim * 0.18 * smoothstep(0.4, 0.9, l);
        gl_FragColor = vec4(fogIt(c, vW), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, puffs.length);
  puffs.forEach((p, i) => mesh.setMatrixAt(i, p.m));
  mesh.frustumCulled = false;
  return mesh;
}
