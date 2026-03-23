# Cosmic Runner (inthebeginning-bounce) — V5

A cosmic runner game with three display modes (Game, Player, Grid) and three
sound modes (MP3 Album, MIDI Library, Synth Generator).

## Asset Requirements

### Local Assets (in this directory)

```
audio/
  album.json                     Album metadata with track list and ID3 info
  album_notes.json               Track reference list
  midi_catalog.json              MIDI library catalog
  in-the-beginning-radio.mp3     Radio station interstitial
  V8_Sessions-*.mp3              12 album tracks
  V8_Sessions-*_notes_v3.json    12 note event files
css/styles.css                   Stylesheet
js/                              16 JavaScript files (see below)
index.html                       Entry point
```

### Shared Assets (via ../../shared/)

The app uses JavaScript fallback chains to load from shared assets:
- **MIDI files**: `../../shared/audio/midi/` — 1,771 classical MIDI files
- **Instrument samples**: `../../shared/audio/instruments/` — 60 MP3 samples
- **Album tracks**: `../../shared/audio/tracks/` — fallback for album MP3s
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
| music-generator.js | Procedural music generation for synth mode |
| config.js | Game configuration constants |
| themes.js | Visual theme management |
| runner.js | Runner character physics and rendering |
| obstacles.js | Obstacle spawning, movement, collision |
| characters.js | Character sprite definitions |
| background.js | Background rendering and parallax |
| blast-effect.js | Visual effects (explosions, particles) |
| renderer3d.js | 3D perspective renderer for advanced levels |

## Path Resolution

The app tries local paths first, then shared paths:
1. `audio/midi_catalog.json` (local)
2. `../../shared/audio/midi/midi_catalog.json` (shared — MIDI files here)
3. `../../shared/audio/metadata/v1/midi_catalog.json` (shared metadata)

MIDI files load from `catalogBaseUrl + entry.path` where the base URL is
derived from whichever catalog path succeeded.
