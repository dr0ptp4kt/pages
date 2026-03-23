/**
 * Game Engine for Cosmic Runner V3.
 *
 * Features:
 * - Spacetime counter (E notation, Big Bang to present)
 * - True 3D terrain with rolling hills
 * - Player position management with constraints
 * - Scoring: jump over = 3pts, hit = 1pt
 * - Two-player with right-player jump bonus
 * - 3D disable option for game mode
 * - Grid cell explosions
 * - Blast artifact cleanup on mode switch
 */

class Game {
  constructor(canvas, blastCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blastCanvas = blastCanvas;

    this.width = 0;
    this.height = 0;
    this.groundY = 0;

    this.background = null;
    this.renderer3d = new Renderer3D();
    this.blastEffect = blastCanvas ? new BlastEffect(blastCanvas) : null;
    this.themeManager = new ThemeManager();

    this.runners = [];
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

    this.mode = 'game';
    this.numPlayers = 1;
    this.currentLevel = 0;
    this.accessMode = 'normal';
    this.gridDim = '2d';

    /** @type {boolean} Whether 3D is disabled for gameplay (separate from grid 3D). */
    this.game3DDisabled = false;

    // Spacetime counter
    /** @type {number} Current spacetime distance (years after Big Bang). */
    this.spacetimeYears = 0;

    // Callbacks
    this.onScoreUpdate = null;
    this.onBlast = null;
    this.onEpochChange = null;
    this.onSpacetimeUpdate = null;

    this._currentEpoch = -1;
    this._musicEvents = [];
    this._hueOffset = 0;
    this._groundSegments = [];

    this.trackDuration = 0;
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
    for (const r of this.runners) {
      r.setGroundY(this.groundY);
      r.setScreenWidth(this.width);
    }
    if (this.obstacles) {
      this.obstacles.resize(this.width, this.groundY);
      this.obstacles.setScreenHeight(this.height);
    }
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
    const prevMode = this.mode;
    this.mode = mode;

    // Clear blast artifacts when switching away from game mode
    if (prevMode === 'game' && mode !== 'game' && this.blastEffect) {
      this.blastEffect.clear();
    }

    if (this.background) {
      switch (mode) {
        case 'grid':
          this.background.setGridOpacity(1.0);
          this.background.showStars = true;
          this.background.starsTwinkle = true; // Soft twinkling in grid mode
          break;
        case 'player':
          this.background.setGridOpacity(0.08);
          this.background.showStars = true;
          this.background.starsTwinkle = true; // Soft twinkling in player mode
          break;
        default:
          this.background.setGridOpacity(0.12);
          this.background.showStars = true;
          this.background.starsTwinkle = false; // Parallax scrolling in game
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
    if (this.blastEffect) {
      this.blastEffect.setBrightness(ACCESS_MODES[mode]?.blastBrightness || 0.25);
    }
  }

  setGame3DDisabled(disabled) {
    this.game3DDisabled = disabled;
    this.renderer3d.disabled3D = disabled;
  }

  setLevel(level) {
    this.currentLevel = level;
    if (this.obstacles) this.obstacles.setLevel(level);
    this.renderer3d.updateForLevel(level, 0.1);
    for (const r of this.runners) r.setLevel(level);
    if (this.background) this.background.setTrackIndex(level);

    // Reset spacetime for new track
    // Each track represents a cosmic epoch
    const trackFraction = level / 12;
    this.spacetimeYears = trackFraction * SPACETIME_SCALE;
  }

  start() {
    this.background = new Background(this.width, this.height);
    this.background.themeManager = this.themeManager;
    this.background.accessMode = this.accessMode;
    this.setMode(this.mode);

    if (this.mode === 'game') {
      this._initRunners();
      this.obstacles = new ObstacleManager(this.width, this.groundY, this.height);
      this.obstacles.setLevel(this.currentLevel);
    }

    this.totalPoints = 0;
    this.blastCount = 0;
    this.spacetimeYears = 0;
    this.speed = this.baseSpeed;
    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    this._loop();
  }

  _initRunners() {
    this.runners = [];
    this.runners.push(new Runner(this.groundY, 0, this.numPlayers, this.width));
    this.runners[0].setLevel(this.currentLevel);

    if (this.numPlayers === 2) {
      const r2 = new Runner(this.groundY, 1, this.numPlayers, this.width);
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

  jump(playerIndex) {
    if (!this.running || this.paused || this.mode !== 'game') return;
    const idx = playerIndex || 0;
    if (this.runners[idx]) this.runners[idx].jump();
  }

  fastDrop(playerIndex) {
    if (!this.running || this.paused || this.mode !== 'game') return;
    const idx = playerIndex || 0;
    if (this.runners[idx]) this.runners[idx].fastDrop();
  }

  movePlayer(playerIndex, delta) {
    if (!this.running || this.mode !== 'game') return;
    const idx = playerIndex || 0;
    if (!this.runners[idx]) return;
    this.runners[idx].moveHorizontal(delta);
    this._enforcePlayerSeparation();
  }

  setPlayerPosition(playerIndex, fraction) {
    if (!this.runners[playerIndex]) return;
    this.runners[playerIndex].setPositionFraction(fraction);
    this._enforcePlayerSeparation();
  }

  /** Ensure P2 is always to the right of P1 with minimum separation. */
  _enforcePlayerSeparation() {
    if (this.numPlayers < 2 || this.runners.length < 2) return;
    const p1 = this.runners[0];
    const p2 = this.runners[1];
    const minSep = PLAYER_MIN_SEPARATION;

    if (p2.positionFraction < p1.positionFraction + minSep) {
      p2.positionFraction = p1.positionFraction + minSep;
      p2._clampPosition();
      p2.x = p2.positionFraction * p2.screenWidth;
      // If P2 can't move right enough, push P1 left
      if (p2.positionFraction < p1.positionFraction + minSep) {
        p1.positionFraction = p2.positionFraction - minSep;
        p1._clampPosition();
        p1.x = p1.positionFraction * p1.screenWidth;
      }
    }
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

    // Update spacetime counter
    if (this.mode === 'game') {
      // Spacetime increments based on scroll speed and track position
      const trackYears = SPACETIME_SCALE / 12; // years per track
      this.spacetimeYears += (this.scrollSpeed * dt / 1000) * trackYears * 0.0001;
      // Also advance based on track progress
      const targetYears = (this.currentLevel + this.trackProgress) / 12 * SPACETIME_SCALE;
      this.spacetimeYears += (targetYears - this.spacetimeYears) * dt * 0.5;

      if (this.onSpacetimeUpdate) {
        this.onSpacetimeUpdate(this.spacetimeYears);
      }
    }

    if (this.mode === 'game') {
      // Adjust runner ground Y based on terrain
      for (const runner of this.runners) {
        const terrainGroundY = this.renderer3d.getGroundYAtX(
          runner.x, this.groundY, this.background.scrollX);
        runner.setGroundY(terrainGroundY);
        runner.update(dt, this.scrollSpeed, this.trackDuration, this.trackProgress);
      }

      if (this.obstacles) {
        this.obstacles.update(dt, this.speed, this.scrollSpeed);
      }

      // Ground segments
      for (const seg of this._groundSegments) {
        seg.x -= this.scrollSpeed * dt;
        if (seg.x + seg.w < 0) {
          seg.x = this.width + Math.random() * 200;
          seg.w = 30 + Math.random() * 50;
        }
      }

      // Collisions and scoring
      for (let ri = 0; ri < this.runners.length; ri++) {
        const runner = this.runners[ri];
        if (!this.obstacles) continue;

        // Check jump-overs
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

          // Scoring: hit = 1pt, but in 2P if right player jumps same obstacle = 3pts for them
          if (this.numPlayers === 2 && ri === 0 && !hit.scored) {
            // P1 (left) hit it
            this.totalPoints += SCORE.HIT_OBJECT;
            hit.scored = true;
          } else if (this.numPlayers === 2 && ri === 1 && !hit.scored) {
            // P2 (right) hit it
            this.totalPoints += SCORE.HIT_OBJECT;
            hit.scored = true;
          } else {
            this.totalPoints += SCORE.HIT_OBJECT;
          }

          if (this.blastEffect && ACCESS_MODES[this.accessMode]?.blastZoom) {
            this.blastEffect.trigger(
              runner.x + runner.w / 2,
              runner.y - runner.h / 2,
              hit.color);
          }

          if (this.onBlast) this.onBlast(this.blastCount);
        }
      }

      // Update blast effect
      if (this.blastEffect) this.blastEffect.update(dt);

      // Calculate total points
      let points = this.totalPoints;
      for (const r of this.runners) points += r.points;
      if (this.onScoreUpdate) this.onScoreUpdate(points);

      // Cooperative glow
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
          const terrainH = this.renderer3d.getTerrainHeight(
            this.background.scrollX + seg.x);
          ctx.fillRect(seg.x, this.groundY - terrainH + 2, seg.w, seg.h);
        }
      }

      // Obstacles
      if (this.obstacles) {
        if (this.renderer3d.tilt > 0.01) {
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

      // Spacetime counter
      this._renderSpacetime(ctx);
    }

    // Blast effect overlay
    if (this.blastEffect && this.blastEffect.active) {
      this.blastEffect.render();
    }
  }

  _renderSpacetime(ctx) {
    const years = this.spacetimeYears;
    let label;
    if (years < 1000) {
      label = `${years.toFixed(0)} yr`;
    } else if (years < 1e6) {
      label = `${(years / 1e3).toFixed(1)}E3 yr`;
    } else if (years < 1e9) {
      label = `${(years / 1e6).toFixed(2)}E6 yr`;
    } else {
      label = `${(years / 1e9).toFixed(3)}E9 yr`;
    }

    ctx.save();
    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = 'rgba(180, 200, 220, 0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(`Spacetime: ${label}`, this.width - 12, this.height - 55);
    ctx.restore();
  }

  getPlayerNames() {
    return this.runners.map(r => r.name);
  }

  /** Find which runner (if any) is at screen position (for drag). */
  getRunnerAtPosition(sx, sy) {
    for (let i = this.runners.length - 1; i >= 0; i--) {
      if (this.runners[i].hitTest(sx, sy)) return i;
    }
    return -1;
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game };
}
