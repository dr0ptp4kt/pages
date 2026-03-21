/**
 * Main Application Controller for Cosmic Runner.
 *
 * Orchestrates the title screen, game engine, music player, and HUD.
 * Handles input events (keyboard, touch, mouse) and screen transitions.
 */

/**
 * CosmicRunnerApp is the top-level application controller.
 */
class CosmicRunnerApp {
  constructor() {
    /** @type {Game|null} */
    this.game = null;

    /** @type {GamePlayer|null} */
    this.player = null;

    /** @type {MusicSync} */
    this.musicSync = new MusicSync();

    /** @type {string} Current screen ('title' or 'game') */
    this.screen = 'title';

    /** @type {boolean} Whether music has been loaded */
    this.musicLoaded = false;

    // DOM references
    /** @type {HTMLElement} */
    this.titleScreen = null;
    /** @type {HTMLElement} */
    this.gameScreen = null;
    /** @type {HTMLCanvasElement} */
    this.canvas = null;

    // HUD elements
    /** @type {HTMLElement} */
    this.hudScore = null;
    /** @type {HTMLElement} */
    this.hudTrack = null;
    /** @type {HTMLElement} */
    this.hudEpoch = null;

    /** @type {HTMLElement|null} */
    this.pauseOverlay = null;
  }

  /**
   * Initialize the application.
   */
  async init() {
    // Grab DOM elements
    this.titleScreen = document.getElementById('title-screen');
    this.gameScreen = document.getElementById('game-screen');
    this.canvas = document.getElementById('game-canvas');
    this.hudScore = document.getElementById('hud-score');
    this.hudTrack = document.getElementById('hud-track');
    this.hudEpoch = document.getElementById('hud-epoch');

    // Start button
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this._startGame());
    }

    // Pause button
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this._togglePause());
    }

    // Input handlers
    this._bindInput();

    // Try to load album data
    await this._loadMusic();
  }

  /**
   * Attempt to load album music data.
   * Tries multiple relative paths to find the album_notes.json.
   * @private
   */
  async _loadMusic() {
    const paths = [
      'audio/album_notes.json',
      '../audio/output/album/album_notes.json',
      '../../apps/audio/output/album/album_notes.json',
    ];

    for (const path of paths) {
      const loaded = await this.musicSync.loadAlbum(path);
      if (loaded) {
        this.musicLoaded = true;
        break;
      }
    }

    if (!this.musicLoaded) {
      // No album found - game still works, just without music
      const startBtn = document.getElementById('start-btn');
      if (startBtn) {
        startBtn.textContent = 'START (No Audio)';
      }
    }
  }

  /**
   * Transition to the game screen and start playing.
   * @private
   */
  async _startGame() {
    // Switch screens
    this.titleScreen.classList.remove('active');
    this.gameScreen.classList.add('active');
    this.screen = 'game';

    // Initialize game engine
    this.game = new Game(this.canvas);
    this.game.onScoreUpdate = (score) => {
      if (this.hudScore) this.hudScore.textContent = score;
    };
    this.game.onEpochChange = (idx, name) => {
      if (this.hudEpoch) this.hudEpoch.textContent = name;
    };
    this.game.onBlast = (count) => {
      // Visual feedback on blast (brief screen shake via CSS)
      this.canvas.style.transform = `translateX(${(Math.random() - 0.5) * 6}px)`;
      setTimeout(() => { this.canvas.style.transform = ''; }, 80);
    };

    this.game.start();

    // Initialize music player
    this.player = new GamePlayer(this.musicSync);
    this.player.bindUI();
    this.player.onTimeUpdate = (time) => this._onMusicTime(time);
    this.player.onTrackChange = (idx) => this._onTrackChange(idx);

    // Load first track and start playing
    if (this.musicLoaded && this.musicSync.getTrackCount() > 0) {
      await this.player.loadTrack(0);
      this.player.play();
      this._updateTrackDisplay(0);
    }

    // Build track list overlay
    this._buildTrackList();
  }

  /**
   * Handle music time updates — sync game with music.
   * @param {number} time
   * @private
   */
  _onMusicTime(time) {
    if (!this.game || !this.game.running) return;

    // Get active note events and feed to game background
    const events = this.musicSync.getActiveEvents(time);
    this.musicSync.updateHue(time);
    this.game.setMusicEvents(events, this.musicSync.hueOffset);

    // Music intensity affects game speed
    const intensity = this.musicSync.getIntensity(time);
    this.game.setIntensity(intensity);

    // Epoch detection for character morphing
    const duration = this.player.getDuration();
    const epoch = this.musicSync.getEpoch(time, duration);
    this.game.setEpoch(epoch.index, epoch.name);
  }

  /**
   * Handle track changes.
   * @param {number} trackIndex
   * @private
   */
  _onTrackChange(trackIndex) {
    this._updateTrackDisplay(trackIndex);
    if (this.game) {
      this.game.setTrackBias(trackIndex);
    }
    this._highlightTrackEntry(trackIndex);
  }

  /**
   * Update the HUD track display.
   * @param {number} trackIndex
   * @private
   */
  _updateTrackDisplay(trackIndex) {
    const track = this.musicSync.getTrack(trackIndex);
    if (track && this.hudTrack) {
      this.hudTrack.textContent = `${track.trackNum}. ${track.title}`;
    }
  }

  /**
   * Toggle pause state.
   * @private
   */
  _togglePause() {
    if (!this.game) return;

    const paused = this.game.togglePause();
    const pauseBtn = document.getElementById('pause-btn');

    if (paused) {
      if (this.player && this.player.isPlaying) {
        this.player.pause();
      }
      if (pauseBtn) pauseBtn.textContent = '\u25B6';
      this._showPauseOverlay();
    } else {
      if (this.player) {
        this.player.play();
      }
      if (pauseBtn) pauseBtn.textContent = '\u23F8\u23F8';
      this._hidePauseOverlay();
    }
  }

  /**
   * Show the pause overlay.
   * @private
   */
  _showPauseOverlay() {
    if (this.pauseOverlay) return;
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'pause-overlay';
    this.pauseOverlay.innerHTML = '<h2>PAUSED</h2><p>Press SPACE or tap to resume</p>';
    this.pauseOverlay.addEventListener('click', () => this._togglePause());
    document.body.appendChild(this.pauseOverlay);
  }

  /**
   * Hide the pause overlay.
   * @private
   */
  _hidePauseOverlay() {
    if (this.pauseOverlay) {
      this.pauseOverlay.remove();
      this.pauseOverlay = null;
    }
  }

  /**
   * Build the track list overlay panel.
   * @private
   */
  _buildTrackList() {
    const panel = document.getElementById('track-list-panel');
    const overlay = document.getElementById('track-overlay');
    if (!panel || !overlay) return;

    panel.innerHTML = '';

    for (let i = 0; i < this.musicSync.getTrackCount(); i++) {
      const track = this.musicSync.getTrack(i);
      if (!track) continue;
      const entry = document.createElement('div');
      entry.className = 'track-entry';
      if (i === 0) entry.classList.add('active');
      entry.textContent = `${track.trackNum}. ${track.title}`;
      entry.dataset.index = i;
      entry.addEventListener('click', () => {
        this.player.loadTrack(i).then(() => {
          this.player.play();
        });
        overlay.classList.remove('visible');
      });
      panel.appendChild(entry);
    }

    // Toggle track list on track title click
    if (this.hudTrack) {
      this.hudTrack.style.cursor = 'pointer';
      this.hudTrack.addEventListener('click', () => {
        overlay.classList.toggle('visible');
      });
    }

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('visible');
      }
    });
  }

  /**
   * Highlight the active track entry in the track list.
   * @param {number} index
   * @private
   */
  _highlightTrackEntry(index) {
    const panel = document.getElementById('track-list-panel');
    if (!panel) return;
    const entries = panel.querySelectorAll('.track-entry');
    entries.forEach((entry, i) => {
      entry.classList.toggle('active', i === index);
    });
  }

  /**
   * Bind keyboard, mouse, and touch input.
   * @private
   */
  _bindInput() {
    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (this.screen === 'title') {
            this._startGame();
          } else if (this.game && this.game.paused) {
            this._togglePause();
          } else {
            this.game && this.game.jump();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.game && this.game.jump();
          break;
        case 'KeyP':
        case 'Escape':
          e.preventDefault();
          this._togglePause();
          break;
      }
    });

    // Touch / click on canvas for jump
    document.addEventListener('touchstart', (e) => {
      if (this.screen !== 'game') return;
      // Don't intercept touches on UI elements
      if (e.target.closest('.hud') || e.target.closest('.music-bar') ||
          e.target.closest('.track-overlay') || e.target.closest('.pause-overlay')) {
        return;
      }
      e.preventDefault();
      if (this.game && this.game.paused) {
        this._togglePause();
      } else {
        this.game && this.game.jump();
      }
    }, { passive: false });

    // Mouse click on canvas for jump
    this.canvas && this.canvas.addEventListener('click', () => {
      if (this.screen !== 'game') return;
      if (this.game && this.game.paused) {
        this._togglePause();
      } else {
        this.game && this.game.jump();
      }
    });
  }
}

// Initialize on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new CosmicRunnerApp();
    app.init();
    window.__cosmicRunner = app;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CosmicRunnerApp };
}
