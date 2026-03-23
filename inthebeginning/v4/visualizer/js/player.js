/**
 * Audio Player with UI controls for In The Beginning Visualizer.
 *
 * Manages audio playback via the HTML5 Audio API.
 * Provides play/pause, seek, volume, track navigation, and fullscreen.
 * Controls are colorized to match the dominant grid color scheme.
 */

/**
 * Player manages audio playback and the control bar UI.
 */
class Player {
  /**
   * Create a Player instance.
   * @param {Object} options
   * @param {HTMLElement} options.controlBar - Container for control bar.
   * @param {string} options.mode - 'album', 'single', or 'stream'.
   * @param {Function} options.onTimeUpdate - Callback(currentTime).
   * @param {Function} options.onTrackChange - Callback(trackIndex).
   * @param {Score|null} options.score - Score data for album/single modes.
   */
  constructor(options) {
    /** @type {string} */
    this.mode = options.mode || 'single';

    /** @type {Function} */
    this.onTimeUpdate = options.onTimeUpdate || (() => {});

    /** @type {Function} */
    this.onTrackChange = options.onTrackChange || (() => {});

    /** @type {Score|null} */
    this.score = options.score || null;

    /** @type {HTMLElement|null} */
    this.controlBar = options.controlBar || null;

    /** @type {HTMLAudioElement} */
    this.audio = new Audio();
    this.audio.preload = 'auto';

    /** @type {boolean} */
    this.isPlaying = false;

    /** @type {number} Current track index (0-based) */
    this.currentTrack = 0;

    /** @type {number} */
    this.volume = 0.8;
    this.audio.volume = this.volume;

    /** @type {number} Animation frame ID */
    this._rafId = 0;

    /** @type {boolean} */
    this._seeking = false;

    /** @type {number} Current accent hue */
    this.accentHue = 200;

    // UI element references
    /** @type {Object<string, HTMLElement>} */
    this.ui = {};

    if (this.controlBar) {
      this._buildUI();
      this._bindEvents();
      this._updateModeVisibility();
    }
  }

  /**
   * Build the control bar UI elements.
   * @private
   */
  _buildUI() {
    this.controlBar.innerHTML = '';
    this.controlBar.classList.add('control-bar');

    const html = `
      <div class="controls-left">
        <button class="ctrl-btn prev-btn" title="Previous track" aria-label="Previous track">&#9198;</button>
        <button class="ctrl-btn skip-back-btn" title="Back 15s" aria-label="Skip back 15 seconds">&#9194; 15s</button>
        <button class="ctrl-btn play-btn" title="Play/Pause" aria-label="Play or Pause">&#9199;</button>
        <button class="ctrl-btn skip-fwd-btn" title="Forward 15s" aria-label="Skip forward 15 seconds">15s &#9193;</button>
        <button class="ctrl-btn next-btn" title="Next track" aria-label="Next track">&#9197;</button>
      </div>
      <div class="controls-center">
        <div class="track-info">
          <span class="track-title"></span>
        </div>
        <div class="seek-container">
          <input type="range" class="seek-bar" min="0" max="100" value="0" step="0.1" aria-label="Seek">
          <span class="time-display">0:00 / 0:00</span>
        </div>
      </div>
      <div class="controls-right">
        <button class="ctrl-btn volume-btn" title="Mute/Unmute" aria-label="Mute or Unmute">&#128266;</button>
        <input type="range" class="volume-slider" min="0" max="100" value="80" aria-label="Volume">
        <button class="ctrl-btn fullscreen-btn" title="Fullscreen" aria-label="Toggle fullscreen">&#9974;</button>
      </div>
    `;
    this.controlBar.innerHTML = html;

    this.ui.prevBtn = this.controlBar.querySelector('.prev-btn');
    this.ui.skipBackBtn = this.controlBar.querySelector('.skip-back-btn');
    this.ui.playBtn = this.controlBar.querySelector('.play-btn');
    this.ui.skipFwdBtn = this.controlBar.querySelector('.skip-fwd-btn');
    this.ui.nextBtn = this.controlBar.querySelector('.next-btn');
    this.ui.trackTitle = this.controlBar.querySelector('.track-title');
    this.ui.seekBar = this.controlBar.querySelector('.seek-bar');
    this.ui.timeDisplay = this.controlBar.querySelector('.time-display');
    this.ui.volumeBtn = this.controlBar.querySelector('.volume-btn');
    this.ui.volumeSlider = this.controlBar.querySelector('.volume-slider');
    this.ui.fullscreenBtn = this.controlBar.querySelector('.fullscreen-btn');
    this.ui.seekContainer = this.controlBar.querySelector('.seek-container');
  }

  /**
   * Bind DOM event listeners.
   * @private
   */
  _bindEvents() {
    if (!this.controlBar) return;

    this.ui.playBtn.addEventListener('click', () => this.togglePlay());
    this.ui.skipBackBtn.addEventListener('click', () => this.skip(-15));
    this.ui.skipFwdBtn.addEventListener('click', () => this.skip(15));
    this.ui.prevBtn.addEventListener('click', () => this.prevTrack());
    this.ui.nextBtn.addEventListener('click', () => this.nextTrack());
    this.ui.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

    this.ui.volumeBtn.addEventListener('click', () => {
      this.audio.muted = !this.audio.muted;
      this.ui.volumeBtn.textContent = this.audio.muted ? '\u{1F507}' : '\u{1F50A}';
    });

    this.ui.volumeSlider.addEventListener('input', (e) => {
      this.volume = parseInt(e.target.value) / 100;
      this.audio.volume = this.volume;
      this.audio.muted = false;
      this.ui.volumeBtn.textContent = this.volume === 0 ? '\u{1F507}' : '\u{1F50A}';
    });

    this.ui.seekBar.addEventListener('mousedown', () => { this._seeking = true; });
    this.ui.seekBar.addEventListener('touchstart', () => { this._seeking = true; });
    this.ui.seekBar.addEventListener('input', (e) => {
      if (this._seeking) {
        const pct = parseFloat(e.target.value) / 100;
        const duration = this.audio.duration || (this.score ? this.score.duration : 0);
        this.audio.currentTime = pct * duration;
      }
    });
    this.ui.seekBar.addEventListener('mouseup', () => { this._seeking = false; });
    this.ui.seekBar.addEventListener('touchend', () => { this._seeking = false; });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.skip(-15);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.skip(15);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setVolume(Math.min(1, this.volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setVolume(Math.max(0, this.volume - 0.05));
          break;
        case 'KeyF':
          e.preventDefault();
          this.toggleFullscreen();
          break;
      }
    });

    // Audio events
    this.audio.addEventListener('ended', () => {
      if (this.mode === 'album' && this.score) {
        if (this.currentTrack < this.score.tracks.length - 1) {
          this.nextTrack();
        } else {
          this.isPlaying = false;
          this._updatePlayButton();
          this._stopAnimationLoop();
        }
      } else {
        this.isPlaying = false;
        this._updatePlayButton();
        this._stopAnimationLoop();
      }
    });
  }

  /**
   * Show/hide controls based on current mode.
   * @private
   */
  _updateModeVisibility() {
    if (!this.controlBar) return;

    const isAlbum = this.mode === 'album';
    const isStream = this.mode === 'stream';

    // Prev/Next only in album mode
    if (this.ui.prevBtn) this.ui.prevBtn.style.display = isAlbum ? '' : 'none';
    if (this.ui.nextBtn) this.ui.nextBtn.style.display = isAlbum ? '' : 'none';

    // Seek bar hidden in stream mode
    if (this.ui.seekContainer) this.ui.seekContainer.style.display = isStream ? 'none' : '';

    // Skip buttons hidden in stream mode
    if (this.ui.skipBackBtn) this.ui.skipBackBtn.style.display = isStream ? 'none' : '';
    if (this.ui.skipFwdBtn) this.ui.skipFwdBtn.style.display = isStream ? 'none' : '';
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
    this._updatePlayButton();
    this._startAnimationLoop();
  }

  /**
   * Pause playback.
   */
  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this._updatePlayButton();
    this._stopAnimationLoop();
  }

  /**
   * Skip forward or backward by a number of seconds.
   * @param {number} seconds - Seconds to skip (negative for backward).
   */
  skip(seconds) {
    if (this.mode === 'stream') return;
    const newTime = Math.max(0, Math.min(this.audio.duration || 0, this.audio.currentTime + seconds));
    this.audio.currentTime = newTime;
  }

  /**
   * Go to the previous track (album mode).
   */
  prevTrack() {
    if (this.mode !== 'album' || !this.score) return;
    if (this.currentTrack > 0) {
      this.currentTrack--;
      this._loadTrack(this.currentTrack);
      this.onTrackChange(this.currentTrack);
    }
  }

  /**
   * Go to the next track (album mode).
   */
  nextTrack() {
    if (this.mode !== 'album' || !this.score) return;
    if (this.currentTrack < this.score.tracks.length - 1) {
      this.currentTrack++;
      this._loadTrack(this.currentTrack);
      this.onTrackChange(this.currentTrack);
    }
  }

  /**
   * Load a specific track by index.
   * @param {number} index - Track index (0-based).
   * @private
   */
  _loadTrack(index) {
    if (!this.score || index < 0 || index >= this.score.tracks.length) return;
    const track = this.score.tracks[index];
    if (track.audioFile) {
      this.audio.src = track.audioFile;
    }
    if (this.ui.trackTitle) {
      this.ui.trackTitle.textContent = `${track.trackNum}. ${track.title}`;
    }
    if (this.isPlaying) {
      this.audio.play().catch(() => {});
    }
  }

  /**
   * Load an audio source URL.
   * @param {string} url - Audio file URL.
   */
  loadAudio(url) {
    this.audio.src = url;
    this.audio.load();
  }

  /**
   * Set the volume.
   * @param {number} vol - Volume 0.0 to 1.0.
   */
  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audio.volume = this.volume;
    if (this.ui.volumeSlider) {
      this.ui.volumeSlider.value = Math.round(this.volume * 100);
    }
  }

  /**
   * Toggle fullscreen mode.
   */
  toggleFullscreen() {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  /**
   * Update the play button icon.
   * @private
   */
  _updatePlayButton() {
    if (this.ui.playBtn) {
      this.ui.playBtn.textContent = this.isPlaying ? '\u23F8' : '\u25B6';
      this.ui.playBtn.title = this.isPlaying ? 'Pause' : 'Play';
    }
  }

  /**
   * Start the animation loop for time updates.
   * @private
   */
  _startAnimationLoop() {
    if (this._rafId) return;
    const loop = () => {
      this._updateTimeDisplay();
      this.onTimeUpdate(this.audio.currentTime);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  /**
   * Stop the animation loop.
   * @private
   */
  _stopAnimationLoop() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  /**
   * Update the seek bar and time display.
   * @private
   */
  _updateTimeDisplay() {
    if (!this.ui.seekBar || this._seeking) return;
    const duration = this.audio.duration || (this.score ? this.score.duration : 0);
    const current = this.audio.currentTime || 0;

    if (duration > 0) {
      this.ui.seekBar.value = ((current / duration) * 100).toFixed(1);
    }

    if (this.ui.timeDisplay) {
      this.ui.timeDisplay.textContent = `${Player.formatTime(current)} / ${Player.formatTime(duration)}`;
    }
  }

  /**
   * Update the accent color of controls.
   * @param {number} hue - Hue in degrees (0-360).
   */
  updateAccentColor(hue) {
    this.accentHue = hue;
    if (this.controlBar) {
      this.controlBar.style.setProperty('--accent-hue', hue);
      this.controlBar.style.setProperty('--accent-color', `hsl(${hue}, 70%, 55%)`);
    }
  }

  /**
   * Format seconds as M:SS or H:MM:SS.
   * @param {number} seconds - Time in seconds.
   * @returns {string} Formatted time string.
   */
  static formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * Destroy the player and release resources.
   */
  destroy() {
    this._stopAnimationLoop();
    this.audio.pause();
    this.audio.src = '';
    if (this.controlBar) {
      this.controlBar.innerHTML = '';
    }
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Player };
}
