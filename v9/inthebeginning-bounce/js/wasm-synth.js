/**
 * WebAssembly Synthesizer Bridge for inthebeginning bounce.
 *
 * Provides a 4th audio mode ("WASM Synth") that renders MIDI through a
 * WebAssembly audio synthesis module. When the WASM binary is available,
 * synthesis runs in an AudioWorklet powered by Rust-compiled WebAssembly
 * for higher performance and lower latency.
 *
 * When the WASM binary is NOT available (e.g., not yet compiled, network
 * error, or unsupported browser), gracefully falls back to the existing
 * SynthEngine (additive synthesis + sample bank).
 *
 * The WasmSynth exposes the same API surface as MidiPlayer so it can be
 * used interchangeably by GamePlayer. It manages its own MIDI catalog,
 * shuffle history, and playback state.
 *
 * Existing "knobs" (mutation presets, volume, speed) all work in WASM mode
 * by forwarding parameters to the WASM module (or to the fallback synth).
 */

class WasmSynth {
  /**
   * @param {SynthEngine} fallbackSynth - Shared SynthEngine for fallback mode.
   */
  constructor(fallbackSynth) {
    /** @type {SynthEngine} Fallback synth engine when WASM is unavailable. */
    this._fallbackSynth = fallbackSynth;

    /** @type {boolean} Whether the WASM module loaded successfully. */
    this._wasmReady = false;

    /** @type {object|null} WASM module exports (init, note_on, note_off, render). */
    this._wasmModule = null;

    /** @type {AudioWorkletNode|null} AudioWorklet node for WASM rendering. */
    this._workletNode = null;

    /** @type {AudioContext|null} Audio context (shared or own). */
    this._ctx = null;

    /** @type {boolean} Whether a SoundFont is loaded in the WASM engine. */
    this._sf2Loaded = false;

    // ──── Playback state ────
    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {number} Current playback position in seconds. */
    this._currentTime = 0;
    /** @type {number} AudioContext.currentTime when playback started/resumed. */
    this._startCtxTime = 0;
    /** @type {number} Duration of loaded MIDI in seconds. */
    this._duration = 0;
    /** @type {Array} Parsed note events sorted by time. */
    this._notes = [];
    /** @type {number} Next note index to schedule. */
    this._nextNote = 0;
    /** @type {number} RAF ID for scheduling loop. */
    this._rafId = 0;
    /** @type {number} Interval ID for note event emission. */
    this._emitInterval = 0;

    // ──── Mutation & speed ────
    /** @type {Object} Current mutation preset. */
    this._mutation = { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };
    /** @type {number} Playback speed multiplier. */
    this._speedMult = 1.0;
    /** @type {number} Volume (0-1). */
    this._volume = 0.8;

    // ──── MIDI catalog & shuffle ────
    /** @type {Array} Full MIDI catalog entries. */
    this.catalog = [];
    /** @type {string} Base URL for MIDI files. */
    this.catalogBaseUrl = '';
    /** @type {Array<number>} Shuffle history (indices into catalog). */
    this._shuffleHistory = [];
    /** @type {number} Current position in shuffle history. */
    this._shufflePos = -1;

    // ──── Track metadata ────
    /** @type {Object|null} Current track info (name, composer, era). */
    this.trackInfo = null;

    // ──── Worker for MIDI parsing ────
    /** @type {Worker|null} */
    this._worker = null;
    /** @type {boolean} */
    this._workerReady = false;
    /** @type {number} */
    this._parseId = 0;
    /** @type {Map<number, {resolve, reject}>} */
    this._pending = new Map();

    // ──── Callbacks ────
    /** @type {Function|null} Note event callback for visualization. */
    this.onNoteEvent = null;
    /** @type {Function|null} Track end callback. */
    this.onTrackEnd = null;

    this._initWorker();
  }

  // ──── Initialization ────

  /**
   * Attempt to load the WASM synthesis module.
   * @param {string} [wasmUrl='js/wasm-synth.wasm'] - URL to the .wasm binary.
   * @returns {Promise<boolean>} True if WASM loaded, false if falling back.
   */
  async initWasm(wasmUrl) {
    wasmUrl = wasmUrl || 'js/wasm_synth_bg.wasm';
    try {
      if (typeof WebAssembly === 'undefined') {
        console.warn('WasmSynth: WebAssembly not supported, using fallback');
        return false;
      }

      const resp = await fetch(wasmUrl);
      if (!resp.ok) {
        console.warn(`WasmSynth: WASM binary not found at ${wasmUrl}, using fallback`);
        return false;
      }

      // Store raw bytes for AudioWorklet initialization
      this._wasmBytes = await resp.arrayBuffer();
      this._wasmReady = true;
      console.log('WasmSynth: WASM binary fetched successfully (' +
        Math.round(this._wasmBytes.byteLength / 1024) + 'KB)');
      return true;
    } catch (e) {
      console.warn('WasmSynth: Failed to load WASM module, using fallback:', e.message);
      this._wasmReady = false;
      return false;
    }
  }

  /**
   * Initialize the AudioContext and AudioWorklet for WASM rendering.
   * If WASM is available and AudioWorklet is supported, sets up WASM-powered
   * audio rendering. Otherwise falls back to SynthEngine.
   */
  async initAudio() {
    // Always ensure fallback synth is initialized
    if (this._fallbackSynth) {
      this._fallbackSynth.init();
    }

    if (!this._wasmReady || !this._wasmBytes) return;

    // Get or create AudioContext
    this._ctx = this._fallbackSynth?.ctx ||
      new (window.AudioContext || window.webkitAudioContext)();

    // Try AudioWorklet (modern browsers)
    if (this._ctx.audioWorklet) {
      try {
        await this._ctx.audioWorklet.addModule('js/wasm-synth-processor.js');
        this._workletNode = new AudioWorkletNode(this._ctx, 'wasm-synth-processor');
        this._workletNode.connect(this._ctx.destination);

        // Send WASM bytes to the worklet for initialization
        this._workletNode.port.postMessage(
          { type: 'init', wasmBytes: this._wasmBytes.slice(0) },
          // Transfer a copy (can't transfer the original, we might need it)
        );

        // Wait for worklet to confirm WASM init
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.warn('WasmSynth: AudioWorklet init timed out, using fallback');
            this._workletNode.disconnect();
            this._workletNode = null;
            this._wasmReady = false;
            resolve();
          }, 5000);

          this._workletNode.port.onmessage = (e) => {
            if (e.data.type === 'ready') {
              clearTimeout(timeout);
              console.log('WasmSynth: AudioWorklet WASM engine ready');
              resolve();
            } else if (e.data.type === 'error') {
              clearTimeout(timeout);
              console.warn('WasmSynth: AudioWorklet init failed:', e.data.message);
              this._workletNode.disconnect();
              this._workletNode = null;
              this._wasmReady = false;
              resolve();
            }
          };
        });
      } catch (e) {
        console.warn('WasmSynth: AudioWorklet setup failed:', e.message, '— using fallback');
        this._workletNode = null;
        this._wasmReady = false;
      }
    } else {
      console.warn('WasmSynth: AudioWorklet not supported, using fallback');
      this._wasmReady = false;
    }
  }

  // ──── SoundFont Loading ────

  /**
   * Load a SoundFont (.sf2) file into the WASM engine.
   * When loaded, the WASM engine uses SF2 samples for higher-fidelity synthesis.
   * @param {string} sf2Url - URL to the .sf2 file.
   * @returns {Promise<boolean>} True if SF2 loaded successfully.
   */
  async loadSoundFont(sf2Url) {
    if (!this._wasmReady || !this._workletNode) {
      console.warn('WasmSynth: Cannot load SF2 — WASM not active');
      return false;
    }

    try {
      const resp = await fetch(sf2Url);
      if (!resp.ok) {
        console.warn(`WasmSynth: SF2 not found at ${sf2Url}`);
        return false;
      }

      const sf2Bytes = await resp.arrayBuffer();
      const sizeMB = (sf2Bytes.byteLength / (1024 * 1024)).toFixed(1);
      console.log(`WasmSynth: Loading SF2 (${sizeMB}MB)...`);

      // Send SF2 data to the AudioWorklet
      this._workletNode.port.postMessage(
        { type: 'load_sf2', sf2Bytes: sf2Bytes },
      );

      // Wait for confirmation
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('WasmSynth: SF2 load timed out');
          resolve(false);
        }, 30000); // 30s timeout for large SF2 files

        const prevHandler = this._workletNode.port.onmessage;
        this._workletNode.port.onmessage = (e) => {
          if (e.data.type === 'sf2_loaded') {
            clearTimeout(timeout);
            this._sf2Loaded = true;
            console.log(`WasmSynth: SF2 loaded — ${e.data.presets} presets, ${e.data.samples} samples`);
            this._workletNode.port.onmessage = prevHandler;
            resolve(true);
          } else if (e.data.type === 'sf2_error') {
            clearTimeout(timeout);
            console.warn('WasmSynth: SF2 load failed:', e.data.message);
            this._workletNode.port.onmessage = prevHandler;
            resolve(false);
          } else if (prevHandler) {
            prevHandler(e);
          }
        };
      });
    } catch (e) {
      console.warn('WasmSynth: SF2 fetch error:', e.message);
      return false;
    }
  }

  /**
   * Toggle whether the WASM engine uses SF2 samples or additive synthesis.
   * @param {boolean} useSf2 - True to use SF2 samples.
   */
  setUseSf2(useSf2) {
    if (this._workletNode) {
      this._postWorklet({ type: 'set_use_sf2', value: useSf2 });
    }
  }

  /** @returns {boolean} Whether a SoundFont is loaded. */
  get sf2Loaded() {
    return this._sf2Loaded;
  }

  // ──── Worker Setup (reuses synth-worker.js for MIDI parsing) ────

  _initWorker() {
    try {
      this._worker = new Worker('js/synth-worker.js');
      this._workerReady = true;
      this._worker.onmessage = (e) => this._onWorkerMessage(e);
      this._worker.onerror = () => {
        this._workerReady = false;
        this._worker = null;
      };
    } catch (err) {
      this._workerReady = false;
    }
  }

  _onWorkerMessage(e) {
    const msg = e.data;
    const pending = this._pending.get(msg.id);
    if (!pending) return;
    this._pending.delete(msg.id);

    if (msg.type === 'notes') {
      pending.resolve({ notes: msg.notes, duration: msg.duration, header: msg.header });
    } else {
      pending.reject(new Error(msg.message || 'Parse error'));
    }
  }

  // ──── MIDI Catalog Management ────

  /**
   * Load MIDI catalog from a JSON index file.
   * @param {string} catalogUrl - URL to midi_catalog.json.
   * @param {string} [baseUrl] - Base URL for MIDI file paths.
   * @returns {Promise<boolean>}
   */
  async loadCatalog(catalogUrl, baseUrl) {
    try {
      const resp = await fetch(catalogUrl);
      if (!resp.ok) return false;
      const data = await resp.json();
      this.catalog = data.midis || [];
      this.catalogBaseUrl = baseUrl ||
        catalogUrl.substring(0, catalogUrl.lastIndexOf('/') + 1);
      return this.catalog.length > 0;
    } catch (e) {
      return false;
    }
  }

  /**
   * Pick a random MIDI from the catalog, avoiding recent history.
   * @returns {Object|null} Catalog entry { path, name, composer }.
   */
  _pickRandom() {
    if (this.catalog.length === 0) return null;
    const recentSet = new Set(this._shuffleHistory.slice(-20));
    let idx;
    let attempts = 0;
    do {
      idx = Math.floor(Math.random() * this.catalog.length);
      attempts++;
    } while (recentSet.has(idx) && attempts < 50);

    this._shuffleHistory.length = this._shufflePos + 1;
    this._shuffleHistory.push(idx);
    if (this._shuffleHistory.length > 144) {
      this._shuffleHistory.shift();
    }
    this._shufflePos = this._shuffleHistory.length - 1;
    return this.catalog[idx];
  }

  // ──── MIDI Loading ────

  /**
   * Load and start playing the next random MIDI.
   * @returns {Promise<boolean>}
   */
  async loadNextRandom() {
    const entry = this._pickRandom();
    if (!entry) return false;
    return this._loadFromCatalogEntry(entry);
  }

  /**
   * Load a MIDI file from a catalog entry.
   * @param {Object} entry - Catalog entry with path, name, composer.
   * @returns {Promise<boolean>}
   */
  async _loadFromCatalogEntry(entry) {
    try {
      const url = this.catalogBaseUrl + entry.path;
      const resp = await fetch(url);
      if (!resp.ok) return false;
      const buffer = await resp.arrayBuffer();

      const parsed = await this._parseMidi(buffer);
      this._notes = parsed.notes || [];
      this._duration = parsed.duration || 0;
      this._currentTime = 0;
      this._nextNote = 0;

      this.trackInfo = {
        name: entry.name || entry.path.split('/').pop().replace('.mid', ''),
        composer: entry.composer || 'Unknown',
        era: entry.era || '',
      };

      return true;
    } catch (e) {
      console.warn('WasmSynth: Failed to load MIDI:', e.message);
      return false;
    }
  }

  /**
   * Parse a MIDI ArrayBuffer into note events.
   * Uses the Web Worker (same as MidiPlayer).
   * @param {ArrayBuffer} buffer - Raw MIDI file data.
   * @returns {Promise<Object>} Parsed notes and duration.
   */
  _parseMidi(buffer) {
    return new Promise((resolve, reject) => {
      if (!this._workerReady || !this._worker) {
        // Fallback: inline parse (basic)
        reject(new Error('Worker not available'));
        return;
      }
      const id = ++this._parseId;
      this._pending.set(id, { resolve, reject });
      this._worker.postMessage({
        type: 'parse',
        id,
        buffer: new Uint8Array(buffer),
      });
    });
  }

  // ──── Playback Controls ────

  /** Start or resume playback. */
  play() {
    if (this.isPlaying) return;
    if (!this._notes.length) return;

    // Initialize synth (WASM or fallback)
    const synth = this._getActiveSynth();
    if (synth) {
      synth.init();
      synth.resume();
      synth.setMutation(this._mutation);
    } else if (this._workletNode) {
      // WASM mode: ensure AudioContext is resumed and apply settings
      const ctx = this._getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      this._postWorklet({ type: 'set_volume', volume: this._volume });
      this._postWorklet({ type: 'set_pitch_shift', semitones: this._mutation.pitchShift || 0 });
      this._postWorklet({ type: 'set_tempo_mult', mult: this._mutation.tempoMult || 1.0 });
    }

    this.isPlaying = true;
    const ctx = this._getAudioContext();
    if (ctx) {
      this._startCtxTime = ctx.currentTime - (this._currentTime / this._effectiveSpeed());
    }

    this._scheduleLoop();
    this._startEmitLoop();
  }

  /** Pause playback. */
  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this._currentTime = this.getCurrentTime();
    const synth = this._getActiveSynth();
    if (synth) synth.stopAll();
    if (this._workletNode) this._postWorklet({ type: 'stop_all' });
    this._cancelLoops();
  }

  /** Stop playback and reset to beginning. */
  stop() {
    this.isPlaying = false;
    this._currentTime = 0;
    this._nextNote = 0;
    const synth = this._getActiveSynth();
    if (synth) synth.stopAll();
    if (this._workletNode) this._postWorklet({ type: 'stop_all' });
    this._cancelLoops();
  }

  /**
   * Seek to a specific time.
   * @param {number} timeSec - Target time in seconds.
   */
  seek(timeSec) {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying) {
      const synth = this._getActiveSynth();
      if (synth) synth.stopAll();
      if (this._workletNode) this._postWorklet({ type: 'stop_all' });
      this._cancelLoops();
      this.isPlaying = false;
    }

    timeSec = Math.max(0, Math.min(timeSec, this._duration));
    this._currentTime = timeSec;

    const speed = this._effectiveSpeed();
    let lo = 0, hi = this._notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this._notes[mid].t / speed) < timeSec) lo = mid + 1;
      else hi = mid;
    }
    this._nextNote = lo;

    if (wasPlaying) {
      this.isPlaying = true;
      const ctx = this._getAudioContext();
      if (ctx) {
        this._startCtxTime = ctx.currentTime - (this._currentTime / speed);
      }
      this._scheduleLoop();
      this._startEmitLoop();
    }
  }

  /** @returns {number} Current playback time in seconds. */
  getCurrentTime() {
    if (!this.isPlaying) return this._currentTime;
    const ctx = this._getAudioContext();
    if (!ctx) return this._currentTime;
    const speed = this._effectiveSpeed();
    return (ctx.currentTime - this._startCtxTime) * speed;
  }

  /** @returns {number} Duration of loaded MIDI in seconds. */
  getDuration() {
    return this._duration / this._effectiveSpeed();
  }

  /** @returns {Object} Display info for the current track. */
  getDisplayInfo() {
    const sanitize = (s) => String(s || '')
      .replace(/[<>]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .slice(0, 200);
    return {
      name: sanitize(this.trackInfo?.name),
      composer: sanitize(this.trackInfo?.composer),
      era: sanitize(this.trackInfo?.era),
      wasmActive: this._wasmReady,
      sf2Loaded: this._sf2Loaded,
    };
  }

  /** @returns {Object} Track info including note count. */
  getTrackInfo() {
    return {
      noteCount: this._notes.length,
      duration: this._duration,
      channels: [...new Set(this._notes.map(n => n.ch))].length,
      wasmActive: this._wasmReady,
      sf2Loaded: this._sf2Loaded,
      ...(this.trackInfo || {}),
    };
  }

  // ──── Mutation & Settings ────

  /**
   * Apply a mutation preset. Affects both WASM and fallback rendering.
   * @param {Object} mutation - Mutation preset object.
   */
  setMutation(mutation) {
    this._mutation = mutation || { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };
    const synth = this._getActiveSynth();
    if (synth) synth.setMutation(this._mutation);

    // Forward to WASM AudioWorklet
    if (this._workletNode) {
      this._postWorklet({ type: 'set_pitch_shift', semitones: this._mutation.pitchShift || 0 });
      this._postWorklet({ type: 'set_tempo_mult', mult: this._mutation.tempoMult || 1.0 });
    }
  }

  /**
   * Set playback speed multiplier.
   * @param {number} mult - Speed multiplier (0.25-4.0).
   */
  setSpeed(mult) {
    this._speedMult = Math.max(0.25, Math.min(4.0, mult));
  }

  /**
   * Set volume.
   * @param {number} vol - Volume (0-1).
   */
  setVolume(vol) {
    this._volume = Math.max(0, Math.min(1, vol));
    const synth = this._getActiveSynth();
    if (synth) synth.setVolume(this._volume);

    // Forward to WASM AudioWorklet
    if (this._workletNode) {
      this._postWorklet({ type: 'set_volume', volume: this._volume });
    }
  }

  // ──── Internal Helpers ────

  /**
   * Get the active synthesis engine (WASM worklet or fallback SynthEngine).
   * When WASM is active, returns null (audio goes through AudioWorklet).
   * When WASM is not active, returns the fallback SynthEngine.
   * @returns {SynthEngine|null}
   */
  _getActiveSynth() {
    if (this._wasmReady && this._workletNode) {
      return null; // Audio routed through AudioWorklet
    }
    return this._fallbackSynth;
  }

  /**
   * Send a message to the AudioWorklet (when WASM is active).
   * @param {Object} msg - Message to send.
   */
  _postWorklet(msg) {
    if (this._workletNode) {
      this._workletNode.port.postMessage(msg);
    }
  }

  /**
   * Get the active AudioContext.
   * @returns {AudioContext|null}
   */
  _getAudioContext() {
    if (this._ctx) return this._ctx;
    return this._fallbackSynth?.ctx || null;
  }

  /** @returns {number} Effective playback speed (base speed * mutation tempo). */
  _effectiveSpeed() {
    return this._speedMult * (this._mutation.tempoMult || 1.0);
  }

  // ──── Note Scheduling ────

  _scheduleLoop() {
    if (!this.isPlaying) return;

    const now = this.getCurrentTime();
    const lookAhead = 0.15;
    const speed = this._effectiveSpeed();
    const synth = this._getActiveSynth();
    const useWorklet = this._wasmReady && this._workletNode;

    while (this._nextNote < this._notes.length) {
      const note = this._notes[this._nextNote];
      const noteTime = note.t / speed;

      if (noteTime > now + lookAhead) break;

      if (noteTime >= now - 0.05) {
        if (useWorklet) {
          // Send note to WASM AudioWorklet
          this._postWorklet({
            type: 'note_on',
            note: note.note,
            velocity: note.vel || 80,
            channel: note.ch || 0,
          });
          // Schedule note off
          const dur = (note.dur || 0.2) / speed;
          setTimeout(() => {
            this._postWorklet({
              type: 'note_off',
              note: note.note,
              channel: note.ch || 0,
            });
          }, dur * 1000);
        } else if (synth) {
          // Fallback: use SynthEngine
          synth.playNote(note, Math.max(0, noteTime - now));
        }
      }
      this._nextNote++;
    }

    // Check if track ended
    if (this._nextNote >= this._notes.length && now >= this._duration / speed) {
      this.isPlaying = false;
      this._cancelLoops();
      if (useWorklet) this._postWorklet({ type: 'stop_all' });
      if (this.onTrackEnd) this.onTrackEnd();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._scheduleLoop());
  }

  _startEmitLoop() {
    if (this._emitInterval) clearInterval(this._emitInterval);
    this._emitInterval = setInterval(() => {
      if (!this.isPlaying || !this.onNoteEvent) return;
      const now = this.getCurrentTime();
      const speed = this._effectiveSpeed();
      const active = [];

      for (let i = Math.max(0, this._nextNote - 30); i < this._notes.length; i++) {
        const note = this._notes[i];
        const t = note.t / speed;
        const dur = (note.dur || 0.1) / speed;
        if (t > now + 0.1) break;
        if (t + dur >= now && t <= now) {
          active.push({
            note: note.note,
            vel: note.vel || 80,
            ch: note.ch || 0,
            inst: note.inst || 0,
          });
        }
      }

      if (active.length > 0) {
        this.onNoteEvent(active);
      }
    }, 50);
  }

  _cancelLoops() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (this._emitInterval) {
      clearInterval(this._emitInterval);
      this._emitInterval = 0;
    }
  }

  // ──── Navigation ────

  /**
   * Go to previous track in shuffle history.
   * @returns {Promise<boolean>}
   */
  async prevTrack() {
    if (this._shufflePos > 0) {
      this._shufflePos--;
      const idx = this._shuffleHistory[this._shufflePos];
      if (idx < this.catalog.length) {
        this.stop();
        return this._loadFromCatalogEntry(this.catalog[idx]);
      }
    }
    return false;
  }

  /**
   * Go to next track (forward in history or new random).
   * @returns {Promise<boolean>}
   */
  async nextTrack() {
    this.stop();
    if (this._shufflePos < this._shuffleHistory.length - 1) {
      this._shufflePos++;
      const idx = this._shuffleHistory[this._shufflePos];
      if (idx < this.catalog.length) {
        return this._loadFromCatalogEntry(this.catalog[idx]);
      }
    }
    return this.loadNextRandom();
  }

  // ──── Cleanup ────

  /** Destroy all resources. */
  destroy() {
    this.stop();
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }
    if (this._workletNode) {
      this._workletNode.disconnect();
      this._workletNode = null;
    }
    this._wasmModule = null;
    this._wasmReady = false;
  }
}

// Export for Node.js test environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WasmSynth };
}
