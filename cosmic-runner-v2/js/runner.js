/**
 * Aki — the cosmic runner character.
 *
 * A pixel-art cosmic entity that runs, jumps, and blasts through obstacles.
 * Morphs shape and color at musical epoch transitions.
 */

/** Epoch-based character forms. Each has a distinct pixel pattern and color. */
const AKI_FORMS = [
  { name: 'Nebula Spark',  color: '#4af',  accent: '#8cf',  shape: 'spark' },
  { name: 'Star Fragment', color: '#fa4',  accent: '#fc8',  shape: 'crystal' },
  { name: 'Quantum Pulse', color: '#a4f',  accent: '#c8f',  shape: 'pulse' },
  { name: 'DNA Strand',    color: '#4fa',  accent: '#8fc',  shape: 'helix' },
  { name: 'Dark Matter',   color: '#f4a',  accent: '#f8c',  shape: 'void' },
  { name: 'Photon Burst',  color: '#ff4',  accent: '#ff8',  shape: 'burst' },
];

/**
 * Runner is the player character.
 */
class Runner {
  /**
   * @param {number} groundY - Y position of the ground line.
   */
  constructor(groundY) {
    /** @type {number} */
    this.x = 80;

    /** @type {number} */
    this.y = groundY;

    /** @type {number} Character width */
    this.w = 28;

    /** @type {number} Character height */
    this.h = 32;

    /** @type {number} Y velocity */
    this.vy = 0;

    /** @type {number} Gravity */
    this.gravity = 1800;

    /** @type {number} Jump velocity */
    this.jumpPower = -620;

    /** @type {boolean} Whether on ground */
    this.grounded = true;

    /** @type {number} Ground Y position */
    this.groundY = groundY;

    /** @type {number} Current form index */
    this.formIndex = 0;

    /** @type {number} Animation frame counter */
    this.animFrame = 0;

    /** @type {number} Run animation timer */
    this.runTimer = 0;

    /** @type {number} Morph transition progress (0-1) */
    this.morphProgress = 1;

    /** @type {number} Previous form index (for morph transition) */
    this.prevFormIndex = 0;

    /** @type {boolean} Whether the character is invulnerable (blast effect) */
    this.blasting = false;

    /** @type {number} Blast timer */
    this.blastTimer = 0;

    /** @type {number} Trail effect counter */
    this.trailTimer = 0;

    /** @type {Array<{x: number, y: number, alpha: number, hue: number}>} Trail particles */
    this.trail = [];

    /** @type {number} Squash/stretch for landing effect */
    this.squash = 1;
  }

  /**
   * Trigger a jump if the character is on the ground.
   */
  jump() {
    if (this.grounded) {
      this.vy = this.jumpPower;
      this.grounded = false;
      this.squash = 1.3; // Stretch on jump
    }
  }

  /**
   * Morph to a new character form.
   * @param {number} formIndex - Index into AKI_FORMS.
   */
  morph(formIndex) {
    if (formIndex === this.formIndex) return;
    this.prevFormIndex = this.formIndex;
    this.formIndex = formIndex % AKI_FORMS.length;
    this.morphProgress = 0;
  }

  /**
   * Trigger blast-through effect (when hitting an obstacle).
   */
  blast() {
    this.blasting = true;
    this.blastTimer = 0.3;

    // Spawn blast particles
    const form = AKI_FORMS[this.formIndex];
    for (let i = 0; i < 8; i++) {
      this.trail.push({
        x: this.x + this.w / 2 + (Math.random() - 0.5) * 20,
        y: this.y - this.h / 2 + (Math.random() - 0.5) * 20,
        alpha: 1,
        hue: this._parseHue(form.color)
      });
    }
  }

  /**
   * Update character physics and animation.
   * @param {number} dt - Delta time in seconds.
   */
  update(dt) {
    // Gravity
    if (!this.grounded) {
      this.vy += this.gravity * dt;
      this.y += this.vy * dt;

      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.grounded = true;
        this.squash = 0.7; // Squash on land
      }
    }

    // Squash/stretch recovery
    this.squash += (1 - this.squash) * 8 * dt;

    // Run animation
    this.runTimer += dt;
    this.animFrame = Math.floor(this.runTimer * 8) % 4;

    // Morph transition
    if (this.morphProgress < 1) {
      this.morphProgress = Math.min(1, this.morphProgress + dt * 3);
    }

    // Blast timer
    if (this.blasting) {
      this.blastTimer -= dt;
      if (this.blastTimer <= 0) {
        this.blasting = false;
      }
    }

    // Trail particles
    this.trailTimer += dt;
    if (this.trailTimer > 0.05) {
      this.trailTimer = 0;
      const form = AKI_FORMS[this.formIndex];
      this.trail.push({
        x: this.x + 4 + Math.random() * 6,
        y: this.y - this.h / 2 + (Math.random() - 0.5) * this.h * 0.6,
        alpha: 0.6,
        hue: this._parseHue(form.color)
      });
    }

    // Update trail
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].alpha -= dt * 3;
      this.trail[i].x -= dt * 40;
      if (this.trail[i].alpha <= 0) {
        this.trail.splice(i, 1);
      }
    }
  }

  /**
   * Set the ground Y position (for resizing).
   * @param {number} groundY
   */
  setGroundY(groundY) {
    if (this.grounded) {
      this.y = groundY;
    }
    this.groundY = groundY;
  }

  /**
   * Get the bounding box for collision detection.
   * @returns {{x: number, y: number, w: number, h: number}}
   */
  getBounds() {
    return {
      x: this.x + 4,
      y: this.y - this.h + 4,
      w: this.w - 8,
      h: this.h - 8
    };
  }

  /**
   * Render the character to a canvas context.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const form = AKI_FORMS[this.formIndex];
    const cx = this.x + this.w / 2;
    const cy = this.y - this.h / 2;

    // Trail
    for (const p of this.trail) {
      ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(cx, cy);

    // Squash/stretch
    const sx = 2 - this.squash;
    const sy = this.squash;
    ctx.scale(sx, sy);

    // Blast flash
    if (this.blasting) {
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 20;
    }

    // Morph interpolation
    let color = form.color;
    let accent = form.accent;
    if (this.morphProgress < 1) {
      const prevForm = AKI_FORMS[this.prevFormIndex];
      color = this._lerpColor(prevForm.color, form.color, this.morphProgress);
      accent = this._lerpColor(prevForm.accent, form.accent, this.morphProgress);
    }

    // Draw character based on shape
    this._drawShape(ctx, form.shape, color, accent);

    // Eyes (always white dots)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-5, -3, 2.5, 0, Math.PI * 2);
    ctx.arc(5, -3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-4, -3, 1.2, 0, Math.PI * 2);
    ctx.arc(6, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Run animation: legs
    if (this.grounded) {
      const legOffset = Math.sin(this.runTimer * 16) * 4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, this.h / 2 - 6);
      ctx.lineTo(-4 - legOffset, this.h / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, this.h / 2 - 6);
      ctx.lineTo(4 + legOffset, this.h / 2);
      ctx.stroke();
    }

    ctx.restore();

    // Glow aura
    ctx.save();
    ctx.globalAlpha = 0.15;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draw the character body shape.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} shape
   * @param {string} color
   * @param {string} accent
   * @private
   */
  _drawShape(ctx, shape, color, accent) {
    const hw = this.w / 2;
    const hh = this.h / 2;

    switch (shape) {
      case 'spark':
        // Rounded rectangle body
        ctx.fillStyle = color;
        this._roundRect(ctx, -hw, -hh, this.w, this.h, 6);
        ctx.fill();
        // Inner highlight
        ctx.fillStyle = accent;
        this._roundRect(ctx, -hw + 4, -hh + 4, this.w - 8, this.h - 12, 4);
        ctx.fill();
        break;

      case 'crystal':
        // Diamond shape
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -hh);
        ctx.lineTo(hw, 0);
        ctx.lineTo(0, hh);
        ctx.lineTo(-hw, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(0, -hh + 6);
        ctx.lineTo(hw - 6, 0);
        ctx.lineTo(0, hh - 6);
        ctx.lineTo(-hw + 6, 0);
        ctx.closePath();
        ctx.fill();
        break;

      case 'pulse':
        // Circle body with wave
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(hw, hh), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.1) {
          const r = Math.min(hw, hh) - 4 + Math.sin(a * 4 + this.runTimer * 8) * 3;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        break;

      case 'helix':
        // DNA-like twisted shape
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        ctx.fill();
        // Double helix lines
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        for (let dy = -hh + 4; dy < hh - 4; dy += 4) {
          const wave = Math.sin(dy * 0.3 + this.runTimer * 6) * 6;
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.arc(wave, dy, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-wave, dy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'void':
        // Irregular blob
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.3) {
          const r = Math.min(hw, hh) + Math.sin(a * 3 + this.runTimer * 4) * 4;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;

      case 'burst':
        // Star burst
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? Math.min(hw, hh) : Math.min(hw, hh) * 0.5;
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        break;

      default:
        ctx.fillStyle = color;
        ctx.fillRect(-hw, -hh, this.w, this.h);
    }
  }

  /**
   * Draw a rounded rectangle path.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r - Corner radius.
   * @private
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Parse a hex color to get approximate hue.
   * @param {string} hex
   * @returns {number} Hue in degrees.
   * @private
   */
  _parseHue(hex) {
    const r = parseInt(hex.slice(1, 2), 16) * 17;
    const g = parseInt(hex.slice(2, 3), 16) * 17;
    const b = parseInt(hex.slice(3, 4), 16) * 17;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    let h;
    if (max === r) h = (g - b) / (max - min);
    else if (max === g) h = 2 + (b - r) / (max - min);
    else h = 4 + (r - g) / (max - min);
    h = ((h * 60) + 360) % 360;
    return h;
  }

  /**
   * Linearly interpolate between two hex colors.
   * @param {string} c1
   * @param {string} c2
   * @param {number} t - 0 to 1.
   * @returns {string} Interpolated hex color.
   * @private
   */
  _lerpColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1, 2), 16) * 17;
    const g1 = parseInt(c1.slice(2, 3), 16) * 17;
    const b1 = parseInt(c1.slice(3, 4), 16) * 17;
    const r2 = parseInt(c2.slice(1, 2), 16) * 17;
    const g2 = parseInt(c2.slice(2, 3), 16) * 17;
    const b2 = parseInt(c2.slice(3, 4), 16) * 17;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Runner, AKI_FORMS };
}
