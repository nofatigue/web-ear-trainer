// Melody generation.
//
// A melody over a progression is not a random walk through the scale: it lands
// on chord tones where the harmony changes and fills the gaps by step. That is
// what makes it singable, and singable is what makes it possible to write down.
//
// Pure: no DOM, no audio; randomness is injected.

import { SCALES, noteNameToPc, CHORD_INTERVALS } from './theory.js';

const LOW = 67;    // G4 — comfortably above the chords underneath
const HIGH = 84;   // C6
const START = 74;  // roughly the middle of that, so there is room either way
const MAX_LEAP = 7;

/** The scale pitches available to a melody, across the singable range. */
function scaleNotes(key) {
  const tonicPc = noteNameToPc(key.tonic);
  const notes = [];
  for (let midi = LOW - 12; midi <= HIGH; midi++) {
    const step = ((midi - tonicPc) % 12 + 12) % 12;
    if (SCALES[key.mode].includes(step)) notes.push(midi);
  }
  return notes;
}

/** Scale degree (0-6) of a pitch in a key, or null if it is outside the scale. */
export function degreeOf(midi, key) {
  const step = ((midi - noteNameToPc(key.tonic)) % 12 + 12) % 12;
  const index = SCALES[key.mode].indexOf(step);
  return index === -1 ? null : index;
}

function chordTones(chord) {
  return new Set(CHORD_INTERVALS[chord.quality].map((i) => (chord.pitches[1] - CHORD_INTERVALS[chord.quality][chord.inversion] + i) % 12));
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** The `count` entries closest to a target pitch. */
function nearest(items, target, count) {
  return [...items].sort((a, b) => Math.abs(a - target) - Math.abs(b - target)).slice(0, count);
}

/**
 * A melody over an exercise's chords.
 *
 * One note per beat. Where a chord starts, the note is one of its tones; in
 * between it steps or holds, so the line stays close to the harmony without
 * simply arpeggiating it.
 */
export function generateMelody(exercise, { rng = Math.random, density = 1 } = {}) {
  const key = exercise.key;
  const available = scaleNotes(key);
  const notes = [];
  let previous = null;

  for (const chord of exercise.chords) {
    const tones = chordTones(chord);
    const beats = Math.max(1, Math.round(chord.durationBeats * density));
    const perNote = chord.durationBeats / beats;

    for (let i = 0; i < beats; i++) {
      const strong = i === 0;
      const last = chord === exercise.chords[exercise.chords.length - 1] && i === beats - 1;
      const candidates = available.filter((midi) => {
        if (midi < LOW || midi > HIGH) return false;
        if (previous !== null && Math.abs(midi - previous) > MAX_LEAP) return false;
        if (previous !== null && midi === previous) return false;
        const isChordTone = tones.has(midi % 12);
        // A melody ends where it can stop: on a note of the final chord.
        if (strong || last) return isChordTone;
        // Off the chord change, prefer a step away from the last note.
        return previous === null || Math.abs(midi - previous) <= 2;
      });

      const fallback = available.filter(
        (midi) => midi >= LOW && midi <= HIGH && tones.has(midi % 12)
          && (previous === null || Math.abs(midi - previous) <= MAX_LEAP + 3),
      );
      const pool = candidates.length ? candidates : (fallback.length ? fallback : available);
      // The opening note starts near the middle of the range rather than at
      // whichever end the dice landed on.
      const choice = previous === null
        ? pick(rng, nearest(pool, START, 3))
        : pick(rng, pool);

      notes.push({
        midi: choice,
        degree: degreeOf(choice, key),
        startBeat: chord.startBeat + i * perNote,
        durationBeats: perNote,
      });
      previous = choice;
    }
  }

  return notes;
}
