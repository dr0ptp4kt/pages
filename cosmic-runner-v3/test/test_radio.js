/**
 * Tests for the Cosmic Runner V3 radio server module.
 *
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert/strict).
 * Run: node --test apps/cosmic-runner-v3/test/test_radio.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Module loading helper
//
// The radio.js file has top-level side effects (loadAlbumData, parseArgs, etc.)
// that call process.exit(1) when album files are missing. We extract the
// exported classes/functions by evaluating the source in a sandboxed context,
// intercepting those side effects.
// ---------------------------------------------------------------------------

function loadRadioModule() {
  const srcPath = path.resolve(__dirname, '..', 'server', 'radio.js');
  let src = fs.readFileSync(srcPath, 'utf-8');

  // Remove the shebang line if present
  if (src.startsWith('#!')) {
    src = src.slice(src.indexOf('\n') + 1);
  }

  // Strip the top-level side-effect block (lines after the last class/function
  // definition and before module.exports). We replace the block that calls
  // parseArgs() / loadAlbumData() / RadioBroadcaster / createServer with a no-op.
  // The block starts at "const config = parseArgs();" and ends before module.exports.
  src = src.replace(
    /^const config = parseArgs\(\);[\s\S]*?^const radio = new RadioBroadcaster[\s\S]*?^createServer\([^)]*\);/m,
    '// [test harness] top-level side effects stripped'
  );

  const sandbox = {
    require,
    module: { exports: {} },
    exports: {},
    __dirname: path.resolve(__dirname, '..', 'server'),
    __filename: srcPath,
    console,
    process,
    setTimeout,
    setInterval,
    clearInterval,
    clearTimeout,
    Date,
    Math,
    String,
    Array,
    Map,
    Set,
    JSON,
    parseInt,
    Buffer,
    URL,
    Error,
    TypeError,
    RangeError,
  };
  sandbox.exports = sandbox.module.exports;

  vm.runInNewContext(src, sandbox, { filename: srcPath });

  return sandbox.module.exports;
}

const { InfinitePlaylist, RadioBroadcaster, parseArgs } = loadRadioModule();

// ---------------------------------------------------------------------------
// Mock album data factory
// ---------------------------------------------------------------------------

function createMockAlbum(trackCount = 3) {
  const tracks = [];
  for (let i = 0; i < trackCount; i++) {
    tracks.push({
      track_num: i + 1,
      title: `Track ${i + 1}`,
      duration: 60 + i * 30,   // 60s, 90s, 120s
      audio_file: `track_${i + 1}.mp3`,
      file: `track_${i + 1}_notes.json`,
    });
  }
  return {
    album: 'Test Album',
    artist: 'Test Artist',
    tracks,
    total_duration: tracks.reduce((sum, t) => sum + t.duration, 0),
    total_events: 300,
  };
}

function createMockTrackNotes() {
  // V3 compressed format: [t, dur, note, inst_idx, vel, ch]
  // Events are sorted by start time (t)
  const map = new Map();

  // Track 0: 5 events spread across 60 seconds
  map.set(0, {
    legend: { instruments: { '0': 'piano', '1': 'strings', '2': 'bass' } },
    events: [
      [1.0, 2.0, 60, 0, 80, 0],   // piano, C4, t=1-3
      [5.0, 1.5, 64, 1, 70, 1],   // strings, E4, t=5-6.5
      [10.0, 3.0, 67, 0, 90, 0],  // piano, G4, t=10-13
      [20.0, 2.0, 72, 2, 60, 2],  // bass, C5, t=20-22
      [50.0, 4.0, 48, 1, 100, 1], // strings, C3, t=50-54
    ],
  });

  // Track 1: V2 object format for diversity
  map.set(1, {
    events: [
      { t: 2.0, dur: 1.0, note: 55, inst: 'synth', vel: 85, ch: 0 },
      { t: 8.0, dur: 2.5, note: 62, inst: 'pad', vel: 75, ch: 1 },
      { t: 30.0, dur: 5.0, note: 70, inst: 'synth', vel: 95, ch: 0 },
    ],
  });

  // Track 2: empty events
  map.set(2, { events: [] });

  return map;
}

// =========================================================================
// 1. InfinitePlaylist
// =========================================================================

describe('InfinitePlaylist', () => {
  it('next() cycles through all tracks', () => {
    const pl = new InfinitePlaylist(4);
    const seen = new Set();
    // After 4 calls we should have seen all 4 track indices
    for (let i = 0; i < 4; i++) {
      seen.add(pl.next());
    }
    assert.equal(seen.size, 4, 'Should see all 4 tracks in first cycle');
    for (let i = 0; i < 4; i++) {
      assert.ok(seen.has(i), `Track index ${i} should appear`);
    }
  });

  it('never returns same track twice in a row', () => {
    const pl = new InfinitePlaylist(5);
    let prev = pl.next();
    // Run through many cycles to stress the no-repeat guarantee
    for (let i = 0; i < 200; i++) {
      const cur = pl.next();
      assert.notEqual(cur, prev, `Track ${cur} repeated consecutively at iteration ${i}`);
      prev = cur;
    }
  });

  it('peek(N) returns N upcoming tracks without consuming them', () => {
    const pl = new InfinitePlaylist(6);
    const peeked = pl.peek(4);
    assert.equal(peeked.length, 4);

    // Peek again — should return same sequence since nothing was consumed
    const peeked2 = pl.peek(4);
    assert.deepStrictEqual(peeked, peeked2, 'Consecutive peeks should be identical');
  });

  it('peek(N) matches next() results when consumed', () => {
    const pl = new InfinitePlaylist(6);
    const peeked = pl.peek(5);

    // Now consume those 5 — they should match
    for (let i = 0; i < 5; i++) {
      assert.equal(pl.next(), peeked[i], `next() #${i} should match peek result`);
    }
  });

  it('totalPlayed increments correctly', () => {
    const pl = new InfinitePlaylist(3);
    assert.equal(pl.totalPlayed, 0);
    pl.next();
    assert.equal(pl.totalPlayed, 1);
    pl.next();
    pl.next();
    assert.equal(pl.totalPlayed, 3);
    // Peek should NOT increment totalPlayed
    pl.peek(10);
    assert.equal(pl.totalPlayed, 3);
  });

  it('works with trackCount of 1 (edge case)', () => {
    const pl = new InfinitePlaylist(1);
    // The only possible track is 0, every time
    for (let i = 0; i < 10; i++) {
      assert.equal(pl.next(), 0);
    }
    assert.equal(pl.totalPlayed, 10);
  });
});

// =========================================================================
// 2. RadioBroadcaster
// =========================================================================

describe('RadioBroadcaster', () => {
  let album;
  let trackNotes;
  let radio;

  beforeEach(() => {
    album = createMockAlbum(3);
    trackNotes = createMockTrackNotes();
    radio = new RadioBroadcaster(album, trackNotes);
  });

  it('getState() returns expected fields', () => {
    const state = radio.getState();
    assert.ok('trackIndex' in state, 'should have trackIndex');
    assert.ok('trackNum' in state, 'should have trackNum');
    assert.ok('title' in state, 'should have title');
    assert.ok('duration' in state, 'should have duration');
    assert.ok('position' in state, 'should have position');
    assert.ok('totalTime' in state, 'should have totalTime');
    assert.ok('queuePosition' in state, 'should have queuePosition');
    assert.ok('clientCount' in state, 'should have clientCount');
    assert.ok('upcoming' in state, 'should have upcoming');

    assert.equal(typeof state.trackIndex, 'number');
    assert.ok(state.trackIndex >= 0 && state.trackIndex < 3);
    assert.equal(state.position, 0);
    assert.equal(state.clientCount, 0);
    assert.ok(Array.isArray(state.upcoming));
  });

  it('_getActiveEvents() finds events at given times (V3 compressed)', () => {
    // Force track 0 which has V3 compressed events
    radio.currentTrackIndex = 0;
    radio.currentTrack = album.tracks[0];
    radio.currentNotes = trackNotes.get(0);

    // At t=1.5, the piano note [1.0, 2.0, 60, ...] should be active
    const events = radio._getActiveEvents(1.5, 0.5);
    assert.ok(events.length > 0, 'Should find at least one event at t=1.5');

    const pianoEvent = events.find(e => e.note === 60);
    assert.ok(pianoEvent, 'Should find the piano C4 note');
    assert.equal(pianoEvent.inst, 'piano');
    assert.equal(pianoEvent.vel, 80);
    assert.equal(pianoEvent.ch, 0);
  });

  it('_getActiveEvents() returns empty for times outside events', () => {
    radio.currentTrackIndex = 0;
    radio.currentTrack = album.tracks[0];
    radio.currentNotes = trackNotes.get(0);

    // At t=0 with window=0.5 — no events start until t=1.0
    const events = radio._getActiveEvents(0, 0.5);
    assert.equal(events.length, 0, 'No events at t=0');

    // At t=99 — well past all events
    const events2 = radio._getActiveEvents(99, 0.5);
    assert.equal(events2.length, 0, 'No events at t=99');
  });

  it('_advanceTrack() changes the current track', () => {
    const firstTrackIndex = radio.currentTrackIndex;
    const firstTitle = radio.currentTrack.title;

    // Advance several times; at least one should differ
    const indices = [firstTrackIndex];
    for (let i = 0; i < 10; i++) {
      radio._advanceTrack();
      indices.push(radio.currentTrackIndex);
    }
    // Position should be reset to 0 after advance
    assert.equal(radio.position, 0, 'Position should reset to 0 after advance');
    // Should have seen more than one distinct track
    const unique = new Set(indices);
    assert.ok(unique.size > 1, 'Should cycle through different tracks');
    // currentTrack should match album.tracks
    assert.equal(radio.currentTrack, album.tracks[radio.currentTrackIndex]);
  });
});

// =========================================================================
// 3. parseArgs
// =========================================================================

describe('parseArgs', () => {
  const originalArgv = process.argv;

  function withArgs(args, fn) {
    process.argv = ['node', 'radio.js', ...args];
    try {
      return fn();
    } finally {
      process.argv = originalArgv;
    }
  }

  it('default port is 8088', () => {
    const result = withArgs([], () => parseArgs());
    assert.equal(result.port, 8088);
  });

  it('custom --port works', () => {
    const result = withArgs(['--port', '3000'], () => parseArgs());
    assert.equal(result.port, 3000);
  });

  it('custom --audio-dir works', () => {
    const result = withArgs(['--audio-dir', '/tmp/audio'], () => parseArgs());
    assert.equal(result.audioDir, '/tmp/audio');
  });
});

// =========================================================================
// 4. V3 compressed format handling
// =========================================================================

describe('V3 compressed format handling', () => {
  let album;
  let radio;

  beforeEach(() => {
    album = createMockAlbum(1);
  });

  it('_getActiveEvents with compressed arrays [t, dur, note, inst_idx, vel, ch]', () => {
    const trackNotes = new Map();
    trackNotes.set(0, {
      legend: { instruments: { '0': 'flute', '1': 'harp' } },
      events: [
        [2.0, 1.0, 71, 0, 88, 0],  // flute
        [3.0, 2.0, 74, 1, 65, 1],  // harp
        [6.0, 1.5, 60, 0, 77, 0],  // flute
      ],
    });
    radio = new RadioBroadcaster(album, trackNotes);
    radio.currentTrackIndex = 0;
    radio.currentTrack = album.tracks[0];
    radio.currentNotes = trackNotes.get(0);

    // At t=3.5, the harp note [3.0, 2.0, 74, ...] should be active
    const events = radio._getActiveEvents(3.5, 0.5);
    assert.ok(events.length >= 1);
    const harp = events.find(e => e.note === 74);
    assert.ok(harp, 'Should find harp note');
    assert.equal(harp.inst, 'harp');
    assert.equal(harp.vel, 65);
    assert.equal(harp.ch, 1);
  });

  it('_getActiveEvents with legend-based instrument mapping', () => {
    const trackNotes = new Map();
    trackNotes.set(0, {
      legend: {
        instruments: {
          '0': 'cosmic_synth',
          '1': 'stellar_pad',
          '2': 'quantum_bass',
          '3': 'nebula_bell',
        },
      },
      events: [
        [1.0, 3.0, 48, 2, 90, 2],  // quantum_bass
        [2.0, 2.0, 84, 3, 50, 3],  // nebula_bell
      ],
    });
    radio = new RadioBroadcaster(album, trackNotes);
    radio.currentTrackIndex = 0;
    radio.currentTrack = album.tracks[0];
    radio.currentNotes = trackNotes.get(0);

    const events = radio._getActiveEvents(2.5, 0.5);
    // Both notes should be active at t=2.5
    assert.equal(events.length, 2);

    const bass = events.find(e => e.inst === 'quantum_bass');
    const bell = events.find(e => e.inst === 'nebula_bell');
    assert.ok(bass, 'Should resolve instrument index 2 to quantum_bass');
    assert.ok(bell, 'Should resolve instrument index 3 to nebula_bell');
  });

  it('_getActiveEvents returns "unknown" for missing legend entries', () => {
    const trackNotes = new Map();
    trackNotes.set(0, {
      legend: { instruments: { '0': 'piano' } },
      events: [
        [1.0, 2.0, 60, 99, 80, 0],  // inst_idx 99 not in legend
      ],
    });
    radio = new RadioBroadcaster(album, trackNotes);
    radio.currentTrackIndex = 0;
    radio.currentTrack = album.tracks[0];
    radio.currentNotes = trackNotes.get(0);

    const events = radio._getActiveEvents(1.5, 0.5);
    assert.equal(events.length, 1);
    assert.equal(events[0].inst, 'unknown');
  });

  it('binary search correctness with sorted events', () => {
    // Create a large set of sorted events to exercise the binary search path
    const trackNotes = new Map();
    const events = [];
    for (let i = 0; i < 500; i++) {
      // Events at t=0.0, 0.2, 0.4, ... 99.8, each lasting 0.15s
      events.push([i * 0.2, 0.15, 60 + (i % 12), 0, 80, 0]);
    }
    trackNotes.set(0, {
      legend: { instruments: { '0': 'test_inst' } },
      events,
    });
    radio = new RadioBroadcaster(album, trackNotes);
    radio.currentTrackIndex = 0;
    radio.currentTrack = album.tracks[0];
    radio.currentNotes = trackNotes.get(0);

    // Query at t=50.0 — the event at [50.0, 0.15, ...] should be active
    const result = radio._getActiveEvents(50.0, 0.5);
    assert.ok(result.length >= 1, 'Should find event near t=50');
    // The event at index 250 is [50.0, 0.15, 60+(250%12), ...]
    const expected_note = 60 + (250 % 12);
    const found = result.find(e => e.note === expected_note);
    assert.ok(found, `Should find note ${expected_note} at t=50`);

    // Query at t=0.05 — the very first event [0.0, 0.15, 60, ...] should be active
    const early = radio._getActiveEvents(0.05, 0.5);
    assert.ok(early.length >= 1, 'Binary search should find first event');
    assert.ok(early.find(e => e.note === 60), 'Should find note 60 at start');

    // Query at a gap — t=0.16 is after [0.0, 0.15] ends and before [0.2, 0.15] starts
    const gap = radio._getActiveEvents(0.16, 0.01);
    const hasFirstNote = gap.some(e => e.note === 60 && e.inst === 'test_inst');
    // First event ends at 0.15, so at 0.16 it should NOT be active
    assert.ok(!hasFirstNote || gap.length === 0,
      'Should not find expired event at t=0.16');
  });
});
