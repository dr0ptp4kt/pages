/**
 * 3D Perspective Renderer for Cosmic Runner V3.
 *
 * True 3D surface with rolling hills and valleys.
 * Players run ON the 3D surface. Objects positioned in 3D space.
 * Progressive transition from 2D to 3D as levels advance.
 *
 * Level 1: Pure 2D flat road
 * Level 2: Slight curvature introduced
 * Level 3-4: Hills and valleys begin, slight tilt
 * Level 5: Notable 3D depth, rolling terrain
 * Level 6+: Full 3D behind-runner perspective with terrain
 */

class Renderer3D {
  constructor() {
    this.tilt = 0;
    this.targetTilt = 0;
    this.curvature = 0;
    this.targetCurvature = 0;
    this.fovScale = 1;
    this.vanishY = 0.35;
    this.scrollOffset = 0;

    /** @type {boolean} Whether 3D is disabled by user setting. */
    this.disabled3D = false;

    /** @type {Array<{amplitude: number, frequency: number, phase: number}>} Hill definitions. */
    this.hills = [];
    this._initHills();

    /** @type {number} Road curvature oscillation phase. */
    this.roadCurvePhase = 0;

    /** @type {number} Terrain complexity (0-1, increases with level). */
    this.terrainComplexity = 0;
  }

  _initHills() {
    // Multiple sine waves create varied terrain
    this.hills = [
      { amplitude: 0, frequency: 0.003, phase: 0 },
      { amplitude: 0, frequency: 0.007, phase: 1.5 },
      { amplitude: 0, frequency: 0.012, phase: 3.1 },
      { amplitude: 0, frequency: 0.002, phase: 0.7 },
    ];
  }

  updateForLevel(level, dt) {
    if (this.disabled3D) {
      this.targetTilt = 0;
      this.targetCurvature = 0;
      this.terrainComplexity = 0;
      for (const h of this.hills) h.amplitude = 0;
    } else if (level < 1) {
      // Level 1: flat
      this.targetTilt = 0;
      this.targetCurvature = 0;
      this.terrainComplexity = 0;
      for (const h of this.hills) h.amplitude = 0;
    } else if (level < 2) {
      // Level 2: slight road curvature, no tilt
      this.targetTilt = 0;
      this.targetCurvature = 0.15;
      this.terrainComplexity = 0.1;
      this.hills[0].amplitude = 8;
    } else if (level < FULL_3D_LEVEL) {
      const progress = (level - 2) / (FULL_3D_LEVEL - 2);
      this.targetTilt = progress * 0.7;
      this.targetCurvature = 0.15 + progress * 0.4;
      this.terrainComplexity = 0.1 + progress * 0.6;
      this.hills[0].amplitude = 8 + progress * 25;
      this.hills[1].amplitude = progress * 15;
      this.hills[2].amplitude = progress * 8;
      this.hills[3].amplitude = progress * 20;
    } else {
      this.targetTilt = 0.7;
      this.targetCurvature = 0.55;
      this.terrainComplexity = 0.7;
      this.hills[0].amplitude = 33;
      this.hills[1].amplitude = 15;
      this.hills[2].amplitude = 8;
      this.hills[3].amplitude = 20;
    }

    // Smooth transitions
    this.tilt += (this.targetTilt - this.tilt) * 2 * dt;
    this.curvature += (this.targetCurvature - this.curvature) * 2 * dt;
    this.roadCurvePhase += dt * 0.5;
  }

  /**
   * Get terrain height at a given world X position.
   * @param {number} worldX - Horizontal position in world space.
   * @returns {number} Height offset (positive = hill, negative = valley).
   */
  getTerrainHeight(worldX) {
    if (this.terrainComplexity < 0.01) return 0;
    let height = 0;
    for (const hill of this.hills) {
      if (hill.amplitude > 0) {
        height += Math.sin(worldX * hill.frequency + hill.phase + this.scrollOffset * hill.frequency) * hill.amplitude;
      }
    }
    return height * this.terrainComplexity;
  }

  /**
   * Get road horizontal curve offset at a given depth.
   * @param {number} depth - 0 = near, 1 = far.
   * @returns {number} Horizontal offset in pixels.
   */
  getRoadCurve(depth) {
    if (this.curvature < 0.01) return 0;
    return Math.sin(depth * Math.PI * 2 + this.roadCurvePhase) * this.curvature * 60 * depth;
  }

  /**
   * Render the ground plane with hills, valleys, and curvature.
   */
  renderGround(ctx, screenW, screenH, groundY, scrollX, trackColor) {
    this.scrollOffset = scrollX;

    if (this.tilt < 0.01) {
      this._render2DGround(ctx, screenW, screenH, groundY, scrollX, trackColor);
      return;
    }

    // 3D ground with terrain
    const vanishY = screenH * this.vanishY;
    const strips = 50;

    for (let i = 0; i < strips; i++) {
      const t = i / strips;
      const nextT = (i + 1) / strips;

      // Perspective-correct depth
      const depth = t * t;
      const nextDepth = nextT * nextT;

      let y = vanishY + (groundY - vanishY) * depth;
      let nextY = vanishY + (groundY - vanishY) * nextDepth;

      // Add terrain height
      const terrainH = this.getTerrainHeight(scrollX + (1 - t) * 2000);
      const nextTerrainH = this.getTerrainHeight(scrollX + (1 - nextT) * 2000);
      y -= terrainH * depth * this.tilt;
      nextY -= nextTerrainH * nextDepth * this.tilt;

      const h = nextY - y;
      const scale = depth;
      const halfW = screenW * 0.5 * (0.3 + scale * 0.7);

      // Road curve
      const curveX = this.getRoadCurve(t);
      const nextCurveX = this.getRoadCurve(nextT);

      const alpha = 0.1 + scale * 0.3;
      const r = trackColor[0] * 0.3;
      const g = trackColor[1] * 0.3;
      const b = trackColor[2] * 0.3;

      // Road surface
      ctx.fillStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(screenW / 2 - halfW + curveX, y);
      ctx.lineTo(screenW / 2 + halfW + curveX, y);
      const nextHalfW = screenW * 0.5 * (0.3 + nextDepth * 0.7);
      ctx.lineTo(screenW / 2 + nextHalfW + nextCurveX, nextY);
      ctx.lineTo(screenW / 2 - nextHalfW + nextCurveX, nextY);
      ctx.fill();

      // Grid lines for depth perception
      if (i % 3 === 0 && scale > 0.05) {
        ctx.strokeStyle = `rgba(${Math.round(r + 40)}, ${Math.round(g + 40)}, ${Math.round(b + 40)}, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenW / 2 - halfW + curveX, y);
        ctx.lineTo(screenW / 2 + halfW + curveX, y);
        ctx.stroke();
      }
    }

    // Road edge lines
    ctx.strokeStyle = `rgba(${trackColor[0]}, ${trackColor[1]}, ${trackColor[2]}, 0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= strips; i++) {
      const t = i / strips;
      const depth = t * t;
      const y = vanishY + (groundY - vanishY) * depth;
      const terrainH = this.getTerrainHeight(scrollX + (1 - t) * 2000);
      const adjustedY = y - terrainH * depth * this.tilt;
      const halfW = screenW * 0.5 * (0.3 + depth * 0.7);
      const curveX = this.getRoadCurve(t);
      if (i === 0) {
        ctx.moveTo(screenW / 2 - halfW + curveX, adjustedY);
      } else {
        ctx.lineTo(screenW / 2 - halfW + curveX, adjustedY);
      }
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= strips; i++) {
      const t = i / strips;
      const depth = t * t;
      const y = vanishY + (groundY - vanishY) * depth;
      const terrainH = this.getTerrainHeight(scrollX + (1 - t) * 2000);
      const adjustedY = y - terrainH * depth * this.tilt;
      const halfW = screenW * 0.5 * (0.3 + depth * 0.7);
      const curveX = this.getRoadCurve(t);
      if (i === 0) {
        ctx.moveTo(screenW / 2 + halfW + curveX, adjustedY);
      } else {
        ctx.lineTo(screenW / 2 + halfW + curveX, adjustedY);
      }
    }
    ctx.stroke();
  }

  _render2DGround(ctx, screenW, screenH, groundY, scrollX, trackColor) {
    // Ground line with terrain height
    ctx.strokeStyle = `rgba(${Math.round(trackColor[0] * 0.5)}, ${Math.round(trackColor[1] * 0.5)}, ${Math.round(trackColor[2] * 0.5)}, 0.4)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < screenW; x += 3) {
      const terrainH = this.getTerrainHeight(scrollX + x);
      const y = groundY - terrainH;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Road curvature overlay
    if (this.curvature > 0.01) {
      ctx.strokeStyle = `rgba(${Math.round(trackColor[0] * 0.4)}, ${Math.round(trackColor[1] * 0.4)}, ${Math.round(trackColor[2] * 0.4)}, 0.15)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < screenW; x += 4) {
        const curveY = Math.sin((x + scrollX) * 0.004 + this.roadCurvePhase) * this.curvature * 15;
        const terrainH = this.getTerrainHeight(scrollX + x);
        if (x === 0) ctx.moveTo(x, groundY + curveY - terrainH);
        else ctx.lineTo(x, groundY + curveY - terrainH);
      }
      ctx.stroke();
    }

    // Ground fade below
    const grad = ctx.createLinearGradient(0, groundY, 0, screenH);
    grad.addColorStop(0, `rgba(${Math.round(trackColor[0] * 0.15)}, ${Math.round(trackColor[1] * 0.15)}, ${Math.round(trackColor[2] * 0.15)}, 0.5)`);
    grad.addColorStop(1, 'rgba(5, 5, 16, 0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, groundY + 2, screenW, screenH - groundY);
  }

  /**
   * Transform obstacle for 3D rendering.
   * Objects are positioned ON the road in 3D space.
   */
  renderObstacle3D(ctx, obstacle, screenW, screenH, groundY) {
    if (this.tilt < 0.01) return false;

    // Map obstacle's game X to depth in 3D space
    const depthNorm = obstacle.x / screenW;
    if (depthNorm < 0 || depthNorm > 1.5) return false;

    const depth = depthNorm * depthNorm;
    const vanishY = screenH * this.vanishY;

    // Position on the 3D road
    let roadY = vanishY + (groundY - vanishY) * depth;
    const terrainH = this.getTerrainHeight(this.scrollOffset + obstacle.x);
    roadY -= terrainH * depth * this.tilt;

    const scale = Math.max(0.15, 0.3 + depth * 0.7);
    const halfW = screenW * 0.5 * (0.3 + depth * 0.7);
    const curveX = this.getRoadCurve(depthNorm);

    // Obstacle screen position
    const obsHeight = obstacle.h * scale;
    const obsWidth = obstacle.w * scale;
    const centerX = screenW / 2 + curveX + (obstacle.x - screenW / 2) * scale * 0.3;

    // Height offset for non-ground obstacles
    let heightOff = 0;
    if (obstacle.heightClass === 'mid') heightOff = 30 * scale;
    else if (obstacle.heightClass === 'high') heightOff = 60 * scale;
    else if (obstacle.heightClass === 'sky') heightOff = 100 * scale;

    if (scale < 0.15) return true; // Too far, skip

    // Draw emoji at 3D position
    ctx.save();
    ctx.globalAlpha = 0.3 + scale * 0.6;
    const fontSize = obstacle.emojiSize * scale * 0.9;
    ctx.font = `${Math.max(8, fontSize)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obstacle.emoji, centerX, roadY - obsHeight / 2 - heightOff);
    ctx.restore();

    return true;
  }

  /**
   * Get the ground Y position at a given screen X, accounting for terrain.
   * Used to position runners on the terrain.
   */
  getGroundYAtX(screenX, baseGroundY, scrollX) {
    const terrainH = this.getTerrainHeight(scrollX + screenX);
    return baseGroundY - terrainH;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Renderer3D };
}
