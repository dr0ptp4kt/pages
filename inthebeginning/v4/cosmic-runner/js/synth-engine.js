/**
 * Web Audio API Synthesizer Engine — ported from Python composer.py.
 *
 * Implements additive synthesis with 16+ instrument timbres, ADSR envelopes,
 * vibrato/tremolo, pitch bending, and percussion synthesis. Uses Web Audio
 * API oscillators and gain nodes — zero external dependencies.
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
    this.maxVoices = 128;
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
  }

  /** Resume AudioContext (must be called from user gesture). */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * Set the mutation preset.
   * @param {Object} mutation - { pitchShift, tempoMult, reverb, filter }
   */
  setMutation(mutation) {
    this._mutation = mutation || { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };
    if (this._reverbSend && this.ctx) {
      this._reverbSend.gain.setValueAtTime(this._mutation.reverb || 0, this.ctx.currentTime);
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
   * Play a note using additive synthesis.
   * @param {Object} note - { note, dur, vel, ch, inst, bend }
   * @param {number} [delay=0] - Seconds from now to start.
   * @returns {number} Voice key for later manipulation.
   */
  playNote(note, delay) {
    if (!this.ctx) this.init();
    if (delay === undefined) delay = 0;
    if (delay < 0) delay = 0;

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

    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterFreq > 4000 ? 'highpass' : 'bandpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = 1;
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(this._filterNode);
    source.start(time);
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
  module.exports = { SynthEngine, TIMBRES, ENVELOPES, FAMILY_HUES, GM_TO_TIMBRE, GM_TO_FAMILY, mtof };
}
