/**
 * Theme system for Cosmic Runner V3.
 *
 * Themes tint the overall color palette while respecting per-track colors.
 * Star styles now show their actual symbol in the picker.
 */

const THEMES = [
  { name: 'Cosmic',     hueShift: 0,   satMult: 1.0, brightMult: 1.0, accent: [100, 180, 255] },
  { name: 'Ember',      hueShift: -20, satMult: 1.2, brightMult: 1.05, accent: [255, 120, 60] },
  { name: 'Neon',       hueShift: 30,  satMult: 1.4, brightMult: 1.15, accent: [0, 255, 180] },
  { name: 'Midnight',   hueShift: 0,   satMult: 0.6, brightMult: 0.8, accent: [80, 80, 160] },
  { name: 'Sunset',     hueShift: -30, satMult: 1.15, brightMult: 1.05, accent: [255, 150, 80] },
  { name: 'Aurora',     hueShift: 60,  satMult: 1.3, brightMult: 1.1, accent: [100, 255, 150] },
  { name: 'Void',       hueShift: 0,   satMult: 0.3, brightMult: 0.6, accent: [120, 120, 140] },
  { name: 'Plasma',     hueShift: 45,  satMult: 1.5, brightMult: 1.2, accent: [255, 80, 255] },
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
