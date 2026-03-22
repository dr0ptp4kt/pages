/**
 * 3D Perspective Renderer for Cosmic Runner V3.
 *
 * Progressively transitions from 2D side-view to 3D behind-the-runner
 * perspective as the player advances through levels.
 *
 * Level 1-2: Pure 2D side-scrolling
 * Level 3-4: Slight tilt, beginning of perspective
 * Level 5: Notable 3D depth
 * Level 6+: Full 3D behind-runner camera
 *
 * Also adds ground curvature and tilted terrain.
 */

class Renderer3D {
  constructor() {
    /** @type {number} Camera tilt (0 = side view, 1 = behind runner). */
    this.tilt = 0;

    /** @type {number} Target tilt for smooth transition. */
    this.targetTilt = 0;

    /** @type {number} Ground curvature amount. */
    this.curvature = 0;

    /** @type {number} Field of view width multiplier. */
    this.fovScale = 1;

    /** @type {number} Vanishing point Y (0-1 of screen height). */
    this.vanishY = 0.35;

    /** @type {Array<{x: number, z: number, phase: number}>} Ground features. */
    this.groundFeatures = [];
    this._initGround();
  }

  _initGround() {
    for (let i = 0; i < 60; i++) {
      this.groundFeatures.push({
        x: (Math.random() - 0.5) * 2,
        z: Math.random(),
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * Update tilt based on current level.
   * @param {number} level - 0-based level index.
   * @param {number} dt
   */
  updateForLevel(level, dt) {
    // Progressive tilt: nothing for levels 0-1, increasing from level 2
    if (level < 2) {
      this.targetTilt = 0;
      this.curvature = 0;
    } else if (level < FULL_3D_LEVEL) {
      const progress = (level - 2) / (FULL_3D_LEVEL - 2);
      this.targetTilt = progress * 0.8;
      this.curvature = progress * 0.5;
    } else {
      this.targetTilt = 0.8;
      this.curvature = 0.5;
    }

    // Smooth transition
    this.tilt += (this.targetTilt - this.tilt) * 2 * dt;
  }

  /**
   * Transform a 2D game position to screen coordinates.
   * @param {number} gameX - X in game space (0 = left, screenWidth = right).
   * @param {number} gameY - Y in game space (0 = top, groundY = ground).
   * @param {number} screenW - Screen width.
   * @param {number} screenH - Screen height.
   * @param {number} groundY - Ground line Y.
   * @returns {{x: number, y: number, scale: number}}
   */
  transform(gameX, gameY, screenW, screenH, groundY) {
    if (this.tilt < 0.01) {
      return { x: gameX, y: gameY, scale: 1 };
    }

    // Depth: how far "into" the screen (0 = near, 1 = far)
    const depthNorm = gameX / screenW;

    // Perspective scaling
    const perspScale = 1 - depthNorm * this.tilt * 0.6;
    const scale = Math.max(0.2, perspScale);

    // X: converge toward center at depth
    const centerX = screenW * 0.5;
    const x = centerX + (gameX - centerX) * scale;

    // Y: converge toward vanishing point at depth
    const vanishPointY = screenH * this.vanishY;
    const y = vanishPointY + (gameY - vanishPointY) * scale;

    return { x, y, scale };
  }

  /**
   * Render the 3D ground plane with curvature.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} screenW
   * @param {number} screenH
   * @param {number} groundY
   * @param {number} scrollX - Current scroll position.
   * @param {Array<number>} trackColor - RGB array for ground tint.
   */
  renderGround(ctx, screenW, screenH, groundY, scrollX, trackColor) {
    if (this.tilt < 0.01) {
      // 2D ground with slight curvature
      this._render2DGround(ctx, screenW, screenH, groundY, scrollX, trackColor);
      return;
    }

    // 3D ground plane
    const vanishY = screenH * this.vanishY;
    const strips = 40;

    for (let i = 0; i < strips; i++) {
      const t = i / strips;
      const nextT = (i + 1) / strips;

      const y = vanishY + (groundY - vanishY) * (t * t); // Quadratic for perspective
      const nextY = vanishY + (groundY - vanishY) * (nextT * nextT);
      const h = nextY - y;

      const scale = t * t;
      const halfW = screenW * 0.5 * (0.3 + scale * 0.7);

      // Curvature offset
      const curveX = Math.sin(t * Math.PI + scrollX * 0.001) * this.curvature * 50 * scale;

      const alpha = 0.1 + scale * 0.3;
      const r = trackColor[0] * 0.3;
      const g = trackColor[1] * 0.3;
      const b = trackColor[2] * 0.3;

      ctx.fillStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(screenW / 2 - halfW + curveX, y);
      ctx.lineTo(screenW / 2 + halfW + curveX, y);
      ctx.lineTo(screenW / 2 + halfW + curveX, y + h);
      ctx.lineTo(screenW / 2 - halfW + curveX, y + h);
      ctx.fill();

      // Grid lines for depth perception
      if (i % 4 === 0) {
        ctx.strokeStyle = `rgba(${Math.round(r + 40)}, ${Math.round(g + 40)}, ${Math.round(b + 40)}, ${alpha * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(screenW / 2 - halfW + curveX, y);
        ctx.lineTo(screenW / 2 + halfW + curveX, y);
        ctx.stroke();
      }
    }
  }

  _render2DGround(ctx, screenW, screenH, groundY, scrollX, trackColor) {
    // Standard ground line with optional curvature
    ctx.fillStyle = `rgba(${trackColor[0] * 0.4}, ${trackColor[1] * 0.4}, ${trackColor[2] * 0.4}, 0.3)`;
    ctx.fillRect(0, groundY, screenW, 2);

    // Curvature: draw a gentle sine wave on the ground
    if (this.curvature > 0.01) {
      ctx.strokeStyle = `rgba(${trackColor[0] * 0.5}, ${trackColor[1] * 0.5}, ${trackColor[2] * 0.5}, 0.2)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < screenW; x += 4) {
        const curveY = Math.sin((x + scrollX) * 0.005) * this.curvature * 20;
        if (x === 0) ctx.moveTo(x, groundY + curveY);
        else ctx.lineTo(x, groundY + curveY);
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
   * Transform obstacles for 3D rendering.
   * In 3D mode, obstacles appear as holographic objects with depth.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Obstacle} obstacle
   * @param {number} screenW
   * @param {number} screenH
   * @param {number} groundY
   */
  renderObstacle3D(ctx, obstacle, screenW, screenH, groundY) {
    if (this.tilt < 0.01) return false; // Use normal 2D rendering

    const { x, y, scale } = this.transform(
      obstacle.x, obstacle.y, screenW, screenH, groundY);

    if (scale < 0.1) return true; // Too far away, skip

    const w = obstacle.w * scale;
    const h = obstacle.h * scale;

    // Holographic effect
    ctx.save();
    ctx.globalAlpha = 0.3 + scale * 0.5;
    ctx.shadowColor = obstacle.color;
    ctx.shadowBlur = 10 * scale;

    ctx.fillStyle = obstacle.color;
    // Simple scaled rectangle with glow
    ctx.fillRect(x - w / 2, y - h, w, h);

    // Hologram scan lines
    ctx.strokeStyle = obstacle.accent;
    ctx.lineWidth = 1;
    for (let ly = 0; ly < h; ly += 4) {
      ctx.globalAlpha = 0.15 * scale;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h + ly);
      ctx.lineTo(x + w / 2, y - h + ly);
      ctx.stroke();
    }

    ctx.restore();
    return true;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Renderer3D };
}
