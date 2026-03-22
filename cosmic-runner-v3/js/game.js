/**
 * Game Engine for Cosmic Runner V3.
 *
 * Manages game loop, canvas rendering, physics, collision detection.
 * Supports three modes (game, grid, player), two-player mode,
 * progressive 3D transition, and accessibility settings.
 */

class Game {
  constructor(canvas, blastCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blastCanvas = blastCanvas;

    this.width = 0;
    this.height = 0;
    this.groundY = 0;

    /** @type {Background} */
    this.background = null;
    /** @type {Renderer3D} */
    this.renderer3d = new Renderer3D();
    /** @type {BlastEffect} */
    this.blastEffect = blastCanvas ? new BlastEffect(blastCanvas) : null;
    /** @type {ThemeManager} */
    this.themeManager = new ThemeManager();

    /** @type {Runner[]} Player runners (1 or 2). */
    this.runners = [];
    /** @type {ObstacleManager|null} */
    this.obstacles = null;

    this.baseSpeed = 1;
    this.speed = 1;
    this.scrollSpeed = 200;
    this.userSpeedMult = 1.0;
    this.totalPoints = 0;
    this.blastCount = 0;

    this.running = false;
    this.paused = false;
    this._lastTime = 0;
    this._rafId = 0;

    /** @type {string} 'game', 'grid', or 'player' */
    this.mode = 'game';

    /** @type {number} Number of players (1 or 2). */
    this.numPlayers = 1;

    /** @type {number} Current level/track (0-based). */
    this.currentLevel = 0;

    /** @type {string} Accessibility mode. */
    this.accessMode = 'normal';

    /** @type {string} Grid dimension: '2d' or '3d'. */
    this.gridDim = '2d';

    // Callbacks
    this.onScoreUpdate = null;
    this.onBlast = null;
    this.onEpochChange = null;

    this._currentEpoch = -1;
    this._musicEvents = [];
    this._hueOffset = 0;
    this._groundSegments = [];

    /** @type {number} Track duration for glow calculations. */
    this.trackDuration = 0;
    /** @type {number} Track progress 0-1. */
    this.trackProgress = 0;

    this._resize();
    this._initGround();

    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  _resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    if (this.blastCanvas) {
      this.blastCanvas.width = this.width;
      this.blastCanvas.height = this.height;
    }
    this.groundY = Math.floor(this.height * 0.78);

    if (this.background) this.background.resize(this.width, this.height);
    for (const r of this.runners) r.setGroundY(this.groundY);
    if (this.obstacles) this.obstacles.resize(this.width, this.groundY);
  }

  _initGround() {
    this._groundSegments = [];
    for (let x = 0; x < 3000; x += 40 + Math.random() * 60) {
      this._groundSegments.push({
        x, w: 30 + Math.random() * 50, h: 3 + Math.random() * 5,
        color: `rgba(${60 + Math.random() * 40}, ${80 + Math.random() * 40}, ${100 + Math.random() * 50}, 0.4)`
      });
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (this.background) {
      switch (mode) {
        case 'grid':
          this.background.setGridOpacity(1.0);
          this.background.showStars = false;
          break;
        case 'player':
          this.background.setGridOpacity(0.08);
          this.background.showStars = true;
          break;
        default:
          this.background.setGridOpacity(0.12);
          this.background.showStars = true;
      }
    }
  }

  setGridDim(dim) {
    this.gridDim = dim;
    if (this.background) this.background.gridDim = dim;
  }

  setAccessMode(mode) {
    this.accessMode = mode;
    if (this.background) this.background.accessMode = mode;
  }

  /**
   * Set up for a new level/track.
   * @param {number} level
   */
  setLevel(level) {
    this.currentLevel = level;
    if (this.obstacles) this.obstacles.setLevel(level);
    this.renderer3d.updateForLevel(level, 0.1);
    for (const r of this.runners) r.setLevel(level);
    if (this.background) this.background.setTrackIndex(level);
  }

  start() {
    this.background = new Background(this.width, this.height);
    this.background.themeManager = this.themeManager;
    this.background.accessMode = this.accessMode;
    this.setMode(this.mode);

    if (this.mode === 'game') {
      this._initRunners();
      this.obstacles = new ObstacleManager(this.width, this.groundY);
      this.obstacles.setLevel(this.currentLevel);
    }

    this.totalPoints = 0;
    this.blastCount = 0;
    this.speed = this.baseSpeed;
    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    this._loop();
  }

  _initRunners() {
    this.runners = [];
    this.runners.push(new Runner(this.groundY, 0));
    this.runners[0].setLevel(this.currentLevel);

    if (this.numPlayers === 2) {
      const r2 = new Runner(this.groundY, 1);
      r2.setLevel(this.currentLevel);
      this.runners.push(r2);
    }
  }

  pause() { this.paused = true; }
  resume() {
    if (this.paused) {
      this.paused = false;
      this._lastTime = performance.now();
      this._loop();
    }
  }
  togglePause() {
    this.paused ? this.resume() : this.pause();
    return this.paused;
  }

  stop() {
    this.running = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
  }

  /**
   * Jump for a specific player.
   * @param {number} [playerIndex=0]
   */
  jump(playerIndex) {
    if (!this.running || this.paused || this.mode !== 'game') return;
    const idx = playerIndex || 0;
    if (this.runners[idx]) this.runners[idx].jump();
  }

  adjustSpeed(delta) {
    this.userSpeedMult = Math.max(SPEED_MIN,
      Math.min(SPEED_MAX, this.userSpeedMult + delta));
  }

  setMusicEvents(events, hueOffset) {
    this._musicEvents = events;
    this._hueOffset = hueOffset;
  }

  setIntensity(intensity) {
    if (this.mode === 'game') {
      this.speed = (this.baseSpeed + intensity * 0.8) * this.userSpeedMult;
      this.scrollSpeed = (180 + intensity * 120) * this.userSpeedMult;
    } else {
      this.speed = 0.3;
      this.scrollSpeed = 30;
    }
  }

  setEpoch(epochIndex, epochName) {
    if (epochIndex !== this._currentEpoch) {
      this._currentEpoch = epochIndex;
      if (this.onEpochChange) this.onEpochChange(epochIndex, epochName);
    }
  }

  setTrackBias(trackIndex) {
    if (this.obstacles) this.obstacles.setTypeBias(trackIndex);
  }

  setTrackProgress(progress, duration) {
    this.trackProgress = progress;
    this.trackDuration = duration;
  }

  _loop() {
    if (!this.running || this.paused) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastTime) / 1000);
    this._lastTime = now;
    this._update(dt);
    this._render();
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _update(dt) {
    this.background.updateFromMusic(this._musicEvents, this._hueOffset);
    this.background.update(this.mode === 'game' ? this.speed : 0.3, dt);

    // Update 3D renderer
    this.renderer3d.updateForLevel(this.currentLevel, dt);

    if (this.mode === 'game') {
      // Update runners
      for (const runner of this.runners) {
        runner.update(dt, this.scrollSpeed, this.trackDuration, this.trackProgress);
      }

      // Update obstacles
      if (this.obstacles) {
        this.obstacles.update(dt, this.speed, this.scrollSpeed);
      }

      // Update ground
      for (const seg of this._groundSegments) {
        seg.x -= this.scrollSpeed * dt;
        if (seg.x + seg.w < 0) {
          seg.x = this.width + Math.random() * 200;
          seg.w = 30 + Math.random() * 50;
        }
      }

      // Check collisions and scoring
      for (const runner of this.runners) {
        if (this.obstacles) {
          // Check jump-overs for scoring
          const jumpedCount = this.obstacles.checkJumpedOver(runner.getBounds());
          if (jumpedCount > 0) {
            runner.jumpOverCount += jumpedCount;
          }

          // Check hits
          const hit = this.obstacles.checkCollision(runner.getBounds());
          if (hit) {
            hit.blast();
            runner.blast();
            this.blastCount++;
            this.totalPoints += SCORE.HIT_OBJECT;

            // Full-screen blast effect
            if (this.blastEffect && ACCESS_MODES[this.accessMode]?.blastZoom) {
              this.blastEffect.trigger(
                runner.x + runner.w / 2,
                runner.y - runner.h / 2,
                hit.color);
            }

            if (this.onBlast) this.onBlast(this.blastCount);
          }
        }
      }

      // Update blast effect
      if (this.blastEffect) this.blastEffect.update(dt);

      // Calculate total points
      let points = this.totalPoints;
      for (const r of this.runners) points += r.points;
      if (this.onScoreUpdate) this.onScoreUpdate(points);

      // Check cooperative glow (if either player has streak > 50%)
      if (this.numPlayers === 2) {
        const anyGlow = this.runners.some(r => r.glowTarget > 0);
        if (anyGlow) {
          for (const r of this.runners) r.glowTarget = 1;
        }
      }
    }
  }

  _render() {
    const ctx = this.ctx;
    const trackColor = TRACK_COLORS[this.currentLevel % TRACK_COLORS.length];

    // Background (grid + stars)
    this.background.render(ctx);

    if (this.mode === 'game') {
      // Ground
      this.renderer3d.renderGround(ctx, this.width, this.height,
        this.groundY, this.background.scrollX, trackColor.primary);

      // Ground segments (2D only)
      if (this.renderer3d.tilt < 0.1) {
        for (const seg of this._groundSegments) {
          ctx.fillStyle = seg.color;
          ctx.fillRect(seg.x, this.groundY + 2, seg.w, seg.h);
        }
      }

      // Obstacles
      if (this.obstacles) {
        if (this.renderer3d.tilt > 0.01) {
          // 3D obstacle rendering
          for (const obs of this.obstacles.obstacles) {
            if (!obs.blasted) {
              const rendered = this.renderer3d.renderObstacle3D(
                ctx, obs, this.width, this.height, this.groundY);
              if (!rendered) obs.render(ctx);
            } else {
              obs.render(ctx);
            }
          }
        } else {
          this.obstacles.render(ctx);
        }
      }

      // Runners
      for (const runner of this.runners) {
        runner.render(ctx);
      }
    }

    // Blast effect overlay
    if (this.blastEffect && this.blastEffect.active) {
      this.blastEffect.render();
    }
  }

  getPlayerNames() {
    return this.runners.map(r => r.name);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game };
}
