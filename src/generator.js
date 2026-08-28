// Exercise generation.
//
// Uniformly random chords sound like nothing and teach little, so degrees are
// drawn from a weighted transition table and every excerpt ends on a cadence.
// The generator resolves all theory up front — voiced MIDI pitches, beat
// positions — so the player, answer sheet and grader never re-derive it.

import {
  degreeQuality, degreeRootMidi, chordPitches, formatRoman, keyUsesFlats, chordLabel,
} from './theory.js';
import { patternsForLength, askablePatterns, placements, rhythmChoices } from './rhythm.js';
import { voiceProgression } from './voicing.js';
import { generateMelody } from './melody.js';

// Weighted successors per degree in major. Functional harmony, roughly:
// tonic goes anywhere, subdominants push to the dominant, the dominant resolves.
export const TRANSITIONS = {
  0: { 3: 3, 4: 3, 5: 2, 1: 2, 2: 1 },
  1: { 4: 4, 6: 1, 0: 1 },
  2: { 5: 3, 3: 2, 0: 1 },
  3: { 4: 4, 0: 2, 1: 2, 5: 1 },
  4: { 0: 5, 5: 2, 3: 1 },
  5: { 3: 3, 1: 2, 4: 1, 2: 1 },
  6: { 0: 4, 2: 1 },
};

// Cadences, most conclusive first. The generator uses the first that fits the pool.
const CADENCES = [
  [4, 0],  // authentic: V - I
  [3, 0],  // plagal:    IV - I
  [6, 0],  // vii° - I
  [1, 4],  // half:      ii - V
  [3, 4],  // half:      IV - V
  [5, 4],  // half:      vi - V
  [0, 4],  // half:      I - V
];

export const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab'];

export const LEVELS = [
  {
    id: 1,
    name: 'Level 1',
    blurb: 'C major · I IV V',
    settings: { keys: ['C'], mode: 'major', length: 3, pool: [0, 3, 4], rhythmTier: 1 },
  },
  {
    id: 2,
    name: 'Level 2',
    blurb: 'C major · adds ii and vi',
    settings: { keys: ['C'], mode: 'major', length: 4, pool: [0, 1, 3, 4, 5], rhythmTier: 1 },
  },
  {
    id: 3,
    name: 'Level 3',
    blurb: 'Any major key · all triads, and the rhythm',
    settings: {
      keys: MAJOR_KEYS, mode: 'major', length: 4, pool: [0, 1, 2, 3, 4, 5, 6],
      rhythmTier: 2, asks: { rhythm: true },
    },
  },
  {
    id: 4,
    name: 'Level 4',
    blurb: 'Sevenths and inversions · which bass note?',
    settings: {
      keys: MAJOR_KEYS, mode: 'major', length: 4, pool: [0, 1, 2, 3, 4, 5, 6],
      rhythmTier: 2, inversions: true, sevenths: 0.5,
      asks: { rhythm: true, inversions: true, bass: true },
    },
  },
  {
    id: 5,
    name: 'Level 5',
    blurb: 'Longer, syncopated · which top voice?',
    settings: {
      keys: MAJOR_KEYS, mode: 'major', length: 5, pool: [0, 1, 2, 3, 4, 5, 6],
      rhythmTier: 3, inversions: true, sevenths: 0.6,
      asks: { rhythm: true, inversions: true, bass: true, top: true },
    },
  },
  {
    id: 6,
    name: 'Level 6',
    blurb: 'Everything, with a melody over the top',
    settings: {
      keys: MAJOR_KEYS, mode: 'major', length: [4, 6], pool: [0, 1, 2, 3, 4, 5, 6],
      rhythmTier: 3, inversions: true, sevenths: 0.5, melody: true,
      asks: { rhythm: true, inversions: true, bass: true, top: true, melody: true },
    },
  },
];

export const DEFAULT_SETTINGS = {
  keys: ['C'],
  mode: 'major',
  length: 4,
  pool: [0, 1, 3, 4, 5],
  bpm: 84,
  meter: { beats: 4, unit: 4 },
  octave: 3,
  rhythmTier: 1,      // how hard the rhythms may get, 1-3
  inversions: false,  // may chords be voiced in inversion
  sevenths: 0,        // chance the dominant (or ii) is played as a seventh
  melody: false,      // is a melody played over the progression
  asks: {},           // which sections the answer sheet puts to the user
};

/** Sections the answer sheet can ask about, all off unless a level says so. */
export const NO_QUESTIONS = {
  rhythm: false, inversions: false, bass: false, top: false, melody: false,
};

export function levelSettings(levelId) {
  const level = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
  return { ...DEFAULT_SETTINGS, ...level.settings };
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return Number(key);
  }
  return Number(entries[entries.length - 1][0]);
}

/**
 * Walk the transition table, staying inside the pool and avoiding repeats.
 *
 * `weights` (from the user's stats) scales each successor, so the chords being
 * missed come up more often than the ones already learned.
 */
function walk(rng, pool, steps, start = 0, weights = null) {
  const path = [pool.includes(start) ? start : pool[0]];
  while (path.length < steps) {
    const from = path[path.length - 1];
    const options = {};
    for (const [to, w] of Object.entries(TRANSITIONS[from] || {})) {
      const degree = Number(to);
      if (pool.includes(degree) && degree !== from) {
        options[degree] = w * (weights && weights[degree] !== undefined ? weights[degree] : 1);
      }
    }
    const next = pickWeighted(rng, options);
    if (next !== null) {
      path.push(next);
    } else {
      const candidates = pool.filter((d) => d !== from);
      path.push(pick(rng, candidates.length ? candidates : pool));
    }
  }
  return path;
}

function chooseCadence(rng, usable) {
  // Favour the more conclusive cadences without making every excerpt identical.
  const weights = {};
  usable.forEach((_, i) => { weights[i] = usable.length - i; });
  return usable[pickWeighted(rng, weights)];
}

/**
 * Degrees for one progression: a walk from the tonic into a cadence.
 *
 * The seam between the two needs care — a cadence whose first chord repeats the
 * walk's last chord produces "I I V I", and for a short excerpt a cadence
 * starting on the tonic would leave no room to leave home at all.
 */
export function generateDegrees(rng, { pool, length, weights = null }) {
  const start = pool.includes(0) ? 0 : pool[0];
  const headLength = length - 2;
  const usable = CADENCES.filter(
    (c) => c.every((d) => pool.includes(d)) && (headLength !== 1 || c[0] !== start),
  );
  if (headLength < 1 || !usable.length) return walk(rng, pool, length, start, weights);

  const cadence = chooseCadence(rng, usable);
  const head = walk(rng, pool, headLength, start, weights);
  const last = head.length - 1;
  if (head[last] === cadence[0]) {
    const prev = head[last - 1];
    const candidates = pool.filter((d) => d !== cadence[0] && d !== prev);
    if (candidates.length) {
      const options = {};
      for (const [to, w] of Object.entries(TRANSITIONS[prev] ?? {})) {
        if (candidates.includes(Number(to))) options[Number(to)] = w;
      }
      const next = pickWeighted(rng, options);
      head[last] = next === null ? pick(rng, candidates) : next;
    }
  }
  return head.concat(cadence);
}

/**
 * Realise one chord in a key: bass an octave under the root, triad above.
 * Shared by the generator and by playback of what the user wrote, so an answer
 * is heard in exactly the voicing the real thing would have had.
 */
export function voiceChord(key, { degree, quality, alter = 0, inversion = 0 }, octave = DEFAULT_SETTINGS.octave) {
  const rootMidi = degreeRootMidi(key, degree, octave) + alter;
  const upper = chordPitches(rootMidi, quality, inversion);
  return {
    degree,
    quality,
    alter,
    inversion,
    roman: formatRoman(degree, quality),
    label: chordLabel(degree, quality, inversion),
    pitches: [upper[0] - 12, ...upper],
  };
}

/**
 * Dress an answer up as a playable exercise, so the user can hear what they
 * wrote against what was played. Chords keep the beat placement of the chord
 * they were answering; anything written past the end of the excerpt is added on
 * as further beats, and a chord left blank simply stays silent.
 */
export function exerciseFromAnswer(exercise, answerChords, answerMelody = null) {
  let nextBeat = exercise.chords.reduce((max, c) => Math.max(max, c.startBeat + c.durationBeats), 0);

  const voiced = voiceProgression(
    answerChords.map((answer) => ({
      degree: answer.degree,
      quality: answer.quality,
      alter: answer.alter || 0,
      rootMidi: degreeRootMidi(exercise.key, answer.degree, DEFAULT_SETTINGS.octave) + (answer.alter || 0),
      // Unstated inversion means root position: that is what "V" says.
      forceInversion: answer.inversion || 0,
    })),
  );

  const chords = voiced.map((chord, i) => {
    const slot = exercise.chords[i];
    const placement = slot
      ? { startBeat: slot.startBeat, durationBeats: slot.durationBeats }
      : { startBeat: nextBeat++, durationBeats: 1 };
    return {
      degree: chord.degree,
      quality: chord.quality,
      alter: chord.alter,
      inversion: chord.inversion,
      roman: formatRoman(chord.degree, chord.quality),
      label: chordLabel(chord.degree, chord.quality, chord.inversion),
      pitches: chord.pitches,
      ...placement,
    };
  });
  // The melody as written, on the beats the real one used.
  let melody = null;
  if (exercise.melody && answerMelody && answerMelody.length) {
    melody = answerMelody.map((note, i) => {
      const slot = exercise.melody[i] || exercise.melody[exercise.melody.length - 1];
      const reference = slot ? slot.midi : 72;
      // Nearest octave to where the real melody sat, so the two are comparable.
      let midi = reference - (reference % 12) + (note.pc ?? 0);
      if (midi - reference > 6) midi -= 12;
      if (reference - midi > 6) midi += 12;
      return {
        midi,
        startBeat: slot ? slot.startBeat : 0,
        durationBeats: slot ? slot.durationBeats : 1,
      };
    });
  }

  return { ...exercise, id: `${exercise.id}_answer`, chords, melody, concepts: [] };
}

/**
 * Build a complete exercise. `rng` is injectable so tests are deterministic.
 */
export function generateExercise(settings = DEFAULT_SETTINGS, { rng = Math.random, weights = null } = {}) {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const key = { tonic: pick(rng, config.keys), mode: config.mode };
  // A level may fix the number of chords or give a range to draw from.
  const length = Array.isArray(config.length)
    ? config.length[0] + Math.floor(rng() * (config.length[1] - config.length[0] + 1))
    : config.length;
  const degrees = generateDegrees(rng, { ...config, length, weights });

  // When the rhythm is going to be asked about, only use patterns that have
  // enough plausible siblings to make a real question of it.
  const patterns = config.asks && config.asks.rhythm
    ? askablePatterns(degrees.length, config.rhythmTier)
    : patternsForLength(degrees.length, config.rhythmTier);
  const pattern = patterns.length ? pick(rng, patterns) : null;
  const slots = pattern
    ? placements(pattern)
    : degrees.map((_, i) => ({ startBeat: i, durationBeats: 1 }));

  const qualities = degrees.map((degree) => {
    const triad = degreeQuality(key.mode, degree);
    // A dominant or supertonic sometimes arrives as a seventh chord.
    if (rng() < config.sevenths) {
      if (degree === 4) return 'dom7';
      if (degree === 1 && triad === 'min') return 'min7';
    }
    return triad;
  });

  const voiced = voiceProgression(
    degrees.map((degree, i) => ({
      degree,
      quality: qualities[i],
      rootMidi: degreeRootMidi(key, degree, config.octave),
    })),
    { allowInversions: config.inversions },
  );

  const chords = voiced.map((chord, i) => ({
    degree: chord.degree,
    quality: chord.quality,
    alter: 0,
    inversion: chord.inversion,
    roman: formatRoman(chord.degree, chord.quality),
    label: chordLabel(chord.degree, chord.quality, chord.inversion),
    pitches: chord.pitches,
    startBeat: slots[i].startBeat,
    durationBeats: slots[i].durationBeats,
  }));

  const asks = { ...NO_QUESTIONS, ...config.asks };
  const melody = config.melody ? generateMelody({ key, chords }, { rng }) : null;

  const concepts = [];
  chords.forEach((chord, i) => {
    concepts.push(`degree:${chord.roman}`);
    if (i > 0) concepts.push(`trans:${chords[i - 1].roman}>${chord.roman}`);
    if (asks.inversions) concepts.push(`inv:${chord.inversion}`);
  });
  if (pattern && asks.rhythm) concepts.push(`rhythm:${pattern.id}`);

  return {
    id: `x_${Math.floor(rng() * 0xffffff).toString(16)}`,
    key,
    flats: keyUsesFlats(key.tonic),
    meter: config.meter,
    bpm: config.bpm,
    chords,
    melody,
    asks,
    rhythmPatternId: pattern ? pattern.id : null,
    rhythmChoices: pattern && asks.rhythm
      ? rhythmChoices(pattern, { rng, maxTier: config.rhythmTier }).map((p) => p.id)
      : null,
    concepts,
  };
}
