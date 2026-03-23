/**
 * MIDI Player for the Visualizer — uses SynthEngine + Web Worker.
 *
 * Parses MIDI files in a Web Worker (synth-worker.js) for non-blocking I/O,
 * then schedules playback through SynthEngine's additive synthesis.
 * Falls back to main-thread parsing if Workers are unavailable.
 *
 * Emits note events for grid visualization at ~20 Hz.
 * Supports 16 mutation presets, infinite shuffle, pitch bend coloring.
 */

class MidiFilePlayer {
  /**
   * @param {SynthEngine} synthEngine - Shared synth engine instance.
   * @param {Object} [options]
   * @param {string} [options.workerUrl] - URL of synth-worker.js
   */
  constructor(synthEngine, options) {
    this.synth = synthEngine;
    /** @type {Worker|null} */
    this._worker = null;
    /** @type {boolean} */
    this._workerReady = false;
    /** @type {number} Parse request counter. */
    this._parseId = 0;
    /** @type {Map<number, {resolve, reject}>} Pending parse promises. */
    this._pending = new Map();

    /** @type {Array} Parsed note events sorted by time. */
    this._notes = [];
    /** @type {number} Duration in seconds. */
    this._duration = 0;
    /** @type {Object|null} MIDI header info. */
    this._header = null;

    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {number} Current playback position in seconds. */
    this._currentTime = 0;
    /** @type {number} AudioContext time at play start. */
    this._startCtxTime = 0;
    /** @type {number} Next note index to schedule. */
    this._nextNote = 0;
    /** @type {number} RAF id for scheduling loop. */
    this._rafId = 0;
    /** @type {number} Interval id for event emission. */
    this._emitInterval = 0;

    /** @type {Object} Current mutation. */
    this._mutation = { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };

    /** Callbacks. */
    this.onNoteEvent = null;  // (events: Array) => void
    this.onTrackEnd = null;   // () => void
    this.onTimeUpdate = null; // (time: number) => void

    /** @type {Object|null} Catalog metadata for the current MIDI. */
    this.trackInfo = null;

    // Try to init worker
    const workerUrl = options?.workerUrl || 'js/synth-worker.js';
    this._initWorker(workerUrl);
  }

  _initWorker(url) {
    try {
      this._worker = new Worker(url);
      this._workerReady = true;
      this._worker.onmessage = (e) => this._onWorkerMessage(e);
      this._worker.onerror = () => {
        this._workerReady = false;
        this._worker = null;
      };
    } catch (err) {
      this._workerReady = false;
      this._worker = null;
    }
  }

  _onWorkerMessage(e) {
    const msg = e.data;
    const pending = this._pending.get(msg.id);
    if (!pending) return;
    this._pending.delete(msg.id);

    if (msg.type === 'notes') {
      pending.resolve({ notes: msg.notes, duration: msg.duration, header: msg.header });
    } else if (msg.type === 'error') {
      pending.reject(new Error(msg.message));
    }
  }

  /**
   * Parse MIDI file — uses Worker if available, else falls back to main thread.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{notes, duration, header}>}
   */
  async _parseMidi(buffer) {
    if (this._worker && this._workerReady) {
      return new Promise((resolve, reject) => {
        const id = ++this._parseId;
        this._pending.set(id, { resolve, reject });
        this._worker.postMessage({ type: 'parse', buffer, id }, [buffer]);
      });
    }

    // Fallback: parse on main thread (reuse MidiPlayer static method if available)
    if (typeof MidiPlayer !== 'undefined' && MidiPlayer._parseMidi) {
      const data = new DataView(buffer);
      const result = MidiPlayer._parseMidi(data);
      if (!result) throw new Error('Invalid MIDI file');
      return result;
    }
    throw new Error('No MIDI parser available');
  }

  /**
   * Load a MIDI file from an ArrayBuffer.
   * @param {ArrayBuffer} buffer
   * @returns {Promise<boolean>}
   */
  async loadMidi(buffer) {
    this.stop();

    try {
      const result = await this._parseMidi(buffer);
      this._notes = result.notes;
      this._duration = result.duration;
      this._header = result.header;
      this._nextNote = 0;
      this._currentTime = 0;
      return true;
    } catch (e) {
      console.warn('MIDI parse error:', e);
      return false;
    }
  }

  /** Start or resume playback. */
  play() {
    if (this.isPlaying) return;
    if (!this._notes.length) return;

    this.synth.init();
    this.synth.resume();
    this.synth.setMutation(this._mutation);

    this.isPlaying = true;
    this._startCtxTime = this.synth.ctx.currentTime - this._currentTime;
    this._scheduleLoop();
    this._startEmitLoop();
  }

  /** Pause playback. */
  pause() {
    this.isPlaying = false;
    this._currentTime = this.getCurrentTime();
    this.synth.stopAll();
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    if (this._emitInterval) { clearInterval(this._emitInterval); this._emitInterval = 0; }
  }

  /** Stop and reset to beginning. */
  stop() {
    this.isPlaying = false;
    this._currentTime = 0;
    this._nextNote = 0;
    this.synth.stopAll();
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    if (this._emitInterval) { clearInterval(this._emitInterval); this._emitInterval = 0; }
  }

  /** @returns {number} Current playback time in seconds. */
  getCurrentTime() {
    if (!this.isPlaying || !this.synth.ctx) return this._currentTime;
    return this.synth.ctx.currentTime - this._startCtxTime;
  }

  /** @returns {number} Total duration in seconds. */
  getDuration() { return this._duration; }

  /** Set mutation preset. */
  setMutation(mutation) {
    this._mutation = mutation || { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };
    this.synth.setMutation(this._mutation);
  }

  /** Seek to a position in seconds. */
  seek(time) {
    const wasPlaying = this.isPlaying;
    this.stop();
    this._currentTime = Math.max(0, Math.min(time, this._duration));

    // Find the next note index
    const tempoMult = this._mutation.tempoMult || 1.0;
    this._nextNote = 0;
    for (let i = 0; i < this._notes.length; i++) {
      if (this._notes[i].t / tempoMult >= this._currentTime) {
        this._nextNote = i;
        break;
      }
      if (i === this._notes.length - 1) this._nextNote = this._notes.length;
    }

    if (wasPlaying) this.play();
  }

  /** Get info about the loaded track. */
  getTrackInfo() {
    return {
      noteCount: this._notes.length,
      duration: this._duration,
      channels: [...new Set(this._notes.map(n => n.ch))].length,
      ...(this.trackInfo || {}),
    };
  }

  // ──── Scheduling ────

  _scheduleLoop() {
    if (!this.isPlaying) return;

    const now = this.getCurrentTime();
    const lookAhead = 0.15;
    const tempoMult = this._mutation.tempoMult || 1.0;

    while (this._nextNote < this._notes.length) {
      const note = this._notes[this._nextNote];
      const noteTime = note.t / tempoMult;
      if (noteTime > now + lookAhead) break;

      if (noteTime >= now - 0.05) {
        this.synth.playNote(note, noteTime - now);
      }
      this._nextNote++;
    }

    // Check track end
    if (this._nextNote >= this._notes.length && now >= this._duration / tempoMult) {
      this.isPlaying = false;
      if (this._emitInterval) { clearInterval(this._emitInterval); this._emitInterval = 0; }
      if (this.onTrackEnd) this.onTrackEnd();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._scheduleLoop());
  }

  _startEmitLoop() {
    if (this._emitInterval) clearInterval(this._emitInterval);
    this._emitInterval = setInterval(() => {
      if (!this.isPlaying) return;

      const now = this.getCurrentTime();
      if (this.onTimeUpdate) this.onTimeUpdate(now);

      if (!this.onNoteEvent) return;

      const tempoMult = this._mutation.tempoMult || 1.0;
      const pitchShift = this._mutation.pitchShift || 0;
      const active = [];

      for (const note of this._notes) {
        const t = note.t / tempoMult;
        const dur = (note.dur || 0.2) / tempoMult;
        if (t > now + 0.05) break;
        if (t + dur > now && t <= now) {
          active.push({
            t, dur,
            note: note.note + pitchShift,
            inst: note.inst || 'piano',
            vel: note.vel || 0.5,
            ch: note.ch || 0,
            bend: note.bend || 0,
          });
        }
      }

      this.onNoteEvent(active);
    }, 50); // 20 Hz
  }

  /** Destroy the player and terminate the worker. */
  destroy() {
    this.stop();
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    for (const [, p] of this._pending) {
      p.reject(new Error('Player destroyed'));
    }
    this._pending.clear();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MidiFilePlayer };
}
