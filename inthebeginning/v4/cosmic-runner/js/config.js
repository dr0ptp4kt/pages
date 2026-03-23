/**
 * Configuration constants for Cosmic Runner V3.
 */

/** Grid dimensions for the visualizer. */
const GRID_SIZE = 64;
const GRID_CELLS = GRID_SIZE * GRID_SIZE;

/** Track color schemes — each track gets a unique palette.
 * First 6 tracks = Universe 1 (Big Bang -> present day)
 * Last 6 tracks = Universe 2 (echo of first, shifted hues)
 */
const TRACK_COLORS = [
  // Universe 1
  { name: 'Ember',    primary: [255, 80, 40],   secondary: [255, 160, 60],  bg: [30, 8, 5],    starTint: [255, 120, 80],   hueBase: 10 },
  { name: 'Torrent',  primary: [40, 120, 255],  secondary: [100, 180, 255], bg: [5, 12, 30],   starTint: [80, 140, 255],   hueBase: 210 },
  { name: 'Quartz',   primary: [200, 180, 255], secondary: [160, 140, 220], bg: [15, 12, 25],  starTint: [180, 160, 255],  hueBase: 270 },
  { name: 'Tide',     primary: [40, 200, 180],  secondary: [80, 220, 200],  bg: [5, 20, 18],   starTint: [60, 200, 180],   hueBase: 170 },
  { name: 'Root',     primary: [120, 200, 60],  secondary: [160, 220, 100], bg: [10, 20, 5],   starTint: [100, 200, 80],   hueBase: 90 },
  { name: 'Glacier',  primary: [140, 220, 255], secondary: [180, 240, 255], bg: [10, 18, 25],  starTint: [160, 220, 255],  hueBase: 195 },
  // Universe 2 (echoed but shifted)
  { name: 'Bloom',    primary: [255, 100, 80],  secondary: [255, 180, 100], bg: [28, 10, 8],   starTint: [255, 140, 100],  hueBase: 15 },
  { name: 'Dusk',     primary: [80, 100, 255],  secondary: [140, 160, 255], bg: [8, 10, 28],   starTint: [100, 120, 255],  hueBase: 225 },
  { name: 'Coral',    primary: [255, 140, 180], secondary: [255, 180, 200], bg: [25, 12, 18],  starTint: [255, 160, 190],  hueBase: 340 },
  { name: 'Moss',     primary: [80, 180, 120],  secondary: [120, 200, 150], bg: [8, 18, 10],   starTint: [100, 180, 130],  hueBase: 140 },
  { name: 'Thunder',  primary: [180, 140, 255], secondary: [200, 170, 255], bg: [15, 12, 28],  starTint: [190, 150, 255],  hueBase: 280 },
  { name: 'Horizon',  primary: [255, 200, 100], secondary: [255, 220, 140], bg: [25, 18, 8],   starTint: [255, 210, 120],  hueBase: 40 },
];

/** Universe epoch names mapped to track progression. */
const EPOCH_NAMES = [
  'Quantum Fluctuation',   // Track 1
  'Inflation',             // Track 2
  'Quark-Gluon Plasma',    // Track 3
  'Nucleosynthesis',       // Track 4
  'Recombination',         // Track 5
  'Dark Ages',             // Track 6
  'First Stars',           // Track 7
  'Galaxy Formation',      // Track 8
  'Solar Ignition',        // Track 9
  'Hadean Earth',          // Track 10
  'Abiogenesis',           // Track 11
  'Emergence of Life',     // Track 12
];

/** Spacetime distance milestones (years after Big Bang mapped to E notation).
 * The universe is ~13.8 billion years old. We traverse from t=0 to t~1.38E10.
 * Each track covers a cosmological epoch. */
const SPACETIME_SCALE = 1.38e10; // Total years (Big Bang to present)

/** Scoring rules. */
const SCORE = {
  HIT_OBJECT: 1,
  JUMP_OVER: 3,
};

/** Glow threshold: >50% of track without hitting = glow activated. */
const GLOW_THRESHOLD = 0.5;

/** Number of levels before full 3D. */
const FULL_3D_LEVEL = 6;

/** Speed range for user control. */
const SPEED_MIN = 0.5;
const SPEED_MAX = 2.5;
const SPEED_STEP = 0.25;

/** Default player horizontal positions (fraction of screen width). */
const PLAYER1_DEFAULT_POS = 0.33;
const PLAYER2_DEFAULT_POS_LEFT = 0.35;
const PLAYER2_DEFAULT_POS_RIGHT = 0.65;
const PLAYER_POS_MIN_1P = 0.33;
const PLAYER_POS_MAX_1P = 0.66;
const PLAYER_POS_MIN_2P = 0.20;
const PLAYER_POS_MAX_2P = 0.80;
const PLAYER_MIN_SEPARATION = 0.10; // minimum fraction between two players

/** Accessibility modes. */
const ACCESS_MODES = {
  minimal: { stars: false, blastZoom: false, glow: false, glimmer: false, colorIntensity: 0.6, cellExplode: false, blastBrightness: 0 },
  normal:  { stars: true,  blastZoom: true,  glow: true,  glimmer: false, colorIntensity: 1.0, cellExplode: true,  blastBrightness: 0.25 },
  flashy:  { stars: true,  blastZoom: true,  glow: true,  glimmer: true,  colorIntensity: 1.3, cellExplode: true,  blastBrightness: 0.45 },
};

/** MIDI instrument sound mutation presets (16 types). */
const MIDI_MUTATIONS = [
  { name: 'Original',       pitchShift: 0,  tempoMult: 1.0,  reverb: 0,   filter: 'none' },
  { name: 'Celestial',      pitchShift: 12, tempoMult: 0.8,  reverb: 0.6, filter: 'lowpass' },
  { name: 'Subterranean',   pitchShift: -12, tempoMult: 1.1, reverb: 0.3, filter: 'lowpass' },
  { name: 'Crystal',        pitchShift: 7,  tempoMult: 0.9,  reverb: 0.5, filter: 'highpass' },
  { name: 'Nebula',         pitchShift: 5,  tempoMult: 0.7,  reverb: 0.8, filter: 'bandpass' },
  { name: 'Quantum',        pitchShift: -5, tempoMult: 1.3,  reverb: 0.2, filter: 'none' },
  { name: 'Solar Wind',     pitchShift: 3,  tempoMult: 1.0,  reverb: 0.4, filter: 'highpass' },
  { name: 'Deep Space',     pitchShift: -7, tempoMult: 0.6,  reverb: 0.9, filter: 'lowpass' },
  { name: 'Pulsar',         pitchShift: 0,  tempoMult: 1.5,  reverb: 0.1, filter: 'bandpass' },
  { name: 'Cosmic Ray',     pitchShift: 4,  tempoMult: 1.2,  reverb: 0.3, filter: 'highpass' },
  { name: 'Dark Matter',    pitchShift: -3, tempoMult: 0.85, reverb: 0.7, filter: 'lowpass' },
  { name: 'Supernova',      pitchShift: 2,  tempoMult: 1.4,  reverb: 0.5, filter: 'none' },
  { name: 'Event Horizon',  pitchShift: -9, tempoMult: 0.5,  reverb: 1.0, filter: 'lowpass' },
  { name: 'Starlight',      pitchShift: 9,  tempoMult: 0.95, reverb: 0.4, filter: 'highpass' },
  { name: 'Graviton',       pitchShift: -2, tempoMult: 1.1,  reverb: 0.6, filter: 'bandpass' },
  { name: 'Photon',         pitchShift: 6,  tempoMult: 1.0,  reverb: 0.2, filter: 'none' },
];

/** MIDI back listing capacity. */
const MIDI_BACK_LIST_MAX = 144;

/** Speed clamping: stop increasing after this many MIDIs. */
const MIDI_SPEED_CLAMP_LEVEL = 12;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GRID_SIZE, GRID_CELLS, TRACK_COLORS, EPOCH_NAMES, SPACETIME_SCALE,
    SCORE, GLOW_THRESHOLD, FULL_3D_LEVEL, SPEED_MIN, SPEED_MAX, SPEED_STEP,
    PLAYER1_DEFAULT_POS, PLAYER2_DEFAULT_POS_LEFT, PLAYER2_DEFAULT_POS_RIGHT,
    PLAYER_POS_MIN_1P, PLAYER_POS_MAX_1P, PLAYER_POS_MIN_2P, PLAYER_POS_MAX_2P,
    PLAYER_MIN_SEPARATION, ACCESS_MODES, MIDI_MUTATIONS, MIDI_BACK_LIST_MAX,
    MIDI_SPEED_CLAMP_LEVEL };
}
