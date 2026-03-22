/**
 * Character definitions for Cosmic Runner V3.
 *
 * Each level/track has a unique character with distinct shape and colors.
 * Characters are drawn as cute pixel-art sprites using canvas primitives.
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
 */
function drawCharacter(ctx, char, cx, cy, w, h, runTimer, grounded, glowAlpha, squash) {
  const hw = w / 2;
  const hh = h / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(2 - squash, squash);

  // Glow aura
  if (glowAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = glowAlpha * 0.4;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, hw * 2.5);
    grad.addColorStop(0, char.color);
    grad.addColorStop(0.5, char.accent);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, hw * 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Body
  ctx.fillStyle = char.color;
  switch (char.shape) {
    case 'blob':
      ctx.beginPath();
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.strokeStyle = char.accent;
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
      ctx.fillStyle = char.accent;
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
      ctx.fillStyle = char.accent;
      ctx.beginPath();
      ctx.arc(0, hh * 0.2, hw * 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;

    default:
      ctx.fillRect(-hw, -hh, w, h);
  }

  // Eyes
  _drawEyes(ctx, char.eyes, hw, hh, runTimer);

  // Legs (when grounded)
  if (grounded) {
    const legOff = Math.sin(runTimer * 16) * 4;
    ctx.strokeStyle = char.color;
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

/**
 * Generate a random VCV/VVC/CVC name (2 vowels + 1 consonant).
 * @param {function} rng - Random function returning 0-1.
 * @returns {string}
 */
function generatePlayerName(rng) {
  const vowels = 'AEIOU';
  const consonants = 'BCDFGHJKLMNPQRSTVWXYZ';
  const v = () => vowels[Math.floor(rng() * vowels.length)];
  const c = () => consonants[Math.floor(rng() * consonants.length)];

  const patterns = [
    () => v() + c() + v(),  // VCV: Abe, Ira
    () => v() + v() + c(),  // VVC: Aar, Eel
    () => c() + v() + v(),  // CVV: Bae, Loo
    () => v() + c() + c(),  // VCC: Abb, Eff (bonus variety)
  ];
  return patterns[Math.floor(rng() * patterns.length)]();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHARACTERS, drawCharacter, generatePlayerName };
}
