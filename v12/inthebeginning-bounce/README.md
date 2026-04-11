# inthebeginning bounce — V11

A cosmic runner game with three display modes (Game, Player, Grid) and three
sound modes (MP3 Album, MIDI Library, Synth Generator).

## What's New in V10

- **Renamed**: "Cosmic Runner" → "inthebeginning bounce"
- **12-epoch synth generator**: 9 audio layers, richer sonic architecture
- **Pause stops music**: Pause button now pauses both gameplay and music
- **Fixed 3D mode**: Obstacles fly past player instead of piling up
- **Fixed MIDI auto-play**: Playhead starts at beginning, auto-plays on start
- **P2 controls**: Right-side keys (IJKL / Numpad) for player 2
- **Theme integration**: Theme colors affect ground rendering
- **Infinite play**: Album repeat, MIDI infinite shuffle, synth cycle repeat
- **Game completion**: End screen after 12 album tracks (non-infinite mode)
- **Visualizer removed**: All visualization modes consolidated into game

## Asset Requirements

### Local Assets (in this directory)

```
audio/
  album.json                     Album metadata with track list and ID3 info
  album_notes.json               Track reference list
  midi_catalog.json              MIDI library catalog
  in-the-beginning-radio.mp3     Radio station interstitial
  V8_Sessions-*_notes_v3.json    12 note event files
css/styles.css                   Stylesheet
js/                              16 JavaScript files (see below)
index.html                       Entry point
```

Album MP3s are loaded from `../../shared/audio/tracks/` by default. For
self-contained operation, copy the 12 album MP3s into `audio/`.

### Shared Assets (via ../../shared/)

The app uses JavaScript fallback chains to load from shared assets:
- **MIDI files**: `../../shared/audio/midi/` — 1,771 classical MIDI files
- **Instrument samples**: `../../shared/audio/instruments/` — 60 MP3 samples
- **Album tracks**: `../../shared/audio/tracks/` — album MP3s
- **Metadata**: `../../shared/audio/metadata/v1/` — album.json, midi_catalog.json

### JavaScript Files

| File | Purpose |
|------|---------|
| app.js | Main controller — mode switching, asset loading, UI |
| game.js | Game engine — physics, scoring, collision detection |
| player.js | Unified audio player (MP3/MIDI/synth) |
| midi-player.js | MIDI file parser and Web Audio playback |
| synth-engine.js | Web Audio API synthesizer + instrument sample bank |
| synth-worker.js | Background worker for MIDI parsing |
| music-sync.js | Note event sync, album loading, MIDI catalog management |
| music-generator.js | Procedural music generation (12 epochs, 9 layers) |
| config.js | Game configuration constants |
| themes.js | Visual theme management |
| runner.js | Runner character physics and rendering |
| obstacles.js | Obstacle spawning, movement, collision |
| characters.js | Character sprite definitions |
| background.js | Background rendering and parallax |
| blast-effect.js | Visual effects (explosions, particles) |
| renderer3d.js | 3D perspective renderer for advanced levels |

## Controls

### 1-Player
- SPACE / UP / W: Jump (unlimited multi-jump)
- DOWN / S: Fast drop
- LEFT / RIGHT / A / D: Move
- 1/2/3: Switch mode
- P: Pause (game + music)
- +/-: Speed

### 2-Player
- P1: Arrows / WASD (left side)
- P2: IJKL / Numpad 8456 (right side)

## Path Resolution

The app tries local paths first, then shared paths:
1. `audio/midi_catalog.json` (local)
2. `../../shared/audio/midi/midi_catalog.json` (shared — MIDI files here)
3. `../../shared/audio/metadata/v1/midi_catalog.json` (shared metadata)
