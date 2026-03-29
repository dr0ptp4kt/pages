/**
 * Music synchronization for inthebeginning bounce.
 *
 * Unified interface across three audio modes:
 * - MP3 mode (album): loads note event JSON, syncs to HTML5 Audio playback
 * - MIDI mode: random shuffle from catalog, uses MidiPlayer → SynthEngine
 * - Synth mode: browser-based procedural generation via MusicGenerator
 *
 * Provides time-based event lookups, epoch detection, and display metadata
 * regardless of which audio mode is active.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Convert MIDI note number to human-readable note name. */
function midiToNoteName(midi) {
  if (midi < 0 || midi > 127) return '?';
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Audio modes. */
const AUDIO_MODE = {
  MP3: 'mp3',
  MIDI: 'midi',
  SYNTH: 'synth',
  WASM: 'wasm',
};

class MusicSync {
  constructor() {
    // ──── MP3 album data ────
    /** @type {Object|null} Parsed album JSON. */
    this.albumData = null;
    /** @type {Array} Track metadata array. */
    this.tracks = [];
    /** @type {Map<number, Object>} Loaded track event data (index → { legend, events }). */
    this.trackData = new Map();
    /** @type {number} Current track index (MP3 mode). */
    this.currentTrack = 0;
    /** @type {string} Base URL for note event JSON files. */
    this.baseUrl = '';
    /** @type {string} Base URL for MP3 audio files. */
    this.audioBaseUrl = '';

    // ──── Visual state ────
    /** @type {number} Hue offset for color cycling. */
    this.hueOffset = 0;
    /** @type {number} Last hue shift marker. */
    this._lastHueShift = 0;

    // ──── Audio mode ────
    /** @type {string} Current audio mode ('mp3', 'midi', 'synth'). */
    this.mode = AUDIO_MODE.MP3;

    // ──── MIDI mode references ────
    /** @type {MidiPlayer|null} Reference to MidiPlayer instance (set externally). */
    this.midiPlayer = null;

    // ──── Synth mode references ────
    /** @type {MusicGenerator|null} Reference to MusicGenerator instance (set externally). */
    this.musicGenerator = null;

    // ──── Shared references ────
    /** @type {HTMLAudioElement|null} Reference to the HTML5 Audio element (MP3 mode). */
    this.audioElement = null;
  }

  // ──── MP3 Album Loading ────

  /**
   * Load album metadata and track list.
   * @param {string} url - URL to album JSON (e.g., album.json)
   * @param {string} [audioBaseUrl] - Override base URL for audio files
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
        epochName: (typeof EPOCH_NAMES !== 'undefined' ? EPOCH_NAMES[i] : null) || 'Unknown Epoch',
        file: t.file || t.notes_file,
        audioFile: t.audio_file,
        duration: t.duration || 0,
        startTime: t.start_time || 0,
        nEvents: t.n_events || 0,
        id3: t.id3 || null,
        engine: t.engine || null,
      }));

      // Album-level metadata
      this.albumMeta = {
        album: this.albumData.album || '',
        artist: this.albumData.artist || '',
        year: this.albumData.year || '',
        genre: this.albumData.genre || '',
        copyright: this.albumData.copyright || '',
        license: this.albumData.license || '',
      };

      // Interstitial config
      this.interstitial = this.albumData.interstitial || null;
      if (this.interstitial && this.interstitial.file) {
        this.interstitialUrl = this.audioBaseUrl + this.interstitial.file;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Load MIDI catalog and store the base URL for MIDI files.
   * @param {string} catalogUrl - URL to midi_catalog.json
   * @returns {Promise<boolean>}
   */
  async loadMidiCatalog(catalogUrl) {
    try {
      const resp = await fetch(catalogUrl);
      if (!resp.ok) return false;
      const data = await resp.json();
      if (!data.midis || data.midis.length === 0) return false;
      this.midiCatalog = data.midis;
      this.midiBaseUrl = catalogUrl.substring(0, catalogUrl.lastIndexOf('/') + 1);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Load note events for a specific MP3 track.
   * @param {number} trackIndex
   * @returns {Promise<Object>} { legend, events }
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

      let legend, events;
      if (data.legend && Array.isArray(data.events) && Array.isArray(data.events[0])) {
        legend = data.legend;
        events = data.events;
      } else {
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

  // ──── Unified Time/Duration Access ────

  /**
   * Get current playback time in seconds (works across all modes).
   * @returns {number}
   */
  getCurrentTime() {
    switch (this.mode) {
      case AUDIO_MODE.MIDI:
        return this.midiPlayer ? this.midiPlayer.getCurrentTime() : 0;
      case AUDIO_MODE.SYNTH:
        return this.musicGenerator ? this.musicGenerator.getCurrentTime() : 0;
      case AUDIO_MODE.WASM:
        return this.wasmSynth ? this.wasmSynth.getCurrentTime() : 0;
      case AUDIO_MODE.MP3:
      default:
        return this.audioElement ? (this.audioElement.currentTime || 0) : 0;
    }
  }

  /**
   * Get total duration in seconds (works across all modes).
   * @returns {number}
   */
  getDuration() {
    switch (this.mode) {
      case AUDIO_MODE.MIDI:
        return this.midiPlayer ? this.midiPlayer.getDuration() : 0;
      case AUDIO_MODE.SYNTH:
        return this.musicGenerator ? this.musicGenerator.getDuration() : 0;
      case AUDIO_MODE.WASM:
        return this.wasmSynth ? this.wasmSynth.getDuration() : 0;
      case AUDIO_MODE.MP3:
      default:
        return this.audioElement ? (this.audioElement.duration || 0) : 0;
    }
  }

  // ──── Event Lookup (MP3 mode — note event JSON) ────

  /**
   * Get active note events at a specific time (MP3 mode).
   * For MIDI/Synth modes, active events come from the player callbacks.
   * @param {number} time - Playback time in seconds.
   * @returns {Array<Object>} Active events.
   */
  getActiveEvents(time) {
    // In MIDI or Synth mode, events come from the onNoteEvent callback
    // This method is primarily for MP3 mode's pre-loaded note JSON
    if (this.mode !== AUDIO_MODE.MP3) return [];

    const data = this.trackData.get(this.currentTrack);
    if (!data || !data.events.length) return [];

    const instMap = data.legend.instruments || {};
    const active = [];
    const events = data.events;

    // Binary search for start position
    let lo = 0, hi = events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid][0] + events[mid][1] <= time - 0.01) lo = mid + 1;
      else hi = mid;
    }

    for (let i = Math.max(0, lo - 5); i < events.length; i++) {
      const ev = events[i];
      const t = ev[0], dur = ev[1];
      if (t > time + 0.1) break;
      if (t <= time && t + dur > time) {
        active.push({
          t, dur, note: ev[2],
          inst: instMap[String(ev[3])] || 'unknown',
          vel: ev[4], ch: ev[5],
        });
      }
    }
    return active;
  }

  /**
   * Get events in a time range (MP3 mode).
   * @param {number} startTime
   * @param {number} endTime
   * @returns {Array<Object>}
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

  // ──── Display Helpers ────

  /**
   * Get note info array for display.
   * @param {Array<Object>} events - Active note events.
   * @returns {Array<Object>} Deduplicated pitch/instrument pairs.
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

  /**
   * Determine the cosmic epoch at a given time.
   * @param {number} time - Current time in seconds.
   * @param {number} duration - Total duration in seconds.
   * @returns {Object} { name, index }
   */
  getEpoch(time, duration) {
    if (duration <= 0) return { name: 'Quantum Dawn', index: 0 };
    const epochs = [
      'Quantum Dawn', 'Stellar Birth', 'Cosmic Expansion',
      'Dark Energy', 'Nebula Phase', 'Emergence',
    ];
    const idx = Math.min(epochs.length - 1, Math.floor((time / duration) * epochs.length));
    return { name: epochs[idx], index: idx };
  }

  /**
   * Get full display title for MP3 track.
   * @param {number} trackIndex
   * @returns {string}
   */
  getFullTitle(trackIndex) {
    const track = this.tracks[trackIndex];
    if (!track) return '';
    return `${track.title} \u2014 ${track.epochName}`;
  }

  /**
   * Get the display title for the current mode.
   * @returns {string}
   */
  getCurrentTitle() {
    switch (this.mode) {
      case AUDIO_MODE.MIDI: {
        if (!this.midiPlayer) return 'MIDI';
        const info = this.midiPlayer.getDisplayInfo();
        const parts = [info.name || 'Unknown MIDI'];
        if (info.composer) parts.push(info.composer);
        return parts.join(' \u2014 ');
      }
      case AUDIO_MODE.SYNTH: {
        if (!this.musicGenerator) return 'Synth';
        return this.musicGenerator.getCurrentTrackName() || 'Synth Generation';
      }
      case AUDIO_MODE.MP3:
      default:
        return this.getFullTitle(this.currentTrack);
    }
  }

  /** Update hue offset based on time (color cycling). */
  updateHue(time) {
    const shift = Math.floor(time / 120);
    if (shift > this._lastHueShift) {
      this._lastHueShift = shift;
      this.hueOffset = (this.hueOffset + 30 + Math.random() * 30) % 360;
    }
  }

  /**
   * Get visual intensity at a given time.
   * @param {number} time
   * @returns {number} 0-1 intensity value.
   */
  getIntensity(time) {
    const events = this.getActiveEvents(time);
    if (!events.length) return 0.1;
    const avgVel = events.reduce((s, e) => s + (e.vel || 0.5), 0) / events.length;
    const density = Math.min(1, events.length / 15);
    return Math.min(1, avgVel * 0.6 + density * 0.4);
  }

  /**
   * Get the audio URL for an MP3 track.
   * @param {number} trackIndex
   * @returns {string}
   */
  getAudioUrl(trackIndex) {
    const track = this.tracks[trackIndex];
    if (!track) return '';
    return this.audioBaseUrl + track.audioFile;
  }

  /** @returns {number} Total number of MP3 tracks. */
  getTrackCount() { return this.tracks.length; }

  /**
   * Get track metadata by index.
   * @param {number} index
   * @returns {Object|null}
   */
  getTrack(index) { return this.tracks[index] || null; }

  /**
   * Get ID3 tag info for display.
   * @param {number} trackIndex
   * @returns {Object} { title, artist, album, track, year, genre, copyright, license }
   */
  getTrackId3(trackIndex) {
    const track = this.tracks[trackIndex];
    if (track && track.id3) return track.id3;
    // Fallback: construct from album-level metadata
    if (track && this.albumMeta) {
      return {
        title: track.title,
        artist: this.albumMeta.artist,
        album: this.albumMeta.album,
        track: `${track.trackNum}/${this.tracks.length}`,
        year: String(this.albumMeta.year),
        genre: this.albumMeta.genre,
        copyright: this.albumMeta.copyright,
        license: this.albumMeta.license,
      };
    }
    return { title: track ? track.title : '', artist: '', album: '', track: '', year: '', genre: '', copyright: '', license: '' };
  }

  /**
   * Check if interstitial should play after this track index.
   * Interstitials play every N tracks (e.g., every 4 songs).
   * @param {number} trackIndex - The track that just finished (0-based).
   * @returns {boolean}
   */
  shouldPlayInterstitial(trackIndex) {
    if (!this.interstitial) return false;
    const every = this.interstitial.insert_every || 4;
    return ((trackIndex + 1) % every === 0) && (trackIndex < this.tracks.length - 1);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicSync, midiToNoteName, NOTE_NAMES, AUDIO_MODE };
}
