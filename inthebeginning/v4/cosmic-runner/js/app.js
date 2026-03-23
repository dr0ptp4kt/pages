/**
 * Main Application Controller for Cosmic Runner V3.
 *
 * Supports: three modes (player/game/grid) + MIDI mode,
 * two-player cooperative, progressive 3D transition,
 * theme/accessibility settings, player position controls,
 * arrow key + touch + mouse input, settings persistence,
 * restart, help overlay, and comprehensive keyboard mapping.
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
    this.hudSpacetime = null;
    this.noteInfoPanel = null;
    this.noteInfoContent = null;
    this.songTitleDisplay = null;
    this.pauseOverlay = null;

    // Settings
    this.settings = this._loadSettings();

    // MIDI mode
    this.midiMode = false;
    this.midiAvailable = false;
    this.midiPlayer = null;
    this.infiniteMode = false;
    this.currentMutationIndex = 0;
    /** @type {number} Saved JSON track position when entering MIDI mode. */
    this._savedJsonTrack = 0;
    this._savedJsonTime = 0;

    // Input state
    this._dragPlayerIndex = -1;
    this._dragStartX = 0;

    // P2 key states (for continuous movement)
    this._p2LeftHeld = false;
    this._p2RightHeld = false;
    this._p1LeftHeld = false;
    this._p1RightHeld = false;
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
    this.hudSpacetime = document.getElementById('hud-spacetime');
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

    // Restart
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.addEventListener('click', () => this._restart());

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

    // Mute
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', () => {
      if (this.player) {
        this.player.audio.muted = !this.player.audio.muted;
        muteBtn.textContent = this.player.audio.muted ? '\u{1F507}' : '\u{1F50A}';
      }
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
    this._initAccessibilityOverlay();
    this._initSettingsOverlay();
    this._initHelpOverlay();

    // In-game overlay buttons
    const ingameTheme = document.getElementById('ingame-theme-btn');
    const ingameAccess = document.getElementById('ingame-access-btn');
    const ingameHelp = document.getElementById('ingame-help-btn');
    if (ingameTheme) ingameTheme.addEventListener('click', () => this._showOverlay('theme-overlay'));
    if (ingameAccess) ingameAccess.addEventListener('click', () => this._showOverlay('accessibility-overlay'));
    if (ingameHelp) ingameHelp.addEventListener('click', () => this._showOverlay('help-overlay'));

    // Track title and epoch tappable
    if (this.hudTrack) {
      this.hudTrack.style.cursor = 'pointer';
      this.hudTrack.addEventListener('click', () => {
        document.getElementById('track-overlay')?.classList.toggle('visible');
      });
    }
    if (this.hudEpoch) {
      this.hudEpoch.style.cursor = 'pointer';
      this.hudEpoch.addEventListener('click', () => {
        document.getElementById('track-overlay')?.classList.toggle('visible');
      });
    }

    // Game 3D toggle
    const game3DToggle = document.getElementById('game-3d-toggle');
    if (game3DToggle) {
      game3DToggle.checked = !this.settings.game3DDisabled;
      game3DToggle.addEventListener('change', () => {
        this.settings.game3DDisabled = !game3DToggle.checked;
        this._saveSettings();
        if (this.game) this.game.setGame3DDisabled(this.settings.game3DDisabled);
      });
    }

    // Note display toggle
    const noteDisplayToggle = document.getElementById('note-display-toggle');
    if (noteDisplayToggle) {
      noteDisplayToggle.checked = this.settings.showNotes !== false;
      noteDisplayToggle.addEventListener('change', () => {
        this.settings.showNotes = noteDisplayToggle.checked;
        this._saveSettings();
        this._updateNoteInfoVisibility();
      });
    }

    // MIDI mode toggle
    const midiToggle = document.getElementById('midi-mode-toggle');
    if (midiToggle) {
      midiToggle.addEventListener('change', () => {
        this.midiMode = midiToggle.checked;
      });
    }

    // Infinite mode toggle
    const infiniteToggle = document.getElementById('infinite-mode-toggle');
    if (infiniteToggle) {
      infiniteToggle.addEventListener('change', () => {
        this.infiniteMode = infiniteToggle.checked;
      });
    }

    // MIDI skip button
    const midiSkip = document.getElementById('midi-skip');
    if (midiSkip) {
      midiSkip.addEventListener('click', () => this._nextMidi());
    }

    // MIDI mutation button
    const midiMutate = document.getElementById('midi-mutate');
    if (midiMutate) {
      midiMutate.addEventListener('click', () => this._cycleMutation());
    }

    this._bindInput();
    await this._loadMusic();

    // Apply saved settings
    if (this.settings.themeIndex !== undefined) {
      this.themeManager.themeIndex = this.settings.themeIndex;
    }
    if (this.settings.starStyleIndex !== undefined) {
      this.themeManager.starStyleIndex = this.settings.starStyleIndex;
    }
  }

  _showOverlay(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('visible');
    // Pause gameplay when opening overlays in game mode
    if (this.mode === 'game' && this.game && !this.game.paused) {
      this._togglePause();
      this._pausedByOverlay = true;
    }
  }

  _hideOverlay(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('visible');
    // Resume if we paused for overlay
    if (this._pausedByOverlay && this.game?.paused) {
      this._togglePause();
      this._pausedByOverlay = false;
    }
  }

  _initThemeOverlay() {
    const grid = document.getElementById('theme-grid');
    const starGrid = document.getElementById('star-grid');
    const close = document.getElementById('theme-close');
    const overlay = document.getElementById('theme-overlay');

    if (grid) {
      THEMES.forEach((theme, i) => {
        const btn = document.createElement('button');
        btn.className = 'theme-chip' + (i === this.themeManager.themeIndex ? ' selected' : '');
        const a = theme.accent;
        btn.style.borderColor = `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
        btn.textContent = theme.name;
        btn.addEventListener('click', () => {
          grid.querySelectorAll('.theme-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.themeManager.themeIndex = i;
          this.settings.themeIndex = i;
          this._saveSettings();
        });
        grid.appendChild(btn);
      });
    }

    if (starGrid) {
      for (let i = 0; i < Math.min(34, STAR_STYLES.length); i++) {
        const style = STAR_STYLES[i];
        const btn = document.createElement('button');
        btn.className = 'star-chip' + (i === this.themeManager.starStyleIndex ? ' selected' : '');
        // Show symbol + name
        btn.textContent = style.name;
        btn.addEventListener('click', () => {
          starGrid.querySelectorAll('.star-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.themeManager.starStyleIndex = i;
          this.settings.starStyleIndex = i;
          this._saveSettings();
        });
        starGrid.appendChild(btn);
      }
    }

    if (close && overlay) {
      close.addEventListener('click', () => this._hideOverlay('theme-overlay'));
    }

    // Click outside to close
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this._hideOverlay('theme-overlay');
      });
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
        this.settings.accessMode = mode;
        this._saveSettings();
        if (this.game) this.game.setAccessMode(mode);
      });
    });

    if (close && overlay) {
      close.addEventListener('click', () => this._hideOverlay('accessibility-overlay'));
    }
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this._hideOverlay('accessibility-overlay');
      });
    }

    const accessBtn = document.getElementById('accessibility-btn');
    if (accessBtn && overlay) {
      accessBtn.addEventListener('click', () => overlay.classList.toggle('visible'));
    }
  }

  _initSettingsOverlay() {
    const overlay = document.getElementById('settings-overlay');
    const close = document.getElementById('settings-close');
    if (close && overlay) {
      close.addEventListener('click', () => this._hideOverlay('settings-overlay'));
    }
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this._hideOverlay('settings-overlay');
      });
    }
  }

  _initHelpOverlay() {
    const overlay = document.getElementById('help-overlay');
    const close = document.getElementById('help-close');
    if (close && overlay) {
      close.addEventListener('click', () => this._hideOverlay('help-overlay'));
    }
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this._hideOverlay('help-overlay');
      });
    }
  }

  async _loadMusic() {
    // Self-contained: all audio assets live in the local audio/ directory.
    // The album_notes.json index and all MP3/JSON files must be in audio/.
    const loaded = await this.musicSync.loadAlbum('audio/album_notes.json', 'audio/');
    if (loaded) {
      this.musicLoaded = true;
    }

    // Try loading MIDI catalog for MIDI mode.
    // The catalog index lives in audio/ but MIDI files are served from midi/.
    // Try midi/ first (deployed layout), then audio/ (development layout).
    let midiLoaded = await this.musicSync.loadMidiCatalog('midi/midi_catalog.json');
    if (!midiLoaded) {
      midiLoaded = await this.musicSync.loadMidiCatalog('audio/midi_catalog.json');
    }
    this.midiAvailable = midiLoaded;

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

    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === this.mode);
    });

    this._updateGridDimTabs();

    this.game = new Game(this.canvas, this.blastCanvas);
    this.game.mode = this.mode;
    this.game.numPlayers = this.numPlayers;
    this.game.themeManager = this.themeManager;
    this.game.setGame3DDisabled(this.settings.game3DDisabled || false);
    this.game.setAccessMode(this.settings.accessMode || 'normal');

    this.game.onScoreUpdate = (score) => {
      if (this.hudScore) this.hudScore.textContent = score;
    };
    this.game.onEpochChange = (idx, name) => {
      if (this.hudEpoch) this.hudEpoch.textContent = name;
    };
    this.game.onBlast = (count) => {
      this.canvas.style.transform = `translateX(${(Math.random() - 0.5) * 4}px)`;
      setTimeout(() => { this.canvas.style.transform = ''; }, 60);
    };
    this.game.onSpacetimeUpdate = (years) => {
      if (this.hudSpacetime) {
        this.hudSpacetime.textContent = this._formatSpacetime(years);
      }
    };
    this.game.start();

    this.player = new GamePlayer(this.musicSync);
    this.player.bindUI();
    this.player.onTimeUpdate = (time) => this._onMusicTime(time);
    this.player.onTrackChange = (idx) => this._onTrackChange(idx);

    if (this.midiMode && this.midiAvailable) {
      // Start in MIDI mode
      await this._startMidiMode();
    } else if (this.musicLoaded && this.musicSync.getTrackCount() > 0) {
      await this.player.loadTrack(0);
      this.player.play();
      this._updateTrackDisplay(0);
    }

    // In infinite mode with MP3s, auto-advance and shuffle
    if (this.infiniteMode && !this.midiMode && this.player) {
      this.player.audio.addEventListener('ended', () => {
        // Shuffle to a random track
        const count = this.musicSync.getTrackCount();
        let next = Math.floor(Math.random() * count);
        while (next === this.player.currentTrack && count > 1) {
          next = Math.floor(Math.random() * count);
        }
        this.player.loadTrack(next).then(() => this.player.play());
      });
    }

    this._buildTrackList();
    this._updateNoteInfoVisibility();
    this._updateNames();

    // Hide MIDI toggle hint if not available
    if (!this.midiAvailable) {
      const hint = document.getElementById('midi-hint');
      if (hint) hint.textContent = '(not available)';
      const toggle = document.getElementById('midi-mode-toggle');
      if (toggle) toggle.disabled = true;
    }
  }

  _restart() {
    if (this.game) { this.game.destroy(); this.game = null; }
    if (this.player) { this.player.destroy(); this.player = null; }
    this._hidePauseOverlay();

    this.mainScreen.classList.remove('active');
    this.titleScreen.classList.add('active');
    this.screen = 'title';
    document.body.className = '';

    // Reset state
    this.midiMode = false;
    this._savedJsonTrack = 0;
    this._savedJsonTime = 0;
  }

  _switchMode(newMode) {
    if (newMode === this.mode) return;
    const prevMode = this.mode;
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
        this.game.obstacles = new ObstacleManager(this.game.width, this.game.groundY, this.game.height);
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

    // Show/hide score, names, spacetime
    const scoreEl = document.getElementById('hud-score');
    const scoreLabelEl = document.getElementById('hud-score-label');
    const namesEl = document.getElementById('hud-names');
    const spacetimeEl = document.getElementById('hud-spacetime');
    if (scoreEl) scoreEl.style.display = this.mode === 'game' ? '' : 'none';
    if (scoreLabelEl) scoreLabelEl.style.display = this.mode === 'game' ? '' : 'none';
    if (namesEl) namesEl.style.display = this.mode === 'game' ? '' : 'none';
    if (spacetimeEl) spacetimeEl.style.display = this.mode === 'game' ? '' : 'none';

    this._updateNoteInfoVisibility();
    this._updateSongTitleDisplay();
  }

  _updateGridDimTabs() {
    const tabs = document.getElementById('grid-dim-tabs');
    if (tabs) tabs.style.display = this.mode === 'grid' ? '' : 'none';
  }

  _updateNoteInfoVisibility() {
    if (this.noteInfoPanel) {
      const showNotes = this.settings.showNotes !== false;
      const show = showNotes && (this.mode === 'grid' || this.mode === 'player');
      this.noteInfoPanel.classList.toggle('visible', show);
    }
  }

  _updateSongTitleDisplay() {
    if (!this.songTitleDisplay) return;

    if (this.mode === 'player') {
      const trackIdx = this.player?.currentTrack || 0;
      const track = this.musicSync.getTrack(trackIdx);
      if (track) {
        const tc = TRACK_COLORS[trackIdx % TRACK_COLORS.length];
        const color = `rgb(${tc.primary[0]}, ${tc.primary[1]}, ${tc.primary[2]})`;
        // Full title: earth-name — epoch name
        this.songTitleDisplay.textContent = this.musicSync.getFullTitle(trackIdx);
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
      // Show both earth-name and epoch name
      this.hudTrack.textContent = `${track.trackNum}. ${track.title}`;
      this.hudTrack.title = this.musicSync.getFullTitle(trackIndex);
    }
    if (track && this.hudEpoch) {
      this.hudEpoch.textContent = track.epochName;
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
      entry.textContent = `${track.trackNum}. ${track.title} \u2014 ${track.epochName}`;
      entry.dataset.index = i;
      entry.addEventListener('click', () => {
        this.player.loadTrack(i).then(() => this.player.play());
        overlay.classList.remove('visible');
      });
      panel.appendChild(entry);
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

  _formatSpacetime(years) {
    if (years < 1e3) return `${years.toFixed(0)} yr`;
    if (years < 1e6) return `${(years / 1e3).toFixed(1)}E3 yr`;
    if (years < 1e9) return `${(years / 1e6).toFixed(2)}E6 yr`;
    return `${(years / 1e9).toFixed(3)}E9 yr`;
  }

  // ──── MIDI Mode ────

  async _startMidiMode() {
    if (!this.midiAvailable || !this.musicSync.midiCatalog.length) return;

    // Save current MP3 position
    if (this.player) {
      this._savedJsonTrack = this.player.currentTrack;
      this._savedJsonTime = this.player.getCurrentTime();
      this.player.pause();
    }

    // Initialize MIDI player if needed
    if (!this.midiPlayer && typeof MidiPlayer !== 'undefined') {
      this.midiPlayer = new MidiPlayer();
      this.midiPlayer.onNoteEvent = (events) => {
        if (this.game) {
          this.game.setMusicEvents(events, this.musicSync.hueOffset);
          const intensity = events.length > 0 ?
            Math.min(1, events.reduce((s, e) => s + (e.vel || 0.5), 0) / Math.max(1, events.length) * 0.6 + Math.min(1, events.length / 15) * 0.4) : 0.1;
          this.game.setIntensity(intensity);
        }
        this._updateNoteInfo(events);
      };
      this.midiPlayer.onTrackEnd = () => {
        if (this.infiniteMode) this._nextMidi();
      };
    }

    this.musicSync.midiMode = true;
    this._showMidiControls(true);
    await this._nextMidi();
  }

  _stopMidiMode() {
    if (this.midiPlayer) {
      this.midiPlayer.stop();
    }
    this.musicSync.midiMode = false;
    this._showMidiControls(false);
    this._hideMidiInfo();

    // Restore MP3 playback
    if (this.player) {
      this.player.loadTrack(this._savedJsonTrack).then(() => {
        this.player.audio.currentTime = this._savedJsonTime;
        this.player.play();
      });
    }
  }

  async _nextMidi() {
    if (!this.midiPlayer || !this.musicSync.midiCatalog.length) return;

    const midi = this.musicSync.getRandomMidi();
    if (!midi) return;

    const info = this.musicSync.getMidiDisplayInfo(midi);
    this._showMidiInfo(info, midi);

    // Build the MIDI URL
    const midiUrl = this.musicSync.midiBaseUrl + midi.path;

    try {
      const resp = await fetch(midiUrl);
      if (!resp.ok) {
        console.warn('MIDI fetch failed:', midiUrl, resp.status);
        // Try next one
        if (this.infiniteMode) setTimeout(() => this._nextMidi(), 500);
        return;
      }
      const buffer = await resp.arrayBuffer();

      const mutation = MIDI_MUTATIONS[this.currentMutationIndex];
      this.midiPlayer.setMutation(mutation);
      await this.midiPlayer.loadMidi(buffer);
      this.midiPlayer.play();

      // Update media session
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: info.name || 'Classical MIDI',
          artist: info.composer || 'Unknown Composer',
          album: 'In The Beginning — MIDI Library',
        });
      }
    } catch (e) {
      console.warn('MIDI load error:', e);
      if (this.infiniteMode) setTimeout(() => this._nextMidi(), 500);
    }
  }

  _cycleMutation() {
    this.currentMutationIndex = (this.currentMutationIndex + 1) % MIDI_MUTATIONS.length;
    const mutation = MIDI_MUTATIONS[this.currentMutationIndex];
    const nameEl = document.getElementById('midi-mutation-name');
    if (nameEl) nameEl.textContent = mutation.name;

    if (this.midiPlayer) {
      this.midiPlayer.setMutation(mutation);
    }

    // Update provenance display
    const mutEl = document.getElementById('midi-mutation');
    if (mutEl) mutEl.textContent = `Mutation: ${mutation.name}`;
  }

  _showMidiControls(show) {
    const controls = document.getElementById('midi-controls');
    if (controls) controls.style.display = show ? 'flex' : 'none';
  }

  _showMidiInfo(info, midi) {
    const panel = document.getElementById('midi-info');
    const composerEl = document.getElementById('midi-composer');
    const pieceEl = document.getElementById('midi-piece');
    const eraEl = document.getElementById('midi-era');
    const mutEl = document.getElementById('midi-mutation');

    if (composerEl) composerEl.textContent = info.composer || '';
    if (pieceEl) pieceEl.textContent = info.name || '';
    if (eraEl) eraEl.textContent = midi?.era ? `${midi.era} Era` : '';
    if (mutEl) mutEl.textContent = `Mutation: ${MIDI_MUTATIONS[this.currentMutationIndex].name}`;
    if (panel) panel.classList.add('visible');
  }

  _hideMidiInfo() {
    const panel = document.getElementById('midi-info');
    if (panel) panel.classList.remove('visible');
  }

  // ──── Input Handling ────

  _bindInput() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      this._handleKeyDown(e);
    });

    document.addEventListener('keyup', (e) => {
      this._handleKeyUp(e);
    });

    // Touch handling
    this.canvas?.addEventListener('touchstart', (e) => this._handleTouchStart(e), { passive: false });
    this.canvas?.addEventListener('touchmove', (e) => this._handleTouchMove(e), { passive: false });
    this.canvas?.addEventListener('touchend', (e) => this._handleTouchEnd(e), { passive: false });

    // Mouse handling
    this.canvas?.addEventListener('mousedown', (e) => this._handleMouseDown(e));
    this.canvas?.addEventListener('mousemove', (e) => this._handleMouseMove(e));
    this.canvas?.addEventListener('mouseup', (e) => this._handleMouseUp(e));

    // Continuous movement tick
    this._movementInterval = setInterval(() => this._handleContinuousMovement(), 16);
  }

  _handleKeyDown(e) {
    switch (e.code) {
      // ──── Player 1 Controls ────
      case 'Space':
        e.preventDefault();
        if (this.screen === 'title') { this._start(); }
        else if (this.game?.paused) { this._togglePause(); }
        else if (this.mode === 'game') { this.game?.jump(0); }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (this.mode === 'game') this.game?.jump(0);
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (this.mode === 'game') this.game?.fastDrop(0);
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (this.mode === 'game') {
          this._p1LeftHeld = true;
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (this.mode === 'game') {
          this._p1RightHeld = true;
        }
        break;

      // ──── Player 2 Controls (WASD) ────
      case 'KeyW':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this.game?.jump(1);
        }
        break;

      case 'KeyS':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this.game?.fastDrop(1);
        }
        break;

      case 'KeyA':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this._p2LeftHeld = true;
        }
        break;

      case 'KeyD':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this._p2RightHeld = true;
        }
        break;

      // ──── Player 2 Alt Controls (Numpad) ────
      case 'Numpad8':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this.game?.jump(1);
        }
        break;

      case 'Numpad5':
      case 'Numpad2':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this.game?.fastDrop(1);
        }
        break;

      case 'Numpad4':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this._p2LeftHeld = true;
        }
        break;

      case 'Numpad6':
        if (this.numPlayers === 2 && this.mode === 'game') {
          e.preventDefault();
          this._p2RightHeld = true;
        }
        break;

      // ──── General Controls ────
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
  }

  _handleKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft': this._p1LeftHeld = false; break;
      case 'ArrowRight': this._p1RightHeld = false; break;
      case 'KeyA': this._p2LeftHeld = false; break;
      case 'KeyD': this._p2RightHeld = false; break;
      case 'Numpad4': this._p2LeftHeld = false; break;
      case 'Numpad6': this._p2RightHeld = false; break;
    }
  }

  _handleContinuousMovement() {
    if (!this.game || this.mode !== 'game' || this.game.paused) return;
    const moveSpeed = 0.005; // fraction per tick
    if (this._p1LeftHeld) this.game.movePlayer(0, -moveSpeed);
    if (this._p1RightHeld) this.game.movePlayer(0, moveSpeed);
    if (this._p2LeftHeld) this.game.movePlayer(1, -moveSpeed);
    if (this._p2RightHeld) this.game.movePlayer(1, moveSpeed);
  }

  // ──── Touch Handling ────

  _handleTouchStart(e) {
    if (this.screen !== 'main') return;
    if (e.target.closest('.hud') || e.target.closest('.music-bar') ||
        e.target.closest('.track-overlay') || e.target.closest('.pause-overlay') ||
        e.target.closest('.note-info') || e.target.closest('.overlay')) return;

    e.preventDefault();

    if (this.game?.paused) { this._togglePause(); return; }

    if (this.mode !== 'game') return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      // Check if touching a runner (for drag)
      const runnerIdx = this.game.getRunnerAtPosition(touch.clientX, touch.clientY);
      if (runnerIdx >= 0) {
        this._dragPlayerIndex = runnerIdx;
        this._dragStartX = touch.clientX;
        touch._dragId = touch.identifier;
        return;
      }

      // Otherwise: jump
      if (this.numPlayers === 2) {
        const mid = window.innerWidth / 2;
        this.game.jump(touch.clientX < mid ? 0 : 1);
      } else {
        this.game.jump(0);
      }
    }
  }

  _handleTouchMove(e) {
    if (this._dragPlayerIndex < 0) return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const fraction = touch.clientX / window.innerWidth;
      this.game.setPlayerPosition(this._dragPlayerIndex, fraction);
    }
  }

  _handleTouchEnd(e) {
    // Check for swipe down (fast drop)
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // If it was a drag, end it
      if (this._dragPlayerIndex >= 0) {
        this._dragPlayerIndex = -1;
        return;
      }
    }
    this._dragPlayerIndex = -1;
  }

  // ──── Mouse Handling ────

  _handleMouseDown(e) {
    if (this.screen !== 'main' || this.mode !== 'game') return;

    if (this.game?.paused) { this._togglePause(); return; }

    // Check if clicking on a runner (for drag)
    const runnerIdx = this.game?.getRunnerAtPosition(e.clientX, e.clientY);
    if (runnerIdx >= 0) {
      this._dragPlayerIndex = runnerIdx;
      this._dragStartX = e.clientX;
      return;
    }

    // Otherwise: jump (mouse acts as P2 jump in 2-player, P1 in 1-player)
    if (this.numPlayers === 2) {
      this.game?.jump(1); // Mouse = P2 jump in 2-player
    } else {
      this.game?.jump(0);
    }
  }

  _handleMouseMove(e) {
    if (this._dragPlayerIndex < 0) return;
    const fraction = e.clientX / window.innerWidth;
    this.game?.setPlayerPosition(this._dragPlayerIndex, fraction);
  }

  _handleMouseUp(e) {
    this._dragPlayerIndex = -1;
  }

  // ──── Settings Persistence ────

  _loadSettings() {
    try {
      const s = localStorage.getItem('cosmicRunnerV3Settings');
      return s ? JSON.parse(s) : {};
    } catch (e) { return {}; }
  }

  _saveSettings() {
    try {
      localStorage.setItem('cosmicRunnerV3Settings', JSON.stringify(this.settings));
    } catch (e) { /* ignore */ }
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
