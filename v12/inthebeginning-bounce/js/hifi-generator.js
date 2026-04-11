/**
 * HiFi Generator — Album-quality music generation for the browser.
 *
 * Ports the Python radio_engine.py's MIDI-fragment-based compositional
 * algorithm to JavaScript. Uses SpessaSynth (via SpessaBridge) for
 * FluidSynth-equivalent SoundFont rendering with FluidR3_GM.sf2.
 *
 * Pipeline:
 *   1. Plan 30-minute composition as mood segments (42-210s each)
 *   2. Per segment: select MIDI file from catalog, extract N bars
 *   3. Transpose + snap to target scale, build consonant chords
 *   4. Structure into rondo form (ABACA, ABCBA, etc.)
 *   5. Schedule notes through SpessaBridge → SpessaSynth → SF2 samples
 *   6. Emit note events for grid/game visualization
 *
 * Ported from: apps/audio/radio_engine.py (10,100 lines)
 * Source algorithms: sample_bars_seeded, _build_chord_from_note,
 *   _build_rondo_sections, _plan_segments, MoodSegment
 *
 * @license Apache-2.0 (SpessaSynth), MIT (FluidR3_GM.sf2)
 */

// ──── SCALES (ported from radio_engine.py SCALES dict) ────

const HIFI_SCALES = {
  // Western diatonic modes
  ionian:           [0, 2, 4, 5, 7, 9, 11],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  aeolian:          [0, 2, 3, 5, 7, 8, 10],
  locrian:          [0, 1, 3, 5, 6, 8, 10],
  // Minor variants
  harmonic_minor:   [0, 2, 3, 5, 7, 8, 11],
  melodic_minor:    [0, 2, 3, 5, 7, 9, 11],
  // Pentatonic & blues
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],
  blues:            [0, 3, 5, 6, 7, 10],
  // Whole-tone & chromatic
  whole_tone:       [0, 2, 4, 6, 8, 10],
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  drone:            [0, 7],
  // Japanese
  hirajoshi:        [0, 2, 3, 7, 8],
  in_sen:           [0, 1, 5, 7, 10],
  iwato:            [0, 1, 5, 6, 10],
  yo:               [0, 2, 5, 7, 9],
  miyako_bushi:     [0, 1, 5, 7, 8],
  // Middle Eastern
  hijaz:            [0, 1, 4, 5, 7, 8, 11],
  bayati:           [0, 2, 3, 5, 7, 8, 10],
  rast:             [0, 2, 3, 5, 7, 9, 10],
  nahawand:         [0, 2, 3, 5, 7, 8, 11],
  // Indian
  bhairav:          [0, 1, 4, 5, 7, 8, 11],
  yaman:            [0, 2, 4, 6, 7, 9, 11],
  malkauns:         [0, 3, 5, 8, 10],
  bhairavi:         [0, 1, 3, 5, 7, 8, 10],
  // Chinese / African
  gong:             [0, 2, 4, 7, 9],
};

// ──── EPOCH → MUSICAL CHARACTER (from radio_engine.py EPOCH_MUSIC) ────

const EPOCH_MUSIC = {
  'Planck':          { tempo: [50, 70],   scales: ['chromatic', 'drone', 'whole_tone'],       timeSigs: ['3/4', '3/2'], family: 'cosmic', density: 0.1 },
  'Inflation':       { tempo: [55, 75],   scales: ['pentatonic_major', 'drone', 'whole_tone'], timeSigs: ['4/4', '3/4'], family: 'cosmic', density: 0.15 },
  'Electroweak':     { tempo: [60, 80],   scales: ['phrygian', 'hirajoshi', 'hijaz'],          timeSigs: ['4/4', '6/8', '7/8'], family: 'dark', density: 0.2 },
  'Quark':           { tempo: [65, 90],   scales: ['hirajoshi', 'in_sen', 'bhairav'],          timeSigs: ['4/4', '5/4', '7/8'], family: 'mystical', density: 0.25 },
  'Hadron':          { tempo: [70, 95],   scales: ['pentatonic_minor', 'yo', 'aeolian'],       timeSigs: ['4/4', '6/8', '3/4'], family: 'dark', density: 0.3 },
  'Nucleosynthesis': { tempo: [75, 105],  scales: ['dorian', 'mixolydian', 'rast'],            timeSigs: ['4/4', '3/4', '6/8'], family: 'earthy', density: 0.4 },
  'Recombination':   { tempo: [80, 110],  scales: ['pentatonic_major', 'gong', 'yaman'],       timeSigs: ['4/4', '3/4', '6/8'], family: 'bright', density: 0.5 },
  'Star Formation':  { tempo: [85, 115],  scales: ['lydian', 'hijaz', 'harmonic_minor'],       timeSigs: ['4/4', '6/8', '9/8'], family: 'bright', density: 0.6 },
  'Solar System':    { tempo: [90, 120],  scales: ['ionian', 'harmonic_minor', 'gong'],        timeSigs: ['4/4', '3/4', '6/8', '12/8'], family: 'bright', density: 0.7 },
  'Earth':           { tempo: [90, 125],  scales: ['aeolian', 'miyako_bushi', 'nahawand'],     timeSigs: ['4/4', '3/4', '6/8'], family: 'earthy', density: 0.75 },
  'Life':            { tempo: [95, 130],  scales: ['blues', 'pentatonic_minor', 'malkauns'],    timeSigs: ['4/4', '6/8', '12/8', '5/4'], family: 'earthy', density: 0.8 },
  'DNA Era':         { tempo: [100, 135], scales: ['melodic_minor', 'bhairavi', 'dorian'],     timeSigs: ['4/4', '3/4', '7/8', '5/4'], family: 'dark', density: 0.85 },
  'Present':         { tempo: [100, 140], scales: ['ionian', 'dorian', 'pentatonic_major', 'lydian'], timeSigs: ['4/4', '3/4', '6/8', '5/4', '7/8'], family: 'bright', density: 0.95 },
};

const EPOCH_ORDER = [
  'Planck', 'Inflation', 'Electroweak', 'Quark', 'Hadron',
  'Nucleosynthesis', 'Recombination', 'Star Formation',
  'Solar System', 'Earth', 'Life', 'DNA Era', 'Present',
];

const EPOCH_ROOTS = {
  'Planck': 48, 'Inflation': 50, 'Electroweak': 52, 'Quark': 54,
  'Hadron': 56, 'Nucleosynthesis': 58, 'Recombination': 60,
  'Star Formation': 62, 'Solar System': 64, 'Earth': 66,
  'Life': 68, 'DNA Era': 70, 'Present': 72,
};

// ──── CHORD INTERVALS (from radio_engine.py) ────

const CHORD_INTERVALS = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10],
  sus2: [0, 2, 7], sus4: [0, 5, 7], pow: [0, 7],
};

const DIATONIC_CHORD_QUALITY = {
  ionian:         ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
  dorian:         ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
  phrygian:       ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
  lydian:         ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
  mixolydian:     ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
  aeolian:        ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
  locrian:        ['dim', 'maj', 'min', 'min', 'maj', 'maj', 'min'],
  harmonic_minor: ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim'],
  melodic_minor:  ['min', 'min', 'aug', 'maj', 'maj', 'dim', 'dim'],
};

// Consonant intervals in semitones (Helmholtz)
const CONSONANT_INTERVALS = new Set([3, 4, 5, 7, 8, 9, 12, 15, 16]);

// ──── RONDO PATTERNS (from radio_engine.py) ────

const RONDO_PATTERNS = {
  ABACA:   ['A', 'B', 'A', 'C', 'A'],
  ABACADA: ['A', 'B', 'A', 'C', 'A', 'D', 'A'],
  ABCBA:   ['A', 'B', 'C', 'B', 'A'],
  AABBA:   ['A', 'A', 'B', 'B', 'A'],
  ABCDA:   ['A', 'B', 'C', 'D', 'A'],
  ABACBA:  ['A', 'B', 'A', 'C', 'B', 'A'],
  AABA:    ['A', 'A', 'B', 'A'],
};

// GM instrument assignments per epoch domain
const DOMAIN_GM_PROGRAMS = {
  cosmic:     [48, 89, 95, 88, 91, 52],    // strings ensemble, warm pad, choir, pad
  dark:       [42, 70, 68, 71, 43, 58],     // cello, bassoon, oboe, clarinet, contrabass, tuba
  mystical:   [46, 13, 14, 105, 108, 79],   // harp, xylophone, tubular bell, sitar, kalimba, flute
  earthy:     [40, 73, 0, 24, 42, 32],      // violin, flute, piano, guitar, cello, bass
  bright:     [0, 40, 73, 60, 56, 48],      // piano, violin, flute, french horn, trumpet, strings
};

// Segment duration choices (in seconds, from radio_engine.py)
const SEGMENT_DURATIONS = [42, 84, 84, 126, 126, 168, 210];

// ──── TIME SIGNATURE PARSING ────

function parseTimeSig(sig) {
  const parts = sig.split('/');
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10);
    return { beats: num, unit: parseInt(parts[1], 10) };
  }
  // Additive: "3+3+2/8"
  const m = sig.match(/^([\d+]+)\/(\d+)$/);
  if (m) {
    const beats = m[1].split('+').reduce((a, b) => a + parseInt(b, 10), 0);
    return { beats, unit: parseInt(m[2], 10) };
  }
  return { beats: 4, unit: 4 };
}

// ──── MULBERRY32 PRNG (deterministic, same as MusicGenerator) ────

function mulberry32(seed) {
  let state = seed | 0;
  return function () {
    let t = (state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// SHA-256 hash (simplified — uses Web Crypto if available, else PRNG-based)
async function sha256hex(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple hash
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}

// ──── HIFI GENERATOR CLASS ────

class HiFiGenerator {
  /**
   * @param {SpessaBridge} spessaBridge - SpessaSynth bridge for SoundFont rendering.
   * @param {Object} [options]
   * @param {number} [options.totalDuration=1800] - Total composition length in seconds.
   * @param {number} [options.trackCount=13] - Number of epochs/tracks.
   */
  constructor(spessaBridge, options = {}) {
    /** @type {SpessaBridge} */
    this._bridge = spessaBridge;

    /** @type {number} Total duration in seconds (30 minutes default). */
    this.totalDuration = options.totalDuration || 1800;

    /** @type {number} Number of epoch tracks. */
    this.trackCount = options.trackCount || 13;

    /** @type {number} Duration per track in seconds. */
    this.trackDuration = this.totalDuration / this.trackCount;

    /** @type {number} Master seed. */
    this.seed = 42;

    /** @type {Function} Seeded PRNG. */
    this._rand = mulberry32(42);

    // ──── Playback state ────
    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {number} Current playback position in seconds. */
    this._currentTime = 0;
    /** @type {number} AudioContext.currentTime when playback started. */
    this._startCtxTime = 0;
    /** @type {number} RAF ID. */
    this._rafId = 0;
    /** @type {number} Interval for note event emission. */
    this._emitInterval = 0;

    // ──── Composition data ────
    /** @type {Array} Planned mood segments. */
    this._segments = [];
    /** @type {number} Current segment index. */
    this._currentSegment = -1;
    /** @type {Array} Scheduled note events for current segment. */
    this._scheduledNotes = [];
    /** @type {number} Next note index in schedule. */
    this._nextNote = 0;
    /** @type {string} Current epoch name. */
    this._currentEpoch = '';
    /** @type {number} Current track index (0-based). */
    this._currentTrack = 0;
    /** @type {Array<string>} Track names. */
    this._trackNames = [];

    // ──── MIDI catalog ────
    /** @type {Array} MIDI catalog entries. */
    this._catalog = [];
    /** @type {string} Base URL for MIDI files. */
    this._midiBaseUrl = '';

    // ──── Callbacks ────
    /** @type {Function|null} */
    this.onNoteEvent = null;
    /** @type {Function|null} */
    this.onTrackEnd = null;
    /** @type {Function|null} */
    this.onSegmentChange = null;

    // ──── Active notes for cleanup ────
    /** @type {Map} channel → Set of active note numbers. */
    this._activeNotes = new Map();
  }

  // ──── PUBLIC API ────

  /**
   * Load the MIDI catalog for fragment sampling.
   * @param {string} catalogUrl - URL to midi_catalog.json.
   * @param {string} midiBaseUrl - Base URL for individual MIDI files.
   */
  async loadCatalog(catalogUrl, midiBaseUrl) {
    try {
      const resp = await fetch(catalogUrl);
      if (!resp.ok) throw new Error(`Catalog fetch failed: ${resp.status}`);
      const data = await resp.json();
      this._catalog = data.midis || [];
      this._midiBaseUrl = midiBaseUrl;
      console.log(`HiFiGenerator: Loaded catalog with ${this._catalog.length} MIDI files`);
    } catch (e) {
      console.warn('HiFiGenerator: Catalog load failed:', e.message);
      this._catalog = [];
    }
  }

  /**
   * Generate a complete composition plan (no audio yet).
   * @param {number} [seed] - Random seed (default: 42).
   */
  generate(seed) {
    this.seed = seed !== undefined ? seed : 42;
    this._rand = mulberry32(this.seed);

    this._segments = this._planSegments();
    this._trackNames = [];
    for (let i = 0; i < this.trackCount; i++) {
      const epochIdx = Math.min(i, EPOCH_ORDER.length - 1);
      this._trackNames.push(EPOCH_ORDER[epochIdx]);
    }

    this._currentTrack = 0;
    this._currentSegment = -1;
    this._currentTime = 0;
    console.log(`HiFiGenerator: Generated composition plan — ${this._segments.length} segments, seed=${this.seed}`);
  }

  /**
   * Start playback.
   */
  async play() {
    if (!this._bridge || !this._bridge.ready) {
      console.warn('HiFiGenerator: SpessaBridge not ready');
      return;
    }

    await this._bridge.resume();

    if (this._segments.length === 0) {
      this.generate(this.seed);
    }

    this.isPlaying = true;
    const ctx = this._bridge.getAudioContext();
    this._startCtxTime = ctx.currentTime - this._currentTime;

    // Start the first segment if not started
    if (this._currentSegment < 0) {
      await this._startNextSegment();
    }

    // Start scheduling loop
    this._scheduleLoop();

    // Start note event emission for visualization
    this._emitInterval = setInterval(() => {
      if (!this.isPlaying) return;
      const t = this.getCurrentTime();
      this._emitCurrentNotes(t);
    }, 50); // 20 Hz
  }

  /**
   * Pause playback.
   */
  pause() {
    this._currentTime = this.getCurrentTime();
    this.isPlaying = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (this._emitInterval) {
      clearInterval(this._emitInterval);
      this._emitInterval = 0;
    }
    this._bridge.allNotesOff();
  }

  /**
   * Stop playback and reset.
   */
  stop() {
    this.pause();
    this._currentTime = 0;
    this._currentSegment = -1;
    this._nextNote = 0;
    this._scheduledNotes = [];
  }

  /**
   * Seek to a time position.
   * @param {number} timeSec - Target time in seconds.
   */
  seek(timeSec) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();

    this._currentTime = Math.max(0, Math.min(timeSec, this.totalDuration));

    // Find the segment that contains this time
    let accumulated = 0;
    for (let i = 0; i < this._segments.length; i++) {
      if (accumulated + this._segments[i].duration > this._currentTime) {
        this._currentSegment = i - 1; // Will advance to i on next _startNextSegment
        break;
      }
      accumulated += this._segments[i].duration;
    }

    if (wasPlaying) this.play();
  }

  /**
   * Advance to the next track/epoch.
   */
  nextTrack() {
    this._currentTrack = (this._currentTrack + 1) % this.trackCount;
    this.seek(this._currentTrack * this.trackDuration);
  }

  /**
   * Go to the previous track/epoch.
   */
  prevTrack() {
    this._currentTrack = (this._currentTrack - 1 + this.trackCount) % this.trackCount;
    this.seek(this._currentTrack * this.trackDuration);
  }

  /** @returns {number} Current playback position in seconds. */
  getCurrentTime() {
    if (!this.isPlaying) return this._currentTime;
    const ctx = this._bridge?.getAudioContext();
    if (!ctx) return this._currentTime;
    return ctx.currentTime - this._startCtxTime;
  }

  /** @returns {number} Total duration in seconds. */
  getDuration() {
    return this.totalDuration;
  }

  /** @returns {string} Current track/epoch name. */
  getCurrentTrackName() {
    return this._currentEpoch || this._trackNames[this._currentTrack] || 'HiFi';
  }

  /** @returns {number} Current track index. */
  getCurrentTrackIndex() {
    return this._currentTrack;
  }

  // ──── SEGMENT PLANNING (from radio_engine.py _plan_segments) ────

  _planSegments() {
    const segments = [];
    let accumulated = 0;
    let segIdx = 0;

    while (accumulated < this.totalDuration) {
      const remaining = this.totalDuration - accumulated;
      const durChoice = SEGMENT_DURATIONS[Math.floor(this._rand() * SEGMENT_DURATIONS.length)];
      const duration = Math.min(durChoice, remaining);
      if (duration < 10) break;

      // Map time position to epoch
      const progress = accumulated / this.totalDuration;
      const epochIdx = Math.min(Math.floor(progress * EPOCH_ORDER.length), EPOCH_ORDER.length - 1);
      const epochName = EPOCH_ORDER[epochIdx];
      const epochConfig = EPOCH_MUSIC[epochName];

      // Build mood segment
      const mood = this._buildMoodSegment(segIdx, epochName, epochConfig);
      mood.startTime = accumulated;
      mood.duration = duration;

      segments.push(mood);
      accumulated += duration;
      segIdx++;
    }

    return segments;
  }

  /**
   * Build a mood segment with musical parameters.
   * Ported from radio_engine.py MoodSegment.
   */
  _buildMoodSegment(segIdx, epochName, epochConfig) {
    const [tempoLo, tempoHi] = epochConfig.tempo;
    const tempo = tempoLo + Math.floor(this._rand() * (tempoHi - tempoLo));

    const scaleName = epochConfig.scales[Math.floor(this._rand() * epochConfig.scales.length)];
    const scale = HIFI_SCALES[scaleName] || HIFI_SCALES.ionian;

    const root = EPOCH_ROOTS[epochName] || 60;
    const timeSig = epochConfig.timeSigs[Math.floor(this._rand() * epochConfig.timeSigs.length)];
    const { beats: beatsPerBar } = parseTimeSig(timeSig);

    // Select GM instruments for this segment based on domain
    const domainPrograms = DOMAIN_GM_PROGRAMS[epochConfig.family] || DOMAIN_GM_PROGRAMS.bright;
    const nInstruments = 2 + Math.floor(this._rand() * 3); // 2-4 instruments
    const instruments = [];
    for (let i = 0; i < nInstruments; i++) {
      instruments.push(domainPrograms[Math.floor(this._rand() * domainPrograms.length)]);
    }

    // Select rondo pattern
    const rondoNames = Object.keys(RONDO_PATTERNS);
    const rondoName = rondoNames[Math.floor(this._rand() * rondoNames.length)];

    return {
      segIdx,
      epoch: epochName,
      tempo,
      scaleName,
      scale,
      root,
      timeSig,
      beatsPerBar,
      instruments,
      rondoName,
      density: epochConfig.density,
      family: epochConfig.family,
      startTime: 0,
      duration: 0,
    };
  }

  // ──── MIDI FRAGMENT SAMPLING (from radio_engine.py sample_bars_seeded) ────

  /**
   * Fetch and parse a MIDI file from the catalog, extract bars.
   * @param {Object} mood - Mood segment configuration.
   * @returns {Promise<Array>} Array of {t, note, dur, vel} objects.
   */
  async _sampleMidiBars(mood) {
    if (this._catalog.length === 0) {
      return this._generateFallbackBars(mood);
    }

    // Deterministic MIDI file selection via hash
    const stateStr = `${this.seed}_${mood.segIdx}_${mood.epoch}`;
    const hash = await sha256hex(stateStr);
    const idx = parseInt(hash.substring(0, 8), 16) % this._catalog.length;

    const entry = this._catalog[idx];
    const midiUrl = this._midiBaseUrl + '/' + entry.path;

    try {
      // Fetch MIDI file
      const resp = await fetch(midiUrl);
      if (!resp.ok) return this._generateFallbackBars(mood);
      const midiBuffer = await resp.arrayBuffer();

      // Parse MIDI (simplified — extract note events)
      const notes = this._parseMidiNotes(new Uint8Array(midiBuffer));
      if (notes.length < 8) return this._generateFallbackBars(mood);

      // Calculate segment in ticks
      const tpb = 480; // Standard ticks per beat
      const ticksPerBar = tpb * mood.beatsPerBar;
      const nBars = Math.max(4, Math.min(12, Math.floor(mood.duration / (60 / mood.tempo * mood.beatsPerBar))));
      const segmentTicks = ticksPerBar * nBars;

      // Try 3 offsets, pick best loop score
      let bestStart = 0, bestScore = -1;
      const maxOnset = notes.length > 0 ? notes[notes.length - 1].t : 0;

      for (let attempt = 0; attempt < 3; attempt++) {
        const h2 = await sha256hex(stateStr + attempt);
        const candidate = parseInt(h2.substring(8, 16), 16) % Math.max(1, maxOnset);
        const score = this._assessLoopFriendliness(notes, candidate, candidate + segmentTicks, tpb);
        if (score > bestScore) {
          bestScore = score;
          bestStart = candidate;
        }
      }

      // Extract notes in window
      const startTick = bestStart;
      const endTick = startTick + segmentTicks;
      const secsPerTick = 60.0 / (mood.tempo * tpb);

      const segmentNotes = notes
        .filter(n => n.t >= startTick && n.t < endTick)
        .map(n => ({
          t: (n.t - startTick) * secsPerTick,
          note: n.note,
          dur: Math.max(0.02, n.dur * secsPerTick),
          vel: Math.max(0.1, Math.min(1.0, n.vel / 127)),
        }));

      if (segmentNotes.length === 0) return this._generateFallbackBars(mood);

      // Transpose to root and snap to scale
      const pitches = segmentNotes.map(n => n.note);
      const center = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const offset = mood.root - center;

      return segmentNotes.map(n => ({
        t: n.t,
        note: this._snapToScale(Math.round(n.note + offset), mood.root, mood.scale),
        dur: n.dur,
        vel: n.vel,
      }));
    } catch (e) {
      console.warn('HiFiGenerator: MIDI fetch/parse failed:', e.message);
      return this._generateFallbackBars(mood);
    }
  }

  /**
   * Simplified MIDI parser — extracts note events from a MIDI file buffer.
   * Handles Format 0 and Format 1 Standard MIDI Files.
   */
  _parseMidiNotes(data) {
    const notes = [];
    let pos = 0;

    // Read header
    if (data[0] !== 0x4D || data[1] !== 0x54 || data[2] !== 0x68 || data[3] !== 0x64) {
      return notes; // Not a MIDI file
    }
    pos = 8; // Skip MThd + length
    const format = (data[pos] << 8) | data[pos + 1]; pos += 2;
    const nTracks = (data[pos] << 8) | data[pos + 1]; pos += 2;
    const tpb = (data[pos] << 8) | data[pos + 1]; pos += 2;

    // Parse tracks
    for (let track = 0; track < nTracks; track++) {
      if (pos + 8 > data.length) break;
      // Find MTrk
      if (data[pos] !== 0x4D || data[pos+1] !== 0x54 || data[pos+2] !== 0x72 || data[pos+3] !== 0x6B) {
        break;
      }
      pos += 4;
      const trackLen = (data[pos] << 24) | (data[pos+1] << 16) | (data[pos+2] << 8) | data[pos+3];
      pos += 4;
      const trackEnd = pos + trackLen;

      let tick = 0;
      let runningStatus = 0;
      const noteOns = new Map(); // note → {tick, vel}

      while (pos < trackEnd && pos < data.length) {
        // Read variable-length delta
        let delta = 0;
        while (pos < data.length) {
          const b = data[pos++];
          delta = (delta << 7) | (b & 0x7F);
          if ((b & 0x80) === 0) break;
        }
        tick += delta;

        if (pos >= data.length) break;
        let status = data[pos];

        // Running status
        if (status < 0x80) {
          status = runningStatus;
        } else {
          pos++;
          if (status >= 0x80 && status < 0xF0) {
            runningStatus = status;
          }
        }

        const type = status & 0xF0;
        const ch = status & 0x0F;

        if (type === 0x90 && pos + 1 < data.length) {
          // Note on
          const note = data[pos++];
          const vel = data[pos++];
          if (vel > 0) {
            noteOns.set(note + ch * 128, { tick, vel });
          } else {
            // vel=0 is note off
            const on = noteOns.get(note + ch * 128);
            if (on) {
              notes.push({ t: on.tick, note, dur: tick - on.tick, vel: on.vel, ch });
              noteOns.delete(note + ch * 128);
            }
          }
        } else if (type === 0x80 && pos + 1 < data.length) {
          // Note off
          const note = data[pos++];
          pos++; // velocity (ignore)
          const on = noteOns.get(note + ch * 128);
          if (on) {
            notes.push({ t: on.tick, note, dur: tick - on.tick, vel: on.vel, ch });
            noteOns.delete(note + ch * 128);
          }
        } else if (type === 0xA0 || type === 0xB0 || type === 0xE0) {
          pos += 2; // 2-byte messages
        } else if (type === 0xC0 || type === 0xD0) {
          pos += 1; // 1-byte messages
        } else if (status === 0xFF) {
          // Meta event
          if (pos < data.length) {
            const metaType = data[pos++];
            let metaLen = 0;
            while (pos < data.length) {
              const b = data[pos++];
              metaLen = (metaLen << 7) | (b & 0x7F);
              if ((b & 0x80) === 0) break;
            }
            pos += metaLen;
          }
        } else if (status === 0xF0 || status === 0xF7) {
          // SysEx
          let sysexLen = 0;
          while (pos < data.length) {
            const b = data[pos++];
            sysexLen = (sysexLen << 7) | (b & 0x7F);
            if ((b & 0x80) === 0) break;
          }
          pos += sysexLen;
        }
      }

      // Close any unclosed notes
      for (const [key, on] of noteOns) {
        const note = key % 128;
        notes.push({ t: on.tick, note, dur: tpb * 2, vel: on.vel, ch: Math.floor(key / 128) });
      }
    }

    // Sort by time
    notes.sort((a, b) => a.t - b.t);
    return notes;
  }

  /**
   * Assess how well a section loops (from radio_engine.py).
   * Score 0-1 based on pitch overlap at boundaries, density balance, clean endings.
   */
  _assessLoopFriendliness(notes, startTick, endTick, tpb) {
    const seg = notes.filter(n => n.t >= startTick && n.t < endTick);
    if (seg.length < 4) return 0;

    const mid = (startTick + endTick) / 2;
    const firstHalf = seg.filter(n => n.t < mid);
    const secondHalf = seg.filter(n => n.t >= mid);

    // Pitch class overlap at boundaries
    const firstPCs = new Set(firstHalf.slice(-4).map(n => n.note % 12));
    const lastPCs = new Set(secondHalf.slice(0, 4).map(n => n.note % 12));
    let overlap = 0;
    for (const pc of firstPCs) if (lastPCs.has(pc)) overlap++;
    const overlapScore = Math.min(overlap / 3, 1) * 0.4;

    // Density balance
    const ratio = firstHalf.length / Math.max(1, secondHalf.length);
    const balanceScore = (1 - Math.abs(1 - ratio)) * 0.3;

    // Clean endings (notes don't extend past boundary)
    const cutNotes = seg.filter(n => n.t + n.dur > endTick);
    const cutRatio = cutNotes.length / Math.max(1, seg.length);
    const endScore = (1 - cutRatio) * 0.3;

    return Math.min(overlapScore + balanceScore + endScore, 1);
  }

  /**
   * Generate fallback bars when MIDI catalog is unavailable.
   * Uses procedural generation similar to MusicGenerator.
   */
  _generateFallbackBars(mood) {
    const beatDur = 60 / mood.tempo;
    const barDur = beatDur * mood.beatsPerBar;
    const nBars = Math.max(4, Math.ceil(mood.duration / barDur));
    const notes = [];

    for (let bar = 0; bar < nBars; bar++) {
      const barStart = bar * barDur;
      // Melody note
      const scaleIdx = Math.floor(this._rand() * mood.scale.length);
      const note = mood.root + mood.scale[scaleIdx] + (this._rand() < 0.3 ? 12 : 0);
      const dur = beatDur * (1 + Math.floor(this._rand() * 2));
      notes.push({ t: barStart, note, dur, vel: 0.5 + this._rand() * 0.4 });

      // Harmony note (50% chance)
      if (this._rand() < 0.5 * mood.density) {
        const hIdx = Math.floor(this._rand() * mood.scale.length);
        const hNote = mood.root + mood.scale[hIdx] - 12;
        notes.push({ t: barStart + beatDur, note: hNote, dur: beatDur, vel: 0.3 + this._rand() * 0.3 });
      }
    }

    return notes;
  }

  // ──── HARMONY (from radio_engine.py) ────

  /**
   * Snap a MIDI note to the nearest scale tone.
   */
  _snapToScale(note, root, scale) {
    const pc = ((note - root) % 12 + 12) % 12;
    let closest = scale[0];
    let minDist = 12;
    for (const s of scale) {
      const dist = Math.min(Math.abs(pc - s), 12 - Math.abs(pc - s));
      if (dist < minDist) {
        minDist = dist;
        closest = s;
      }
    }
    return root + closest + Math.floor((note - root) / 12) * 12;
  }

  /**
   * Build a consonant chord from a note (from radio_engine.py _build_chord_from_note).
   */
  _buildChordFromNote(note, root, scaleName, scale) {
    const snapped = this._snapToScale(note, root, scale);
    const pc = ((snapped - root) % 12 + 12) % 12;

    // Find scale degree
    let degree = 0;
    for (let i = 0; i < scale.length; i++) {
      if (scale[i] === pc) { degree = i; break; }
    }

    // Look up chord quality
    const qualities = DIATONIC_CHORD_QUALITY[scaleName] || DIATONIC_CHORD_QUALITY.ionian;
    const quality = qualities[degree % qualities.length] || 'maj';
    const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS.maj;

    // Build chord
    const chord = intervals.map(i => snapped + i);

    // Enforce consonance (Helmholtz)
    return chord.filter((n, idx) => {
      if (idx === 0) return true; // Keep root
      const interval = Math.abs(n - chord[0]) % 12;
      return CONSONANT_INTERVALS.has(interval) || CONSONANT_INTERVALS.has(12 - interval);
    });
  }

  /**
   * Build rondo sections from base notes (from radio_engine.py _build_rondo_sections).
   */
  _buildRondo(baseNotes, mood) {
    const pattern = RONDO_PATTERNS[mood.rondoName] || RONDO_PATTERNS.AABA;
    const sections = [];
    const sectionDur = mood.duration / pattern.length;

    for (let i = 0; i < pattern.length; i++) {
      const label = pattern[i];
      let sectionNotes;

      switch (label) {
        case 'A':
          sectionNotes = baseNotes.map(n => ({ ...n }));
          break;
        case 'B':
          // Transpose +5 semitones
          sectionNotes = baseNotes.map(n => ({
            ...n,
            note: this._snapToScale(n.note + 5, mood.root, mood.scale),
          }));
          break;
        case 'C':
          // Transpose -2 semitones
          sectionNotes = baseNotes.map(n => ({
            ...n,
            note: this._snapToScale(n.note - 2, mood.root, mood.scale),
          }));
          break;
        case 'D':
          // Transpose +7 semitones (fifth)
          sectionNotes = baseNotes.map(n => ({
            ...n,
            note: this._snapToScale(n.note + 7, mood.root, mood.scale),
          }));
          break;
        default:
          sectionNotes = baseNotes.map(n => ({ ...n }));
      }

      // Adjust times to section position
      const sectionStart = i * sectionDur;
      const scaleFactor = sectionDur / Math.max(0.01, baseNotes[baseNotes.length - 1]?.t + 1 || sectionDur);

      sections.push({
        label,
        notes: sectionNotes.map(n => ({
          ...n,
          t: sectionStart + n.t * Math.min(scaleFactor, 1),
        })),
      });
    }

    return sections;
  }

  // ──── SCHEDULING + PLAYBACK ────

  /**
   * Prepare and schedule the next segment.
   */
  async _startNextSegment() {
    this._currentSegment++;
    if (this._currentSegment >= this._segments.length) {
      // Wrap around — new seed for next cycle
      this.seed = (this.seed * 31337 + 1) | 0;
      this.generate(this.seed);
      this._currentSegment = 0;
    }

    const mood = this._segments[this._currentSegment];
    this._currentEpoch = mood.epoch;

    // Update track index based on time position
    const newTrack = Math.min(
      Math.floor(mood.startTime / this.trackDuration),
      this.trackCount - 1
    );
    if (newTrack !== this._currentTrack) {
      this._currentTrack = newTrack;
      if (this.onTrackEnd) this.onTrackEnd();
    }

    // Set GM instruments on channels
    for (let i = 0; i < mood.instruments.length && i < 15; i++) {
      const ch = i < 9 ? i : i + 1; // Skip channel 9 (drums)
      this._bridge.programChange(ch, mood.instruments[i]);
    }

    // Sample MIDI bars
    const rawNotes = await this._sampleMidiBars(mood);

    // Build chords for some notes (50% get harmonized)
    const enrichedNotes = [];
    for (const n of rawNotes) {
      enrichedNotes.push(n);
      if (this._rand() < 0.5 * mood.density) {
        const chord = this._buildChordFromNote(n.note, mood.root, mood.scaleName, mood.scale);
        for (let ci = 1; ci < chord.length; ci++) {
          enrichedNotes.push({
            t: n.t + ci * 0.01, // Slight stagger for arpeggiation
            note: chord[ci],
            dur: n.dur,
            vel: n.vel * 0.7,
          });
        }
      }
    }

    // Build rondo structure
    const rondoSections = this._buildRondo(enrichedNotes, mood);

    // Flatten into scheduled notes with absolute times
    this._scheduledNotes = [];
    for (const section of rondoSections) {
      for (const n of section.notes) {
        // Assign to a channel based on register
        const ch = n.note < 48 ? 0 : n.note < 60 ? 1 : n.note < 72 ? 2 : 3;
        this._scheduledNotes.push({
          t: mood.startTime + n.t,
          note: Math.max(0, Math.min(127, n.note)),
          dur: n.dur,
          vel: Math.max(1, Math.round(n.vel * 127)),
          ch: ch < 9 ? ch : ch + 1, // Skip drum channel
          inst: mood.instruments[ch % mood.instruments.length],
        });
      }
    }

    // Sort by time
    this._scheduledNotes.sort((a, b) => a.t - b.t);
    this._nextNote = 0;

    if (this.onSegmentChange) {
      this.onSegmentChange(mood);
    }
  }

  /**
   * Main scheduling loop — fires notes at the right time.
   */
  _scheduleLoop() {
    if (!this.isPlaying) return;

    const currentTime = this.getCurrentTime();
    const lookahead = 0.2; // 200ms lookahead

    // Schedule notes within lookahead window
    while (this._nextNote < this._scheduledNotes.length) {
      const n = this._scheduledNotes[this._nextNote];
      if (n.t > currentTime + lookahead) break;

      if (n.t >= currentTime - 0.05) { // Allow 50ms late notes
        this._bridge.noteOn(n.ch, n.note, n.vel);

        // Schedule note off
        const offDelay = Math.max(0.01, n.dur) * 1000;
        setTimeout(() => {
          this._bridge.noteOff(n.ch, n.note);
        }, offDelay);
      }

      this._nextNote++;
    }

    // Check if we need the next segment
    if (this._currentSegment < this._segments.length) {
      const mood = this._segments[this._currentSegment];
      if (currentTime >= mood.startTime + mood.duration - 0.5) {
        // Prepare next segment
        this._startNextSegment();
      }
    }

    // Check track boundaries
    const expectedTrack = Math.min(
      Math.floor(currentTime / this.trackDuration),
      this.trackCount - 1
    );
    if (expectedTrack !== this._currentTrack) {
      this._currentTrack = expectedTrack;
      this._currentEpoch = EPOCH_ORDER[Math.min(expectedTrack, EPOCH_ORDER.length - 1)];
      if (this.onTrackEnd) this.onTrackEnd();
    }

    this._rafId = requestAnimationFrame(() => this._scheduleLoop());
  }

  /**
   * Emit active note events for visualization (grid, game).
   */
  _emitCurrentNotes(t) {
    if (!this.onNoteEvent) return;

    const activeEvents = [];
    for (const n of this._scheduledNotes) {
      if (n.t <= t && n.t + n.dur > t) {
        activeEvents.push({
          t: n.t, dur: n.dur,
          note: n.note,
          inst: this._gmProgramName(n.inst),
          vel: n.vel / 127,
          ch: n.ch,
          bend: 0,
        });
      }
      if (n.t > t + 0.5) break; // Past the window
    }

    if (activeEvents.length > 0) {
      this.onNoteEvent(activeEvents);
    }
  }

  /**
   * Get human-readable GM program name.
   */
  _gmProgramName(program) {
    const names = {
      0: 'piano', 24: 'acoustic_guitar', 32: 'acoustic_bass',
      40: 'violin', 41: 'viola', 42: 'cello', 43: 'contrabass',
      46: 'harp', 48: 'string_ensemble', 52: 'choir_pad',
      56: 'trumpet', 58: 'tuba', 60: 'french_horn',
      68: 'oboe', 70: 'bassoon', 71: 'clarinet', 73: 'flute',
      79: 'flute', 88: 'warm_pad', 89: 'warm_pad',
      91: 'glass_pad', 95: 'choir_pad', 105: 'sitar', 108: 'kalimba',
      13: 'xylophone', 14: 'tubular_bell',
    };
    return names[program] || 'piano';
  }
}
