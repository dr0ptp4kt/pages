/**
 * Grid Engine for In The Beginning Visualizer
 *
 * Maps MIDI notes and instruments to a 64x64 grid of cells.
 * Handles color calculation, hue rotation, and cell state management.
 *
 * Y-axis (rows 0-63): Pitch -- MIDI notes 24-87 (C1 to Eb6).
 *   Row 0 = highest pitch (MIDI 87), Row 63 = lowest (MIDI 24).
 * X-axis (columns 0-63): Instrument channels.
 * Color hue: Instrument family.
 * Saturation/brightness: Velocity.
 */

// Instrument family to base hue mapping (degrees)
// Uses var so synth-engine.js can extend it without redeclaration errors
var FAMILY_HUES = {
  strings: 0,       // red
  keys: 220,        // blue
  winds: 120,       // green
  percussion: 50,   // yellow
  world: 280,       // purple
  synth: 180,       // cyan
  voice: 0          // white (special case: low saturation)
};

// Default family assignment by instrument name heuristics
const INSTRUMENT_FAMILY_HINTS = {
  violin: 'strings', viola: 'strings', cello: 'strings', bass: 'strings',
  contrabass: 'strings', harp: 'strings', guitar: 'strings', banjo: 'strings',
  fiddle: 'strings', sitar: 'world', erhu: 'world', koto: 'world',
  piano: 'keys', organ: 'keys', harpsichord: 'keys', celesta: 'keys',
  keyboard: 'keys', clavinet: 'keys', accordion: 'keys',
  flute: 'winds', oboe: 'winds', clarinet: 'winds', bassoon: 'winds',
  saxophone: 'winds', trumpet: 'winds', trombone: 'winds', horn: 'winds',
  tuba: 'winds', piccolo: 'winds', recorder: 'winds',
  drums: 'percussion', timpani: 'percussion', xylophone: 'percussion',
  marimba: 'percussion', vibraphone: 'percussion', glockenspiel: 'percussion',
  snare: 'percussion', cymbal: 'percussion', bongo: 'percussion',
  conga: 'percussion', tambourine: 'percussion', triangle: 'percussion',
  tabla: 'world', djembe: 'world', kalimba: 'world', didgeridoo: 'world',
  shamisen: 'world', bouzouki: 'world', oud: 'world', balalaika: 'world',
  synth: 'synth', synthesizer: 'synth', pad: 'synth', lead: 'synth',
  voice: 'voice', choir: 'voice', vocal: 'voice', soprano: 'voice',
  alto: 'voice', tenor: 'voice', baritone: 'voice'
};

const GRID_SIZE = 64;
const MIDI_LOW = 24;    // C1
const MIDI_HIGH = 87;   // Eb6

/**
 * Grid manages the 64x64 visualization grid.
 */
class Grid {
  /**
   * Create a new Grid instance.
   * @param {HTMLElement|null} container - DOM element to hold the grid (null for headless).
   */
  constructor(container) {
    /** @type {HTMLElement|null} */
    this.container = container;

    /** @type {HTMLElement[]} */
    this.cells = [];

    /** @type {Map<string, number>} instrument name -> column index */
    this.instrumentColumns = new Map();

    /** @type {number} Next available column */
    this.nextColumn = 0;

    /** @type {Map<string, string>} instrument name -> family */
    this.instrumentFamilies = new Map();

    /** @type {number} Current hue rotation offset in degrees */
    this.hueOffset = 0;

    /** @type {Set<number>} Set of cell indices currently active */
    this.activeCells = new Set();

    /** @type {Map<number, {hue: number, sat: number, light: number, bend: boolean}>} */
    this.cellColors = new Map();

    if (container) {
      this._buildDOM();
    }
  }

  /**
   * Build the 64x64 grid of DOM elements.
   * @private
   */
  _buildDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('grid-container');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      fragment.appendChild(cell);
      this.cells.push(cell);
    }
    this.container.appendChild(fragment);
  }

  /**
   * Set the instrument family mapping from score data.
   * @param {Object<string, string>} familyMap - instrument name -> family name
   */
  setInstrumentFamilies(familyMap) {
    this.instrumentFamilies.clear();
    for (const [inst, family] of Object.entries(familyMap)) {
      this.instrumentFamilies.set(inst.toLowerCase(), family.toLowerCase());
    }
  }

  /**
   * Pre-assign instrument columns from a list of instrument names.
   * @param {string[]} instruments - Ordered list of instrument names.
   */
  preassignColumns(instruments) {
    this.instrumentColumns.clear();
    this.nextColumn = 0;
    for (const inst of instruments) {
      const key = inst.toLowerCase();
      if (!this.instrumentColumns.has(key)) {
        this.instrumentColumns.set(key, this.nextColumn % GRID_SIZE);
        this.nextColumn++;
      }
    }
  }

  /**
   * Get or assign a column index for an instrument.
   * @param {string} instrument - Instrument name.
   * @returns {number} Column index (0-63).
   */
  getColumn(instrument) {
    const key = instrument.toLowerCase();
    if (this.instrumentColumns.has(key)) {
      return this.instrumentColumns.get(key);
    }
    const col = this.nextColumn % GRID_SIZE;
    this.instrumentColumns.set(key, col);
    this.nextColumn++;
    return col;
  }

  /**
   * Get the family for an instrument, using the explicit map or heuristics.
   * @param {string} instrument - Instrument name.
   * @returns {string} Family name.
   */
  getFamily(instrument) {
    const key = instrument.toLowerCase();
    if (this.instrumentFamilies.has(key)) {
      return this.instrumentFamilies.get(key);
    }
    // Try heuristic matching
    for (const [hint, family] of Object.entries(INSTRUMENT_FAMILY_HINTS)) {
      if (key.includes(hint)) {
        return family;
      }
    }
    return 'synth'; // default
  }

  /**
   * Convert a MIDI note number to a grid row.
   * Row 0 = highest pitch (MIDI 87), Row 63 = lowest (MIDI 24).
   * Notes outside the range are clamped.
   * @param {number} midiNote - MIDI note number.
   * @returns {number} Row index (0-63).
   */
  static noteToRow(midiNote) {
    const clamped = Math.max(MIDI_LOW, Math.min(MIDI_HIGH, midiNote));
    return MIDI_HIGH - clamped;
  }

  /**
   * Convert a grid row back to a MIDI note number.
   * @param {number} row - Row index (0-63).
   * @returns {number} MIDI note number.
   */
  static rowToNote(row) {
    return MIDI_HIGH - row;
  }

  /**
   * Calculate the HSL color for an instrument at a given velocity.
   * @param {string} instrument - Instrument name.
   * @param {number} velocity - Velocity 0.0 to 1.0.
   * @returns {{hue: number, sat: number, light: number, isVoice: boolean}}
   */
  calculateColor(instrument, velocity) {
    const family = this.getFamily(instrument);
    const isVoice = (family === 'voice');
    const baseHue = FAMILY_HUES[family] || 0;
    const hue = (baseHue + this.hueOffset) % 360;
    // Saturation: 60-100% based on velocity (voice gets low saturation for white)
    const sat = isVoice ? 10 : 60 + velocity * 40;
    // Lightness: 30-90% based on velocity
    const light = 30 + velocity * 60;
    return { hue, sat, light, isVoice };
  }

  /**
   * Get the cell index for a row and column.
   * @param {number} row - Row (0-63).
   * @param {number} col - Column (0-63).
   * @returns {number} Cell index.
   */
  static cellIndex(row, col) {
    return row * GRID_SIZE + col;
  }

  /**
   * Get the dominant hue from currently active cells.
   * @returns {number} Dominant hue in degrees.
   */
  getDominantHue() {
    if (this.cellColors.size === 0) return 200;
    // Average the hues using circular mean
    let sinSum = 0, cosSum = 0;
    for (const color of this.cellColors.values()) {
      const rad = color.hue * Math.PI / 180;
      sinSum += Math.sin(rad);
      cosSum += Math.cos(rad);
    }
    let avg = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
    if (avg < 0) avg += 360;
    return avg;
  }

  /**
   * Apply a set of note events to the grid, updating active cells.
   * @param {Array<{note: number, inst: string, vel: number, bend?: number, ch?: number}>} events
   *   Active note events at the current time.
   */
  updateGrid(events) {
    const newActive = new Set();
    const newColors = new Map();

    for (const ev of events) {
      const row = Grid.noteToRow(ev.note);
      const col = ev.ch !== undefined ? ev.ch % GRID_SIZE : this.getColumn(ev.inst);
      const idx = Grid.cellIndex(row, col);
      const color = this.calculateColor(ev.inst, ev.vel);
      const hasBend = ev.bend !== undefined && ev.bend !== 0;

      newActive.add(idx);
      newColors.set(idx, {
        hue: color.hue,
        sat: color.sat,
        light: color.light,
        bend: hasBend
      });
    }

    // Diff and update DOM
    if (this.cells.length > 0) {
      // Deactivate cells no longer active
      for (const idx of this.activeCells) {
        if (!newActive.has(idx)) {
          const cell = this.cells[idx];
          if (cell) {
            cell.classList.remove('active', 'bending');
            cell.style.backgroundColor = '';
            cell.style.boxShadow = '';
          }
        }
      }

      // Activate or update active cells
      for (const idx of newActive) {
        const cell = this.cells[idx];
        if (!cell) continue;
        const c = newColors.get(idx);
        const hsl = `hsl(${c.hue}, ${c.sat}%, ${c.light}%)`;
        cell.classList.add('active');
        cell.style.backgroundColor = hsl;

        if (c.bend) {
          cell.classList.add('bending');
          cell.style.boxShadow = `0 0 8px ${hsl}, 0 0 4px ${hsl}, inset 0 0 2px rgba(255,255,255,0.3)`;
        } else {
          cell.classList.remove('bending');
          cell.style.boxShadow = `0 0 4px ${hsl}, inset 0 0 2px rgba(255,255,255,0.3)`;
        }
      }
    }

    this.activeCells = newActive;
    this.cellColors = newColors;
  }

  /**
   * Clear all active cells.
   */
  clearGrid() {
    if (this.cells.length > 0) {
      for (const idx of this.activeCells) {
        const cell = this.cells[idx];
        if (cell) {
          cell.classList.remove('active', 'bending');
          cell.style.backgroundColor = '';
          cell.style.boxShadow = '';
        }
      }
    }
    this.activeCells.clear();
    this.cellColors.clear();
  }

  /**
   * Rotate the hue offset by a given number of degrees.
   * @param {number} degrees - Degrees to rotate.
   */
  rotateHue(degrees) {
    this.hueOffset = (this.hueOffset + degrees) % 360;
  }

  /**
   * Set the hue offset to a specific value.
   * @param {number} degrees - Hue offset in degrees.
   */
  setHueOffset(degrees) {
    this.hueOffset = degrees % 360;
  }

  /**
   * Reset instrument column assignments.
   */
  resetColumns() {
    this.instrumentColumns.clear();
    this.nextColumn = 0;
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Grid, FAMILY_HUES, INSTRUMENT_FAMILY_HINTS, GRID_SIZE, MIDI_LOW, MIDI_HIGH };
}
