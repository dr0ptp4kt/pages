/**
 * Tests for Cosmic Runner V3 game modules.
 *
 * Run with: node --test apps/cosmic-runner-v3/test/test_game.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// config.js — pure constants, no DOM needed
// ---------------------------------------------------------------------------
const {
  GRID_SIZE, GRID_CELLS, TRACK_COLORS, SCORE,
  GLOW_THRESHOLD, FULL_3D_LEVEL, MAX_MULTI_JUMPS,
  SPEED_MIN, SPEED_MAX, SPEED_STEP, ACCESS_MODES,
} = require('../js/config.js');

describe('config.js', () => {
  it('TRACK_COLORS has 12 entries', () => {
    assert.equal(TRACK_COLORS.length, 12);
  });

  it('each TRACK_COLORS entry has required fields', () => {
    for (const tc of TRACK_COLORS) {
      assert.ok(typeof tc.name === 'string' && tc.name.length > 0);
      assert.ok(Array.isArray(tc.primary) && tc.primary.length === 3);
      assert.ok(Array.isArray(tc.secondary) && tc.secondary.length === 3);
      assert.ok(Array.isArray(tc.bg) && tc.bg.length === 3);
      assert.ok(Array.isArray(tc.starTint) && tc.starTint.length === 3);
      assert.equal(typeof tc.hueBase, 'number');
    }
  });

  it('SCORE values exist', () => {
    assert.equal(typeof SCORE.HIT_OBJECT, 'number');
    assert.equal(typeof SCORE.JUMP_OVER_1, 'number');
    assert.equal(typeof SCORE.JUMP_OVER_2, 'number');
    assert.equal(typeof SCORE.JUMP_OVER_3, 'number');
  });

  it('ACCESS_MODES has 3 entries', () => {
    const keys = Object.keys(ACCESS_MODES);
    assert.equal(keys.length, 3);
    assert.ok(keys.includes('minimal'));
    assert.ok(keys.includes('normal'));
    assert.ok(keys.includes('flashy'));
  });

  it('FULL_3D_LEVEL is 6', () => {
    assert.equal(FULL_3D_LEVEL, 6);
  });

  it('MAX_MULTI_JUMPS is 4', () => {
    assert.equal(MAX_MULTI_JUMPS, 4);
  });

  it('GRID_SIZE is 64', () => {
    assert.equal(GRID_SIZE, 64);
  });

  it('GRID_CELLS equals GRID_SIZE squared', () => {
    assert.equal(GRID_CELLS, GRID_SIZE * GRID_SIZE);
  });

  it('SPEED range is sane', () => {
    assert.ok(SPEED_MIN < SPEED_MAX);
    assert.ok(SPEED_STEP > 0);
  });

  it('GLOW_THRESHOLD is 0.5', () => {
    assert.equal(GLOW_THRESHOLD, 0.5);
  });
});

// ---------------------------------------------------------------------------
// themes.js — pure constants + ThemeManager class (no DOM)
// ---------------------------------------------------------------------------
const { THEMES, STAR_STYLES, ThemeManager } = require('../js/themes.js');

describe('themes.js', () => {
  it('THEMES has entries', () => {
    assert.ok(THEMES.length > 0);
  });

  it('each theme has required fields', () => {
    for (const t of THEMES) {
      assert.equal(typeof t.name, 'string');
      assert.equal(typeof t.hueShift, 'number');
      assert.equal(typeof t.satMult, 'number');
      assert.equal(typeof t.brightMult, 'number');
      assert.ok(Array.isArray(t.accent) && t.accent.length === 3);
    }
  });

  it('STAR_STYLES has 34 entries', () => {
    assert.equal(STAR_STYLES.length, 34);
  });

  it('each star style has id, shape, size, name', () => {
    for (let i = 0; i < STAR_STYLES.length; i++) {
      const s = STAR_STYLES[i];
      assert.equal(s.id, i);
      assert.equal(typeof s.shape, 'string');
      assert.equal(typeof s.size, 'string');
      assert.equal(typeof s.name, 'string');
    }
  });

  describe('ThemeManager', () => {
    let tm;
    beforeEach(() => { tm = new ThemeManager(); });

    it('defaults to theme index 0 and star style 0', () => {
      assert.equal(tm.themeIndex, 0);
      assert.equal(tm.starStyleIndex, 0);
    });

    it('getTheme returns the active theme', () => {
      const theme = tm.getTheme();
      assert.deepStrictEqual(theme, THEMES[0]);
    });

    it('getTheme follows themeIndex', () => {
      tm.themeIndex = 2;
      assert.deepStrictEqual(tm.getTheme(), THEMES[2]);
    });

    it('getStarStyle returns the active star style', () => {
      assert.deepStrictEqual(tm.getStarStyle(), STAR_STYLES[0]);
      tm.starStyleIndex = 5;
      assert.deepStrictEqual(tm.getStarStyle(), STAR_STYLES[5]);
    });

    it('applyTheme returns a CSS hsl string', () => {
      const result = tm.applyTheme(180, 50, 50);
      assert.ok(result.startsWith('hsl('));
      assert.ok(result.endsWith('%)'));
    });

    it('applyTheme applies hue shift correctly', () => {
      // Cosmic theme has hueShift: 0
      const cosmic = tm.applyTheme(100, 50, 50);
      assert.ok(cosmic.includes('100'));

      // Ember theme has hueShift: -20
      tm.themeIndex = 1;
      const ember = tm.applyTheme(100, 50, 50);
      assert.ok(ember.includes('80')); // 100 + (-20) = 80
    });

    it('shiftHue wraps around 360', () => {
      tm.themeIndex = 1; // hueShift: -20
      assert.equal(tm.shiftHue(10), 350); // 10 + (-20) + 360 = 350
      assert.equal(tm.shiftHue(30), 10);  // 30 + (-20) + 360 = 370 % 360 = 10
    });

    it('applyTheme clamps saturation and lightness to 100', () => {
      tm.themeIndex = 7; // Plasma: satMult 1.5, brightMult 1.2
      const result = tm.applyTheme(0, 90, 90);
      // sat: 90*1.5 = 135 -> clamped to 100; bright: 90*1.2 = 108 -> clamped to 100
      assert.ok(result.includes('100%'));
    });

    it('getAccentCSS returns an rgb string', () => {
      const css = tm.getAccentCSS();
      assert.ok(css.startsWith('rgb('));
      const a = THEMES[0].accent;
      assert.ok(css.includes(String(a[0])));
    });
  });
});

// ---------------------------------------------------------------------------
// characters.js — CHARACTERS array + generatePlayerName (pure logic)
// drawCharacter requires canvas context, so we test it with a mock ctx
// ---------------------------------------------------------------------------
const { CHARACTERS, drawCharacter, generatePlayerName } = require('../js/characters.js');

describe('characters.js', () => {
  it('CHARACTERS has 12 entries', () => {
    assert.equal(CHARACTERS.length, 12);
  });

  it('each character has name, shape, color, accent, eyes', () => {
    for (const ch of CHARACTERS) {
      assert.equal(typeof ch.name, 'string');
      assert.equal(typeof ch.shape, 'string');
      assert.equal(typeof ch.color, 'string');
      assert.equal(typeof ch.accent, 'string');
      assert.equal(typeof ch.eyes, 'string');
    }
  });

  it('character names are unique', () => {
    const names = CHARACTERS.map(c => c.name);
    assert.equal(new Set(names).size, names.length);
  });

  describe('drawCharacter with mock canvas context', () => {
    function makeMockCtx() {
      // Minimal mock of CanvasRenderingContext2D for drawCharacter
      return {
        save() {},
        restore() {},
        translate() {},
        scale() {},
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        arc() {},
        ellipse() {},
        quadraticCurveTo() {},
        fill() {},
        stroke() {},
        fillRect() {},
        createRadialGradient() {
          return { addColorStop() {} };
        },
        fillStyle: '',
        strokeStyle: '',
        globalAlpha: 1,
        lineWidth: 1,
        lineCap: 'butt',
      };
    }

    it('does not throw for any character shape', () => {
      const ctx = makeMockCtx();
      for (const ch of CHARACTERS) {
        assert.doesNotThrow(() => {
          drawCharacter(ctx, ch, 100, 100, 30, 30, 0, true, 0, 1);
        }, `drawCharacter threw for shape ${ch.shape}`);
      }
    });

    it('does not throw with glow enabled', () => {
      const ctx = makeMockCtx();
      assert.doesNotThrow(() => {
        drawCharacter(ctx, CHARACTERS[0], 50, 50, 24, 24, 1.5, false, 0.8, 1);
      });
    });
  });

  describe('generatePlayerName', () => {
    it('produces a 3-character string', () => {
      // Deterministic RNG that always returns 0
      const name = generatePlayerName(() => 0);
      assert.equal(name.length, 3);
    });

    it('produces valid names (uppercase letters only)', () => {
      for (let seed = 0; seed < 20; seed++) {
        // Simple seeded RNG
        let s = seed;
        const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
        const name = generatePlayerName(rng);
        assert.ok(name.length >= 2 && name.length <= 4,
          `Name "${name}" length ${name.length} not in 2-4 range`);
        assert.match(name, /^[A-Z]+$/, `Name "${name}" contains non-uppercase chars`);
      }
    });

    it('names contain a mix of vowels and consonants', () => {
      const vowels = new Set('AEIOU');
      const consonants = new Set('BCDFGHJKLMNPQRSTVWXYZ');
      for (let seed = 0; seed < 50; seed++) {
        let s = seed + 100;
        const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
        const name = generatePlayerName(rng);
        const hasVowel = [...name].some(c => vowels.has(c));
        const hasConsonant = [...name].some(c => consonants.has(c));
        // All patterns have at least one vowel and one consonant (VCV, VVC, CVV, VCC)
        assert.ok(hasVowel, `Name "${name}" has no vowel`);
        assert.ok(hasConsonant, `Name "${name}" has no consonant`);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// music-sync.js — MusicSync class + midiToNoteName (pure logic)
// ---------------------------------------------------------------------------
const { MusicSync, midiToNoteName, NOTE_NAMES } = require('../js/music-sync.js');

describe('music-sync.js', () => {
  describe('midiToNoteName', () => {
    it('converts middle C (60) correctly', () => {
      assert.equal(midiToNoteName(60), 'C4');
    });

    it('converts A4 (69) correctly', () => {
      assert.equal(midiToNoteName(69), 'A4');
    });

    it('returns ? for out-of-range values', () => {
      assert.equal(midiToNoteName(-1), '?');
      assert.equal(midiToNoteName(128), '?');
    });

    it('handles boundary values', () => {
      assert.equal(midiToNoteName(0), 'C-1');
      assert.equal(midiToNoteName(127), 'G9');
    });
  });

  describe('NOTE_NAMES', () => {
    it('has 12 entries', () => {
      assert.equal(NOTE_NAMES.length, 12);
    });

    it('starts with C and ends with B', () => {
      assert.equal(NOTE_NAMES[0], 'C');
      assert.equal(NOTE_NAMES[11], 'B');
    });
  });

  describe('MusicSync constructor', () => {
    it('has correct default values', () => {
      const ms = new MusicSync();
      assert.equal(ms.albumData, null);
      assert.deepStrictEqual(ms.tracks, []);
      assert.ok(ms.trackData instanceof Map);
      assert.equal(ms.trackData.size, 0);
      assert.equal(ms.currentTrack, 0);
      assert.equal(ms.hueOffset, 0);
      assert.equal(ms._lastHueShift, 0);
      assert.equal(ms.baseUrl, '');
      assert.equal(ms.audioBaseUrl, '');
    });
  });

  describe('getActiveEvents with compressed V3 data', () => {
    let ms;

    // Sample V3 compressed data: legend maps instrument indices to names,
    // events are arrays [time, duration, note, inst_idx, velocity, channel]
    const sampleLegend = {
      instruments: { '0': 'piano', '1': 'bass', '2': 'strings' },
    };
    // Events sorted by time
    const sampleEvents = [
      [0.0,  0.5,  60, 0, 0.8, 0],  // piano C4 at t=0
      [0.5,  0.5,  64, 0, 0.7, 0],  // piano E4 at t=0.5
      [1.0,  1.0,  48, 1, 0.9, 1],  // bass C3 at t=1.0
      [1.5,  0.5,  67, 2, 0.6, 2],  // strings G4 at t=1.5
      [2.0,  2.0,  72, 0, 0.8, 0],  // piano C5 at t=2.0
      [3.0,  0.5,  55, 1, 0.7, 1],  // bass G3 at t=3.0
      [4.0,  1.0,  60, 2, 0.5, 2],  // strings C4 at t=4.0
      [5.0,  0.5,  65, 0, 0.6, 0],  // piano F4 at t=5.0
      [6.0,  1.0,  70, 1, 0.8, 1],  // bass A#4 at t=6.0
      [7.0,  0.5,  62, 2, 0.7, 2],  // strings D4 at t=7.0
    ];

    beforeEach(() => {
      ms = new MusicSync();
      ms.currentTrack = 0;
      ms.trackData.set(0, { legend: sampleLegend, events: sampleEvents });
    });

    it('returns empty array for time before any events', () => {
      // At t=-1 nothing is active
      const active = ms.getActiveEvents(-1);
      assert.equal(active.length, 0);
    });

    it('finds the event active at t=0.25', () => {
      const active = ms.getActiveEvents(0.25);
      assert.equal(active.length, 1);
      assert.equal(active[0].note, 60);
      assert.equal(active[0].inst, 'piano');
    });

    it('finds overlapping events', () => {
      // At t=1.5: bass event [1.0, 1.0] is active (1.0 <= 1.5 < 2.0),
      // strings event [1.5, 0.5] is active (1.5 <= 1.5 < 2.0)
      const active = ms.getActiveEvents(1.5);
      const notes = active.map(e => e.note).sort();
      assert.ok(notes.includes(48), 'bass C3 should be active');
      assert.ok(notes.includes(67), 'strings G4 should be active');
    });

    it('binary search finds events in the middle of the timeline', () => {
      // At t=5.1: piano F4 [5.0, 0.5] is active
      const active = ms.getActiveEvents(5.1);
      assert.equal(active.length, 1);
      assert.equal(active[0].note, 65);
      assert.equal(active[0].inst, 'piano');
    });

    it('returns empty after all events end', () => {
      const active = ms.getActiveEvents(100);
      assert.equal(active.length, 0);
    });

    it('expands compressed arrays into objects with correct fields', () => {
      const active = ms.getActiveEvents(0.25);
      const ev = active[0];
      assert.equal(typeof ev.t, 'number');
      assert.equal(typeof ev.dur, 'number');
      assert.equal(typeof ev.note, 'number');
      assert.equal(typeof ev.inst, 'string');
      assert.equal(typeof ev.vel, 'number');
      assert.equal(typeof ev.ch, 'number');
    });

    it('resolves instrument names from legend', () => {
      // At t=3.1: bass event [3.0, 0.5] is active,
      // and piano event [2.0, 2.0] also spans to t=4.0
      const active = ms.getActiveEvents(3.1);
      assert.equal(active.length, 2);
      const insts = active.map(e => e.inst).sort();
      assert.deepStrictEqual(insts, ['bass', 'piano']);
    });

    it('returns empty when no track data loaded', () => {
      const ms2 = new MusicSync();
      const active = ms2.getActiveEvents(1.0);
      assert.equal(active.length, 0);
    });
  });

  describe('getEventsInRange', () => {
    let ms;
    const legend = { instruments: { '0': 'piano', '1': 'drums' } };
    const events = [
      [1.0, 0.5, 60, 0, 0.8, 0],
      [2.0, 0.5, 62, 0, 0.7, 0],
      [3.0, 1.0, 36, 1, 0.9, 9],
      [5.0, 0.5, 64, 0, 0.6, 0],
      [8.0, 1.0, 67, 0, 0.8, 0],
    ];

    beforeEach(() => {
      ms = new MusicSync();
      ms.currentTrack = 0;
      ms.trackData.set(0, { legend, events });
    });

    it('returns events that overlap the range', () => {
      const result = ms.getEventsInRange(1.0, 3.5);
      // Events at 1.0, 2.0, 3.0 all overlap [1.0, 3.5]
      assert.equal(result.length, 3);
    });

    it('includes events that start before range but overlap', () => {
      // Event at 3.0 with dur 1.0 ends at 4.0, overlaps range starting at 3.5
      const result = ms.getEventsInRange(3.5, 4.5);
      assert.equal(result.length, 1);
      assert.equal(result[0].note, 36);
    });

    it('returns empty for range with no events', () => {
      const result = ms.getEventsInRange(6.0, 7.0);
      assert.equal(result.length, 0);
    });

    it('expands events into objects with inst name', () => {
      const result = ms.getEventsInRange(3.0, 4.0);
      assert.equal(result[0].inst, 'drums');
    });

    it('returns empty when no track data', () => {
      const ms2 = new MusicSync();
      assert.deepStrictEqual(ms2.getEventsInRange(0, 10), []);
    });
  });

  describe('getEpoch', () => {
    let ms;
    beforeEach(() => { ms = new MusicSync(); });

    it('returns Quantum Dawn at the start', () => {
      const epoch = ms.getEpoch(0, 300);
      assert.equal(epoch.name, 'Quantum Dawn');
      assert.equal(epoch.index, 0);
    });

    it('returns Emergence near the end', () => {
      const epoch = ms.getEpoch(299, 300);
      assert.equal(epoch.name, 'Emergence');
      assert.equal(epoch.index, 5);
    });

    it('returns correct epoch in the middle', () => {
      // 6 epochs over 300s => each ~50s
      // At t=100 => index = floor((100/300)*6) = floor(2.0) = 2
      const epoch = ms.getEpoch(100, 300);
      assert.equal(epoch.name, 'Cosmic Expansion');
      assert.equal(epoch.index, 2);
    });

    it('handles zero or negative duration', () => {
      const epoch = ms.getEpoch(10, 0);
      assert.equal(epoch.name, 'Quantum Dawn');
      assert.equal(epoch.index, 0);
    });

    it('clamps to last epoch for time >= duration', () => {
      const epoch = ms.getEpoch(500, 300);
      assert.equal(epoch.name, 'Emergence');
      assert.equal(epoch.index, 5);
    });

    it('returns all 6 epoch names across the timeline', () => {
      const expected = [
        'Quantum Dawn', 'Stellar Birth', 'Cosmic Expansion',
        'Dark Energy', 'Nebula Phase', 'Emergence',
      ];
      const duration = 600;
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * duration + 1; // slightly past each boundary
        const epoch = ms.getEpoch(t, duration);
        assert.equal(epoch.name, expected[i],
          `At t=${t}, expected "${expected[i]}" but got "${epoch.name}"`);
      }
    });
  });

  describe('getIntensity', () => {
    let ms;
    const legend = { instruments: { '0': 'piano' } };

    beforeEach(() => {
      ms = new MusicSync();
      ms.currentTrack = 0;
    });

    it('returns 0.1 when no events are active', () => {
      ms.trackData.set(0, { legend, events: [] });
      assert.equal(ms.getIntensity(5.0), 0.1);
    });

    it('returns a value between 0 and 1 for active events', () => {
      const events = [
        [1.0, 2.0, 60, 0, 0.8, 0],
        [1.0, 2.0, 64, 0, 0.9, 0],
        [1.0, 2.0, 67, 0, 0.7, 0],
      ];
      ms.trackData.set(0, { legend, events });
      const intensity = ms.getIntensity(1.5);
      assert.ok(intensity > 0 && intensity <= 1,
        `Intensity ${intensity} not in (0, 1]`);
    });

    it('higher velocity produces higher intensity', () => {
      const lowVel = [[1.0, 2.0, 60, 0, 0.2, 0]];
      const highVel = [[1.0, 2.0, 60, 0, 1.0, 0]];

      ms.trackData.set(0, { legend, events: lowVel });
      const lowI = ms.getIntensity(1.5);

      ms.trackData.set(0, { legend, events: highVel });
      const highI = ms.getIntensity(1.5);

      assert.ok(highI > lowI, `High vel intensity ${highI} should exceed low vel ${lowI}`);
    });
  });

  describe('getNoteInfo', () => {
    let ms;
    beforeEach(() => { ms = new MusicSync(); });

    it('formats note info from expanded events', () => {
      const events = [
        { note: 60, inst: 'piano', vel: 0.8 },
        { note: 64, inst: 'piano', vel: 0.7 },
        { note: 48, inst: 'bass', vel: 0.9 },
      ];
      const info = ms.getNoteInfo(events);
      assert.equal(info.length, 3);
      assert.equal(info[0].pitch, 'C4');
      assert.equal(info[0].inst, 'piano');
      assert.equal(info[1].pitch, 'E4');
      assert.equal(info[2].pitch, 'C3');
      assert.equal(info[2].inst, 'bass');
    });

    it('deduplicates by pitch+inst', () => {
      const events = [
        { note: 60, inst: 'piano', vel: 0.8 },
        { note: 60, inst: 'piano', vel: 0.6 },
        { note: 60, inst: 'bass', vel: 0.5 },
      ];
      const info = ms.getNoteInfo(events);
      assert.equal(info.length, 2); // C4-piano and C4-bass
    });

    it('limits output to 12 entries', () => {
      const events = [];
      for (let i = 0; i < 20; i++) {
        events.push({ note: 40 + i, inst: `inst${i}`, vel: 0.5 });
      }
      const info = ms.getNoteInfo(events);
      assert.equal(info.length, 12);
    });

    it('handles missing note/inst/vel gracefully', () => {
      const events = [{ note: undefined, inst: undefined, vel: undefined }];
      const info = ms.getNoteInfo(events);
      assert.equal(info.length, 1);
      assert.equal(info[0].pitch, 'C4'); // midiToNoteName(60) default
      assert.equal(info[0].inst, 'unknown');
      assert.equal(info[0].vel, 0.5);
    });
  });

  describe('V3 compressed format integration', () => {
    it('binary search correctly locates events in large sorted dataset', () => {
      const ms = new MusicSync();
      ms.currentTrack = 0;

      // Generate 1000 events spanning 100 seconds
      const legend = { instruments: { '0': 'synth', '1': 'pad' } };
      const events = [];
      for (let i = 0; i < 1000; i++) {
        const t = i * 0.1;
        events.push([t, 0.08, 60 + (i % 24), i % 2, 0.5 + (i % 5) * 0.1, 0]);
      }
      ms.trackData.set(0, { legend, events });

      // Query near the middle: t=50.0
      // Event at index 500: [50.0, 0.08, ...]
      const active = ms.getActiveEvents(50.02);
      assert.ok(active.length >= 1, 'Should find at least one event at t=50.02');
      assert.ok(active.some(e => e.t === 50.0), 'Should include event starting at 50.0');
      assert.equal(active[0].inst === 'synth' || active[0].inst === 'pad', true);
    });

    it('legend instrument lookup works for all indices', () => {
      const ms = new MusicSync();
      ms.currentTrack = 0;

      const legend = {
        instruments: {
          '0': 'acoustic_piano',
          '1': 'electric_bass',
          '2': 'violin_section',
          '3': 'trumpet',
        },
      };
      const events = [
        [0.0, 1.0, 60, 0, 0.8, 0],
        [0.0, 1.0, 48, 1, 0.7, 1],
        [0.0, 1.0, 72, 2, 0.6, 2],
        [0.0, 1.0, 67, 3, 0.9, 3],
      ];
      ms.trackData.set(0, { legend, events });

      const active = ms.getActiveEvents(0.5);
      assert.equal(active.length, 4);
      const insts = active.map(e => e.inst).sort();
      assert.deepStrictEqual(insts, [
        'acoustic_piano', 'electric_bass', 'trumpet', 'violin_section',
      ]);
    });

    it('handles unknown instrument index gracefully', () => {
      const ms = new MusicSync();
      ms.currentTrack = 0;

      const legend = { instruments: { '0': 'piano' } };
      // inst_idx 5 is not in legend
      const events = [[0.0, 1.0, 60, 5, 0.8, 0]];
      ms.trackData.set(0, { legend, events });

      const active = ms.getActiveEvents(0.5);
      assert.equal(active.length, 1);
      assert.equal(active[0].inst, 'unknown');
    });
  });
});
