/**
 * Obstacle generation and management for Cosmic Runner.
 *
 * Generates cosmic-themed obstacles that the player blasts through.
 * Obstacle types correspond to album epochs/tracks.
 */

/** Obstacle type definitions. */
const OBSTACLE_TYPES = [
  { name: 'asteroid',     color: '#888',  accent: '#aaa',  minW: 24, maxW: 40, minH: 24, maxH: 40 },
  { name: 'crystal',      color: '#4af',  accent: '#8cf',  minW: 16, maxW: 28, minH: 30, maxH: 50 },
  { name: 'dark_cloud',   color: '#a4f',  accent: '#c8f',  minW: 40, maxW: 60, minH: 20, maxH: 35 },
  { name: 'dna_helix',    color: '#4fa',  accent: '#8fc',  minW: 20, maxW: 30, minH: 35, maxH: 55 },
  { name: 'star_shard',   color: '#fa4',  accent: '#fc8',  minW: 20, maxW: 35, minH: 20, maxH: 35 },
  { name: 'plasma_rift',  color: '#f4a',  accent: '#f8c',  minW: 30, maxW: 50, minH: 25, maxH: 40 },
  { name: 'frozen_chunk', color: '#4ff',  accent: '#8ff',  minW: 25, maxW: 40, minH: 25, maxH: 40 },
  { name: 'nebula_wisp',  color: '#ff4',  accent: '#ff8',  minW: 35, maxW: 55, minH: 15, maxH: 30 },
];

/**
 * A single obstacle in the game world.
 */
class Obstacle {
  /**
   * @param {number} x - X position (right edge of screen).
   * @param {number} groundY - Ground Y position.
   * @param {number} typeIndex - Index into OBSTACLE_TYPES.
   * @param {number} gameSpeed - Current game speed for sizing.
   */
  constructor(x, groundY, typeIndex, gameSpeed) {
    const type = OBSTACLE_TYPES[typeIndex % OBSTACLE_TYPES.length];

    /** @type {string} */
    this.typeName = type.name;

    /** @type {string} */
    this.color = type.color;

    /** @type {string} */
    this.accent = type.accent;

    /** @type {number} */
    this.w = type.minW + Math.random() * (type.maxW - type.minW);

    /** @type {number} */
    this.h = type.minH + Math.random() * (type.maxH - type.minH);

    /** @type {number} */
    this.x = x;

    /** @type {number} Obstacle sits on the ground */
    this.y = groundY - this.h;

    /** @type {boolean} Whether the obstacle has been blasted */
    this.blasted = false;

    /** @type {number} Blast animation timer */
    this.blastTimer = 0;

    /** @type {Array<{x: number, y: number, vx: number, vy: number, alpha: number, size: number}>} */
    this.particles = [];

    /** @type {number} Animation phase offset */
    this.phase = Math.random() * Math.PI * 2;

    /** @type {number} Whether this is a floating obstacle */
    this.floating = Math.random() < 0.2;

    if (this.floating) {
      this.y = groundY - this.h - 40 - Math.random() * 60;
    }
  }

  /**
   * Update the obstacle position and animations.
   * @param {number} dt - Delta time in seconds.
   * @param {number} speed - Current scroll speed in px/s.
   */
  update(dt, speed) {
    this.x -= speed * dt;
    this.phase += dt * 2;

    if (this.blasted) {
      this.blastTimer += dt;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 400 * dt; // gravity on particles
        p.alpha -= dt * 2.5;
        if (p.alpha <= 0) {
          this.particles.splice(i, 1);
        }
      }
    }
  }

  /**
   * Trigger the blast-through effect.
   */
  blast() {
    this.blasted = true;
    this.blastTimer = 0;
    // Spawn debris particles
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: this.x + this.w / 2,
        y: this.y + this.h / 2,
        vx: (Math.random() - 0.3) * 300,
        vy: -100 - Math.random() * 200,
        alpha: 1,
        size: 2 + Math.random() * 4
      });
    }
  }

  /**
   * Check if this obstacle is off-screen (left side).
   * @returns {boolean}
   */
  isOffScreen() {
    if (this.blasted) {
      return this.particles.length === 0 && this.blastTimer > 0.5;
    }
    return this.x + this.w < -20;
  }

  /**
   * Get the bounding box for collision detection.
   * @returns {{x: number, y: number, w: number, h: number}}
   */
  getBounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  /**
   * Render the obstacle to a canvas context.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    // Blast particles
    if (this.blasted) {
      for (const p of this.particles) {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = this.color.replace(')', `, ${p.alpha * 0.6})`).replace('rgb', 'rgba').replace('#', '');
        // Use hex color with alpha
        ctx.globalAlpha = p.alpha * 0.6;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      return;
    }

    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;

    // Glow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = this.color;

    switch (this.typeName) {
      case 'asteroid':
        this._drawAsteroid(ctx, cx, cy);
        break;
      case 'crystal':
        this._drawCrystal(ctx, cx, cy);
        break;
      case 'dark_cloud':
        this._drawCloud(ctx, cx, cy);
        break;
      case 'dna_helix':
        this._drawHelix(ctx, cx, cy);
        break;
      case 'star_shard':
        this._drawStarShard(ctx, cx, cy);
        break;
      case 'plasma_rift':
        this._drawPlasmaRift(ctx, cx, cy);
        break;
      case 'frozen_chunk':
        this._drawFrozenChunk(ctx, cx, cy);
        break;
      case 'nebula_wisp':
        this._drawNebulaWisp(ctx, cx, cy);
        break;
      default:
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    ctx.restore();

    // Solid body
    ctx.fillStyle = this.color;
    switch (this.typeName) {
      case 'asteroid':
        this._drawAsteroid(ctx, cx, cy);
        break;
      case 'crystal':
        this._drawCrystal(ctx, cx, cy);
        break;
      case 'dark_cloud':
        this._drawCloud(ctx, cx, cy);
        break;
      case 'dna_helix':
        this._drawHelix(ctx, cx, cy);
        break;
      case 'star_shard':
        this._drawStarShard(ctx, cx, cy);
        break;
      case 'plasma_rift':
        this._drawPlasmaRift(ctx, cx, cy);
        break;
      case 'frozen_chunk':
        this._drawFrozenChunk(ctx, cx, cy);
        break;
      case 'nebula_wisp':
        this._drawNebulaWisp(ctx, cx, cy);
        break;
      default:
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    // Accent highlight
    ctx.fillStyle = this.accent;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(cx - this.w * 0.15, cy - this.h * 0.15, Math.min(this.w, this.h) * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** @private */
  _drawAsteroid(ctx, cx, cy) {
    ctx.beginPath();
    const r = Math.min(this.w, this.h) / 2;
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rr = r * (0.8 + Math.sin(a * 3 + this.phase) * 0.2);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** @private */
  _drawCrystal(ctx, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx, this.y);
    ctx.lineTo(cx + this.w / 2, cy);
    ctx.lineTo(cx + this.w / 3, this.y + this.h);
    ctx.lineTo(cx - this.w / 3, this.y + this.h);
    ctx.lineTo(cx - this.w / 2, cy);
    ctx.closePath();
    ctx.fill();
  }

  /** @private */
  _drawCloud(ctx, cx, cy) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(cx - this.w * 0.2, cy - this.h * 0.1, this.w * 0.3, this.h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** @private */
  _drawHelix(ctx, cx, cy) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = this.color;
    ctx.beginPath();
    for (let dy = 0; dy < this.h; dy += 2) {
      const wave = Math.sin((dy + this.phase * 10) * 0.15) * this.w * 0.4;
      ctx.lineTo(cx + wave, this.y + dy);
    }
    ctx.stroke();
    ctx.strokeStyle = this.accent;
    ctx.beginPath();
    for (let dy = 0; dy < this.h; dy += 2) {
      const wave = Math.sin((dy + this.phase * 10) * 0.15 + Math.PI) * this.w * 0.4;
      ctx.lineTo(cx + wave, this.y + dy);
    }
    ctx.stroke();
  }

  /** @private */
  _drawStarShard(ctx, cx, cy) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? Math.min(this.w, this.h) / 2 : Math.min(this.w, this.h) / 4;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** @private */
  _drawPlasmaRift(ctx, cx, cy) {
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const r = Math.min(this.w, this.h) / 2 * (0.7 + Math.sin(a * 5 + this.phase) * 0.3);
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** @private */
  _drawFrozenChunk(ctx, cx, cy) {
    // Hexagonal chunk
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = Math.min(this.w, this.h) / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** @private */
  _drawNebulaWisp(ctx, cx, cy) {
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(cx, cy, this.w / 2, this.h / 2, Math.sin(this.phase) * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(cx + this.w * 0.1, cy, this.w * 0.3, this.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * ObstacleManager handles obstacle spawning and lifecycle.
 */
class ObstacleManager {
  /**
   * @param {number} screenWidth
   * @param {number} groundY
   */
  constructor(screenWidth, groundY) {
    /** @type {Obstacle[]} */
    this.obstacles = [];

    /** @type {number} */
    this.screenWidth = screenWidth;

    /** @type {number} */
    this.groundY = groundY;

    /** @type {number} Time until next spawn */
    this.spawnTimer = 2;

    /** @type {number} Min time between spawns */
    this.spawnInterval = 1.5;

    /** @type {number} Current obstacle type bias (changes with track) */
    this.typeBias = 0;

    /** @type {number} Total obstacles spawned */
    this.totalSpawned = 0;
  }

  /**
   * Resize the manager for new screen dimensions.
   * @param {number} screenWidth
   * @param {number} groundY
   */
  resize(screenWidth, groundY) {
    this.screenWidth = screenWidth;
    this.groundY = groundY;
  }

  /**
   * Set the obstacle type bias (0-7) based on current track.
   * @param {number} bias
   */
  setTypeBias(bias) {
    this.typeBias = bias % OBSTACLE_TYPES.length;
  }

  /**
   * Update all obstacles and spawn new ones.
   * @param {number} dt - Delta time in seconds.
   * @param {number} gameSpeed - Current game speed multiplier.
   * @param {number} scrollSpeed - Pixels per second.
   */
  update(dt, gameSpeed, scrollSpeed) {
    // Spawn timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawn(gameSpeed);
      // Randomize next spawn interval
      this.spawnTimer = this.spawnInterval * (0.6 + Math.random() * 0.8) / Math.max(0.5, gameSpeed);
    }

    // Update existing obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.obstacles[i].update(dt, scrollSpeed);
      if (this.obstacles[i].isOffScreen()) {
        this.obstacles.splice(i, 1);
      }
    }
  }

  /**
   * Spawn a new obstacle.
   * @param {number} gameSpeed
   * @private
   */
  _spawn(gameSpeed) {
    // Bias toward current track's type, but allow variety
    let typeIdx = this.typeBias;
    if (Math.random() < 0.4) {
      typeIdx = Math.floor(Math.random() * OBSTACLE_TYPES.length);
    }

    const obs = new Obstacle(
      this.screenWidth + 20,
      this.groundY,
      typeIdx,
      gameSpeed
    );
    this.obstacles.push(obs);
    this.totalSpawned++;
  }

  /**
   * Check collision between runner and all obstacles.
   * @param {{x: number, y: number, w: number, h: number}} runnerBounds
   * @returns {Obstacle|null} The obstacle that was hit, or null.
   */
  checkCollision(runnerBounds) {
    for (const obs of this.obstacles) {
      if (obs.blasted) continue;
      const ob = obs.getBounds();
      if (
        runnerBounds.x < ob.x + ob.w &&
        runnerBounds.x + runnerBounds.w > ob.x &&
        runnerBounds.y < ob.y + ob.h &&
        runnerBounds.y + runnerBounds.h > ob.y
      ) {
        return obs;
      }
    }
    return null;
  }

  /**
   * Render all obstacles.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    for (const obs of this.obstacles) {
      obs.render(ctx);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Obstacle, ObstacleManager, OBSTACLE_TYPES };
}
