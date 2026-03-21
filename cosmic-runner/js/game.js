/**
 * Game Engine for Cosmic Runner.
 *
 * Manages the game loop, canvas rendering, physics, collision detection,
 * and overall game state. Coordinates Background, Runner, and ObstacleManager.
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

    /** @type {Runner} */
    this.runner = null;

    /** @type {ObstacleManager} */
    this.obstacles = null;

    /** @type {number} Base game speed multiplier */
    this.baseSpeed = 1;

    /** @type {number} Current speed multiplier (increases with music intensity) */
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

    /** @type {number} Last frame timestamp */
    this._lastTime = 0;

    /** @type {number} Animation frame ID */
    this._rafId = 0;

    /** @type {Function|null} Callback for score updates */
    this.onScoreUpdate = null;

    /** @type {Function|null} Callback for blast events */
    this.onBlast = null;

    /** @type {Function|null} Callback for epoch changes */
    this.onEpochChange = null;

    /** @type {number} Current epoch index */
    this._currentEpoch = -1;

    /** @type {Array<Object>} Current music events for background */
    this._musicEvents = [];

    /** @type {number} Current hue offset */
    this._hueOffset = 0;

    // Ground platform segments for visual variety
    /** @type {Array<{x: number, w: number, h: number, color: string}>} */
    this._groundSegments = [];

    this._resize();
    this._initGround();

    // Handle window resize
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  /**
   * Resize canvas and game objects to match window.
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
   * Initialize ground platform visual segments.
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
   * Initialize and start the game.
   */
  start() {
    this.background = new Background(this.width, this.height);
    this.runner = new Runner(this.groundY);
    this.obstacles = new ObstacleManager(this.width, this.groundY);
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
   * @returns {boolean} New paused state.
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
   * Handle jump input.
   */
  jump() {
    if (!this.running || this.paused) return;
    this.runner.jump();
  }

  /**
   * Feed music events to the game for background visualization.
   * @param {Array<Object>} events - Note events from MusicSync.
   * @param {number} hueOffset - Current hue offset.
   */
  setMusicEvents(events, hueOffset) {
    this._musicEvents = events;
    this._hueOffset = hueOffset;
  }

  /**
   * Set the music intensity (affects game speed).
   * @param {number} intensity - 0 to 1.
   */
  setIntensity(intensity) {
    this.speed = this.baseSpeed + intensity * 0.8;
    this.scrollSpeed = 180 + intensity * 120;
  }

  /**
   * Set the current epoch (triggers character morph).
   * @param {number} epochIndex
   * @param {string} epochName
   */
  setEpoch(epochIndex, epochName) {
    if (epochIndex !== this._currentEpoch) {
      this._currentEpoch = epochIndex;
      this.runner.morph(epochIndex);
      if (this.onEpochChange) {
        this.onEpochChange(epochIndex, epochName);
      }
    }
  }

  /**
   * Set obstacle type bias based on current track.
   * @param {number} trackIndex
   */
  setTrackBias(trackIndex) {
    this.obstacles.setTypeBias(trackIndex);
  }

  /**
   * Main game loop.
   * @private
   */
  _loop() {
    if (!this.running || this.paused) return;

    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastTime) / 1000); // Cap at 50ms
    this._lastTime = now;

    this._update(dt);
    this._render();

    this._rafId = requestAnimationFrame(() => this._loop());
  }

  /**
   * Update game state.
   * @param {number} dt - Delta time in seconds.
   * @private
   */
  _update(dt) {
    // Update background
    this.background.updateFromMusic(this._musicEvents, this._hueOffset);
    this.background.update(this.speed, dt);

    // Update runner
    this.runner.update(dt);

    // Update obstacles
    this.obstacles.update(dt, this.speed, this.scrollSpeed);

    // Update ground segments (scroll)
    for (const seg of this._groundSegments) {
      seg.x -= this.scrollSpeed * dt;
      if (seg.x + seg.w < 0) {
        seg.x = this.width + Math.random() * 200;
        seg.w = 30 + Math.random() * 50;
      }
    }

    // Check collisions
    const hit = this.obstacles.checkCollision(this.runner.getBounds());
    if (hit) {
      hit.blast();
      this.runner.blast();
      this.blastCount++;
      if (this.onBlast) {
        this.onBlast(this.blastCount);
      }
    }

    // Update distance
    this.distance += this.scrollSpeed * dt;
    if (this.onScoreUpdate) {
      this.onScoreUpdate(Math.floor(this.distance / 10));
    }
  }

  /**
   * Render the game frame.
   * @private
   */
  _render() {
    const ctx = this.ctx;

    // Background (muted grid + starfield)
    this.background.render(ctx);

    // Ground line
    ctx.fillStyle = 'rgba(80, 120, 160, 0.3)';
    ctx.fillRect(0, this.groundY, this.width, 2);

    // Ground segments (subtle terrain)
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
    this.obstacles.render(ctx);

    // Runner
    this.runner.render(ctx);
  }

  /**
   * Destroy the game and clean up resources.
   */
  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resizeHandler);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game };
}
