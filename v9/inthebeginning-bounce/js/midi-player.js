/**
 * MIDI Player for inthebeginning bounce.
 *
 * Rewritten to properly connect to SynthEngine for actual audio playback.
 * Features:
 * - loadMidi() parses MIDI and play() produces sound through SynthEngine
 * - Full seek support (jump to any position)
 * - Always random shuffle when advancing tracks
 * - Track end triggers next random MIDI automatically (infinite playback)
 * - Standard play/pause/prev/next controls (no separate MIDI forward button)
 * - Emits real-time note events for grid visualization
 *
 * No external dependencies — pure Web Audio API via SynthEngine.
 */

class MidiPlayer {
  /**
   * @param {SynthEngine} synthEngine - Shared SynthEngine instance for audio output.
   */
  constructor(synthEngine) {
    /** @type {SynthEngine} Shared synth engine — MUST be provided for audio. */
    this._synth = synthEngine || null;
    /** @type {Worker|null} */
    this._worker = null;
    /** @type {boolean} */
    this._workerReady = false;
    /** @type {number} */
    this._parseId = 0;
    /** @type {Map<number, {resolve, reject}>} */
    this._pending = new Map();

    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {number} Current playback position in seconds (logical time). */
    this._currentTime = 0;
    /** @type {number} AudioContext.currentTime when playback started/resumed. */
    this._startCtxTime = 0;
    /** @type {number} Playback speed multiplier (separate from mutation tempo). */
    this._speedMult = 1.0;
    /** @type {number} Duration of loaded MIDI in seconds. */
    this._duration = 0;
    /** @type {Array} Parsed note events sorted by time. */
    this._notes = [];
    /** @type {number} Next note index to schedule. */
    this._nextNote = 0;
    /** @type {number} RAF ID for scheduling loop. */
    this._rafId = 0;
    /** @type {Object} Current mutation preset. */
    this._mutation = { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };
    /** @type {Object|null} Parsed MIDI header info. */
    this._header = null;
    /** @type {number} Interval ID for note event emission. */
    this._emitInterval = 0;

    // ──── Callbacks ────
    /** @type {Function|null} Callback for note events (for grid visualization). */
    this.onNoteEvent = null;
    /** @type {Function|null} Callback when the current track ends. */
    this.onTrackEnd = null;
    /** @type {Object|null} Track metadata from catalog (name, composer, etc.). */
    this.trackInfo = null;

    // ──── MIDI Catalog & Shuffle ────
    /** @type {Array<{path: string, name: string, composer: string}>} Full MIDI catalog. */
    this.catalog = [];
    /** @type {string} Base URL for fetching MIDI files. */
    this.catalogBaseUrl = '';
    /** @type {Array<number>} Shuffle history (indices into catalog). */
    this._shuffleHistory = [];
    /** @type {number} Current position in shuffle history (-1 = none). */
    this._shufflePos = -1;

    this._initWorker();
  }

  // ──── Worker Setup ────

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

  // ──── Catalog Management ────

  /**
   * Load MIDI catalog from a JSON index file.
   * @param {string} catalogUrl - URL to midi_catalog.json
   * @param {string} [baseUrl] - Override base URL for MIDI file paths
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
   * Appends to shuffle history so prev/next can navigate.
   * @returns {Object|null} Catalog entry { path, name, composer }
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

    // Truncate any forward history if we were in the middle
    this._shuffleHistory.length = this._shufflePos + 1;
    this._shuffleHistory.push(idx);
    if (this._shuffleHistory.length > (typeof MIDI_BACK_LIST_MAX !== 'undefined' ? MIDI_BACK_LIST_MAX : 144)) {
      this._shuffleHistory.shift();
    }
    this._shufflePos = this._shuffleHistory.length - 1;
    return this.catalog[idx];
  }

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
   * Navigate to the previous MIDI in shuffle history.
   * @returns {Promise<boolean>}
   */
  async loadPrev() {
    if (this._shufflePos <= 0) {
      // At the beginning of history — restart current
      this.seek(0);
      return true;
    }
    this._shufflePos--;
    const idx = this._shuffleHistory[this._shufflePos];
    const entry = this.catalog[idx];
    if (!entry) return false;
    return this._loadFromCatalogEntry(entry);
  }

  /**
   * Navigate to the next MIDI in shuffle history, or pick a new random.
   * @returns {Promise<boolean>}
   */
  async loadNext() {
    if (this._shufflePos < this._shuffleHistory.length - 1) {
      // Have forward history
      this._shufflePos++;
      const idx = this._shuffleHistory[this._shufflePos];
      const entry = this.catalog[idx];
      if (entry) return this._loadFromCatalogEntry(entry);
    }
    // No forward history — pick new random
    return this.loadNextRandom();
  }

  /**
   * Fetch and load a MIDI file from a catalog entry.
   * @param {Object} entry - { path, name, composer }
   * @returns {Promise<boolean>}
   */
  async _loadFromCatalogEntry(entry) {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.trackInfo = {
      name: entry.name || 'Unknown',
      composer: entry.composer || '',
    };

    try {
      const url = this.catalogBaseUrl + entry.path;
      const resp = await fetch(url);
      if (!resp.ok) return false;
      const buffer = await resp.arrayBuffer();
      const ok = await this.loadMidi(buffer);
      if (ok && wasPlaying) {
        this.play();
      }
      return ok;
    } catch (e) {
      console.warn('Failed to load MIDI:', entry.path, e);
      return false;
    }
  }

  // ──── MIDI Loading ────

  /**
   * Parse a Standard MIDI File from an ArrayBuffer.
   * @param {ArrayBuffer} buffer - Raw MIDI file bytes.
   * @returns {Promise<boolean>} True if parsing succeeded.
   */
  async loadMidi(buffer) {
    this.stop();

    try {
      let result;
      if (this._worker && this._workerReady) {
        result = await new Promise((resolve, reject) => {
          const id = ++this._parseId;
          this._pending.set(id, { resolve, reject });
          this._worker.postMessage({ type: 'parse', buffer, id }, [buffer]);
        });
      } else {
        // Fallback: main-thread parsing (uses static methods)
        const data = new DataView(buffer);
        result = MidiPlayer._parseMidiFallback(data);
        if (!result) return false;
      }

      this._header = result.header;
      this._notes = result.notes;
      this._duration = result.duration;
      this._nextNote = 0;
      this._currentTime = 0;
      return true;
    } catch (e) {
      console.warn('MIDI parse error:', e);
      return false;
    }
  }

  // ──── Playback Controls ────

  /** Start or resume playback through SynthEngine. */
  play() {
    if (this.isPlaying) return;
    if (!this._notes.length) return;

    // Ensure synth is initialized and resumed
    if (this._synth) {
      this._synth.init();
      this._synth.resume();
      this._synth.setMutation(this._mutation);
    }

    this.isPlaying = true;
    const ctx = this._synth?.ctx;
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
    if (this._synth) this._synth.stopAll();
    this._cancelLoops();
  }

  /** Stop playback and reset to beginning. */
  stop() {
    this.isPlaying = false;
    this._currentTime = 0;
    this._nextNote = 0;
    if (this._synth) this._synth.stopAll();
    this._cancelLoops();
  }

  /**
   * Seek to a specific time in the MIDI.
   * @param {number} timeSec - Target time in seconds.
   */
  seek(timeSec) {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying) {
      if (this._synth) this._synth.stopAll();
      this._cancelLoops();
      this.isPlaying = false;
    }

    timeSec = Math.max(0, Math.min(timeSec, this._duration));
    this._currentTime = timeSec;

    // Binary search for the note index at the target time
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
      const ctx = this._synth?.ctx;
      if (ctx) {
        this._startCtxTime = ctx.currentTime - (this._currentTime / speed);
      }
      this._scheduleLoop();
      this._startEmitLoop();
    }
  }

  /** @returns {number} Current playback time in seconds. */
  getCurrentTime() {
    if (!this.isPlaying || !this._synth?.ctx) return this._currentTime;
    return (this._synth.ctx.currentTime - this._startCtxTime) * this._effectiveSpeed();
  }

  /** @returns {number} Total duration in seconds. */
  getDuration() {
    return this._duration;
  }

  /**
   * Set the mutation preset (affects pitch, tempo, reverb, filter).
   * @param {Object} mutation - { pitchShift, tempoMult, reverb, filter }
   */
  setMutation(mutation) {
    this._mutation = mutation || { pitchShift: 0, tempoMult: 1.0, reverb: 0, filter: 'none' };
    if (this._synth) this._synth.setMutation(this._mutation);
  }

  /**
   * Set playback speed multiplier (independent of mutation tempo).
   * @param {number} speed - Speed multiplier (0.25 to 4.0).
   */
  setSpeed(speed) {
    const wasPlaying = this.isPlaying;
    const currentPos = this.getCurrentTime();
    this._speedMult = Math.max(0.25, Math.min(4.0, speed));
    if (wasPlaying) {
      this._currentTime = currentPos;
      const ctx = this._synth?.ctx;
      if (ctx) {
        this._startCtxTime = ctx.currentTime - (this._currentTime / this._effectiveSpeed());
      }
    }
  }

  /** @returns {number} Effective playback speed (speed * mutation tempo). */
  _effectiveSpeed() {
    return this._speedMult * (this._mutation.tempoMult || 1.0);
  }

  /**
   * Get metadata about the loaded track.
   * @returns {Object} Track info.
   */
  getTrackInfo() {
    return {
      noteCount: this._notes.length,
      duration: this._duration,
      channels: [...new Set(this._notes.map(n => n.ch))].length,
      ...(this.trackInfo || {}),
    };
  }

  /** Get sanitized display info for the current MIDI. */
  getDisplayInfo() {
    const sanitize = (s) => String(s || '')
      .replace(/[<>]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .slice(0, 200);
    return {
      name: sanitize(this.trackInfo?.name),
      composer: sanitize(this.trackInfo?.composer),
    };
  }

  // ──── Note Scheduling ────

  _scheduleLoop() {
    if (!this.isPlaying) return;

    const now = this.getCurrentTime();
    const lookAhead = 0.15; // schedule 150ms ahead
    const speed = this._effectiveSpeed();

    while (this._nextNote < this._notes.length) {
      const note = this._notes[this._nextNote];
      const noteTime = note.t / speed;

      if (noteTime > now + lookAhead) break;

      if (noteTime >= now - 0.05 && this._synth) {
        this._synth.playNote(note, Math.max(0, noteTime - now));
      }
      this._nextNote++;
    }

    // Check if track ended
    if (this._nextNote >= this._notes.length && now >= this._duration / speed) {
      this.isPlaying = false;
      this._cancelLoops();
      if (this.onTrackEnd) this.onTrackEnd();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._scheduleLoop());
  }

  // ──── Note Event Emission (for grid visualization) ────

  _startEmitLoop() {
    if (this._emitInterval) clearInterval(this._emitInterval);
    this._emitInterval = setInterval(() => {
      if (!this.isPlaying || !this.onNoteEvent) return;

      const now = this.getCurrentTime();
      const speed = this._effectiveSpeed();
      const pitchShift = this._mutation.pitchShift || 0;
      const activeEvents = [];

      for (const note of this._notes) {
        const t = note.t / speed;
        const dur = (note.dur || 0.2) / speed;
        if (t > now + 0.05) break;
        if (t + dur > now && t <= now) {
          activeEvents.push({
            t, dur,
            note: note.note + pitchShift,
            inst: note.inst || 'piano',
            vel: note.vel || 0.5,
            ch: note.ch || 0,
            bend: note.bend || 0,
          });
        }
      }

      this.onNoteEvent(activeEvents);
    }, 50); // 20 Hz update rate
  }

  _cancelLoops() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    if (this._emitInterval) { clearInterval(this._emitInterval); this._emitInterval = 0; }
  }

  // ──── Fallback MIDI Parser (main thread, for when Worker is unavailable) ────

  static _parseMidiFallback(data) {
    let offset = 0;
    const headerTag = MidiPlayer._readStr(data, offset, 4);
    if (headerTag !== 'MThd') return null;
    offset += 4;

    const headerLen = data.getUint32(offset); offset += 4;
    const format = data.getUint16(offset); offset += 2;
    const nTracks = data.getUint16(offset); offset += 2;
    const ticksPerBeat = data.getUint16(offset); offset += 2;
    offset += headerLen - 6;

    const header = { format, nTracks, ticksPerBeat };
    const allEvents = [];

    for (let t = 0; t < nTracks; t++) {
      if (offset + 8 > data.byteLength) break;
      const trackTag = MidiPlayer._readStr(data, offset, 4);
      if (trackTag !== 'MTrk') {
        offset += 4;
        const chunkLen = data.getUint32(offset);
        offset += 4 + chunkLen;
        continue;
      }
      offset += 4;
      const trackLen = data.getUint32(offset); offset += 4;
      const trackEnd = offset + trackLen;
      const events = MidiPlayer._parseTrack(data, offset, trackEnd, ticksPerBeat);
      allEvents.push(...events);
      offset = trackEnd;
    }

    allEvents.sort((a, b) => a.time - b.time);
    const notes = MidiPlayer._buildNoteEvents(allEvents);
    const duration = notes.length > 0 ?
      Math.max(...notes.map(n => n.t + (n.dur || 0.2))) : 0;
    return { header, notes, duration };
  }

  static _parseTrack(data, start, end, ticksPerBeat) {
    const events = [];
    let offset = start;
    let totalTicks = 0;
    let tempo = 500000;
    let totalTime = 0;
    let lastTempoTick = 0;
    let lastTempoTime = 0;
    let runningStatus = 0;

    while (offset < end) {
      const vlq = MidiPlayer._readVLQ(data, offset);
      offset = vlq.offset;
      totalTicks += vlq.value;
      totalTime = lastTempoTime + ((totalTicks - lastTempoTick) / ticksPerBeat) * (tempo / 1000000);
      if (offset >= end) break;
      let status = data.getUint8(offset);
      if (status < 0x80) { status = runningStatus; }
      else { offset++; if (status < 0xF0) runningStatus = status; }
      const type = status & 0xF0;
      const ch = status & 0x0F;

      if (type === 0x90) {
        const note = data.getUint8(offset++);
        const vel = data.getUint8(offset++);
        events.push({ type: vel > 0 ? 'noteOn' : 'noteOff', time: totalTime, ch, note, vel: vel / 127 });
      } else if (type === 0x80) {
        const note = data.getUint8(offset++); offset++;
        events.push({ type: 'noteOff', time: totalTime, ch, note });
      } else if (type === 0xA0) { offset += 2;
      } else if (type === 0xB0) { offset += 2;
      } else if (type === 0xC0) {
        const program = data.getUint8(offset++);
        events.push({ type: 'programChange', time: totalTime, ch, program });
      } else if (type === 0xD0) { offset++;
      } else if (type === 0xE0) {
        const lsb = data.getUint8(offset++);
        const msb = data.getUint8(offset++);
        events.push({ type: 'pitchBend', time: totalTime, ch, bend: ((msb << 7 | lsb) - 8192) / 8192 });
      } else if (status === 0xFF) {
        const metaType = data.getUint8(offset++);
        const metaVLQ = MidiPlayer._readVLQ(data, offset);
        offset = metaVLQ.offset;
        const metaLen = metaVLQ.value;
        if (metaType === 0x51 && metaLen === 3) {
          tempo = (data.getUint8(offset) << 16) | (data.getUint8(offset + 1) << 8) | data.getUint8(offset + 2);
          lastTempoTick = totalTicks; lastTempoTime = totalTime;
        } else if (metaType === 0x03) {
          let name = '';
          for (let i = 0; i < metaLen && offset + i < end; i++) name += String.fromCharCode(data.getUint8(offset + i));
          events.push({ type: 'trackName', time: totalTime, name });
        } else if (metaType === 0x2F) { offset += metaLen; break; }
        offset += metaLen;
      } else if (status === 0xF0 || status === 0xF7) {
        const sysVLQ = MidiPlayer._readVLQ(data, offset);
        offset = sysVLQ.offset + sysVLQ.value;
      } else { offset++; }
    }
    return events;
  }

  static _buildNoteEvents(rawEvents) {
    const notes = [];
    const openNotes = new Map();
    const programMap = new Map();
    const bendMap = new Map();
    const GM_FAMILIES = [
      'piano','piano','piano','piano','piano','piano','piano','piano',
      'chromatic','chromatic','chromatic','chromatic','chromatic','chromatic','chromatic','chromatic',
      'organ','organ','organ','organ','organ','organ','organ','organ',
      'guitar','guitar','guitar','guitar','guitar','guitar','guitar','guitar',
      'bass','bass','bass','bass','bass','bass','bass','bass',
      'strings','strings','strings','strings','strings','strings','strings','strings',
      'ensemble','ensemble','ensemble','ensemble','ensemble','ensemble','ensemble','ensemble',
      'brass','brass','brass','brass','brass','brass','brass','brass',
      'reed','reed','reed','reed','reed','reed','reed','reed',
      'pipe','pipe','pipe','pipe','pipe','pipe','pipe','pipe',
      'synth-lead','synth-lead','synth-lead','synth-lead','synth-lead','synth-lead','synth-lead','synth-lead',
      'synth-pad','synth-pad','synth-pad','synth-pad','synth-pad','synth-pad','synth-pad','synth-pad',
      'fx','fx','fx','fx','fx','fx','fx','fx',
      'ethnic','ethnic','ethnic','ethnic','ethnic','ethnic','ethnic','ethnic',
      'percussion','percussion','percussion','percussion','percussion','percussion','percussion','percussion',
      'sfx','sfx','sfx','sfx','sfx','sfx','sfx','sfx',
    ];
    for (const ev of rawEvents) {
      if (ev.type === 'programChange') { programMap.set(ev.ch, GM_FAMILIES[ev.program] || 'piano'); }
      else if (ev.type === 'pitchBend') { bendMap.set(ev.ch, ev.bend); }
      else if (ev.type === 'noteOn') {
        const key = ev.ch * 128 + ev.note;
        openNotes.set(key, { t: ev.time, vel: ev.vel, ch: ev.ch, note: ev.note, bend: bendMap.get(ev.ch) || 0 });
      } else if (ev.type === 'noteOff') {
        const key = ev.ch * 128 + ev.note;
        const open = openNotes.get(key);
        if (open) {
          const dur = Math.max(0.02, ev.time - open.t);
          const inst = ev.ch === 9 ? 'percussion' : (programMap.get(ev.ch) || 'piano');
          notes.push({ t: open.t, dur, note: open.note, vel: open.vel, ch: open.ch, inst, bend: open.bend });
          openNotes.delete(key);
        }
      }
    }
    for (const [, open] of openNotes) {
      const inst = open.ch === 9 ? 'percussion' : (programMap.get(open.ch) || 'piano');
      notes.push({ t: open.t, dur: 0.5, note: open.note, vel: open.vel, ch: open.ch, inst, bend: open.bend || 0 });
    }
    notes.sort((a, b) => a.t - b.t);
    return notes;
  }

  static _readVLQ(data, offset) {
    let value = 0; let byte;
    do { if (offset >= data.byteLength) return { value, offset }; byte = data.getUint8(offset++); value = (value << 7) | (byte & 0x7F); } while (byte & 0x80);
    return { value, offset };
  }

  static _readStr(data, offset, length) {
    let s = '';
    for (let i = 0; i < length && offset + i < data.byteLength; i++) s += String.fromCharCode(data.getUint8(offset + i));
    return s;
  }

  /** Release resources. */
  destroy() {
    this.stop();
    if (this._worker) { this._worker.terminate(); this._worker = null; }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MidiPlayer };
}
