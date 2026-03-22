/**
 * Game Engine for Cosmic Runner V2.
 *
 * Manages the game loop, canvas rendering, physics, collision detection.
 * Supports three rendering modes: game, grid, and player.
 */

/**
 * Game is the main game engine.
 */
class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    /** @type {CanvasRenderingContext2D} */
    this.ctx = canvas.getContext('2d');

    /** @type {number} */
    this.width = 0;
    /** @type {number} */
    this.height = 0;

    /** @type {number} Ground Y position (80% of screen height) */
    this.groundY = 0;

    /** @type {Background} */
    this.background = null;

    /** @type {Runner|null} */
    this.runner = null;

    /** @type {ObstacleManager|null} */
    this.obstacles = null;

    /** @type {number} Base game speed multiplier */
    this.baseSpeed = 1;
    /** @type {number} Current speed multiplier */
    this.speed = 1;
    /** @type {number} Scroll speed in pixels per second */
    this.scrollSpeed = 200;
    /** @type {number} Distance traveled (score) */
    this.distance = 0;
    /** @type {number} Objects blasted count */
    this.blastCount = 0;

    /** @type {boolean} */
    this.running = false;
    /** @type {boolean} */
    this.paused = false;

    /** @type {number} */
    this._lastTime = 0;
    /** @type {number} */
    this._rafId = 0;

    /** @type {string} Current mode: 'game', 'grid', or 'player' */
    this.mode = 'game';

    // Callbacks
    /** @type {Function|null} */
    this.onScoreUpdate = null;
    /** @type {Function|null} */
    this.onBlast = null;
    /** @type {Function|null} */
    this.onEpochChange = null;

    /** @type {number} */
    this._currentEpoch = -1;
    /** @type {Array<Object>} */
    this._musicEvents = [];
    /** @type {number} */
    this._hueOffset = 0;

    /** @type {Array<{x: number, w: number, h: number, color: string}>} */
    this._groundSegments = [];

    this._resize();
    this._initGround();

    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * @private
   */
  _resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.groundY = Math.floor(this.height * 0.78);

    if (this.background) {
      this.background.resize(this.width, this.height);
    }
    if (this.runner) {
      this.runner.setGroundY(this.groundY);
    }
    if (this.obstacles) {
      this.obstacles.resize(this.width, this.groundY);
    }
  }

  /**
   * @private
   */
  _initGround() {
    this._groundSegments = [];
    for (let x = 0; x < 3000; x += 40 + Math.random() * 60) {
      this._groundSegments.push({
        x: x,
        w: 30 + Math.random() * 50,
        h: 3 + Math.random() * 5,
        color: `rgba(${60 + Math.random() * 40}, ${80 + Math.random() * 40}, ${100 + Math.random() * 50}, 0.4)`
      });
    }
  }

  /**
   * Set the display mode.
   * @param {string} mode - 'game', 'grid', or 'player'.
   */
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
        case 'game':
        default:
          this.background.setGridOpacity(0.12);
          this.background.showStars = true;
          break;
      }
    }
  }

  /**
   * Initialize and start.
   */
  start() {
    this.background = new Background(this.width, this.height);
    this.setMode(this.mode);

    if (this.mode === 'game') {
      this.runner = new Runner(this.groundY);
      this.obstacles = new ObstacleManager(this.width, this.groundY);
    }

    this.distance = 0;
    this.blastCount = 0;
    this.speed = this.baseSpeed;
    this.running = true;
    this.paused = false;
    this._lastTime = performance.now();
    this._loop();
  }

  /**
   * Pause the game.
   */
  pause() {
    this.paused = true;
  }

  /**
   * Resume the game.
   */
  resume() {
    if (this.paused) {
      this.paused = false;
      this._lastTime = performance.now();
      this._loop();
    }
  }

  /**
   * Toggle pause state.
   * @returns {boolean}
   */
  togglePause() {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.paused;
  }

  /**
   * Stop the game.
   */
  stop() {
    this.running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  /**
   * Handle jump input (game mode only).
   */
  jump() {
    if (!this.running || this.paused || this.mode !== 'game') return;
    if (this.runner) this.runner.jump();
  }

  /**
   * Feed music events for background visualization.
   * @param {Array<Object>} events
   * @param {number} hueOffset
   */
  setMusicEvents(events, hueOffset) {
    this._musicEvents = events;
    this._hueOffset = hueOffset;
  }

  /**
   * Set the music intensity.
   * @param {number} intensity - 0 to 1.
   */
  setIntensity(intensity) {
    if (this.mode === 'game') {
      this.speed = this.baseSpeed + intensity * 0.8;
      this.scrollSpeed = 180 + intensity * 120;
    } else {
      this.speed = 0.3;
      this.scrollSpeed = 30;
    }
  }

  /**
   * Set the current epoch.
   * @param {number} epochIndex
   * @param {string} epochName
   */
  setEpoch(epochIndex, epochName) {
    if (epochIndex !== this._currentEpoch) {
      this._currentEpoch = epochIndex;
      if (this.runner) this.runner.morph(epochIndex);
      if (this.onEpochChange) {
        this.onEpochChange(epochIndex, epochName);
      }
    }
  }

  /**
   * Set obstacle type bias.
   * @param {number} trackIndex
   */
  setTrackBias(trackIndex) {
    if (this.obstacles) this.obstacles.setTypeBias(trackIndex);
  }

  /**
   * @private
   */
  _loop() {
    if (!this.running || this.paused) return;

    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastTime) / 1000);
    this._lastTime = now;

    this._update(dt);
    this._render();

    this._rafId = requestAnimationFrame(() => this._loop());
  }

  /**
   * @param {number} dt
   * @private
   */
  _update(dt) {
    // Update background
    this.background.updateFromMusic(this._musicEvents, this._hueOffset);
    this.background.update(this.mode === 'game' ? this.speed : 0.3, dt);

    if (this.mode === 'game') {
      // Update runner
      if (this.runner) this.runner.update(dt);

      // Update obstacles
      if (this.obstacles) {
        this.obstacles.update(dt, this.speed, this.scrollSpeed);
      }

      // Update ground segments
      for (const seg of this._groundSegments) {
        seg.x -= this.scrollSpeed * dt;
        if (seg.x + seg.w < 0) {
          seg.x = this.width + Math.random() * 200;
          seg.w = 30 + Math.random() * 50;
        }
      }

      // Check collisions
      if (this.runner && this.obstacles) {
        const hit = this.obstacles.checkCollision(this.runner.getBounds());
        if (hit) {
          hit.blast();
          this.runner.blast();
          this.blastCount++;
          if (this.onBlast) this.onBlast(this.blastCount);
        }
      }

      // Update distance
      this.distance += this.scrollSpeed * dt;
      if (this.onScoreUpdate) {
        this.onScoreUpdate(Math.floor(this.distance / 10));
      }
    }
  }

  /**
   * @private
   */
  _render() {
    const ctx = this.ctx;

    // Background (grid + starfield)
    this.background.render(ctx);

    // Game-specific rendering
    if (this.mode === 'game') {
      // Ground line
      ctx.fillStyle = 'rgba(80, 120, 160, 0.3)';
      ctx.fillRect(0, this.groundY, this.width, 2);

      // Ground segments
      for (const seg of this._groundSegments) {
        ctx.fillStyle = seg.color;
        ctx.fillRect(seg.x, this.groundY + 2, seg.w, seg.h);
      }

      // Ground fade
      const groundGrad = ctx.createLinearGradient(0, this.groundY, 0, this.height);
      groundGrad.addColorStop(0, 'rgba(20, 30, 50, 0.5)');
      groundGrad.addColorStop(1, 'rgba(5, 5, 16, 0.9)');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, this.groundY + 2, this.width, this.height - this.groundY);

      // Obstacles
      if (this.obstacles) this.obstacles.render(ctx);

      // Runner
      if (this.runner) this.runner.render(ctx);
    }
  }

  /**
   * Destroy and clean up.
   */
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game };
}
