/**
 * Background renderer for Cosmic Runner V3.
 *
 * Features:
 * - 64x64 grid with larger cells filling more screen space
 * - Cell cluster rendering for better visual density
 * - Per-track color schemes from TRACK_COLORS
 * - Cell explosion effects (gentle default, none minimal, more flashy)
 * - Star tinting with soft twinkling in non-game modes
 * - 2D and 3D (cubist) grid visualization modes
 * - Configurable star styles with actual symbol rendering
 */

class Background {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.gridSize = GRID_SIZE;

    this.cells = new Float32Array(GRID_CELLS);
    this.cellHues = new Float32Array(GRID_CELLS);
    this.cellSats = new Float32Array(GRID_CELLS);

    /** @type {Float32Array} Cell explosion intensity (0 = none, 1 = max). */
    this.cellExplode = new Float32Array(GRID_CELLS);
    /** @type {Float32Array} Cell explosion hue. */
    this.cellExplodeHue = new Float32Array(GRID_CELLS);

    this.hueOffset = 0;
    this.gridOpacity = 0.12;
    this.showStars = true;
    /** @type {boolean} Whether stars should twinkle softly (non-game modes). */
    this.starsTwinkle = false;

    this.stars = [];
    this.scrollX = 0;
    this.trackIndex = 0;
    this.themeManager = null;
    this.gridDim = '2d';
    this.perspectiveTilt = 0;
    this.cameraAngle = 0;
    this.accessMode = 'normal';

    this._initStars();
  }

  _initStars() {
    const count = 150;
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width * 2,
        y: Math.random() * this.height,
        size: 0.5 + Math.random() * 2,
        speed: 0.1 + Math.random() * 0.5,
        brightness: 0.3 + Math.random() * 0.7,
        depth: Math.random(),
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2,
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

  updateFromMusic(events, hueOffset) {
    // Decay existing cells
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] *= 0.92;
      // Decay explosions
      if (this.cellExplode[i] > 0) {
        this.cellExplode[i] *= 0.88;
        if (this.cellExplode[i] < 0.01) this.cellExplode[i] = 0;
      }
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

      // Trigger cell explosion when note first appears
      if (this.cells[idx] < 0.1 && vel > 0.3) {
        this.cellExplode[idx] = vel;
        this.cellExplodeHue[idx] = (this._instrumentHue(ev.inst) + trackColor.hueBase + hueOffset) % 360;
      }

      this.cells[idx] = Math.min(1, vel);
      this.cellHues[idx] = (this._instrumentHue(ev.inst) + trackColor.hueBase + hueOffset) % 360;
      this.cellSats[idx] = 60 + vel * 40;

      // Adjacent spread (creates cell clusters for better fill)
      const spread = [
        [-1, 0, 0.35], [1, 0, 0.35],
        [0, -1, 0.25], [0, 1, 0.25],
        [-1, -1, 0.12], [1, -1, 0.12], [-1, 1, 0.12], [1, 1, 0.12],
      ];
      for (const [dc, dr, mult] of spread) {
        const nc = col + dc, nr = row + dr;
        if (nc >= 0 && nc < 64 && nr >= 0 && nr < 64) {
          const adj = nr * this.gridSize + nc;
          this.cells[adj] = Math.max(this.cells[adj], vel * mult);
          this.cellHues[adj] = this.cellHues[idx];
          this.cellSats[adj] = this.cellSats[idx];
        }
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

    if (this.starsTwinkle) {
      // Soft twinkling in place for non-game modes
      for (const star of this.stars) {
        star.twinklePhase += star.twinkleSpeed * dt;
      }
    } else {
      // Parallax scrolling for game mode
      for (const star of this.stars) {
        star.x -= star.speed * gameSpeed * 60 * dt;
        if (star.x < -4) {
          star.x = this.width + Math.random() * 100;
          star.y = Math.random() * this.height;
        }
        star.twinklePhase += star.twinkleSpeed * dt;
      }
    }
  }

  render(ctx) {
    const trackColor = TRACK_COLORS[this.trackIndex % TRACK_COLORS.length];

    // Background gradient
    const bg = trackColor.bg;
    ctx.fillStyle = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
    ctx.fillRect(0, 0, this.width, this.height);

    // Stars
    if (this.showStars && ACCESS_MODES[this.accessMode]?.stars !== false) {
      this._renderStars(ctx, trackColor);
    }

    // Grid
    if (this.gridDim === '3d') {
      this._renderGrid3DCubist(ctx);
    } else {
      this._renderGrid2D(ctx);
    }
  }

  _renderStars(ctx, trackColor) {
    const tint = trackColor.starTint;
    const starStyle = this.themeManager?.getStarStyle() || { shape: 'circle' };
    const now = performance.now() / 1000;

    for (const star of this.stars) {
      // Twinkling effect
      const twinkle = this.starsTwinkle
        ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(star.twinklePhase))
        : 1;
      const alpha = star.brightness * 0.6 * twinkle;
      if (alpha < 0.05) continue;

      const r = Math.round(tint[0] * 0.6 + 200 * 0.4);
      const g = Math.round(tint[1] * 0.6 + 220 * 0.4);
      const b = Math.round(tint[2] * 0.6 + 255 * 0.4);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;

      const sz = star.size;
      this._drawStarShape(ctx, star.x, star.y, sz, starStyle.shape);
    }
  }

  _drawStarShape(ctx, x, y, sz, shape) {
    switch (shape) {
      case 'diamond':
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
        ctx.restore();
        break;
      case 'cross':
        ctx.fillRect(x - sz, y - sz * 0.3, sz * 2, sz * 0.6);
        ctx.fillRect(x - sz * 0.3, y - sz, sz * 0.6, sz * 2);
        break;
      case 'square':
        ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(x, y - sz);
        ctx.lineTo(x + sz, y + sz);
        ctx.lineTo(x - sz, y + sz);
        ctx.closePath();
        ctx.fill();
        break;
      case 'ring':
        ctx.beginPath();
        ctx.arc(x, y, sz, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'spark':
        ctx.fillRect(x - sz * 0.15, y - sz, sz * 0.3, sz * 2);
        ctx.fillRect(x - sz, y - sz * 0.15, sz * 2, sz * 0.3);
        break;
      case 'hex':
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(a) * sz;
          const py = y + Math.sin(a) * sz;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'asterisk':
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = ctx.fillStyle;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * sz, y + Math.sin(a) * sz);
          ctx.lineTo(x - Math.cos(a) * sz, y - Math.sin(a) * sz);
          ctx.stroke();
        }
        break;
      case 'crescent':
        ctx.beginPath();
        ctx.arc(x, y, sz, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x + sz * 0.4, y - sz * 0.3, sz * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case 'teardrop':
        ctx.beginPath();
        ctx.moveTo(x, y - sz);
        ctx.quadraticCurveTo(x + sz, y, x, y + sz);
        ctx.quadraticCurveTo(x - sz, y, x, y - sz);
        ctx.fill();
        break;
      case 'flower':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * sz * 0.5, y + Math.sin(a) * sz * 0.5, sz * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'spiral':
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.3) {
          const r = a * sz * 0.08;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        break;
      case 'arrow':
        ctx.beginPath();
        ctx.moveTo(x, y - sz);
        ctx.lineTo(x + sz * 0.6, y);
        ctx.lineTo(x + sz * 0.2, y);
        ctx.lineTo(x + sz * 0.2, y + sz);
        ctx.lineTo(x - sz * 0.2, y + sz);
        ctx.lineTo(x - sz * 0.2, y);
        ctx.lineTo(x - sz * 0.6, y);
        ctx.closePath();
        ctx.fill();
        break;
      case 'wave':
        ctx.beginPath();
        ctx.moveTo(x - sz, y);
        ctx.quadraticCurveTo(x - sz * 0.5, y - sz, x, y);
        ctx.quadraticCurveTo(x + sz * 0.5, y + sz, x + sz, y);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        break;
      case 'bolt':
        ctx.beginPath();
        ctx.moveTo(x + sz * 0.2, y - sz);
        ctx.lineTo(x - sz * 0.3, y - sz * 0.1);
        ctx.lineTo(x + sz * 0.1, y + sz * 0.1);
        ctx.lineTo(x - sz * 0.2, y + sz);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        break;
      default: // circle, dot
        ctx.beginPath();
        ctx.arc(x, y, sz, 0, Math.PI * 2);
        ctx.fill();
    }
  }

  _renderGrid2D(ctx) {
    // Use larger effective cells for better screen fill
    // Group into clusters of 2x2 for visual density
    const clusterSize = 2;
    const effectiveGrid = Math.ceil(this.gridSize / clusterSize);
    const cellW = this.width / effectiveGrid;
    const cellH = this.height / effectiveGrid;
    const glimmer = ACCESS_MODES[this.accessMode]?.glimmer;
    const cellExplodeEnabled = ACCESS_MODES[this.accessMode]?.cellExplode;

    ctx.save();
    ctx.globalAlpha = this.gridOpacity;

    for (let erow = 0; erow < effectiveGrid; erow++) {
      for (let ecol = 0; ecol < effectiveGrid; ecol++) {
        // Aggregate brightness from the cluster
        let maxBrightness = 0;
        let sumHue = 0, sumSat = 0, hueCount = 0;
        let maxExplode = 0, explodeHue = 0;

        for (let dr = 0; dr < clusterSize; dr++) {
          for (let dc = 0; dc < clusterSize; dc++) {
            const row = erow * clusterSize + dr;
            const col = ecol * clusterSize + dc;
            if (row >= this.gridSize || col >= this.gridSize) continue;
            const idx = row * this.gridSize + col;
            const b = this.cells[idx];
            if (b > maxBrightness) maxBrightness = b;
            if (b > 0.01) {
              sumHue += this.cellHues[idx];
              sumSat += this.cellSats[idx];
              hueCount++;
            }
            if (this.cellExplode[idx] > maxExplode) {
              maxExplode = this.cellExplode[idx];
              explodeHue = this.cellExplodeHue[idx];
            }
          }
        }

        if (maxBrightness < 0.01 && maxExplode < 0.01) continue;

        let hue = hueCount > 0 ? sumHue / hueCount : 200;
        let sat = hueCount > 0 ? sumSat / hueCount : 60;
        if (this.themeManager) {
          hue = this.themeManager.shiftHue(hue);
          sat = Math.min(100, sat * (this.themeManager.getTheme().satMult || 1));
        }

        const x = ecol * cellW;
        const y = erow * cellH;

        if (maxBrightness > 0.01) {
          const light = 20 + maxBrightness * 40;
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${maxBrightness})`;
          ctx.fillRect(x, y, cellW - 0.3, cellH - 0.3);

          if (maxBrightness > 0.6) {
            ctx.shadowColor = `hsl(${hue}, ${sat}%, ${light}%)`;
            ctx.shadowBlur = 8;
            ctx.fillRect(x, y, cellW - 0.3, cellH - 0.3);
            ctx.shadowBlur = 0;
          }

          // Glimmer for flashy mode
          if (glimmer && maxBrightness > 0.4) {
            const t = performance.now() / 1000;
            const flicker = 0.5 + 0.5 * Math.sin(t * 8 + erow * 0.5 + ecol * 0.3);
            ctx.globalAlpha = this.gridOpacity * maxBrightness * flicker * 0.3;
            ctx.fillStyle = `hsl(${hue}, 100%, 80%)`;
            ctx.fillRect(x + cellW * 0.15, y + cellH * 0.15, cellW * 0.7, cellH * 0.7);
            ctx.globalAlpha = this.gridOpacity;
          }
        }

        // Cell explosion effect
        if (cellExplodeEnabled && maxExplode > 0.05) {
          const eHue = this.themeManager ? this.themeManager.shiftHue(explodeHue) : explodeHue;
          ctx.save();
          ctx.globalAlpha = this.gridOpacity * maxExplode * 0.4;
          ctx.shadowColor = `hsl(${eHue}, 80%, 60%)`;
          ctx.shadowBlur = maxExplode * 12;
          ctx.fillStyle = `hsla(${eHue}, 80%, 70%, ${maxExplode * 0.3})`;

          // Expanding ring effect
          const expandR = (1 - maxExplode) * cellW * 0.8;
          ctx.beginPath();
          ctx.arc(x + cellW / 2, y + cellH / 2, expandR, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  _renderGrid3DCubist(ctx) {
    // Cubist 3D: cells rendered as isometric cubes
    const clusterSize = 2;
    const effectiveGrid = Math.ceil(this.gridSize / clusterSize);
    const cellW = this.width / effectiveGrid;
    const cellH = this.height / effectiveGrid;
    const tilt = this.perspectiveTilt || 0.3;
    const cellExplodeEnabled = ACCESS_MODES[this.accessMode]?.cellExplode;

    ctx.save();
    ctx.globalAlpha = this.gridOpacity;

    const centerX = this.width / 2;

    for (let erow = 0; erow < effectiveGrid; erow++) {
      const rowNorm = erow / effectiveGrid;
      const depth = 0.3 + rowNorm * 0.7;
      const scaleX = 0.3 + depth * 0.7;
      const yOff = (this.height * 0.5) * (1 - tilt) + erow * cellH * tilt * depth;
      const xOff = centerX * (1 - scaleX);

      for (let ecol = 0; ecol < effectiveGrid; ecol++) {
        // Aggregate brightness from cluster
        let maxBrightness = 0;
        let sumHue = 0, sumSat = 0, hueCount = 0;
        let maxExplode = 0;

        for (let dr = 0; dr < clusterSize; dr++) {
          for (let dc = 0; dc < clusterSize; dc++) {
            const row = erow * clusterSize + dr;
            const col = ecol * clusterSize + dc;
            if (row >= this.gridSize || col >= this.gridSize) continue;
            const idx = row * this.gridSize + col;
            const b = this.cells[idx];
            if (b > maxBrightness) maxBrightness = b;
            if (b > 0.01) { sumHue += this.cellHues[idx]; sumSat += this.cellSats[idx]; hueCount++; }
            if (this.cellExplode[idx] > maxExplode) maxExplode = this.cellExplode[idx];
          }
        }

        if (maxBrightness < 0.01) continue;

        let hue = hueCount > 0 ? sumHue / hueCount : 200;
        let sat = hueCount > 0 ? sumSat / hueCount : 60;
        if (this.themeManager) hue = this.themeManager.shiftHue(hue);
        const light = 20 + maxBrightness * 40;

        const px = xOff + ecol * cellW * scaleX;
        const py = yOff;
        const pw = cellW * scaleX - 0.3;
        const ph = cellH * tilt * depth;
        const elevation = maxBrightness * 20 * depth;

        // Cubist cube: top face
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${maxBrightness * depth})`;
        ctx.fillRect(px, py - elevation, pw, ph);

        // Side face (darker)
        if (elevation > 2) {
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light * 0.6}%, ${maxBrightness * depth * 0.7})`;
          // Left face
          ctx.beginPath();
          ctx.moveTo(px, py - elevation);
          ctx.lineTo(px, py - elevation + ph);
          ctx.lineTo(px - elevation * 0.3, py + ph);
          ctx.lineTo(px - elevation * 0.3, py);
          ctx.fill();
          // Right face
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light * 0.4}%, ${maxBrightness * depth * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(px + pw, py - elevation);
          ctx.lineTo(px + pw, py - elevation + ph);
          ctx.lineTo(px + pw + elevation * 0.3, py + ph);
          ctx.lineTo(px + pw + elevation * 0.3, py);
          ctx.fill();
        }

        // Glow on bright cells
        if (maxBrightness > 0.6) {
          ctx.shadowColor = `hsl(${hue}, ${sat}%, ${light}%)`;
          ctx.shadowBlur = 6 * depth;
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${maxBrightness * depth * 0.3})`;
          ctx.fillRect(px, py - elevation, pw, ph);
          ctx.shadowBlur = 0;
        }

        // Cell explode in 3D
        if (cellExplodeEnabled && maxExplode > 0.05) {
          ctx.save();
          ctx.globalAlpha = this.gridOpacity * maxExplode * 0.3;
          ctx.shadowColor = `hsl(${hue}, 80%, 70%)`;
          ctx.shadowBlur = maxExplode * 10 * depth;
          ctx.fillStyle = `hsla(${hue}, 80%, 70%, ${maxExplode * 0.2})`;
          const er = (1 - maxExplode) * pw * 0.6;
          ctx.beginPath();
          ctx.arc(px + pw / 2, py - elevation + ph / 2, er, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
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
