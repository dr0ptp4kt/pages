/**
 * Theme system for Cosmic Runner V3.
 *
 * Users can select a color theme and a star style from the title screen
 * or in-game. Themes tint the overall color palette while respecting
 * per-track color schemes.
 */

/** Predefined color themes. Each adjusts hue/saturation/brightness. */
const THEMES = [
  { name: 'Cosmic',     hueShift: 0,   satMult: 1.0, brightMult: 1.0, accent: [100, 180, 255] },
  { name: 'Ember',      hueShift: -20, satMult: 1.2, brightMult: 1.0, accent: [255, 120, 60] },
  { name: 'Neon',       hueShift: 30,  satMult: 1.4, brightMult: 1.1, accent: [0, 255, 180] },
  { name: 'Midnight',   hueShift: 0,   satMult: 0.6, brightMult: 0.8, accent: [80, 80, 160] },
  { name: 'Sunset',     hueShift: -30, satMult: 1.1, brightMult: 1.0, accent: [255, 150, 80] },
  { name: 'Aurora',     hueShift: 60,  satMult: 1.3, brightMult: 1.0, accent: [100, 255, 150] },
  { name: 'Void',       hueShift: 0,   satMult: 0.3, brightMult: 0.6, accent: [120, 120, 140] },
  { name: 'Plasma',     hueShift: 45,  satMult: 1.5, brightMult: 1.2, accent: [255, 80, 255] },
];

/** Star style definitions. 34 different star appearances. */
const STAR_STYLES = [];
(function() {
  const shapes = ['circle', 'diamond', 'cross', 'dot', 'ring', 'triangle',
    'square', 'spark', 'hex', 'asterisk', 'crescent', 'teardrop', 'flower',
    'spiral', 'arrow', 'wave', 'bolt'];
  const sizes = ['tiny', 'small'];
  let idx = 0;
  for (const shape of shapes) {
    for (const size of sizes) {
      STAR_STYLES.push({ id: idx, shape, size, name: `${shape} (${size})` });
      idx++;
      if (idx >= 34) break;
    }
    if (idx >= 34) break;
  }
})();

/**
 * ThemeManager handles theme state and provides color transforms.
 */
class ThemeManager {
  constructor() {
    /** @type {number} Active theme index. */
    this.themeIndex = 0;
    /** @type {number} Active star style index. */
    this.starStyleIndex = 0;
  }

  /** Get the active theme. */
  getTheme() { return THEMES[this.themeIndex]; }

  /** Get the active star style. */
  getStarStyle() { return STAR_STYLES[this.starStyleIndex]; }

  /**
   * Apply theme hue shift to a base hue.
   * @param {number} hue - Base hue (0-360).
   * @returns {number} Shifted hue.
   */
  shiftHue(hue) {
    return (hue + this.getTheme().hueShift + 360) % 360;
  }

  /**
   * Apply theme to an HSL color.
   * @param {number} h - Hue (0-360).
   * @param {number} s - Saturation (0-100).
   * @param {number} l - Lightness (0-100).
   * @returns {string} CSS hsl string.
   */
  applyTheme(h, s, l) {
    const t = this.getTheme();
    const nh = (h + t.hueShift + 360) % 360;
    const ns = Math.min(100, s * t.satMult);
    const nl = Math.min(100, l * t.brightMult);
    return `hsl(${nh}, ${ns}%, ${nl}%)`;
  }

  /**
   * Get CSS accent color for current theme.
   * @returns {string}
   */
  getAccentCSS() {
    const a = this.getTheme().accent;
    return `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { THEMES, STAR_STYLES, ThemeManager };
}
