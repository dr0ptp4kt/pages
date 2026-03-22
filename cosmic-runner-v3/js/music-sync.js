/**
 * Music synchronization for Cosmic Runner V3.
 *
 * Loads compressed V3 note JSON format (legend-based).
 * Provides time-based event lookups with full-track coverage.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note number to note name with octave.
 * @param {number} midi
 * @returns {string}
 */
function midiToNoteName(midi) {
  if (midi < 0 || midi > 127) return '?';
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * MusicSync manages compressed score data and time-based lookups.
 */
class MusicSync {
  constructor() {
    /** @type {Object|null} */
    this.albumData = null;
    /** @type {Array<Object>} */
    this.tracks = [];
    /** @type {Map<number, {legend: Object, events: Array}>} */
    this.trackData = new Map();
    /** @type {number} */
    this.currentTrack = 0;
    /** @type {number} */
    this.hueOffset = 0;
    /** @type {number} */
    this._lastHueShift = 0;
    /** @type {string} */
    this.baseUrl = '';
    /** @type {string} */
    this.audioBaseUrl = '';
  }

  /**
   * Load album index JSON.
   * @param {string} url
   * @param {string} [audioBaseUrl] - Base URL for MP3 files (if different from notes).
   * @returns {Promise<boolean>}
   */
  async loadAlbum(url, audioBaseUrl) {
    try {
      this.baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      this.audioBaseUrl = audioBaseUrl || this.baseUrl;

      const resp = await fetch(url);
      if (!resp.ok) return false;
      this.albumData = await resp.json();

      this.tracks = (this.albumData.tracks || []).map((t, i) => ({
        index: i,
        trackNum: t.track_num || (i + 1),
        title: t.title || 'Unknown',
        file: t.file,
        audioFile: t.audio_file,
        duration: t.duration || 0,
        startTime: t.start_time || 0,
        nEvents: t.n_events || 0,
      }));

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Load compressed track events.
   * @param {number} trackIndex
   * @returns {Promise<Object>}
   */
  async loadTrackEvents(trackIndex) {
    if (this.trackData.has(trackIndex)) {
      return this.trackData.get(trackIndex);
    }
    const track = this.tracks[trackIndex];
    if (!track || !track.file) return { legend: {}, events: [] };

    try {
      const resp = await fetch(this.baseUrl + track.file);
      if (!resp.ok) return { legend: {}, events: [] };
      const data = await resp.json();

      // Support both compressed V3 format and legacy V2 format
      let legend, events;
      if (data.legend && Array.isArray(data.events) && Array.isArray(data.events[0])) {
        // V3 compressed: events are arrays [t, dur, note, inst_idx, vel, ch]
        legend = data.legend;
        events = data.events;
      } else {
        // V2 legacy: events are objects {t, dur, note, inst, vel, ch}
        legend = { instruments: {}, fields: ['t', 'dur', 'note', 'inst', 'vel', 'ch'] };
        const instMap = {};
        let idx = 0;
        const raw = data.events || [];
        events = raw.map(ev => {
          const inst = ev.inst || 'unknown';
          if (!(inst in instMap)) {
            instMap[inst] = idx;
            legend.instruments[String(idx)] = inst;
            idx++;
          }
          return [ev.t, ev.dur, ev.note, instMap[inst], ev.vel, ev.ch || 0];
        });
      }

      const result = { legend, events };
      this.trackData.set(trackIndex, result);
      return result;
    } catch (e) {
      return { legend: {}, events: [] };
    }
  }

  /**
   * Get active note events at playback time.
   * Returns expanded objects for rendering.
   * @param {number} time
   * @returns {Array<{t: number, dur: number, note: number, inst: string, vel: number, ch: number}>}
   */
  getActiveEvents(time) {
    const data = this.trackData.get(this.currentTrack);
    if (!data || !data.events.length) return [];

    const instMap = data.legend.instruments || {};
    const active = [];

    // Binary search for start position (events sorted by time)
    const events = data.events;
    let lo = 0, hi = events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid][0] + events[mid][1] <= time - 0.01) lo = mid + 1;
      else hi = mid;
    }

    // Scan forward from approximate start
    for (let i = Math.max(0, lo - 5); i < events.length; i++) {
      const ev = events[i];
      const t = ev[0], dur = ev[1];
      if (t > time + 0.1) break;
      if (t <= time && t + dur > time) {
        active.push({
          t: t,
          dur: dur,
          note: ev[2],
          inst: instMap[String(ev[3])] || 'unknown',
          vel: ev[4],
          ch: ev[5],
        });
      }
    }
    return active;
  }

  /**
   * Get all events in a time window (for pre-rendering).
   * @param {number} startTime
   * @param {number} endTime
   * @returns {Array}
   */
  getEventsInRange(startTime, endTime) {
    const data = this.trackData.get(this.currentTrack);
    if (!data || !data.events.length) return [];

    const instMap = data.legend.instruments || {};
    const result = [];
    for (const ev of data.events) {
      if (ev[0] + ev[1] >= startTime && ev[0] <= endTime) {
        result.push({
          t: ev[0], dur: ev[1], note: ev[2],
          inst: instMap[String(ev[3])] || 'unknown',
          vel: ev[4], ch: ev[5],
        });
      }
      if (ev[0] > endTime) break;
    }
    return result;
  }

  /**
   * Get note info for display.
   * @param {Array} events
   * @returns {Array<{pitch: string, inst: string, vel: number}>}
   */
  getNoteInfo(events) {
    const info = [];
    const seen = new Set();
    for (const ev of events) {
      const pitch = midiToNoteName(ev.note || 60);
      const key = `${pitch}-${ev.inst}`;
      if (!seen.has(key)) {
        seen.add(key);
        info.push({ pitch, inst: ev.inst || 'unknown', vel: ev.vel || 0.5 });
      }
    }
    return info.slice(0, 12);
  }

  /** Get epoch for current position. */
  getEpoch(time, duration) {
    if (duration <= 0) return { name: 'Quantum Dawn', index: 0 };
    const epochs = [
      'Quantum Dawn', 'Stellar Birth', 'Cosmic Expansion',
      'Dark Energy', 'Nebula Phase', 'Emergence'
    ];
    const idx = Math.min(epochs.length - 1, Math.floor((time / duration) * epochs.length));
    return { name: epochs[idx], index: idx };
  }

  /** Update hue offset. */
  updateHue(time) {
    const shift = Math.floor(time / 120);
    if (shift > this._lastHueShift) {
      this._lastHueShift = shift;
      this.hueOffset = (this.hueOffset + 30 + Math.random() * 30) % 360;
    }
  }

  /** Get intensity 0-1. */
  getIntensity(time) {
    const events = this.getActiveEvents(time);
    if (!events.length) return 0.1;
    const avgVel = events.reduce((s, e) => s + (e.vel || 0.5), 0) / events.length;
    const density = Math.min(1, events.length / 15);
    return Math.min(1, avgVel * 0.6 + density * 0.4);
  }

  /** Get audio URL for a track. */
  getAudioUrl(trackIndex) {
    const track = this.tracks[trackIndex];
    if (!track) return '';
    return this.audioBaseUrl + track.audioFile;
  }

  getTrackCount() { return this.tracks.length; }
  getTrack(index) { return this.tracks[index] || null; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicSync, midiToNoteName, NOTE_NAMES };
}
