/**
 * Main Application for In The Beginning Visualizer V3.
 *
 * Supports four modes:
 * - Album: Multi-track MP3 playback with synchronized grid visualization
 * - Single: Single continuous audio file
 * - MIDI Synth: In-browser MIDI synthesis via SynthEngine + Web Worker
 * - Stream: Server-Sent Events for infinite radio
 *
 * MIDI Synth mode features:
 * - Full MIDI library access (1,854 classical pieces)
 * - 16 mutation presets (pitch shift, tempo, reverb, filter)
 * - Web Worker MIDI parsing for non-blocking performance
 * - Additive synthesis with 16+ instrument timbres
 * - Pitch bend visualization (pulsing glow on bent notes)
 * - Infinite shuffle mode
 * - Composer/piece provenance display
 */

/** 16 MIDI mutation presets (matches Cosmic Runner V3 config). */
const MIDI_MUTATIONS = [
  { name: 'Original',       pitchShift: 0,   tempoMult: 1.0,  reverb: 0,   filter: 'none' },
  { name: 'Celestial',      pitchShift: 12,  tempoMult: 0.8,  reverb: 0.6, filter: 'lowpass' },
  { name: 'Subterranean',   pitchShift: -12, tempoMult: 1.1,  reverb: 0.3, filter: 'lowpass' },
  { name: 'Crystal',        pitchShift: 7,   tempoMult: 0.9,  reverb: 0.5, filter: 'highpass' },
  { name: 'Nebula',         pitchShift: 5,   tempoMult: 0.7,  reverb: 0.8, filter: 'bandpass' },
  { name: 'Quantum',        pitchShift: -5,  tempoMult: 1.3,  reverb: 0.2, filter: 'none' },
  { name: 'Solar Wind',     pitchShift: 3,   tempoMult: 1.0,  reverb: 0.4, filter: 'highpass' },
  { name: 'Deep Space',     pitchShift: -7,  tempoMult: 0.6,  reverb: 0.9, filter: 'lowpass' },
  { name: 'Pulsar',         pitchShift: 0,   tempoMult: 1.5,  reverb: 0.1, filter: 'bandpass' },
  { name: 'Cosmic Ray',     pitchShift: 4,   tempoMult: 1.2,  reverb: 0.3, filter: 'highpass' },
  { name: 'Dark Matter',    pitchShift: -3,  tempoMult: 0.85, reverb: 0.7, filter: 'lowpass' },
  { name: 'Supernova',      pitchShift: 2,   tempoMult: 1.4,  reverb: 0.5, filter: 'none' },
  { name: 'Event Horizon',  pitchShift: -9,  tempoMult: 0.5,  reverb: 1.0, filter: 'lowpass' },
  { name: 'Starlight',      pitchShift: 9,   tempoMult: 0.95, reverb: 0.4, filter: 'highpass' },
  { name: 'Graviton',       pitchShift: -2,  tempoMult: 1.1,  reverb: 0.6, filter: 'bandpass' },
  { name: 'Photon',         pitchShift: 6,   tempoMult: 1.0,  reverb: 0.2, filter: 'none' },
];

class VisualizerApp {
  constructor() {
    /** @type {Grid|null} */
    this.grid = null;
    /** @type {Player|null} */
    this.player = null;
    /** @type {Score|null} */
    this.score = null;
    /** @type {StreamClient|null} */
    this.streamClient = null;
    /** @type {SynthEngine|null} */
    this.synthEngine = null;
    /** @type {MidiFilePlayer|null} */
    this.midiPlayer = null;

    /** @type {string} Current mode: album, single, midi, stream */
    this.mode = 'single';

    /** @type {number} */
    this._lastColorShift = 0;
    /** @type {number} Color shift interval in seconds. */
    this._colorShiftInterval = 600;

    /** @type {HTMLElement|null} */
    this._trackListEl = null;
    /** @type {HTMLElement|null} */
    this._statusEl = null;
    /** @type {HTMLElement|null} */
    this._fileInputEl = null;

    // MIDI mode state
    /** @type {Array} MIDI catalog entries. */
    this._midiCatalog = [];
    /** @type {string} Base URL for MIDI files. */
    this._midiBaseUrl = '';
    /** @type {boolean} Whether MIDI catalog is loaded. */
    this._midiAvailable = false;
    /** @type {number} Current mutation index (0-15). */
    this._mutationIndex = 0;
    /** @type {boolean} Infinite shuffle mode. */
    this._infiniteMode = false;
    /** @type {Array<number>} Recently played MIDI indices. */
    this._midiHistory = [];

    // Audio path resolution
    /** @type {string} */
    this._notesBaseUrl = '';
    /** @type {string} */
    this._audioBaseUrl = '';
  }

  /** Initialize after DOM ready. */
  init() {
    const gridContainer = document.getElementById('grid-container');
    const controlBar = document.getElementById('control-bar');
    this._trackListEl = document.getElementById('track-list');
    this._statusEl = document.getElementById('status-message');
    this._fileInputEl = document.getElementById('score-file-input');

    this.grid = new Grid(gridContainer);

    // URL params
    const params = new URLSearchParams(window.location.search);
    this.mode = params.get('mode') || 'album';
    const scoreUrl = params.get('score') || '';
    const streamUrl = params.get('stream') || '';
    const audioUrl = params.get('audio') || '';

    // Player (HTML5 Audio for album/single modes)
    this.player = new Player({
      controlBar,
      mode: this.mode,
      score: null,
      onTimeUpdate: (time) => this._onTimeUpdate(time),
      onTrackChange: (idx) => this._onTrackChange(idx),
    });

    // File input (JSON scores + MIDI files)
    if (this._fileInputEl) {
      this._fileInputEl.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this._loadInputFile(file);
      });
    }

    // Drag-and-drop
    if (gridContainer) {
      gridContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        gridContainer.classList.add('drag-over');
      });
      gridContainer.addEventListener('dragleave', () => {
        gridContainer.classList.remove('drag-over');
      });
      gridContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        gridContainer.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) this._loadInputFile(file);
      });
    }

    // Mode selector tabs
    this._initModeSelector();

    // MIDI controls
    this._initMidiControls();

    // Load content
    if (scoreUrl) {
      this._loadScoreFromUrl(scoreUrl);
    } else if (this.mode === 'stream' && streamUrl) {
      this._startStream(streamUrl);
    } else if (audioUrl) {
      this.player.loadAudio(audioUrl);
    } else {
      this._autoLoad();
    }
  }

  /** Initialize mode selector tabs. */
  _initModeSelector() {
    const selector = document.getElementById('mode-selector');
    if (!selector) return;

    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const newMode = tab.dataset.mode;
        if (newMode === this.mode) return;
        this._switchMode(newMode);
      });
    });
  }

  /** Initialize MIDI mode control buttons. */
  _initMidiControls() {
    const prevBtn = document.getElementById('midi-prev');
    const nextBtn = document.getElementById('midi-next');
    const mutateBtn = document.getElementById('midi-mutate');
    const infiniteToggle = document.getElementById('midi-infinite-toggle');

    if (prevBtn) prevBtn.addEventListener('click', () => this._prevMidi());
    if (nextBtn) nextBtn.addEventListener('click', () => this._nextMidi());
    if (mutateBtn) mutateBtn.addEventListener('click', () => this._cycleMutation());
    if (infiniteToggle) {
      infiniteToggle.addEventListener('change', () => {
        this._infiniteMode = infiniteToggle.checked;
      });
    }
  }

  /** Switch between modes. */
  _switchMode(newMode) {
    // Stop current mode
    if (this.mode === 'midi') this._stopMidiMode();
    if (this.mode === 'stream' && this.streamClient) {
      this.streamClient.disconnect();
    }
    if (this.mode === 'album' || this.mode === 'single') {
      if (this.player) this.player.pause();
    }

    this.mode = newMode;

    // Update tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === newMode);
    });

    // Update player mode
    if (this.player) {
      this.player.mode = newMode === 'midi' ? 'single' : newMode;
      this.player._updateModeVisibility();
    }

    // Show/hide MIDI controls
    const midiControls = document.getElementById('midi-controls');
    if (midiControls) midiControls.style.display = newMode === 'midi' ? 'flex' : 'none';

    // Show/hide track list
    if (this._trackListEl) {
      this._trackListEl.style.display = newMode === 'album' ? 'block' : 'none';
    }

    // Show/hide MIDI info
    const midiPanel = document.getElementById('midi-info-panel');
    if (midiPanel) midiPanel.classList.toggle('visible', newMode === 'midi');

    // Start new mode
    if (newMode === 'midi') {
      this._startMidiMode();
    } else if (newMode === 'album' && this.score && this.score.tracks.length > 0) {
      this.player.play();
    }

    this.grid.clearGrid();
  }

  // ──── Auto-loading ────

  async _autoLoad() {
    this._setStatus('Loading V8 Sessions...');

    // Try loading MIDI catalog alongside album data
    const catalogLoaded = this._loadMidiCatalog();

    // Try loading album from sibling directories (deployed layout first)
    const notePaths = [
      '../cosmic-runner/audio/',
      'audio/',
      'scores/',
    ];

    let albumJson = null;
    let notesBase = '';

    for (const base of notePaths) {
      try {
        const resp = await fetch(base + 'album_notes.json');
        if (resp.ok) {
          albumJson = await resp.json();
          notesBase = base;
          break;
        }
      } catch (e) { /* next */ }
    }

    await catalogLoaded;

    if (albumJson) {
      // Find audio base
      let audioBase = notesBase;
      if (albumJson.tracks && albumJson.tracks[0]) {
        const testFile = albumJson.tracks[0].audio_file;
        for (const base of notePaths) {
          try {
            const resp = await fetch(base + testFile, { method: 'HEAD' });
            if (resp.ok) { audioBase = base; break; }
          } catch (e) { /* next */ }
        }
      }
      this._notesBaseUrl = notesBase;
      this._audioBaseUrl = audioBase;
      this._applyScore(albumJson);
      this._setStatus('In The Beginning Phase 0 \u2014 V8 Sessions');
    } else {
      this._setStatus('Drop a score JSON or MIDI file to load.');
    }

    // Show mode selector if MIDI is available
    if (this._midiAvailable) {
      const selector = document.getElementById('mode-selector');
      if (selector) selector.style.display = 'flex';
    }
  }

  /** Load MIDI catalog from sibling directories. */
  async _loadMidiCatalog() {
    const catalogPaths = [
      '../cosmic-runner/midi/midi_catalog.json',
      '../cosmic-runner/audio/midi_catalog.json',
      'midi/midi_catalog.json',
      'audio/midi_catalog.json',
    ];

    for (const path of catalogPaths) {
      try {
        const resp = await fetch(path);
        if (resp.ok) {
          const data = await resp.json();
          this._midiCatalog = data.midis || [];
          this._midiBaseUrl = path.substring(0, path.lastIndexOf('/') + 1);
          this._midiAvailable = this._midiCatalog.length > 0;
          return;
        }
      } catch (e) { /* next */ }
    }
  }

  // ──── File loading ────

  /** Handle file input — JSON scores or MIDI files. */
  _loadInputFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.mid') || name.endsWith('.midi')) {
      this._loadMidiFile(file);
    } else if (name.endsWith('.json')) {
      this._loadScoreFile(file);
    }
  }

  _loadScoreFile(file) {
    this._setStatus('Loading score...');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        this._applyScore(json);
        this._setStatus(`Loaded: ${file.name}`);
      } catch (err) {
        this._setStatus(`Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  /** Load a MIDI file directly (drag-and-drop or file input). */
  async _loadMidiFile(file) {
    this._setStatus(`Loading MIDI: ${file.name}...`);
    this._switchMode('midi');

    const buffer = await file.arrayBuffer();
    this._ensureSynthEngine();
    this._ensureMidiPlayer();

    const ok = await this.midiPlayer.loadMidi(buffer);
    if (ok) {
      this.midiPlayer.trackInfo = { name: file.name, composer: 'Local file' };
      this._updateMidiInfo(file.name, 'Local file', '');
      this.midiPlayer.play();
      this._setStatus(`Playing: ${file.name}`);
    } else {
      this._setStatus('Failed to parse MIDI file.');
    }
  }

  _loadScoreFromUrl(url) {
    this._setStatus('Loading score...');
    fetch(url)
      .then(r => r.json())
      .then(json => {
        this._applyScore(json);
        this._setStatus('Score loaded.');
      })
      .catch(err => this._setStatus(`Error: ${err.message}`));
  }

  _applyScore(json) {
    this.score = Score.fromJSON(json);
    this.mode = this.score.mode || this.mode;
    this._colorShiftInterval = this.score.colorShiftInterval || 600;

    if (this.score.instrumentFamilies) {
      this.grid.setInstrumentFamilies(this.score.instrumentFamilies);
    }
    if (this.score.instruments && this.score.instruments.length > 0) {
      this.grid.preassignColumns(this.score.instruments);
    }

    this.player.score = this.score;
    this.player.mode = this.mode;
    this.player._updateModeVisibility();

    if (this.mode === 'album' && this.score.tracks.length > 0) {
      const firstTrack = this.score.tracks[0];
      const audioUrl = this._resolveAudioUrl(firstTrack.audioFile);
      if (audioUrl) this.player.loadAudio(audioUrl);
      if (firstTrack.noteFile) this._loadTrackNotes(0);
      this._buildTrackList();
    }

    if (this.score.tracks.length > 0 && this.player.ui.trackTitle) {
      const t = this.score.tracks[0];
      this.player.ui.trackTitle.textContent = `${t.trackNum}. ${t.title}`;
    }
  }

  _resolveAudioUrl(audioFile) {
    if (!audioFile) return '';
    if (audioFile.startsWith('http') || audioFile.startsWith('/')) return audioFile;
    return (this._audioBaseUrl || '') + audioFile;
  }

  async _loadTrackNotes(trackIndex) {
    if (!this.score || trackIndex < 0 || trackIndex >= this.score.tracks.length) return;
    const track = this.score.tracks[trackIndex];
    if (!track.noteFile || (track.events && track.events.length > 0)) return;

    const url = (this._notesBaseUrl || '') + track.noteFile;
    const loaded = await this.score.loadTrackEvents(trackIndex, url);
    if (loaded) {
      for (const ev of track.events) {
        this.grid.getColumn(ev.inst);
      }
    }
  }

  // ──── Track list ────

  _buildTrackList() {
    if (!this._trackListEl || !this.score) return;
    this._trackListEl.innerHTML = '';
    this._trackListEl.style.display = this.mode === 'album' ? 'block' : 'none';

    for (let i = 0; i < this.score.tracks.length; i++) {
      const track = this.score.tracks[i];
      const item = document.createElement('div');
      item.className = 'track-item' + (i === 0 ? ' active' : '');
      item.textContent = `${track.trackNum}. ${track.title}`;
      item.dataset.index = i;
      item.addEventListener('click', () => this._switchToTrack(i));
      this._trackListEl.appendChild(item);
    }
  }

  async _switchToTrack(index) {
    if (!this.score || index < 0 || index >= this.score.tracks.length) return;
    const track = this.score.tracks[index];

    this.player.currentTrack = index;
    this._highlightTrack(index);
    this.grid.clearGrid();
    this.grid.resetColumns();

    const audioUrl = this._resolveAudioUrl(track.audioFile);
    if (audioUrl) {
      this.player.audio.src = audioUrl;
      if (this.player.ui.trackTitle) {
        this.player.ui.trackTitle.textContent = `${track.trackNum}. ${track.title}`;
      }
      if (this.player.isPlaying) this.player.audio.play().catch(() => {});
    }

    await this._loadTrackNotes(index);
    if (track.events && track.events.length > 0 && track.noteFile) {
      this.score._buildEventIndexForTrack(index);
    }
  }

  _highlightTrack(index) {
    if (!this._trackListEl) return;
    this._trackListEl.querySelectorAll('.track-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
  }

  // ──── Time update (album/single modes) ────

  _onTimeUpdate(time) {
    if (!this.score) return;
    const events = this.score.getActiveEvents(time);
    this.grid.updateGrid(events);

    const shiftIndex = Math.floor(time / this._colorShiftInterval);
    if (shiftIndex > this._lastColorShift) {
      this._lastColorShift = shiftIndex;
      this.grid.rotateHue(30 + Math.random() * 30);
    }

    this.player.updateAccentColor(this.grid.getDominantHue());
  }

  _onTrackChange(index) {
    this._switchToTrack(index);
  }

  // ──── MIDI Synth Mode ────

  _ensureSynthEngine() {
    if (!this.synthEngine) {
      this.synthEngine = new SynthEngine();
      this.synthEngine.init();
    }
  }

  _ensureMidiPlayer() {
    if (this.midiPlayer) return;
    this._ensureSynthEngine();
    this.midiPlayer = new MidiFilePlayer(this.synthEngine, {
      workerUrl: 'js/synth-worker.js',
    });
    this.midiPlayer.onNoteEvent = (events) => this._onMidiNoteEvent(events);
    this.midiPlayer.onTrackEnd = () => this._onMidiTrackEnd();
    this.midiPlayer.onTimeUpdate = (time) => this._onMidiTimeUpdate(time);
  }

  async _startMidiMode() {
    this._ensureSynthEngine();
    this._ensureMidiPlayer();

    // Pause album player
    if (this.player) this.player.pause();

    if (this._midiAvailable) {
      await this._nextMidi();
    } else {
      this._setStatus('MIDI mode: drop a .mid file or load a MIDI catalog.');
    }
  }

  _stopMidiMode() {
    if (this.midiPlayer) this.midiPlayer.stop();
    this._updateMidiInfo('', '', '');
  }

  async _nextMidi() {
    if (!this._midiCatalog.length) return;
    this._ensureMidiPlayer();

    const midi = this._getRandomMidi();
    if (!midi) return;

    const name = this._sanitize(midi.name || midi.path || '');
    const composer = this._sanitize(midi.composer || '');
    const era = midi.era ? `${midi.era} Era` : '';
    this._updateMidiInfo(name, composer, era);
    this._setStatus(`Loading: ${composer} \u2014 ${name}...`);

    const midiUrl = this._midiBaseUrl + midi.path;
    try {
      const resp = await fetch(midiUrl);
      if (!resp.ok) {
        if (this._infiniteMode) setTimeout(() => this._nextMidi(), 500);
        return;
      }
      const buffer = await resp.arrayBuffer();

      const mutation = MIDI_MUTATIONS[this._mutationIndex];
      this.midiPlayer.setMutation(mutation);
      this.midiPlayer.trackInfo = { name, composer };

      const ok = await this.midiPlayer.loadMidi(buffer);
      if (ok) {
        this.midiPlayer.play();
        this._setStatus(`${composer} \u2014 ${name}`);
      } else if (this._infiniteMode) {
        setTimeout(() => this._nextMidi(), 500);
      }
    } catch (e) {
      if (this._infiniteMode) setTimeout(() => this._nextMidi(), 500);
    }
  }

  _prevMidi() {
    // Go back in history
    if (this._midiHistory.length < 2) return;
    this._midiHistory.pop(); // remove current
    const prevIdx = this._midiHistory[this._midiHistory.length - 1];
    if (prevIdx === undefined) return;

    const midi = this._midiCatalog[prevIdx];
    if (!midi) return;

    const name = this._sanitize(midi.name || '');
    const composer = this._sanitize(midi.composer || '');
    this._updateMidiInfo(name, composer, midi.era ? `${midi.era} Era` : '');

    const midiUrl = this._midiBaseUrl + midi.path;
    fetch(midiUrl)
      .then(r => r.arrayBuffer())
      .then(buffer => {
        this.midiPlayer.setMutation(MIDI_MUTATIONS[this._mutationIndex]);
        return this.midiPlayer.loadMidi(buffer);
      })
      .then(ok => {
        if (ok) {
          this.midiPlayer.play();
          this._setStatus(`${composer} \u2014 ${name}`);
        }
      })
      .catch(() => {});
  }

  _cycleMutation() {
    this._mutationIndex = (this._mutationIndex + 1) % MIDI_MUTATIONS.length;
    const mutation = MIDI_MUTATIONS[this._mutationIndex];
    const label = document.getElementById('midi-mutation-label');
    if (label) label.textContent = mutation.name;

    if (this.midiPlayer) this.midiPlayer.setMutation(mutation);

    const mutEl = document.getElementById('midi-info-mutation');
    if (mutEl) mutEl.textContent = `Mutation: ${mutation.name}`;
  }

  _getRandomMidi() {
    if (!this._midiCatalog.length) return null;
    const recent = new Set(this._midiHistory.slice(-20));
    let idx, attempts = 0;
    do {
      idx = Math.floor(Math.random() * this._midiCatalog.length);
      attempts++;
    } while (recent.has(idx) && attempts < 50);

    this._midiHistory.push(idx);
    if (this._midiHistory.length > 144) this._midiHistory.shift();
    return this._midiCatalog[idx];
  }

  _onMidiNoteEvent(events) {
    this.grid.updateGrid(events);
    this.player.updateAccentColor(this.grid.getDominantHue());
  }

  _onMidiTrackEnd() {
    if (this._infiniteMode) {
      this._nextMidi();
    } else {
      this.grid.clearGrid();
      this._setStatus('MIDI finished. Press Next for another.');
    }
  }

  _onMidiTimeUpdate(time) {
    // Color shift during MIDI playback
    const shiftIndex = Math.floor(time / 120); // Every 2 minutes
    if (shiftIndex > this._lastColorShift) {
      this._lastColorShift = shiftIndex;
      this.grid.rotateHue(30 + Math.random() * 30);
    }
  }

  _updateMidiInfo(name, composer, era) {
    const panel = document.getElementById('midi-info-panel');
    const composerEl = document.getElementById('midi-info-composer');
    const pieceEl = document.getElementById('midi-info-piece');
    const mutEl = document.getElementById('midi-info-mutation');

    if (composerEl) composerEl.textContent = composer;
    if (pieceEl) pieceEl.textContent = name;
    if (mutEl) mutEl.textContent = `Mutation: ${MIDI_MUTATIONS[this._mutationIndex].name}`;
    if (panel) panel.classList.toggle('visible', !!(name || composer));
  }

  // ──── Stream mode ────

  _startStream(url) {
    this.streamClient = new StreamClient({
      url,
      onNotes: (events) => {
        this.grid.updateGrid(events);
        this.player.updateAccentColor(this.grid.getDominantHue());
      },
      onConnect: () => this._setStatus('Connected to stream.'),
      onDisconnect: () => this._setStatus('Reconnecting...'),
      onError: (err) => this._setStatus(`Stream error: ${err.message}`),
    });
    this.streamClient.connect();
  }

  // ──── Utilities ────

  _setStatus(msg) {
    if (this._statusEl) this._statusEl.textContent = msg;
  }

  _sanitize(s) {
    return String(s || '').replace(/[<>]/g, '').replace(/&/g, '&amp;').slice(0, 200);
  }
}

// Initialize
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new VisualizerApp();
    app.init();
    window.__visualizerApp = app;
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VisualizerApp, MIDI_MUTATIONS };
}
