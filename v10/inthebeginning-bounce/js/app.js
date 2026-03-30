/**
 * Main Application Controller for inthebeginning bounce V6.
 *
 * V6 features:
 * - Three sound modes via dropdown: MP3, MIDI Library, Synth Generator
 * - Mutation modal for MIDI/Synth mutation selection
 * - Style sliders for synth generation (speed, arpeggio, chords, bending)
 * - Unified player controls across all sound modes
 * - Objects come from top in game mode
 * - No player-pushing collision — just clamp
 * - Infinite play for all modes (album repeat, MIDI shuffle, synth loop)
 * - Game completion screen after 12 album tracks (non-infinite)
 * - P1=Arrows/WASD, P2=IJKL/Numpad (right-side keys)
 * - Theme colors affect game visuals
 * - Pause stops both gameplay and music
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
    this.infiniteMode = true;

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
    this.midiInfoPanel = null;

    // Settings
    this.settings = this._loadSettings();

    // Sound mode
    this.soundMode = this.settings.soundMode || 'mp3';
    this.currentMutationIndex = 0;

    // Input state
    this._dragPlayerIndex = -1;
    this._dragStartX = 0;
    this._p2LeftHeld = false;
    this._p2RightHeld = false;
    this._p1LeftHeld = false;
    this._p1RightHeld = false;
    this._pausedByOverlay = false;
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
    this.midiInfoPanel = document.getElementById('midi-info');

    // Mode buttons
    const playerCountRow = document.querySelector('.player-count-select');
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.mode = btn.dataset.mode;
        // Hide player count for non-game modes
        if (playerCountRow) {
          playerCountRow.style.display = this.mode === 'game' ? '' : 'none';
        }
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
      if (this.player) this.player.adjustSpeed(-SPEED_STEP);
    });
    if (speedUp) speedUp.addEventListener('click', () => {
      if (this.game) this.game.adjustSpeed(SPEED_STEP);
      if (this.player) this.player.adjustSpeed(SPEED_STEP);
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

    // Overlays
    this._initThemeOverlay();
    this._initAccessibilityOverlay();
    this._initHelpOverlay();
    this._initMutationOverlay();
    this._initStyleOverlay();

    // In-game overlay buttons
    const ingameTheme = document.getElementById('ingame-theme-btn');
    const ingameAccess = document.getElementById('ingame-access-btn');
    const ingameHelp = document.getElementById('ingame-help-btn');
    const mutationBtn = document.getElementById('mutation-btn');
    const styleBtn = document.getElementById('style-btn');

    if (ingameTheme) ingameTheme.addEventListener('click', () => this._showOverlay('theme-overlay'));
    if (ingameAccess) ingameAccess.addEventListener('click', () => this._showOverlay('accessibility-overlay'));

    // Title screen theme/accessibility buttons
    const titleTheme = document.getElementById('theme-btn');
    const titleAccess = document.getElementById('accessibility-btn');
    if (titleTheme) titleTheme.addEventListener('click', () => this._showOverlay('theme-overlay'));
    if (titleAccess) titleAccess.addEventListener('click', () => this._showOverlay('accessibility-overlay'));
    const creditsBtn = document.getElementById('credits-btn');
    const creditsClose = document.getElementById('credits-close');
    if (creditsBtn) creditsBtn.addEventListener('click', () => this._showOverlay('credits-overlay'));
    if (creditsClose) creditsClose.addEventListener('click', () => this._hideOverlay('credits-overlay'));
    if (ingameHelp) ingameHelp.addEventListener('click', () => { this._updateHelpSections(); this._showOverlay('help-overlay'); });
    if (mutationBtn) mutationBtn.addEventListener('click', () => this._showOverlay('mutation-overlay'));
    if (styleBtn) styleBtn.addEventListener('click', () => this._showOverlay('style-overlay'));

    // Instrument selection
    const instrumentBtn = document.getElementById('instrument-btn');
    const instrumentClose = document.getElementById('instrument-close');
    if (instrumentBtn) instrumentBtn.addEventListener('click', () => {
      this._populateInstrumentGrid();
      this._showOverlay('instrument-overlay');
    });
    if (instrumentClose) instrumentClose.addEventListener('click', () => this._hideOverlay('instrument-overlay'));

    // Track title tappable — show track list in MP3, MIDI info in MIDI/Synth
    if (this.hudTrack) {
      this.hudTrack.addEventListener('click', () => {
        if (this.soundMode === 'mp3') {
          document.getElementById('track-overlay')?.classList.toggle('visible');
        } else {
          // For MIDI/Synth/WASM: show the MIDI info panel as a modal-like display
          const midiPanel = document.getElementById('midi-info');
          if (midiPanel) midiPanel.classList.toggle('visible');
        }
      });
    }
    if (this.hudEpoch) {
      this.hudEpoch.addEventListener('click', () => {
        if (this.soundMode === 'mp3') {
          document.getElementById('track-overlay')?.classList.toggle('visible');
        }
      });
    }

    // Song title display tappable
    if (this.songTitleDisplay) {
      this.songTitleDisplay.addEventListener('click', () => {
        if (this.soundMode === 'mp3') {
          document.getElementById('track-overlay')?.classList.toggle('visible');
        }
      });
    }

    // Track close button
    const trackClose = document.getElementById('track-close');
    if (trackClose) {
      trackClose.addEventListener('click', () => {
        document.getElementById('track-overlay')?.classList.remove('visible');
      });
    }

    // Enable click-outside-to-close for all overlays
    this._initOverlayBackdropClose();

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

    // Sound mode selector
    const soundModeSelect = document.getElementById('sound-mode-select');
    if (soundModeSelect) {
      soundModeSelect.value = this.soundMode;
      soundModeSelect.addEventListener('change', (e) => {
        this.soundMode = e.target.value;
        this.settings.soundMode = this.soundMode;
        this._saveSettings();
      });
    }

    // Infinite mode toggle
    const infiniteToggle = document.getElementById('infinite-mode-toggle');
    if (infiniteToggle) {
      infiniteToggle.checked = this.infiniteMode;
      infiniteToggle.addEventListener('change', () => {
        this.infiniteMode = infiniteToggle.checked;
        if (this.player) this.player.infiniteMode = this.infiniteMode;
      });
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

  // ──── Overlay Management ────

  _showOverlay(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('visible');
    if (this.mode === 'game' && this.game && !this.game.paused) {
      this._togglePause();
      this._pausedByOverlay = true;
    }
  }

  _hideOverlay(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('visible');
    if (this._pausedByOverlay && this.game?.paused) {
      this._togglePause();
      this._pausedByOverlay = false;
    }
  }

  /**
   * Enable click-outside-to-close for all overlay elements.
   * Clicking the overlay backdrop (not the inner panel) closes the overlay.
   */
  _initOverlayBackdropClose() {
    // Standard overlays (theme, accessibility, help, mutation, style)
    document.querySelectorAll('.overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        // Only close if user clicked the backdrop, not the inner panel
        if (e.target === overlay) {
          this._hideOverlay(overlay.id);
        }
      });
    });

    // Track overlay (uses .track-overlay class)
    const trackOverlay = document.getElementById('track-overlay');
    if (trackOverlay) {
      trackOverlay.addEventListener('click', (e) => {
        if (e.target === trackOverlay) {
          trackOverlay.classList.remove('visible');
        }
      });
    }

    // Escape key closes any visible overlay
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._closeAllOverlays();
      }
    });
  }

  /** Close all visible overlays. */
  _closeAllOverlays() {
    const overlayIds = [
      'theme-overlay', 'accessibility-overlay', 'help-overlay',
      'mutation-overlay', 'style-overlay', 'track-overlay', 'credits-overlay',
      'instrument-overlay',
    ];
    for (const id of overlayIds) {
      const el = document.getElementById(id);
      if (el && el.classList.contains('visible')) {
        if (id === 'track-overlay') {
          el.classList.remove('visible');
        } else {
          this._hideOverlay(id);
        }
      }
    }
  }

  // ──── Theme Overlay ────

  _initThemeOverlay() {
    const grid = document.getElementById('theme-grid');
    const starGrid = document.getElementById('star-grid');
    const close = document.getElementById('theme-close');

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

    if (close) close.addEventListener('click', () => this._hideOverlay('theme-overlay'));
  }

  // ──── Accessibility Overlay ────

  _initAccessibilityOverlay() {
    const close = document.getElementById('access-close');
    if (close) close.addEventListener('click', () => this._hideOverlay('accessibility-overlay'));

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
  }

  // ──── Help Overlay ────

  _initHelpOverlay() {
    const close = document.getElementById('help-close');
    if (close) close.addEventListener('click', () => this._hideOverlay('help-overlay'));
  }

  _updateHelpSections() {
    const gameSection = document.getElementById('help-game-section');
    const twoPlayerSection = document.getElementById('help-2p-section');
    const scoringSection = document.getElementById('help-scoring-section');
    const playerSection = document.getElementById('help-player-section');
    const gridSection = document.getElementById('help-grid-section');

    const isGame = this.mode === 'game';
    const isPlayer = this.mode === 'player';
    const isGrid = this.mode === 'grid';
    const is2P = this.numPlayers === 2;

    if (gameSection) gameSection.style.display = isGame ? '' : 'none';
    if (twoPlayerSection) twoPlayerSection.style.display = (isGame && is2P) ? '' : 'none';
    if (scoringSection) scoringSection.style.display = isGame ? '' : 'none';
    if (playerSection) playerSection.style.display = (isPlayer || isGrid) ? '' : 'none';
    if (gridSection) gridSection.style.display = isGrid ? '' : 'none';
  }

  // ──── Mutation Modal ────

  _initMutationOverlay() {
    const grid = document.getElementById('mutation-grid');
    const close = document.getElementById('mutation-close');

    if (grid) {
      MIDI_MUTATIONS.forEach((mutation, i) => {
        const btn = document.createElement('button');
        btn.className = 'mutation-chip' + (i === this.currentMutationIndex ? ' selected' : '');
        btn.textContent = mutation.name;
        btn.dataset.index = i;
        btn.addEventListener('click', () => {
          grid.querySelectorAll('.mutation-chip').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          this.currentMutationIndex = i;
          this._applyMutation(i);
        });
        grid.appendChild(btn);
      });
    }

    if (close) close.addEventListener('click', () => this._hideOverlay('mutation-overlay'));
  }

  // ──── Instrument Selection ────

  _populateInstrumentGrid() {
    const grid = document.getElementById('instrument-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Instrument families with their default-enabled status
    const families = [
      { id: 'piano', name: 'Piano', emoji: '🎹', default: true },
      { id: 'strings', name: 'Strings', emoji: '🎻', default: true },
      { id: 'winds', name: 'Winds', emoji: '🎵', default: true },
      { id: 'brass', name: 'Brass', emoji: '🎺', default: true },
      { id: 'percussion', name: 'Percussion', emoji: '🥁', default: true },
      { id: 'organ', name: 'Organ', emoji: '⛪', default: true },
      { id: 'voice', name: 'Voice/Choir', emoji: '🎤', default: false },
      { id: 'world', name: 'World', emoji: '🌍', default: true },
      { id: 'synth', name: 'Synth Pads', emoji: '🔊', default: true },
      { id: 'bass', name: 'Bass', emoji: '🎸', default: true },
    ];

    // Load saved preferences
    if (!this._instrumentPrefs) {
      this._instrumentPrefs = {};
      families.forEach(f => { this._instrumentPrefs[f.id] = f.default; });
    }

    for (const fam of families) {
      const btn = document.createElement('button');
      const enabled = this._instrumentPrefs[fam.id] !== false;
      btn.className = 'instrument-chip' + (enabled ? ' enabled' : '');
      btn.textContent = `${fam.emoji} ${fam.name}`;
      btn.addEventListener('click', () => {
        this._instrumentPrefs[fam.id] = !this._instrumentPrefs[fam.id];
        btn.classList.toggle('enabled');
        this._applyInstrumentPrefs();
      });
      grid.appendChild(btn);
    }
  }

  _applyInstrumentPrefs() {
    // Tell SynthEngine which families to disable
    if (this.player?._synth?.sampleBank) {
      const bank = this.player._synth.sampleBank;
      if (bank.setDisabledFamilies) {
        const disabled = Object.entries(this._instrumentPrefs)
          .filter(([, v]) => !v)
          .map(([k]) => k);
        bank.setDisabledFamilies(disabled);
      }
    }
  }

  _applyMutation(index) {
    const mutation = MIDI_MUTATIONS[index];
    if (!mutation) return;
    if (this.player) {
      // Use the unified setMutation which applies to both MIDI and synth paths.
      // IMPORTANT: midiPlayer.setMutation internally calls _synth.setMutation,
      // so we must NOT also call _synth.setMutation separately — double-setting
      // the filter causes audio glitches that break mutations after 1-2 switches.
      this.player.setMutation(mutation);
    }
    // Update MIDI info display
    const mutEl = document.getElementById('midi-mutation');
    if (mutEl) mutEl.textContent = mutation.name !== 'Original' ? `Mutation: ${mutation.name}` : '';
  }

  // ──── Style Overlay ────

  _initStyleOverlay() {
    const close = document.getElementById('style-close');
    if (close) close.addEventListener('click', () => this._hideOverlay('style-overlay'));

    const speedSlider = document.getElementById('style-speed');
    const arpeggioSlider = document.getElementById('style-arpeggio');
    const chordsSlider = document.getElementById('style-chords');
    const bendSlider = document.getElementById('style-bend');

    const speedVal = document.getElementById('style-speed-val');
    const arpeggioVal = document.getElementById('style-arpeggio-val');
    const chordsVal = document.getElementById('style-chords-val');
    const bendVal = document.getElementById('style-bend-val');

    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        if (speedVal) speedVal.textContent = `${(v / 100).toFixed(1)}x`;
        if (this.player?.musicGenerator) {
          this.player.musicGenerator.speed = v / 100;
        }
      });
    }

    if (arpeggioSlider) {
      arpeggioSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        if (arpeggioVal) arpeggioVal.textContent = `${v}%`;
        if (this.player?.musicGenerator) {
          this.player.musicGenerator.arpeggioAmount = v / 100;
        }
      });
    }

    if (chordsSlider) {
      chordsSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        if (chordsVal) chordsVal.textContent = `${v}%`;
        if (this.player?.musicGenerator) {
          this.player.musicGenerator.chordDensity = v / 100;
        }
      });
    }

    if (bendSlider) {
      bendSlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        if (bendVal) bendVal.textContent = `${v}%`;
        if (this.player?.musicGenerator) {
          this.player.musicGenerator.bendAmount = v / 100;
        }
      });
    }
  }

  // ──── Music Loading ────

  async _loadMusic() {
    // Album JSON locations (where album.json lives)
    const albumJsonPaths = [
      'audio/album.json',
      '../../shared/audio/tracks/album.json',
      '../../shared/audio/metadata/v1/album.json',
      '../shared/audio/tracks/album.json',
    ];
    // Audio base URLs (where the MP3 files live)
    const audioBases = [
      'audio/',
      '../../shared/audio/tracks/',
      '../shared/audio/tracks/',
    ];

    // Load album.json from the first available location
    let albumData = null;
    for (const path of albumJsonPaths) {
      try {
        const resp = await fetch(path);
        if (resp.ok) {
          albumData = await resp.json();
          break;
        }
      } catch (e) { /* try next */ }
    }

    if (!albumData) return;

    // Find the correct audio base URL by checking if the first track MP3 exists
    const firstTrack = (albumData.tracks || [])[0];
    const mp3File = firstTrack?.audio_file || firstTrack?.file;
    let audioBase = 'audio/';

    if (mp3File) {
      for (const base of audioBases) {
        try {
          const resp = await fetch(base + mp3File, { method: 'HEAD' });
          if (resp.ok) {
            audioBase = base;
            break;
          }
        } catch (e) { /* try next */ }
      }
    }

    // Now load the album with the correct audio base URL
    try {
      // Re-load via MusicSync with the verified audio base
      for (const path of albumJsonPaths) {
        try {
          const loaded = await this.musicSync.loadAlbum(path, audioBase);
          if (loaded) {
            this.musicLoaded = true;
            break;
          }
        } catch (e) { /* try next */ }
      }
    } catch (e) { /* album load failed */ }

    // Load MIDI catalog (prefer shared midi/ dir so base URL resolves to MIDI files)
    const midiPaths = [
      '../../shared/audio/midi/midi_catalog.json',
      '../shared/audio/midi/midi_catalog.json',
      '../../shared/audio/metadata/v1/midi_catalog.json',
      '../shared/audio/metadata/v1/midi_catalog.json',
      'audio/midi_catalog.json',
    ];

    for (const path of midiPaths) {
      try {
        const loaded = await this.musicSync.loadMidiCatalog(path);
        if (loaded) break;
      } catch (e) { /* try next */ }
    }
  }

  // ──── Start / Restart ────

  async _start() {
    this.titleScreen.classList.remove('active');
    this.mainScreen.classList.add('active');
    this.screen = 'main';

    // Set body class for mode-specific CSS
    document.body.className = `mode-${this.mode}`;

    // Create game
    this.game = new Game(this.canvas, this.blastCanvas);
    this.game.numPlayers = this.numPlayers;
    this.game.themeManager = this.themeManager;
    this.game.setAccessMode(this.settings.accessMode || 'normal');
    this.game.setGame3DDisabled(this.settings.game3DDisabled || false);

    // Set mode
    this.game.setMode(this.mode);
    if (this.mode === 'grid') {
      document.getElementById('grid-dim-tabs').style.display = 'flex';
    }

    // Callbacks
    this.game.onScoreUpdate = (score) => {
      if (this.hudScore) this.hudScore.textContent = score;
    };
    this.game.onEpochChange = (idx, name) => {
      if (this.hudEpoch) this.hudEpoch.textContent = name;
    };
    this.game.onSpacetimeUpdate = (years) => {
      if (this.hudSpacetime) {
        this.hudSpacetime.textContent = this._formatSpacetime(years);
      }
    };

    this.game.start();

    // Create unified player
    this.player = new GamePlayer(this.musicSync);
    this.player.bindUI();

    // Set sound mode
    this.player.setMode(this.soundMode);
    this.player.infiniteMode = this.infiniteMode;

    // Player callbacks
    this.player.onTrackChange = (trackIndex) => this._onTrackChange(trackIndex);
    this.player.onTimeUpdate = (time) => this._onTimeUpdate(time);
    this.player.onNoteEvent = (events) => this._onNoteEvent(events);
    this.player.onTrackEnded = async (trackIndex) => {
      if (this.musicSync.shouldPlayInterstitial(trackIndex)) {
        await this._playInterstitial();
      }
    };
    this.player.onGameComplete = () => this._onGameComplete();

    // Start playing based on mode
    await this._initSoundMode();

    // Update HUD
    this._updateModeTabs();
    this._updatePlayerNames();
    this._buildTrackList();
    this._updateNoteInfoVisibility();
  }

  async _initSoundMode() {
    switch (this.soundMode) {
      case 'midi': {
        const midiBase = this.musicSync.midiBaseUrl || 'audio/midi_library/';
        const ok = await this.player.startMidiMode(
          midiBase + 'midi_catalog.json',
          midiBase
        );
        // Auto-play: start from beginning after loading
        if (ok) {
          this.player.midiPlayer.seek(0);
          await this.player.play();
        }
        break;
      }
      case 'synth':
        this.player.musicGenerator.seed = Date.now();
        this.player.musicGenerator.generate();
        await this.player.play();
        break;
      case 'wasm': {
        // Approach C: WASM mode uses compositional generation (like Python RadioEngine)
        // instead of raw MIDI playback. Notes are generated by MusicGenerator
        // (rondo patterns, consonance engine, epoch orchestration) and rendered
        // through the WASM synth for sample-level quality.
        const wasmUrl = 'js/wasm_synth_bg.wasm';
        // Initialize WASM binary (for AudioWorklet synthesis)
        if (this.player.wasmSynth) {
          await this.player.wasmSynth.initWasm(wasmUrl);
          await this.player.wasmSynth.initAudio();
        }
        // Use MusicGenerator for compositional note generation
        this.player.setMode(AUDIO_MODE.WASM);
        this.player.musicGenerator.seed = Date.now();
        this.player.musicGenerator.generate();
        // Wire the synth: WASM mode uses the shared SynthEngine for note playback
        // (WASM AudioWorklet handles sample-level rendering if available,
        // otherwise SynthEngine does additive/sample-based synthesis)
        this.player.musicGenerator._synth = this.player._synth;
        await this.player.play();
        break;
      }
      case 'mp3':
      default:
        if (this.musicLoaded && this.musicSync.tracks.length > 0) {
          await this.player.loadMp3Track(0);
          await this.player.play();
        }
        break;
    }
  }

  _restart() {
    // Stop all audio before returning to title
    if (this.player) {
      this.player.pause();
      this.player.destroy();
    }
    if (this.game) this.game.destroy();
    // Suspend audio context to fully silence
    if (this.musicSync?.audioElement) {
      this.musicSync.audioElement.pause();
      this.musicSync.audioElement.currentTime = 0;
    }
    this.game = null;
    this.player = null;
    this.mainScreen.classList.remove('active');
    this.titleScreen.classList.add('active');
    this.screen = 'title';
  }

  // ──── Mode Switching ────

  _switchMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    document.body.className = `mode-${mode}`;

    // Update tab UI
    document.querySelectorAll('.tab-btn').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === mode);
    });

    // Grid dim tabs: visible in grid and game modes, hidden in player
    const gridDimTabs = document.getElementById('grid-dim-tabs');
    if (gridDimTabs) {
      gridDimTabs.style.display = (mode === 'grid' || mode === 'game') ? 'flex' : 'none';
    }

    // Mode-aware HUD: hide speed/mutation/style buttons in player mode
    const hideInPlayer = ['speed-down', 'speed-up', 'mutation-btn', 'style-btn'];
    hideInPlayer.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = mode === 'player' ? 'none' : '';
    });

    if (this.game) {
      this.game.setMode(mode);
      if (mode === 'game' && !this.game.obstacles) {
        this.game._initRunners();
        this.game.obstacles = new ObstacleManager(this.game.width, this.game.groundY, this.game.height);
        this.game.obstacles.setLevel(this.game.currentLevel);
      }
    }

    // Show/hide song title for player mode
    if (this.songTitleDisplay) {
      this.songTitleDisplay.classList.toggle('visible', mode === 'player');
    }

    this._updateNoteInfoVisibility();
  }

  // ──── Pause ────

  _togglePause() {
    if (!this.game) return;
    const paused = this.game.togglePause();
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.textContent = paused ? '\u25B6' : '\u23F8\u23F8';
    // Also pause/resume music when gameplay pauses/resumes
    if (this.player) {
      if (paused) {
        this.player.pause();
      } else {
        this.player.play();
      }
    }
  }

  // ──── Track Change ────

  _onTrackChange(trackIndex) {
    if (trackIndex >= 0 && trackIndex < this.musicSync.tracks.length) {
      // MP3 mode: use album track metadata
      const title = this.musicSync.getFullTitle(trackIndex);
      if (this.hudTrack) this.hudTrack.textContent = title;
      if (this.songTitleDisplay) {
        this.songTitleDisplay.textContent = title;
        this.songTitleDisplay.style.color = '';
      }

      if (this.game) {
        this.game.setLevel(trackIndex);
        this.game.setTrackBias(trackIndex);
      }

      this._updateTrackListHighlight(trackIndex);
    } else if (this.soundMode === 'midi' || this.soundMode === 'synth') {
      // MIDI/Synth mode: advance level based on internal track counter
      this._midiSynthTrackCount = (this._midiSynthTrackCount || 0) + 1;
      const level = this._midiSynthTrackCount % 12;

      // Update HUD title for MIDI/Synth
      if (this.soundMode === 'midi') {
        const info = this.player?.midiPlayer?.trackInfo;
        const title = info ? `${info.composer || 'Unknown'} — ${info.name || 'MIDI'}` : 'MIDI';
        if (this.hudTrack) this.hudTrack.textContent = title;
        if (this.songTitleDisplay) this.songTitleDisplay.textContent = title;
      } else {
        const trackName = this.player?.musicGenerator?.getCurrentTrackName() || 'Synth';
        if (this.hudTrack) this.hudTrack.textContent = trackName;
        if (this.songTitleDisplay) this.songTitleDisplay.textContent = trackName;
      }

      if (this.game) {
        this.game.setLevel(level);
        this.game.setTrackBias(level);
      }
    }

    // Update ID3 info near play controls
    this._updateId3Display(trackIndex);

    // Update MIDI info panel
    this._updateMidiInfo();
  }

  _onTimeUpdate(time) {
    if (!this.musicSync) return;
    const duration = this.player?.getDuration() || 0;

    if (duration > 0) {
      const progress = time / duration;

      // Music events for game/grid visualization
      const events = this.musicSync.getActiveEvents(time);
      const intensity = events.length > 0
        ? events.reduce((s, e) => s + (e.vel || 0.5), 0) / events.length
        : 0.1;

      if (this.game) {
        this.game.setMusicEvents(events, this.musicSync.hueOffset);
        this.game.setIntensity(intensity);
        this.game.setTrackProgress(progress, duration);

        const epoch = this.musicSync.getEpoch(time, duration);
        this.game.setEpoch(epoch.index, epoch.name);
      }

      // Update note info panel for MP3 mode (MIDI/synth use _onNoteEvent)
      if (this.soundMode === 'mp3' && this.settings.showNotes !== false &&
          this.noteInfoContent && events.length > 0) {
        const info = this.musicSync.getNoteInfo(events);
        const tags = info.map(n =>
          `<span class="note-tag"><span class="note-pitch">${n.pitch}</span> <span class="note-inst">${n.inst}</span></span>`
        );

        // Show MIDI source from v4 note data (if loaded)
        const midiSources = new Set();
        for (const e of events) {
          // events from MP3 mode are compact arrays: [t, dur, note, instIdx, vel, ch, midi_source]
          const src = Array.isArray(e) ? e[6] : e.midi_source;
          if (src) midiSources.add(src);
        }
        if (midiSources.size > 0) {
          const srcTags = [...midiSources].map(s => {
            const parts = s.split('/');
            const composer = parts.length >= 2 ? parts[0] : '';
            const piece = parts[parts.length - 1].replace('.mid', '').replace(/^adl_/, '').replace(/_/g, ' ');
            return `<span class="note-tag midi-source-tag">${composer}: ${piece}</span>`;
          });
          tags.push(...srcTags);
        }

        // Show effects from v4 note data
        for (const e of events) {
          const fx = Array.isArray(e) ? null : e.effects;
          if (fx) {
            const parts = [];
            if (fx.tempo_mult && fx.tempo_mult !== 1) parts.push(`tempo ${fx.tempo_mult}x`);
            if (fx.reverb > 0) parts.push(`reverb ${Math.round(fx.reverb * 100)}%`);
            if (fx.scale) parts.push(fx.scale);
            if (parts.length > 0) {
              tags.push(`<span class="note-tag effects-tag">${parts.join(' · ')}</span>`);
            }
            break; // Only need one effects tag
          }
        }

        this.noteInfoContent.innerHTML = tags.join('');
      }

      this.musicSync.updateHue(time);
    }
  }

  _onNoteEvent(events) {
    // Forward note events to game for grid visualization
    if (this.game && events.length > 0) {
      this.game.setMusicEvents(events, this.musicSync.hueOffset);
      const avgVel = events.reduce((s, e) => s + (e.vel || 0.5), 0) / events.length;
      this.game.setIntensity(avgVel);
    }

    // Update note info panel
    if (this.settings.showNotes !== false && this.noteInfoContent && events.length > 0) {
      const info = this.musicSync.getNoteInfo(events);
      // Build note tags with MIDI source if available
      const tags = info.map(n => {
        let tag = `<span class="note-tag"><span class="note-pitch">${n.pitch}</span> <span class="note-inst">${n.inst}</span></span>`;
        return tag;
      });

      // Show MIDI source if events have it (WASM/Synth may include motif info)
      const midiSources = new Set();
      for (const e of events) {
        if (e.midi_source) midiSources.add(e.midi_source);
      }
      if (midiSources.size > 0) {
        const srcTags = [...midiSources].map(s => {
          const parts = s.split('/');
          const composer = parts.length >= 2 ? parts[0] : 'Unknown';
          const piece = parts[parts.length - 1].replace('.mid', '').replace(/^adl_/, '').replace(/_/g, ' ');
          return `<span class="note-tag midi-source-tag">${composer}: ${piece}</span>`;
        });
        tags.push(...srcTags);
      }

      // Show active effects
      const mutation = this.player?._synth?._mutation;
      if (mutation && (mutation.reverb > 0 || mutation.filter !== 'none' || mutation.pitchShift !== 0)) {
        const fx = [];
        if (mutation.reverb > 0) fx.push(`reverb ${Math.round(mutation.reverb * 100)}%`);
        if (mutation.filter !== 'none') fx.push(mutation.filter);
        if (mutation.pitchShift !== 0) fx.push(`pitch ${mutation.pitchShift > 0 ? '+' : ''}${mutation.pitchShift}`);
        if (fx.length > 0) {
          tags.push(`<span class="note-tag effects-tag">${fx.join(' · ')}</span>`);
        }
      }

      this.noteInfoContent.innerHTML = tags.join('');
    }
  }

  // ──── ID3 Display ────

  _updateId3Display(trackIndex) {
    const titleEl = document.getElementById('id3-title');
    const artistEl = document.getElementById('id3-artist');
    const albumEl = document.getElementById('id3-album-info');

    if (this.soundMode === 'mp3' && this.musicSync) {
      const id3 = this.musicSync.getTrackId3(trackIndex);
      if (titleEl) titleEl.textContent = id3.title || '';
      if (artistEl) artistEl.textContent = id3.artist || '';
      if (albumEl) {
        const parts = [];
        if (id3.album) parts.push(id3.album);
        if (id3.year) parts.push(id3.year);
        if (id3.genre) parts.push(id3.genre);
        if (id3.license) parts.push(id3.license);
        albumEl.textContent = parts.join(' \u00B7 ');
      }
      // Show engine provenance in MIDI source panel
      const sourceEl = document.getElementById('midi-source');
      const notesEl = document.getElementById('midi-notes');
      const track = this.musicSync.tracks[trackIndex];
      if (sourceEl && track) {
        const engine = track.engine || 'RadioEngineV8';
        sourceEl.textContent = `Source: ${engine} (seed 42) · MIDI pool: 1,771 files from 120 composers`;
      }
      if (notesEl && track) {
        notesEl.textContent = `${track.nEvents || '?'} note events · ${Math.round(track.duration || 0)}s`;
      }
      if (this.midiInfoPanel) this.midiInfoPanel.classList.add('visible');
    } else if (this.soundMode === 'midi') {
      const info = this.player?.midiPlayer?.trackInfo;
      if (titleEl) titleEl.textContent = info?.name || 'MIDI';
      if (artistEl) artistEl.textContent = info?.composer || '';
      if (albumEl) albumEl.textContent = info?.era || '';
    } else if (this.soundMode === 'synth') {
      if (titleEl) titleEl.textContent = this.player?.musicGenerator?.getCurrentTrackName() || 'Synth';
      if (artistEl) artistEl.textContent = 'Generated';
      if (albumEl) albumEl.textContent = '';
    }
  }

  // ──── Interstitial ────

  _playInterstitial() {
    if (!this.musicSync?.interstitialUrl) return Promise.resolve();
    return new Promise((resolve) => {
      const overlay = document.getElementById('interstitial-overlay');
      if (overlay) overlay.style.display = 'flex';

      const interAudio = new Audio(this.musicSync.interstitialUrl);
      interAudio.volume = this.player?.audio?.volume ?? 0.8;
      interAudio.addEventListener('ended', () => {
        if (overlay) overlay.style.display = 'none';
        resolve();
      });
      interAudio.addEventListener('error', () => {
        if (overlay) overlay.style.display = 'none';
        resolve();
      });
      // Timeout safety: max 10 seconds
      setTimeout(() => {
        interAudio.pause();
        if (overlay) overlay.style.display = 'none';
        resolve();
      }, 10000);
      interAudio.play().catch(() => {
        if (overlay) overlay.style.display = 'none';
        resolve();
      });
    });
  }

  // ──── MIDI Info ────

  _updateMidiInfo() {
    if (!this.midiInfoPanel) return;

    const mode = this.musicSync.mode;
    const sourceEl = document.getElementById('midi-source');
    const notesEl = document.getElementById('midi-notes');

    if (mode === AUDIO_MODE.MIDI && this.player?.midiPlayer?.trackInfo) {
      const info = this.player.midiPlayer.trackInfo;
      const composerEl = document.getElementById('midi-composer');
      const pieceEl = document.getElementById('midi-piece');
      const eraEl = document.getElementById('midi-era');
      const mutEl = document.getElementById('midi-mutation');

      if (composerEl) composerEl.textContent = info.composer || '';
      if (pieceEl) pieceEl.textContent = info.name || '';
      if (eraEl) {
        // Show era + license info
        const eraText = info.era || '';
        const license = info.license || 'CC BY-NC-SA 4.0 (MAESTRO) / CC BY 4.0 (ADL)';
        eraEl.textContent = eraText ? `${eraText} · ${license}` : license;
      }
      if (mutEl) {
        const mut = MIDI_MUTATIONS[this.currentMutationIndex];
        mutEl.textContent = mut && mut.name !== 'Original' ? `Mutation: ${mut.name}` : '';
      }

      // Show source MIDI file info (the raw material before effects)
      if (sourceEl) {
        const eraText = info.era ? ` (${info.era})` : '';
        sourceEl.textContent = `Source MIDI: ${info.composer || 'Unknown'} — ${info.name || ''}${eraText}`;
      }

      // Show raw note arrangement from the MIDI
      if (notesEl) {
        const mp = this.player.midiPlayer;
        if (mp._notes && mp._notes.length) {
          const channels = new Set();
          const instruments = new Set();
          for (const n of mp._notes) {
            if (n.ch !== undefined) channels.add(n.ch);
            if (n.inst) instruments.add(n.inst);
            if (n.program !== undefined) instruments.add(n.program);
          }
          const parts = [];
          parts.push(`${mp._notes.length} notes`);
          if (channels.size) parts.push(`${channels.size} tracks`);
          if (instruments.size) parts.push(`${instruments.size} instruments`);
          if (mp._duration) parts.push(`${Math.round(mp._duration)}s`);
          notesEl.textContent = `Raw arrangement: ${parts.join(' · ')}`;
        } else {
          notesEl.textContent = '';
        }
      }

      this.midiInfoPanel.classList.add('visible');
    } else if (mode === AUDIO_MODE.SYNTH) {
      const composerEl = document.getElementById('midi-composer');
      const pieceEl = document.getElementById('midi-piece');
      const eraEl = document.getElementById('midi-era');
      const mutEl = document.getElementById('midi-mutation');

      if (composerEl) composerEl.textContent = 'Synth Generator';
      if (pieceEl) {
        const trackName = this.player?.musicGenerator?._trackNames?.[this.player.musicGenerator.currentTrack] || '';
        pieceEl.textContent = trackName;
      }
      if (eraEl) eraEl.textContent = '';
      if (mutEl) mutEl.textContent = '';
      if (sourceEl) sourceEl.textContent = '';
      if (notesEl) notesEl.textContent = '';

      this.midiInfoPanel.classList.add('visible');
    } else {
      this.midiInfoPanel.classList.remove('visible');
    }
  }

  // ──── Track List ────

  _buildTrackList() {
    const panel = document.getElementById('track-list-panel');
    if (!panel) return;
    panel.innerHTML = '';

    if (this.musicSync.mode === AUDIO_MODE.MP3) {
      for (let i = 0; i < this.musicSync.tracks.length; i++) {
        const track = this.musicSync.tracks[i];
        const entry = document.createElement('div');
        entry.className = 'track-entry' + (i === this.player?.currentTrack ? ' active' : '');
        entry.textContent = `${i + 1}. ${track.title} \u2014 ${track.epochName}`;
        entry.addEventListener('click', () => {
          this.player?.loadMp3Track(i).then(() => {
            if (this.player.isPlaying) this.player.play();
          });
          document.getElementById('track-overlay')?.classList.remove('visible');
        });
        panel.appendChild(entry);
      }
    }
  }

  _updateTrackListHighlight(index) {
    const entries = document.querySelectorAll('.track-entry');
    entries.forEach((e, i) => e.classList.toggle('active', i === index));
  }

  // ──── Note Info ────

  _updateNoteInfoVisibility() {
    if (this.noteInfoPanel) {
      const show = this.settings.showNotes !== false &&
        (this.mode === 'grid' || this.mode === 'player');
      this.noteInfoPanel.classList.toggle('visible', show);
    }
  }

  // ──── HUD Helpers ────

  _updateModeTabs() {
    document.querySelectorAll('.tab-btn').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === this.mode);
    });
  }

  _updatePlayerNames() {
    if (this.game && this.hudNames) {
      const names = this.game.getPlayerNames();
      this.hudNames.textContent = names.join(' & ');
    }
  }

  _formatSpacetime(years) {
    if (years < 1000) return `${years.toFixed(0)} yr`;
    if (years < 1e6) return `${(years / 1e3).toFixed(1)}E3 yr`;
    if (years < 1e9) return `${(years / 1e6).toFixed(2)}E6 yr`;
    return `${(years / 1e9).toFixed(3)}E9 yr`;
  }

  // ──── Game Completion ────

  _onGameComplete() {
    // Show completion message — game ends after 12 album tracks
    if (this.game) this.game.pause();
    const totalPoints = this.game ?
      this.game.totalPoints + this.game.runners.reduce((s, r) => s + r.points, 0) : 0;
    if (this.hudTrack) {
      this.hudTrack.textContent = `\u{1F389} Complete! Score: ${totalPoints}`;
    }
    if (this.songTitleDisplay) {
      this.songTitleDisplay.textContent = `\u{1F389} Complete! Final Score: ${totalPoints}`;
      this.songTitleDisplay.classList.add('visible');
    }
  }

  // ──── Input Handling ────

  _bindInput() {
    // Keyboard
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));

    // Mouse
    this.canvas?.addEventListener('mousedown', (e) => this._onPointerDown(e.clientX, e.clientY, 'mouse'));
    window.addEventListener('mousemove', (e) => this._onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', () => this._onPointerUp());

    // Touch
    this.canvas?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this._onPointerDown(t.clientX, t.clientY, 'touch');
    }, { passive: false });

    this.canvas?.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      this._onPointerMove(t.clientX, t.clientY);
    }, { passive: false });

    this.canvas?.addEventListener('touchend', (e) => {
      e.preventDefault();
      this._onPointerUp();
    }, { passive: false });

    // Clean up drag state on window blur/visibility change
    window.addEventListener('blur', () => this._onPointerUp());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._onPointerUp();
    });

    // Continuous movement loop
    this._movementLoop();
  }

  _onKeyDown(e) {
    if (this.screen !== 'main') return;

    // In 2-player: P1=WASD+Space, P2=Arrows+Numpad+IJKL
    // In 1-player: all key sets control player 0
    const is2P = this.numPlayers === 2;
    const p2 = is2P ? 1 : 0;  // P2 target (or P1 in single-player)

    switch (e.key) {
      // Space always jumps player 1
      case ' ':
        e.preventDefault();
        if (this.game) this.game.jump(0);
        break;

      // WASD — always player 1
      case 'w': case 'W':
        if (this.game) this.game.jump(0);
        break;
      case 's': case 'S':
        if (this.game) this.game.fastDrop(0);
        break;
      case 'a': case 'A':
        this._p1LeftHeld = true;
        break;
      case 'd': case 'D':
        this._p1RightHeld = true;
        break;

      // Arrows — P2 in 2-player, P1 in 1-player
      case 'ArrowUp':
        e.preventDefault();
        if (this.game) this.game.jump(p2);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (this.game) this.game.fastDrop(p2);
        break;
      case 'ArrowLeft':
        if (is2P) this._p2LeftHeld = true;
        else this._p1LeftHeld = true;
        break;
      case 'ArrowRight':
        if (is2P) this._p2RightHeld = true;
        else this._p1RightHeld = true;
        break;

      // IJKL (vim-style) — P2 in 2-player, P1 in 1-player
      case 'i': case 'I':
        if (this.game) this.game.jump(p2);
        break;
      case 'k': case 'K':
        if (this.game) this.game.fastDrop(p2);
        break;
      case 'j': case 'J':
        if (is2P) this._p2LeftHeld = true;
        else this._p1LeftHeld = true;
        break;
      case 'l': case 'L':
        if (is2P) this._p2RightHeld = true;
        else this._p1RightHeld = true;
        break;

      // Numpad — P2 in 2-player, P1 in 1-player
      case '8':
        if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          if (this.game) this.game.jump(p2);
        }
        break;
      case '4':
        if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          if (is2P) this._p2LeftHeld = true;
          else this._p1LeftHeld = true;
        }
        break;
      case '6':
        if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          if (is2P) this._p2RightHeld = true;
          else this._p1RightHeld = true;
        }
        break;
      case '5':
        if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          if (this.game) this.game.fastDrop(p2);
        }
        break;

      // Mode switching (1=player, 2=game, 3=grid)
      // '2' also serves as P2 fast-drop on numpad
      case '1':
        if (e.location !== KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          this._switchMode('player');
        }
        break;
      case '2':
        if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          if (this.game) this.game.fastDrop(1);
        } else {
          this._switchMode('game');
        }
        break;
      case '3':
        if (e.location !== KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          this._switchMode('grid');
        }
        break;

      // Pause (Escape also closes overlays via _initOverlayBackdropClose)
      case 'p': case 'P':
        this._togglePause();
        break;

      // Speed
      case '+': case '=':
        if (this.game) this.game.adjustSpeed(SPEED_STEP);
        break;
      case '-': case '_':
        if (this.game) this.game.adjustSpeed(-SPEED_STEP);
        break;
    }
  }

  _onKeyUp(e) {
    const is2P = this.numPlayers === 2;
    switch (e.key) {
      // WASD — always P1
      case 'a': case 'A': this._p1LeftHeld = false; break;
      case 'd': case 'D': this._p1RightHeld = false; break;
      // Arrows — P2 in 2P, P1 in 1P
      case 'ArrowLeft':
        if (is2P) this._p2LeftHeld = false;
        else this._p1LeftHeld = false;
        break;
      case 'ArrowRight':
        if (is2P) this._p2RightHeld = false;
        else this._p1RightHeld = false;
        break;
      // IJKL — P2 in 2P, P1 in 1P
      case 'j': case 'J':
        if (is2P) this._p2LeftHeld = false;
        else this._p1LeftHeld = false;
        break;
      case 'l': case 'L':
        if (is2P) this._p2RightHeld = false;
        else this._p1RightHeld = false;
        break;
      // Numpad — P2 in 2P, P1 in 1P
      case '4':
        if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          if (is2P) this._p2LeftHeld = false;
          else this._p1LeftHeld = false;
        }
        break;
      case '6':
        if (e.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD) {
          if (is2P) this._p2RightHeld = false;
          else this._p1RightHeld = false;
        }
        break;
    }
  }

  _onPointerDown(x, y, source) {
    if (this.screen !== 'main' || !this.game) return;

    // Check if clicking on a runner (for drag)
    const runnerIdx = this.game.getRunnerAtPosition(x, y);
    if (runnerIdx >= 0) {
      this._dragPlayerIndex = runnerIdx;
      this._dragStartX = x;
      this.game.runners[runnerIdx].dragging = true;
      return;
    }

    // Otherwise, jump
    if (this.game.mode === 'game') {
      if (this.numPlayers === 2) {
        // Left half = P1, right half = P2
        if (x < this.game.width / 2) {
          this.game.jump(0);
        } else {
          this.game.jump(1);
        }
      } else {
        this.game.jump(0);
      }
    }
  }

  _onPointerMove(x, y) {
    if (this._dragPlayerIndex >= 0 && this.game) {
      const fraction = x / this.game.width;
      this.game.setPlayerPosition(this._dragPlayerIndex, fraction);
    }
  }

  _onPointerUp() {
    if (this._dragPlayerIndex >= 0 && this.game?.runners[this._dragPlayerIndex]) {
      this.game.runners[this._dragPlayerIndex].dragging = false;
    }
    this._dragPlayerIndex = -1;
  }

  _movementLoop() {
    // Movement speed: 2D is slower for precision, 3D slightly faster
    const is3D = this.game && this.game.gridDim === '3d';
    const moveSpeed = is3D ? 0.012 : 0.008;
    const step = () => {
      if (this.game && this.game.mode === 'game' && !this.game.paused) {
        const is3D = this.game.gridDim === '3d';
        const speed = is3D ? 0.012 : 0.008;
        if (this._p1LeftHeld) this.game.movePlayer(0, -speed);
        if (this._p1RightHeld) this.game.movePlayer(0, speed);
        if (this._p2LeftHeld) this.game.movePlayer(1, -speed);
        if (this._p2RightHeld) this.game.movePlayer(1, speed);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ──── Settings ────

  _loadSettings() {
    try {
      const raw = localStorage.getItem('itb-bounce-v6-settings');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  _saveSettings() {
    try {
      localStorage.setItem('itb-bounce-v6-settings', JSON.stringify(this.settings));
    } catch (e) { /* ok */ }
  }

  getDuration() {
    return this.player?.getDuration() || 0;
  }
}

// ──── Boot ────
document.addEventListener('DOMContentLoaded', () => {
  const app = new CosmicRunnerApp();
  app.init().catch(e => console.error('Init error:', e));
});
