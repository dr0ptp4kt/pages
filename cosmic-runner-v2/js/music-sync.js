/**
 * Music synchronization for Cosmic Runner V2.
 *
 * Loads score JSON files, tracks current playback position,
 * provides note events and epoch information.
 * Enhanced with note info display for JSON note data.
 */

/** MIDI note number to note name mapping. */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Convert MIDI note number to note name with octave.
 * @param {number} midi - MIDI note number (0-127).
 * @returns {string} Note name, e.g. "C4", "A#3".
 */
function midiToNoteName(midi) {
  if (midi < 0 || midi > 127) return '?';
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

/**
 * MusicSync manages score data and provides time-based lookups.
 */
class MusicSync {
  constructor() {
    /** @type {Object|null} Raw album data */
    this.albumData = null;

    /** @type {Array<Object>} Track metadata */
    this.tracks = [];

    /** @type {Map<number, Array<Object>>} Track index -> loaded events */
    this.trackEvents = new Map();

    /** @type {number} Current track index */
    this.currentTrack = 0;

    /** @type {number} Current hue offset */
    this.hueOffset = 0;

    /** @type {number} Last hue shift time */
    this._lastHueShift = 0;

    /** @type {number} Hue shift interval in seconds */
    this.hueShiftInterval = 120;

    /** @type {string} Base URL for loading track note files */
    this.baseUrl = '';
  }

  /**
   * Load the album notes JSON.
   * @param {string} url - URL to album_notes.json.
   * @returns {Promise<boolean>}
   */
  async loadAlbum(url) {
    try {
      this.baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

      const resp = await fetch(url);
      if (!resp.ok) return false;
      this.albumData = await resp.json();

      this.tracks = (this.albumData.tracks || []).map((t, i) => ({
        index: i,
        trackNum: t.track_num || (i + 1),
        title: t.title || this._titleFromFile(t.file),
        file: t.file,
        audioFile: t.audio_file || this._audioFileFromNotes(t.file),
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
   * Load note events for a specific track.
   * @param {number} trackIndex
   * @returns {Promise<Array<Object>>}
   */
  async loadTrackEvents(trackIndex) {
    if (this.trackEvents.has(trackIndex)) {
      return this.trackEvents.get(trackIndex);
    }

    const track = this.tracks[trackIndex];
    if (!track || !track.file) return [];

    try {
      const resp = await fetch(this.baseUrl + track.file);
      if (!resp.ok) return [];
      const data = await resp.json();
      const events = data.events || [];
      this.trackEvents.set(trackIndex, events);
      return events;
    } catch (e) {
      return [];
    }
  }

  /**
   * Get active note events at a given time within the current track.
   * @param {number} time - Current playback time in seconds.
   * @returns {Array<Object>}
   */
  getActiveEvents(time) {
    const events = this.trackEvents.get(this.currentTrack);
    if (!events || events.length === 0) return [];

    const active = [];
    for (const ev of events) {
      if (ev.t <= time && ev.t + (ev.dur || 0) > time) {
        active.push(ev);
      }
    }
    return active;
  }

  /**
   * Get formatted note info for display.
   * @param {Array<Object>} events - Active events.
   * @returns {Array<{pitch: string, inst: string, vel: number}>}
   */
  getNoteInfo(events) {
    const info = [];
    const seen = new Set();
    for (const ev of events) {
      const pitch = midiToNoteName(ev.note || 60);
      const inst = ev.inst || 'unknown';
      const key = `${pitch}-${inst}`;
      if (!seen.has(key)) {
        seen.add(key);
        info.push({
          pitch: pitch,
          inst: inst,
          vel: ev.vel || 0.5,
        });
      }
    }
    return info.slice(0, 12); // Limit to 12 for display
  }

  /**
   * Get the current epoch based on time position.
   * @param {number} time
   * @param {number} duration
   * @returns {{name: string, index: number}}
   */
  getEpoch(time, duration) {
    if (duration <= 0) return { name: 'Quantum Dawn', index: 0 };
    const progress = time / duration;
    const epochs = [
      'Quantum Dawn',
      'Stellar Birth',
      'Cosmic Expansion',
      'Dark Energy',
      'Nebula Phase',
      'Emergence'
    ];
    const idx = Math.min(epochs.length - 1, Math.floor(progress * epochs.length));
    return { name: epochs[idx], index: idx };
  }

  /**
   * Update hue offset based on time.
   * @param {number} time
   */
  updateHue(time) {
    const shiftCount = Math.floor(time / this.hueShiftInterval);
    if (shiftCount > this._lastHueShift) {
      this._lastHueShift = shiftCount;
      this.hueOffset = (this.hueOffset + 30 + Math.random() * 30) % 360;
    }
  }

  /**
   * Get the current music intensity (0-1).
   * @param {number} time
   * @returns {number}
   */
  getIntensity(time) {
    const events = this.getActiveEvents(time);
    if (events.length === 0) return 0.1;
    const avgVel = events.reduce((sum, e) => sum + (e.vel || 0.5), 0) / events.length;
    const density = Math.min(1, events.length / 15);
    return Math.min(1, avgVel * 0.6 + density * 0.4);
  }

  /**
   * Get the audio file URL for a track.
   * @param {number} trackIndex
   * @returns {string}
   */
  getAudioUrl(trackIndex) {
    const track = this.tracks[trackIndex];
    if (!track) return '';
    return this.baseUrl + track.audioFile;
  }

  /**
   * Extract a track title from a notes filename.
   * @param {string} filename
   * @returns {string}
   * @private
   */
  _titleFromFile(filename) {
    if (!filename) return 'Unknown';
    const match = filename.match(/-(\d+)-(.+?)_notes\.json$/);
    if (match) {
      return match[2].replace(/_/g, ' ');
    }
    return filename.replace(/_notes\.json$/, '').replace(/_/g, ' ');
  }

  /**
   * Derive audio filename from notes filename.
   * @param {string} notesFile
   * @returns {string}
   * @private
   */
  _audioFileFromNotes(notesFile) {
    if (!notesFile) return '';
    return notesFile.replace('_notes.json', '.mp3');
  }

  /**
   * Get the total number of tracks.
   * @returns {number}
   */
  getTrackCount() {
    return this.tracks.length;
  }

  /**
   * Get track info by index.
   * @param {number} index
   * @returns {Object|null}
   */
  getTrack(index) {
    return this.tracks[index] || null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicSync, midiToNoteName, NOTE_NAMES };
}
