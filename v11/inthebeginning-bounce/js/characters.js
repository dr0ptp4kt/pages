/**
 * Character definitions for inthebeginning bounce.
 *
 * Each level/track has a unique character with distinct shape and colors.
 * In two-player mode, P2 gets a slightly darker/shifted variant.
 */

const CHARACTERS = [
  { name: 'Pip',       shape: 'blob',      color: '#ff6644', accent: '#ffaa66', eyes: 'round' },
  { name: 'Zap',       shape: 'crystal',   color: '#4488ff', accent: '#88ccff', eyes: 'narrow' },
  { name: 'Qix',       shape: 'star',      color: '#cc88ff', accent: '#ddbbff', eyes: 'wide' },
  { name: 'Ryu',       shape: 'triangle',  color: '#44ccaa', accent: '#88ddcc', eyes: 'round' },
  { name: 'Nix',       shape: 'hexagon',   color: '#88cc44', accent: '#bbdd88', eyes: 'dots' },
  { name: 'Umi',       shape: 'cloud',     color: '#88ddff', accent: '#bbffff', eyes: 'round' },
  { name: 'Sol',       shape: 'flame',     color: '#ff8844', accent: '#ffbb88', eyes: 'narrow' },
  { name: 'Lux',       shape: 'diamond',   color: '#6688ff', accent: '#99bbff', eyes: 'wide' },
  { name: 'Vex',       shape: 'crescent',  color: '#ff88bb', accent: '#ffbbdd', eyes: 'round' },
  { name: 'Ivy',       shape: 'leaf',      color: '#66bb88', accent: '#99ddaa', eyes: 'dots' },
  { name: 'Orb',       shape: 'sphere',    color: '#bb88ff', accent: '#ddbbff', eyes: 'wide' },
  { name: 'Zen',       shape: 'teardrop',  color: '#ffcc66', accent: '#ffddaa', eyes: 'round' },
];

/**
 * Darken a hex color by a factor (for P2 shading).
 * @param {string} hex
 * @param {number} factor - 0-1, where 0.7 = 30% darker
 * @returns {string}
 */
function _darkenHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Shift a hex color hue slightly (for P2 differentiation).
 * @param {string} hex
 * @param {number} shift - Hue shift in degrees
 * @returns {string}
 */
function _shiftHexHue(hex, shift) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l;
  l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h = ((h * 360 + shift) % 360) / 360;
  if (h < 0) h += 1;

  // HSL to RGB
  function hue2rgb(p2, q2, t2) {
    if (t2 < 0) t2 += 1; if (t2 > 1) t2 -= 1;
    if (t2 < 1/6) return p2 + (q2 - p2) * 6 * t2;
    if (t2 < 1/2) return q2;
    if (t2 < 2/3) return p2 + (q2 - p2) * (2/3 - t2) * 6;
    return p2;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  g = Math.round(hue2rgb(p, q, h) * 255);
  b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

/**
 * Draw a character at the given position.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} char - Character definition from CHARACTERS.
 * @param {number} cx - Center X.
 * @param {number} cy - Center Y.
 * @param {number} w - Width.
 * @param {number} h - Height.
 * @param {number} runTimer - Animation timer.
 * @param {boolean} grounded - Whether on ground.
 * @param {number} glowAlpha - Glow intensity (0-1).
 * @param {number} squash - Squash/stretch factor.
 * @param {boolean} [isP2=false] - If true, use darker/shifted shading for P2.
 */
function drawCharacter(ctx, char, cx, cy, w, h, runTimer, grounded, glowAlpha, squash, isP2) {
  const hw = w / 2;
  const hh = h / 2;

  // P2 variant: darker body, shifted hue
  let bodyColor = char.color;
  let accentColor = char.accent;
  if (isP2) {
    bodyColor = _darkenHex(_shiftHexHue(char.color, 30), 0.75);
    accentColor = _darkenHex(_shiftHexHue(char.accent, 30), 0.8);
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(2 - squash, squash);

  // Glow aura
  if (glowAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = glowAlpha * 0.4;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, hw * 2.5);
    grad.addColorStop(0, bodyColor);
    grad.addColorStop(0.5, accentColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, hw * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Body
  ctx.fillStyle = bodyColor;
  switch (char.shape) {
    case 'blob':
      ctx.beginPath();
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.ellipse(0, -hh * 0.15, hw * 0.7, hh * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'crystal':
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(hw * 0.5, hh);
      ctx.lineTo(-hw * 0.5, hh);
      ctx.lineTo(-hw, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(0, -hh + 5);
      ctx.lineTo(hw * 0.5, 0);
      ctx.lineTo(0, hh - 5);
      ctx.lineTo(-hw * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      break;

    case 'star':
      _drawStar(ctx, 0, 0, 5, hw, hw * 0.5);
      ctx.fill();
      ctx.fillStyle = accentColor;
      _drawStar(ctx, 0, 0, 5, hw * 0.5, hw * 0.3);
      ctx.fill();
      break;

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(0, -hh + 8);
      ctx.lineTo(hw * 0.6, hh - 4);
      ctx.lineTo(-hw * 0.6, hh - 4);
      ctx.closePath();
      ctx.fill();
      break;

    case 'hexagon':
      _drawPoly(ctx, 0, 0, 6, Math.min(hw, hh));
      ctx.fill();
      ctx.fillStyle = accentColor;
      _drawPoly(ctx, 0, 0, 6, Math.min(hw, hh) * 0.65);
      ctx.fill();
      break;

    case 'cloud':
      ctx.beginPath();
      ctx.arc(-hw * 0.3, 0, hw * 0.5, 0, Math.PI * 2);
      ctx.arc(hw * 0.3, 0, hw * 0.5, 0, Math.PI * 2);
      ctx.arc(0, -hh * 0.3, hw * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'flame':
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.quadraticCurveTo(hw, -hh * 0.3, hw * 0.7, hh * 0.3);
      ctx.quadraticCurveTo(hw * 0.3, hh, 0, hh);
      ctx.quadraticCurveTo(-hw * 0.3, hh, -hw * 0.7, hh * 0.3);
      ctx.quadraticCurveTo(-hw, -hh * 0.3, 0, -hh);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.ellipse(0, hh * 0.1, hw * 0.35, hh * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(0, hh);
      ctx.lineTo(-hw, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(0, -hh + 6);
      ctx.lineTo(hw - 6, 0);
      ctx.lineTo(0, hh - 6);
      ctx.lineTo(-hw + 6, 0);
      ctx.closePath();
      ctx.fill();
      break;

    case 'crescent':
      ctx.beginPath();
      ctx.arc(0, 0, hw, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#050510';
      ctx.beginPath();
      ctx.arc(hw * 0.3, -hh * 0.2, hw * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(-hw * 0.2, hh * 0.1, hw * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.quadraticCurveTo(hw * 1.2, -hh * 0.2, 0, hh);
      ctx.quadraticCurveTo(-hw * 1.2, -hh * 0.2, 0, -hh);
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -hh + 4);
      ctx.lineTo(0, hh - 4);
      ctx.stroke();
      break;

    case 'sphere':
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(hw, hh), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(-hw * 0.25, -hh * 0.25, hw * 0.35, hh * 0.25, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;

    case 'teardrop':
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.quadraticCurveTo(hw, 0, 0, hh);
      ctx.quadraticCurveTo(-hw, 0, 0, -hh);
      ctx.fill();
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.arc(0, hh * 0.2, hw * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;

    default:
      ctx.fillRect(-hw, -hh, w, h);
  }

  // P2 indicator: small outline ring
  if (isP2) {
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(hw, hh) + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Eyes
  _drawEyes(ctx, char.eyes, hw, hh, runTimer);

  // Legs (when grounded)
  if (grounded) {
    const legOff = Math.sin(runTimer * 16) * 4;
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, hh - 4);
    ctx.lineTo(-4 - legOff, hh + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, hh - 4);
    ctx.lineTo(4 + legOff, hh + 2);
    ctx.stroke();
  }

  ctx.restore();
}

function _drawEyes(ctx, style, hw, hh, timer) {
  ctx.fillStyle = '#fff';
  switch (style) {
    case 'round':
      ctx.beginPath();
      ctx.arc(-hw * 0.25, -hh * 0.15, 3, 0, Math.PI * 2);
      ctx.arc(hw * 0.25, -hh * 0.15, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-hw * 0.2, -hh * 0.15, 1.5, 0, Math.PI * 2);
      ctx.arc(hw * 0.3, -hh * 0.15, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'narrow':
      ctx.fillRect(-hw * 0.35, -hh * 0.2, hw * 0.25, 3);
      ctx.fillRect(hw * 0.1, -hh * 0.2, hw * 0.25, 3);
      ctx.fillStyle = '#111';
      ctx.fillRect(-hw * 0.25, -hh * 0.2, 2, 3);
      ctx.fillRect(hw * 0.2, -hh * 0.2, 2, 3);
      break;
    case 'wide':
      ctx.beginPath();
      ctx.arc(-hw * 0.3, -hh * 0.1, 4, 0, Math.PI * 2);
      ctx.arc(hw * 0.3, -hh * 0.1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-hw * 0.25, -hh * 0.1, 2, 0, Math.PI * 2);
      ctx.arc(hw * 0.35, -hh * 0.1, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'dots':
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-hw * 0.25, -hh * 0.15, 2, 0, Math.PI * 2);
      ctx.arc(hw * 0.25, -hh * 0.15, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function _drawStar(ctx, cx, cy, points, outerR, innerR) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function _drawPoly(ctx, cx, cy, sides, r) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function generatePlayerName(rng) {
  const vowels = 'AEIOU';
  const consonants = 'BCDFGHJKLMNPQRSTVWXYZ';
  const v = () => vowels[Math.floor(rng() * vowels.length)];
  const c = () => consonants[Math.floor(rng() * consonants.length)];

  const patterns = [
    () => v() + c() + v(),
    () => v() + v() + c(),
    () => c() + v() + v(),
    () => v() + c() + c(),
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHARACTERS, drawCharacter, generatePlayerName };
}
