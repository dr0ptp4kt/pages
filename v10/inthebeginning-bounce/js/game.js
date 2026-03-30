/**
 * Game Engine for inthebeginning bounce V6.
 *
 * 2D mode: obstacles fly right-to-left across the terrain with rolling hills.
 * 3D mode: obstacles come from top (far) and move toward the player (near).
 * Jump-over detection adapts to mode direction.
 * Obstacles fly past the player in 3D (no piling up at ground level).
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
    this.fallSpeed = 180; // obstacle movement speed (horizontal in 2D, vertical in 3D)
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

    this.game3DDisabled = false;
    this.auto3DTrack = 7; // Auto-switch to 3D at this track index (0-based: track 7 = index 6)

    this.spacetimeYears = 0;

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

    if (prevMode === 'game' && mode !== 'game' && this.blastEffect) {
      this.blastEffect.clear();
    }

    if (this.background) {
      switch (mode) {
        case 'grid':
          this.background.setGridOpacity(1.0);
          this.background.showStars = true;
          this.background.starsTwinkle = true;
          break;
        case 'player':
          this.background.setGridOpacity(0.08);
          this.background.showStars = true;
          this.background.starsTwinkle = true;
          break;
        default:
          this.background.setGridOpacity(0.12);
          this.background.showStars = true;
          this.background.starsTwinkle = false;
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
    // Track that user manually toggled 3D so auto-switch doesn't override
    this._user3DOverride = true;
  }

  setLevel(level) {
    const prevLevel = this.currentLevel;
    this.currentLevel = level;

    // Level transition flash (brief white overlay that fades)
    if (level !== prevLevel && this.canvas) {
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;background:rgba(100,160,255,0.15);pointer-events:none;z-index:999;transition:opacity 0.6s;';
      document.body.appendChild(flash);
      requestAnimationFrame(() => { flash.style.opacity = '0'; });
      setTimeout(() => flash.remove(), 700);
    }

    if (this.obstacles) {
      this.obstacles.setLevel(level);
      this.obstacles.setLaneCount(this.renderer3d.laneCount);
    }
    this.renderer3d.updateForLevel(level, 0.1);

    // Auto-switch 2D/3D based on track: tracks 1-6 default 2D, track 7+ default 3D
    // Only auto-switch if the user hasn't manually disabled 3D
    if (!this._user3DOverride) {
      const shouldBe3D = level >= (this.auto3DTrack - 1);
      this.renderer3d.disabled3D = !shouldBe3D;
    }

    // Sync lane count after level update
    if (this.obstacles) {
      this.obstacles.setLaneCount(this.renderer3d.laneCount);
    }

    for (const r of this.runners) r.setLevel(level);
    if (this.background) this.background.setTrackIndex(level);

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
    this._enforcePlayerSeparation(idx);
  }

  setPlayerPosition(playerIndex, fraction) {
    if (!this.runners[playerIndex]) return;
    this.runners[playerIndex].setPositionFraction(fraction);
    this._enforcePlayerSeparation(playerIndex);
  }

  /**
   * V5: No pushing. Just clamp the moving player so they don't overlap the other.
   * @param {number} movedIdx - Index of the player that just moved.
   */
  _enforcePlayerSeparation(movedIdx) {
    if (this.numPlayers < 2 || this.runners.length < 2) return;
    const p1 = this.runners[0];
    const p2 = this.runners[1];
    const minSep = PLAYER_MIN_SEPARATION;

    if (movedIdx === 0) {
      // P1 moved — clamp P1 so it doesn't get too close to P2
      if (p1.positionFraction > p2.positionFraction - minSep) {
        p1.positionFraction = p2.positionFraction - minSep;
        p1._clampPosition();
        p1.x = p1.positionFraction * p1.screenWidth;
      }
    } else {
      // P2 moved — clamp P2 so it doesn't get too close to P1
      if (p2.positionFraction < p1.positionFraction + minSep) {
        p2.positionFraction = p1.positionFraction + minSep;
        p2._clampPosition();
        p2.x = p2.positionFraction * p2.screenWidth;
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
      // Scale obstacle speed based on level: gentler at early levels, still responsive
      const levelScale = 1.0 + this.currentLevel * 0.04;
      // In 3D mode obstacles need to fly through faster so they don't linger
      const is3D = this.gridDim === '3d';
      const baseFall = is3D ? 220 : 140;
      this.fallSpeed = (baseFall + intensity * 80) * this.userSpeedMult * levelScale;
    } else {
      this.speed = 0.3;
      this.scrollSpeed = 30;
      this.fallSpeed = 30;
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
    try {
      this._update(dt);
      this._render();
    } catch (err) {
      console.error('Game loop error:', err);
    }
    this._rafId = requestAnimationFrame(() => this._loop());
  }

  _update(dt) {
    this.background.updateFromMusic(this._musicEvents, this._hueOffset);
    this.background.update(this.mode === 'game' ? this.speed : 0.3, dt);

    this.renderer3d.updateForLevel(this.currentLevel, dt);
    // Keep obstacle lane count in sync with renderer
    if (this.obstacles) {
      this.obstacles.setLaneCount(this.renderer3d.laneCount);
    }

    if (this.mode === 'game') {
      const trackYears = SPACETIME_SCALE / 12;
      this.spacetimeYears += (this.scrollSpeed * dt / 1000) * trackYears * 0.0001;
      const targetYears = (this.currentLevel + this.trackProgress) / 12 * SPACETIME_SCALE;
      this.spacetimeYears += (targetYears - this.spacetimeYears) * dt * 0.5;

      if (this.onSpacetimeUpdate) {
        this.onSpacetimeUpdate(this.spacetimeYears);
      }
    }

    if (this.mode === 'game') {
      // Sync obstacle mode: horizontal (2D) vs vertical (3D)
      const is2D = this.renderer3d.tilt < 0.1;
      if (this.obstacles) {
        this.obstacles.horizontalMode = is2D;
      }

      for (const runner of this.runners) {
        const terrainGroundY = this.renderer3d.getGroundYAtX(
          runner.x, this.groundY, this.background.scrollX);
        runner.setGroundY(terrainGroundY);
        runner.update(dt, this.scrollSpeed, this.trackDuration, this.trackProgress);
      }

      if (this.obstacles) {
        this.obstacles.update(dt, this.speed, this.fallSpeed);

        if (is2D) {
          // 2D mode: obstacles fly right-to-left, sit on terrain surface
          for (const obs of this.obstacles.obstacles) {
            if (obs.blasted) continue;
            // Place obstacle on the terrain at its current X position
            const terrainGroundY = this.renderer3d.getGroundYAtX(
              obs.x + obs.w / 2, this.groundY, this.background.scrollX);
            obs.y = terrainGroundY - obs.h;
          }
        } else {
          // 3D mode: obstacles fly toward the player and past them.
          // Do NOT clamp to terrain — let them continue moving through
          // and off the bottom of the screen so they don't pile up.
          // The isOffScreen() check in ObstacleManager.update() handles cleanup.
        }
      }

      // Ground segments still scroll horizontally for visual effect
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

        // V5: check jump-overs (obstacle passed below while airborne)
        const jumpedCount = this.obstacles.checkJumpedOver(
          runner.getBounds(), runner.grounded);
        if (jumpedCount > 0) {
          runner.jumpOverCount += jumpedCount;
        }

        const hit = this.obstacles.checkCollision(runner.getBounds());
        if (hit) {
          hit.blast();
          runner.blast();
          this.blastCount++;

          this.totalPoints += SCORE.HIT_OBJECT;
          hit.scored = true;

          if (this.blastEffect && ACCESS_MODES[this.accessMode]?.blastZoom) {
            this.blastEffect.trigger(
              runner.x + runner.w / 2,
              runner.y - runner.h / 2,
              hit.color);
          }

          if (this.onBlast) this.onBlast(this.blastCount);
        }
      }

      if (this.blastEffect) this.blastEffect.update(dt);

      let points = this.totalPoints;
      for (const r of this.runners) points += r.points;
      if (this.onScoreUpdate) this.onScoreUpdate(points);

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

    this.background.render(ctx);

    if (this.mode === 'game') {
      // Apply theme color shift to ground
      const theme = this.themeManager.getTheme();
      const groundColor = trackColor.primary.map((c, i) =>
        Math.min(255, Math.round(c * theme.brightMult + (theme.accent[i] - 128) * 0.15)));
      this.renderer3d.renderGround(ctx, this.width, this.height,
        this.groundY, this.background.scrollX, groundColor);

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

      // Runners (drawn on top of obstacles)
      for (const runner of this.runners) {
        runner.render(ctx);
      }

      this._renderSpacetime(ctx);
    }

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
