# Shared Assets — In The Beginning

Shared audio assets used by all version deployments (v5, v6, ...).

## Directory Structure

```
shared/audio/
  tracks/              12 album MP3s + 12 note event JSON files (~84MB)
  midi/                1,771 MIDI files across 120 composer directories (~25MB)
    midi_catalog.json  Catalog with path, composer, era for each MIDI
    ATTRIBUTION.md     License and source attribution
    Bach/              239 MIDI files
    Beethoven/         128 MIDI files
    Mozart/            165 MIDI files
    Chopin/            96 MIDI files
    ... (120 composer directories total)
  instruments/         60 instrument sample MP3s (~2.5MB)
    piano.mp3, violin.mp3, cello.mp3, flute.mp3, ...
  metadata/v1/         Versioned metadata schemas
    album.json         Album metadata with per-track ID3 info
    midi_catalog.json  MIDI library catalog (copy of midi/midi_catalog.json)
  interstitials/       Radio station ID audio
    in-the-beginning-radio.mp3
```

## Versioning Strategy

- Version app folders (v5/, v6/) reference shared assets via `../../shared/audio/`.
- Adding a new version does NOT duplicate the ~110MB of shared assets.
- If the JSON schema changes, create `metadata/v2/` — never modify v1.
- `midi_catalog.json` is in both `midi/` (for correct base URL resolution) and
  `metadata/v1/` (for metadata queries). Keep both in sync.

## Updating Shared Assets

From the main development repo:

```bash
# Copy MIDI library
cp -r apps/audio/midi_library/* deploy/shared/audio/midi/

# Copy instrument samples
cp apps/audio/samples/*.mp3 deploy/shared/audio/instruments/

# Copy album tracks (only if re-rendered)
cp apps/audio/output/v8_album/*.mp3 deploy/shared/audio/tracks/

# Verify with tests
python -m pytest tests/test_deploy_assets.py -v
```
