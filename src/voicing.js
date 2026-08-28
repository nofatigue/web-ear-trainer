// Voice leading.
//
// Root-position block chords are fine for a first exercise and dull after
// that: real progressions move each voice as little as they can, which is also
// what makes an inversion audible as a bass note rather than an arbitrary
// label. For each chord this scores a handful of candidate placements and
// keeps the one that moves least.
//
// Pure: no DOM, no audio, no randomness.

import { chordPitches, CHORD_INTERVALS } from './theory.js';

// Comfortable ranges, in MIDI numbers: bass around a cello, upper voices
// around where a choir would sit.
const BASS_LOW = 36;
const BASS_HIGH = 55;
const UPPER_LOW = 55;
const UPPER_HIGH = 79;
const UPPER_CENTRE = 67;

/** How far the upper voices move between two chords, note against note. */
function movement(previous, next) {
  if (!previous) return 0;
  let total = 0;
  const pairs = Math.min(previous.length, next.length);
  for (let i = 0; i < pairs; i++) total += Math.abs(next[i] - previous[i]);
  // A chord with a different number of voices always moves at least a little.
  return total + Math.abs(previous.length - next.length) * 2;
}

function rangePenalty(upper, bass) {
  let penalty = 0;
  for (const note of upper) {
    if (note < UPPER_LOW) penalty += (UPPER_LOW - note) * 2;
    if (note > UPPER_HIGH) penalty += (note - UPPER_HIGH) * 2;
  }
  if (bass < BASS_LOW) penalty += (BASS_LOW - bass) * 4;
  if (bass > BASS_HIGH) penalty += (bass - BASS_HIGH) * 4;
  // Keep the upper voices loosely centred so the line doesn't drift away over
  // a long progression — loosely, or this outweighs the voice leading itself.
  const centre = upper.reduce((a, b) => a + b, 0) / upper.length;
  return penalty + Math.abs(centre - UPPER_CENTRE) * 0.25;
}

/**
 * Every placement worth considering for one chord: each inversion, in each of
 * a few octaves.
 */
function candidates(rootMidi, quality, { allowInversions, only = null }) {
  const size = CHORD_INTERVALS[quality].length;
  const options = [];
  const inversions = only === null
    ? Array.from({ length: allowInversions ? size : 1 }, (unused, i) => i)
    : [only % size];
  for (const inversion of inversions) {
    for (let octave = -1; octave <= 2; octave++) {
      const upper = chordPitches(rootMidi + octave * 12, quality, inversion);
      // The inversion is what is heard in the bass, so the bass takes the
      // lowest sounding note rather than always the root.
      const bass = upper[0] - 12;
      options.push({ inversion, upper, bass, pitches: [bass, ...upper] });
    }
  }
  return options;
}

/**
 * What each inversion costs beyond the movement it saves, roughly in proportion
 * to how readily a musician would write it. Without this the search picks
 * whatever is nearest, and six-four chords — which are unstable and used
 * deliberately — end up everywhere, teaching the ear a prior that is wrong.
 */
const INVERSION_COST = [0, 3, 11, 9];

/**
 * Voice a progression.
 *
 * The outer chords stay in root position: an excerpt that opens on an inverted
 * tonic gives the ear nothing to stand on, and a cadence that lands on one
 * doesn't sound like an ending.
 *
 * @param chords  [{ rootMidi, quality }] in order
 * @returns the same chords with { inversion, pitches } filled in
 */
export function voiceProgression(chords, { allowInversions = true } = {}) {
  const voiced = [];
  let previous = null;
  chords.forEach((chord, i) => {
    // A chord that says how it is voiced gets voiced that way; the search then
    // only picks the octave. This is how an answer is played back: as written.
    const forced = typeof chord.forceInversion === 'number' ? chord.forceInversion : null;
    const outer = i === 0 || i === chords.length - 1;
    const options = candidates(chord.rootMidi, chord.quality, {
      allowInversions: allowInversions && !outer,
      only: forced,
    });
    let best = null;
    let bestCost = Infinity;
    for (const option of options) {
      const cost = movement(previous, option.upper)
        + rangePenalty(option.upper, option.bass)
        + (INVERSION_COST[option.inversion] || 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = option;
      }
    }
    voiced.push({ ...chord, inversion: best.inversion, pitches: best.pitches });
    previous = best.upper;
  });
  return voiced;
}
