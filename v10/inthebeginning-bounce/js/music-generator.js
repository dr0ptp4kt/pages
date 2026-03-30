/**
 * Browser-Based Procedural Music Generator for inthebeginning bounce V7.
 *
 * Ported from Python composer.py cosmic music engine. Generates a 60-minute
 * universe cycle (12 tracks of ~5 min each) entirely in the browser using
 * SynthEngine. Each track represents a cosmic epoch with distinct musical
 * character drawn from world musical traditions.
 *
 * Features:
 * - 44 world musical scales (Western, Japanese, Chinese, Middle Eastern,
 *   Indian, African, Ancient/tribal)
 * - 15 harmonic progressions (classical, minimalist, drone, modal)
 * - 25 rhythm patterns (African bell, polyrhythmic, gamelan, Indian tala)
 * - 30 melodic motifs from public domain works (Bach, Mozart, Beethoven,
 *   Chopin, Debussy, Satie, Grieg, Dvořák, traditional Asian/African)
 * - Epoch-aware selection of scales, rhythms, progressions, and motifs
 * - Seed-based deterministic generation (same seed = same music)
 * - Humanization (timing jitter ±10-50ms)
 * - Style sliders: arpeggioAmount, chordDensity, bendAmount, speed
 * - Emits note events for grid visualization
 *
 * No external dependencies — uses SynthEngine for all audio.
 */

// ═══════════════════════════════════════════════════════════════════════════
// WORLD MUSICAL SCALES — 44 scales from 6 traditions
// Intervals in semitones from root. Sourced from ethnomusicological canon.
// Ported from Python composer.py
// ═══════════════════════════════════════════════════════════════════════════

const MG_SCALES = {
  // --- Western modes ---
  ionian:         [0, 2, 4, 5, 7, 9, 11],       // Major
  dorian:         [0, 2, 3, 5, 7, 9, 10],
  phrygian:       [0, 1, 3, 5, 7, 8, 10],
  lydian:         [0, 2, 4, 6, 7, 9, 11],
  mixolydian:     [0, 2, 4, 5, 7, 9, 10],
  aeolian:        [0, 2, 3, 5, 7, 8, 10],       // Natural minor
  locrian:        [0, 1, 3, 5, 6, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor:  [0, 2, 3, 5, 7, 9, 11],
  whole_tone:     [0, 2, 4, 6, 8, 10],
  chromatic:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  blues:          [0, 3, 5, 6, 7, 10],

  // --- Pentatonic variations ---
  pentatonic_major: [0, 2, 4, 7, 9],
  pentatonic_minor: [0, 3, 5, 7, 10],

  // --- Japanese ---
  hirajoshi:      [0, 2, 3, 7, 8],              // Koto tuning
  in_sen:         [0, 1, 5, 7, 10],             // Shakuhachi
  iwato:          [0, 1, 5, 6, 10],             // Dark, ritualistic
  yo:             [0, 2, 5, 7, 9],              // Folk songs
  miyako_bushi:   [0, 1, 5, 7, 8],              // City music

  // --- Chinese ---
  gong:           [0, 2, 4, 7, 9],              // Palace mode (= major pent)
  shang:          [0, 2, 5, 7, 10],             // Merchants
  jue:            [0, 3, 5, 8, 10],             // Horn
  zhi:            [0, 2, 5, 7, 9],              // Wings
  yu:             [0, 3, 5, 7, 10],             // Feathers (= minor pent)

  // --- Middle Eastern ---
  hijaz:          [0, 1, 4, 5, 7, 8, 11],       // Hijaz maqam
  bayati:         [0, 1.5, 3, 5, 7, 8, 10],     // Quarter-tone approx
  rast:           [0, 2, 3.5, 5, 7, 9, 10.5],   // Quarter-tone
  saba:           [0, 1.5, 3, 4, 7, 8, 10],
  nahawand:       [0, 2, 3, 5, 7, 8, 11],       // ~ harmonic minor

  // --- Indian ragas (ascending forms) ---
  bhairav:        [0, 1, 4, 5, 7, 8, 11],       // Dawn raga, devotional
  yaman:          [0, 2, 4, 6, 7, 9, 11],       // Evening (= lydian)
  malkauns:       [0, 3, 5, 8, 10],             // Night raga, pentatonic
  bhairavi:       [0, 1, 3, 5, 7, 8, 10],       // Morning (= phrygian)
  todi:           [0, 1, 3, 6, 7, 8, 11],       // Late morning, serious

  // --- African ---
  equi_pent:      [0, 2.4, 4.8, 7.2, 9.6],     // Equidistant pentatonic
  mbira:          [0, 2, 4, 7, 9],              // Zimbabwean mbira
  kora:           [0, 2, 4, 5, 7, 9, 11],       // West African kora (major)

  // --- Ancient/tribal ---
  drone:          [0, 7],                        // Fifth-based drone
  tetrachord:     [0, 2, 4, 5],                  // Ancient Greek
  slendro:        [0, 2.4, 4.8, 7.2, 9.6],     // Javanese gamelan
  pelog:          [0, 1, 3, 7, 8],              // Javanese gamelan
};

// Epoch-to-scale families mapping
const MG_EPOCH_SCALES = {
  'Quantum Fluctuation': ['chromatic', 'whole_tone', 'drone'],
  'Inflation':           ['whole_tone', 'drone', 'slendro'],
  'Quark-Gluon Plasma':  ['phrygian', 'iwato', 'saba'],
  'Nucleosynthesis':     ['hirajoshi', 'in_sen', 'todi'],
  'Recombination':       ['pentatonic_minor', 'yo', 'bhairav'],
  'Dark Ages':           ['dorian', 'mixolydian', 'rast'],
  'First Stars':         ['pentatonic_major', 'gong', 'yaman'],
  'Galaxy Formation':    ['lydian', 'hijaz', 'bhairav'],
  'Solar Ignition':      ['ionian', 'kora', 'harmonic_minor'],
  'Hadean Earth':        ['aeolian', 'miyako_bushi', 'nahawand'],
  'Abiogenesis':         ['blues', 'pentatonic_minor', 'malkauns'],
  'Emergence of Life':   ['melodic_minor', 'bhairavi', 'pelog'],
};

// ═══════════════════════════════════════════════════════════════════════════
// HARMONIC PROGRESSIONS — 15 progressions from classical to drone
// Each progression: list of scale degree offsets (0 = root)
// ═══════════════════════════════════════════════════════════════════════════

const MG_PROGRESSIONS = {
  // Western classical / popular
  I_V_vi_IV:        [0, 7, 9, 5],       // Pop canon
  I_IV_V:           [0, 5, 7],           // Folk/blues
  i_VII_VI_V:       [0, 10, 8, 7],      // Andalusian cadence
  circle_of_fifths: [0, 7, 2, 9, 4, 11, 6, 1],  // Full circle
  bach_cmaj:        [0, 5, 7, 0, 5, 7, 5, 0],    // Based on Prelude in C

  // Minimalist
  glass_1:          [0, 5, 0, 7],        // Philip Glass-style
  glass_2:          [0, 3, 7, 3],
  riley_rainbow:    [0, 2, 4, 7, 9],    // Terry Riley-style

  // Drone-based
  tanpura:          [0, 7],              // Indian drone (sa-pa)
  didgeridoo:       [0],                 // Fundamental drone
  bagpipe:          [0, 7, 12],          // Drone + fifth + octave

  // East Asian
  parallel_4ths:    [0, 5, 10, 3],       // Japanese parallel motion
  parallel_5ths:    [0, 7, 2, 9],

  // Modal
  aeolian_drift:    [0, 3, 7, 10, 0, 5, 8, 3],
  phrygian_pulse:   [0, 1, 5, 7],
  lydian_float:     [0, 6, 4, 2],
};

// Epoch-to-progression mapping
const MG_EPOCH_PROGRESSIONS = {
  'Quantum Fluctuation': ['didgeridoo', 'tanpura'],
  'Inflation':           ['tanpura', 'bagpipe'],
  'Quark-Gluon Plasma':  ['phrygian_pulse', 'aeolian_drift'],
  'Nucleosynthesis':     ['parallel_4ths', 'glass_1'],
  'Recombination':       ['glass_2', 'riley_rainbow'],
  'Dark Ages':           ['circle_of_fifths', 'bach_cmaj'],
  'First Stars':         ['I_IV_V', 'glass_1', 'parallel_5ths'],
  'Galaxy Formation':    ['i_VII_VI_V', 'bach_cmaj'],
  'Solar Ignition':      ['I_V_vi_IV', 'circle_of_fifths'],
  'Hadean Earth':        ['I_V_vi_IV', 'I_IV_V', 'aeolian_drift'],
  'Abiogenesis':         ['glass_1', 'riley_rainbow', 'I_V_vi_IV'],
  'Emergence of Life':   ['bach_cmaj', 'glass_2', 'circle_of_fifths'],
};

// ═══════════════════════════════════════════════════════════════════════════
// RHYTHM PATTERNS — 25 patterns from basic meters to polyrhythmic
// Each pattern: list of floats (0..1) representing beat onsets within one cycle
// ═══════════════════════════════════════════════════════════════════════════

const MG_RHYTHM_PATTERNS = {
  // Basic meters
  '4_4_straight':     [0.0, 0.25, 0.5, 0.75],
  '3_4_waltz':        [0.0, 0.333, 0.667],
  '6_8_compound':     [0.0, 0.167, 0.333, 0.5, 0.667, 0.833],

  // West African bell patterns
  gahu:             [0.0, 0.083, 0.25, 0.333, 0.5, 0.583, 0.75],
  agbadza:          [0.0, 0.167, 0.333, 0.417, 0.583, 0.75, 0.833],
  ewe_bell:         [0.0, 0.083, 0.25, 0.417, 0.5, 0.667, 0.833],

  // Polyrhythmic
  poly_3_2:         [0.0, 0.333, 0.5, 0.667],
  poly_4_3:         [0.0, 0.25, 0.333, 0.5, 0.667, 0.75],
  poly_5_4:         [0.0, 0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8],
  poly_5_3:         [0.0, 0.2, 0.333, 0.4, 0.6, 0.667, 0.8],
  poly_7_4:         [0.0, 0.143, 0.25, 0.286, 0.429, 0.5, 0.571, 0.714, 0.75, 0.857],

  // Gamelan interlocking (kotekan)
  kotekan_polos:    [0.0, 0.25, 0.5, 0.75],
  kotekan_sangsih:  [0.125, 0.375, 0.625, 0.875],

  // Minimalist / phasing (Steve Reich-style)
  phase_a:          [0.0, 0.167, 0.333, 0.667, 0.833],
  phase_b:          [0.0, 0.182, 0.364, 0.545, 0.727],

  // Indian tala patterns
  teen_taal:        [0.0, 0.0625, 0.125, 0.1875, 0.25, 0.3125, 0.375, 0.4375,
                     0.5, 0.5625, 0.625, 0.6875, 0.75, 0.8125, 0.875, 0.9375],
  jhaptaal:         [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],

  // Sparse / ambient
  sparse_1:         [0.0, 0.4],
  sparse_2:         [0.0, 0.3, 0.7],
  heartbeat:        [0.0, 0.15],
};

// Epoch-to-rhythm mapping
const MG_EPOCH_RHYTHMS = {
  'Quantum Fluctuation': ['sparse_1'],
  'Inflation':           ['sparse_1', 'sparse_2'],
  'Quark-Gluon Plasma':  ['sparse_2', '3_4_waltz'],
  'Nucleosynthesis':     ['poly_3_2', 'phase_a'],
  'Recombination':       ['poly_3_2', '4_4_straight'],
  'Dark Ages':           ['gahu', 'poly_4_3', '6_8_compound'],
  'First Stars':         ['agbadza', 'kotekan_polos', '3_4_waltz'],
  'Galaxy Formation':    ['ewe_bell', 'poly_5_4', 'teen_taal'],
  'Solar Ignition':      ['4_4_straight', '6_8_compound', 'poly_5_3'],
  'Hadean Earth':        ['gahu', 'jhaptaal', 'poly_7_4'],
  'Abiogenesis':         ['heartbeat', '4_4_straight', 'agbadza'],
  'Emergence of Life':   ['phase_a', 'phase_b', 'poly_5_4', 'kotekan_polos'],
};

// ═══════════════════════════════════════════════════════════════════════════
// MELODIC MOTIFS — 30 motifs from public domain works (pre-1929)
// Intervals in semitones (scale degrees from root)
// ═══════════════════════════════════════════════════════════════════════════

const MG_MOTIFS = {
  // J.S. Bach
  bach_prelude:     [0, 4, 7, 12, 16, 12, 7, 4],         // Prelude in C BWV 846
  bach_cello:       [0, 7, 4, 7, 0, 7, 4, 7, 2, 9, 5, 9, 2, 9, 5, 9], // Cello Suite No.1

  // Mozart
  mozart_nacht:     [0, 0, 7, 7, 9, 9, 7],               // Eine kleine Nachtmusik
  mozart_turca:     [0, 2, 0, -1, 0, 2, 0, -1, 0, 4, 7], // Rondo alla Turca

  // Beethoven
  beethoven_elise:  [0, -1, 0, -1, 0, -5, 2, 0, -3],     // Für Elise
  beethoven_5th:    [0, 0, 0, -4],                         // Symphony No.5
  moonlight:        [0, 4, 7, 0, 4, 7, 0, 4, 7, 0, 4, 7], // Moonlight Sonata

  // Chopin
  chopin_nocturne:  [0, 5, 4, 2, 0, -1, 0, 2, 4],        // Nocturne Op.9 No.2

  // Debussy
  debussy_clair:    [0, -2, -4, -5, -7, -5, -4, -2],     // Clair de Lune
  debussy_arab:     [0, 2, 4, 7, 9, 7, 4, 2, 0],         // Arabesque No.1

  // Satie
  satie_gymno:      [0, 7, 5, 3, 0, -2, 0, 3],           // Gymnopédie No.1

  // Grieg
  grieg_morning:    [0, 2, 4, 7, 9, 12, 9, 7, 4, 2],     // Morning Mood

  // Dvořák
  dvorak_largo:     [0, 2, 4, 2, 0, -3, 0, 2, 4, 7, 4, 2], // New World largo

  // Traditional pentatonic
  pentatonic_rise:  [0, 2, 4, 7, 9, 12],
  pentatonic_fall:  [12, 9, 7, 4, 2, 0],
  pentatonic_wave:  [0, 4, 2, 7, 4, 9, 7, 12],

  // Japanese — Sakura (traditional)
  sakura:           [0, 0, 2, 0, 0, 2, 0, 2, 5, 7, 5, 2, 0, -3, 0],

  // Chinese — Jasmine Flower (traditional)
  jasmine:          [0, 2, 4, 7, 7, 9, 7, 4, 2, 4, 2, 0],

  // Indian raga phrases
  raga_ascend:      [0, 1, 4, 5, 7, 8, 11, 12],
  raga_descend:     [12, 11, 8, 7, 5, 4, 1, 0],

  // African / call-and-response
  call_response:    [0, 4, 7, 4, 0, -3, 0],
  mbira_pattern:    [0, 7, 4, 0, 9, 7, 4, 0, 12, 9, 7, 4],
};

// Epoch-to-motif mapping
const MG_EPOCH_MOTIFS = {
  'Quantum Fluctuation': ['pentatonic_rise'],
  'Inflation':           ['pentatonic_wave', 'raga_ascend'],
  'Quark-Gluon Plasma':  ['sakura', 'raga_ascend'],
  'Nucleosynthesis':     ['bach_prelude', 'jasmine'],
  'Recombination':       ['call_response', 'mbira_pattern'],
  'Dark Ages':           ['grieg_morning', 'pentatonic_rise', 'bach_cello'],
  'First Stars':         ['satie_gymno', 'debussy_clair', 'dvorak_largo'],
  'Galaxy Formation':    ['moonlight', 'chopin_nocturne', 'raga_ascend'],
  'Solar Ignition':      ['bach_prelude', 'mozart_nacht', 'debussy_arab'],
  'Hadean Earth':        ['debussy_clair', 'grieg_morning', 'dvorak_largo', 'sakura'],
  'Abiogenesis':         ['beethoven_elise', 'chopin_nocturne', 'jasmine'],
  'Emergence of Life':   ['bach_cello', 'mozart_turca', 'mbira_pattern'],
};

// ═══════════════════════════════════════════════════════════════════════════
// INSTRUMENT TIMBRES — harmonic profiles for epoch-aware timbre selection
// ═══════════════════════════════════════════════════════════════════════════

const MG_DOMAIN_TIMBRES = {
  subatomic: ['sine', 'cosmic', 'tibetan_bowl', 'throat_sing'],
  atomic:    ['bell', 'gamelan', 'harp', 'flute'],
  molecular: ['piano', 'clarinet', 'choir_ah', 'warm_pad'],
  biological:['cello', 'oboe', 'violin', 'choir_oo'],
  geological:['horn', 'trumpet', 'piano', 'harp'],
  cosmic:    ['cosmic', 'choir_ah', 'warm_pad', 'tibetan_bowl'],
};

// ═══════════════════════════════════════════════════════════════════════════
// RONDO PATTERNS — Classical form structures for section recurrence
// Ported from Python radio_engine.py RONDO_PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

const MG_RONDO_PATTERNS = {
  'ABACA':   ['A', 'B', 'A', 'C', 'A'],
  'ABACADA': ['A', 'B', 'A', 'C', 'A', 'D', 'A'],
  'ABCBA':   ['A', 'B', 'C', 'B', 'A'],
  'AABBA':   ['A', 'A', 'B', 'B', 'A'],
  'ABCDA':   ['A', 'B', 'C', 'D', 'A'],
  'ABACBA':  ['A', 'B', 'A', 'C', 'B', 'A'],
  'AABA':    ['A', 'A', 'B', 'A'],
};
const MG_RONDO_NAMES = Object.keys(MG_RONDO_PATTERNS);

// Section transposition offsets (semitones from A section root)
const MG_SECTION_TRANSPOSE = { 'A': 0, 'B': 5, 'C': -3, 'D': 7 };

// ═══════════════════════════════════════════════════════════════════════════
// ARPEGGIO FORMS — 6 patterns for chord voicing variation
// Ported from Python radio_engine.py ARPEGGIO_FORMS
// ═══════════════════════════════════════════════════════════════════════════

const MG_ARPEGGIO_FORMS = {
  block:      notes => notes,
  ascending:  notes => [...notes].sort((a, b) => a - b),
  descending: notes => [...notes].sort((a, b) => b - a),
  alberti:    notes => {
    if (notes.length < 3) return notes;
    const s = [...notes].sort((a, b) => a - b);
    return [s[0], s[s.length - 1], s[1 % s.length], s[s.length - 1]];
  },
  broken:     notes => {
    if (notes.length < 3) return notes;
    const s = [...notes].sort((a, b) => a - b);
    return [s[0], s[2 % s.length], s[1], s[s.length - 1]];
  },
  pendulum:   notes => {
    const asc = [...notes].sort((a, b) => a - b);
    const desc = [...asc].reverse().slice(1, -1);
    return asc.concat(desc);
  },
};
const MG_ARPEGGIO_NAMES = Object.keys(MG_ARPEGGIO_FORMS);

// ═══════════════════════════════════════════════════════════════════════════
// CONSONANCE ENGINE — Harmonic interval scoring and voice adjustment
// Ported from Python radio_engine.py ConsonanceEngine
// ═══════════════════════════════════════════════════════════════════════════

const MG_INTERVAL_CONSONANCE = [
  1.0,   // 0: unison
  0.05,  // 1: minor 2nd
  0.3,   // 2: major 2nd
  0.7,   // 3: minor 3rd
  0.75,  // 4: major 3rd
  0.8,   // 5: perfect 4th
  0.15,  // 6: tritone
  0.95,  // 7: perfect 5th
  0.7,   // 8: minor 6th
  0.75,  // 9: major 6th
  0.3,   // 10: minor 7th
  0.2,   // 11: major 7th
];

class ConsonanceEngine {
  /** Score the composite consonance of all simultaneous notes (0-1). */
  static scoreComposite(notes) {
    if (notes.length < 2) return 1.0;
    let total = 0, pairs = 0;
    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const interval = Math.abs(notes[i] - notes[j]) % 12;
        total += MG_INTERVAL_CONSONANCE[interval];
        pairs++;
      }
    }
    return pairs > 0 ? total / pairs : 1.0;
  }

  /**
   * Adjust voices for consonance. Tries shifting worst-sounding notes
   * by ±1-2 semitones and snapping to scale until score >= minScore.
   * @param {number[]} notes - MIDI note numbers.
   * @param {number[]} scale - Scale intervals from root.
   * @param {number} root - Root MIDI note.
   * @param {number} minScore - Minimum acceptable consonance (default 0.55).
   * @returns {number[]} Adjusted notes.
   */
  static adjust(notes, scale, root, minScore = 0.55) {
    let current = [...notes];
    for (let pass = 0; pass < 5; pass++) {
      const score = ConsonanceEngine.scoreComposite(current);
      if (score >= minScore) return current;

      // Find the note contributing most dissonance
      let worstIdx = 0, worstScore = 999;
      for (let i = 0; i < current.length; i++) {
        let noteScore = 0, count = 0;
        for (let j = 0; j < current.length; j++) {
          if (i === j) continue;
          noteScore += MG_INTERVAL_CONSONANCE[Math.abs(current[i] - current[j]) % 12];
          count++;
        }
        const avg = count > 0 ? noteScore / count : 1;
        if (avg < worstScore) { worstScore = avg; worstIdx = i; }
      }

      // Try adjustments: ±1, ±2 semitones, snap to scale
      let bestNote = current[worstIdx], bestComposite = ConsonanceEngine.scoreComposite(current);
      for (const delta of [-1, 1, -2, 2]) {
        const candidate = current[worstIdx] + delta;
        // Snap to nearest scale note
        const snapped = ConsonanceEngine._snapToScale(candidate, scale, root);
        const trial = [...current];
        trial[worstIdx] = snapped;
        const trialScore = ConsonanceEngine.scoreComposite(trial);
        if (trialScore > bestComposite) {
          bestComposite = trialScore;
          bestNote = snapped;
        }
      }
      current[worstIdx] = bestNote;
    }
    return current;
  }

  /** Snap a MIDI note to the nearest note in the given scale. */
  static _snapToScale(note, scale, root) {
    const octave = Math.floor((note - root) / 12);
    let closest = note, minDist = 999;
    for (const interval of scale) {
      const scaleNote = root + octave * 12 + interval;
      for (const oct of [scaleNote - 12, scaleNote, scaleNote + 12]) {
        const dist = Math.abs(note - oct);
        if (dist < minDist) { minDist = dist; closest = oct; }
      }
    }
    return closest;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DIATONIC CHORD QUALITIES — scale-degree-specific chord types
// ═══════════════════════════════════════════════════════════════════════════

const MG_CHORD_INTERVALS = {
  maj:  [0, 4, 7],
  min:  [0, 3, 7],
  dim:  [0, 3, 6],
  aug:  [0, 4, 8],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
};

const MG_DIATONIC_QUALITY = {
  ionian:          ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
  dorian:          ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
  phrygian:        ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
  lydian:          ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
  mixolydian:      ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
  aeolian:         ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
  harmonic_minor:  ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim'],
};

class MusicGenerator {
  /**
   * @param {SynthEngine} synthEngine - Shared SynthEngine instance for audio.
   */
  constructor(synthEngine) {
    /** @type {SynthEngine} */
    this._synth = synthEngine;

    // ──── Generation Parameters ────
    /** @type {number} Random seed for deterministic generation. */
    this.seed = 0;
    /** @type {number} Arpeggio/run amount (0-1, default 0.3). */
    this.arpeggioAmount = 0.3;
    /** @type {number} Chord density (0-1, default 0.5). */
    this.chordDensity = 0.5;
    /** @type {number} Note bending amount (0-1, default 0.2). */
    this.bendAmount = 0.2;
    /** @type {number} Playback speed multiplier (0.25-4.0, default 1.0). */
    this.speed = 1.0;

    // ──── Track Data ────
    /** @type {number} Total universe cycle duration in seconds (60 min = 12 tracks). */
    this.cycleDuration = 60 * 60;
    /** @type {number} Number of tracks per cycle (matches 12 game levels). */
    this.trackCount = 12;
    /** @type {number} Duration per track in seconds (~5 min). */
    this.trackDuration = this.cycleDuration / this.trackCount;
    /** @type {Array<Array<Object>>} Generated note events per track. */
    this._tracks = [];
    /** @type {Array<string>} Track names. */
    this._trackNames = [];

    // ──── Playback State ────
    /** @type {boolean} */
    this.isPlaying = false;
    /** @type {number} Current track index (0-5). */
    this.currentTrack = 0;
    /** @type {number} Current playback time in seconds (within track). */
    this._currentTime = 0;
    /** @type {number} AudioContext.currentTime when play started. */
    this._startCtxTime = 0;
    /** @type {number} Next note index to schedule. */
    this._nextNote = 0;
    /** @type {number} RAF ID for scheduling loop. */
    this._rafId = 0;
    /** @type {number} Interval ID for note event emission. */
    this._emitInterval = 0;

    // ──── PRNG State ────
    /** @type {number} Internal PRNG state. */
    this._rngState = 0;

    // ──── Callbacks ────
    /** @type {Function|null} Called with active note events for visualization. */
    this.onNoteEvent = null;
    /** @type {Function|null} Called when current track ends. */
    this.onTrackEnd = null;

    // ──── Epoch Definitions ────
    // 12 epochs matching the game's 12-level structure. Each epoch has
    // distinct timbres, tempos, and density. Scales, progressions, rhythms,
    // and motifs are selected from the MG_EPOCH_* tables above.
    this._epochs = [
      { name: 'Quantum Fluctuation', inst: 'cosmic',  melodyInst: 'bell',    baseNote: 48, tempoBase: 65,  percChance: 0.15, padInst: 'warm_pad',  bassInst: 'cello', density: 0.7,  fillInst: 'flute',   domain: 'subatomic' },
      { name: 'Inflation',           inst: 'bell',    melodyInst: 'piano',   baseNote: 52, tempoBase: 78,  percChance: 0.25, padInst: 'choir_oo',  bassInst: 'cello', density: 0.8,  fillInst: 'violin',  domain: 'subatomic' },
      { name: 'Quark-Gluon Plasma',  inst: 'cosmic',  melodyInst: 'violin',  baseNote: 50, tempoBase: 85,  percChance: 0.3,  padInst: 'warm_pad',  bassInst: 'cello', density: 0.85, fillInst: 'bell',    domain: 'atomic' },
      { name: 'Nucleosynthesis',     inst: 'violin',  melodyInst: 'flute',   baseNote: 55, tempoBase: 90,  percChance: 0.35, padInst: 'cello',     bassInst: 'cello', density: 0.9,  fillInst: 'piano',   domain: 'atomic' },
      { name: 'Recombination',       inst: 'piano',   melodyInst: 'bell',    baseNote: 57, tempoBase: 95,  percChance: 0.35, padInst: 'choir_ah',  bassInst: 'cello', density: 0.9,  fillInst: 'flute',   domain: 'molecular' },
      { name: 'Dark Ages',           inst: 'cello',   melodyInst: 'cosmic',  baseNote: 45, tempoBase: 60,  percChance: 0.2,  padInst: 'warm_pad',  bassInst: 'cello', density: 0.75, fillInst: 'horn',    domain: 'cosmic' },
      { name: 'First Stars',         inst: 'bell',    melodyInst: 'trumpet', baseNote: 60, tempoBase: 100, percChance: 0.4,  padInst: 'choir_oo',  bassInst: 'cello', density: 0.95, fillInst: 'violin',  domain: 'cosmic' },
      { name: 'Galaxy Formation',    inst: 'piano',   melodyInst: 'violin',  baseNote: 60, tempoBase: 105, percChance: 0.45, padInst: 'warm_pad',  bassInst: 'cello', density: 1.0,  fillInst: 'flute',   domain: 'cosmic' },
      { name: 'Solar Ignition',      inst: 'trumpet', melodyInst: 'horn',    baseNote: 57, tempoBase: 112, percChance: 0.5,  padInst: 'horn',      bassInst: 'cello', density: 1.0,  fillInst: 'bell',    domain: 'geological' },
      { name: 'Hadean Earth',        inst: 'cello',   melodyInst: 'piano',   baseNote: 53, tempoBase: 88,  percChance: 0.4,  padInst: 'choir_ah',  bassInst: 'cello', density: 0.95, fillInst: 'trumpet', domain: 'geological' },
      { name: 'Abiogenesis',         inst: 'flute',   melodyInst: 'violin',  baseNote: 62, tempoBase: 92,  percChance: 0.35, padInst: 'warm_pad',  bassInst: 'cello', density: 0.9,  fillInst: 'piano',   domain: 'biological' },
      { name: 'Emergence of Life',   inst: 'flute',   melodyInst: 'piano',   baseNote: 64, tempoBase: 95,  percChance: 0.35, padInst: 'choir_ah',  bassInst: 'cello', density: 0.9,  fillInst: 'bell',    domain: 'biological' },
    ];
  }

  // ──── PRNG (Mulberry32) ────

  _seedRng(seed) {
    this._rngState = seed | 0;
  }

  /** @returns {number} Random float in [0, 1). */
  _rand() {
    let t = (this._rngState += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @returns {number} Random int in [min, max). */
  _randInt(min, max) {
    return min + Math.floor(this._rand() * (max - min));
  }

  /** Pick random element from array. */
  _pick(arr) {
    return arr[Math.floor(this._rand() * arr.length)];
  }

  // ──── Generation ────

  /**
   * Generate a complete 30-minute universe cycle.
   * @param {number} [seed] - Random seed (auto-generated if not provided).
   */
  generate(seed) {
    this.seed = seed !== undefined ? seed : Math.floor(Math.random() * 2147483647);
    this._seedRng(this.seed);

    this._tracks = [];
    this._trackNames = [];

    for (let i = 0; i < this.trackCount; i++) {
      const epoch = this._epochs[i];
      this._trackNames.push(epoch.name);
      const notes = this._generateTrack(epoch, i);
      this._tracks.push(notes);
    }
  }

  /**
   * Generate note events for one track/epoch.
   * @param {Object} epoch - Epoch configuration.
   * @param {number} epochIndex - Index (0-5).
   * @returns {Array<Object>} Sorted note events.
   */
  _generateTrack(epoch, epochIndex) {
    const notes = [];
    const dur = this.trackDuration;
    const bpm = epoch.tempoBase + this._randInt(-8, 8);
    const beatDur = 60 / bpm;
    const density = epoch.density || 1.0;

    // Resolve scale from data tables (pick one randomly per track)
    const epochScales = MG_EPOCH_SCALES[epoch.name];
    const scaleName = epochScales ? this._pick(epochScales) : 'ionian';
    epoch.scale = MG_SCALES[scaleName] || MG_SCALES.ionian;
    epoch._scaleName = scaleName;

    // Resolve progression
    const epochProgs = MG_EPOCH_PROGRESSIONS[epoch.name];
    const progName = epochProgs ? this._pick(epochProgs) : 'I_V_vi_IV';
    epoch._progression = MG_PROGRESSIONS[progName] || MG_PROGRESSIONS.I_V_vi_IV;

    // Resolve rhythm pattern
    const epochRhythms = MG_EPOCH_RHYTHMS[epoch.name];
    const rhythmName = epochRhythms ? this._pick(epochRhythms) : '4_4_straight';
    epoch._rhythmPattern = MG_RHYTHM_PATTERNS[rhythmName] || MG_RHYTHM_PATTERNS['4_4_straight'];

    // Resolve motif pool
    const epochMotifs = MG_EPOCH_MOTIFS[epoch.name];
    epoch._motifPool = (epochMotifs || ['pentatonic_rise']).map(
      m => MG_MOTIFS[m] || MG_MOTIFS.pentatonic_rise
    );

    // ──── Rondo Form ────
    // Divide track into sections following a classical rondo pattern
    const rondoName = this._pick(MG_RONDO_NAMES);
    const rondoPattern = MG_RONDO_PATTERNS[rondoName];
    const sectionDur = dur / rondoPattern.length;
    epoch._rondoPattern = rondoName;

    for (let si = 0; si < rondoPattern.length; si++) {
      const section = rondoPattern[si];
      const sectionStart = si * sectionDur;
      const transpose = MG_SECTION_TRANSPOSE[section] || 0;
      const arpeggioForm = MG_ARPEGGIO_NAMES[si % MG_ARPEGGIO_NAMES.length];

      // Create a section-local epoch variant with transposition
      const sEpoch = Object.assign({}, epoch, {
        baseNote: epoch.baseNote + transpose,
        _arpeggioForm: arpeggioForm,
      });

      // Generate layers into a temporary array, then offset all times
      const sectionNotes = [];
      this._generatePadLayer(sectionNotes, sEpoch, sectionDur, beatDur);
      this._generateBassLayer(sectionNotes, sEpoch, sectionDur, beatDur, density);
      this._generateMelodyLayer(sectionNotes, sEpoch, sectionDur, beatDur);
      this._generateCounterMelodyLayer(sectionNotes, sEpoch, sectionDur, beatDur, density);
      this._generateChordLayer(sectionNotes, sEpoch, sectionDur, beatDur);
      this._generateArpeggioLayer(sectionNotes, sEpoch, sectionDur, beatDur);
      this._generateFillLayer(sectionNotes, sEpoch, sectionDur, beatDur, density);

      // Apply consonance adjustment to simultaneous chord notes
      this._applyConsonance(sectionNotes, sEpoch);

      // Offset all section notes to the correct position in the track
      for (const n of sectionNotes) {
        n.t += sectionStart;
        notes.push(n);
      }
    }

    // ──── Ostinato / Rhythmic Pattern Layer ────
    this._generateOstinatoLayer(notes, epoch, dur, beatDur, density);

    // ──── Percussion Layer ────
    this._generatePercussionLayer(notes, epoch, dur, beatDur);

    notes.sort((a, b) => a.t - b.t);
    return notes;
  }

  /**
   * Generate slow-moving pad/drone notes.
   */
  _generatePadLayer(notes, epoch, dur, beatDur) {
    let t = 0;
    const padDur = beatDur * 6 + this._rand() * beatDur * 4;
    while (t < dur) {
      const noteLen = padDur + this._rand() * beatDur * 4;
      const scaleIdx = this._randInt(0, epoch.scale.length);
      const pitch = epoch.baseNote - 12 + epoch.scale[scaleIdx];
      const vel = 0.25 + this._rand() * 0.2;
      const bend = (this._rand() < this.bendAmount) ? (this._rand() - 0.5) * 0.3 : 0;

      notes.push({
        t, dur: Math.min(noteLen, dur - t),
        note: pitch, vel, ch: 1,
        inst: epoch.padInst, bend,
      });

      // Add a harmony note (3rd or 5th above) for richer pads
      if (this._rand() < 0.6) {
        const harmIdx = (scaleIdx + 2) % epoch.scale.length;
        const harmOctave = (scaleIdx + 2 >= epoch.scale.length) ? 12 : 0;
        const harmPitch = epoch.baseNote - 12 + epoch.scale[harmIdx] + harmOctave;
        notes.push({
          t: t + this._rand() * beatDur,
          dur: Math.min(noteLen * 0.8, dur - t),
          note: harmPitch, vel: vel * 0.7, ch: 1,
          inst: epoch.padInst, bend: bend * 0.5,
        });
      }

      t += noteLen * (0.6 + this._rand() * 0.4);
    }
  }

  /**
   * Generate bass line (root notes following chord progression).
   * Mirrors Python engine's bass track with octave-dropped scale tones.
   */
  _generateBassLayer(notes, epoch, dur, beatDur, density) {
    let t = 0;
    const scale = epoch.scale;
    const bassBase = epoch.baseNote - 24; // Two octaves below melody
    const bassInterval = beatDur * 2; // Bass hits every 2 beats

    while (t < dur) {
      if (this._rand() < 0.85 * density) {
        const rootIdx = this._randInt(0, scale.length);
        const pitch = bassBase + scale[rootIdx];
        const noteDur = beatDur * (1.5 + this._rand() * 2.5);
        const vel = 0.35 + this._rand() * 0.2;

        if (pitch >= 24 && pitch <= 60) {
          notes.push({
            t, dur: Math.min(noteDur, dur - t) * 0.9,
            note: pitch, vel, ch: 4,
            inst: epoch.bassInst || 'cello', bend: 0,
          });

          // Occasional octave doubling for richness
          if (this._rand() < 0.3 * density) {
            notes.push({
              t: t + beatDur * 0.5,
              dur: beatDur * 0.8,
              note: pitch + 12, vel: vel * 0.6, ch: 4,
              inst: epoch.bassInst || 'cello', bend: 0,
            });
          }
        }
      }

      t += bassInterval * (0.8 + this._rand() * 0.4);
    }
  }

  /**
   * Generate counter-melody (secondary melodic voice for texture).
   * Uses the epoch's melodyInst (different from main inst) for timbral variety.
   */
  _generateCounterMelodyLayer(notes, epoch, dur, beatDur, density) {
    if (density < 0.5) return; // Only skip for very sparse epochs

    let t = beatDur * 8; // Enter after the main melody establishes
    let prevPitch = epoch.baseNote + 7; // Start a 5th above
    const scale = epoch.scale;

    while (t < dur) {
      // Counter-melody plays less frequently than main melody
      if (this._rand() < 0.55 * density) {
        const noteDur = beatDur * (1 + this._rand() * 3);
        const interval = this._randInt(-3, 4);
        const scalePos = this._nearestScalePos(prevPitch, epoch.baseNote, scale) + interval;
        const pitch = Math.max(48, Math.min(84, this._scalePosToPitch(scalePos, epoch.baseNote, scale)));
        prevPitch = pitch;

        const vel = 0.25 + this._rand() * 0.25;
        const bend = (this._rand() < this.bendAmount * 0.3) ?
          (this._rand() - 0.5) * this.bendAmount * 0.3 : 0;

        notes.push({
          t, dur: noteDur * 0.85,
          note: pitch, vel, ch: 5,
          inst: epoch.melodyInst || epoch.inst, bend,
        });
      }

      t += beatDur * (1 + this._rand() * 3);

      // Occasional long pause for breathing room
      if (this._rand() < 0.15) {
        t += beatDur * this._randInt(4, 12);
      }
    }
  }

  /**
   * Generate the main melody line using motif-based phrases.
   * Alternates between motif fragments and free stepwise motion.
   */
  _generateMelodyLayer(notes, epoch, dur, beatDur) {
    let t = beatDur * 2; // slight delay for melody entry
    let prevPitch = epoch.baseNote;
    const scale = epoch.scale;
    const motifPool = epoch._motifPool || [[0, 2, 4, 7]];

    while (t < dur) {
      // 40% chance: play a motif fragment; 60%: free melody
      if (this._rand() < 0.4 && motifPool.length > 0) {
        const motif = this._pick(motifPool);
        const startLen = this._randInt(3, Math.min(motif.length + 1, 9));
        const stepDur = beatDur * (0.4 + this._rand() * 0.6);
        const vel = 0.4 + this._rand() * 0.3;
        const transpose = this._randInt(-2, 3) * (scale.length > 2 ? 1 : 2);

        for (let i = 0; i < startLen && t < dur; i++) {
          const interval = motif[i % motif.length] + transpose;
          const pitch = Math.max(36, Math.min(96, epoch.baseNote + interval));
          const bend = (this._rand() < this.bendAmount) ?
            (this._rand() - 0.5) * this.bendAmount : 0;
          // Humanization: timing jitter ±10-30ms
          const jitter = (this._rand() - 0.5) * 0.03;

          notes.push({
            t: t + jitter, dur: stepDur * 0.85,
            note: pitch, vel: vel * (0.85 + 0.15 * this._rand()),
            ch: 0, inst: epoch.inst, bend,
          });
          prevPitch = pitch;
          t += stepDur;
        }
        // Breathing space after motif
        t += beatDur * (1 + this._rand() * 2);
      } else {
        // Free stepwise melody (original approach)
        const durations = [beatDur * 0.5, beatDur, beatDur * 2, beatDur * 4];
        const weights = [0.3, 0.4, 0.2, 0.1];
        const noteDur = this._weightedPick(durations, weights);

        let interval;
        if (this._rand() < 0.7) {
          interval = this._randInt(-2, 3);
        } else {
          interval = this._randInt(-5, 6);
          if (interval === 0) interval = 3;
        }

        const prevScalePos = this._nearestScalePos(prevPitch, epoch.baseNote, scale);
        const newScalePos = prevScalePos + interval;
        const newPitch = this._scalePosToPitch(newScalePos, epoch.baseNote, scale);
        const pitch = Math.max(36, Math.min(96, newPitch));
        prevPitch = pitch;

        const vel = 0.4 + this._rand() * 0.4;
        const bend = (this._rand() < this.bendAmount) ?
          (this._rand() - 0.5) * this.bendAmount : 0;
        // Humanization jitter
        const jitter = (this._rand() - 0.5) * 0.02;

        if (this._rand() > 0.1) {
          notes.push({
            t: t + jitter, dur: noteDur * 0.9,
            note: pitch, vel, ch: 0,
            inst: epoch.inst, bend,
          });
        }

        t += noteDur;
        if (this._rand() < 0.08) {
          t += beatDur * this._randInt(1, 3);
        }
      }
    }
  }

  /**
   * Generate chord hits following harmonic progressions from data tables.
   */
  _generateChordLayer(notes, epoch, dur, beatDur) {
    if (this.chordDensity <= 0) return;

    let t = 0;
    const scale = epoch.scale;
    const progression = epoch._progression || [0, 5, 7];
    const chordInterval = beatDur * 4 / Math.max(0.1, this.chordDensity);
    let progIdx = 0;

    while (t < dur) {
      if (this._rand() < this.chordDensity) {
        // Get root from progression (cycling through)
        const progRoot = progression[progIdx % progression.length];
        progIdx++;

        // Build chord on the progression root
        const root = epoch.baseNote + progRoot;
        const chordTones = [root];

        // Find nearest scale tones for 3rd and 5th above the root
        const rootScalePos = this._nearestScalePos(root, epoch.baseNote, scale);

        // Add third (2 scale degrees up from root)
        const thirdPitch = this._scalePosToPitch(rootScalePos + 2, epoch.baseNote, scale);
        chordTones.push(thirdPitch);

        // Add fifth (4 scale degrees up from root)
        const fifthPitch = this._scalePosToPitch(rootScalePos + 4, epoch.baseNote, scale);
        chordTones.push(fifthPitch);

        // Optional seventh for dense chords
        if (this.chordDensity > 0.7 && this._rand() < 0.5) {
          const sevPitch = this._scalePosToPitch(rootScalePos + 6, epoch.baseNote, scale);
          chordTones.push(sevPitch);
        }

        const chordDur = beatDur * (2 + this._rand() * 4);
        const vel = 0.2 + this._rand() * 0.25;
        // Humanization jitter for chord onset
        const jitter = (this._rand() - 0.5) * 0.015;

        for (const pitch of chordTones) {
          if (pitch >= 36 && pitch <= 96) {
            notes.push({
              t: t + jitter, dur: chordDur * 0.9,
              note: pitch, vel, ch: 2,
              inst: epoch.padInst, bend: 0,
            });
          }
        }
      }

      t += chordInterval * (0.8 + this._rand() * 0.4);
    }
  }

  /**
   * Generate arpeggio runs at configurable amount.
   */
  _generateArpeggioLayer(notes, epoch, dur, beatDur) {
    if (this.arpeggioAmount <= 0) return;

    let t = beatDur * 4;
    const scale = epoch.scale;

    while (t < dur) {
      if (this._rand() < this.arpeggioAmount) {
        // Generate an arpeggio run
        const runLength = this._randInt(4, 12);
        const startIdx = this._randInt(0, scale.length);
        const stepDur = beatDur * (0.15 + this._rand() * 0.2);
        const ascending = this._rand() < 0.6;
        const vel = 0.3 + this._rand() * 0.3;

        for (let i = 0; i < runLength; i++) {
          const scalePos = ascending
            ? startIdx + i
            : startIdx + runLength - 1 - i;
          const pitch = this._scalePosToPitch(scalePos, epoch.baseNote, scale);
          const bend = (this._rand() < this.bendAmount * 0.5) ?
            (this._rand() - 0.5) * this.bendAmount * 0.5 : 0;

          if (pitch >= 36 && pitch <= 96) {
            notes.push({
              t: t + i * stepDur,
              dur: stepDur * 0.8,
              note: pitch,
              vel: vel * (0.8 + 0.2 * (i / runLength)),
              ch: 3,
              inst: epoch.inst,
              bend,
            });
          }
        }

        t += runLength * stepDur + beatDur * 2;
      }

      t += beatDur * (2 + this._rand() * 6) / Math.max(0.1, this.arpeggioAmount);
    }
  }

  /**
   * Generate percussion using structured rhythm patterns from data tables.
   * Uses the epoch's rhythm pattern to place kick/snare/hihat hits.
   */
  _generatePercussionLayer(notes, epoch, dur, beatDur) {
    if (epoch.percChance <= 0) return;

    const rhythmPattern = epoch._rhythmPattern || [0.0, 0.25, 0.5, 0.75];
    const cycleDur = beatDur * 4; // One rhythm cycle = 4 beats
    let t = 0;

    // Build a kick/snare/hat assignment for each onset in the pattern
    const percAssign = rhythmPattern.map((onset, i) => ({
      onset,
      kick: (i === 0) || (i === Math.floor(rhythmPattern.length / 2) && this._rand() < 0.7),
      snare: (i === Math.floor(rhythmPattern.length / 2)) ||
             (i === Math.floor(rhythmPattern.length * 0.75) && this._rand() < 0.4),
      hihat: this._rand() < 0.65,
    }));

    while (t < dur) {
      for (const p of percAssign) {
        const hitTime = t + p.onset * cycleDur;
        if (hitTime >= dur) break;
        if (this._rand() > epoch.percChance) continue;

        // Humanization jitter ±10ms
        const jitter = (this._rand() - 0.5) * 0.02;

        if (p.kick) {
          notes.push({
            t: hitTime + jitter, dur: 0.15, note: 36,
            vel: 0.5 + this._rand() * 0.3,
            ch: 9, inst: 'percussion', bend: 0,
          });
        }
        if (p.snare) {
          notes.push({
            t: hitTime + jitter, dur: 0.1, note: 38,
            vel: 0.4 + this._rand() * 0.3,
            ch: 9, inst: 'percussion', bend: 0,
          });
        }
        if (p.hihat) {
          notes.push({
            t: hitTime + jitter, dur: 0.05, note: 42,
            vel: 0.2 + this._rand() * 0.2,
            ch: 9, inst: 'percussion', bend: 0,
          });
        }
      }

      t += cycleDur;
    }
  }

  /**
   * Generate ambient fill/texture notes for sonic richness.
   * Uses the epoch's fillInst for timbral variety from other layers.
   */
  _generateFillLayer(notes, epoch, dur, beatDur, density) {
    const fillInst = epoch.fillInst || epoch.padInst;
    let t = beatDur * 4;
    const scale = epoch.scale;

    while (t < dur) {
      if (this._rand() < 0.5 * density) {
        // Tremolo-style repeated soft notes
        const pitch = epoch.baseNote + this._pick(scale);
        const vel = 0.15 + this._rand() * 0.15;
        const repeats = this._randInt(3, 8);
        const gap = beatDur * (0.2 + this._rand() * 0.3);

        for (let i = 0; i < repeats && t + i * gap < dur; i++) {
          notes.push({
            t: t + i * gap, dur: gap * 0.6,
            note: pitch + (i % 2 === 0 ? 0 : 12), // alternate octaves
            vel: vel * (0.6 + 0.4 * Math.sin(i / repeats * Math.PI)),
            ch: 6, inst: fillInst, bend: 0,
          });
        }

        t += repeats * gap + beatDur * 2;
      }

      t += beatDur * (2 + this._rand() * 6);
    }
  }

  /**
   * Generate a rhythmic ostinato pattern — a repeated melodic cell
   * that provides forward momentum and rhythmic interest.
   */
  _generateOstinatoLayer(notes, epoch, dur, beatDur, density) {
    if (density < 0.7) return;

    let t = beatDur * 16; // enter after other layers establish
    const scale = epoch.scale;

    while (t < dur) {
      if (this._rand() < 0.4 * density) {
        // Create a short melodic cell (3-5 notes) and repeat it
        const cellLen = this._randInt(3, 6);
        const cellNotes = [];
        const startIdx = this._randInt(0, scale.length);
        for (let i = 0; i < cellLen; i++) {
          cellNotes.push(epoch.baseNote + scale[(startIdx + i) % scale.length]);
        }

        const repeats = this._randInt(4, 12);
        const stepDur = beatDur * (0.3 + this._rand() * 0.4);
        const vel = 0.2 + this._rand() * 0.2;

        for (let rep = 0; rep < repeats; rep++) {
          for (let i = 0; i < cellLen; i++) {
            const noteT = t + (rep * cellLen + i) * stepDur;
            if (noteT >= dur) break;
            notes.push({
              t: noteT, dur: stepDur * 0.7,
              note: cellNotes[i], vel: vel * (0.7 + 0.3 * this._rand()),
              ch: 7, inst: epoch.melodyInst, bend: 0,
            });
          }
        }

        t += repeats * cellLen * stepDur + beatDur * 8;
      }

      t += beatDur * (6 + this._rand() * 12);
    }
  }

  // ──── Scale Helpers ────

  _nearestScalePos(pitch, baseNote, scale) {
    const rel = pitch - baseNote;
    const octave = Math.floor(rel / 12);
    const pc = ((rel % 12) + 12) % 12;
    let bestIdx = 0;
    let bestDist = 12;
    for (let i = 0; i < scale.length; i++) {
      const d = Math.abs(scale[i] - pc);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return octave * scale.length + bestIdx;
  }

  _scalePosToPitch(scalePos, baseNote, scale) {
    const len = scale.length;
    const octave = Math.floor(scalePos / len);
    const idx = ((scalePos % len) + len) % len;
    return baseNote + octave * 12 + scale[idx];
  }

  _weightedPick(items, weights) {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this._rand() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // ──── Consonance Post-Processing ────

  /**
   * Apply consonance adjustment to notes within time windows.
   * Groups simultaneous notes and adjusts dissonant combinations.
   */
  _applyConsonance(notes, epoch) {
    if (!notes.length) return;

    // Group notes into time windows (~0.1s)
    const windowSize = 0.1;
    const sorted = [...notes].sort((a, b) => a.t - b.t);
    let windowStart = sorted[0].t;
    let windowNotes = [];

    for (const note of sorted) {
      if (note.t - windowStart > windowSize) {
        // Process this window
        if (windowNotes.length >= 3) {
          const pitches = windowNotes.map(n => n.note);
          const adjusted = ConsonanceEngine.adjust(
            pitches, epoch.scale, epoch.baseNote, 0.55
          );
          for (let i = 0; i < windowNotes.length; i++) {
            windowNotes[i].note = adjusted[i];
          }
        }
        windowStart = note.t;
        windowNotes = [];
      }
      windowNotes.push(note);
    }

    // Process last window
    if (windowNotes.length >= 3) {
      const pitches = windowNotes.map(n => n.note);
      const adjusted = ConsonanceEngine.adjust(
        pitches, epoch.scale, epoch.baseNote, 0.55
      );
      for (let i = 0; i < windowNotes.length; i++) {
        windowNotes[i].note = adjusted[i];
      }
    }
  }

  // ──── Playback Controls ────

  /**
   * Start or resume playback of the current track.
   */
  play() {
    if (this.isPlaying) return;
    if (this._tracks.length === 0) this.generate();
    if (!this._tracks[this.currentTrack]?.length) return;

    if (this._synth) {
      this._synth.init();
      // Stop any lingering scheduled notes before resuming
      this._synth.stopAll();
      this._synth.resume();
    }

    this.isPlaying = true;
    const ctx = this._synth?.ctx;
    if (ctx) {
      this._startCtxTime = ctx.currentTime - (this._currentTime / this.speed);
    }

    this._scheduleLoop();
    this._startEmitLoop();
  }

  /** Pause playback. */
  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this._currentTime = this.getCurrentTime();
    if (this._synth) this._synth.stopAll();
    this._cancelLoops();
  }

  /** Stop and reset to beginning of current track. */
  stop() {
    this.isPlaying = false;
    this._currentTime = 0;
    this._nextNote = 0;
    if (this._synth) this._synth.stopAll();
    this._cancelLoops();
  }

  /**
   * Seek to a time within the current track.
   * @param {number} timeSec
   */
  seek(timeSec) {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying) {
      if (this._synth) this._synth.stopAll();
      this._cancelLoops();
      this.isPlaying = false;
    }

    const trackNotes = this._tracks[this.currentTrack] || [];
    timeSec = Math.max(0, Math.min(timeSec, this.trackDuration));
    this._currentTime = timeSec;

    // Binary search for note index
    let lo = 0, hi = trackNotes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((trackNotes[mid].t / this.speed) < timeSec) lo = mid + 1;
      else hi = mid;
    }
    this._nextNote = lo;

    if (wasPlaying) {
      this.isPlaying = true;
      const ctx = this._synth?.ctx;
      if (ctx) {
        this._startCtxTime = ctx.currentTime - (this._currentTime / this.speed);
      }
      this._scheduleLoop();
      this._startEmitLoop();
    }
  }

  /**
   * Switch to the next track in the cycle.
   * @returns {boolean} True if a next track exists.
   */
  nextTrack() {
    this.stop();
    if (this.currentTrack < this.trackCount - 1) {
      this.currentTrack++;
    } else {
      // Regenerate a new cycle with a new seed
      this.generate();
      this.currentTrack = 0;
    }
    this._nextNote = 0;
    return true;
  }

  /**
   * Switch to the previous track in the cycle.
   * @returns {boolean} True if a previous track exists.
   */
  prevTrack() {
    this.stop();
    if (this.currentTrack > 0) {
      this.currentTrack--;
    } else {
      this._currentTime = 0;
    }
    this._nextNote = 0;
    return true;
  }

  /** @returns {number} Current playback time in seconds. */
  getCurrentTime() {
    if (!this.isPlaying || !this._synth?.ctx) return this._currentTime;
    return (this._synth.ctx.currentTime - this._startCtxTime) * this.speed;
  }

  /** @returns {number} Duration of the current track (accounting for speed). */
  getDuration() {
    return this.trackDuration / this.speed;
  }

  /** @returns {string} Name of the current track/epoch. */
  getCurrentTrackName() {
    return this._trackNames[this.currentTrack] || 'Unknown Epoch';
  }

  /**
   * Set playback speed.
   * @param {number} spd - Speed multiplier (0.25-4.0).
   */
  setSpeed(spd) {
    const currentPos = this.getCurrentTime();
    // Minimum 0.8x to avoid sparse/silent playback at low tempos
    this.speed = Math.max(0.8, Math.min(4.0, spd));
    if (this.isPlaying) {
      this._currentTime = currentPos;
      const ctx = this._synth?.ctx;
      if (ctx) {
        this._startCtxTime = ctx.currentTime - (this._currentTime / this.speed);
      }
    }
  }

  // ──── Scheduling ────

  _scheduleLoop() {
    if (!this.isPlaying) return;

    const trackNotes = this._tracks[this.currentTrack] || [];
    const now = this.getCurrentTime();
    const lookAhead = 0.15;

    while (this._nextNote < trackNotes.length) {
      const note = trackNotes[this._nextNote];
      const noteTime = note.t / this.speed;

      if (noteTime > now + lookAhead) break;

      if (noteTime >= now - 0.05 && this._synth) {
        this._synth.playNote(note, Math.max(0, noteTime - now));
      }
      this._nextNote++;
    }

    // Check if track ended
    if (this._nextNote >= trackNotes.length && now >= this.trackDuration / this.speed) {
      this.isPlaying = false;
      this._cancelLoops();
      if (this.onTrackEnd) this.onTrackEnd();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._scheduleLoop());
  }

  _startEmitLoop() {
    if (this._emitInterval) clearInterval(this._emitInterval);
    this._emitInterval = setInterval(() => {
      if (!this.isPlaying || !this.onNoteEvent) return;

      const trackNotes = this._tracks[this.currentTrack] || [];
      const now = this.getCurrentTime();
      const activeEvents = [];

      for (const note of trackNotes) {
        const t = note.t / this.speed;
        const dur = (note.dur || 0.2) / this.speed;
        if (t > now + 0.05) break;
        if (t + dur > now && t <= now) {
          activeEvents.push({
            t, dur,
            note: note.note,
            inst: note.inst || 'piano',
            vel: note.vel || 0.5,
            ch: note.ch || 0,
            bend: note.bend || 0,
          });
        }
      }

      this.onNoteEvent(activeEvents);
    }, 50); // 20 Hz
  }

  _cancelLoops() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
    if (this._emitInterval) { clearInterval(this._emitInterval); this._emitInterval = 0; }
  }

  /** Release resources. */
  destroy() {
    this.stop();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MusicGenerator };
}
