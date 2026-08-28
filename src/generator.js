// Exercise generation.
//
// Uniformly random chords sound like nothing and teach little, so degrees are
// drawn from a weighted transition table and every excerpt ends on a cadence.
// The generator resolves all theory up front — voiced MIDI pitches, beat
// positions — so the player, answer sheet and grader never re-derive it.

import {
  degreeQuality, degreeRootMidi, chordPitches, formatRoman, keyUsesFlats,
} from './theory.js';
import { patternsForLength, placements } from './rhythm.js';

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
    settings: { keys: ['C'], mode: 'major', length: 3, pool: [0, 3, 4] },
  },
  {
    id: 2,
    name: 'Level 2',
    blurb: 'C major · adds ii and vi',
    settings: { keys: ['C'], mode: 'major', length: 4, pool: [0, 1, 3, 4, 5] },
  },
  {
    id: 3,
    name: 'Level 3',
    blurb: 'Any major key · all diatonic triads',
    settings: { keys: MAJOR_KEYS, mode: 'major', length: 4, pool: [0, 1, 2, 3, 4, 5, 6] },
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

/** Walk the transition table, staying inside the pool and avoiding repeats. */
function walk(rng, pool, steps, start = 0) {
  const path = [pool.includes(start) ? start : pool[0]];
  while (path.length < steps) {
    const from = path[path.length - 1];
    const options = {};
    for (const [to, w] of Object.entries(TRANSITIONS[from] || {})) {
      const degree = Number(to);
      if (pool.includes(degree) && degree !== from) options[degree] = w;
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
export function generateDegrees(rng, { pool, length }) {
  const start = pool.includes(0) ? 0 : pool[0];
  const headLength = length - 2;
  const usable = CADENCES.filter(
    (c) => c.every((d) => pool.includes(d)) && (headLength !== 1 || c[0] !== start),
  );
  if (headLength < 1 || !usable.length) return walk(rng, pool, length, start);

  const cadence = chooseCadence(rng, usable);
  const head = walk(rng, pool, headLength, start);
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
  return {
    degree,
    quality,
    alter,
    inversion,
    roman: formatRoman(degree, quality),
    pitches: [rootMidi - 12, ...chordPitches(rootMidi, quality, inversion)],
  };
}

/**
 * Dress an answer up as a playable exercise, so the user can hear what they
 * wrote against what was played. Chords keep the beat placement of the chord
 * they were answering; anything written past the end of the excerpt is added on
 * as further beats, and a chord left blank simply stays silent.
 */
export function exerciseFromAnswer(exercise, answerChords) {
  let nextBeat = exercise.chords.reduce((max, c) => Math.max(max, c.startBeat + c.durationBeats), 0);
  const chords = answerChords.map((answer, i) => {
    const slot = exercise.chords[i];
    const placement = slot
      ? { startBeat: slot.startBeat, durationBeats: slot.durationBeats }
      : { startBeat: nextBeat++, durationBeats: 1 };
    return { ...voiceChord(exercise.key, answer), ...placement };
  });
  return { ...exercise, id: `${exercise.id}_answer`, chords, concepts: [] };
}

/**
 * Build a complete exercise. `rng` is injectable so tests are deterministic.
 */
export function generateExercise(settings = DEFAULT_SETTINGS, { rng = Math.random } = {}) {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const key = { tonic: pick(rng, config.keys), mode: config.mode };
  const degrees = generateDegrees(rng, config);

  const patterns = patternsForLength(degrees.length);
  const pattern = patterns.length ? pick(rng, patterns) : null;
  const slots = pattern
    ? placements(pattern)
    : degrees.map((_, i) => ({ startBeat: i, durationBeats: 1 }));

  const chords = degrees.map((degree, i) => ({
    ...voiceChord(key, { degree, quality: degreeQuality(key.mode, degree) }, config.octave),
    startBeat: slots[i].startBeat,
    durationBeats: slots[i].durationBeats,
  }));

  const concepts = [];
  chords.forEach((chord, i) => {
    concepts.push(`degree:${chord.roman}`);
    if (i > 0) concepts.push(`trans:${chords[i - 1].roman}>${chord.roman}`);
  });
  if (pattern) concepts.push(`rhythm:${pattern.id}`);

  return {
    id: `x_${Math.floor(rng() * 0xffffff).toString(16)}`,
    key,
    flats: keyUsesFlats(key.tonic),
    meter: config.meter,
    bpm: config.bpm,
    chords,
    melody: null,
    rhythmPatternId: pattern ? pattern.id : null,
    concepts,
  };
}
