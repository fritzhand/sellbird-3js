/**
 * How the swallow flies. It always moves forward; you steer the turn and the climb. Turning banks
 * the bird, diving trades height for speed, climbing bleeds it off, and flapping (while you have
 * the breath for it) speeds you up. Too low and it pulls up on its own over the rooftops.
 */
import * as THREE from 'three';

export const FLOOR = 40;
export const CEILING = 150;

export class Flight {
  pos = new THREE.Vector3(0, 70, 0);
  yaw = 0;
  pitch = 0;
  roll = 0;
  speed = 18;
  breath = 1;
  flapping = false;
  /** seconds of wobble left after hitting spam */
  stun = 0;
  private yawRate = 0;
  quat = new THREE.Quaternion();
  forward = new THREE.Vector3(0, 0, 1);

  reset() {
    this.pos.set(0, 70, 0);
    this.yaw = this.pitch = this.roll = this.yawRate = 0;
    this.speed = 18;
    this.breath = 1;
    this.stun = 0;
  }

  step(dt: number, ix: number, iy: number, boost: boolean) {
    if (this.stun > 0) {
      this.stun -= dt;
      ix += Math.sin(this.stun * 30) * 0.8;
    }
    // steering
    this.yawRate = THREE.MathUtils.damp(this.yawRate, -ix * 1.35, 4, dt);
    this.yaw += this.yawRate * dt;
    let targetPitch = iy * 0.65;
    if (this.pos.y < FLOOR + 10) targetPitch = Math.max(targetPitch, ((FLOOR + 10 - this.pos.y) / 10) * 0.5);
    if (this.pos.y > CEILING - 10) targetPitch = Math.min(targetPitch, -((this.pos.y - CEILING + 10) / 10) * 0.4);
    this.pitch = THREE.MathUtils.damp(this.pitch, targetPitch, 3, dt);
    this.roll = THREE.MathUtils.damp(this.roll, ix * 1.05 + this.yawRate * -0.15, 5, dt);

    // speed: flap for more, dive for more, climb for less
    this.flapping = boost && this.breath > 0.02;
    if (this.flapping) this.breath = Math.max(0, this.breath - dt * 0.28);
    else this.breath = Math.min(1, this.breath + dt * (boost ? 0.06 : 0.16));
    const cruise = this.flapping ? 30 : 18;
    this.speed += -Math.sin(this.pitch) * 14 * dt;
    this.speed = THREE.MathUtils.damp(this.speed, cruise, this.flapping ? 1.4 : 0.5, dt);
    this.speed = THREE.MathUtils.clamp(this.speed, 10, 44);

    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.pos.addScaledVector(this.forward, this.speed * dt);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, FLOOR - 4, CEILING + 4);
    this.quat.setFromEuler(new THREE.Euler(-this.pitch, this.yaw, this.roll, 'YXZ'));
  }
}
