/**
 * Full-screen blast effect for inthebeginning bounce.
 *
 * Significantly reduced brightness — gentle explode and fade.
 * Extra Flashy mode slightly brighter but still not aggressive.
 */

class BlastEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.active = false;
    this.timer = 0;
    this.duration = 0.5;
    this.x = 0;
    this.y = 0;
    this.color = '#fff';
    this.pixelSize = 8;
    this.particles = [];
    /** @type {number} 0-1 brightness multiplier from access mode. */
    this.brightness = 0.25;
  }

  /**
   * Set brightness from accessibility mode.
   * @param {number} b - 0 = off, 0.25 = normal, 0.45 = flashy
   */
  setBrightness(b) { this.brightness = b; }

  trigger(x, y, color) {
    if (this.brightness <= 0) return; // Minimal mode: no blast
    this.active = true;
    this.timer = 0;
    this.x = x;
    this.y = y;
    this.color = color || '#888';

    this.particles = [];
    const count = 25;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 400 + Math.random() * 600;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 6,
        alpha: this.brightness,
      });
    }
  }

  update(dt) {
    if (!this.active) return false;
    this.timer += dt;
    if (this.timer >= this.duration) {
      this.active = false;
      this.particles = [];
      return false;
    }

    const progress = this.timer / this.duration;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97; // Gentle deceleration
      p.vy *= 0.97;
      p.alpha = this.brightness * (1 - progress) * (1 - progress); // Quadratic fade
      p.size *= (1 - dt * 0.3); // Gentle shrink
    }
    return true;
  }

  render() {
    if (!this.active || this.brightness <= 0) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // No bright white flash — just particles
    for (const p of this.particles) {
      if (p.alpha <= 0.01) continue;
      ctx.globalAlpha = Math.min(p.alpha, 0.4); // Cap alpha
      ctx.fillStyle = this.color;
      const px = Math.round(p.x / this.pixelSize) * this.pixelSize;
      const py = Math.round(p.y / this.pixelSize) * this.pixelSize;
      ctx.fillRect(px, py, Math.max(1, p.size), Math.max(1, p.size));
    }
    ctx.globalAlpha = 1;
  }

  /** Clear the blast canvas (used when switching modes). */
  clear() {
    this.active = false;
    this.particles = [];
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BlastEffect };
}
