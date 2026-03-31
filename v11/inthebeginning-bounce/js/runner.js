/**
 * Runner — the player character in inthebeginning bounce.
 *
 * V5: Default position centered (objects come from top).
 * Wider horizontal range for dodging left/right.
 */

class Runner {
  constructor(groundY, playerIndex, numPlayers, screenWidth) {
    this.playerIndex = playerIndex || 0;
    this.numPlayers = numPlayers || 1;
    this.screenWidth = screenWidth || 800;

    if (this.numPlayers === 2) {
      this.positionFraction = this.playerIndex === 0
        ? PLAYER2_DEFAULT_POS_LEFT : PLAYER2_DEFAULT_POS_RIGHT;
    } else {
      this.positionFraction = PLAYER1_DEFAULT_POS;
    }

    this.x = this.positionFraction * this.screenWidth;
    this.y = groundY;
    this.w = 28;
    this.h = 32;
    this.vy = 0;
    this.gravity = 1600;
    this.jumpPower = -560;
    this.grounded = true;
    this.groundY = groundY;

    this.characterIndex = 0;
    this.jumpCount = 0;
    this.runTimer = 0;
    this.squash = 1;

    this.blasting = false;
    this.blastTimer = 0;

    this.glowAlpha = 0;
    this.glowTarget = 0;
    this.streakDistance = 0;

    this.name = '';
    this.trail = [];
    this.trailTimer = 0;
    this.points = 0;
    this.jumpOverCount = 0;

    this.fastDropping = false;
    this.dragging = false;
  }

  jump() {
    if (this.grounded) {
      this.vy = this.jumpPower;
      this.grounded = false;
      this.jumpCount = 1;
      this.squash = 1.3;
      this.fastDropping = false;
    } else {
      const diminish = Math.max(0.3, 0.8 - this.jumpCount * 0.05);
      const power = this.jumpPower * diminish;
      this.vy = Math.min(this.vy, power);
      this.jumpCount++;
      this.squash = 1.15;
      this.fastDropping = false;
    }
  }

  fastDrop() {
    if (!this.grounded) {
      this.fastDropping = true;
      this.vy = Math.max(this.vy, 800);
    }
  }

  moveHorizontal(delta) {
    this.positionFraction += delta;
    this._clampPosition();
    this.x = this.positionFraction * this.screenWidth;
  }

  setPositionFraction(fraction) {
    this.positionFraction = fraction;
    this._clampPosition();
    this.x = this.positionFraction * this.screenWidth;
  }

  _clampPosition() {
    // Ensure positionFraction is a valid number (NaN/Infinity protection)
    if (!isFinite(this.positionFraction)) this.positionFraction = PLAYER1_DEFAULT_POS;
    if (this.numPlayers === 1) {
      this.positionFraction = Math.max(PLAYER_POS_MIN_1P,
        Math.min(PLAYER_POS_MAX_1P, this.positionFraction));
    } else {
      this.positionFraction = Math.max(PLAYER_POS_MIN_2P,
        Math.min(PLAYER_POS_MAX_2P, this.positionFraction));
    }
  }

  setLevel(levelIndex) {
    this.characterIndex = levelIndex % CHARACTERS.length;
    this.streakDistance = 0;
    this.glowTarget = 0;
    this.glowAlpha = 0;
    this.points = 0;
    this.jumpOverCount = 0;
    this.name = generatePlayerName(Math.random);
  }

  blast() {
    this.blasting = true;
    this.blastTimer = 0.3;
    this.streakDistance = 0;
    this.glowTarget = 0;

    const char = CHARACTERS[this.characterIndex];
    for (let i = 0; i < 8; i++) {
      this.trail.push({
        x: this.x + this.w / 2 + (Math.random() - 0.5) * 20,
        y: this.y - this.h / 2 + (Math.random() - 0.5) * 20,
        alpha: 0.6,
        hue: _parseHueHex(char.color),
      });
    }
  }

  update(dt, scrollSpeed, trackDuration, trackProgress) {
    if (!this.grounded) {
      const grav = this.fastDropping ? this.gravity * 3 : this.gravity;
      this.vy += grav * dt;
      this.y += this.vy * dt;

      const minY = 30;
      if (this.y - this.h < minY) {
        this.y = minY + this.h;
        this.vy = Math.max(0, this.vy);
      }

      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        this.grounded = true;
        this.squash = 0.7;
        this.jumpCount = 0;
        this.fastDropping = false;
        if (this.jumpOverCount > 0) {
          // Award 3pts once per jump landing (not per object), regardless
          // of how many objects were jumped over during the airborne phase
          this.points += SCORE.JUMP_OVER;
          this.jumpOverCount = 0;
        }
      }
    }

    this.squash += (1 - this.squash) * 8 * dt;
    this.runTimer += dt;
    this.streakDistance += scrollSpeed * dt;

    if (trackDuration > 0 && trackProgress > GLOW_THRESHOLD) {
      if (this.streakDistance > 0) this.glowTarget = 1;
    }

    this.glowAlpha += (this.glowTarget - this.glowAlpha) * 3 * dt;

    if (trackDuration > 0 && trackDuration - (trackProgress * trackDuration) < 3) {
      this.glowAlpha *= 0.9;
    }

    if (this.blasting) {
      this.blastTimer -= dt;
      if (this.blastTimer <= 0) this.blasting = false;
    }

    this.trailTimer += dt;
    if (this.trailTimer > 0.05) {
      this.trailTimer = 0;
      const char = CHARACTERS[this.characterIndex];
      this.trail.push({
        x: this.x + 4 + Math.random() * 6,
        y: this.y - this.h / 2 + (Math.random() - 0.5) * this.h * 0.6,
        alpha: 0.6,
        hue: _parseHueHex(char.color),
      });
    }

    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].alpha -= dt * 3;
      this.trail[i].y += dt * 20; // Trail drifts down in v5
      if (this.trail[i].alpha <= 0) this.trail.splice(i, 1);
    }

    this.x = this.positionFraction * this.screenWidth;
  }

  setGroundY(groundY) {
    if (this.grounded) this.y = groundY;
    this.groundY = groundY;
  }

  setScreenWidth(w) {
    this.screenWidth = w;
    this.x = this.positionFraction * w;
  }

  getBounds() {
    return { x: this.x + 4, y: this.y - this.h + 4, w: this.w - 8, h: this.h - 8 };
  }

  hitTest(sx, sy) {
    return sx >= this.x - this.w && sx <= this.x + this.w * 2 &&
           sy >= this.y - this.h - 10 && sy <= this.y + 10;
  }

  render(ctx) {
    const char = CHARACTERS[this.characterIndex];
    const cx = this.x + this.w / 2;
    const cy = this.y - this.h / 2;

    for (const p of this.trail) {
      ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.blasting) {
      ctx.save();
      ctx.shadowColor = char.color;
      ctx.shadowBlur = 12;
    }

    const isP2 = this.playerIndex === 1;
    drawCharacter(ctx, char, cx, cy, this.w, this.h,
      this.runTimer, this.grounded, this.glowAlpha, this.squash, isP2);

    if (this.blasting) ctx.restore();
  }
}

function _parseHueHex(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h;
  if (max === r) h = (g - b) / (max - min);
  else if (max === g) h = 2 + (b - r) / (max - min);
  else h = 4 + (r - g) / (max - min);
  return ((h * 60) + 360) % 360;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Runner };
}
