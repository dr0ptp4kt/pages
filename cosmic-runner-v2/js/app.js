/**
 * Main Application Controller for Cosmic Runner V2.
 *
 * Supports three modes of operation:
 * - player: Standalone music player (no game, minimal visuals)
 * - game: Side-scroller game with subdued background cells and stars
 * - grid: 64x64 grid visualization synchronized to music
 *
 * Mode switching preserves music playback state.
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

    /** @type {string} Current screen ('title' or 'main') */
    this.screen = 'title';

    /** @type {string} Current mode ('player', 'game', 'grid') */
    this.mode = 'game';

    /** @type {boolean} */
    this.musicLoaded = false;

    // DOM references
    /** @type {HTMLElement} */
    this.titleScreen = null;
    /** @type {HTMLElement} */
    this.mainScreen = null;
    /** @type {HTMLCanvasElement} */
    this.canvas = null;

    // HUD elements
    /** @type {HTMLElement} */
    this.hudScore = null;
    /** @type {HTMLElement} */
    this.hudTrack = null;
    /** @type {HTMLElement} */
    this.hudEpoch = null;
    /** @type {HTMLElement} */
    this.noteInfoPanel = null;
    /** @type {HTMLElement} */
    this.noteInfoContent = null;

    /** @type {HTMLElement|null} */
    this.pauseOverlay = null;
  }

  /**
   * Initialize the application.
   */
  async init() {
    this.titleScreen = document.getElementById('title-screen');
    this.mainScreen = document.getElementById('main-screen');
    this.canvas = document.getElementById('main-canvas');
    this.hudScore = document.getElementById('hud-score');
    this.hudTrack = document.getElementById('hud-track');
    this.hudEpoch = document.getElementById('hud-epoch');
    this.noteInfoPanel = document.getElementById('note-info');
    this.noteInfoContent = document.getElementById('note-info-content');

    // Title screen mode selection
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.mode = btn.dataset.mode;
      });
    });

    // Start button
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this._start());
    }

    // Pause button
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this._togglePause());
    }

    // Mode tabs (in-app switching)
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this._switchMode(tab.dataset.mode);
      });
    });

    // Input handlers
    this._bindInput();

    // Load album data
    await this._loadMusic();
  }

  /**
   * Load album music data.
   * @private
   */
  async _loadMusic() {
    const paths = [
      'audio/album_notes.json',
      '../audio/output/v8_album/album_notes.json',
      '../../apps/audio/output/v8_album/album_notes.json',
    ];

    for (const path of paths) {
      const loaded = await this.musicSync.loadAlbum(path);
      if (loaded) {
        this.musicLoaded = true;
        break;
      }
    }

    if (!this.musicLoaded) {
      const startBtn = document.getElementById('start-btn');
      if (startBtn) {
        startBtn.textContent = 'START (No Audio)';
      }
    }
  }

  /**
   * Start the app in the selected mode.
   * @private
   */
  async _start() {
    this.titleScreen.classList.remove('active');
    this.mainScreen.classList.add('active');
    this.screen = 'main';

    // Apply mode class to body
    document.body.className = `mode-${this.mode}`;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === this.mode);
    });

    // Initialize game engine
    this.game = new Game(this.canvas);
    this.game.mode = this.mode;
    this.game.onScoreUpdate = (score) => {
      if (this.hudScore) this.hudScore.textContent = score;
    };
    this.game.onEpochChange = (idx, name) => {
      if (this.hudEpoch) this.hudEpoch.textContent = name;
    };
    this.game.onBlast = (count) => {
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

    // Build track list
    this._buildTrackList();

    // Show note info in grid and player modes
    this._updateNoteInfoVisibility();
  }

  /**
   * Switch between modes while running.
   * @param {string} newMode
   * @private
   */
  _switchMode(newMode) {
    if (newMode === this.mode) return;
    this.mode = newMode;

    // Update body class
    document.body.className = `mode-${this.mode}`;

    // Update tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === this.mode);
    });

    // Update game mode
    if (this.game) {
      this.game.setMode(this.mode);

      // Create/destroy runner and obstacles based on mode
      if (this.mode === 'game' && !this.game.runner) {
        this.game.runner = new Runner(this.game.groundY);
        this.game.obstacles = new ObstacleManager(this.game.width, this.game.groundY);
      } else if (this.mode !== 'game') {
        this.game.runner = null;
        this.game.obstacles = null;
      }

      // If paused and switching mode, resume
      if (this.game.paused) {
        this.game.resume();
        if (this.player) this.player.play();
        this._hidePauseOverlay();
      }
    }

    // Show/hide score
    const scoreEl = document.getElementById('hud-score');
    const scoreLabelEl = document.getElementById('hud-score-label');
    if (scoreEl) scoreEl.style.display = this.mode === 'game' ? '' : 'none';
    if (scoreLabelEl) scoreLabelEl.style.display = this.mode === 'game' ? '' : 'none';

    // Note info visibility
    this._updateNoteInfoVisibility();
  }

  /**
   * Update note info panel visibility.
   * @private
   */
  _updateNoteInfoVisibility() {
    if (this.noteInfoPanel) {
      // Show in grid and player modes
      const show = this.mode === 'grid' || this.mode === 'player';
      this.noteInfoPanel.classList.toggle('visible', show);
    }
  }

  /**
   * Handle music time updates.
   * @param {number} time
   * @private
   */
  _onMusicTime(time) {
    if (!this.game || !this.game.running) return;

    const events = this.musicSync.getActiveEvents(time);
    this.musicSync.updateHue(time);
    this.game.setMusicEvents(events, this.musicSync.hueOffset);

    const intensity = this.musicSync.getIntensity(time);
    this.game.setIntensity(intensity);

    const duration = this.player.getDuration();
    const epoch = this.musicSync.getEpoch(time, duration);
    this.game.setEpoch(epoch.index, epoch.name);

    // Update note info display
    this._updateNoteInfo(events);
  }

  /**
   * Update the note info panel with current notes.
   * @param {Array<Object>} events
   * @private
   */
  _updateNoteInfo(events) {
    if (!this.noteInfoContent) return;
    if (!this.noteInfoPanel || !this.noteInfoPanel.classList.contains('visible')) return;

    const noteInfo = this.musicSync.getNoteInfo(events);
    if (noteInfo.length === 0) {
      this.noteInfoContent.textContent = '';
      return;
    }

    let html = '';
    for (const n of noteInfo) {
      const velPct = Math.round(n.vel * 100);
      html += `<span class="note-tag">` +
              `<span class="note-pitch">${n.pitch}</span> ` +
              `<span class="note-inst">${n.inst}</span>` +
              `</span>`;
    }
    this.noteInfoContent.innerHTML = html;
  }

  /**
   * Handle track changes.
   * @param {number} trackIndex
   * @private
   */
  _onTrackChange(trackIndex) {
    this._updateTrackDisplay(trackIndex);
    if (this.game) this.game.setTrackBias(trackIndex);
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
      if (this.player) this.player.play();
      if (pauseBtn) pauseBtn.textContent = '\u23F8\u23F8';
      this._hidePauseOverlay();
    }
  }

  /** @private */
  _showPauseOverlay() {
    if (this.pauseOverlay) return;
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'pause-overlay';
    this.pauseOverlay.innerHTML = '<h2>PAUSED</h2><p>Press SPACE or tap to resume</p>';
    this.pauseOverlay.addEventListener('click', () => this._togglePause());
    document.body.appendChild(this.pauseOverlay);
  }

  /** @private */
  _hidePauseOverlay() {
    if (this.pauseOverlay) {
      this.pauseOverlay.remove();
      this.pauseOverlay = null;
    }
  }

  /**
   * Build the track list overlay.
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

    // Toggle on track title click
    if (this.hudTrack) {
      this.hudTrack.style.cursor = 'pointer';
      this.hudTrack.addEventListener('click', () => {
        overlay.classList.toggle('visible');
      });
    }

    // Close on backdrop
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('visible');
      }
    });
  }

  /**
   * Highlight the active track entry.
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
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (this.screen === 'title') {
            this._start();
          } else if (this.game && this.game.paused) {
            this._togglePause();
          } else if (this.mode === 'game') {
            this.game && this.game.jump();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (this.mode === 'game') {
            this.game && this.game.jump();
          }
          break;
        case 'KeyP':
        case 'Escape':
          e.preventDefault();
          if (this.screen === 'main') this._togglePause();
          break;
        case 'Digit1':
          e.preventDefault();
          if (this.screen === 'main') this._switchMode('player');
          break;
        case 'Digit2':
          e.preventDefault();
          if (this.screen === 'main') this._switchMode('game');
          break;
        case 'Digit3':
          e.preventDefault();
          if (this.screen === 'main') this._switchMode('grid');
          break;
      }
    });

    // Touch on canvas for jump (game mode only)
    document.addEventListener('touchstart', (e) => {
      if (this.screen !== 'main') return;
      if (e.target.closest('.hud') || e.target.closest('.music-bar') ||
          e.target.closest('.track-overlay') || e.target.closest('.pause-overlay') ||
          e.target.closest('.note-info')) {
        return;
      }
      if (this.mode !== 'game') return;
      e.preventDefault();
      if (this.game && this.game.paused) {
        this._togglePause();
      } else {
        this.game && this.game.jump();
      }
    }, { passive: false });

    // Mouse click on canvas
    if (this.canvas) {
      this.canvas.addEventListener('click', () => {
        if (this.screen !== 'main' || this.mode !== 'game') return;
        if (this.game && this.game.paused) {
          this._togglePause();
        } else {
          this.game && this.game.jump();
        }
      });
    }
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
