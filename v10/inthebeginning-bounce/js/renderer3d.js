/**
 * 3D Perspective Renderer for inthebeginning bounce.
 *
 * V5 change: obstacles come from the top (far away) and move toward the player
 * (bottom/near). In 3D mode, the Y position maps to depth — top of screen is
 * far (small), bottom is near (large). Objects appear at random horizontal
 * positions on the road.
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
    this.vanishY = 0.15; // V5: vanishing point near top (objects approach from there)
    this.scrollOffset = 0;

    this.disabled3D = false;

    this.hills = [];
    this._initHills();

    this.roadCurvePhase = 0;
    this.terrainComplexity = 0;

    /** @type {number} Number of lanes for grid display and obstacle spawning. */
    this.laneCount = 3;
  }

  _initHills() {
    this.hills = [
      { amplitude: 0, frequency: 0.003, phase: 0 },       // broad rolling hills
      { amplitude: 0, frequency: 0.007, phase: 1.5 },     // medium undulation
      { amplitude: 0, frequency: 0.012, phase: 3.1 },     // fine ripple
      { amplitude: 0, frequency: 0.002, phase: 0.7 },     // very broad slope
      { amplitude: 0, frequency: 0.0012, phase: 2.3 },    // slow linear-feeling inclines
    ];
  }

  updateForLevel(level, dt) {
    // Set terrain and hill parameters based on level.
    // disabled3D only suppresses the perspective tilt — terrain hills remain active
    // so runners physically traverse them in 2D mode.
    if (level < 1) {
      // Level 0: flat, gentle intro — minimal terrain
      this.targetCurvature = 0;
      this.terrainComplexity = 0.08;
      this.laneCount = 3;
      this.hills[0].amplitude = 5;
      this.hills[1].amplitude = 0;
      this.hills[2].amplitude = 0;
      this.hills[3].amplitude = 0;
      this.hills[4].amplitude = 8;  // gentle long slope
    } else if (level < 2) {
      // Level 1: gentle rolling hills, runners traverse mild inclines
      this.targetCurvature = 0.15;
      this.terrainComplexity = 0.35;
      this.laneCount = 3;
      this.hills[0].amplitude = 22;
      this.hills[1].amplitude = 8;
      this.hills[2].amplitude = 0;
      this.hills[3].amplitude = 0;
      this.hills[4].amplitude = 18; // long gradual inclines/declines
    } else if (level < 4) {
      // Level 2-3: pronounced hills and valleys, mix of curved and steeper slopes
      this.targetCurvature = 0.2;
      this.terrainComplexity = 0.5;
      this.laneCount = 3;
      this.hills[0].amplitude = 30;
      this.hills[1].amplitude = 14;
      this.hills[2].amplitude = 8;
      this.hills[3].amplitude = 0;
      this.hills[4].amplitude = 28; // long slopes creating valley/summit patterns
    } else if (level < FULL_3D_LEVEL) {
      // Level 4-5: dramatic terrain with deep valleys and tall hills
      this.targetCurvature = 0.3;
      this.terrainComplexity = 0.65;
      this.laneCount = 4;
      this.hills[0].amplitude = 38;
      this.hills[1].amplitude = 18;
      this.hills[2].amplitude = 10;
      this.hills[3].amplitude = 20;
      this.hills[4].amplitude = 35; // major elevation changes
    } else if (level < FULL_3D_LEVEL + 2) {
      // Level 6-7: transition into 3D perspective
      const progress = (level - FULL_3D_LEVEL) / 2;
      this.targetCurvature = 0.3 + progress * 0.25;
      this.terrainComplexity = 0.5 + progress * 0.2;
      this.laneCount = 4 + Math.floor(progress);
      this.hills[0].amplitude = 28 + progress * 5;
      this.hills[1].amplitude = 12 + progress * 3;
      this.hills[2].amplitude = 6 + progress * 2;
      this.hills[3].amplitude = 16 + progress * 4;
      this.hills[4].amplitude = 20 + progress * 5;
    } else {
      // Level 8+: full 3D with rich terrain and more lanes
      this.targetCurvature = 0.55;
      this.terrainComplexity = 0.7;
      this.laneCount = Math.min(7, 5 + Math.floor((level - FULL_3D_LEVEL - 2) / 2));
      this.hills[0].amplitude = 33;
      this.hills[1].amplitude = 15;
      this.hills[2].amplitude = 8;
      this.hills[3].amplitude = 20;
      this.hills[4].amplitude = 25;
    }

    // Tilt (3D perspective) is only active in 3D mode
    if (this.disabled3D) {
      this.targetTilt = 0;
    } else if (level < FULL_3D_LEVEL) {
      this.targetTilt = 0;
    } else if (level < FULL_3D_LEVEL + 2) {
      const progress = (level - FULL_3D_LEVEL) / 2;
      this.targetTilt = 0.3 + progress * 0.4;
    } else {
      this.targetTilt = 0.7;
    }

    this.tilt += (this.targetTilt - this.tilt) * 2 * dt;
    this.curvature += (this.targetCurvature - this.curvature) * 2 * dt;
    this.roadCurvePhase += dt * 0.5;
  }

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

  getRoadCurve(depth) {
    if (this.curvature < 0.01) return 0;
    return Math.sin(depth * Math.PI * 2 + this.roadCurvePhase) * this.curvature * 60 * depth;
  }

  renderGround(ctx, screenW, screenH, groundY, scrollX, trackColor) {
    this.scrollOffset = scrollX;

    if (this.tilt < 0.01) {
      this._render2DGround(ctx, screenW, screenH, groundY, scrollX, trackColor);
      return;
    }

    const vanishY = screenH * this.vanishY;
    const strips = 50;

    // Fill road surface strips
    for (let i = 0; i < strips; i++) {
      const t = i / strips;
      const nextT = (i + 1) / strips;

      const depth = t * t;
      const nextDepth = nextT * nextT;

      let y = vanishY + (groundY - vanishY) * depth;
      let nextY = vanishY + (groundY - vanishY) * nextDepth;

      const terrainH = this.getTerrainHeight(scrollX + (1 - t) * 2000);
      const nextTerrainH = this.getTerrainHeight(scrollX + (1 - nextT) * 2000);
      y -= terrainH * depth * this.tilt;
      nextY -= nextTerrainH * nextDepth * this.tilt;

      const scale = depth;
      const halfW = screenW * 0.5 * (0.3 + scale * 0.7);

      const curveX = this.getRoadCurve(t);
      const nextCurveX = this.getRoadCurve(nextT);

      const alpha = 0.1 + scale * 0.3;
      const r = trackColor[0] * 0.3;
      const g = trackColor[1] * 0.3;
      const b = trackColor[2] * 0.3;

      ctx.fillStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(screenW / 2 - halfW + curveX, y);
      ctx.lineTo(screenW / 2 + halfW + curveX, y);
      const nextHalfW = screenW * 0.5 * (0.3 + nextDepth * 0.7);
      ctx.lineTo(screenW / 2 + nextHalfW + nextCurveX, nextY);
      ctx.lineTo(screenW / 2 - nextHalfW + nextCurveX, nextY);
      ctx.fill();

      // Horizontal grid lines (every 3rd strip)
      if (i % 3 === 0 && scale > 0.05) {
        ctx.strokeStyle = `rgba(${Math.round(r + 40)}, ${Math.round(g + 40)}, ${Math.round(b + 40)}, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenW / 2 - halfW + curveX, y);
        ctx.lineTo(screenW / 2 + halfW + curveX, y);
        ctx.stroke();
      }
    }

    // Road edge lines (left and right)
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
      if (i === 0) ctx.moveTo(screenW / 2 - halfW + curveX, adjustedY);
      else ctx.lineTo(screenW / 2 - halfW + curveX, adjustedY);
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
      if (i === 0) ctx.moveTo(screenW / 2 + halfW + curveX, adjustedY);
      else ctx.lineTo(screenW / 2 + halfW + curveX, adjustedY);
    }
    ctx.stroke();

    // Vertical lane lines (grid pattern for texture/depth feel)
    const laneCount = this.laneCount || 5;
    const laneAlpha = 0.08 + this.tilt * 0.1;
    ctx.strokeStyle = `rgba(${trackColor[0]}, ${trackColor[1]}, ${trackColor[2]}, ${laneAlpha})`;
    ctx.lineWidth = 1;
    for (let lane = 1; lane < laneCount; lane++) {
      const laneFrac = lane / laneCount;
      ctx.beginPath();
      for (let i = 0; i <= strips; i++) {
        const t = i / strips;
        const depth = t * t;
        const y = vanishY + (groundY - vanishY) * depth;
        const terrainH = this.getTerrainHeight(scrollX + (1 - t) * 2000);
        const adjustedY = y - terrainH * depth * this.tilt;
        const halfW = screenW * 0.5 * (0.3 + depth * 0.7);
        const curveX = this.getRoadCurve(t);
        const laneX = screenW / 2 + curveX + (laneFrac - 0.5) * halfW * 2;
        if (i === 0) ctx.moveTo(laneX, adjustedY);
        else ctx.lineTo(laneX, adjustedY);
      }
      ctx.stroke();
    }
  }

  _render2DGround(ctx, screenW, screenH, groundY, scrollX, trackColor) {
    const r = trackColor[0];
    const g = trackColor[1];
    const b = trackColor[2];

    // Fill below the terrain line with gradient
    ctx.beginPath();
    ctx.moveTo(0, screenH);
    for (let x = 0; x <= screenW; x += 3) {
      const terrainH = this.getTerrainHeight(scrollX + x);
      const y = groundY - terrainH;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(screenW, screenH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, groundY - 40, 0, screenH);
    grad.addColorStop(0, `rgba(${Math.round(r * 0.2)}, ${Math.round(g * 0.2)}, ${Math.round(b * 0.2)}, 0.6)`);
    grad.addColorStop(1, 'rgba(5, 5, 16, 0.9)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Main terrain line
    ctx.strokeStyle = `rgba(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.6)}, 0.5)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= screenW; x += 3) {
      const terrainH = this.getTerrainHeight(scrollX + x);
      const y = groundY - terrainH;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Secondary terrain contour lines (add depth)
    if (this.terrainComplexity > 0.05) {
      for (let offset = 1; offset <= 3; offset++) {
        const alpha = 0.12 - offset * 0.03;
        if (alpha <= 0) break;
        ctx.strokeStyle = `rgba(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.4)}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= screenW; x += 4) {
          const terrainH = this.getTerrainHeight(scrollX + x);
          const y = groundY - terrainH + offset * 8;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Curvature overlay
    if (this.curvature > 0.01) {
      ctx.strokeStyle = `rgba(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, ${Math.round(b * 0.4)}, 0.15)`;
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
  }

  /**
   * Transform obstacle for 3D rendering.
   * V5: obstacle Y position maps to depth (top=far, bottom=near).
   */
  renderObstacle3D(ctx, obstacle, screenW, screenH, groundY) {
    if (this.tilt < 0.01) return false;

    // Map obstacle Y to depth: y=0 (top) → depth near 0 (far), y=groundY → depth=1 (near)
    const depthNorm = Math.max(0, Math.min(1, obstacle.y / groundY));
    const depth = depthNorm * depthNorm;
    const vanishY = screenH * this.vanishY;

    // Position on the 3D road
    let roadY = vanishY + (groundY - vanishY) * depth;
    const terrainH = this.getTerrainHeight(this.scrollOffset + obstacle.laneFraction * 2000);
    roadY -= terrainH * depth * this.tilt;

    const scale = Math.max(0.15, 0.3 + depth * 0.7);
    const halfW = screenW * 0.5 * (0.3 + depth * 0.7);
    const curveX = this.getRoadCurve(depthNorm);

    // Horizontal position: map lane fraction to 3D road width
    const laneOffset = (obstacle.laneFraction - 0.5) * halfW * 2;
    const centerX = screenW / 2 + curveX + laneOffset * scale;

    if (scale < 0.15) return true;

    ctx.save();
    ctx.globalAlpha = 0.3 + scale * 0.6;
    const fontSize = obstacle.emojiSize * scale * 0.9;
    ctx.font = `${Math.max(8, fontSize)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obstacle.emoji, centerX, roadY - obstacle.h * scale / 2);
    ctx.restore();

    return true;
  }

  getGroundYAtX(screenX, baseGroundY, scrollX) {
    const rawH = this.getTerrainHeight(scrollX + screenX);
    const terrainH = this.clampValleyDepth(rawH, baseGroundY);
    return baseGroundY - terrainH;
  }

  /**
   * Get the terrain slope at a given world X position.
   * Returns a value in approximate pixels-per-pixel (rise/run).
   * Positive = uphill (terrain getting higher to the right).
   * Negative = downhill (terrain getting lower to the right).
   */
  getTerrainSlope(worldX) {
    if (this.terrainComplexity < 0.01) return 0;
    const dx = 2;
    const h1 = this.getTerrainHeight(worldX - dx);
    const h2 = this.getTerrainHeight(worldX + dx);
    return (h2 - h1) / (dx * 2);
  }

  /**
   * Clamp terrain height to prevent players getting stuck in deep valleys.
   * The maximum valley depth is limited relative to surrounding terrain.
   * @param {number} rawHeight - Raw terrain height from getTerrainHeight.
   * @param {number} baseGroundY - The base ground Y position.
   * @returns {number} Clamped terrain height.
   */
  clampValleyDepth(rawHeight, baseGroundY) {
    // Don't let terrain push below 85% of screen height from top
    const maxDrop = baseGroundY * 0.15;
    return Math.max(-maxDrop, rawHeight);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Renderer3D };
}
