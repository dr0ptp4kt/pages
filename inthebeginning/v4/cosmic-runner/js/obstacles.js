/**
 * Obstacle management for Cosmic Runner V3.
 *
 * Features:
 * - Progressive variety: 6 + triangular(level) types per level
 * - Emoji-based obstacle visuals (neutral, non-offensive)
 * - Objects at different heights (ground, mid, high, sky)
 * - Objects above player head to run under
 * - 3D-aware obstacle positioning
 */

/** Base obstacle types available from level 1 (6 base types). */
const BASE_OBSTACLE_EMOJI = [
  { emoji: '\u2B50', name: 'star',       minW: 24, maxW: 38, minH: 24, maxH: 38, color: '#fa4', accent: '#fc8' },  // star
  { emoji: '\u{1F30D}', name: 'earth',   minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#4af', accent: '#8cf' },  // globe
  { emoji: '\u2604\uFE0F', name: 'comet', minW: 30, maxW: 48, minH: 20, maxH: 32, color: '#f84', accent: '#fa8' }, // comet
  { emoji: '\u{1F48E}', name: 'gem',     minW: 20, maxW: 32, minH: 24, maxH: 40, color: '#a4f', accent: '#c8f' },  // gem
  { emoji: '\u2744\uFE0F', name: 'snowflake', minW: 22, maxW: 36, minH: 22, maxH: 36, color: '#4ff', accent: '#8ff' }, // snowflake
  { emoji: '\u{1F525}', name: 'fire',    minW: 22, maxW: 35, minH: 28, maxH: 42, color: '#f62', accent: '#f84' },  // fire
];

/** Progressive obstacle types unlocked per level (triangular number progression).
 * Level N unlocks types[0..N-1] from this array. */
const PROGRESSIVE_OBSTACLE_EMOJI = [
  // Level 2: +1
  { emoji: '\u{1F30A}', name: 'wave',        minW: 35, maxW: 52, minH: 18, maxH: 30, color: '#48f', accent: '#8af' },
  // Level 3: +2
  { emoji: '\u26A1', name: 'lightning',       minW: 18, maxW: 28, minH: 32, maxH: 50, color: '#ff4', accent: '#ff8' },
  { emoji: '\u{1F338}', name: 'blossom',      minW: 24, maxW: 38, minH: 24, maxH: 38, color: '#f8a', accent: '#fab' },
  // Level 4: +3
  { emoji: '\u{1F30B}', name: 'volcano',      minW: 28, maxW: 44, minH: 30, maxH: 48, color: '#f44', accent: '#f88' },
  { emoji: '\u{1F319}', name: 'crescent',     minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#ff8', accent: '#ffa' },
  { emoji: '\u{1F343}', name: 'leaf',         minW: 20, maxW: 32, minH: 22, maxH: 34, color: '#4c4', accent: '#8e8' },
  // Level 5: +4
  { emoji: '\u{1F30C}', name: 'galaxy',       minW: 30, maxW: 48, minH: 30, maxH: 48, color: '#a4f', accent: '#c8f' },
  { emoji: '\u2728', name: 'sparkles',        minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#ff8', accent: '#ffa' },
  { emoji: '\u{1F33B}', name: 'sunflower',    minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#fc4', accent: '#fe8' },
  { emoji: '\u{1F9CA}', name: 'ice',          minW: 20, maxW: 32, minH: 24, maxH: 38, color: '#aef', accent: '#cff' },
  // Level 6: +5
  { emoji: '\u{1F300}', name: 'cyclone',      minW: 28, maxW: 44, minH: 28, maxH: 44, color: '#48a', accent: '#6ac' },
  { emoji: '\u{1F341}', name: 'maple',        minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#e64', accent: '#f86' },
  { emoji: '\u2603\uFE0F', name: 'snowman',   minW: 24, maxW: 36, minH: 30, maxH: 46, color: '#cdf', accent: '#eff' },
  { emoji: '\u{1F33A}', name: 'hibiscus',     minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#f48', accent: '#f8a' },
  { emoji: '\u{1F331}', name: 'seedling',     minW: 20, maxW: 30, minH: 24, maxH: 36, color: '#4a4', accent: '#8c8' },
  // Level 7: +6
  { emoji: '\u{1F3B5}', name: 'note',         minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#f4a', accent: '#f8c' },
  { emoji: '\u{1F30E}', name: 'americas',     minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#48f', accent: '#8af' },
  { emoji: '\u{1F4A7}', name: 'droplet',      minW: 18, maxW: 28, minH: 22, maxH: 34, color: '#4af', accent: '#8cf' },
  { emoji: '\u{1F311}', name: 'new_moon',     minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#334', accent: '#556' },
  { emoji: '\u{1F315}', name: 'full_moon',    minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#ee8', accent: '#ffa' },
  { emoji: '\u{1F32C}\uFE0F', name: 'wind',   minW: 30, maxW: 48, minH: 18, maxH: 28, color: '#acd', accent: '#cef' },
  // Level 8: +7
  { emoji: '\u{1F308}', name: 'rainbow',      minW: 35, maxW: 55, minH: 20, maxH: 32, color: '#f48', accent: '#fa8' },
  { emoji: '\u{1F310}', name: 'meridians',    minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#4a8', accent: '#8ca' },
  { emoji: '\u{1F344}', name: 'mushroom',     minW: 22, maxW: 34, minH: 26, maxH: 40, color: '#c44', accent: '#e88' },
  { emoji: '\u2618\uFE0F', name: 'shamrock',  minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F33C}', name: 'daisy',        minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#ff8', accent: '#ffa' },
  { emoji: '\u{1F30F}', name: 'asia',         minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#4a8', accent: '#8ca' },
  { emoji: '\u{1F312}', name: 'waxing',       minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#889', accent: '#aab' },
  // Level 9: +8
  { emoji: '\u{1F3B6}', name: 'notes',        minW: 26, maxW: 40, minH: 22, maxH: 34, color: '#a4f', accent: '#c8f' },
  { emoji: '\u{1F335}', name: 'cactus',       minW: 20, maxW: 30, minH: 30, maxH: 48, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F333}', name: 'tree',         minW: 24, maxW: 38, minH: 32, maxH: 50, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F332}', name: 'evergreen',    minW: 22, maxW: 34, minH: 34, maxH: 52, color: '#284', accent: '#4a6' },
  { emoji: '\u{1F334}', name: 'palm',         minW: 22, maxW: 34, minH: 34, maxH: 52, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F342}', name: 'fallen_leaf',  minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#c84', accent: '#ea8' },
  { emoji: '\u{1F33F}', name: 'herb',         minW: 20, maxW: 30, minH: 22, maxH: 34, color: '#4a4', accent: '#8c8' },
  { emoji: '\u{1F340}', name: 'four_leaf',    minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#4c4', accent: '#8e8' },
  // Level 10: +9
  { emoji: '\u{1F6F8}', name: 'ufo',          minW: 32, maxW: 50, minH: 18, maxH: 28, color: '#8af', accent: '#acf' },
  { emoji: '\u{1FA90}', name: 'ringed_planet', minW: 30, maxW: 46, minH: 26, maxH: 40, color: '#e84', accent: '#fa8' },
  { emoji: '\u{1F320}', name: 'shooting_star', minW: 28, maxW: 44, minH: 20, maxH: 32, color: '#ff8', accent: '#ffa' },
  { emoji: '\u2734\uFE0F', name: 'eight_star', minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#f84', accent: '#fa8' },
  { emoji: '\u{1F316}', name: 'waning',       minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#889', accent: '#aab' },
  { emoji: '\u{1F313}', name: 'first_quarter', minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#aab', accent: '#ccd' },
  { emoji: '\u{1F314}', name: 'waxing_gibbous', minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#cc8', accent: '#eea' },
  { emoji: '\u{1F317}', name: 'last_quarter', minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#889', accent: '#aab' },
  { emoji: '\u{1F318}', name: 'waning_crescent', minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#667', accent: '#889' },
  // Level 11: +10
  { emoji: '\u{1F329}\uFE0F', name: 'cloud_lightning', minW: 32, maxW: 48, minH: 24, maxH: 38, color: '#88a', accent: '#aac' },
  { emoji: '\u{1F327}\uFE0F', name: 'rain',   minW: 30, maxW: 46, minH: 22, maxH: 34, color: '#68a', accent: '#8ac' },
  { emoji: '\u{1F328}\uFE0F', name: 'snow_cloud', minW: 30, maxW: 46, minH: 22, maxH: 34, color: '#acd', accent: '#cef' },
  { emoji: '\u{1F32A}\uFE0F', name: 'tornado', minW: 24, maxW: 36, minH: 30, maxH: 48, color: '#88a', accent: '#aac' },
  { emoji: '\u{1F321}\uFE0F', name: 'thermometer', minW: 16, maxW: 24, minH: 34, maxH: 52, color: '#f44', accent: '#f88' },
  { emoji: '\u{1F339}', name: 'rose',         minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#e44', accent: '#f88' },
  { emoji: '\u{1F33E}', name: 'rice',         minW: 22, maxW: 34, minH: 24, maxH: 38, color: '#cc8', accent: '#eea' },
  { emoji: '\u{1F337}', name: 'tulip',        minW: 20, maxW: 30, minH: 28, maxH: 42, color: '#f48', accent: '#f8a' },
  { emoji: '\u{1F490}', name: 'bouquet',      minW: 28, maxW: 42, minH: 28, maxH: 42, color: '#f8a', accent: '#fac' },
  { emoji: '\u{1F336}\uFE0F', name: 'pepper', minW: 18, maxW: 28, minH: 26, maxH: 40, color: '#e22', accent: '#f44' },
  // Level 12+: +11
  { emoji: '\u{1F30C}', name: 'milky_way',    minW: 34, maxW: 52, minH: 28, maxH: 44, color: '#a8f', accent: '#caf' },
  { emoji: '\u2747\uFE0F', name: 'sparkle',   minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#4af', accent: '#8cf' },
  { emoji: '\u{1F4AB}', name: 'dizzy',        minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#ff8', accent: '#ffa' },
  { emoji: '\u{1F52E}', name: 'crystal_ball', minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#a4f', accent: '#c8f' },
  { emoji: '\u{1F9FF}', name: 'nazar',        minW: 24, maxW: 36, minH: 24, maxH: 36, color: '#48f', accent: '#8af' },
  { emoji: '\u{1F3B2}', name: 'die',          minW: 22, maxW: 34, minH: 22, maxH: 34, color: '#fff', accent: '#ccc' },
  { emoji: '\u{1F3AF}', name: 'bullseye',     minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#f44', accent: '#f88' },
  { emoji: '\u269B\uFE0F', name: 'atom',      minW: 26, maxW: 40, minH: 26, maxH: 40, color: '#4af', accent: '#8cf' },
  { emoji: '\u{1F9EA}', name: 'test_tube',    minW: 16, maxW: 24, minH: 30, maxH: 48, color: '#4a8', accent: '#8ca' },
  { emoji: '\u{1F9EC}', name: 'dna',          minW: 20, maxW: 30, minH: 32, maxH: 50, color: '#48f', accent: '#8af' },
  { emoji: '\u{1F52D}', name: 'telescope',    minW: 24, maxW: 38, minH: 28, maxH: 44, color: '#888', accent: '#aaa' },
];

/**
 * Get available obstacle types for a given level.
 * Level 1: 6 base types
 * Level N: 6 + sum(1..N-1) = 6 + N*(N-1)/2 progressive types
 * @param {number} level - 0-based level index
 * @returns {Array} Available obstacle type definitions
 */
function getObstacleTypesForLevel(level) {
  const types = [...BASE_OBSTACLE_EMOJI];
  // Triangular number: sum(1..level) = level*(level+1)/2
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
  constructor(x, groundY, type, heightClass, screenHeight) {
    this.type = type;
    this.emoji = type.emoji;
    this.typeName = type.name;
    this.color = type.color;
    this.accent = type.accent;
    this.w = type.minW + Math.random() * (type.maxW - type.minW);
    this.h = type.minH + Math.random() * (type.maxH - type.minH);
    this.x = x;
    this.screenHeight = screenHeight || 600;

    // Height class: 'ground', 'mid', 'high', 'sky' (above player, run under)
    this.heightClass = heightClass || 'ground';
    switch (this.heightClass) {
      case 'mid':
        this.y = groundY - this.h - 30 - Math.random() * 30;
        break;
      case 'high':
        this.y = groundY - this.h - 70 - Math.random() * 60;
        break;
      case 'sky':
        // Objects above player head that they run under
        this.y = groundY - this.h - 120 - Math.random() * 80;
        // Clamp so there's always room to jump over (leave top 15% of screen clear)
        this.y = Math.max(this.screenHeight * 0.15, this.y);
        break;
      default:
        this.y = groundY - this.h;
    }

    this.blasted = false;
    this.blastTimer = 0;
    this.particles = [];
    this.phase = Math.random() * Math.PI * 2;
    this.jumpedOver = false;
    this.scored = false;
    this.emojiSize = Math.max(this.w, this.h);
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
        p.vy += 300 * dt;
        p.alpha -= dt * 1.8; // Gentler fade
        p.size *= (1 - dt * 0.5); // Shrink gently
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
        alpha: 0.6, // Start dimmer
        size: 2 + Math.random() * 3,
      });
    }
  }

  isOffScreen() {
    return this.blasted
      ? this.particles.length === 0 && this.blastTimer > 0.6
      : this.x + this.w < -20;
  }

  getBounds() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  render(ctx) {
    if (this.blasted) {
      for (const p of this.particles) {
        ctx.globalAlpha = p.alpha * 0.5; // Significantly reduced brightness
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }

    // Draw emoji
    const fontSize = this.emojiSize * 0.9;
    ctx.save();
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Subtle glow behind emoji
    ctx.globalAlpha = 0.2;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fillText(this.emoji, this.x + this.w / 2, this.y + this.h / 2);
    ctx.shadowBlur = 0;

    // Emoji
    ctx.globalAlpha = 0.9;
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
    this.availableTypes = getObstacleTypesForLevel(0);
  }

  resize(screenWidth, groundY) {
    this.screenWidth = screenWidth;
    this.groundY = groundY;
  }

  setScreenHeight(h) { this.screenHeight = h; }

  setTypeBias(bias) { this.typeBias = bias; }

  setLevel(level) {
    this.level = level;
    this.availableTypes = getObstacleTypesForLevel(level);
    // Reduce spawn interval at higher levels (more obstacles)
    this.spawnInterval = Math.max(0.5, 1.5 - level * 0.07);
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
    // Pick random type from available set
    let typeIdx = Math.floor(Math.random() * this.availableTypes.length);
    // Bias toward track-related types occasionally
    if (Math.random() < 0.3 && this.typeBias < this.availableTypes.length) {
      typeIdx = this.typeBias % this.availableTypes.length;
    }

    const type = this.availableTypes[typeIdx];

    // Height distribution varies by level
    let heightClass = 'ground';
    const r = Math.random();
    if (this.level >= 1 && r < 0.12) {
      heightClass = 'sky'; // Above head, run under (available from level 1)
    } else if (this.level >= 2 && r < 0.15 + this.level * 0.03) {
      heightClass = 'mid';
    } else if (this.level >= 4 && r < 0.08 + this.level * 0.02) {
      heightClass = 'high';
    }

    const obs = new Obstacle(
      this.screenWidth + 20, this.groundY, type, heightClass, this.screenHeight);
    this.obstacles.push(obs);
    this.totalSpawned++;
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

  checkJumpedOver(bounds) {
    let count = 0;
    for (const obs of this.obstacles) {
      if (obs.blasted || obs.jumpedOver) continue;
      const ob = obs.getBounds();
      // Runner has passed the obstacle and is above it
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
  module.exports = { Obstacle, ObstacleManager, BASE_OBSTACLE_EMOJI,
    PROGRESSIVE_OBSTACLE_EMOJI, getObstacleTypesForLevel };
}
