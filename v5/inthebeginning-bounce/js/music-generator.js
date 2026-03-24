/**
 * Browser-Based Procedural Music Generator for Cosmic Runner V5.
 *
 * Ported from Python cosmic music concepts. Generates a 30-minute universe
 * cycle (6 tracks of ~5 min each) entirely in the browser using SynthEngine.
 * Each track represents a cosmic epoch with distinct musical character.
 *
 * Features:
 * - Seed-based deterministic generation (same seed = same music)
 * - Scale selection per epoch (pentatonic, phrygian, lydian, chromatic, etc.)
 * - Melody generation with configurable arpeggio/run amount
 * - Chord progressions with configurable density
 * - Percussion patterns that evolve across epochs
 * - Note bending with configurable amount
 * - Tempo/speed control
 * - Style sliders: arpeggioAmount, chordDensity, bendAmount
 * - Emits note events for grid visualization
 *
 * No external dependencies — uses SynthEngine for all audio.
 */

class MusicGenerator {
  /**
   * @param {SynthEngine} synthEngine - Shared SynthEngine instance for audio.
   */
  constructor(synthEngine) {
    /** @type {SynthEngine} */
    this._synth = synthEngine;

    // ──── Generation Parameters ────
    /** @type {number} Random seed for deterministic generation. */
    this.seed = 0;
    /** @type {number} Arpeggio/run amount (0-1, default 0.3). */
    this.arpeggioAmount = 0.3;
    /** @type {number} Chord density (0-1, default 0.5). */
    this.chordDensity = 0.5;
    /** @type {number} Note bending amount (0-1, default 0.2). */
    this.bendAmount = 0.2;
    /** @type {number} Playback speed multiplier (0.25-4.0, default 1.0). */
    this.speed = 1.0;

    // ──── Track Data ────
    /** @type {number} Total universe cycle duration in seconds (30 min). */
    this.cycleDuration = 30 * 60;
    /** @type {number} Number of tracks per cycle. */
    this.trackCount = 6;
    /** @type {number} Duration per track in seconds (~5 min). */
    this.trackDuration = this.cycleDuration / this.trackCount;
    /** @type {Array<Array<Object>>} Generated note events per track. */
    this._tracks = [];
    /** @type {Array<string>} Track names. */
    this._trackNames = [];

    // ──── Playback State ────
    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {number} Current track index (0-5). */
    this.currentTrack = 0;
    /** @type {number} Current playback time in seconds (within track). */
    this._currentTime = 0;
    /** @type {number} AudioContext.currentTime when play started. */
    this._startCtxTime = 0;
    /** @type {number} Next note index to schedule. */
    this._nextNote = 0;
    /** @type {number} RAF ID for scheduling loop. */
    this._rafId = 0;
    /** @type {number} Interval ID for note event emission. */
    this._emitInterval = 0;

    // ──── PRNG State ────
    /** @type {number} Internal PRNG state. */
    this._rngState = 0;

    // ──── Callbacks ────
    /** @type {Function|null} Called with active note events for visualization. */
    this.onNoteEvent = null;
    /** @type {Function|null} Called when current track ends. */
    this.onTrackEnd = null;

    // ──── Epoch Definitions ────
    // Each epoch mirrors the Python radio engine's cosmic epochs with
    // distinct timbres, scales, tempos, and density.
    this._epochs = [
      {
        name: 'Quantum Fluctuation',
        inst: 'cosmic',
        melodyInst: 'bell',
        scale: [0, 1, 3, 6, 7, 10],     // whole-tone-ish
        baseNote: 48,
        tempoBase: 55,
        percChance: 0.08,
        padInst: 'warm_pad',
        bassInst: 'cello',
        density: 0.5,  // sparse ambient beginning
      },
      {
        name: 'Inflation',
        inst: 'bell',
        melodyInst: 'piano',
        scale: [0, 2, 4, 5, 7, 9, 11],  // major
        baseNote: 52,
        tempoBase: 72,
        percChance: 0.2,
        padInst: 'choir_oo',
        bassInst: 'cello',
        density: 0.7,
      },
      {
        name: 'Stellar Nucleosynthesis',
        inst: 'violin',
        melodyInst: 'flute',
        scale: [0, 2, 3, 5, 7, 8, 10],  // natural minor
        baseNote: 55,
        tempoBase: 88,
        percChance: 0.3,
        padInst: 'cello',
        bassInst: 'cello',
        density: 0.85,
      },
      {
        name: 'Galaxy Formation',
        inst: 'piano',
        melodyInst: 'violin',
        scale: [0, 2, 4, 7, 9],          // major pentatonic
        baseNote: 60,
        tempoBase: 105,
        percChance: 0.4,
        padInst: 'warm_pad',
        bassInst: 'cello',
        density: 1.0,
      },
      {
        name: 'Solar Ignition',
        inst: 'trumpet',
        melodyInst: 'horn',
        scale: [0, 1, 4, 5, 7, 8, 10],  // phrygian dominant
        baseNote: 57,
        tempoBase: 112,
        percChance: 0.45,
        padInst: 'horn',
        bassInst: 'cello',
        density: 1.0,
      },
      {
        name: 'Emergence of Life',
        inst: 'flute',
        melodyInst: 'piano',
        scale: [0, 2, 4, 6, 7, 9, 11],  // lydian
        baseNote: 64,
        tempoBase: 95,
        percChance: 0.35,
        padInst: 'choir_ah',
        bassInst: 'cello',
        density: 0.9,
      },
    ];
  }

  // ──── PRNG (Mulberry32) ────

  _seedRng(seed) {
    this._rngState = seed | 0;
  }

  /** @returns {number} Random float in [0, 1). */
  _rand() {
    let t = (this._rngState += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @returns {number} Random int in [min, max). */
  _randInt(min, max) {
    return min + Math.floor(this._rand() * (max - min));
  }

  /** Pick random element from array. */
  _pick(arr) {
    return arr[Math.floor(this._rand() * arr.length)];
  }

  // ──── Generation ────

  /**
   * Generate a complete 30-minute universe cycle.
   * @param {number} [seed] - Random seed (auto-generated if not provided).
   */
  generate(seed) {
    this.seed = seed !== undefined ? seed : Math.floor(Math.random() * 2147483647);
    this._seedRng(this.seed);

    this._tracks = [];
    this._trackNames = [];

    for (let i = 0; i < this.trackCount; i++) {
      const epoch = this._epochs[i];
      this._trackNames.push(epoch.name);
      const notes = this._generateTrack(epoch, i);
      this._tracks.push(notes);
    }
  }

  /**
   * Generate note events for one track/epoch.
   * @param {Object} epoch - Epoch configuration.
   * @param {number} epochIndex - Index (0-5).
   * @returns {Array<Object>} Sorted note events.
   */
  _generateTrack(epoch, epochIndex) {
    const notes = [];
    const dur = this.trackDuration;
    const bpm = epoch.tempoBase + this._randInt(-8, 8);
    const beatDur = 60 / bpm;
    const density = epoch.density || 1.0;

    // ──── Pad / Drone Layer ────
    this._generatePadLayer(notes, epoch, dur, beatDur);

    // ──── Bass Layer (like Python's bass track) ────
    this._generateBassLayer(notes, epoch, dur, beatDur, density);

    // ──── Melody Layer ────
    this._generateMelodyLayer(notes, epoch, dur, beatDur);

    // ──── Counter-Melody Layer (second instrument for richness) ────
    this._generateCounterMelodyLayer(notes, epoch, dur, beatDur, density);

    // ──── Chord Layer ────
    this._generateChordLayer(notes, epoch, dur, beatDur);

    // ──── Arpeggio Layer ────
    this._generateArpeggioLayer(notes, epoch, dur, beatDur);

    // ──── Percussion Layer ────
    this._generatePercussionLayer(notes, epoch, dur, beatDur);

    notes.sort((a, b) => a.t - b.t);
    return notes;
  }

  /**
   * Generate slow-moving pad/drone notes.
   */
  _generatePadLayer(notes, epoch, dur, beatDur) {
    let t = 0;
    const padDur = beatDur * 6 + this._rand() * beatDur * 4;
    while (t < dur) {
      const noteLen = padDur + this._rand() * beatDur * 4;
      const scaleIdx = this._randInt(0, epoch.scale.length);
      const pitch = epoch.baseNote - 12 + epoch.scale[scaleIdx];
      const vel = 0.15 + this._rand() * 0.15;
      const bend = (this._rand() < this.bendAmount) ? (this._rand() - 0.5) * 0.3 : 0;

      notes.push({
        t, dur: Math.min(noteLen, dur - t),
        note: pitch, vel, ch: 1,
        inst: epoch.padInst, bend,
      });

      // Add a harmony note (3rd or 5th above) for richer pads
      if (this._rand() < 0.6) {
        const harmIdx = (scaleIdx + 2) % epoch.scale.length;
        const harmOctave = (scaleIdx + 2 >= epoch.scale.length) ? 12 : 0;
        const harmPitch = epoch.baseNote - 12 + epoch.scale[harmIdx] + harmOctave;
        notes.push({
          t: t + this._rand() * beatDur,
          dur: Math.min(noteLen * 0.8, dur - t),
          note: harmPitch, vel: vel * 0.7, ch: 1,
          inst: epoch.padInst, bend: bend * 0.5,
        });
      }

      t += noteLen * (0.6 + this._rand() * 0.4);
    }
  }

  /**
   * Generate bass line (root notes following chord progression).
   * Mirrors Python engine's bass track with octave-dropped scale tones.
   */
  _generateBassLayer(notes, epoch, dur, beatDur, density) {
    let t = 0;
    const scale = epoch.scale;
    const bassBase = epoch.baseNote - 24; // Two octaves below melody
    const bassInterval = beatDur * 2; // Bass hits every 2 beats

    while (t < dur) {
      if (this._rand() < 0.85 * density) {
        const rootIdx = this._randInt(0, scale.length);
        const pitch = bassBase + scale[rootIdx];
        const noteDur = beatDur * (1.5 + this._rand() * 2.5);
        const vel = 0.25 + this._rand() * 0.2;

        if (pitch >= 24 && pitch <= 60) {
          notes.push({
            t, dur: Math.min(noteDur, dur - t) * 0.9,
            note: pitch, vel, ch: 4,
            inst: epoch.bassInst || 'cello', bend: 0,
          });

          // Occasional octave doubling for richness
          if (this._rand() < 0.3 * density) {
            notes.push({
              t: t + beatDur * 0.5,
              dur: beatDur * 0.8,
              note: pitch + 12, vel: vel * 0.6, ch: 4,
              inst: epoch.bassInst || 'cello', bend: 0,
            });
          }
        }
      }

      t += bassInterval * (0.8 + this._rand() * 0.4);
    }
  }

  /**
   * Generate counter-melody (secondary melodic voice for texture).
   * Uses the epoch's melodyInst (different from main inst) for timbral variety.
   */
  _generateCounterMelodyLayer(notes, epoch, dur, beatDur, density) {
    if (density < 0.6) return; // Skip for sparse early epochs

    let t = beatDur * 8; // Enter after the main melody establishes
    let prevPitch = epoch.baseNote + 7; // Start a 5th above
    const scale = epoch.scale;

    while (t < dur) {
      // Counter-melody plays less frequently than main melody
      if (this._rand() < 0.55 * density) {
        const noteDur = beatDur * (1 + this._rand() * 3);
        const interval = this._randInt(-3, 4);
        const scalePos = this._nearestScalePos(prevPitch, epoch.baseNote, scale) + interval;
        const pitch = Math.max(48, Math.min(84, this._scalePosToPitch(scalePos, epoch.baseNote, scale)));
        prevPitch = pitch;

        const vel = 0.25 + this._rand() * 0.25;
        const bend = (this._rand() < this.bendAmount * 0.3) ?
          (this._rand() - 0.5) * this.bendAmount * 0.3 : 0;

        notes.push({
          t, dur: noteDur * 0.85,
          note: pitch, vel, ch: 5,
          inst: epoch.melodyInst || epoch.inst, bend,
        });
      }

      t += beatDur * (1 + this._rand() * 3);

      // Occasional long pause for breathing room
      if (this._rand() < 0.15) {
        t += beatDur * this._randInt(4, 12);
      }
    }
  }

  /**
   * Generate the main melody line.
   */
  _generateMelodyLayer(notes, epoch, dur, beatDur) {
    let t = beatDur * 2; // slight delay for melody entry
    let prevPitch = epoch.baseNote;
    const scale = epoch.scale;

    while (t < dur) {
      // Decide note duration: eighth, quarter, half, or whole beat
      const durations = [beatDur * 0.5, beatDur, beatDur * 2, beatDur * 4];
      const weights = [0.3, 0.4, 0.2, 0.1];
      const noteDur = this._weightedPick(durations, weights);

      // Decide pitch: step motion with occasional leaps
      let interval;
      if (this._rand() < 0.7) {
        // Step: move 1-2 scale degrees
        interval = this._randInt(-2, 3);
      } else {
        // Leap: move 3-5 scale degrees
        interval = this._randInt(-5, 6);
        if (interval === 0) interval = 3;
      }

      // Map to scale
      const prevScalePos = this._nearestScalePos(prevPitch, epoch.baseNote, scale);
      const newScalePos = prevScalePos + interval;
      const newPitch = this._scalePosToPitch(newScalePos, epoch.baseNote, scale);

      // Clamp to reasonable range
      const pitch = Math.max(36, Math.min(96, newPitch));
      prevPitch = pitch;

      const vel = 0.4 + this._rand() * 0.4;
      const bend = (this._rand() < this.bendAmount) ? (this._rand() - 0.5) * this.bendAmount : 0;

      // Rest probability (lower = more notes)
      if (this._rand() > 0.1) {
        notes.push({
          t, dur: noteDur * 0.9,
          note: pitch, vel, ch: 0,
          inst: epoch.inst, bend,
        });
      }

      t += noteDur;

      // Occasional pause for phrasing
      if (this._rand() < 0.08) {
        t += beatDur * this._randInt(1, 3);
      }
    }
  }

  /**
   * Generate chord hits at configurable density.
   */
  _generateChordLayer(notes, epoch, dur, beatDur) {
    if (this.chordDensity <= 0) return;

    let t = 0;
    const scale = epoch.scale;
    const chordInterval = beatDur * 4 / Math.max(0.1, this.chordDensity);

    while (t < dur) {
      if (this._rand() < this.chordDensity) {
        // Build a chord: root + third + fifth (in scale)
        const rootIdx = this._randInt(0, scale.length);
        const root = epoch.baseNote + scale[rootIdx];
        const chordTones = [root];

        // Add third (2 scale degrees up)
        const thirdIdx = (rootIdx + 2) % scale.length;
        const thirdOctave = (rootIdx + 2 >= scale.length) ? 12 : 0;
        chordTones.push(epoch.baseNote + scale[thirdIdx] + thirdOctave);

        // Add fifth (4 scale degrees up)
        const fifthIdx = (rootIdx + 4) % scale.length;
        const fifthOctave = (rootIdx + 4 >= scale.length) ? 12 : 0;
        chordTones.push(epoch.baseNote + scale[fifthIdx] + fifthOctave);

        // Optional: add seventh for dense chords
        if (this.chordDensity > 0.7 && this._rand() < 0.5) {
          const sevIdx = (rootIdx + 6) % scale.length;
          const sevOctave = (rootIdx + 6 >= scale.length) ? 12 : 0;
          chordTones.push(epoch.baseNote + scale[sevIdx] + sevOctave);
        }

        const chordDur = beatDur * (2 + this._rand() * 4);
        const vel = 0.2 + this._rand() * 0.25;

        for (const pitch of chordTones) {
          notes.push({
            t, dur: chordDur * 0.9,
            note: pitch, vel, ch: 2,
            inst: epoch.padInst, bend: 0,
          });
        }
      }

      t += chordInterval * (0.8 + this._rand() * 0.4);
    }
  }

  /**
   * Generate arpeggio runs at configurable amount.
   */
  _generateArpeggioLayer(notes, epoch, dur, beatDur) {
    if (this.arpeggioAmount <= 0) return;

    let t = beatDur * 4;
    const scale = epoch.scale;

    while (t < dur) {
      if (this._rand() < this.arpeggioAmount) {
        // Generate an arpeggio run
        const runLength = this._randInt(4, 12);
        const startIdx = this._randInt(0, scale.length);
        const stepDur = beatDur * (0.15 + this._rand() * 0.2);
        const ascending = this._rand() < 0.6;
        const vel = 0.3 + this._rand() * 0.3;

        for (let i = 0; i < runLength; i++) {
          const scalePos = ascending
            ? startIdx + i
            : startIdx + runLength - 1 - i;
          const pitch = this._scalePosToPitch(scalePos, epoch.baseNote, scale);
          const bend = (this._rand() < this.bendAmount * 0.5) ?
            (this._rand() - 0.5) * this.bendAmount * 0.5 : 0;

          if (pitch >= 36 && pitch <= 96) {
            notes.push({
              t: t + i * stepDur,
              dur: stepDur * 0.8,
              note: pitch,
              vel: vel * (0.8 + 0.2 * (i / runLength)),
              ch: 3,
              inst: epoch.inst,
              bend,
            });
          }
        }

        t += runLength * stepDur + beatDur * 2;
      }

      t += beatDur * (2 + this._rand() * 6) / Math.max(0.1, this.arpeggioAmount);
    }
  }

  /**
   * Generate percussion patterns.
   */
  _generatePercussionLayer(notes, epoch, dur, beatDur) {
    if (epoch.percChance <= 0) return;

    let t = 0;
    const patternLen = this._randInt(4, 8);
    const pattern = [];

    // Generate a repeating pattern
    for (let i = 0; i < patternLen; i++) {
      const kick = (i === 0 || (i === patternLen / 2 && this._rand() < 0.7));
      const snare = (i === Math.floor(patternLen / 2) || (this._rand() < 0.15));
      const hihat = this._rand() < 0.6;
      pattern.push({ kick, snare, hihat });
    }

    let beatIdx = 0;
    while (t < dur) {
      if (this._rand() < epoch.percChance) {
        const p = pattern[beatIdx % patternLen];

        if (p.kick) {
          notes.push({
            t, dur: 0.15, note: 36, vel: 0.5 + this._rand() * 0.3,
            ch: 9, inst: 'percussion', bend: 0,
          });
        }
        if (p.snare) {
          notes.push({
            t, dur: 0.1, note: 38, vel: 0.4 + this._rand() * 0.3,
            ch: 9, inst: 'percussion', bend: 0,
          });
        }
        if (p.hihat) {
          notes.push({
            t, dur: 0.05, note: 42, vel: 0.2 + this._rand() * 0.2,
            ch: 9, inst: 'percussion', bend: 0,
          });
        }
      }

      beatIdx++;
      t += beatDur;
    }
  }

  // ──── Scale Helpers ────

  _nearestScalePos(pitch, baseNote, scale) {
    const rel = pitch - baseNote;
    const octave = Math.floor(rel / 12);
    const pc = ((rel % 12) + 12) % 12;
    let bestIdx = 0;
    let bestDist = 12;
    for (let i = 0; i < scale.length; i++) {
      const d = Math.abs(scale[i] - pc);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return octave * scale.length + bestIdx;
  }

  _scalePosToPitch(scalePos, baseNote, scale) {
    const len = scale.length;
    const octave = Math.floor(scalePos / len);
    const idx = ((scalePos % len) + len) % len;
    return baseNote + octave * 12 + scale[idx];
  }

  _weightedPick(items, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this._rand() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // ──── Playback Controls ────

  /**
   * Start or resume playback of the current track.
   */
  play() {
    if (this.isPlaying) return;
    if (this._tracks.length === 0) this.generate();
    if (!this._tracks[this.currentTrack]?.length) return;

    if (this._synth) {
      this._synth.init();
      this._synth.resume();
    }

    this.isPlaying = true;
    const ctx = this._synth?.ctx;
    if (ctx) {
      this._startCtxTime = ctx.currentTime - (this._currentTime / this.speed);
    }

    this._scheduleLoop();
    this._startEmitLoop();
  }

  /** Pause playback. */
  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this._currentTime = this.getCurrentTime();
    if (this._synth) this._synth.stopAll();
    this._cancelLoops();
  }

  /** Stop and reset to beginning of current track. */
  stop() {
    this.isPlaying = false;
    this._currentTime = 0;
    this._nextNote = 0;
    if (this._synth) this._synth.stopAll();
    this._cancelLoops();
  }

  /**
   * Seek to a time within the current track.
   * @param {number} timeSec
   */
  seek(timeSec) {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying) {
      if (this._synth) this._synth.stopAll();
      this._cancelLoops();
      this.isPlaying = false;
    }

    const trackNotes = this._tracks[this.currentTrack] || [];
    timeSec = Math.max(0, Math.min(timeSec, this.trackDuration));
    this._currentTime = timeSec;

    // Binary search for note index
    let lo = 0, hi = trackNotes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((trackNotes[mid].t / this.speed) < timeSec) lo = mid + 1;
      else hi = mid;
    }
    this._nextNote = lo;

    if (wasPlaying) {
      this.isPlaying = true;
      const ctx = this._synth?.ctx;
      if (ctx) {
        this._startCtxTime = ctx.currentTime - (this._currentTime / this.speed);
      }
      this._scheduleLoop();
      this._startEmitLoop();
    }
  }

  /**
   * Switch to the next track in the cycle.
   * @returns {boolean} True if a next track exists.
   */
  nextTrack() {
    this.stop();
    if (this.currentTrack < this.trackCount - 1) {
      this.currentTrack++;
    } else {
      // Regenerate a new cycle with a new seed
      this.generate();
      this.currentTrack = 0;
    }
    this._nextNote = 0;
    return true;
  }

  /**
   * Switch to the previous track in the cycle.
   * @returns {boolean} True if a previous track exists.
   */
  prevTrack() {
    this.stop();
    if (this.currentTrack > 0) {
      this.currentTrack--;
    } else {
      this._currentTime = 0;
    }
    this._nextNote = 0;
    return true;
  }

  /** @returns {number} Current playback time in seconds. */
  getCurrentTime() {
    if (!this.isPlaying || !this._synth?.ctx) return this._currentTime;
    return (this._synth.ctx.currentTime - this._startCtxTime) * this.speed;
  }

  /** @returns {number} Duration of the current track (accounting for speed). */
  getDuration() {
    return this.trackDuration / this.speed;
  }

  /** @returns {string} Name of the current track/epoch. */
  getCurrentTrackName() {
    return this._trackNames[this.currentTrack] || 'Unknown Epoch';
  }

  /**
   * Set playback speed.
   * @param {number} spd - Speed multiplier (0.25-4.0).
   */
  setSpeed(spd) {
    const currentPos = this.getCurrentTime();
    this.speed = Math.max(0.25, Math.min(4.0, spd));
    if (this.isPlaying) {
      this._currentTime = currentPos;
      const ctx = this._synth?.ctx;
      if (ctx) {
        this._startCtxTime = ctx.currentTime - (this._currentTime / this.speed);
      }
    }
  }

  // ──── Scheduling ────

  _scheduleLoop() {
    if (!this.isPlaying) return;

    const trackNotes = this._tracks[this.currentTrack] || [];
    const now = this.getCurrentTime();
    const lookAhead = 0.15;

    while (this._nextNote < trackNotes.length) {
      const note = trackNotes[this._nextNote];
      const noteTime = note.t / this.speed;

      if (noteTime > now + lookAhead) break;

      if (noteTime >= now - 0.05 && this._synth) {
        this._synth.playNote(note, Math.max(0, noteTime - now));
      }
      this._nextNote++;
    }

    // Check if track ended
    if (this._nextNote >= trackNotes.length && now >= this.trackDuration / this.speed) {
      this.isPlaying = false;
      this._cancelLoops();
      if (this.onTrackEnd) this.onTrackEnd();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._scheduleLoop());
  }

  _startEmitLoop() {
    if (this._emitInterval) clearInterval(this._emitInterval);
    this._emitInterval = setInterval(() => {
      if (!this.isPlaying || !this.onNoteEvent) return;

      const trackNotes = this._tracks[this.currentTrack] || [];
      const now = this.getCurrentTime();
      const activeEvents = [];

      for (const note of trackNotes) {
        const t = note.t / this.speed;
        const dur = (note.dur || 0.2) / this.speed;
        if (t > now + 0.05) break;
        if (t + dur > now && t <= now) {
          activeEvents.push({
            t, dur,
            note: note.note,
            inst: note.inst || 'piano',
            vel: note.vel || 0.5,
            ch: note.ch || 0,
            bend: note.bend || 0,
          });
        }
      }

      this.onNoteEvent(activeEvents);
    }, 50); // 20 Hz
  }

  _cancelLoops() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    if (this._emitInterval) { clearInterval(this._emitInterval); this._emitInterval = 0; }
  }

  /** Release resources. */
  destroy() {
    this.stop();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicGenerator };
}
