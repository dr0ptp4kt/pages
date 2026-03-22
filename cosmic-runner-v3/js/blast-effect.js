/**
 * Full-screen blast effect for Cosmic Runner V3.
 *
 * When the runner hits an obstacle, a pixelated blast zooms in
 * to fill the viewport briefly, then fades back to normal gameplay.
 * Designed to be visually impactful but not seizure-inducing.
 */

class BlastEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.active = false;
    this.timer = 0;
    this.duration = 0.4; // Total effect duration
    this.x = 0;
    this.y = 0;
    this.color = '#fff';
    this.pixelSize = 8;
    this.particles = [];
  }

  /**
   * Trigger a blast effect at the given position.
   * @param {number} x - Blast center X.
   * @param {number} y - Blast center Y.
   * @param {string} color - Base color.
   */
  trigger(x, y, color) {
    this.active = true;
    this.timer = 0;
    this.x = x;
    this.y = y;
    this.color = color || '#fff';

    // Generate pixelated blast particles
    this.particles = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 800 + Math.random() * 1200;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 12,
        alpha: 1,
      });
    }
  }

  /**
   * Update the blast animation.
   * @param {number} dt
   * @returns {boolean} Whether the effect is still active.
   */
  update(dt) {
    if (!this.active) return false;

    this.timer += dt;
    if (this.timer >= this.duration) {
      this.active = false;
      return false;
    }

    const progress = this.timer / this.duration;

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = 1 - progress;
      // Grow particles to fill screen
      p.size += dt * 60;
    }

    return true;
  }

  /**
   * Render the blast effect.
   */
  render() {
    if (!this.active) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const progress = this.timer / this.duration;

    // Phase 1 (0-0.15): Quick zoom-in with bright flash
    if (progress < 0.15) {
      const flashAlpha = (1 - progress / 0.15) * 0.6;
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Phase 2: Pixelated blast expanding outward
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha * 0.8;
      ctx.fillStyle = this.color;
      // Pixelated: snap to grid
      const px = Math.round(p.x / this.pixelSize) * this.pixelSize;
      const py = Math.round(p.y / this.pixelSize) * this.pixelSize;
      ctx.fillRect(px, py, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Phase 3 (0.25-1.0): Fade out with vignette
    if (progress > 0.25) {
      const fadeAlpha = (progress - 0.25) / 0.75;
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
      grad.addColorStop(0, `rgba(0, 0, 0, 0)`);
      grad.addColorStop(1, `rgba(0, 0, 0, ${fadeAlpha * 0.5})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BlastEffect };
}
