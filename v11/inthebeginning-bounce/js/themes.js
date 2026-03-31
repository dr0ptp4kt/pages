/**
 * Theme system for inthebeginning bounce.
 *
 * Themes tint the overall color palette while respecting per-track colors.
 * Star styles now show their actual symbol in the picker.
 */

const THEMES = [
  { name: 'Default',    hueShift: 0,   satMult: 1.0, brightMult: 1.0, accent: [100, 180, 255], bgTint: null },
  { name: 'Ember',      hueShift: -25, satMult: 1.4, brightMult: 1.1, accent: [255, 100, 40],  bgTint: 'rgba(80,20,0,0.15)' },
  { name: 'Neon',       hueShift: 40,  satMult: 1.8, brightMult: 1.3, accent: [0, 255, 160],   bgTint: 'rgba(0,40,30,0.15)' },
  { name: 'Midnight',   hueShift: 0,   satMult: 0.5, brightMult: 0.6, accent: [60, 60, 140],   bgTint: 'rgba(0,0,30,0.2)' },
  { name: 'Sunset',     hueShift: -35, satMult: 1.3, brightMult: 1.1, accent: [255, 130, 60],  bgTint: 'rgba(60,20,0,0.12)' },
  { name: 'Aurora',     hueShift: 80,  satMult: 1.5, brightMult: 1.2, accent: [80, 255, 130],  bgTint: 'rgba(0,30,20,0.12)' },
  { name: 'Void',       hueShift: 0,   satMult: 0.2, brightMult: 0.4, accent: [100, 100, 120], bgTint: 'rgba(0,0,0,0.2)' },
  { name: 'Plasma',     hueShift: 55,  satMult: 2.0, brightMult: 1.4, accent: [255, 60, 255],  bgTint: 'rgba(40,0,40,0.15)' },
  { name: 'Ocean',      hueShift: -60, satMult: 1.3, brightMult: 1.0, accent: [40, 150, 255],  bgTint: 'rgba(0,10,40,0.15)' },
  { name: 'Forest',     hueShift: 100, satMult: 1.4, brightMult: 0.9, accent: [60, 180, 80],   bgTint: 'rgba(0,20,0,0.12)' },
];

/** Star style definitions with display symbols for the picker. */
const STAR_STYLES = [];
(function() {
  const defs = [
    { shape: 'circle',   symbol: '\u25CF' },     // ●
    { shape: 'diamond',  symbol: '\u25C6' },     // ◆
    { shape: 'cross',    symbol: '\u271A' },     // ✚
    { shape: 'dot',      symbol: '\u00B7' },     // ·
    { shape: 'ring',     symbol: '\u25CB' },     // ○
    { shape: 'triangle', symbol: '\u25B2' },     // ▲
    { shape: 'square',   symbol: '\u25A0' },     // ■
    { shape: 'spark',    symbol: '\u2737' },     // ✷
    { shape: 'hex',      symbol: '\u2B22' },     // ⬢
    { shape: 'asterisk', symbol: '\u2731' },     // ✱
    { shape: 'crescent', symbol: '\u263D' },     // ☽
    { shape: 'teardrop', symbol: '\u{1F4A7}' },  // 💧
    { shape: 'flower',   symbol: '\u2740' },     // ❀
    { shape: 'spiral',   symbol: '\u{1F300}' },  // 🌀
    { shape: 'arrow',    symbol: '\u2191' },     // ↑
    { shape: 'wave',     symbol: '\u223F' },     // ∿
    { shape: 'bolt',     symbol: '\u26A1' },     // ⚡
  ];
  const sizes = ['tiny', 'small'];
  let idx = 0;
  for (const def of defs) {
    for (const size of sizes) {
      STAR_STYLES.push({
        id: idx, shape: def.shape, size, symbol: def.symbol,
        name: `${def.symbol} ${def.shape} (${size})`
      });
      idx++;
      if (idx >= 34) break;
    }
    if (idx >= 34) break;
  }
})();

class ThemeManager {
  constructor() {
    this.themeIndex = 0;
    this.starStyleIndex = 0;
  }

  getTheme() { return THEMES[this.themeIndex]; }
  getStarStyle() { return STAR_STYLES[this.starStyleIndex]; }

  shiftHue(hue) {
    return (hue + this.getTheme().hueShift + 360) % 360;
  }

  applyTheme(h, s, l) {
    const t = this.getTheme();
    const nh = (h + t.hueShift + 360) % 360;
    const ns = Math.min(100, s * t.satMult);
    const nl = Math.min(100, l * t.brightMult);
    return `hsl(${nh}, ${ns}%, ${nl}%)`;
  }

  getAccentCSS() {
    const a = this.getTheme().accent;
    return `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEMES, STAR_STYLES, ThemeManager };
}
