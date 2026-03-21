/**
 * Audio Player for Cosmic Runner.
 *
 * Manages HTML5 Audio playback, track navigation, and UI updates.
 * Integrates with MusicSync to provide note events to the game.
 */

/**
 * GamePlayer handles audio playback and the music bar UI.
 */
class GamePlayer {
  /**
   * @param {MusicSync} musicSync - Music synchronization instance.
   */
  constructor(musicSync) {
    /** @type {MusicSync} */
    this.musicSync = musicSync;

    /** @type {HTMLAudioElement} */
    this.audio = new Audio();
    this.audio.preload = 'auto';

    /** @type {boolean} */
    this.isPlaying = false;

    /** @type {number} Current track index */
    this.currentTrack = 0;

    /** @type {number} */
    this.volume = 0.8;
    this.audio.volume = this.volume;

    /** @type {number} Animation frame ID for time updates */
    this._rafId = 0;

    /** @type {boolean} */
    this._seeking = false;

    // UI elements (bound later)
    /** @type {HTMLElement|null} */
    this.playBtn = null;
    /** @type {HTMLElement|null} */
    this.prevBtn = null;
    /** @type {HTMLElement|null} */
    this.nextBtn = null;
    /** @type {HTMLInputElement|null} */
    this.seekBar = null;
    /** @type {HTMLElement|null} */
    this.timeDisplay = null;
    /** @type {HTMLInputElement|null} */
    this.volSlider = null;
    /** @type {HTMLElement|null} */
    this.muteBtn = null;

    // Callbacks
    /** @type {Function|null} */
    this.onTimeUpdate = null;
    /** @type {Function|null} */
    this.onTrackChange = null;
  }

  /**
   * Bind UI elements from the DOM.
   */
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

  /**
   * Bind event listeners.
   * @private
   */
  _bindEvents() {
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => this.togglePlay());
    }
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.prevTrack());
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.nextTrack());
    }

    if (this.seekBar) {
      this.seekBar.addEventListener('mousedown', () => { this._seeking = true; });
      this.seekBar.addEventListener('touchstart', () => { this._seeking = true; });
      this.seekBar.addEventListener('input', (e) => {
        if (this._seeking) {
          const pct = parseFloat(e.target.value) / 100;
          this.audio.currentTime = pct * (this.audio.duration || 0);
        }
      });
      this.seekBar.addEventListener('mouseup', () => { this._seeking = false; });
      this.seekBar.addEventListener('touchend', () => { this._seeking = false; });
    }

    if (this.volSlider) {
      this.volSlider.addEventListener('input', (e) => {
        this.volume = parseInt(e.target.value) / 100;
        this.audio.volume = this.volume;
        this.audio.muted = false;
        this._updateMuteIcon();
      });
    }

    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', () => {
        this.audio.muted = !this.audio.muted;
        this._updateMuteIcon();
      });
    }

    this.audio.addEventListener('ended', () => {
      if (this.currentTrack < this.musicSync.getTrackCount() - 1) {
        this.nextTrack();
      } else {
        // Loop back to first track
        this.loadTrack(0);
        this.play();
      }
    });
  }

  /**
   * Load and play a specific track.
   * @param {number} index
   */
  async loadTrack(index) {
    if (index < 0 || index >= this.musicSync.getTrackCount()) return;

    this.currentTrack = index;
    this.musicSync.currentTrack = index;

    const audioUrl = this.musicSync.getAudioUrl(index);
    if (audioUrl) {
      this.audio.src = audioUrl;
      this.audio.load();
    }

    // Preload note events for this track
    await this.musicSync.loadTrackEvents(index);

    if (this.onTrackChange) {
      this.onTrackChange(index);
    }
  }

  /**
   * Toggle play/pause.
   */
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Start or resume playback.
   */
  play() {
    if (this.audio.src || this.audio.currentSrc) {
      this.audio.play().catch(() => {});
    }
    this.isPlaying = true;
    this._updatePlayIcon();
    this._startTimeLoop();
  }

  /**
   * Pause playback.
   */
  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this._updatePlayIcon();
    this._stopTimeLoop();
  }

  /**
   * Go to previous track.
   */
  prevTrack() {
    if (this.currentTrack > 0) {
      this.loadTrack(this.currentTrack - 1).then(() => {
        if (this.isPlaying) this.play();
      });
    }
  }

  /**
   * Go to next track.
   */
  nextTrack() {
    if (this.currentTrack < this.musicSync.getTrackCount() - 1) {
      this.loadTrack(this.currentTrack + 1).then(() => {
        if (this.isPlaying) this.play();
      });
    }
  }

  /**
   * Get current playback time.
   * @returns {number}
   */
  getCurrentTime() {
    return this.audio.currentTime || 0;
  }

  /**
   * Get current track duration.
   * @returns {number}
   */
  getDuration() {
    return this.audio.duration || 0;
  }

  /**
   * Update play button icon.
   * @private
   */
  _updatePlayIcon() {
    if (this.playBtn) {
      this.playBtn.textContent = this.isPlaying ? '\u23F8' : '\u25B6';
    }
  }

  /**
   * Update mute button icon.
   * @private
   */
  _updateMuteIcon() {
    if (this.muteBtn) {
      this.muteBtn.textContent = this.audio.muted ? '\u{1F507}' : '\u{1F50A}';
    }
  }

  /**
   * Start the time update animation loop.
   * @private
   */
  _startTimeLoop() {
    if (this._rafId) return;
    const loop = () => {
      this._updateTimeUI();
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audio.currentTime);
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /**
   * Stop the time update loop.
   * @private
   */
  _stopTimeLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  /**
   * Update the seek bar and time display.
   * @private
   */
  _updateTimeUI() {
    const current = this.audio.currentTime || 0;
    const duration = this.audio.duration || 0;

    if (this.seekBar && !this._seeking && duration > 0) {
      this.seekBar.value = ((current / duration) * 100).toFixed(1);
    }

    if (this.timeDisplay) {
      this.timeDisplay.textContent = `${GamePlayer.formatTime(current)} / ${GamePlayer.formatTime(duration)}`;
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
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * Destroy the player.
   */
  destroy() {
    this._stopTimeLoop();
    this.audio.pause();
    this.audio.src = '';
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GamePlayer };
}
