/**
 * Background renderer for Cosmic Runner.
 *
 * Draws a muted 64x64 grid visualization in the background,
 * plus a parallax starfield. The grid reacts to music note events
 * but is rendered at low opacity so it doesn't overwhelm the
 * foreground game elements.
 */

/**
 * Background manages the starfield and muted grid layers.
 */
class Background {
  /**
   * @param {number} width - Canvas width.
   * @param {number} height - Canvas height.
   */
  constructor(width, height) {
    /** @type {number} */
    this.width = width;
    /** @type {number} */
    this.height = height;

    /** @type {number} Grid size (64x64) */
    this.gridSize = 64;

    /** @type {Float32Array} Cell brightness values (0-1) */
    this.cells = new Float32Array(this.gridSize * this.gridSize);

    /** @type {Float32Array} Cell hue values (0-360) */
    this.cellHues = new Float32Array(this.gridSize * this.gridSize);

    /** @type {Float32Array} Cell saturation values (0-100) */
    this.cellSats = new Float32Array(this.gridSize * this.gridSize);

    /** @type {number} Global hue offset for color shifts */
    this.hueOffset = 0;

    /** @type {number} Grid opacity (0-1), kept very low for muted effect */
    this.gridOpacity = 0.12;

    /** @type {Array<{x: number, y: number, size: number, speed: number, brightness: number}>} */
    this.stars = [];

    /** @type {number} Scroll offset for parallax */
    this.scrollX = 0;

    this._initStars();
  }

  /**
   * Initialize the starfield with random positions.
   * @private
   */
  _initStars() {
    const count = 120;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width * 2,
        y: Math.random() * this.height,
        size: 0.5 + Math.random() * 2,
        speed: 0.1 + Math.random() * 0.5,
        brightness: 0.3 + Math.random() * 0.7
      });
    }
  }

  /**
   * Resize the background to match new canvas dimensions.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
    // Redistribute stars for new dimensions
    for (const star of this.stars) {
      star.y = Math.random() * height;
    }
  }

  /**
   * Update grid cells from music note events.
   * Events are in the same format as the visualizer:
   * {note, inst, vel, ch}
   * @param {Array<Object>} events - Active note events.
   * @param {number} hueOffset - Current hue offset from music sync.
   */
  updateFromMusic(events, hueOffset) {
    // Decay existing cells
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] *= 0.92;
    }

    this.hueOffset = hueOffset;

    // Map events to grid cells
    for (const ev of events) {
      const note = ev.note || 60;
      const vel = ev.vel || 0.5;
      const ch = ev.ch !== undefined ? ev.ch : 0;

      // Row: pitch mapping (MIDI 24-87 -> rows 0-63)
      const row = Math.max(0, Math.min(63, 87 - Math.max(24, Math.min(87, note))));
      // Column: channel-based
      const col = ch % this.gridSize;
      const idx = row * this.gridSize + col;

      this.cells[idx] = Math.min(1, vel);
      this.cellHues[idx] = (this._instrumentHue(ev.inst) + hueOffset) % 360;
      this.cellSats[idx] = 60 + vel * 40;
    }
  }

  /**
   * Get a base hue for an instrument name.
   * @param {string} inst
   * @returns {number} Hue in degrees.
   * @private
   */
  _instrumentHue(inst) {
    if (!inst) return 200;
    const name = inst.toLowerCase();
    if (name.includes('violin') || name.includes('cello') || name.includes('string')) return 0;
    if (name.includes('piano') || name.includes('key') || name.includes('organ')) return 220;
    if (name.includes('flute') || name.includes('oboe') || name.includes('wind') || name.includes('trumpet')) return 120;
    if (name.includes('drum') || name.includes('perc') || name.includes('timpani')) return 50;
    if (name.includes('synth') || name.includes('pad')) return 180;
    return 200;
  }

  /**
   * Update starfield scroll position.
   * @param {number} gameSpeed - Current game speed multiplier.
   * @param {number} dt - Delta time in seconds.
   */
  update(gameSpeed, dt) {
    this.scrollX += gameSpeed * 30 * dt;

    for (const star of this.stars) {
      star.x -= star.speed * gameSpeed * 60 * dt;
      if (star.x < -4) {
        star.x = this.width + Math.random() * 100;
        star.y = Math.random() * this.height;
      }
    }
  }

  /**
   * Render the background layers to a canvas context.
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    // 1. Deep space background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Starfield
    for (const star of this.stars) {
      const alpha = star.brightness * 0.6;
      ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Muted 64x64 grid
    this._renderGrid(ctx);
  }

  /**
   * Render the muted grid overlay.
   * @param {CanvasRenderingContext2D} ctx
   * @private
   */
  _renderGrid(ctx) {
    const cellW = this.width / this.gridSize;
    const cellH = this.height / this.gridSize;

    ctx.save();
    ctx.globalAlpha = this.gridOpacity;

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const idx = row * this.gridSize + col;
        const brightness = this.cells[idx];
        if (brightness < 0.01) continue;

        const hue = this.cellHues[idx];
        const sat = this.cellSats[idx];
        const light = 20 + brightness * 40;

        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${brightness})`;
        ctx.fillRect(col * cellW, row * cellH, cellW - 0.5, cellH - 0.5);

        // Subtle glow for bright cells
        if (brightness > 0.6) {
          ctx.shadowColor = `hsl(${hue}, ${sat}%, ${light}%)`;
          ctx.shadowBlur = 8;
          ctx.fillRect(col * cellW, row * cellH, cellW - 0.5, cellH - 0.5);
          ctx.shadowBlur = 0;
        }
      }
    }

    ctx.restore();
  }

  /**
   * Set the grid opacity level.
   * @param {number} opacity - 0 to 1, default 0.12.
   */
  setGridOpacity(opacity) {
    this.gridOpacity = Math.max(0, Math.min(1, opacity));
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Background };
}
