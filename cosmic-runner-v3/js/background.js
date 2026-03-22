/**
 * Background renderer for Cosmic Runner V3.
 *
 * Features:
 * - 64x64 grid with full-track note coverage
 * - Per-track color schemes from TRACK_COLORS
 * - Star tinting complementary to track colors
 * - Configurable star styles (34 options)
 * - 2D and 3D grid visualization modes
 * - Ground curvature and tilted angles
 */

class Background {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.gridSize = GRID_SIZE;

    this.cells = new Float32Array(GRID_CELLS);
    this.cellHues = new Float32Array(GRID_CELLS);
    this.cellSats = new Float32Array(GRID_CELLS);

    this.hueOffset = 0;
    this.gridOpacity = 0.12;
    this.showStars = true;

    this.stars = [];
    this.scrollX = 0;

    /** @type {number} Current track index for color scheme. */
    this.trackIndex = 0;

    /** @type {ThemeManager|null} */
    this.themeManager = null;

    /** @type {string} Grid dimension mode: '2d' or '3d'. */
    this.gridDim = '2d';

    /** @type {number} 3D perspective tilt (0-1). */
    this.perspectiveTilt = 0;

    /** @type {number} 3D camera rotation (user-controlled). */
    this.cameraAngle = 0;

    /** @type {string} Accessibility mode. */
    this.accessMode = 'normal';

    this._initStars();
  }

  _initStars() {
    const count = 120;
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width * 2,
        y: Math.random() * this.height,
        size: 0.5 + Math.random() * 2,
        speed: 0.1 + Math.random() * 0.5,
        brightness: 0.3 + Math.random() * 0.7,
        depth: Math.random(),
      });
    }
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    for (const star of this.stars) {
      star.y = Math.random() * height;
    }
  }

  /**
   * Update grid cells from music events.
   * @param {Array<Object>} events
   * @param {number} hueOffset
   */
  updateFromMusic(events, hueOffset) {
    // Decay
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] *= 0.92;
    }
    this.hueOffset = hueOffset;

    const trackColor = TRACK_COLORS[this.trackIndex % TRACK_COLORS.length];
    const colorIntensity = ACCESS_MODES[this.accessMode]?.colorIntensity || 1.0;

    for (const ev of events) {
      const note = ev.note || 60;
      const vel = (ev.vel || 0.5) * colorIntensity;
      const ch = ev.ch !== undefined ? ev.ch : 0;

      const row = Math.max(0, Math.min(63, 87 - Math.max(24, Math.min(87, note))));
      const col = (ch * 7 + note) % this.gridSize;
      const idx = row * this.gridSize + col;

      this.cells[idx] = Math.min(1, vel);
      this.cellHues[idx] = (this._instrumentHue(ev.inst) + trackColor.hueBase + hueOffset) % 360;
      this.cellSats[idx] = 60 + vel * 40;

      // Adjacent spread
      if (col > 0) {
        const adj = idx - 1;
        this.cells[adj] = Math.max(this.cells[adj], vel * 0.3);
        this.cellHues[adj] = this.cellHues[idx];
        this.cellSats[adj] = this.cellSats[idx];
      }
      if (col < 63) {
        const adj = idx + 1;
        this.cells[adj] = Math.max(this.cells[adj], vel * 0.3);
        this.cellHues[adj] = this.cellHues[idx];
        this.cellSats[adj] = this.cellSats[idx];
      }
      // Vertical spread
      if (row > 0) {
        const adj = idx - this.gridSize;
        this.cells[adj] = Math.max(this.cells[adj], vel * 0.2);
        this.cellHues[adj] = this.cellHues[idx];
        this.cellSats[adj] = this.cellSats[idx];
      }
      if (row < 63) {
        const adj = idx + this.gridSize;
        this.cells[adj] = Math.max(this.cells[adj], vel * 0.2);
        this.cellHues[adj] = this.cellHues[idx];
        this.cellSats[adj] = this.cellSats[idx];
      }
    }
  }

  _instrumentHue(inst) {
    if (!inst) return 200;
    const n = inst.toLowerCase();
    if (n.includes('violin') || n.includes('cello') || n.includes('string')) return 0;
    if (n.includes('piano') || n.includes('key') || n.includes('organ')) return 220;
    if (n.includes('flute') || n.includes('oboe') || n.includes('wind') || n.includes('trumpet')) return 120;
    if (n.includes('drum') || n.includes('perc') || n.includes('timpani')) return 50;
    if (n.includes('synth') || n.includes('pad')) return 180;
    if (n.includes('guitar') || n.includes('banjo')) return 30;
    if (n.includes('bass')) return 280;
    if (n.includes('choir') || n.includes('voice')) return 320;
    if (n.includes('harp')) return 260;
    if (n.includes('celesta')) return 300;
    return 200;
  }

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

  render(ctx) {
    const trackColor = TRACK_COLORS[this.trackIndex % TRACK_COLORS.length];

    // Background gradient tinted by track
    const bg = trackColor.bg;
    ctx.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
    ctx.fillRect(0, 0, this.width, this.height);

    // Stars
    if (this.showStars && ACCESS_MODES[this.accessMode]?.stars !== false) {
      this._renderStars(ctx, trackColor);
    }

    // Grid
    if (this.gridDim === '3d') {
      this._renderGrid3D(ctx);
    } else {
      this._renderGrid2D(ctx);
    }
  }

  _renderStars(ctx, trackColor) {
    const tint = trackColor.starTint;
    const starStyle = this.themeManager?.getStarStyle() || { shape: 'circle' };

    for (const star of this.stars) {
      const alpha = star.brightness * 0.6;
      const r = Math.round(tint[0] * 0.6 + 200 * 0.4);
      const g = Math.round(tint[1] * 0.6 + 220 * 0.4);
      const b = Math.round(tint[2] * 0.6 + 255 * 0.4);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

      const sz = star.size;
      switch (starStyle.shape) {
        case 'diamond':
          ctx.save();
          ctx.translate(star.x, star.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
          ctx.restore();
          break;
        case 'cross':
          ctx.fillRect(star.x - sz, star.y - sz * 0.3, sz * 2, sz * 0.6);
          ctx.fillRect(star.x - sz * 0.3, star.y - sz, sz * 0.6, sz * 2);
          break;
        case 'square':
          ctx.fillRect(star.x - sz, star.y - sz, sz * 2, sz * 2);
          break;
        case 'triangle':
          ctx.beginPath();
          ctx.moveTo(star.x, star.y - sz);
          ctx.lineTo(star.x + sz, star.y + sz);
          ctx.lineTo(star.x - sz, star.y + sz);
          ctx.closePath();
          ctx.fill();
          break;
        default: // circle, dot, etc.
          ctx.beginPath();
          ctx.arc(star.x, star.y, sz, 0, Math.PI * 2);
          ctx.fill();
      }
    }
  }

  _renderGrid2D(ctx) {
    const cellW = this.width / this.gridSize;
    const cellH = this.height / this.gridSize;
    const glimmer = ACCESS_MODES[this.accessMode]?.glimmer;

    ctx.save();
    ctx.globalAlpha = this.gridOpacity;

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const idx = row * this.gridSize + col;
        const brightness = this.cells[idx];
        if (brightness < 0.01) continue;

        let hue = this.cellHues[idx];
        let sat = this.cellSats[idx];
        if (this.themeManager) {
          hue = this.themeManager.shiftHue(hue);
          sat = Math.min(100, sat * (this.themeManager.getTheme().satMult || 1));
        }
        const light = 20 + brightness * 40;

        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${brightness})`;
        ctx.fillRect(col * cellW, row * cellH, cellW - 0.5, cellH - 0.5);

        if (brightness > 0.6) {
          ctx.shadowColor = `hsl(${hue}, ${sat}%, ${light}%)`;
          ctx.shadowBlur = 8;
          ctx.fillRect(col * cellW, row * cellH, cellW - 0.5, cellH - 0.5);
          ctx.shadowBlur = 0;
        }

        // Glimmer effect for flashy mode
        if (glimmer && brightness > 0.4) {
          const t = performance.now() / 1000;
          const flicker = 0.5 + 0.5 * Math.sin(t * 8 + row * 0.5 + col * 0.3);
          ctx.globalAlpha = this.gridOpacity * brightness * flicker * 0.3;
          ctx.fillStyle = `hsl(${hue}, 100%, 80%)`;
          ctx.fillRect(col * cellW + cellW * 0.2, row * cellH + cellH * 0.2,
            cellW * 0.6, cellH * 0.6);
          ctx.globalAlpha = this.gridOpacity;
        }
      }
    }
    ctx.restore();
  }

  _renderGrid3D(ctx) {
    const cellW = this.width / this.gridSize;
    const cellH = this.height / this.gridSize;

    ctx.save();
    ctx.globalAlpha = this.gridOpacity;

    // 3D perspective transform
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const tilt = this.perspectiveTilt || 0.3;
    const angle = this.cameraAngle;

    for (let row = 0; row < this.gridSize; row++) {
      // Perspective scaling: rows farther from center are smaller
      const rowNorm = row / this.gridSize;
      const depth = 0.3 + rowNorm * 0.7;
      const scaleX = 0.3 + depth * 0.7;
      const yOff = centerY * (1 - tilt) + row * cellH * tilt * depth;
      const xOff = centerX * (1 - scaleX);

      for (let col = 0; col < this.gridSize; col++) {
        const idx = row * this.gridSize + col;
        const brightness = this.cells[idx];
        if (brightness < 0.01) continue;

        let hue = this.cellHues[idx];
        let sat = this.cellSats[idx];
        if (this.themeManager) {
          hue = this.themeManager.shiftHue(hue);
        }
        const light = 20 + brightness * 40;

        const px = xOff + col * cellW * scaleX;
        const py = yOff;
        const pw = cellW * scaleX - 0.5;
        const ph = cellH * tilt * depth;

        // Height (brightness = elevation in 3D)
        const elevation = brightness * 15 * depth;

        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${brightness * depth})`;
        ctx.fillRect(px, py - elevation, pw, ph);

        if (brightness > 0.6) {
          ctx.shadowColor = `hsl(${hue}, ${sat}%, ${light}%)`;
          ctx.shadowBlur = 6 * depth;
          ctx.fillRect(px, py - elevation, pw, ph);
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.restore();
  }

  setGridOpacity(opacity) {
    this.gridOpacity = Math.max(0, Math.min(1, opacity));
  }

  setTrackIndex(idx) {
    this.trackIndex = idx;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Background };
}
