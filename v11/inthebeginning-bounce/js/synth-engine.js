/**
 * Web Audio API Synthesizer Engine — ported from Python composer.py.
 *
 * Implements additive synthesis with 16+ instrument timbres, ADSR envelopes,
 * vibrato/tremolo, pitch bending, and percussion synthesis. Uses Web Audio
 * API oscillators and gain nodes — zero external dependencies.
 *
 * Also supports sample-based instrument playback: loads real instrument MP3
 * recordings and pitches them to any MIDI note. This mirrors the Python
 * radio_engine's FluidSynth+FluidR3_GM.sf2 approach but uses lightweight MP3
 * samples instead of a 142MB SoundFont file.
 *
 * Designed for concurrent use: the MIDI parsing runs in a Web Worker
 * (synth-worker.js) while this engine handles audio scheduling on the
 * main thread via AudioContext.
 */

/** Harmonic profiles for additive synthesis instruments. */
const TIMBRES = {
  violin:    [1.0, 0.50, 0.33, 0.25, 0.20, 0.16, 0.14, 0.12, 0.10, 0.08, 0.07, 0.06],
  cello:     [1.0, 0.70, 0.45, 0.30, 0.20, 0.15, 0.10, 0.08, 0.06, 0.04],
  harp:      [1.0, 0.30, 0.10, 0.05, 0.03, 0.02],
  flute:     [1.0, 0.40, 0.10, 0.02],
  oboe:      [1.0, 0.60, 0.80, 0.50, 0.40, 0.30, 0.20, 0.15, 0.10],
  clarinet:  [1.0, 0.05, 0.70, 0.05, 0.40, 0.05, 0.20, 0.05, 0.10],
  horn:      [1.0, 0.80, 0.60, 0.50, 0.40, 0.30, 0.25, 0.20, 0.15, 0.10],
  trumpet:   [1.0, 0.90, 0.70, 0.60, 0.50, 0.40, 0.30, 0.25, 0.20, 0.15],
  piano:     [1.0, 0.50, 0.30, 0.25, 0.20, 0.15, 0.12, 0.10, 0.08, 0.07],
  bell:      [1.0, 0.60, 0.30, 0.20, 0.35, 0.15, 0.25, 0.10, 0.15, 0.08],
  gamelan:   [1.0, 0.40, 0.15, 0.30, 0.10, 0.20, 0.08, 0.15],
  tibetan_bowl: [1.0, 0.70, 0.20, 0.40, 0.10, 0.25, 0.08],
  choir_ah:  [1.0, 0.40, 0.20, 0.15, 0.10, 0.08, 0.05],
  choir_oo:  [1.0, 0.60, 0.10, 0.05, 0.03],
  throat_sing: [1.0, 0.10, 0.05, 0.03, 0.02, 0.80, 0.05, 0.03, 0.02, 0.50],
  warm_pad:  [1.0, 0.30, 0.15, 0.08, 0.04],
  cosmic:    [1.0, 0.20, 0.10, 0.30, 0.05, 0.15, 0.03, 0.10, 0.02, 0.08],
  sine:      [1.0],
};

/** Instrument family → base hue for coloring (matches grid.js scheme). */
const FAMILY_HUES = {
  strings: 0,       // red
  keys: 220,        // blue
  winds: 120,       // green
  percussion: 50,   // yellow
  world: 280,       // purple
  synth: 180,       // cyan
  voice: 0,         // white (low saturation)
  brass: 30,        // orange
  organ: 200,       // indigo
  bass: 260,        // violet
};

/** Map GM program groups to instrument timbre names. */
const GM_TO_TIMBRE = {
  piano: 'piano', chromatic: 'bell', organ: 'warm_pad', guitar: 'harp',
  bass: 'cello', strings: 'violin', ensemble: 'choir_ah', brass: 'trumpet',
  reed: 'oboe', pipe: 'flute', 'synth-lead': 'cosmic', 'synth-pad': 'warm_pad',
  fx: 'cosmic', ethnic: 'gamelan', percussion: null, sfx: 'cosmic',
};

/** Map GM group to family for coloring. */
const GM_TO_FAMILY = {
  piano: 'keys', chromatic: 'world', organ: 'organ', guitar: 'strings',
  bass: 'bass', strings: 'strings', ensemble: 'voice', brass: 'brass',
  reed: 'winds', pipe: 'winds', 'synth-lead': 'synth', 'synth-pad': 'synth',
  fx: 'synth', ethnic: 'world', percussion: 'percussion', sfx: 'synth',
};

/**
 * ADSR envelope parameters per timbre class.
 * { attack, decay, sustain (0-1), release } in seconds.
 */
const ENVELOPES = {
  violin:    { a: 0.08, d: 0.1, s: 0.7, r: 0.15 },
  cello:     { a: 0.10, d: 0.1, s: 0.7, r: 0.20 },
  harp:      { a: 0.01, d: 0.3, s: 0.2, r: 0.30 },
  flute:     { a: 0.05, d: 0.1, s: 0.6, r: 0.10 },
  oboe:      { a: 0.04, d: 0.1, s: 0.7, r: 0.12 },
  clarinet:  { a: 0.04, d: 0.1, s: 0.7, r: 0.12 },
  horn:      { a: 0.06, d: 0.1, s: 0.7, r: 0.15 },
  trumpet:   { a: 0.03, d: 0.1, s: 0.8, r: 0.10 },
  piano:     { a: 0.01, d: 0.5, s: 0.3, r: 0.40 },
  bell:      { a: 0.01, d: 0.8, s: 0.1, r: 0.50 },
  gamelan:   { a: 0.01, d: 0.6, s: 0.15, r: 0.40 },
  tibetan_bowl: { a: 0.02, d: 1.0, s: 0.2, r: 0.80 },
  choir_ah:  { a: 0.12, d: 0.2, s: 0.6, r: 0.25 },
  choir_oo:  { a: 0.15, d: 0.2, s: 0.5, r: 0.30 },
  throat_sing: { a: 0.20, d: 0.3, s: 0.5, r: 0.40 },
  warm_pad:  { a: 0.30, d: 0.3, s: 0.5, r: 0.50 },
  cosmic:    { a: 0.20, d: 0.3, s: 0.4, r: 0.60 },
  sine:      { a: 0.02, d: 0.1, s: 0.8, r: 0.10 },
};

/**
 * General MIDI program number → sample instrument name.
 * Maps all 128 GM programs to our 60 available MP3 samples.
 * Groups of 8 programs per family, matching the GM specification.
 */
const GM_PROGRAM_TO_SAMPLE = {
  // Piano (0-7)
  0: 'piano', 1: 'piano', 2: 'electric_piano', 3: 'electric_piano',
  4: 'electric_piano', 5: 'electric_piano', 6: 'harpsichord', 7: 'harpsichord',
  // Chromatic Percussion (8-15)
  8: 'celesta', 9: 'glockenspiel', 10: 'glockenspiel', 11: 'vibraphone',
  12: 'marimba', 13: 'xylophone', 14: 'tubular_bell', 15: 'tubular_bell',
  // Organ (16-23)
  16: 'pipe_organ', 17: 'pipe_organ', 18: 'pipe_organ', 19: 'pipe_organ',
  20: 'pipe_organ', 21: 'pipe_organ', 22: 'pipe_organ', 23: 'pipe_organ',
  // Guitar (24-31)
  24: 'acoustic_guitar', 25: 'acoustic_guitar', 26: 'electric_guitar_clean',
  27: 'electric_guitar_clean', 28: 'acoustic_guitar', 29: 'overdriven_guitar',
  30: 'overdriven_guitar', 31: 'acoustic_guitar',
  // Bass (32-39)
  32: 'acoustic_bass', 33: 'electric_bass', 34: 'electric_bass', 35: 'electric_bass',
  36: 'electric_bass', 37: 'synth_bass', 38: 'synth_bass', 39: 'synth_bass',
  // Strings (40-47)
  40: 'violin', 41: 'viola', 42: 'cello', 43: 'acoustic_bass',
  44: 'string_ensemble', 45: 'pizzicato', 46: 'harp', 47: 'steel_drums',
  // Ensemble (48-55)
  48: 'string_ensemble', 49: 'string_ensemble', 50: 'synth_strings',
  51: 'synth_strings', 52: 'choir_pad', 53: 'choir_pad', 54: 'choir_pad',
  55: 'choir_pad',
  // Brass (56-63)
  56: 'trumpet', 57: 'trombone', 58: 'tuba', 59: 'muted_trumpet',
  60: 'french_horn', 61: 'trumpet', 62: 'trumpet', 63: 'trumpet',
  // Reed (64-71)
  64: 'soprano_sax', 65: 'alto_sax', 66: 'tenor_sax', 67: 'bassoon',
  68: 'oboe', 69: 'english_horn', 70: 'bassoon', 71: 'clarinet',
  // Pipe (72-79)
  72: 'piccolo', 73: 'flute', 74: 'flute', 75: 'flute',
  76: 'flute', 77: 'shakuhachi', 78: 'flute', 79: 'flute',
  // Synth Lead (80-87)
  80: 'sawtooth_lead', 81: 'sawtooth_lead', 82: 'sawtooth_lead',
  83: 'sawtooth_lead', 84: 'square_lead', 85: 'square_lead',
  86: 'square_lead', 87: 'square_lead',
  // Synth Pad (88-95)
  88: 'warm_pad', 89: 'warm_pad', 90: 'glass_pad', 91: 'glass_pad',
  92: 'choir_pad', 93: 'warm_pad', 94: 'glass_pad', 95: 'warm_pad',
  // Synth FX (96-103)
  96: 'cosmic_drone', 97: 'cosmic_drone', 98: 'glass_pad', 99: 'cosmic_drone',
  100: 'cosmic_drone', 101: 'cosmic_drone', 102: 'cosmic_drone', 103: 'cosmic_drone',
  // Ethnic (104-111)
  104: 'sitar', 105: 'banjo', 106: 'shamisen', 107: 'koto',
  108: 'kalimba', 109: 'bagpipe', 110: 'violin', 111: 'shakuhachi',
  // Percussive (112-119)
  112: 'steel_drums', 113: 'gamelan_gong', 114: 'steel_drums', 115: 'steel_drums',
  116: 'gamelan_gong', 117: 'singing_bowl', 118: 'singing_bowl', 119: 'gamelan_gong',
  // Sound FX (120-127)
  120: 'cosmic_drone', 121: 'cosmic_drone', 122: 'cosmic_drone', 123: 'cosmic_drone',
  124: 'cosmic_drone', 125: 'cosmic_drone', 126: 'cosmic_drone', 127: 'cosmic_drone',
};

/**
 * Instrument substitution table: primary → compatible alternatives.
 * Used to add variety by sometimes playing a different but compatible instrument
 * with the same note/intensity/duration (mirrors Python radio_engine behavior).
 */
const INSTRUMENT_SUBSTITUTIONS = {
  piano: ['electric_piano', 'harpsichord', 'celesta'],
  violin: ['viola', 'cello', 'string_ensemble'],
  viola: ['violin', 'cello'],
  cello: ['viola', 'acoustic_bass', 'string_ensemble'],
  flute: ['piccolo', 'shakuhachi', 'clarinet'],
  oboe: ['english_horn', 'clarinet', 'bassoon'],
  clarinet: ['oboe', 'flute', 'english_horn'],
  trumpet: ['muted_trumpet', 'french_horn', 'trombone'],
  french_horn: ['trumpet', 'trombone', 'tuba'],
  acoustic_guitar: ['electric_guitar_clean', 'harp', 'banjo'],
  harp: ['acoustic_guitar', 'kalimba', 'celesta'],
  warm_pad: ['glass_pad', 'synth_strings', 'choir_pad'],
  choir_pad: ['warm_pad', 'string_ensemble', 'glass_pad'],
  koto: ['shamisen', 'sitar', 'kalimba'],
  sitar: ['koto', 'shamisen', 'kalimba'],
};

/**
 * Reference pitch (MIDI note) for each sample recording.
 * Most instrument samples are recorded around middle C (MIDI 60).
 * Percussion samples don't have a reference pitch.
 */
const SAMPLE_REF_NOTES = {
  piano: 60, electric_piano: 60, harpsichord: 60, celesta: 72,
  violin: 67, viola: 60, cello: 48, acoustic_bass: 36,
  electric_bass: 36, synth_bass: 36, string_ensemble: 60,
  pizzicato: 60, harp: 60, flute: 72, piccolo: 84,
  oboe: 67, english_horn: 60, clarinet: 60, bassoon: 48,
  trumpet: 67, muted_trumpet: 67, french_horn: 60, trombone: 48, tuba: 36,
  soprano_sax: 72, alto_sax: 65, tenor_sax: 58,
  acoustic_guitar: 60, electric_guitar_clean: 60, overdriven_guitar: 60,
  pipe_organ: 60, glockenspiel: 79, vibraphone: 67, marimba: 60,
  xylophone: 72, tubular_bell: 60, steel_drums: 60,
  sawtooth_lead: 60, square_lead: 60,
  warm_pad: 60, glass_pad: 60, choir_pad: 60, synth_strings: 60,
  cosmic_drone: 48, sitar: 60, banjo: 60, shamisen: 67, koto: 60,
  kalimba: 72, bagpipe: 60, shakuhachi: 67, singing_bowl: 60,
  gamelan_gong: 48, didgeridoo: 36,
  // Percussion (no pitch reference — played at native pitch)
  kick_drum: null, snare_drum: null, tom: null,
  hi_hat_closed: null, hi_hat_open: null, cymbal_crash: null,
};

/**
 * SampleBank — loads and manages instrument MP3 samples as AudioBuffers.
 *
 * Mirrors the Python radio_engine's FluidSynth integration: real instrument
 * sounds are loaded and pitched to any MIDI note. Falls back gracefully
 * to additive synthesis if samples can't be loaded.
 */
class SampleBank {
  constructor() {
    /** @type {Map<string, AudioBuffer>} Loaded sample buffers keyed by instrument name. */
    this._buffers = new Map();
    /** @type {Set<string>} Instruments currently being loaded. */
    this._loading = new Set();
    /** @type {Set<string>} Instruments that failed to load. */
    this._failed = new Set();
    /** @type {string} Base URL for sample files. */
    this.baseUrl = '';
    /** @type {boolean} Whether sample loading is enabled. */
    this.enabled = true;
    /** @type {number} Substitution probability (0-1). */
    this.substitutionRate = 0.15;
    /** @type {Set<string>} Disabled instrument families (use synth fallback). */
    this._disabledFamilies = new Set();
  }

  /**
   * Set which instrument families are disabled (will use additive synthesis instead).
   * @param {string[]} families - Array of family IDs to disable.
   */
  setDisabledFamilies(families) {
    this._disabledFamilies = new Set(families || []);
  }

  /**
   * Check if a given instrument family is disabled.
   * @param {string} family - Family ID (e.g., 'piano', 'strings').
   * @returns {boolean}
   */
  isFamilyDisabled(family) {
    return this._disabledFamilies.has(family);
  }

  /**
   * Configure the sample base URL and begin loading priority instruments.
   * @param {string} baseUrl - URL prefix for sample MP3 files (e.g., '../audio/samples/')
   * @param {AudioContext} ctx - Web Audio AudioContext for decoding.
   */
  async init(baseUrl, ctx) {
    this.baseUrl = baseUrl;
    this._ctx = ctx;

    // Load priority instruments first (most common in classical MIDI)
    const priority = [
      'piano', 'violin', 'cello', 'flute', 'oboe', 'trumpet',
      'french_horn', 'clarinet', 'harp', 'string_ensemble',
      'acoustic_guitar', 'choir_pad',
    ];
    const promises = priority.map(name => this._loadSample(name));
    await Promise.allSettled(promises);
  }

  /**
   * Load a single sample MP3 into an AudioBuffer.
   * @param {string} name - Instrument name (e.g., 'piano', 'violin').
   * @returns {Promise<boolean>} True if loaded successfully.
   */
  async _loadSample(name) {
    if (this._buffers.has(name) || this._loading.has(name) || this._failed.has(name)) {
      return this._buffers.has(name);
    }
    this._loading.add(name);

    try {
      const url = this.baseUrl + name + '.mp3';
      const resp = await fetch(url);
      if (!resp.ok) {
        this._failed.add(name);
        this._loading.delete(name);
        return false;
      }
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await this._ctx.decodeAudioData(arrayBuf);
      this._buffers.set(name, audioBuf);
      this._loading.delete(name);
      return true;
    } catch (e) {
      this._failed.add(name);
      this._loading.delete(name);
      return false;
    }
  }

  /**
   * Get an AudioBuffer for the given instrument, loading on demand if needed.
   * @param {string} name - Instrument name.
   * @returns {AudioBuffer|null}
   */
  getBuffer(name) {
    return this._buffers.get(name) || null;
  }

  /**
   * Check if a sample is available (loaded or loadable).
   * @param {string} name - Instrument name.
   * @returns {boolean}
   */
  has(name) {
    return this._buffers.has(name);
  }

  /**
   * Request on-demand loading of a sample (non-blocking).
   * @param {string} name - Instrument name.
   */
  ensureLoaded(name) {
    if (!this._buffers.has(name) && !this._loading.has(name) && !this._failed.has(name)) {
      this._loadSample(name);
    }
  }

  /**
   * Resolve a GM program number to a sample name, with optional substitution.
   * @param {number} program - GM program number (0-127).
   * @param {boolean} [allowSubstitution=true] - Allow random instrument swap.
   * @returns {string} Instrument sample name.
   */
  resolveProgram(program, allowSubstitution) {
    const primary = GM_PROGRAM_TO_SAMPLE[program] || 'piano';

    // Occasionally substitute with a compatible instrument for variety
    if (allowSubstitution !== false && Math.random() < this.substitutionRate) {
      const alts = INSTRUMENT_SUBSTITUTIONS[primary];
      if (alts && alts.length > 0) {
        const alt = alts[Math.floor(Math.random() * alts.length)];
        if (this._buffers.has(alt)) return alt;
      }
    }

    return primary;
  }

  /**
   * Get the playback rate to pitch a sample to a target MIDI note.
   * @param {string} sampleName - Instrument sample name.
   * @param {number} targetNote - Target MIDI note number.
   * @returns {number} Playback rate (1.0 = native pitch).
   */
  getPlaybackRate(sampleName, targetNote) {
    const refNote = SAMPLE_REF_NOTES[sampleName];
    if (refNote === null || refNote === undefined) return 1.0; // percussion
    // Clamp pitch shift to ±2 octaves to avoid extreme artifacts
    const semitones = Math.max(-24, Math.min(24, targetNote - refNote));
    return Math.pow(2, semitones / 12);
  }
}

/** Convert MIDI note to frequency. */
function mtof(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

class SynthEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} Master output gain. */
    this._masterGain = null;
    /** @type {DynamicsCompressorNode|null} Limiter. */
    this._compressor = null;
    /** @type {ConvolverNode|null} Reverb convolver. */
    this._reverbNode = null;
    /** @type {GainNode|null} Reverb send level. */
    this._reverbSend = null;
    /** @type {GainNode|null} Dry path gain. */
    this._dryGain = null;
    /** @type {BiquadFilterNode|null} Master filter. */
    this._filterNode = null;
    /** @type {Map<number, {oscs: OscillatorNode[], gains: GainNode[]}>} Active voices. */
    this._voices = new Map();
    /** @type {number} Max simultaneous voices. */
    this.maxVoices = 64;
    /** @type {number} Voice counter for key generation. */
    this._voiceCounter = 0;
    /** @type {Object} Current mutation preset. */
    this._mutation = { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };
    /** @type {boolean} Whether vibrato is enabled. */
    this.vibratoEnabled = true;
    /** @type {number} Vibrato rate in Hz. */
    this.vibratoRate = 5.5;
    /** @type {number} Vibrato depth in cents. */
    this.vibratoDepth = 15;
    /** @type {SampleBank|null} Sample-based instrument bank. */
    this.sampleBank = null;
    /** @type {boolean} Whether to prefer sample playback over additive synthesis. */
    this.preferSamples = true;
  }

  /** Initialize AudioContext and audio graph. */
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Compressor/limiter at the end of the chain
    this._compressor = this.ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -6;
    this._compressor.knee.value = 10;
    this._compressor.ratio.value = 12;
    this._compressor.attack.value = 0.003;
    this._compressor.release.value = 0.1;
    this._compressor.connect(this.ctx.destination);

    // Master gain
    this._masterGain = this.ctx.createGain();
    this._masterGain.gain.value = 0.25;
    this._masterGain.connect(this._compressor);

    // Filter
    this._filterNode = this.ctx.createBiquadFilter();
    this._filterNode.type = 'allpass';
    this._filterNode.frequency.value = 2000;
    this._applyFilter();

    // Dry path
    this._dryGain = this.ctx.createGain();
    this._dryGain.gain.value = 1.0;
    this._dryGain.connect(this._masterGain);

    // Reverb path
    this._reverbNode = this.ctx.createConvolver();
    this._reverbNode.buffer = this._createImpulse(2.5, 2.5);
    this._reverbSend = this.ctx.createGain();
    this._reverbSend.gain.value = this._mutation.reverb || 0;
    this._reverbSend.connect(this._reverbNode);
    this._reverbNode.connect(this._masterGain);

    // Filter routes to both dry and reverb
    this._filterNode.connect(this._dryGain);
    this._filterNode.connect(this._reverbSend);

    // Periodic voice cleanup — evict expired voices every 2 seconds
    this._cleanupInterval = setInterval(() => {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      for (const [key, voice] of this._voices) {
        if (voice.endTime && voice.endTime < now - 0.5) {
          try { if (voice.voiceGain) voice.voiceGain.disconnect(); } catch (e) { /* ok */ }
          for (const osc of (voice.oscs || [])) {
            try { osc.stop(); osc.disconnect(); } catch (e) { /* ok */ }
          }
          this._voices.delete(key);
        }
      }
    }, 2000);
  }

  /** Resume AudioContext (must be called from user gesture). */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Initialize the sample bank for real-instrument playback.
   * Call after init(). Loads MP3 instrument samples and makes them available
   * for playNote() to use instead of additive synthesis.
   *
   * @param {string} [baseUrl] - Base URL for sample files. Auto-detected if not provided.
   * @returns {Promise<boolean>} True if at least some samples loaded.
   */
  async initSamples(baseUrl) {
    if (!this.ctx) this.init();
    this.sampleBank = new SampleBank();

    // Try multiple paths to find samples
    const paths = baseUrl ? [baseUrl] : [
      'audio/samples/',
      '../../shared/audio/instruments/',
      '../shared/audio/instruments/',
      '../audio/samples/',
      '../../apps/audio/samples/',
      '../cosmic-runner-v5/audio/samples/',
      'samples/',
    ];

    for (const path of paths) {
      try {
        // Test if the path is valid by trying to fetch piano.mp3
        const testResp = await fetch(path + 'piano.mp3', { method: 'HEAD' });
        if (testResp.ok) {
          await this.sampleBank.init(path, this.ctx);
          return this.sampleBank._buffers.size > 0;
        }
      } catch (e) { /* try next path */ }
    }

    return false;
  }

  /**
   * Play a note using sample-based instrument playback.
   * Pitches a pre-recorded instrument sample to the target MIDI note.
   * Returns a voice key, or -1 if the sample isn't available.
   *
   * @param {Object} note - { note, dur, vel, ch, program, inst, bend }
   * @param {number} [delay=0] - Seconds from now to start.
   * @returns {number} Voice key, or -1 if sample unavailable.
   */
  _playNoteSample(note, delay) {
    if (!this.sampleBank || !this.ctx) return -1;

    const pitchShift = this._mutation.pitchShift || 0;
    const midiNote = (note.note || 60) + pitchShift;
    const tempoMult = this._mutation.tempoMult || 1.0;
    const dur = Math.max(0.05, (note.dur || 0.3) / tempoMult);
    const vel = Math.max(0.01, Math.min(1, note.vel || 0.5));
    const bend = note.bend || 0;

    // Resolve instrument: use GM program if available, else try inst name
    let sampleName;
    if (note.program !== undefined && note.program !== null) {
      sampleName = this.sampleBank.resolveProgram(note.program, true);
    } else {
      const instName = note.inst || 'piano';
      sampleName = GM_TO_TIMBRE[instName] || instName;
      // Map timbre names back to sample names
      if (!SAMPLE_REF_NOTES.hasOwnProperty(sampleName)) {
        sampleName = 'piano'; // fallback
      }
    }

    const buffer = this.sampleBank.getBuffer(sampleName);
    if (!buffer) {
      // Request on-demand load for next time
      this.sampleBank.ensureLoaded(sampleName);
      return -1; // fall back to additive synthesis
    }

    const time = this.ctx.currentTime + (delay || 0);

    // Voice management
    if (this._voices.size >= this.maxVoices) {
      const oldest = this._voices.keys().next().value;
      this._releaseVoice(oldest, 0.01);
    }

    // Create buffer source with pitch shifting
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.sampleBank.getPlaybackRate(sampleName, midiNote);

    // Apply pitch bend
    if (bend) {
      const bendSemitones = bend * 2;
      const bendRate = source.playbackRate.value * Math.pow(2, bendSemitones / 12);
      source.playbackRate.linearRampToValueAtTime(bendRate, time + dur * 0.5);
      source.playbackRate.linearRampToValueAtTime(
        this.sampleBank.getPlaybackRate(sampleName, midiNote), time + dur
      );
    }

    // Envelope gain
    const voiceGain = this.ctx.createGain();
    const attack = 0.01;
    const release = Math.min(0.3, dur * 0.2);
    voiceGain.gain.setValueAtTime(0, time);
    voiceGain.gain.linearRampToValueAtTime(vel * 0.3, time + attack);
    voiceGain.gain.setValueAtTime(vel * 0.3, time + dur);
    voiceGain.gain.linearRampToValueAtTime(0, time + dur + release);

    source.connect(voiceGain);
    voiceGain.connect(this._filterNode);
    source.start(time);
    source.stop(time + dur + release + 0.05);

    const key = this._voiceCounter++;
    this._voices.set(key, { oscs: [source], gains: [voiceGain], voiceGain, endTime: time + dur + release });
    source.onended = () => {
      this._voices.delete(key);
      try { voiceGain.disconnect(); } catch (e) { /* ok */ }
    };

    return key;
  }

  /**
   * Set the mutation preset with clamped values.
   * @param {Object} mutation - { pitchShift, tempoMult, reverb, filter }
   */
  setMutation(mutation) {
    const m = mutation || {};
    this._mutation = {
      pitchShift: Math.max(-24, Math.min(24, m.pitchShift || 0)),
      tempoMult: Math.max(0.25, Math.min(4, m.tempoMult || 1.0)),
      reverb: Math.max(0, Math.min(1, m.reverb || 0)),
      filter: m.filter || 'none',
    };
    if (this._reverbSend && this.ctx) {
      this._reverbSend.gain.setValueAtTime(this._mutation.reverb, this.ctx.currentTime);
    }
    this._applyFilter();
  }

  /** Set master volume (0-1). */
  setVolume(vol) {
    if (this._masterGain && this.ctx) {
      this._masterGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, vol)) * 0.25,
        this.ctx.currentTime
      );
    }
  }

  /**
   * Play a note using sample-based playback (preferred) or additive synthesis.
   * @param {Object} note - { note, dur, vel, ch, inst, program, bend }
   * @param {number} [delay=0] - Seconds from now to start.
   * @returns {number} Voice key for later manipulation.
   */
  playNote(note, delay) {
    if (!this.ctx) this.init();
    if (delay === undefined) delay = 0;
    if (delay < 0) delay = 0;

    // Check if this instrument's family is disabled by user preference
    if (this.sampleBank && this.sampleBank._disabledFamilies.size > 0) {
      const family = GM_TO_FAMILY[note.program || 0] || 'keys';
      // Also check instrument name for family matching
      const instName = (note.inst || '').toLowerCase();
      const nameFamily = instName.includes('piano') ? 'piano' :
        instName.includes('violin') || instName.includes('cello') || instName.includes('string') ? 'strings' :
        instName.includes('flute') || instName.includes('oboe') || instName.includes('clarinet') ? 'winds' :
        instName.includes('trumpet') || instName.includes('horn') ? 'brass' :
        instName.includes('drum') || instName.includes('perc') ? 'percussion' :
        instName.includes('pad') || instName.includes('synth') || instName.includes('cosmic') ? 'synth' :
        instName.includes('choir') || instName.includes('voice') ? 'voice' : null;
      const effectiveFamily = nameFamily || family;
      if (this.sampleBank.isFamilyDisabled(effectiveFamily)) {
        return -1; // Skip this note entirely — family disabled
      }
    }

    // Try sample-based playback first (real instrument sounds)
    if (this.preferSamples && this.sampleBank && (note.ch || 0) !== 9) {
      const key = this._playNoteSample(note, delay);
      if (key >= 0) return key;
    }

    // Voice management: evict oldest if at capacity
    if (this._voices.size >= this.maxVoices) {
      const oldest = this._voices.keys().next().value;
      this._releaseVoice(oldest, 0.01);
    }

    const time = this.ctx.currentTime + delay;
    const pitchShift = this._mutation.pitchShift || 0;
    const midiNote = (note.note || 60) + pitchShift;
    const freq = mtof(midiNote);
    const tempoMult = this._mutation.tempoMult || 1.0;
    const dur = Math.max(0.05, (note.dur || 0.3) / tempoMult);
    const vel = Math.max(0.01, Math.min(1, note.vel || 0.5));
    const ch = note.ch || 0;
    const bend = note.bend || 0;

    // Percussion: channel 9
    if (ch === 9) {
      return this._playPercussion(time, vel, dur, midiNote);
    }

    // Determine timbre
    const instName = note.inst || 'piano';
    const timbreName = GM_TO_TIMBRE[instName] || instName;
    const harmonics = TIMBRES[timbreName] || TIMBRES.piano;
    const env = ENVELOPES[timbreName] || ENVELOPES.piano;

    // Create oscillator bank (additive synthesis)
    const oscs = [];
    const gains = [];
    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(this._filterNode);

    // Limit harmonics based on Nyquist
    const nyquist = this.ctx.sampleRate / 2;
    const maxHarmonics = Math.min(harmonics.length, Math.floor(nyquist / freq));
    const numHarmonics = Math.min(maxHarmonics, 8); // cap at 8 for performance

    const totalAmp = harmonics.slice(0, numHarmonics).reduce((s, a) => s + a, 0) || 1;
    const gainScale = vel * 0.12 / totalAmp;

    for (let h = 0; h < numHarmonics; h++) {
      const osc = this.ctx.createOscillator();
      const harmGain = this.ctx.createGain();

      osc.type = 'sine';
      const harmFreq = freq * (h + 1);
      if (harmFreq >= nyquist) break;

      osc.frequency.setValueAtTime(harmFreq, time);

      // Pitch bend: shift frequency
      if (bend) {
        const bendSemitones = bend * 2; // ±2 semitones per unit bend
        const bendFreq = harmFreq * Math.pow(2, bendSemitones / 12);
        osc.frequency.linearRampToValueAtTime(bendFreq, time + dur * 0.5);
        osc.frequency.linearRampToValueAtTime(harmFreq, time + dur);
      }

      // Vibrato via LFO
      if (this.vibratoEnabled && h === 0 && dur > 0.2) {
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = this.vibratoRate;
        lfoGain.gain.value = harmFreq * (this.vibratoDepth / 1200); // cents to Hz
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(time + env.a); // vibrato starts after attack
        lfo.stop(time + dur + env.r);
      }

      harmGain.gain.value = harmonics[h] * gainScale;
      osc.connect(harmGain);
      harmGain.connect(voiceGain);

      osc.start(time);
      osc.stop(time + dur + env.r + 0.05);

      oscs.push(osc);
      gains.push(harmGain);
    }

    // ADSR envelope on voiceGain
    const attack = Math.min(env.a, dur * 0.3);
    const decay = Math.min(env.d, dur * 0.3);
    const sustainLevel = env.s * vel;
    const release = Math.min(env.r, 0.5);

    voiceGain.gain.setValueAtTime(0, time);
    voiceGain.gain.linearRampToValueAtTime(vel, time + attack);
    voiceGain.gain.linearRampToValueAtTime(sustainLevel, time + attack + decay);
    voiceGain.gain.setValueAtTime(sustainLevel, time + dur);
    voiceGain.gain.linearRampToValueAtTime(0, time + dur + release);

    const key = this._voiceCounter++;
    this._voices.set(key, { oscs, gains, voiceGain, endTime: time + dur + release });

    // Auto-cleanup
    const cleanup = () => {
      this._voices.delete(key);
      try { voiceGain.disconnect(); } catch (e) { /* ok */ }
    };
    if (oscs.length > 0) {
      oscs[0].onended = cleanup;
    } else {
      setTimeout(cleanup, (dur + release) * 1000 + 100);
    }

    return key;
  }

  /**
   * Synthesize percussion hit.
   * @returns {number} Voice key.
   */
  _playPercussion(time, vel, dur, midiNote) {
    const key = this._voiceCounter++;

    try {
      // Determine percussion type from MIDI note
      const isKick = midiNote === 36 || midiNote === 35;
      const isSnare = midiNote === 38 || midiNote === 40;
      const isHihat = midiNote >= 42 && midiNote <= 46;

      if (isKick) {
        this._synthKick(time, vel);
      } else if (isSnare) {
        this._synthSnare(time, vel);
      } else if (isHihat) {
        this._synthHihat(time, vel, dur);
      } else {
        // Generic percussion: filtered noise burst
        this._synthNoiseBurst(time, vel, Math.min(dur, 0.3));
      }
    } catch (e) { /* ok */ }

    this._voices.set(key, { oscs: [], gains: [], endTime: time + 0.5 });
    setTimeout(() => this._voices.delete(key), 600);
    return key;
  }

  /** Kick drum: sine with pitch drop + distortion. */
  _synthKick(time, vel) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(vel * 0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain);
    gain.connect(this._filterNode);
    osc.start(time);
    osc.stop(time + 0.35);
    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) { /* ok */ } };
  }

  /** Snare: sine body + filtered noise. */
  _synthSnare(time, vel) {
    // Tone body
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 200;
    oscGain.gain.setValueAtTime(vel * 0.15, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(oscGain);
    oscGain.connect(this._filterNode);
    osc.start(time);
    osc.stop(time + 0.15);
    osc.onended = () => { try { osc.disconnect(); oscGain.disconnect(); } catch (e) { /* ok */ } };

    // Noise
    this._synthNoiseBurst(time, vel * 0.6, 0.15, 2000);
  }

  /** Hi-hat: bandpass-filtered noise. */
  _synthHihat(time, vel, dur) {
    this._synthNoiseBurst(time, vel * 0.3, Math.min(dur, 0.1), 8000);
  }

  /** Generic noise burst with optional filter freq. */
  _synthNoiseBurst(time, vel, dur, filterFreq) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.08, time);
    gain.gain.linearRampToValueAtTime(0, time + dur);

    let filterNode = null;
    if (filterFreq) {
      filterNode = this.ctx.createBiquadFilter();
      filterNode.type = filterFreq > 4000 ? 'highpass' : 'bandpass';
      filterNode.frequency.value = filterFreq;
      filterNode.Q.value = 1;
      source.connect(filterNode);
      filterNode.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(this._filterNode);
    source.start(time);
    source.onended = () => {
      try { source.disconnect(); gain.disconnect(); if (filterNode) filterNode.disconnect(); } catch (e) { /* ok */ }
    };
  }

  /** Release a voice immediately. */
  _releaseVoice(key, fadeTime) {
    const voice = this._voices.get(key);
    if (!voice) return;
    const t = this.ctx.currentTime;
    if (voice.voiceGain) {
      voice.voiceGain.gain.cancelScheduledValues(t);
      voice.voiceGain.gain.setValueAtTime(voice.voiceGain.gain.value, t);
      voice.voiceGain.gain.linearRampToValueAtTime(0, t + (fadeTime || 0.05));
    }
    for (const osc of voice.oscs) {
      try { osc.stop(t + (fadeTime || 0.05) + 0.01); } catch (e) { /* ok */ }
    }
    setTimeout(() => this._voices.delete(key), (fadeTime || 0.05) * 1000 + 50);
  }

  /** Stop all voices. */
  stopAll() {
    for (const [key] of this._voices) {
      this._releaseVoice(key, 0.02);
    }
    this._voices.clear();
  }

  /** Get the color for an instrument (hue, saturation, lightness). */
  static getColor(instName, vel, hueOffset) {
    const family = GM_TO_FAMILY[instName] || 'keys';
    const baseHue = FAMILY_HUES[family] || 220;
    const hue = (baseHue + (hueOffset || 0)) % 360;
    const isVoice = family === 'voice';
    const sat = isVoice ? 10 : (60 + vel * 40);
    const light = 30 + vel * 50;
    return { hue, sat, light, isVoice };
  }

  /** Get timbre name for a GM instrument group. */
  static getTimbre(instName) {
    return GM_TO_TIMBRE[instName] || instName;
  }

  // ──── Internal ────

  _applyFilter() {
    if (!this._filterNode) return;
    const f = this._mutation.filter || 'none';
    switch (f) {
      case 'lowpass':
        this._filterNode.type = 'lowpass';
        this._filterNode.frequency.value = 1200;
        this._filterNode.Q.value = 1;
        break;
      case 'highpass':
        this._filterNode.type = 'highpass';
        this._filterNode.frequency.value = 400;
        this._filterNode.Q.value = 1;
        break;
      case 'bandpass':
        this._filterNode.type = 'bandpass';
        this._filterNode.frequency.value = 800;
        this._filterNode.Q.value = 2;
        break;
      default:
        this._filterNode.type = 'allpass';
        break;
    }
  }

  _createImpulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  }

  /** Destroy the engine and release all resources. */
  destroy() {
    this.stopAll();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SynthEngine, SampleBank, TIMBRES, ENVELOPES, FAMILY_HUES,
    GM_TO_TIMBRE, GM_TO_FAMILY, GM_PROGRAM_TO_SAMPLE,
    INSTRUMENT_SUBSTITUTIONS, SAMPLE_REF_NOTES, mtof,
  };
}
