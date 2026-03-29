/**
 * Unified Audio Player for inthebeginning bounce.
 *
 * Handles all three audio modes through a single interface:
 * - MP3 mode: HTML5 Audio for album tracks
 * - MIDI mode: delegates to MidiPlayer (→ SynthEngine) for random shuffle
 * - Synth mode: delegates to MusicGenerator (→ SynthEngine) for procedural music
 *
 * Provides unified play/pause/prev/next/seek that works across all modes.
 * - MP3: prev/next navigate album tracks
 * - MIDI: prev/next navigate shuffle history (always random)
 * - Synth: prev/next navigate generated epoch tracks
 *
 * Supports:
 * - Media Session API for lock-screen controls
 * - Speed control (affects MIDI and Synth modes)
 * - Mutation presets (affects MIDI and Synth modes via SynthEngine)
 */

class GamePlayer {
  /**
   * @param {MusicSync} musicSync - The music synchronization manager.
   */
  constructor(musicSync) {
    /** @type {MusicSync} */
    this.musicSync = musicSync;

    // ──── HTML5 Audio (MP3 mode) ────
    /** @type {HTMLAudioElement} */
    this.audio = new Audio();
    this.audio.preload = 'auto';

    // ──── Shared SynthEngine ────
    /** @type {SynthEngine} */
    this._synth = new SynthEngine();
    // Load instrument samples in background (non-blocking)
    // Will use sample-based playback when available, additive synthesis as fallback
    this._synth.initSamples().then(ok => {
      if (ok) console.log(`SampleBank: ${this._synth.sampleBank._buffers.size} samples loaded`);
    });

    // ──── MIDI Player ────
    /** @type {MidiPlayer} */
    this.midiPlayer = new MidiPlayer(this._synth);

    // ──── Music Generator (Synth mode) ────
    /** @type {MusicGenerator} */
    this.musicGenerator = new MusicGenerator(this._synth);

    // Wire references into MusicSync
    this.musicSync.midiPlayer = this.midiPlayer;
    this.musicSync.musicGenerator = this.musicGenerator;
    this.musicSync.audioElement = this.audio;

    // ──── State ────
    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {number} Current MP3 track index. */
    this.currentTrack = 0;
    /** @type {number} Volume (0-1). */
    this.volume = 0.8;
    this.audio.volume = this.volume;
    /** @type {number} RAF ID for time update loop. */
    this._rafId = 0;
    /** @type {boolean} Whether seek bar is being dragged. */
    this._seeking = false;

    // ──── UI Elements ────
    /** @type {HTMLElement|null} */ this.playBtn = null;
    /** @type {HTMLElement|null} */ this.prevBtn = null;
    /** @type {HTMLElement|null} */ this.nextBtn = null;
    /** @type {HTMLInputElement|null} */ this.seekBar = null;
    /** @type {HTMLElement|null} */ this.timeDisplay = null;
    /** @type {HTMLInputElement|null} */ this.volSlider = null;
    /** @type {HTMLElement|null} */ this.muteBtn = null;

    // ──── Callbacks ────
    /** @type {Function|null} Called on each time update (time in seconds). */
    this.onTimeUpdate = null;
    /** @type {Function|null} Called when the track/mode changes. */
    this.onTrackChange = null;
    /** @type {Function|null} Called with active note events (for visualization). */
    this.onNoteEvent = null;
    /** @type {Function|null} Called when game completes (end of album, non-infinite). */
    this.onGameComplete = null;
    /** @type {boolean} Whether infinite play is enabled. */
    this.infiniteMode = true;

    // ──── WASM Synth (WASM mode) ────
    /** @type {WasmSynth|null} */
    this.wasmSynth = (typeof WasmSynth !== 'undefined') ? new WasmSynth(this._synth) : null;
    if (this.wasmSynth) this.musicSync.wasmSynth = this.wasmSynth;

    // ──── Wire up MIDI, Synth, and WASM track-end handlers ────
    this.midiPlayer.onTrackEnd = () => this._onMidiTrackEnd();
    this.musicGenerator.onTrackEnd = () => this._onSynthTrackEnd();
    if (this.wasmSynth) this.wasmSynth.onTrackEnd = () => this._onWasmTrackEnd();

    // ──── Wire note event callbacks ────
    this.midiPlayer.onNoteEvent = (events) => {
      if (this.onNoteEvent && this.musicSync.mode === AUDIO_MODE.MIDI) {
        this.onNoteEvent(events);
      }
    };
    this.musicGenerator.onNoteEvent = (events) => {
      if (this.onNoteEvent && this.musicSync.mode === AUDIO_MODE.SYNTH) {
        this.onNoteEvent(events);
      }
    };
    if (this.wasmSynth) {
      this.wasmSynth.onNoteEvent = (events) => {
        if (this.onNoteEvent && this.musicSync.mode === AUDIO_MODE.WASM) {
          this.onNoteEvent(events);
        }
      };
    }
  }

  /** Get the current audio mode. */
  get mode() { return this.musicSync.mode; }

  /** Set the audio mode. Stops current playback first. */
  set mode(m) { this.setMode(m); }

  // ──── UI Binding ────

  /** Bind to DOM elements. Call after DOM is ready. */
  bindUI() {
    this.playBtn = document.getElementById('play-btn');
    this.prevBtn = document.getElementById('prev-btn');
    this.nextBtn = document.getElementById('next-btn');
    this.seekBar = document.getElementById('music-seek');
    this.timeDisplay = document.getElementById('music-time');
    this.volSlider = document.getElementById('music-vol');
    this.muteBtn = document.getElementById('mute-btn');
    this._bindEvents();
  }

  _bindEvents() {
    if (this.playBtn) this.playBtn.addEventListener('click', () => this.togglePlay());
    if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prevTrack());
    if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.nextTrack());

    // Seek bar
    if (this.seekBar) {
      this.seekBar.addEventListener('mousedown', () => { this._seeking = true; });
      this.seekBar.addEventListener('touchstart', () => { this._seeking = true; }, { passive: true });
      this.seekBar.addEventListener('input', (e) => {
        if (this._seeking) {
          const pct = parseFloat(e.target.value) / 100;
          this._seekToPercent(pct);
        }
      });
      this.seekBar.addEventListener('mouseup', () => { this._seeking = false; });
      this.seekBar.addEventListener('touchend', () => { this._seeking = false; });
    }

    // Volume
    if (this.volSlider) {
      this.volSlider.addEventListener('input', (e) => {
        this.volume = parseInt(e.target.value) / 100;
        this.audio.volume = this.volume;
        this._synth.setVolume(this.volume);
        this.audio.muted = false;
        this._updateMuteIcon();
      });
    }

    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', () => {
        this.audio.muted = !this.audio.muted;
        if (this.audio.muted) {
          this._synth.setVolume(0);
        } else {
          this._synth.setVolume(this.volume);
        }
        this._updateMuteIcon();
      });
    }

    // MP3 track ended
    this.audio.addEventListener('ended', async () => {
      if (this.musicSync.mode !== AUDIO_MODE.MP3) return;
      // Check for interstitial callback before advancing
      if (this.onTrackEnded) {
        await this.onTrackEnded(this.currentTrack);
      }
      if (this.currentTrack < this.musicSync.getTrackCount() - 1) {
        this.nextTrack();
      } else if (this.infiniteMode) {
        // Infinite mode: loop back to track 0
        this.loadMp3Track(0).then(() => this.play());
      } else {
        // Non-infinite: game completion
        this.isPlaying = false;
        this._updatePlayIcon();
        this._stopTimeLoop();
        if (this.onGameComplete) this.onGameComplete();
      }
    });

    // Visibility change — resume time updates
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isPlaying) {
        const t = this.getCurrentTime();
        if (this.onTimeUpdate) this.onTimeUpdate(t);
      }
    });
  }

  // ──── Mode Switching ────

  /**
   * Switch audio mode. Stops current playback.
   * @param {string} newMode - 'mp3', 'midi', or 'synth'
   */
  setMode(newMode) {
    if (newMode === this.musicSync.mode) return;

    // Stop everything
    this._stopAll();

    this.musicSync.mode = newMode;

    // Notify track change
    if (this.onTrackChange) this.onTrackChange(-1);
  }

  /** Stop all audio engines. */
  _stopAll() {
    this.isPlaying = false;
    this.audio.pause();
    this.midiPlayer.stop();
    this.musicGenerator.stop();
    if (this.wasmSynth) this.wasmSynth.stop();
    this._stopTimeLoop();
    this._updatePlayIcon();
  }

  // ──── Unified Playback Controls ────

  /** Toggle play/pause across all modes. */
  togglePlay() {
    this.isPlaying ? this.pause() : this.play();
  }

  /** Start or resume playback in the current mode. */
  async play() {
    // Ensure AudioContext is resumed (requires user gesture)
    this._synth.init();
    await this._synth.resume();

    switch (this.musicSync.mode) {
      case AUDIO_MODE.MIDI:
        this.midiPlayer.play();
        break;
      case AUDIO_MODE.SYNTH:
        if (this.musicGenerator._tracks.length === 0) {
          this.musicGenerator.generate();
        }
        this.musicGenerator.play();
        break;
      case AUDIO_MODE.WASM:
        if (this.wasmSynth) this.wasmSynth.play();
        break;
      case AUDIO_MODE.MP3:
      default:
        if (this.audio.src || this.audio.currentSrc) {
          this.audio.play().catch(() => {});
        }
        break;
    }

    this.isPlaying = true;
    this._updatePlayIcon();
    this._startTimeLoop();
  }

  /** Pause playback in the current mode. */
  pause() {
    switch (this.musicSync.mode) {
      case AUDIO_MODE.MIDI:
        this.midiPlayer.pause();
        break;
      case AUDIO_MODE.SYNTH:
        this.musicGenerator.pause();
        break;
      case AUDIO_MODE.WASM:
        if (this.wasmSynth) this.wasmSynth.pause();
        break;
      case AUDIO_MODE.MP3:
      default:
        this.audio.pause();
        break;
    }

    this.isPlaying = false;
    this._updatePlayIcon();
    this._stopTimeLoop();
  }

  /** Go to previous track/MIDI. */
  async prevTrack() {
    switch (this.musicSync.mode) {
      case AUDIO_MODE.MIDI:
        await this.midiPlayer.loadPrev();
        if (this.isPlaying) this.midiPlayer.play();
        if (this.onTrackChange) this.onTrackChange(-1);
        break;

      case AUDIO_MODE.SYNTH:
        this.musicGenerator.prevTrack();
        if (this.isPlaying) this.musicGenerator.play();
        if (this.onTrackChange) this.onTrackChange(this.musicGenerator.currentTrack);
        break;

      case AUDIO_MODE.WASM:
        if (this.wasmSynth) {
          await this.wasmSynth.prevTrack();
          if (this.isPlaying) this.wasmSynth.play();
          if (this.onTrackChange) this.onTrackChange(-1);
        }
        break;

      case AUDIO_MODE.MP3:
      default:
        if (this.currentTrack === 0) {
          this.audio.currentTime = 0;
        } else {
          await this.loadMp3Track(this.currentTrack - 1);
          if (this.isPlaying) this.play();
        }
        break;
    }

    this._updateMediaSession();
  }

  /** Go to next track/MIDI. */
  async nextTrack() {
    switch (this.musicSync.mode) {
      case AUDIO_MODE.MIDI:
        await this.midiPlayer.loadNext();
        if (this.isPlaying) this.midiPlayer.play();
        if (this.onTrackChange) this.onTrackChange(-1);
        break;

      case AUDIO_MODE.SYNTH:
        this.musicGenerator.nextTrack();
        if (this.isPlaying) this.musicGenerator.play();
        if (this.onTrackChange) this.onTrackChange(this.musicGenerator.currentTrack);
        break;

      case AUDIO_MODE.WASM:
        if (this.wasmSynth) {
          await this.wasmSynth.nextTrack();
          if (this.isPlaying) this.wasmSynth.play();
          if (this.onTrackChange) this.onTrackChange(-1);
        }
        break;

      case AUDIO_MODE.MP3:
      default:
        if (this.currentTrack < this.musicSync.getTrackCount() - 1) {
          await this.loadMp3Track(this.currentTrack + 1);
          if (this.isPlaying) this.play();
        }
        break;
    }

    this._updateMediaSession();
  }

  // ──── MP3 Track Loading ────

  /**
   * Load an MP3 track by index.
   * @param {number} index
   */
  async loadMp3Track(index) {
    if (index < 0 || index >= this.musicSync.getTrackCount()) return;
    this.currentTrack = index;
    this.musicSync.currentTrack = index;

    const audioUrl = this.musicSync.getAudioUrl(index);
    if (audioUrl) {
      this.audio.src = audioUrl;
      this.audio.load();
    }

    await this.musicSync.loadTrackEvents(index);
    this._updateMediaSession();
    if (this.onTrackChange) this.onTrackChange(index);
  }

  // ──── MIDI Mode Helpers ────

  /**
   * Start MIDI mode: load catalog and play first random MIDI.
   * @param {string} catalogUrl - URL to midi_catalog.json
   * @param {string} [baseUrl] - Override base URL for MIDI files
   * @returns {Promise<boolean>}
   */
  async startMidiMode(catalogUrl, baseUrl) {
    this.setMode(AUDIO_MODE.MIDI);
    const ok = await this.midiPlayer.loadCatalog(catalogUrl, baseUrl);
    if (!ok) return false;
    const loaded = await this.midiPlayer.loadNextRandom();
    // Fire track change after first MIDI loads so info panel updates
    if (loaded && this.onTrackChange) this.onTrackChange(-1);
    return loaded;
  }

  /**
   * Start Synth mode: generate and begin playback.
   * @param {number} [seed] - Optional seed for deterministic generation.
   */
  startSynthMode(seed) {
    this.setMode(AUDIO_MODE.SYNTH);
    this.musicGenerator.generate(seed);
  }

  /**
   * Start WASM Synth mode: attempt WASM init, load catalog, play.
   * Falls back to SynthEngine if WASM binary is unavailable.
   * @param {string} catalogUrl - URL to midi_catalog.json
   * @param {string} [baseUrl] - Base URL for MIDI files
   * @param {string} [wasmUrl] - URL to the .wasm binary
   * @returns {Promise<boolean>}
   */
  async startWasmMode(catalogUrl, baseUrl, wasmUrl) {
    if (!this.wasmSynth) return false;
    this.setMode(AUDIO_MODE.WASM);
    await this.wasmSynth.initWasm(wasmUrl);
    await this.wasmSynth.initAudio();
    const ok = await this.wasmSynth.loadCatalog(catalogUrl, baseUrl);
    if (!ok) return false;
    const loaded = await this.wasmSynth.loadNextRandom();
    if (loaded && this.onTrackChange) this.onTrackChange(-1);
    return loaded;
  }

  // ──── Seek ────

  /**
   * Seek to a percentage of the current track/MIDI duration.
   * @param {number} pct - 0 to 1
   */
  _seekToPercent(pct) {
    const duration = this.musicSync.getDuration();
    if (!duration || !isFinite(duration)) return;
    const targetTime = pct * duration;

    switch (this.musicSync.mode) {
      case AUDIO_MODE.MIDI:
        this.midiPlayer.seek(targetTime);
        break;
      case AUDIO_MODE.SYNTH:
        this.musicGenerator.seek(targetTime);
        break;
      case AUDIO_MODE.WASM:
        if (this.wasmSynth) this.wasmSynth.seek(targetTime);
        break;
      case AUDIO_MODE.MP3:
      default:
        this.audio.currentTime = targetTime;
        break;
    }
  }

  // ──── Time/Duration Access ────

  /** @returns {number} Current playback time across all modes. */
  getCurrentTime() {
    return this.musicSync.getCurrentTime();
  }

  /** @returns {number} Total duration across all modes. */
  getDuration() {
    return this.musicSync.getDuration();
  }

  // ──── Track End Handlers ────

  _onMidiTrackEnd() {
    // Auto-advance to next random MIDI (infinite shuffle)
    this.midiPlayer.loadNext().then(() => {
      this.midiPlayer.play();
      this.isPlaying = true;
      this._updatePlayIcon();
      this._updateMediaSession();
      if (this.onTrackChange) this.onTrackChange(-1);
    });
  }

  _onSynthTrackEnd() {
    // Auto-advance to next generated track
    this.musicGenerator.nextTrack();
    this.musicGenerator.play();
    this.isPlaying = true;
    this._updatePlayIcon();
    if (this.onTrackChange) this.onTrackChange(this.musicGenerator.currentTrack);
  }

  _onWasmTrackEnd() {
    if (!this.wasmSynth) return;
    // Auto-advance to next random MIDI via WASM synth
    this.wasmSynth.loadNext().then(() => {
      this.wasmSynth.play();
      this.isPlaying = true;
      this._updatePlayIcon();
      this._updateMediaSession();
      if (this.onTrackChange) this.onTrackChange(-1);
    });
  }

  // ──── Speed Control ────

  /**
   * Set playback speed (affects MIDI and Synth modes).
   * @param {number} speed - 0.25 to 4.0
   */
  setSpeed(speed) {
    this.midiPlayer.setSpeed(speed);
    this.musicGenerator.setSpeed(speed);
    // MP3 mode: use playbackRate
    this.audio.playbackRate = Math.max(0.25, Math.min(4.0, speed));
  }

  // ──── Mutation Control ────

  /**
   * Apply a mutation preset (affects MIDI and Synth modes via SynthEngine).
   * Note: midiPlayer.setMutation internally calls _synth.setMutation,
   * so we only need to call it once. Calling _synth.setMutation separately
   * would double-apply the filter change, causing audio glitches.
   * @param {Object} mutation - { pitchShift, tempoMult, reverb, filter }
   */
  setMutation(mutation) {
    // Store on MIDI player (which forwards to shared synth engine)
    this.midiPlayer.setMutation(mutation);
    // Also store on the MIDI player's local copy for reference
    // The synth engine is already updated via midiPlayer.setMutation above.
  }

  // ──── Style Sliders (Synth mode) ────

  /**
   * Set arpeggio amount for synth mode.
   * @param {number} val - 0 to 1
   */
  setArpeggioAmount(val) {
    this.musicGenerator.arpeggioAmount = Math.max(0, Math.min(1, val));
  }

  /**
   * Set chord density for synth mode.
   * @param {number} val - 0 to 1
   */
  setChordDensity(val) {
    this.musicGenerator.chordDensity = Math.max(0, Math.min(1, val));
  }

  /**
   * Set note bending amount for synth mode.
   * @param {number} val - 0 to 1
   */
  setBendAmount(val) {
    this.musicGenerator.bendAmount = Math.max(0, Math.min(1, val));
  }

  // ──── Media Session ────

  _updateMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const title = this.musicSync.getCurrentTitle() || 'inthebeginning bounce';

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: 'aiphenomenon',
      album: 'inthebeginning \u2014 V8 Sessions',
    });

    navigator.mediaSession.setActionHandler('play', () => this.play());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.nextTrack());
  }

  // ──── UI Updates ────

  _updatePlayIcon() {
    if (this.playBtn) this.playBtn.textContent = this.isPlaying ? '\u23F8' : '\u25B6';
  }

  _updateMuteIcon() {
    if (this.muteBtn) this.muteBtn.textContent = this.audio.muted ? '\u{1F507}' : '\u{1F50A}';
  }

  _startTimeLoop() {
    if (this._rafId) return;
    const loop = () => {
      this._updateTimeUI();
      const t = this.getCurrentTime();
      if (this.onTimeUpdate) this.onTimeUpdate(t);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _stopTimeLoop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
  }

  _updateTimeUI() {
    const current = this.getCurrentTime();
    const duration = this.getDuration();

    if (this.seekBar && !this._seeking && duration > 0) {
      this.seekBar.value = ((current / duration) * 100).toFixed(1);
    }
    if (this.timeDisplay) {
      this.timeDisplay.textContent =
        `${GamePlayer.formatTime(current)} / ${GamePlayer.formatTime(duration)}`;
    }
  }

  /**
   * Format seconds as M:SS.
   * @param {number} seconds
   * @returns {string}
   */
  static formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Release all resources. */
  destroy() {
    this._stopTimeLoop();
    this._stopAll();
    this.audio.src = '';
    this.midiPlayer.destroy();
    this.musicGenerator.destroy();
    this._synth.destroy();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GamePlayer };
}
