# Visualizer — V5

A standalone music visualization application with five modes:
Album, MIDI, Synth, Stream, and Single file.

## Asset Requirements

### Local Assets (in this directory)

```
css/visualizer.css       Stylesheet
js/                      9 JavaScript files (see below)
index.html               Entry point
```

### Shared and Sibling Assets

The visualizer has no local audio — it loads from sibling and shared directories:
- **Album data**: `../inthebeginning-bounce/audio/` (sibling game directory)
- **MIDI files**: `../../shared/audio/midi/` — 1,771 classical MIDI files
- **Instrument samples**: `../../shared/audio/instruments/` — 60 MP3 samples
- **Album tracks**: `../../shared/audio/tracks/` or sibling game audio
- **Metadata**: `../../shared/audio/metadata/v1/`

### JavaScript Files

| File | Purpose |
|------|---------|
| app.js | Main controller — 5 modes, catalog loading, UI |
| grid.js | 64x64 color grid renderer (2D and 3D views) |
| player.js | Audio player for album tracks |
| midi-player.js | MIDI file parser and playback |
| synth-engine.js | Web Audio API synthesizer + sample bank |
| synth-worker.js | Background MIDI parsing worker |
| music-generator.js | Procedural music for synth mode |
| stream.js | SSE client for stream mode (requires Go server) |
| score.js | JSON score file parser for single mode |

## Path Resolution

The visualizer tries multiple fallback paths:
1. Sibling game directory: `../inthebeginning-bounce/audio/`
2. Shared MIDI: `../../shared/audio/midi/midi_catalog.json`
3. Shared metadata: `../../shared/audio/metadata/v1/`
4. Legacy paths: `../cosmic-runner-v5/audio/`
