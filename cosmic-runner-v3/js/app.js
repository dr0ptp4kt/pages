/**
 * Main Application Controller for Cosmic Runner V3.
 *
 * Supports: three modes (player/game/grid), two-player cooperative,
 * progressive 3D transition, theme/accessibility settings,
 * lock-screen audio, and full-track music visualization.
 */

class CosmicRunnerApp {
  constructor() {
    this.game = null;
    this.player = null;
    this.musicSync = new MusicSync();
    this.themeManager = new ThemeManager();

    this.screen = 'title';
    this.mode = 'game';
    this.numPlayers = 1;
    this.musicLoaded = false;

    // DOM refs
    this.titleScreen = null;
    this.mainScreen = null;
    this.canvas = null;
    this.blastCanvas = null;

    // HUD
    this.hudScore = null;
    this.hudTrack = null;
    this.hudEpoch = null;
    this.hudNames = null;
    this.noteInfoPanel = null;
    this.noteInfoContent = null;
    this.songTitleDisplay = null;
    this.pauseOverlay = null;
  }

  async init() {
    this.titleScreen = document.getElementById('title-screen');
    this.mainScreen = document.getElementById('main-screen');
    this.canvas = document.getElementById('main-canvas');
    this.blastCanvas = document.getElementById('blast-canvas');
    this.hudScore = document.getElementById('hud-score');
    this.hudTrack = document.getElementById('hud-track');
    this.hudEpoch = document.getElementById('hud-epoch');
    this.hudNames = document.getElementById('hud-names');
    this.noteInfoPanel = document.getElementById('note-info');
    this.noteInfoContent = document.getElementById('note-info-content');
    this.songTitleDisplay = document.getElementById('song-title-display');

    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.mode = btn.dataset.mode;
      });
    });

    // Player count
    document.querySelectorAll('.player-count-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.player-count-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.numPlayers = parseInt(btn.dataset.players);
      });
    });

    // Start
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', () => this._start());

    // Pause
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => this._togglePause());

    // Speed controls
    const speedDown = document.getElementById('speed-down');
    const speedUp = document.getElementById('speed-up');
    if (speedDown) speedDown.addEventListener('click', () => {
      if (this.game) this.game.adjustSpeed(-SPEED_STEP);
    });
    if (speedUp) speedUp.addEventListener('click', () => {
      if (this.game) this.game.adjustSpeed(SPEED_STEP);
    });

    // Mode tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', () => this._switchMode(tab.dataset.mode));
    });

    // Grid dimension tabs
    document.querySelectorAll('.dim-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dim-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.game) this.game.setGridDim(btn.dataset.dim);
      });
    });

    // Theme overlay
    this._initThemeOverlay();

    // Accessibility overlay
    this._initAccessibilityOverlay();

    // In-game overlays
    const ingameTheme = document.getElementById('ingame-theme-btn');
    const ingameAccess = document.getElementById('ingame-access-btn');
    if (ingameTheme) ingameTheme.addEventListener('click', () => {
      document.getElementById('theme-overlay')?.classList.toggle('visible');
    });
    if (ingameAccess) ingameAccess.addEventListener('click', () => {
      document.getElementById('accessibility-overlay')?.classList.toggle('visible');
    });

    this._bindInput();
    await this._loadMusic();
  }

  _initThemeOverlay() {
    const grid = document.getElementById('theme-grid');
    const starGrid = document.getElementById('star-grid');
    const close = document.getElementById('theme-close');
    const overlay = document.getElementById('theme-overlay');

    if (grid) {
      THEMES.forEach((theme, i) => {
        const btn = document.createElement('button');
        btn.className = 'theme-chip' + (i === 0 ? ' selected' : '');
        const a = theme.accent;
        btn.style.borderColor = `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
        btn.textContent = theme.name;
        btn.addEventListener('click', () => {
          grid.querySelectorAll('.theme-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.themeManager.themeIndex = i;
        });
        grid.appendChild(btn);
      });
    }

    if (starGrid) {
      // Show first 12 star styles as buttons (fitting in the panel)
      for (let i = 0; i < Math.min(34, STAR_STYLES.length); i++) {
        const style = STAR_STYLES[i];
        const btn = document.createElement('button');
        btn.className = 'star-chip' + (i === 0 ? ' selected' : '');
        btn.textContent = style.name;
        btn.addEventListener('click', () => {
          starGrid.querySelectorAll('.star-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.themeManager.starStyleIndex = i;
        });
        starGrid.appendChild(btn);
      }
    }

    if (close && overlay) {
      close.addEventListener('click', () => overlay.classList.remove('visible'));
    }

    // Open from title screen
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn && overlay) {
      themeBtn.addEventListener('click', () => overlay.classList.toggle('visible'));
    }
  }

  _initAccessibilityOverlay() {
    const overlay = document.getElementById('accessibility-overlay');
    const close = document.getElementById('access-close');

    document.querySelectorAll('.access-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.access-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const mode = btn.dataset.access;
        if (this.game) this.game.setAccessMode(mode);
      });
    });

    if (close && overlay) {
      close.addEventListener('click', () => overlay.classList.remove('visible'));
    }

    const accessBtn = document.getElementById('accessibility-btn');
    if (accessBtn && overlay) {
      accessBtn.addEventListener('click', () => overlay.classList.toggle('visible'));
    }
  }

  async _loadMusic() {
    // Try multiple paths for the album notes
    const paths = [
      'audio/album_notes.json',
      '../cosmic-runner-v3/audio/album_notes.json',
    ];
    // Audio files are in v2 dir (shared)
    const audioPaths = [
      '../cosmic-runner-v2/audio/',
      'audio/',
    ];

    for (let i = 0; i < paths.length; i++) {
      const loaded = await this.musicSync.loadAlbum(paths[i], audioPaths[i]);
      if (loaded) {
        this.musicLoaded = true;
        break;
      }
    }

    // Also try with audio files in same directory
    if (!this.musicLoaded) {
      const loaded = await this.musicSync.loadAlbum('audio/album_notes.json');
      if (loaded) this.musicLoaded = true;
    }

    if (!this.musicLoaded) {
      const startBtn = document.getElementById('start-btn');
      if (startBtn) startBtn.textContent = 'START (No Audio)';
    }
  }

  async _start() {
    this.titleScreen.classList.remove('active');
    this.mainScreen.classList.add('active');
    this.screen = 'main';
    document.body.className = `mode-${this.mode}`;

    // Update tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === this.mode);
    });

    // Show grid dim tabs only in grid mode
    this._updateGridDimTabs();

    // Init game
    this.game = new Game(this.canvas, this.blastCanvas);
    this.game.mode = this.mode;
    this.game.numPlayers = this.numPlayers;
    this.game.themeManager = this.themeManager;
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

    // Init player
    this.player = new GamePlayer(this.musicSync);
    this.player.bindUI();
    this.player.onTimeUpdate = (time) => this._onMusicTime(time);
    this.player.onTrackChange = (idx) => this._onTrackChange(idx);

    if (this.musicLoaded && this.musicSync.getTrackCount() > 0) {
      await this.player.loadTrack(0);
      this.player.play();
      this._updateTrackDisplay(0);
    }

    this._buildTrackList();
    this._updateNoteInfoVisibility();
    this._updateNames();
  }

  _switchMode(newMode) {
    if (newMode === this.mode) return;
    this.mode = newMode;
    document.body.className = `mode-${this.mode}`;

    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === this.mode);
    });

    this._updateGridDimTabs();

    if (this.game) {
      this.game.setMode(this.mode);
      if (this.mode === 'game' && this.game.runners.length === 0) {
        this.game._initRunners();
        this.game.obstacles = new ObstacleManager(this.game.width, this.game.groundY);
        this.game.obstacles.setLevel(this.game.currentLevel);
      } else if (this.mode !== 'game') {
        this.game.runners = [];
        this.game.obstacles = null;
      }

      if (this.game.paused) {
        this.game.resume();
        if (this.player) this.player.play();
        this._hidePauseOverlay();
      }
    }

    // Show/hide score and player names
    const scoreEl = document.getElementById('hud-score');
    const scoreLabelEl = document.getElementById('hud-score-label');
    const namesEl = document.getElementById('hud-names');
    if (scoreEl) scoreEl.style.display = this.mode === 'game' ? '' : 'none';
    if (scoreLabelEl) scoreLabelEl.style.display = this.mode === 'game' ? '' : 'none';
    if (namesEl) namesEl.style.display = this.mode === 'game' ? '' : 'none';

    this._updateNoteInfoVisibility();
    this._updateSongTitleDisplay();
  }

  _updateGridDimTabs() {
    const tabs = document.getElementById('grid-dim-tabs');
    if (tabs) tabs.style.display = this.mode === 'grid' ? '' : 'none';
  }

  _updateNoteInfoVisibility() {
    if (this.noteInfoPanel) {
      const show = this.mode === 'grid' || this.mode === 'player';
      this.noteInfoPanel.classList.toggle('visible', show);
    }
  }

  _updateSongTitleDisplay() {
    if (!this.songTitleDisplay) return;

    if (this.mode === 'player') {
      const track = this.musicSync.getTrack(this.player?.currentTrack || 0);
      if (track) {
        const tc = TRACK_COLORS[(this.player?.currentTrack || 0) % TRACK_COLORS.length];
        const color = `rgb(${tc.primary[0]}, ${tc.primary[1]}, ${tc.primary[2]})`;
        this.songTitleDisplay.textContent = `${track.trackNum}. ${track.title}`;
        this.songTitleDisplay.style.color = color;
        this.songTitleDisplay.style.textShadow = `0 0 30px ${color}`;
        this.songTitleDisplay.classList.add('visible');
      }
    } else {
      this.songTitleDisplay.classList.remove('visible');
    }
  }

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

    // Track progress for glow calculations
    if (duration > 0) {
      this.game.setTrackProgress(time / duration, duration);
    }

    this._updateNoteInfo(events);
  }

  _updateNoteInfo(events) {
    if (!this.noteInfoContent) return;
    if (!this.noteInfoPanel?.classList.contains('visible')) return;

    const noteInfo = this.musicSync.getNoteInfo(events);
    if (!noteInfo.length) {
      this.noteInfoContent.textContent = '';
      return;
    }

    let html = '';
    for (const n of noteInfo) {
      html += `<span class="note-tag"><span class="note-pitch">${n.pitch}</span> <span class="note-inst">${n.inst}</span></span>`;
    }
    this.noteInfoContent.innerHTML = html;
  }

  _onTrackChange(trackIndex) {
    this._updateTrackDisplay(trackIndex);
    if (this.game) {
      this.game.setTrackBias(trackIndex);
      this.game.setLevel(trackIndex);
    }
    this._highlightTrackEntry(trackIndex);
    this._updateSongTitleDisplay();
    this._updateNames();
  }

  _updateTrackDisplay(trackIndex) {
    const track = this.musicSync.getTrack(trackIndex);
    if (track && this.hudTrack) {
      this.hudTrack.textContent = `${track.trackNum}. ${track.title}`;
    }
  }

  _updateNames() {
    if (!this.hudNames || !this.game) return;
    const names = this.game.getPlayerNames();
    if (this.mode === 'game' && names.length > 0) {
      this.hudNames.textContent = names.join(' & ');
      this.hudNames.style.display = '';
    } else {
      this.hudNames.style.display = 'none';
    }
  }

  _togglePause() {
    if (!this.game) return;
    const paused = this.game.togglePause();
    const pauseBtn = document.getElementById('pause-btn');

    if (paused) {
      if (this.player?.isPlaying) this.player.pause();
      if (pauseBtn) pauseBtn.textContent = '\u25B6';
      this._showPauseOverlay();
    } else {
      if (this.player) this.player.play();
      if (pauseBtn) pauseBtn.textContent = '\u23F8\u23F8';
      this._hidePauseOverlay();
    }
  }

  _showPauseOverlay() {
    if (this.pauseOverlay) return;
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'pause-overlay';
    this.pauseOverlay.innerHTML = '<h2>PAUSED</h2><p>Press SPACE or tap to resume</p>';
    this.pauseOverlay.addEventListener('click', () => this._togglePause());
    document.body.appendChild(this.pauseOverlay);
  }

  _hidePauseOverlay() {
    if (this.pauseOverlay) { this.pauseOverlay.remove(); this.pauseOverlay = null; }
  }

  _buildTrackList() {
    const panel = document.getElementById('track-list-panel');
    const overlay = document.getElementById('track-overlay');
    if (!panel || !overlay) return;

    panel.innerHTML = '';
    for (let i = 0; i < this.musicSync.getTrackCount(); i++) {
      const track = this.musicSync.getTrack(i);
      if (!track) continue;
      const entry = document.createElement('div');
      entry.className = 'track-entry' + (i === 0 ? ' active' : '');
      entry.textContent = `${track.trackNum}. ${track.title}`;
      entry.dataset.index = i;
      entry.addEventListener('click', () => {
        this.player.loadTrack(i).then(() => this.player.play());
        overlay.classList.remove('visible');
      });
      panel.appendChild(entry);
    }

    if (this.hudTrack) {
      this.hudTrack.style.cursor = 'pointer';
      this.hudTrack.addEventListener('click', () => overlay.classList.toggle('visible'));
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('visible');
    });
  }

  _highlightTrackEntry(index) {
    const panel = document.getElementById('track-list-panel');
    if (!panel) return;
    panel.querySelectorAll('.track-entry').forEach((entry, i) => {
      entry.classList.toggle('active', i === index);
    });
  }

  _bindInput() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (this.screen === 'title') {
            this._start();
          } else if (this.game?.paused) {
            this._togglePause();
          } else if (this.mode === 'game') {
            // In two-player: space = player 1 (left side)
            this.game?.jump(0);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (this.mode === 'game') this.game?.jump(0);
          break;
        case 'ArrowRight':
          // In two-player mode: arrow keys = player 2
          if (this.numPlayers === 2 && this.mode === 'game') {
            e.preventDefault();
            this.game?.jump(1);
          }
          break;
        case 'KeyP':
        case 'Escape':
          e.preventDefault();
          if (this.screen === 'main') this._togglePause();
          break;
        case 'Digit1': e.preventDefault(); if (this.screen === 'main') this._switchMode('player'); break;
        case 'Digit2': e.preventDefault(); if (this.screen === 'main') this._switchMode('game'); break;
        case 'Digit3': e.preventDefault(); if (this.screen === 'main') this._switchMode('grid'); break;
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          if (this.game) this.game.adjustSpeed(SPEED_STEP);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          if (this.game) this.game.adjustSpeed(-SPEED_STEP);
          break;
      }
    });

    // Touch handling for two-player
    document.addEventListener('touchstart', (e) => {
      if (this.screen !== 'main' || this.mode !== 'game') return;
      if (e.target.closest('.hud') || e.target.closest('.music-bar') ||
          e.target.closest('.track-overlay') || e.target.closest('.pause-overlay') ||
          e.target.closest('.note-info') || e.target.closest('.overlay')) {
        return;
      }

      e.preventDefault();

      if (this.game?.paused) {
        this._togglePause();
        return;
      }

      if (this.numPlayers === 2) {
        // Two-player: left half = player 1, right half = player 2
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          const mid = window.innerWidth / 2;
          if (touch.clientX < mid) {
            this.game?.jump(0);
          } else {
            this.game?.jump(1);
          }
        }
      } else {
        this.game?.jump(0);
      }
    }, { passive: false });

    // Mouse click for jump
    if (this.canvas) {
      this.canvas.addEventListener('click', () => {
        if (this.screen !== 'main' || this.mode !== 'game') return;
        if (this.game?.paused) {
          this._togglePause();
        } else {
          this.game?.jump(0);
        }
      });
    }
  }
}

// Init
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
