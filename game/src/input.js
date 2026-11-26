// Keyboard and mouse (and touch drag): one place that turns every device
// into the same stick — { pitch, roll, throttle, yaw } plus single-press keys.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.drag = null; // { x, y } pointer offset from the drag start, pixels
    this.mouse = { x: 0, y: 0, down: false };
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.key.toLowerCase());
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    canvas.addEventListener('pointerdown', (e) => {
      this.mouse.down = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.drag = { x: 0, y: 0, startX: e.clientX, startY: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.drag) {
        this.drag.x = e.clientX - this.drag.startX;
        this.drag.y = e.clientY - this.drag.startY;
      }
    });
    const end = () => {
      this.mouse.down = false;
      this.drag = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.drag = null;
      this.mouse.down = false;
    });
  }

  /** Consume one press of a key (lowercase), true once until pressed again. */
  take(key) {
    if (this.pressed.has(key)) {
      this.pressed.delete(key);
      return true;
    }
    return false;
  }

  /** The stick this frame: keys, or a mouse/touch drag when one is held. */
  stick() {
    let pitch = 0;
    let roll = 0;
    let throttle = 0;
    let yaw = 0;
    if (this.keys.has('arrowup')) pitch += 1;
    if (this.keys.has('arrowdown')) pitch -= 1;
    if (this.keys.has('arrowleft')) roll -= 1;
    if (this.keys.has('arrowright')) roll += 1;
    if (this.keys.has('w')) throttle += 1;
    if (this.keys.has('s')) throttle -= 1;
    if (this.keys.has('q')) yaw -= 1;
    if (this.keys.has('e')) yaw += 1;
    if (this.keys.has('shift')) throttle += 1;
    if (this.keys.has('control')) throttle -= 1;
    if (this.drag) {
      // Drag up = nose up, drag right = bank right.
      const dead = 12;
      const dx = this.drag.x;
      const dy = this.drag.y;
      if (Math.abs(dx) > dead) roll += Math.max(-1, Math.min(1, dx / 160));
      if (Math.abs(dy) > dead) pitch += Math.max(-1, Math.min(1, -dy / 160));
    }
    return { pitch, roll, throttle, yaw };
  }

  /** Where the pointer is, in canvas pixels. */
  pointer(canvas) {
    const r = canvas.getBoundingClientRect();
    return { x: this.mouse.x - r.left, y: this.mouse.y - r.top };
  }

  /** True once when the pointer was just pressed down. */
  takeClick() {
    if (this.mouse.down && !this._clickTaken) {
      this._clickTaken = true;
      return true;
    }
    if (!this.mouse.down) this._clickTaken = false;
    return false;
  }
}
