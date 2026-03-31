/**
 * Obstacle management for inthebeginning bounce.
 *
 * 2D mode: objects spawn from the RIGHT edge and fly LEFT across the terrain.
 * 3D mode: objects spawn from the top (far away) and move toward the player.
 * Players must position themselves to line up and jump over approaching objects.
 * Progressive difficulty: more objects spawn at higher levels.
 */

/** Base obstacle types available from level 1 (6 base types). */
const BASE_OBSTACLE_EMOJI = [
  { emoji: '\u2B50', name: 'star',       minW: 24, maxW: 38, minH: 24, maxH: 38, color: '#fa4', accent: '#fc8' },
  { emoji: '\u{1F30D}', name: 'earth',   minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#4af', accent: '#8cf' },
  { emoji: '\u2604\uFE0F', name: 'comet', minW: 30, maxW: 48, minH: 20, maxH: 32, color: '#f84', accent: '#fa8' },
  { emoji: '\u{1F48E}', name: 'gem',     minW: 20, maxW: 32, minH: 24, maxH: 40, color: '#a4f', accent: '#c8f' },
  { emoji: '\u2744\uFE0F', name: 'snowflake', minW: 22, maxW: 36, minH: 22, maxH: 36, color: '#4ff', accent: '#8ff' },
  { emoji: '\u{1F525}', name: 'fire',    minW: 22, maxW: 35, minH: 28, maxH: 42, color: '#f62', accent: '#f84' },
];

/** Progressive obstacle types unlocked per level (triangular number progression). */
const PROGRESSIVE_OBSTACLE_EMOJI = [
  { emoji: '\u{1F30A}', name: 'wave',        minW: 35, maxW: 52, minH: 18, maxH: 30, color: '#48f', accent: '#8af' },
  { emoji: '\u26A1', name: 'lightning',       minW: 18, maxW: 28, minH: 32, maxH: 50, color: '#ff4', accent: '#ff8' },
  { emoji: '\u{1F338}', name: 'blossom',      minW: 24, maxW: 38, minH: 24, maxH: 38, color: '#f8a', accent: '#fab' },
  { emoji: '\u{1F30B}', name: 'volcano',      minW: 28, maxW: 44, minH: 30, maxH: 48, color: '#f44', accent: '#f88' },
  { emoji: '\u{1F319}', name: 'crescent',     minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#ff8', accent: '#ffa' },
  { emoji: '\u{1F343}', name: 'leaf',         minW: 20, maxW: 32, minH: 22, maxH: 34, color: '#4c4', accent: '#8e8' },
  { emoji: '\u{1F30C}', name: 'galaxy',       minW: 30, maxW: 48, minH: 30, maxH: 48, color: '#a4f', accent: '#c8f' },
  { emoji: '\u2728', name: 'sparkles',        minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#ff8', accent: '#ffa' },
  { emoji: '\u{1F33B}', name: 'sunflower',    minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#fc4', accent: '#fe8' },
  { emoji: '\u{1F9CA}', name: 'ice',          minW: 20, maxW: 32, minH: 24, maxH: 38, color: '#aef', accent: '#cff' },
  { emoji: '\u{1F300}', name: 'cyclone',      minW: 28, maxW: 44, minH: 28, maxH: 44, color: '#48a', accent: '#6ac' },
  { emoji: '\u{1F341}', name: 'maple',        minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#e64', accent: '#f86' },
  { emoji: '\u2603\uFE0F', name: 'snowman',   minW: 24, maxW: 36, minH: 30, maxH: 46, color: '#cdf', accent: '#eff' },
  { emoji: '\u{1F33A}', name: 'hibiscus',     minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#f48', accent: '#f8a' },
  { emoji: '\u{1F331}', name: 'seedling',     minW: 20, maxW: 30, minH: 24, maxH: 36, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F3B5}', name: 'note',         minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#f4a', accent: '#f8c' },
  { emoji: '\u{1F30E}', name: 'americas',     minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#48f', accent: '#8af' },
  { emoji: '\u{1F4A7}', name: 'droplet',      minW: 18, maxW: 28, minH: 22, maxH: 34, color: '#4af', accent: '#8cf' },
  { emoji: '\u{1F311}', name: 'new_moon',     minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#334', accent: '#556' },
  { emoji: '\u{1F315}', name: 'full_moon',    minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#ee8', accent: '#ffa' },
  { emoji: '\u{1F32C}\uFE0F', name: 'wind',   minW: 30, maxW: 48, minH: 18, maxH: 28, color: '#acd', accent: '#cef' },
  { emoji: '\u{1F308}', name: 'rainbow',      minW: 35, maxW: 55, minH: 20, maxH: 32, color: '#f48', accent: '#fa8' },
  { emoji: '\u{1F310}', name: 'meridians',    minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#4a8', accent: '#8ca' },
  { emoji: '\u{1F344}', name: 'mushroom',     minW: 22, maxW: 34, minH: 26, maxH: 40, color: '#c44', accent: '#e88' },
  { emoji: '\u2618\uFE0F', name: 'shamrock',  minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F33C}', name: 'daisy',        minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#ff8', accent: '#ffa' },
  { emoji: '\u{1F30F}', name: 'asia',         minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#4a8', accent: '#8ca' },
  { emoji: '\u{1F312}', name: 'waxing',       minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#889', accent: '#aab' },
  { emoji: '\u{1F3B6}', name: 'notes',        minW: 26, maxW: 40, minH: 22, maxH: 34, color: '#a4f', accent: '#c8f' },
  { emoji: '\u{1F335}', name: 'cactus',       minW: 20, maxW: 30, minH: 30, maxH: 48, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F333}', name: 'tree',         minW: 24, maxW: 38, minH: 32, maxH: 50, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F332}', name: 'evergreen',    minW: 22, maxW: 34, minH: 34, maxH: 52, color: '#284', accent: '#4a6' },
  { emoji: '\u{1F334}', name: 'palm',         minW: 22, maxW: 34, minH: 34, maxH: 52, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F342}', name: 'fallen_leaf',  minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#c84', accent: '#ea8' },
  { emoji: '\u{1F6F8}', name: 'ufo',          minW: 32, maxW: 50, minH: 18, maxH: 28, color: '#8af', accent: '#acf' },
  { emoji: '\u{1FA90}', name: 'ringed_planet', minW: 30, maxW: 46, minH: 26, maxH: 40, color: '#e84', accent: '#fa8' },
  { emoji: '\u{1F320}', name: 'shooting_star', minW: 28, maxW: 44, minH: 20, maxH: 32, color: '#ff8', accent: '#ffa' },
  { emoji: '\u2734\uFE0F', name: 'eight_star', minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#f84', accent: '#fa8' },
  { emoji: '\u{1F329}\uFE0F', name: 'cloud_lightning', minW: 32, maxW: 48, minH: 24, maxH: 38, color: '#88a', accent: '#aac' },
  { emoji: '\u{1F327}\uFE0F', name: 'rain',   minW: 30, maxW: 46, minH: 22, maxH: 34, color: '#68a', accent: '#8ac' },
  { emoji: '\u{1F32A}\uFE0F', name: 'tornado', minW: 24, maxW: 36, minH: 30, maxH: 48, color: '#88a', accent: '#aac' },
  { emoji: '\u{1F52E}', name: 'crystal_ball', minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#a4f', accent: '#c8f' },
  { emoji: '\u269B\uFE0F', name: 'atom',      minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#4af', accent: '#8cf' },
  { emoji: '\u{1F9EC}', name: 'dna',          minW: 20, maxW: 30, minH: 32, maxH: 50, color: '#48f', accent: '#8af' },
  { emoji: '\u{1F52D}', name: 'telescope',    minW: 24, maxW: 38, minH: 28, maxH: 44, color: '#888', accent: '#aaa' },
];

/**
 * Get available obstacle types for a given level.
 * @param {number} level - 0-based level index
 * @returns {Array} Available obstacle type definitions
 */
function getObstacleTypesForLevel(level) {
  const types = [...BASE_OBSTACLE_EMOJI];
  const progressiveCount = Math.min(
    PROGRESSIVE_OBSTACLE_EMOJI.length,
    Math.floor(level * (level + 1) / 2)
  );
  for (let i = 0; i < progressiveCount; i++) {
    types.push(PROGRESSIVE_OBSTACLE_EMOJI[i]);
  }
  return types;
}

class Obstacle {
  /**
   * @param {number} laneX - Horizontal position (fraction 0-1 of screen width).
   * @param {number} screenWidth
   * @param {number} screenHeight
   * @param {Object} type - Obstacle type definition.
   * @param {boolean} [horizontal=false] - True for 2D (right-to-left) mode.
   */
  constructor(laneX, screenWidth, screenHeight, type, horizontal) {
    this.type = type;
    this.emoji = type.emoji;
    this.typeName = type.name;
    this.color = type.color;
    this.accent = type.accent;
    this.w = type.minW + Math.random() * (type.maxW - type.minW);
    this.h = type.minH + Math.random() * (type.maxH - type.minH);

    // Horizontal position as fraction of screen width (used for lane display)
    this.laneFraction = laneX;
    this.horizontal = !!horizontal;

    if (this.horizontal) {
      // 2D mode: spawn off the right edge, lane determines vertical position
      this.x = screenWidth + this.w + 20;
      // laneX maps to vertical position on screen (10%-90% of groundY range)
      this.laneYFraction = laneX;
      this.y = 0; // will be set by game.js terrain clamping
    } else {
      // 3D mode: spawn above screen at lane position
      this.x = laneX * screenWidth - this.w / 2;
      this.y = -this.h - 20;
    }

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.blasted = false;
    this.blastTimer = 0;
    this.particles = [];
    this.phase = Math.random() * Math.PI * 2;
    this.jumpedOver = false;
    this.scored = false;
    this.emojiSize = Math.max(this.w, this.h);
  }

  update(dt, fallSpeed) {
    if (this.horizontal) {
      // 2D mode: move left
      this.x -= fallSpeed * dt;
    } else {
      // 3D mode: move down — obstacles continue past player and fade out
      this.y += fallSpeed * dt;
      // Fade out in bottom 20% of screen so they don't pile up visually
      const fadeStart = this.screenHeight * 0.75;
      if (this.y > fadeStart) {
        this._fadeAlpha = Math.max(0, 1 - (this.y - fadeStart) / (this.screenHeight * 0.25));
      } else {
        this._fadeAlpha = 1.0;
      }
    }
    this.phase += dt * 2;

    if (this.blasted) {
      this.blastTimer += dt;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
        p.alpha -= dt * 1.8;
        p.size *= (1 - dt * 0.5);
        if (p.alpha <= 0) this.particles.splice(i, 1);
      }
    }
  }

  blast() {
    this.blasted = true;
    this.blastTimer = 0;
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: this.x + this.w / 2,
        y: this.y + this.h / 2,
        vx: (Math.random() - 0.5) * 200,
        vy: -60 - Math.random() * 120,
        alpha: 0.6,
        size: 2 + Math.random() * 3,
      });
    }
  }

  isOffScreen() {
    if (this.blasted) {
      return this.particles.length === 0 && this.blastTimer > 0.6;
    }
    if (this.horizontal) {
      return this.x + this.w < -40;
    }
    return this.y > this.screenHeight + 40;
  }

  getBounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  render(ctx) {
    if (this.blasted) {
      for (const p of this.particles) {
        ctx.globalAlpha = p.alpha * 0.5;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    const fontSize = this.emojiSize * 0.9;
    ctx.save();
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fade = this._fadeAlpha !== undefined ? this._fadeAlpha : 1.0;
    ctx.globalAlpha = 0.2 * fade;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillText(this.emoji, this.x + this.w / 2, this.y + this.h / 2);
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 0.9 * fade;
    ctx.fillText(this.emoji, this.x + this.w / 2, this.y + this.h / 2);
    ctx.restore();
  }
}

class ObstacleManager {
  constructor(screenWidth, groundY, screenHeight) {
    this.obstacles = [];
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight || 600;
    this.groundY = groundY;
    this.spawnTimer = 2;
    this.spawnInterval = 1.5;
    this.typeBias = 0;
    this.totalSpawned = 0;
    this.level = 0;
    this.laneCount = 3;
    this.availableTypes = getObstacleTypesForLevel(0);
    /** @type {boolean} True when in 2D mode (objects fly right-to-left). */
    this.horizontalMode = true;
  }

  resize(screenWidth, groundY) {
    this.screenWidth = screenWidth;
    this.groundY = groundY;
    // Update existing obstacles' screen dimensions
    for (const obs of this.obstacles) {
      obs.screenWidth = screenWidth;
    }
  }

  setScreenHeight(h) {
    this.screenHeight = h;
    for (const obs of this.obstacles) {
      obs.screenHeight = h;
    }
  }

  setTypeBias(bias) { this.typeBias = bias; }

  setLevel(level) {
    this.level = level;
    this.availableTypes = getObstacleTypesForLevel(level);
    // Progressive difficulty: spawn interval decreases gradually.
    // Level 0: 1.6s, Level 6: 1.24s, Level 7: 1.18s, Level 11: 0.8s
    // Objects start slower and ramp gently — user can always use +/- to adjust.
    this.spawnInterval = Math.max(0.7, 1.6 - level * 0.06);
  }

  /**
   * Set the number of discrete lanes for obstacle spawning.
   * @param {number} count - Number of lanes (from Renderer3D.laneCount).
   */
  setLaneCount(count) {
    this.laneCount = Math.max(2, count);
  }

  update(dt, gameSpeed, fallSpeed) {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawn(gameSpeed);
      this.spawnTimer = this.spawnInterval * (0.6 + Math.random() * 0.8)
        / Math.max(0.5, gameSpeed);
    }

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      this.obstacles[i].update(dt, fallSpeed);
      if (this.obstacles[i].isOffScreen()) {
        this.obstacles.splice(i, 1);
      }
    }
  }

  /**
   * Pick a discrete lane position. Each lane is evenly distributed across
   * the road (10%-90% of screen width) with a small random jitter.
   * @param {number} [excludeLane] - Lane index to avoid (for multi-spawn).
   * @returns {{ laneX: number, laneIdx: number }}
   */
  _pickLane(excludeLane) {
    const lanes = this.laneCount;
    let laneIdx;
    if (excludeLane !== undefined && lanes > 1) {
      // Pick a different lane
      laneIdx = (excludeLane + 1 + Math.floor(Math.random() * (lanes - 1))) % lanes;
    } else {
      laneIdx = Math.floor(Math.random() * lanes);
    }
    // Map lane index to 0.10–0.90 range with small jitter
    const baseFrac = 0.10 + (laneIdx / (lanes - 1 || 1)) * 0.80;
    const jitter = (Math.random() - 0.5) * (0.06 / Math.max(1, lanes - 1));
    const laneX = Math.max(0.08, Math.min(0.92, baseFrac + jitter));
    return { laneX, laneIdx };
  }

  _spawn(gameSpeed) {
    let typeIdx = Math.floor(Math.random() * this.availableTypes.length);
    if (Math.random() < 0.3 && this.typeBias < this.availableTypes.length) {
      typeIdx = this.typeBias % this.availableTypes.length;
    }
    const type = this.availableTypes[typeIdx];

    // Discrete lane-based spawning
    const { laneX, laneIdx } = this._pickLane();

    const obs = new Obstacle(laneX, this.screenWidth, this.screenHeight, type, this.horizontalMode);
    this.obstacles.push(obs);
    this.totalSpawned++;

    // At higher levels, occasionally spawn multiple objects at once in different lanes
    if (this.level >= 3 && Math.random() < 0.15 + this.level * 0.03) {
      const extraType = this.availableTypes[Math.floor(Math.random() * this.availableTypes.length)];
      const { laneX: extraLaneX } = this._pickLane(laneIdx);
      const extra = new Obstacle(extraLaneX, this.screenWidth, this.screenHeight, extraType, this.horizontalMode);
      this.obstacles.push(extra);
      this.totalSpawned++;
    }
  }

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
   * Check if player jumped over an obstacle.
   * 2D horizontal: obstacle passed to the left of the player while airborne.
   * 3D vertical: obstacle passed below the player's feet while airborne.
   */
  checkJumpedOver(bounds, isGrounded) {
    let count = 0;
    for (const obs of this.obstacles) {
      if (obs.blasted || obs.jumpedOver) continue;
      const ob = obs.getBounds();

      if (obs.horizontal) {
        // 2D mode: obstacle has passed left of the player
        const verticalOverlap = bounds.y < ob.y + ob.h && bounds.y + bounds.h > ob.y;
        const passedLeft = ob.x + ob.w < bounds.x;
        if (verticalOverlap && passedLeft && !isGrounded) {
          obs.jumpedOver = true;
          count++;
        }
      } else {
        // 3D mode: obstacle has passed below the player
        // Use generous horizontal overlap (±30% margin) — player gets credit
        // if they're approximately in the flight path when jumping
        const margin = ob.w * 0.3;
        const horizontalOverlap = bounds.x < ob.x + ob.w + margin &&
          bounds.x + bounds.w > ob.x - margin;
        const passedBelow = ob.y > bounds.y + bounds.h;
        if (horizontalOverlap && passedBelow && !isGrounded) {
          obs.jumpedOver = true;
          count++;
        }
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
  module.exports = { Obstacle, ObstacleManager, BASE_OBSTACLE_EMOJI,
    PROGRESSIVE_OBSTACLE_EMOJI, getObstacleTypesForLevel };
}
