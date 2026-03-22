/**
 * Obstacle management for Cosmic Runner V3.
 *
 * Features:
 * - Progressive difficulty: more obstacles at higher levels
 * - Objects appear at different heights (ground, mid, high)
 * - Obstacles appropriate for both 2D and 3D rendering
 * - 8 cosmic-themed obstacle types
 */

const OBSTACLE_TYPES = [
  { name: 'asteroid',     color: '#888', accent: '#aaa', minW: 24, maxW: 40, minH: 24, maxH: 40 },
  { name: 'crystal',      color: '#4af', accent: '#8cf', minW: 16, maxW: 28, minH: 30, maxH: 50 },
  { name: 'dark_cloud',   color: '#a4f', accent: '#c8f', minW: 40, maxW: 60, minH: 20, maxH: 35 },
  { name: 'dna_helix',    color: '#4fa', accent: '#8fc', minW: 20, maxW: 30, minH: 35, maxH: 55 },
  { name: 'star_shard',   color: '#fa4', accent: '#fc8', minW: 20, maxW: 35, minH: 20, maxH: 35 },
  { name: 'plasma_rift',  color: '#f4a', accent: '#f8c', minW: 30, maxW: 50, minH: 25, maxH: 40 },
  { name: 'frozen_chunk', color: '#4ff', accent: '#8ff', minW: 25, maxW: 40, minH: 25, maxH: 40 },
  { name: 'nebula_wisp',  color: '#ff4', accent: '#ff8', minW: 35, maxW: 55, minH: 15, maxH: 30 },
];

class Obstacle {
  constructor(x, groundY, typeIndex, heightClass) {
    const type = OBSTACLE_TYPES[typeIndex % OBSTACLE_TYPES.length];
    this.typeName = type.name;
    this.color = type.color;
    this.accent = type.accent;
    this.w = type.minW + Math.random() * (type.maxW - type.minW);
    this.h = type.minH + Math.random() * (type.maxH - type.minH);
    this.x = x;

    // Height class: 'ground', 'mid', 'high'
    this.heightClass = heightClass || 'ground';
    switch (this.heightClass) {
      case 'mid':
        this.y = groundY - this.h - 30 - Math.random() * 30;
        break;
      case 'high':
        this.y = groundY - this.h - 70 - Math.random() * 40;
        break;
      default:
        this.y = groundY - this.h;
    }

    this.blasted = false;
    this.blastTimer = 0;
    this.particles = [];
    this.phase = Math.random() * Math.PI * 2;
    /** @type {boolean} Whether player has jumped over this obstacle. */
    this.jumpedOver = false;
    /** @type {boolean} Whether this has been scored. */
    this.scored = false;
  }

  update(dt, speed) {
    this.x -= speed * dt;
    this.phase += dt * 2;

    if (this.blasted) {
      this.blastTimer += dt;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 400 * dt;
        p.alpha -= dt * 2.5;
        if (p.alpha <= 0) this.particles.splice(i, 1);
      }
    }
  }

  blast() {
    this.blasted = true;
    this.blastTimer = 0;
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        x: this.x + this.w / 2,
        y: this.y + this.h / 2,
        vx: (Math.random() - 0.3) * 300,
        vy: -100 - Math.random() * 200,
        alpha: 1,
        size: 2 + Math.random() * 4,
      });
    }
  }

  isOffScreen() {
    return this.blasted
      ? this.particles.length === 0 && this.blastTimer > 0.5
      : this.x + this.w < -20;
  }

  getBounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  render(ctx) {
    if (this.blasted) {
      for (const p of this.particles) {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;

    // Shadow/glow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = this.color;
    this._drawBody(ctx, cx, cy);
    ctx.restore();

    // Solid body
    ctx.fillStyle = this.color;
    this._drawBody(ctx, cx, cy);

    // Highlight
    ctx.fillStyle = this.accent;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(cx - this.w * 0.15, cy - this.h * 0.15,
      Math.min(this.w, this.h) * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawBody(ctx, cx, cy) {
    const r = Math.min(this.w, this.h) / 2;
    switch (this.typeName) {
      case 'asteroid':
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.5) {
          const rr = r * (0.8 + Math.sin(a * 3 + this.phase) * 0.2);
          const px = cx + Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'crystal':
        ctx.beginPath();
        ctx.moveTo(cx, this.y);
        ctx.lineTo(cx + this.w / 2, cy);
        ctx.lineTo(cx + this.w / 3, this.y + this.h);
        ctx.lineTo(cx - this.w / 3, this.y + this.h);
        ctx.lineTo(cx - this.w / 2, cy);
        ctx.closePath();
        ctx.fill();
        break;
      case 'dark_cloud':
        ctx.beginPath();
        ctx.ellipse(cx, cy, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'dna_helix':
        ctx.lineWidth = 3;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath();
        for (let dy = 0; dy < this.h; dy += 2) {
          const wave = Math.sin((dy + this.phase * 10) * 0.15) * this.w * 0.4;
          ctx.lineTo(cx + wave, this.y + dy);
        }
        ctx.stroke();
        break;
      case 'star_shard':
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const sr = i % 2 === 0 ? r : r / 2;
          ctx.lineTo(cx + Math.cos(a) * sr, cy + Math.sin(a) * sr);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'plasma_rift':
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.3) {
          const rr = r * (0.7 + Math.sin(a * 5 + this.phase) * 0.3);
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'frozen_chunk':
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'nebula_wisp':
        ctx.globalAlpha = Math.min(ctx.globalAlpha, 0.7);
        ctx.beginPath();
        ctx.ellipse(cx, cy, this.w / 2, this.h / 2,
          Math.sin(this.phase) * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      default:
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }
}

class ObstacleManager {
  constructor(screenWidth, groundY) {
    this.obstacles = [];
    this.screenWidth = screenWidth;
    this.groundY = groundY;
    this.spawnTimer = 2;
    this.spawnInterval = 1.5;
    this.typeBias = 0;
    this.totalSpawned = 0;
    /** @type {number} Current level (affects difficulty). */
    this.level = 0;
  }

  resize(screenWidth, groundY) {
    this.screenWidth = screenWidth;
    this.groundY = groundY;
  }

  setTypeBias(bias) { this.typeBias = bias % OBSTACLE_TYPES.length; }

  /**
   * Set level for difficulty scaling.
   * @param {number} level - 0-based level index.
   */
  setLevel(level) {
    this.level = level;
    // Reduce spawn interval at higher levels (more obstacles)
    this.spawnInterval = Math.max(0.6, 1.5 - level * 0.07);
  }

  update(dt, gameSpeed, scrollSpeed) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawn(gameSpeed);
      this.spawnTimer = this.spawnInterval * (0.6 + Math.random() * 0.8)
        / Math.max(0.5, gameSpeed);
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.obstacles[i].update(dt, scrollSpeed);
      if (this.obstacles[i].isOffScreen()) {
        this.obstacles.splice(i, 1);
      }
    }
  }

  _spawn(gameSpeed) {
    let typeIdx = this.typeBias;
    if (Math.random() < 0.4) {
      typeIdx = Math.floor(Math.random() * OBSTACLE_TYPES.length);
    }

    // Height distribution varies by level
    let heightClass = 'ground';
    const r = Math.random();
    if (this.level >= 2 && r < 0.15 + this.level * 0.03) {
      heightClass = 'mid';
    }
    if (this.level >= 4 && r < 0.05 + this.level * 0.02) {
      heightClass = 'high';
    }

    const obs = new Obstacle(
      this.screenWidth + 20, this.groundY, typeIdx, heightClass);
    this.obstacles.push(obs);
    this.totalSpawned++;
  }

  /**
   * Check collision and return hit obstacle.
   * @param {{x:number,y:number,w:number,h:number}} bounds
   * @returns {Obstacle|null}
   */
  checkCollision(bounds) {
    for (const obs of this.obstacles) {
      if (obs.blasted) continue;
      const ob = obs.getBounds();
      if (bounds.x < ob.x + ob.w && bounds.x + bounds.w > ob.x &&
          bounds.y < ob.y + ob.h && bounds.y + bounds.h > ob.y) {
        return obs;
      }
    }
    return null;
  }

  /**
   * Check which obstacles the runner has jumped over.
   * @param {{x:number,y:number,w:number,h:number}} bounds
   * @returns {number} Count of newly jumped obstacles.
   */
  checkJumpedOver(bounds) {
    let count = 0;
    for (const obs of this.obstacles) {
      if (obs.blasted || obs.jumpedOver) continue;
      const ob = obs.getBounds();
      // Runner has passed the obstacle's right edge and is above it
      if (bounds.x > ob.x + ob.w && bounds.y + bounds.h < ob.y + 5) {
        obs.jumpedOver = true;
        count++;
      }
    }
    return count;
  }

  render(ctx) {
    for (const obs of this.obstacles) {
      obs.render(ctx);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Obstacle, ObstacleManager, OBSTACLE_TYPES };
}
