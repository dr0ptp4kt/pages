/**
 * Runner — the player character in Cosmic Runner V3.
 *
 * Features:
 * - Multi-jump: press jump while airborne to go higher (up to MAX_MULTI_JUMPS)
 * - Per-level character (from CHARACTERS array)
 * - Glow effect after 50%+ streak without hitting obstacles
 * - Squash/stretch animation
 * - Trail particles
 */

class Runner {
  /**
   * @param {number} groundY
   * @param {number} [playerIndex=0] - 0 = player 1, 1 = player 2.
   */
  constructor(groundY, playerIndex) {
    this.playerIndex = playerIndex || 0;
    this.x = this.playerIndex === 0 ? 100 : 60;
    this.y = groundY;
    this.w = 28;
    this.h = 32;
    this.vy = 0;
    this.gravity = 1600;
    this.jumpPower = -560;
    this.grounded = true;
    this.groundY = groundY;

    /** @type {number} Current character index (changes per level). */
    this.characterIndex = 0;

    /** @type {number} Number of jumps used in current air sequence. */
    this.jumpCount = 0;

    /** @type {number} Animation timer. */
    this.runTimer = 0;

    /** @type {number} Squash/stretch. */
    this.squash = 1;

    /** @type {boolean} Blast-through state. */
    this.blasting = false;
    this.blastTimer = 0;

    /** @type {number} Glow alpha (0 = no glow, 1 = full glow). */
    this.glowAlpha = 0;
    this.glowTarget = 0;

    /** @type {number} Consecutive distance without hitting. */
    this.streakDistance = 0;

    /** @type {string} Random name for this level. */
    this.name = '';

    /** @type {Array<{x: number, y: number, alpha: number, hue: number}>} */
    this.trail = [];
    this.trailTimer = 0;

    /** @type {number} Points accumulated this level. */
    this.points = 0;

    /** @type {number} Objects jumped over without landing between. */
    this.jumpOverCount = 0;
  }

  /**
   * Attempt a jump. Supports multi-jump while airborne.
   */
  jump() {
    if (this.grounded) {
      this.vy = this.jumpPower;
      this.grounded = false;
      this.jumpCount = 1;
      this.squash = 1.3;
    } else if (this.jumpCount < MAX_MULTI_JUMPS) {
      // Multi-jump: diminishing power for each successive jump
      const power = this.jumpPower * (0.75 - this.jumpCount * 0.1);
      this.vy = Math.min(this.vy, power);
      this.jumpCount++;
      this.squash = 1.15;
    }
  }

  /**
   * Set character for current level.
   * @param {number} levelIndex
   */
  setLevel(levelIndex) {
    this.characterIndex = levelIndex % CHARACTERS.length;
    this.streakDistance = 0;
    this.glowTarget = 0;
    this.glowAlpha = 0;
    this.points = 0;
    this.jumpOverCount = 0;
    this.name = generatePlayerName(Math.random);
  }

  /** Trigger blast effect when hitting an obstacle. */
  blast() {
    this.blasting = true;
    this.blastTimer = 0.3;
    this.streakDistance = 0;
    this.glowTarget = 0;

    const char = CHARACTERS[this.characterIndex];
    for (let i = 0; i < 8; i++) {
      this.trail.push({
        x: this.x + this.w / 2 + (Math.random() - 0.5) * 20,
        y: this.y - this.h / 2 + (Math.random() - 0.5) * 20,
        alpha: 1,
        hue: _parseHueHex(char.color),
      });
    }
  }

  /**
   * Update physics and animation.
   * @param {number} dt
   * @param {number} scrollSpeed - Pixels per second of scrolling.
   * @param {number} trackDuration - Current track duration in seconds.
   * @param {number} trackProgress - 0-1 progress through track.
   */
  update(dt, scrollSpeed, trackDuration, trackProgress) {
    // Gravity
    if (!this.grounded) {
      this.vy += this.gravity * dt;
      this.y += this.vy * dt;
      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.grounded = true;
        this.squash = 0.7;
        this.jumpCount = 0;
        // Award points for objects jumped over
        if (this.jumpOverCount > 0) {
          this.points += Math.min(this.jumpOverCount + 1, 3);
          this.jumpOverCount = 0;
        }
      }
    }

    // Squash recovery
    this.squash += (1 - this.squash) * 8 * dt;

    // Run animation
    this.runTimer += dt;

    // Streak tracking
    this.streakDistance += scrollSpeed * dt;

    // Check glow threshold (>50% of track without hitting)
    if (trackDuration > 0 && trackProgress > GLOW_THRESHOLD) {
      if (this.streakDistance > 0) {
        this.glowTarget = 1;
      }
    }

    // Glow fade-in/fade-out
    this.glowAlpha += (this.glowTarget - this.glowAlpha) * 3 * dt;

    // Glow fade-out in last 3 seconds of track
    if (trackDuration > 0 && trackDuration - (trackProgress * trackDuration) < 3) {
      this.glowAlpha *= 0.9;
    }

    // Blast timer
    if (this.blasting) {
      this.blastTimer -= dt;
      if (this.blastTimer <= 0) this.blasting = false;
    }

    // Trail
    this.trailTimer += dt;
    if (this.trailTimer > 0.05) {
      this.trailTimer = 0;
      const char = CHARACTERS[this.characterIndex];
      this.trail.push({
        x: this.x + 4 + Math.random() * 6,
        y: this.y - this.h / 2 + (Math.random() - 0.5) * this.h * 0.6,
        alpha: 0.6,
        hue: _parseHueHex(char.color),
      });
    }

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].alpha -= dt * 3;
      this.trail[i].x -= dt * 40;
      if (this.trail[i].alpha <= 0) this.trail.splice(i, 1);
    }
  }

  setGroundY(groundY) {
    if (this.grounded) this.y = groundY;
    this.groundY = groundY;
  }

  getBounds() {
    return { x: this.x + 4, y: this.y - this.h + 4, w: this.w - 8, h: this.h - 8 };
  }

  /**
   * Render the character.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const char = CHARACTERS[this.characterIndex];
    const cx = this.x + this.w / 2;
    const cy = this.y - this.h / 2;

    // Trail
    for (const p of this.trail) {
      ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Blast flash
    if (this.blasting) {
      ctx.save();
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 20;
    }

    drawCharacter(ctx, char, cx, cy, this.w, this.h,
      this.runTimer, this.grounded, this.glowAlpha, this.squash);

    if (this.blasting) ctx.restore();
  }
}

/** Parse hex color to approximate hue. */
function _parseHueHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h;
  if (max === r) h = (g - b) / (max - min);
  else if (max === g) h = 2 + (b - r) / (max - min);
  else h = 4 + (r - g) / (max - min);
  return ((h * 60) + 360) % 360;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Runner };
}
