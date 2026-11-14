/**
 * The painterly pass. The scene is drawn into a texture, then a Kuwahara filter flattens it into
 * brush-like patches of color while keeping the edges, a slow noise wobbles the strokes, and a
 * paper grain and soft vignette finish it. Turned down or off on slow devices.
 */
import * as THREE from 'three';

export class Painterly {
  target: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  enabled = true;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: this.target.texture }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 3 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform vec2 uTexel;
        uniform float uRadius;
        uniform float uTime;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          // strokes wobble a little, like a hand-laid edge
          vec2 uv = vUv + (vec2(n2(vUv * 60.0), n2(vUv * 60.0 + 9.0)) - 0.5) * uTexel * 2.2;
          vec3 m[4]; vec3 s[4];
          for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
          const int R = 3;
          for (int j = -R; j <= R; j++) {
            for (int i = -R; i <= R; i++) {
              if (abs(float(i)) > uRadius || abs(float(j)) > uRadius) continue;
              vec3 c = texture2D(tScene, uv + vec2(float(i), float(j)) * uTexel).rgb;
              vec3 cc = c * c;
              if (i <= 0 && j <= 0) { m[0] += c; s[0] += cc; }
              if (i >= 0 && j <= 0) { m[1] += c; s[1] += cc; }
              if (i <= 0 && j >= 0) { m[2] += c; s[2] += cc; }
              if (i >= 0 && j >= 0) { m[3] += c; s[3] += cc; }
            }
          }
          float count = (uRadius + 1.0) * (uRadius + 1.0);
          float best = 1e9;
          vec3 col = vec3(0.0);
          for (int k = 0; k < 4; k++) {
            vec3 mean = m[k] / count;
            vec3 v = abs(s[k] / count - mean * mean);
            float sig = v.r + v.g + v.b;
            if (sig < best) { best = sig; col = mean; }
          }
          // a touch of warmth and lift, like gouache on toned paper
          col = mix(col, col * vec3(1.03, 1.0, 0.95), 0.6);
          col = pow(col, vec3(0.97));
          float grain = (h(floor(vUv / uTexel / 2.0) + floor(uTime * 8.0)) - 0.5) * 0.025 + (n2(vUv / uTexel / 3.0) - 0.5) * 0.03;
          col += grain;
          float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.6);
          col *= mix(0.86, 1.0, vig);
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(w: number, h: number, radius: number) {
    this.target.setSize(w, h);
    this.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.mat.uniforms.uRadius.value = radius;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, t: number) {
    if (!this.enabled) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    this.mat.uniforms.uTime.value = t;
    renderer.render(this.scene, this.cam);
  }
}
