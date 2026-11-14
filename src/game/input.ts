/**
 * Steering. A mouse steers toward the cursor (above the middle climbs, to the side turns) and a
 * held button flaps; keys are W A S D or the arrows with Space or Shift to flap; on a phone, drag
 * anywhere to steer and hold the Flap button.
 */
export const input = { x: 0, y: 0, boost: false, using: 'none' as 'none' | 'mouse' | 'keys' | 'touch' };

const keys = new Set<string>();
let mouse = { x: 0, y: 0, down: false };
let touch = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
let flapHeld = false;

const dead = (v: number, d = 0.06) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export function bindInput(target: HTMLElement, flapButton: HTMLElement) {
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (/^(Key[WASD]|Arrow)/.test(e.code)) input.using = 'keys';
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
    flapHeld = false;
  });
  target.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX - innerWidth / 2) / (innerWidth * 0.36);
    mouse.y = (e.clientY - innerHeight / 2) / (innerHeight * 0.36);
    input.using = 'mouse';
  });
  target.addEventListener('mousedown', (e) => e.button === 0 && (mouse.down = true));
  addEventListener('mouseup', () => (mouse.down = false));
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  target.addEventListener(
    'touchstart',
    (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (touch.id === -1) {
          touch = { x: 0, y: 0, id: t.identifier, ox: t.clientX, oy: t.clientY };
          input.using = 'touch';
        } else flapHeld = true; // a second finger flaps too
      }
      e.preventDefault();
    },
    { passive: false },
  );
  target.addEventListener(
    'touchmove',
    (e) => {
      for (const t of Array.from(e.changedTouches))
        if (t.identifier === touch.id) {
          const r = Math.min(innerWidth, innerHeight) * 0.22;
          touch.x = (t.clientX - touch.ox) / r;
          touch.y = (t.clientY - touch.oy) / r;
        }
      e.preventDefault();
    },
    { passive: false },
  );
  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches))
      if (t.identifier === touch.id) touch = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
      else flapHeld = false;
  };
  target.addEventListener('touchend', end);
  target.addEventListener('touchcancel', end);

  const flapOn = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    flapHeld = true;
  };
  const flapOff = () => (flapHeld = false);
  flapButton.addEventListener('pointerdown', flapOn);
  flapButton.addEventListener('pointerup', flapOff);
  flapButton.addEventListener('pointercancel', flapOff);
  flapButton.addEventListener('pointerleave', flapOff);
  flapButton.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

/** Where the touch stick's knob is, for drawing it. */
export function stick() {
  return touch.id === -1 ? null : { ox: touch.ox, oy: touch.oy, x: clamp(touch.x), y: clamp(touch.y) };
}

export function readInput() {
  const k = (...codes: string[]) => codes.some((c) => keys.has(c));
  const kx = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
  const ky = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0);
  if (input.using === 'keys') {
    input.x = kx;
    input.y = ky;
  } else if (input.using === 'mouse') {
    input.x = clamp(dead(mouse.x));
    input.y = clamp(dead(-mouse.y));
  } else if (input.using === 'touch') {
    input.x = clamp(dead(touch.x, 0.08));
    input.y = clamp(dead(-touch.y, 0.08));
  }
  input.boost = k('Space', 'ShiftLeft', 'ShiftRight') || mouse.down || flapHeld;
}
